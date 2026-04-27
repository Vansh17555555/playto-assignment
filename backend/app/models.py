import uuid
from datetime import timedelta

from django.core.serializers.json import DjangoJSONEncoder
from django.db import models
from django.utils import timezone


class Merchant(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class LedgerEntry(models.Model):
    ENTRY_CREDIT = "credit"
    ENTRY_DEBIT = "debit"
    ENTRY_CHOICES = [
        (ENTRY_CREDIT, "Credit"),
        (ENTRY_DEBIT, "Debit"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    merchant = models.ForeignKey(Merchant, on_delete=models.CASCADE, related_name="ledger_entries")
    entry_type = models.CharField(max_length=16, choices=ENTRY_CHOICES)
    amount_paise = models.BigIntegerField()
    reference_id = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class BankAccount(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    merchant = models.ForeignKey(Merchant, on_delete=models.CASCADE, related_name="bank_accounts")
    account_number = models.CharField(max_length=64)
    ifsc = models.CharField(max_length=32)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.account_number} ({self.ifsc})"


class IdempotencyKey(models.Model):
    key = models.CharField(max_length=128)
    merchant = models.ForeignKey(Merchant, on_delete=models.CASCADE, related_name="idempotency_keys")
    response_body = models.JSONField(null=True, blank=True, encoder=DjangoJSONEncoder)
    status_code = models.IntegerField(default=202)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["key", "merchant"], name="uniq_idempotency_key_per_merchant")
        ]

    def is_expired(self) -> bool:
        return self.created_at < timezone.now() - timedelta(hours=24)


class Payout(models.Model):
    STATUS_PENDING = "pending"
    STATUS_PROCESSING = "processing"
    STATUS_COMPLETED = "completed"
    STATUS_FAILED = "failed"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_PROCESSING, "Processing"),
        (STATUS_COMPLETED, "Completed"),
        (STATUS_FAILED, "Failed"),
    ]

    VALID_TRANSITIONS = {
        STATUS_PENDING: [STATUS_PROCESSING],
        STATUS_PROCESSING: [STATUS_COMPLETED, STATUS_FAILED],
        STATUS_COMPLETED: [],
        STATUS_FAILED: [],
    }

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    merchant = models.ForeignKey(Merchant, on_delete=models.CASCADE, related_name="payouts")
    bank_account = models.ForeignKey(BankAccount, on_delete=models.PROTECT, related_name="payouts")
    amount_paise = models.BigIntegerField()
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_PENDING)
    idempotency_key = models.ForeignKey(
        IdempotencyKey, on_delete=models.PROTECT, related_name="payouts", null=True, blank=True
    )
    attempts = models.IntegerField(default=0)
    last_attempted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def transition_to(self, new_status: str):
        if new_status not in self.VALID_TRANSITIONS[self.status]:
            raise ValueError(f"Invalid transition: {self.status} -> {new_status}")
        self.status = new_status
        self.save(update_fields=["status", "updated_at"])
