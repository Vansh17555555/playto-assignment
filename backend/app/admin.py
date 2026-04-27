from django.contrib import admin

from .models import BankAccount, IdempotencyKey, LedgerEntry, Merchant, Payout


admin.site.register(Merchant)
admin.site.register(LedgerEntry)
admin.site.register(BankAccount)
admin.site.register(IdempotencyKey)
admin.site.register(Payout)
