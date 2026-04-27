from django.urls import path

from .views import (
    MerchantBalanceView,
    MerchantBankAccountListView,
    MerchantLedgerView,
    MerchantListView,
    PayoutListCreateView,
    PayoutDetailView,
)

urlpatterns = [
    path("merchants/", MerchantListView.as_view(), name="merchant-list"),
    path("merchants/<uuid:merchant_id>/balance/", MerchantBalanceView.as_view(), name="merchant-balance"),
    path("merchants/<uuid:merchant_id>/ledger/", MerchantLedgerView.as_view(), name="merchant-ledger"),
    path("merchants/<uuid:merchant_id>/bank-accounts/", MerchantBankAccountListView.as_view(), name="merchant-banks"),
    path("payouts/", PayoutListCreateView.as_view(), name="payout-list-create"),
    path("payouts/<uuid:id>/", PayoutDetailView.as_view(), name="payout-detail"),
]
