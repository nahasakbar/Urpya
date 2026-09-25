import { useState, useEffect, useRef } from "react";
import { Home, Landmark, Users, Plus, ChevronRight, ChevronLeft, X, Trash2, Pencil, Check } from "lucide-react";
import { supabase, LEDGER_ROW_ID } from "./supabaseClient.js";

function uid(prefix) {
  return prefix + "-" + Math.random().toString(36).slice(2, 9);
}

function fmt(n) {
  const v = Math.round(Number(n) || 0);
  return "₹" + v.toLocaleString("en-IN");
}

function defaultData() {
  return {
    people: ["Uppa", "Nahas", "Riyas"],
    lenders: [
      { id: "pnb-housing", name: "PNB Housing Loan", totalAmount: 1500000, annualRate: 0 },
      { id: "pnb-od", name: "PNB OD", totalAmount: 0, annualRate: 0 },
      { id: "sathyn", name: "Sathyn", totalAmount: 0, annualRate: 0 },
      { id: "mynaakam", name: "Mynaakam", totalAmount: 0, annualRate: 0 },
      { id: "kochumaash", name: "Kochumaash", totalAmount: 0, annualRate: 0 },
    ],
    payments: {
      "pnb-housing": [{ amounts: { Uppa: 0, Nahas: 10000, Riyas: 5000 } }],
    },
  };
}

function computeSchedule(lender, entries) {
  const rate = (Number(lender.annualRate) || 0) / 12;
  let balance = Number(lender.totalAmount) || 0;
  const rows = [];
  for (let i = 0; i < entries.length; i++) {
    const interest = balance * rate;
    const amounts = entries[i].amounts || {};
    const totalPaid = Object.values(amounts).reduce((s, v) => s + (Number(v) || 0), 0);
    const opening = balance;
    balance = Math.max(opening + interest - totalPaid, 0);
    rows.push({ index: i, opening, interest, totalPaid, remaining: balance, amounts });
  }
  return { rows, finalBalance: balance, nextInterest: balance * rate };
}

const styles = `
  .fl-shell {
    --ink: #1B2A4A;
    --paper: #E8E1CC;
    --paper-card: #FBF8F0;
    --maroon: #7A2E2E;
    --forest: #2F5D45;
    --gold: #A97C34;
    --muted: #6B6455;
    --line: #C9BFA3;
    max-width: 480px;
    margin: 0 auto;
    min-height: 100vh;
    background: var(--paper);
    color: var(--ink);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    display: flex;
    flex-direction: column;
    position: relative;
  }
  .fl-shell * { box-sizing: border-box; }
  .fl-serif { font-family: Georgia, "Times New Roman", serif; }
  .fl-mono { font-family: ui-monospace, Menlo, Consolas, "Courier New", monospace; }

  .fl-topbar {
    padding: 20px 20px 14px;
    border-bottom: 2px solid var(--ink);
    background: var(--paper-card);
  }
  .fl-title {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 0.2px;
    margin: 0;
  }
  .fl-subtitle {
    margin: 4px 0 0;
    font-size: 13px;
    color: var(--muted);
  }
  .fl-back-row {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    color: var(--ink);
    font-size: 14px;
    margin-bottom: 8px;
    background: none;
    border: none;
    padding: 4px 0;
  }

  .fl-content {
    flex: 1;
    padding: 16px 16px 90px;
    overflow-y: auto;
  }

  .fl-bottomnav {
    position: sticky;
    bottom: 0;
    display: flex;
    background: var(--paper-card);
    border-top: 2px solid var(--ink);
  }
  .fl-navbtn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 10px 0 8px;
    background: none;
    border: none;
    color: var(--muted);
    font-size: 11px;
    border-top: 3px solid transparent;
  }
  .fl-navbtn.active {
    color: var(--ink);
    border-top: 3px solid var(--gold);
    font-weight: 600;
  }

  .fl-summary {
    background: var(--paper-card);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 16px;
    margin-bottom: 16px;
  }
  .fl-summary-label {
    font-size: 12px;
    color: var(--muted);
    margin: 0 0 2px;
  }
  .fl-summary-value {
    font-size: 28px;
    font-weight: 700;
    margin: 0;
  }
  .fl-progress-track {
    height: 6px;
    background: #DCD3B8;
    border-radius: 3px;
    margin-top: 10px;
    overflow: hidden;
  }
  .fl-progress-fill {
    height: 100%;
    background: var(--forest);
  }

  .fl-card {
    background: var(--paper-card);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 14px 16px;
    margin-bottom: 10px;
    cursor: pointer;
  }
  .fl-card-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .fl-card-name {
    font-weight: 600;
    font-size: 15px;
  }
  .fl-card-balance {
    font-weight: 700;
    font-size: 16px;
  }
  .fl-card-sub {
    font-size: 12px;
    color: var(--muted);
    margin-top: 2px;
  }

  .fl-section-title {
    font-size: 13px;
    color: var(--muted);
    margin: 18px 0 8px;
    padding-bottom: 4px;
    border-bottom: 1px dashed var(--line);
  }

  .fl-list-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--paper-card);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 12px 14px;
    margin-bottom: 8px;
  }
  .fl-list-row-main { flex: 1; min-width: 0; }
  .fl-list-row-name { font-weight: 600; font-size: 14px; }
  .fl-list-row-sub { font-size: 12px; color: var(--muted); margin-top: 2px; }
  .fl-icon-btn {
    background: none;
    border: none;
    padding: 6px;
    color: var(--muted);
    cursor: pointer;
  }
  .fl-icon-btn.danger { color: var(--maroon); }

  .fl-add-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 1px dashed var(--line);
    border-radius: 6px;
    padding: 12px;
    color: var(--ink);
    background: none;
    width: 100%;
    font-size: 14px;
    margin-top: 4px;
  }

  .fl-panel {
    background: var(--paper-card);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 16px;
    margin-bottom: 14px;
  }
  .fl-panel-title {
    font-weight: 700;
    font-size: 15px;
    margin: 0 0 12px;
  }
  .fl-field { margin-bottom: 12px; }
  .fl-field label {
    display: block;
    font-size: 12px;
    color: var(--muted);
    margin-bottom: 4px;
  }
  .fl-field input {
    width: 100%;
    padding: 9px 10px;
    border: 1px solid var(--line);
    border-radius: 4px;
    font-size: 14px;
    background: #fff;
    color: var(--ink);
    font-family: inherit;
  }
  .fl-field input:focus {
    outline: 2px solid var(--gold);
    outline-offset: 1px;
  }
  .fl-form-actions {
    display: flex;
    gap: 8px;
    margin-top: 4px;
  }

  .fl-btn {
    flex: 1;
    padding: 10px;
    border-radius: 4px;
    border: 1px solid var(--ink);
    background: var(--ink);
    color: #fff;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }
  .fl-btn.secondary {
    background: none;
    color: var(--ink);
  }
  .fl-btn.danger {
    background: var(--maroon);
    border-color: var(--maroon);
  }

  .fl-empty {
    text-align: center;
    color: var(--muted);
    padding: 40px 20px;
    font-size: 14px;
  }

  .fl-detail-head {
    background: var(--paper-card);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 16px;
    margin-bottom: 16px;
  }
  .fl-detail-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 10px;
  }
  .fl-stat-label { font-size: 11px; color: var(--muted); margin: 0; }
  .fl-stat-value { font-size: 17px; font-weight: 700; margin: 2px 0 0; }

  .fl-month-row {
    border-bottom: 1px dashed var(--line);
    padding: 10px 2px;
    cursor: pointer;
  }
  .fl-month-row:last-child { border-bottom: none; }
  .fl-month-top {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
  }
  .fl-month-name { font-weight: 600; }
  .fl-month-balance { font-weight: 700; }
  .fl-month-breakdown {
    font-size: 12px;
    color: var(--muted);
    margin-top: 3px;
  }

  .fl-toast {
    position: fixed;
    bottom: 74px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--ink);
    color: #fff;
    font-size: 12px;
    padding: 6px 14px;
    border-radius: 20px;
    opacity: 0.9;
  }

  .fl-confirm-row {
    display: flex;
    gap: 6px;
    align-items: center;
  }
`;

function ConfirmButton({ onConfirm, label }) {
  const [confirming, setConfirming] = useState(false);
  if (confirming) {
    return (
      <span className="fl-confirm-row">
        <button
          className="fl-icon-btn danger"
          onClick={() => {
            setConfirming(false);
            onConfirm();
          }}
          aria-label={"Confirm " + label}
        >
          <Check size={16} />
        </button>
        <button className="fl-icon-btn" onClick={() => setConfirming(false)} aria-label="Cancel">
          <X size={16} />
        </button>
      </span>
    );
  }
  return (
    <button className="fl-icon-btn danger" onClick={() => setConfirming(true)} aria-label={label}>
      <Trash2 size={16} />
    </button>
  );
}

function LenderForm({ initial, onSave, onCancel }) {
  const [name, setName] = useState(initial ? initial.name : "");
  const [amount, setAmount] = useState(initial ? String(initial.totalAmount) : "");
  const [rate, setRate] = useState(initial ? String((initial.annualRate || 0) * 100) : "0");

  return (
    <div className="fl-panel">
      <p className="fl-panel-title fl-serif">{initial ? "Edit loan" : "Add a new loan"}</p>
      <div className="fl-field">
        <label>Lender name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. City Co-op Bank" />
      </div>
      <div className="fl-field">
        <label>Total loan amount (₹)</label>
        <input
          type="number"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
        />
      </div>
      <div className="fl-field">
        <label>Annual interest rate (%) — leave 0 if none</label>
        <input
          type="number"
          inputMode="decimal"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          placeholder="0"
        />
      </div>
      <div className="fl-form-actions">
        <button className="fl-btn secondary" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="fl-btn"
          onClick={() => {
            if (!name.trim()) return;
            onSave({
              name: name.trim(),
              totalAmount: Number(amount) || 0,
              annualRate: (Number(rate) || 0) / 100,
            });
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}

function MonthForm({ people, defaults, onSave, onCancel, title }) {
  const [amounts, setAmounts] = useState(() => {
    const base = {};
    people.forEach((p) => (base[p] = defaults && defaults[p] != null ? String(defaults[p]) : "0"));
    return base;
  });

  return (
    <div className="fl-panel">
      <p className="fl-panel-title fl-serif">{title}</p>
      {people.length === 0 && (
        <p className="fl-card-sub" style={{ marginBottom: 10 }}>
          No contributors yet — add people from the People tab first.
        </p>
      )}
      {people.map((p) => (
        <div className="fl-field" key={p}>
          <label>{p}'s contribution (₹)</label>
          <input
            type="number"
            inputMode="decimal"
            value={amounts[p]}
            onChange={(e) => setAmounts({ ...amounts, [p]: e.target.value })}
          />
        </div>
      ))}
      <div className="fl-form-actions">
        <button className="fl-btn secondary" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="fl-btn"
          onClick={() => {
            const clean = {};
            Object.keys(amounts).forEach((k) => (clean[k] = Number(amounts[k]) || 0));
            onSave(clean);
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}

export default function FamilyLedger() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState(false);
  const [view, setView] = useState("dashboard");
  const [selectedLoanId, setSelectedLoanId] = useState(null);
  const [showAddLoan, setShowAddLoan] = useState(false);
  const [editingLoanId, setEditingLoanId] = useState(null);
  const [showAddMonth, setShowAddMonth] = useState(false);
  const [editingMonthIndex, setEditingMonthIndex] = useState(null);
  const [newPerson, setNewPerson] = useState("");
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);
  // Tracks our own writes so the realtime echo of them doesn't re-render pointlessly.
  const lastWrittenJson = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: row, error } = await supabase
          .from("ledger")
          .select("payload")
          .eq("id", LEDGER_ROW_ID)
          .maybeSingle();
        if (error) throw error;

        if (row && row.payload) {
          setData(row.payload);
          lastWrittenJson.current = JSON.stringify(row.payload);
        } else {
          const initial = defaultData();
          const { error: insertError } = await supabase
            .from("ledger")
            .upsert({ id: LEDGER_ROW_ID, payload: initial });
          if (insertError) throw insertError;
          setData(initial);
          lastWrittenJson.current = JSON.stringify(initial);
        }
      } catch (e) {
        console.error("load failed", e);
        setConnectionError(true);
        setData(defaultData());
      } finally {
        setLoading(false);
      }
    })();

    // Live sync: when anyone else in the family saves a change, pick it up here too.
    const channel = supabase
      .channel("ledger-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ledger", filter: `id=eq.${LEDGER_ROW_ID}` },
        (payload) => {
          const incoming = payload.new && payload.new.payload;
          if (!incoming) return;
          const incomingJson = JSON.stringify(incoming);
          if (incomingJson === lastWrittenJson.current) return; // it's our own write echoing back
          lastWrittenJson.current = incomingJson;
          setData(incoming);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  function showToast(msg) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 1400);
  }

  async function persist(next) {
    setData(next);
    try {
      lastWrittenJson.current = JSON.stringify(next);
      const { error } = await supabase.from("ledger").upsert({ id: LEDGER_ROW_ID, payload: next });
      if (error) throw error;
      showToast("Saved");
    } catch (e) {
      console.error("save failed", e);
      showToast("Couldn't save — try again");
    }
  }

  if (loading) {
    return (
      <div className="fl-shell">
        <style>{styles}</style>
        <div className="fl-empty">Loading your ledger…</div>
      </div>
    );
  }

  if (connectionError) {
    return (
      <div className="fl-shell">
        <style>{styles}</style>
        <div className="fl-empty">
          Couldn't connect to the shared database. Check that VITE_SUPABASE_URL and
          VITE_SUPABASE_ANON_KEY are set correctly, and that the "ledger" table exists
          (see README.md).
        </div>
      </div>
    );
  }

  if (!data) return null;

  const lenders = data.lenders;
  const people = data.people;
  const payments = data.payments;

  const lenderSummaries = lenders.map((l) => {
    const entries = payments[l.id] || [];
    const { finalBalance } = computeSchedule(l, entries);
    return { ...l, remaining: finalBalance };
  });

  const totalAmount = lenderSummaries.reduce((s, l) => s + (Number(l.totalAmount) || 0), 0);
  const totalRemaining = lenderSummaries.reduce((s, l) => s + l.remaining, 0);
  const totalPaid = totalAmount - totalRemaining;
  const overallPct = totalAmount > 0 ? Math.min(totalPaid / totalAmount, 1) : 0;

  function addLoan(fields) {
    const newLoan = { id: uid("loan"), ...fields };
    persist({ ...data, lenders: [...lenders, newLoan] });
    setShowAddLoan(false);
  }

  function updateLoan(id, fields) {
    const nextLenders = lenders.map((l) => (l.id === id ? { ...l, ...fields } : l));
    persist({ ...data, lenders: nextLenders });
    setEditingLoanId(null);
  }

  function deleteLoan(id) {
    const nextLenders = lenders.filter((l) => l.id !== id);
    const nextPayments = { ...payments };
    delete nextPayments[id];
    persist({ ...data, lenders: nextLenders, payments: nextPayments });
    if (selectedLoanId === id) {
      setSelectedLoanId(null);
      setView("loans");
    }
  }

  function addPerson() {
    const name = newPerson.trim();
    if (!name || people.includes(name)) return;
    persist({ ...data, people: [...people, name] });
    setNewPerson("");
  }

  function deletePerson(name) {
    persist({ ...data, people: people.filter((p) => p !== name) });
  }

  function addMonthEntry(loanId, amounts) {
    const existing = payments[loanId] || [];
    const nextPayments = { ...payments, [loanId]: [...existing, { amounts }] };
    persist({ ...data, payments: nextPayments });
    setShowAddMonth(false);
  }

  function updateMonthEntry(loanId, index, amounts) {
    const existing = payments[loanId] || [];
    const nextEntries = existing.map((e, i) => (i === index ? { amounts } : e));
    persist({ ...data, payments: { ...payments, [loanId]: nextEntries } });
    setEditingMonthIndex(null);
  }

  function deleteMonthEntry(loanId, index) {
    const existing = payments[loanId] || [];
    const nextEntries = existing.filter((_, i) => i !== index);
    persist({ ...data, payments: { ...payments, [loanId]: nextEntries } });
  }

  function openLoan(id) {
    setSelectedLoanId(id);
    setShowAddMonth(false);
    setEditingMonthIndex(null);
    setView("loanDetail");
  }

  const selectedLoan = lenders.find((l) => l.id === selectedLoanId) || null;

  return (
    <div className="fl-shell">
      <style>{styles}</style>

      <div className="fl-topbar">
        {view === "loanDetail" && selectedLoan ? (
          <>
            <button className="fl-back-row" onClick={() => setView("loans")}>
              <ChevronLeft size={16} /> Loans
            </button>
            <h1 className="fl-title fl-serif">{selectedLoan.name}</h1>
          </>
        ) : (
          <>
            <h1 className="fl-title fl-serif">Family Ledger</h1>
            <p className="fl-subtitle">
              Shared ledger — {people.length > 0 ? people.join(", ") : "no contributors added yet"}
            </p>
          </>
        )}
      </div>

      <div className="fl-content">
        {view === "dashboard" && (
          <>
            <div className="fl-summary">
              <p className="fl-summary-label">Total remaining across all loans</p>
              <p className="fl-summary-value fl-mono">{fmt(totalRemaining)}</p>
              <div className="fl-progress-track">
                <div className="fl-progress-fill" style={{ width: (overallPct * 100).toFixed(1) + "%" }} />
              </div>
              <p className="fl-card-sub" style={{ marginTop: 8 }}>
                {fmt(totalPaid)} paid of {fmt(totalAmount)}
              </p>
            </div>

            {lenderSummaries.length === 0 && (
              <div className="fl-empty">No loans yet. Add one from the Loans tab.</div>
            )}

            {lenderSummaries.map((l) => {
              const pct = l.totalAmount > 0 ? Math.min((l.totalAmount - l.remaining) / l.totalAmount, 1) : 0;
              return (
                <div className="fl-card" key={l.id} onClick={() => openLoan(l.id)}>
                  <div className="fl-card-row">
                    <span className="fl-card-name">{l.name}</span>
                    <span className="fl-card-balance fl-mono">{fmt(l.remaining)}</span>
                  </div>
                  <div className="fl-progress-track">
                    <div className="fl-progress-fill" style={{ width: (pct * 100).toFixed(1) + "%" }} />
                  </div>
                  <p className="fl-card-sub">of {fmt(l.totalAmount)} total</p>
                </div>
              );
            })}
          </>
        )}

        {view === "loans" && (
          <>
            <p className="fl-section-title">Your loans &amp; creditors</p>
            {lenders.map((l) =>
              editingLoanId === l.id ? (
                <LenderForm
                  key={l.id}
                  initial={l}
                  onCancel={() => setEditingLoanId(null)}
                  onSave={(fields) => updateLoan(l.id, fields)}
                />
              ) : (
                <div className="fl-list-row" key={l.id}>
                  <div className="fl-list-row-main" onClick={() => openLoan(l.id)}>
                    <div className="fl-list-row-name">{l.name}</div>
                    <div className="fl-list-row-sub fl-mono">{fmt(l.totalAmount)} · {((l.annualRate || 0) * 100).toFixed(2)}% p.a.</div>
                  </div>
                  <button className="fl-icon-btn" onClick={() => setEditingLoanId(l.id)} aria-label="Edit loan">
                    <Pencil size={16} />
                  </button>
                  <ConfirmButton label="delete loan" onConfirm={() => deleteLoan(l.id)} />
                  <button className="fl-icon-btn" onClick={() => openLoan(l.id)} aria-label="Open loan">
                    <ChevronRight size={16} />
                  </button>
                </div>
              )
            )}

            {showAddLoan ? (
              <LenderForm onCancel={() => setShowAddLoan(false)} onSave={addLoan} />
            ) : (
              <button className="fl-add-row" onClick={() => setShowAddLoan(true)}>
                <Plus size={16} /> Add a loan or creditor
              </button>
            )}
          </>
        )}

        {view === "people" && (
          <>
            <p className="fl-section-title">Contributors</p>
            {people.map((p) => (
              <div className="fl-list-row" key={p}>
                <div className="fl-list-row-main">
                  <div className="fl-list-row-name">{p}</div>
                </div>
                <ConfirmButton label={"remove " + p} onConfirm={() => deletePerson(p)} />
              </div>
            ))}
            {people.length === 0 && <div className="fl-empty">No contributors yet.</div>}

            <div className="fl-panel" style={{ marginTop: 12 }}>
              <p className="fl-panel-title fl-serif">Add a contributor</p>
              <div className="fl-field">
                <label>Name</label>
                <input
                  value={newPerson}
                  onChange={(e) => setNewPerson(e.target.value)}
                  placeholder="e.g. Fathima"
                  onKeyDown={(e) => e.key === "Enter" && addPerson()}
                />
              </div>
              <div className="fl-form-actions">
                <button className="fl-btn" onClick={addPerson}>
                  Add
                </button>
              </div>
            </div>
            <p className="fl-card-sub" style={{ marginTop: 10 }}>
              Removing someone keeps their past recorded contributions but leaves them out of new entries.
            </p>
          </>
        )}

        {view === "loanDetail" && selectedLoan && (
          <>
            {editingLoanId === selectedLoan.id ? (
              <LenderForm
                initial={selectedLoan}
                onCancel={() => setEditingLoanId(null)}
                onSave={(fields) => updateLoan(selectedLoan.id, fields)}
              />
            ) : (
              (() => {
                const entries = payments[selectedLoan.id] || [];
                const { rows, finalBalance, nextInterest } = computeSchedule(selectedLoan, entries);
                return (
                  <>
                    <div className="fl-detail-head">
                      <div className="fl-card-row">
                        <span className="fl-card-sub">Total loan amount</span>
                        <button className="fl-icon-btn" onClick={() => setEditingLoanId(selectedLoan.id)} aria-label="Edit loan details">
                          <Pencil size={14} />
                        </button>
                      </div>
                      <p className="fl-stat-value fl-mono" style={{ fontSize: 20 }}>{fmt(selectedLoan.totalAmount)}</p>
                      <div className="fl-detail-grid">
                        <div>
                          <p className="fl-stat-label">Annual interest</p>
                          <p className="fl-stat-value fl-mono">{((selectedLoan.annualRate || 0) * 100).toFixed(2)}%</p>
                        </div>
                        <div>
                          <p className="fl-stat-label">Remaining balance</p>
                          <p className="fl-stat-value fl-mono" style={{ color: "var(--maroon)" }}>{fmt(finalBalance)}</p>
                        </div>
                        <div>
                          <p className="fl-stat-label">Paid so far</p>
                          <p className="fl-stat-value fl-mono" style={{ color: "var(--forest)" }}>
                            {fmt((selectedLoan.totalAmount || 0) - finalBalance)}
                          </p>
                        </div>
                        <div>
                          <p className="fl-stat-label">Next month's interest</p>
                          <p className="fl-stat-value fl-mono">{fmt(nextInterest)}</p>
                        </div>
                      </div>
                    </div>

                    <p className="fl-section-title">Monthly entries</p>

                    {rows.map((row, i) =>
                      editingMonthIndex === i ? (
                        <MonthForm
                          key={i}
                          people={people}
                          defaults={row.amounts}
                          title={"Edit month " + (i + 1)}
                          onCancel={() => setEditingMonthIndex(null)}
                          onSave={(amounts) => updateMonthEntry(selectedLoan.id, i, amounts)}
                        />
                      ) : (
                        <div
                          className="fl-month-row"
                          key={i}
                          onClick={() => setEditingMonthIndex(i)}
                        >
                          <div className="fl-month-top">
                            <span className="fl-month-name">Month {i + 1}</span>
                            <span className="fl-month-balance fl-mono">{fmt(row.remaining)}</span>
                          </div>
                          <div className="fl-month-breakdown">
                            {people.map((p) => `${p} ${fmt(row.amounts[p] || 0)}`).join(" · ")}
                            {" — interest "}
                            {fmt(row.interest)}
                          </div>
                        </div>
                      )
                    )}

                    {rows.length === 0 && (
                      <p className="fl-card-sub" style={{ marginBottom: 8 }}>
                        No months recorded yet.
                      </p>
                    )}

                    {showAddMonth ? (
                      <MonthForm
                        people={people}
                        defaults={rows.length > 0 ? rows[rows.length - 1].amounts : null}
                        title={"Add month " + (rows.length + 1)}
                        onCancel={() => setShowAddMonth(false)}
                        onSave={(amounts) => addMonthEntry(selectedLoan.id, amounts)}
                      />
                    ) : (
                      <button className="fl-add-row" onClick={() => setShowAddMonth(true)}>
                        <Plus size={16} /> Add month {rows.length + 1}
                      </button>
                    )}

                    {rows.length > 0 && (
                      <div style={{ marginTop: 12, textAlign: "center" }}>
                        <ConfirmButton
                          label="delete last month"
                          onConfirm={() => deleteMonthEntry(selectedLoan.id, rows.length - 1)}
                        />
                        <span className="fl-card-sub" style={{ marginLeft: 6 }}>
                          Remove month {rows.length}
                        </span>
                      </div>
                    )}
                  </>
                );
              })()
            )}
          </>
        )}
      </div>

      {toast && <div className="fl-toast">{toast}</div>}

      <div className="fl-bottomnav">
        <button
          className={"fl-navbtn " + (view === "dashboard" ? "active" : "")}
          onClick={() => setView("dashboard")}
        >
          <Home size={18} />
          Dashboard
        </button>
        <button
          className={"fl-navbtn " + (view === "loans" || view === "loanDetail" ? "active" : "")}
          onClick={() => setView("loans")}
        >
          <Landmark size={18} />
          Loans
        </button>
        <button
          className={"fl-navbtn " + (view === "people" ? "active" : "")}
          onClick={() => setView("people")}
        >
          <Users size={18} />
          People
        </button>
      </div>
    </div>
  );
}
