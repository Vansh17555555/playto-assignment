import { useEffect, useState } from "react";

const API_BASE = "https://playto-assignment-t3yw.onrender.com/api/v1";

const paiseToInr = (value) => (value / 100).toFixed(2);
const inrToPaise = (value) => Math.round(parseFloat(value || 0) * 100);

const StatusBadge = ({ status }) => {
  let colorClass = "bg-gray-500/10 text-gray-400 border-gray-500/20";
  if (status === "completed") {
    colorClass = "bg-green-500/10 text-green-400 border-green-500/20";
  } else if (status === "failed") {
    colorClass = "bg-red-500/10 text-red-400 border-red-500/20";
  } else if (status === "processing") {
    colorClass = "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize border ${colorClass}`}>
      {status}
    </span>
  );
};

function Card({ title, value }) {
  return (
    <div className="rounded-xl border border-[#2a2d3a] border-t-2 border-t-indigo-500 bg-[#1a1d27] p-5 shadow-lg">
      <p className="text-sm font-medium text-slate-400">{title}</p>
      <p className="mt-2 text-3xl font-bold text-white font-mono tracking-tight">{value}</p>
    </div>
  );
}

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
    <div className="min-h-screen bg-[#0f1117] p-4 md:p-8 text-slate-200">
      <div className="mx-auto max-w-5xl space-y-8">
        
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20">
            <svg className="h-6 w-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Playto Payout Engine</h1>
        </div>

        {/* Merchant Selector */}
        <div className="rounded-xl border border-[#2a2d3a] bg-[#1a1d27] p-5 shadow-lg">
          <label htmlFor="merchant-select" className="mb-2 block text-sm font-medium text-slate-400">Select Merchant</label>
          <div className="relative">
            <select
              id="merchant-select"
              className="w-full appearance-none rounded-lg border border-[#2a2d3a] bg-[#0f1117] px-4 py-3 text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              value={selectedMerchant}
              onChange={(e) => setSelectedMerchant(e.target.value)}
            >
              {merchants.map((merchant) => (
                <option key={merchant.id} value={merchant.id}>
                  {merchant.name}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
          </div>
        </div>

        {/* Balance Cards */}
        {balance && (
          <div className="grid gap-5 md:grid-cols-3">
            <Card title="Available Balance" value={`₹ ${paiseToInr(balance.available_balance)}`} />
            <Card title="Held Balance" value={`₹ ${paiseToInr(balance.held_balance)}`} />
            <Card title="Total Balance" value={`₹ ${paiseToInr(balance.total_balance)}`} />
          </div>
        )}

        {/* Request Payout Form */}
        <form onSubmit={submitPayout} className="rounded-xl border border-[#2a2d3a] bg-[#1a1d27] p-6 shadow-lg">
          <h2 className="mb-5 text-lg font-semibold text-white">Request Payout</h2>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4 items-start">
            <div className="lg:col-span-1">
              <label htmlFor="payout-amount" className="mb-1.5 block text-xs font-medium text-slate-400">Amount (INR)</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500 font-mono">₹</span>
                <input
                  id="payout-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  className="w-full rounded-lg border border-[#2a2d3a] bg-[#0f1117] pl-8 pr-4 py-2.5 text-white placeholder-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                  value={amountInr}
                  onChange={(e) => setAmountInr(e.target.value)}
                  required
                />
              </div>
            </div>
            
            <div className="lg:col-span-2">
              <label htmlFor="bank-account-select" className="mb-1.5 block text-xs font-medium text-slate-400">Destination Bank Account</label>
              <div className="relative">
                <select
                  id="bank-account-select"
                  className="w-full appearance-none rounded-lg border border-[#2a2d3a] bg-[#0f1117] px-4 py-2.5 text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  value={bankAccountId}
                  onChange={(e) => setBankAccountId(e.target.value)}
                  required
                >
                  {bankAccounts.map((bank) => (
                    <option key={bank.id} value={bank.id}>
                      {bank.account_number} • {bank.ifsc}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4"></path></svg>
                </div>
              </div>
            </div>

            <div className="lg:col-span-1">
              <label htmlFor="idempotency-key" className="mb-1.5 block text-xs font-medium text-slate-500">Idempotency Key</label>
              <input
                id="idempotency-key"
                className="w-full rounded-lg border border-[#2a2d3a]/50 bg-[#0f1117]/50 px-3 py-2.5 text-xs text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono placeholder-slate-700"
                value={idempotencyKey}
                onChange={(e) => setIdempotencyKey(e.target.value)}
                required
              />
            </div>
          </div>
          
          {error && (
            <div className="mt-5 rounded-lg bg-red-500/10 p-3 text-sm text-red-400 border border-red-500/20">
              {error}
            </div>
          )}
          
          <div className="mt-6 flex justify-end">
            <button className="w-full md:w-auto rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-[#1a1d27] transition-colors">
              Submit Payout
            </button>
          </div>
        </form>

        {/* Payout History */}
        <div className="rounded-xl border border-[#2a2d3a] bg-[#1a1d27] shadow-lg overflow-hidden">
          <div className="flex items-center gap-3 border-b border-[#2a2d3a] p-5 bg-[#1a1d27]">
            <h2 className="text-lg font-semibold text-white">Payout History</h2>
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <span className="text-[10px] font-bold text-green-400 uppercase tracking-wider">Live</span>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#0f1117]/50">
                <tr className="text-slate-400 text-xs uppercase tracking-wider">
                  <th className="px-6 py-4 font-medium">Transaction ID</th>
                  <th className="px-6 py-4 font-medium">Amount</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium">Created At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2d3a]">
                {payouts.map((payout, i) => (
                  <tr key={payout.id} className={`hover:bg-[#2a2d3a]/30 transition-colors ${i % 2 === 0 ? 'bg-transparent' : 'bg-[#0f1117]/20'}`} id={`payout-row-${payout.id}`}>
                    <td className="px-6 py-4 font-mono text-slate-300">{String(payout.id || "").slice(0, 8)}</td>
                    <td className="px-6 py-4 font-mono text-white">₹{paiseToInr(payout.amount_paise)}</td>
                    <td className="px-6 py-4"><StatusBadge status={payout.status} /></td>
                    <td className="px-6 py-4 text-slate-400">{new Date(payout.created_at).toLocaleString()}</td>
                  </tr>
                ))}
                {payouts.length === 0 && (
                  <tr>
                    <td colSpan="4" className="px-6 py-10 text-center text-slate-500">
                      No payouts found for this merchant.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
