from django.core.management.base import BaseCommand

from app.models import BankAccount, LedgerEntry, Merchant


class Command(BaseCommand):
    help = "Seed merchants, bank accounts, and credit history"

    def handle(self, *args, **options):
        seeds = [
            ("Merchant One", 500000),
            ("Merchant Two", 1000000),
            ("Merchant Three", 250000),
        ]
        for idx, (name, total_credit) in enumerate(seeds, start=1):
            merchant, _ = Merchant.objects.get_or_create(name=name)
            BankAccount.objects.get_or_create(
                merchant=merchant,
                account_number=f"00011122233{idx}",
                ifsc=f"PLAY0000{idx}",
                defaults={"is_active": True},
            )
            reference = f"seed:{merchant.id}"
            if not LedgerEntry.objects.filter(reference_id=reference, merchant=merchant).exists():
                LedgerEntry.objects.create(
                    merchant=merchant,
                    entry_type=LedgerEntry.ENTRY_CREDIT,
                    amount_paise=total_credit,
                    reference_id=reference,
                )
        self.stdout.write(self.style.SUCCESS("Seed completed"))
