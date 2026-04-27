# EXPLAINER

## 1) The Ledger

Balance query:

```python
result = LedgerEntry.objects.filter(merchant_id=merchant_id).aggregate(
    credits=Sum("amount_paise", filter=Q(entry_type=LedgerEntry.ENTRY_CREDIT)),
    debits=Sum("amount_paise", filter=Q(entry_type=LedgerEntry.ENTRY_DEBIT)),
)
credits = result["credits"] or 0
debits = result["debits"] or 0
return credits - debits
```

Credits and debits are modeled as immutable `LedgerEntry` rows so money movement is audit-friendly and replayable. We never store balance as a mutable column, which avoids drift bugs.

## 2) The Lock

```python
with transaction.atomic():
    merchant = Merchant.objects.select_for_update().get(id=merchant.id)
    list(LedgerEntry.objects.select_for_update().filter(merchant=merchant))
    ...
```

The `list()` call is critical because Django querysets are lazy and won't execute until evaluated. Without evaluation, `select_for_update()` never hits the database and the lock is a no-op.

The merchant row lock itself acts as a mutex: every payout request for that merchant serializes on the same row, so two concurrent requests cannot both pass the balance check.

## 3) The Idempotency

`IdempotencyKey` has a unique constraint on `(merchant, key)` and stores `response_body` + `status_code`. On duplicate request with same merchant/key within 24h, the API returns the cached response.

If a second request arrives while the first is in flight, the first transaction holds the merchant lock; second request waits, then reads the stored response and returns identical output without creating a second payout.

## 4) The State Machine

State transitions are enforced in `Payout.transition_to`:

```python
VALID_TRANSITIONS = {
    "pending": ["processing"],
    "processing": ["completed", "failed"],
    "completed": [],
    "failed": [],
}
```

Any illegal transition raises:

```python
raise ValueError(f"Invalid transition: {self.status} -> {new_status}")
```

So `failed -> completed` is explicitly blocked.

## 5) The AI Audit

An early AI-generated version looked like this:

```python
with transaction.atomic():
    merchant = Merchant.objects.select_for_update().get(id=merchant.id)
    LedgerEntry.objects.select_for_update().filter(merchant=merchant)
    # create payout + debit
```

This looked correct but was subtly wrong: the queryset was never evaluated, so `SELECT FOR UPDATE` on `LedgerEntry` never executed and no ledger rows were locked.

I replaced it with:

```python
with transaction.atomic():
    merchant = Merchant.objects.select_for_update().get(id=merchant.id)
    list(LedgerEntry.objects.select_for_update().filter(merchant=merchant))
    total_balance = get_balance(merchant.id)
    held_balance = get_held_balance(merchant.id)
    available = total_balance - held_balance
    ...
```

and also added a refund dedup guard:

```python
refund_ref = f"refund:{payout.id}"
if not LedgerEntry.objects.filter(reference_id=refund_ref).exists():
    LedgerEntry.objects.create(...)
```

to prevent duplicate refund credits when retries race or tasks are re-delivered.
