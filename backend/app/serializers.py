from django.db.models import Q, Sum
from rest_framework import serializers

from .models import BankAccount, LedgerEntry, Merchant, Payout


def get_balance(merchant_id):
    result = LedgerEntry.objects.filter(merchant_id=merchant_id).aggregate(
        credits=Sum("amount_paise", filter=Q(entry_type=LedgerEntry.ENTRY_CREDIT)),
        debits=Sum("amount_paise", filter=Q(entry_type=LedgerEntry.ENTRY_DEBIT)),
    )
    credits = result["credits"] or 0
    debits = result["debits"] or 0
    return credits - debits


def get_held_balance(merchant_id):
    held = Payout.objects.filter(
        merchant_id=merchant_id,
        status__in=[Payout.STATUS_PENDING, Payout.STATUS_PROCESSING],
    ).aggregate(total=Sum("amount_paise"))["total"]
    return held or 0


class MerchantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Merchant
        fields = ["id", "name", "created_at"]


class LedgerEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = LedgerEntry
        fields = ["id", "entry_type", "amount_paise", "reference_id", "created_at"]


class BankAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = BankAccount
        fields = ["id", "account_number", "ifsc", "is_active"]


class PayoutSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payout
        fields = [
            "id",
            "merchant",
            "bank_account",
            "amount_paise",
            "status",
            "attempts",
            "last_attempted_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["status", "attempts", "last_attempted_at", "created_at", "updated_at"]


class PayoutCreateSerializer(serializers.Serializer):
    amount_paise = serializers.IntegerField(min_value=1)
    bank_account_id = serializers.UUIDField()
