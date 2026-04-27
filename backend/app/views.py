from datetime import timedelta

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import BankAccount, IdempotencyKey, LedgerEntry, Merchant, Payout
from .serializers import (
    BankAccountSerializer,
    LedgerEntrySerializer,
    MerchantSerializer,
    PayoutCreateSerializer,
    PayoutSerializer,
    get_balance,
    get_held_balance,
)
from .tasks import process_payout


class MerchantListView(generics.ListAPIView):
    queryset = Merchant.objects.all().order_by("created_at")
    serializer_class = MerchantSerializer


class MerchantBalanceView(APIView):
    def get(self, request, merchant_id):
        merchant = get_object_or_404(Merchant, id=merchant_id)
        total_balance = get_balance(merchant.id)
        held_balance = get_held_balance(merchant.id)
        available_balance = total_balance - held_balance
        return Response(
            {
                "merchant_id": str(merchant.id),
                "available_balance": available_balance,
                "held_balance": held_balance,
                "total_balance": total_balance,
            }
        )


class MerchantLedgerView(generics.ListAPIView):
    serializer_class = LedgerEntrySerializer

    def get_queryset(self):
        merchant_id = self.kwargs["merchant_id"]
        return LedgerEntry.objects.filter(merchant_id=merchant_id).order_by("-created_at")


class MerchantBankAccountListView(generics.ListAPIView):
    serializer_class = BankAccountSerializer

    def get_queryset(self):
        merchant_id = self.kwargs["merchant_id"]
        return BankAccount.objects.filter(merchant_id=merchant_id, is_active=True).order_by("account_number")


class PayoutListCreateView(APIView):
    def get(self, request):
        merchant = request.query_params.get("merchant")
        queryset = Payout.objects.all().order_by("-created_at")
        if merchant:
            queryset = queryset.filter(merchant_id=merchant)
        return Response(PayoutSerializer(queryset, many=True).data)

    def post(self, request):
        merchant_id = request.headers.get("X-Merchant-ID")
        idempotency_key = request.headers.get("Idempotency-Key")
        if not merchant_id:
            return Response({"error": "X-Merchant-ID header is required"}, status=status.HTTP_400_BAD_REQUEST)
        if not idempotency_key:
            return Response({"error": "Idempotency-Key header is required"}, status=status.HTTP_400_BAD_REQUEST)

        merchant = get_object_or_404(Merchant, id=merchant_id)
        serializer = PayoutCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        key_cutoff = timezone.now() - timedelta(hours=24)
        cached = IdempotencyKey.objects.filter(
            merchant=merchant, key=idempotency_key, created_at__gte=key_cutoff, response_body__isnull=False
        ).first()
        if cached:
            return Response(cached.response_body, status=cached.status_code)

        amount_paise = serializer.validated_data["amount_paise"]
        bank_account_id = serializer.validated_data["bank_account_id"]

        with transaction.atomic():
            merchant = Merchant.objects.select_for_update().get(id=merchant.id)
            # Force evaluation so SELECT FOR UPDATE executes immediately.
            list(LedgerEntry.objects.select_for_update().filter(merchant=merchant).values_list("id", flat=True))

            idem, created = IdempotencyKey.objects.select_for_update().get_or_create(
                merchant=merchant,
                key=idempotency_key,
                defaults={"response_body": None, "status_code": status.HTTP_202_ACCEPTED},
            )
            if not created and not idem.is_expired() and idem.response_body is not None:
                return Response(idem.response_body, status=idem.status_code)
            if not created and idem.is_expired():
                idem.delete()
                idem = IdempotencyKey.objects.create(
                    merchant=merchant,
                    key=idempotency_key,
                    response_body=None,
                    status_code=status.HTTP_202_ACCEPTED,
                )

            bank_account = BankAccount.objects.filter(id=bank_account_id, merchant=merchant, is_active=True).first()
            if not bank_account:
                body = {"error": "Invalid bank account"}
                idem.response_body = body
                idem.status_code = status.HTTP_400_BAD_REQUEST
                idem.save(update_fields=["response_body", "status_code"])
                return Response(body, status=status.HTTP_400_BAD_REQUEST)

            total_balance = get_balance(merchant.id)
            held_balance = get_held_balance(merchant.id)
            available_balance = total_balance - held_balance

            if amount_paise > available_balance:
                body = {"error": "Insufficient available balance"}
                idem.response_body = body
                idem.status_code = status.HTTP_400_BAD_REQUEST
                idem.save(update_fields=["response_body", "status_code"])
                return Response(body, status=status.HTTP_400_BAD_REQUEST)

            payout = Payout.objects.create(
                merchant=merchant,
                bank_account=bank_account,
                amount_paise=amount_paise,
                status=Payout.STATUS_PENDING,
                idempotency_key=idem,
            )
            LedgerEntry.objects.create(
                merchant=merchant,
                entry_type=LedgerEntry.ENTRY_DEBIT,
                amount_paise=amount_paise,
                reference_id=f"payout:{payout.id}",
            )
            response_body = PayoutSerializer(payout).data
            idem.response_body = response_body
            idem.status_code = status.HTTP_201_CREATED
            idem.save(update_fields=["response_body", "status_code"])

        process_payout.delay(str(payout.id))
        return Response(response_body, status=status.HTTP_201_CREATED)


class PayoutDetailView(generics.RetrieveAPIView):
    serializer_class = PayoutSerializer
    queryset = Payout.objects.all()
    lookup_field = "id"


