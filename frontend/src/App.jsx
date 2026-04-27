import { useEffect, useState } from "react";

const API_BASE = "http://localhost:8000/api/v1";

const paiseToInr = (value) => (value / 100).toFixed(2);
const inrToPaise = (value) => Math.round(parseFloat(value || 0) * 100);

export default function App() {
  const [merchants, setMerchants] = useState([]);
  const [selectedMerchant, setSelectedMerchant] = useState("");
  const [bankAccounts, setBankAccounts] = useState([]);
  const [bankAccountId, setBankAccountId] = useState("");
  const [balance, setBalance] = useState(null);
  const [payouts, setPayouts] = useState([]);
  const [amountInr, setAmountInr] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  });
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    fetch(`${API_BASE}/merchants/`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch merchants");
        return res.json();
      })
      .then((data) => {
        if (!mounted) return;
        setMerchants(data || []);
        if (data?.length > 0 && !selectedMerchant) {
          setSelectedMerchant(data[0].id);
        }
      })
      .catch((err) => {
        if (mounted) setError(`Error loading merchants: ${err.message}`);
      });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!selectedMerchant) return;
    let mounted = true;
    fetch(`${API_BASE}/merchants/${selectedMerchant}/bank-accounts/`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch bank accounts");
        return res.json();
      })
      .then((data) => {
        if (!mounted) return;
        setBankAccounts(data || []);
        if (data?.length > 0) {
          setBankAccountId(data[0].id);
        } else {
          setBankAccountId("");
        }
      })
      .catch((err) => {
        if (mounted) setError(`Error loading bank accounts: ${err.message}`);
      });
    return () => { mounted = false; };
  }, [selectedMerchant]);

  useEffect(() => {
    if (!selectedMerchant) return;
    let mounted = true;

    const loadData = () => {
      fetch(`${API_BASE}/merchants/${selectedMerchant}/balance/`)
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (mounted && data) setBalance(data);
        })
        .catch(() => {});

      fetch(`${API_BASE}/payouts/?merchant=${selectedMerchant}`)
        .then((res) => res.ok ? res.json() : [])
        .then((data) => {
          if (mounted) setPayouts(data);
        })
        .catch(() => {});
    };

    loadData();
    const interval = setInterval(loadData, 3000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [selectedMerchant]);

  const submitPayout = async (e) => {
    e.preventDefault();
    setError("");
    const payload = {
      amount_paise: inrToPaise(amountInr),
      bank_account_id: bankAccountId,
    };

    const res = await fetch(`${API_BASE}/payouts/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Merchant-ID": selectedMerchant,
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error || "Payout request failed");
      return;
    }
    setAmountInr("");
    setIdempotencyKey(crypto.randomUUID());
  };

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <h1 className="text-2xl font-bold text-slate-800">Playto Payout Engine</h1>

        <div className="rounded-lg bg-white p-4 shadow">
          <label className="mb-2 block text-sm font-medium text-slate-600">Merchant</label>
          <select
            id="merchant-select"
            className="w-full rounded border p-2"
            value={selectedMerchant}
            onChange={(e) => setSelectedMerchant(e.target.value)}
          >
            {merchants.map((merchant) => (
              <option key={merchant.id} value={merchant.id}>
                {merchant.name}
              </option>
            ))}
          </select>
        </div>

        {balance && (
          <div className="grid gap-4 md:grid-cols-3">
            <Card title="Available Balance" value={`INR ${paiseToInr(balance.available_balance)}`} />
            <Card title="Held Balance" value={`INR ${paiseToInr(balance.held_balance)}`} />
            <Card title="Total Balance" value={`INR ${paiseToInr(balance.total_balance)}`} />
          </div>
        )}

        <form onSubmit={submitPayout} className="space-y-4 rounded-lg bg-white p-4 shadow">
          <h2 className="text-lg font-semibold text-slate-800">Request Payout</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <input
              id="payout-amount"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="Amount INR"
              className="rounded border p-2"
              value={amountInr}
              onChange={(e) => setAmountInr(e.target.value)}
              required
            />
            <select
              id="bank-account-select"
              className="rounded border p-2"
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
              required
            >
              {bankAccounts.map((bank) => (
                <option key={bank.id} value={bank.id}>
                  {bank.account_number} - {bank.ifsc}
                </option>
              ))}
            </select>
            <input
              id="idempotency-key"
              className="rounded border p-2"
              value={idempotencyKey}
              onChange={(e) => setIdempotencyKey(e.target.value)}
              required
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button className="rounded bg-slate-800 px-4 py-2 text-white">Submit Payout</button>
        </form>

        <div className="rounded-lg bg-white p-4 shadow">
          <h2 className="mb-3 text-lg font-semibold text-slate-800">Payout History</h2>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-slate-600">
                <th className="py-2">ID</th>
                <th className="py-2">Amount</th>
                <th className="py-2">Status</th>
                <th className="py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((payout) => (
                <tr key={payout.id} className="border-b" id={`payout-row-${payout.id}`}>
                  <td className="py-2 font-mono">{String(payout.id || "").slice(0, 8)}</td>
                  <td className="py-2">INR {paiseToInr(payout.amount_paise)}</td>
                  <td className="py-2">{payout.status}</td>
                  <td className="py-2">{new Date(payout.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Card({ title, value }) {
  return (
    <div className="rounded-lg bg-white p-4 shadow">
      <p className="text-sm text-slate-500">{title}</p>
      <p className="text-xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}
