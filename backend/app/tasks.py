import random
from datetime import timedelta

from celery import shared_task
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from .models import LedgerEntry, Payout


@shared_task
def process_payout(payout_id):
    with transaction.atomic():
        payout = Payout.objects.select_for_update().select_related("merchant").filter(id=payout_id).first()
        if not payout:
            return

        if payout.status == Payout.STATUS_PENDING:
            payout.transition_to(Payout.STATUS_PROCESSING)
        elif payout.status != Payout.STATUS_PROCESSING:
            return

        payout.attempts = F("attempts") + 1
        payout.last_attempted_at = timezone.now()
        payout.save(update_fields=["attempts", "last_attempted_at", "updated_at"])

    payout.refresh_from_db()
    outcome = random.random()

    if outcome < 0.7:
        with transaction.atomic():
            payout = Payout.objects.select_for_update().get(id=payout_id)
            if payout.status == Payout.STATUS_PROCESSING:
                payout.transition_to(Payout.STATUS_COMPLETED)
        return

    if outcome < 0.9:
        fail_and_refund(payout_id)
        return

    # Hang in processing: leave state unchanged. Beat task handles retries.


def fail_and_refund(payout_id):
    with transaction.atomic():
        payout = Payout.objects.select_for_update().select_related("merchant").get(id=payout_id)
        if payout.status != Payout.STATUS_PROCESSING:
            return
        payout.transition_to(Payout.STATUS_FAILED)
        refund_ref = f"refund:{payout.id}"
        refund_exists = LedgerEntry.objects.filter(reference_id=refund_ref).exists()
        if not refund_exists:
            LedgerEntry.objects.create(
                merchant=payout.merchant,
                entry_type=LedgerEntry.ENTRY_CREDIT,
                amount_paise=payout.amount_paise,
                reference_id=refund_ref,
            )


@shared_task
def retry_stuck_payouts():
    cutoff = timezone.now() - timedelta(seconds=30)
    stuck = Payout.objects.filter(
        status=Payout.STATUS_PROCESSING,
        last_attempted_at__lt=cutoff,
    ).only("id", "attempts")
    for payout in stuck:
        if payout.attempts >= 3:
            fail_and_refund(payout.id)
            continue
        delay_seconds = 2 ** payout.attempts
        process_payout.apply_async(args=[str(payout.id)], countdown=delay_seconds)
