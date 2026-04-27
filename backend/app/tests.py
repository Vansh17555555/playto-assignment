import threading
import uuid

from django.test import TransactionTestCase
from rest_framework.test import APIClient

from .models import BankAccount, LedgerEntry, Merchant, Payout


class PayoutEngineTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        self.merchant = Merchant.objects.create(name="Test Merchant")
        self.bank = BankAccount.objects.create(
            merchant=self.merchant,
            account_number="1234567890",
            ifsc="PLAY00001",
            is_active=True,
        )
        LedgerEntry.objects.create(
            merchant=self.merchant,
            entry_type=LedgerEntry.ENTRY_CREDIT,
            amount_paise=100000,
            reference_id="seed:test",
        )
        self.url = "/api/v1/payouts/"

    def _post_payout(self, idem_key, results, idx):
        client = APIClient()
        response = client.post(
            self.url,
            data={"amount_paise": 60000, "bank_account_id": str(self.bank.id)},
            format="json",
            HTTP_X_MERCHANT_ID=str(self.merchant.id),
            HTTP_IDEMPOTENCY_KEY=idem_key,
        )
        results[idx] = response.status_code

    def test_concurrency_allows_only_one_oversubscribed_payout(self):
        results = [None, None]
        threads = [
            threading.Thread(target=self._post_payout, args=(str(uuid.uuid4()), results, 0)),
            threading.Thread(target=self._post_payout, args=(str(uuid.uuid4()), results, 1)),
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        self.assertEqual(sorted(results), [201, 400])
        self.assertEqual(Payout.objects.count(), 1)

    def test_idempotency_returns_same_response_and_single_payout(self):
        idem_key = str(uuid.uuid4())
        client = APIClient()

        first = client.post(
            self.url,
            data={"amount_paise": 10000, "bank_account_id": str(self.bank.id)},
            format="json",
            HTTP_X_MERCHANT_ID=str(self.merchant.id),
            HTTP_IDEMPOTENCY_KEY=idem_key,
        )
        second = client.post(
            self.url,
            data={"amount_paise": 10000, "bank_account_id": str(self.bank.id)},
            format="json",
            HTTP_X_MERCHANT_ID=str(self.merchant.id),
            HTTP_IDEMPOTENCY_KEY=idem_key,
        )

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertEqual(first.json(), second.json())
        self.assertEqual(Payout.objects.count(), 1)
