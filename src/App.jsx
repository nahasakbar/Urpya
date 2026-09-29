import { useState, useEffect, useRef } from "react";
import {
  Home,
  Landmark,
  Users,
  Plus,
  ChevronRight,
  ChevronLeft,
  X,
  Trash2,
  Pencil,
  Check,
  Target,
  AlertCircle,
} from "lucide-react";
import { supabase, LEDGER_ROW_ID } from "./supabaseClient.js";

function uid(prefix) {
  return prefix + "-" + Math.random().toString(36).slice(2, 9);
}

function fmt(n) {
  const v = Math.round(Number(n) || 0);
  return "₹" + v.toLocaleString("en-IN");
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

// "2026-09" style keys: sortable as strings, easy to store as object keys.
function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function monthKeyAdd(key, n) {
  const [y, m] = key.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (((total % 12) + 12) % 12) + 1;
  return `${ny}-${pad2(nm)}`;
}

function monthsBetween(a, b) {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return by * 12 + bm - (ay * 12 + am);
}

function monthKeyLabel(key) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function monthKeyShort(key) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// What kind of borrowing a loan is, shown as a tag. Purely a label — it never
// affects any calculation. Stored as `category`; the separate `type` field
// ("interest" / "fixed") is what controls interest.
const CATEGORIES = [
  { id: "loan", label: "Loan" },
  { id: "mortgage", label: "Mortgage" },
  { id: "car", label: "Car" },
  { id: "gold", label: "Gold loan" },
  { id: "overdraft", label: "Overdraft" },
  { id: "credit-card", label: "Credit card" },
  { id: "family", label: "Family & friends" },
  { id: "other", label: "Other" },
];

function categoryLabel(id) {
  const c = CATEGORIES.find((c) => c.id === id);
  return c ? c.label : null;
}

function defaultData() {
  const asOf = currentMonthKey();
  return {
    people: ["Uppa", "Nahas", "Riyas"],
    lenders: [
      {
        id: "pnb-housing",
        name: "PNB Housing Loan",
        type: "interest",
        totalAmount: 1500000,
        annualRate: 0,
        minPayment: 0,
        dueDay: null,
        startMonth: asOf,
      },
      { id: "pnb-od", name: "PNB OD", type: "interest", totalAmount: 0, annualRate: 0, minPayment: 0, dueDay: null, startMonth: asOf },
      { id: "sathyn", name: "Sathyn", type: "fixed", totalAmount: 0, annualRate: 0, minPayment: 0, dueDay: null, startMonth: asOf },
      { id: "mynaakam", name: "Mynaakam", type: "fixed", totalAmount: 0, annualRate: 0, minPayment: 0, dueDay: null, startMonth: asOf },
      { id: "kochumaash", name: "Kochumaash", type: "fixed", totalAmount: 0, annualRate: 0, minPayment: 0, dueDay: null, startMonth: asOf },
    ],
    payments: {
      "pnb-housing": { [asOf]: { amounts: { Uppa: 0, Nahas: 10000, Riyas: 5000 } } },
    },
    strategy: { budget: 15000, type: "avalanche" },
  };
}

// Brings older saved data up to the current shape:
// - payments used to be a plain array ("Month 1, Month 2, ...") — this maps
//   that array onto real calendar months, ending at the current month.
// - every loan gets a type ("interest" keeps existing math exactly as before
//   when its rate is 0, so this never changes anyone's balance), a dueDay,
//   and a startMonth.
function migrateData(raw) {
  let changed = false;
  const asOf = currentMonthKey();

  const lenders = (raw.lenders || []).map((l) => {
    const next = { ...l };
    if (!next.type) {
      next.type = "interest";
      changed = true;
    }
    if (next.dueDay === undefined) {
      next.dueDay = null;
      changed = true;
    }
    if (next.minPayment === undefined) {
      next.minPayment = 0;
      changed = true;
    }
    if (next.protectFromGrowth === undefined) {
      next.protectFromGrowth = false;
      changed = true;
    }
    if (!next.startMonth) {
      next.startMonth = asOf;
      changed = true;
    }
    return next;
  });

  const payments = {};
  Object.keys(raw.payments || {}).forEach((loanId) => {
    const val = raw.payments[loanId];
    if (Array.isArray(val)) {
      changed = true;
      const n = val.length;
      const map = {};
      for (let i = 0; i < n; i++) {
        map[monthKeyAdd(asOf, i - (n - 1))] = { amounts: val[i] || {} };
      }
      payments[loanId] = map;
      if (n > 0) {
        const lender = lenders.find((l) => l.id === loanId);
        if (lender) lender.startMonth = monthKeyAdd(asOf, -(n - 1));
      }
    } else if (val && typeof val === "object") {
      payments[loanId] = val;
    } else {
      payments[loanId] = {};
    }
  });

  const strategy = raw.strategy || { budget: 0, type: "avalanche" };

  return { data: { ...raw, lenders, payments, strategy }, changed };
}

// Walks every real month from the loan's start to now. Interest (if any)
// is added every month whether or not that month has a recorded payment —
// that's what makes an unpaid month still grow the balance.
function computeSchedule(lender, entriesMap, asOfKey) {
  const start = lender.startMonth || asOfKey;
  const rate = lender.type === "fixed" ? 0 : (Number(lender.annualRate) || 0) / 12;
  let balance = Number(lender.totalAmount) || 0;
  const rows = [];
  const span = Math.max(monthsBetween(start, asOfKey) + 1, 0);

  for (let i = 0; i < span; i++) {
    const key = monthKeyAdd(start, i);
    const opening = balance;
    const interest = opening * rate;
    balance = opening + interest;
    const entry = entriesMap ? entriesMap[key] : null;
    const amounts = entry ? entry.amounts || {} : {};
    const totalPaid = Object.values(amounts).reduce((s, v) => s + (Number(v) || 0), 0);
    balance = Math.max(balance - totalPaid, 0);
    rows.push({ key, opening, interest, totalPaid, remaining: balance, amounts, recorded: !!entry });
  }

  return { rows, finalBalance: balance, nextInterest: balance * rate };
}

// What this loan is actually being paid right now: the most recently
// recorded month's total, or its minimum/fixed payment if nothing recorded yet.
function getCurrentPayment(lender, entriesMap) {
  const keys = Object.keys(entriesMap || {}).sort();
  if (keys.length > 0) {
    const last = entriesMap[keys[keys.length - 1]];
    const amounts = last.amounts || {};
    return Object.values(amounts).reduce((s, v) => s + (Number(v) || 0), 0);
  }
  return Number(lender.minPayment) || 0;
}

// The oldest month (from loan start to now) that has no recorded payment
// yet — recording naturally happens oldest-first, but the picker lets you
// pick any month if you'd rather.
function getSuggestedMonth(lender, entriesMap, asOfKey) {
  const start = lender.startMonth || asOfKey;
  const span = Math.max(monthsBetween(start, asOfKey) + 1, 0);
  for (let i = 0; i < span; i++) {
    const key = monthKeyAdd(start, i);
    if (!entriesMap[key]) return key;
  }
  return asOfKey;
}

function monthsLabel(m) {
  if (m == null) return "—";
  if (m < 1) return "paid off";
  if (m < 12) return m + (m === 1 ? " month" : " months");
  const y = Math.floor(m / 12);
  const rem = Math.round(m % 12);
  return y + (y === 1 ? " yr" : " yrs") + (rem > 0 ? " " + rem + (rem === 1 ? " mo" : " mos") : "");
}

// Debt avalanche (highest rate first) or snowball (smallest balance first):
// pay each loan's minimum, then throw every spare rupee at the top-priority
// loan, rolling it into the next one once it's cleared.
function simulateStrategy(loans, strategyType, budget, maxMonths = 600) {
  let state = loans.map((l) => ({ ...l }));
  // A "protected" loan's real floor for month 1 is whichever is bigger: its stated
  // minimum, or the interest it's about to accrue on its starting balance — that's
  // what actually stops it from growing, not just its (possibly 0) minPayment.
  const initialMinSum = state.reduce((s, l) => {
    const floor = l.protectFromGrowth ? Math.max(l.minPayment || 0, l.balance * (l.rate / 12)) : l.minPayment || 0;
    return s + floor;
  }, 0);
  if (initialMinSum > budget + 0.5) {
    return { feasible: false, minRequired: initialMinSum };
  }

  let totalInterest = 0;
  let month = 0;
  const payoffMonth = {};
  let firstMonthPlan = null;

  while (state.some((l) => l.balance > 0.5) && month < maxMonths) {
    month++;
    const interestThisMonth = {};
    state.forEach((l) => {
      if (l.balance > 0.5) {
        const interest = l.balance * (l.rate / 12);
        interestThisMonth[l.id] = interest;
        l.balance += interest;
        totalInterest += interest;
      }
    });

    let budgetLeft = budget;
    const plan = {};
    const active = state.filter((l) => l.balance > 0.5);

    active.forEach((l) => {
      // A protected loan always gets at least this month's real interest, recomputed
      // fresh off its actual balance — not a stale number that drifts as it's paid down.
      const floor = l.protectFromGrowth
        ? Math.max(l.minPayment || 0, interestThisMonth[l.id] || 0)
        : l.minPayment || 0;
      const pay = Math.min(floor, l.balance, budgetLeft);
      l.balance -= pay;
      budgetLeft -= pay;
      plan[l.id] = (plan[l.id] || 0) + pay;
    });

    const ordered =
      strategyType === "avalanche"
        ? [...active].sort((a, b) => b.rate - a.rate)
        : [...active].sort((a, b) => a.balance - b.balance);

    for (const l of ordered) {
      if (budgetLeft <= 0.01) break;
      if (l.balance <= 0.5) continue;
      const extra = Math.min(budgetLeft, l.balance);
      l.balance -= extra;
      budgetLeft -= extra;
      plan[l.id] = (plan[l.id] || 0) + extra;
    }

    state.forEach((l) => {
      if (l.balance <= 0.5 && payoffMonth[l.id] == null) payoffMonth[l.id] = month;
    });

    if (month === 1) firstMonthPlan = plan;
  }

  return {
    feasible: true,
    months: month,
    totalInterest,
    payoffMonth,
    firstMonthPlan: firstMonthPlan || {},
  };
}

// What happens if each loan just keeps being paid independently at its
// current pace, with no reallocation between loans.
function simulateStatusQuo(loans, maxMonths = 600) {
  let totalInterest = 0;
  let months = 0;
  const payoffMonth = {};
  const stalled = [];

  loans.forEach((l) => {
    const monthlyRate = l.rate / 12;
    const payment = l.currentPayment || 0;
    if (l.balance <= 0.5) {
      payoffMonth[l.id] = 0;
      return;
    }
    if (payment <= l.balance * monthlyRate) {
      stalled.push(l.id);
      return;
    }
    let bal = l.balance;
    let m = 0;
    while (bal > 0.5 && m < maxMonths) {
      m++;
      const interest = bal * monthlyRate;
      bal += interest;
      totalInterest += interest;
      bal -= Math.min(payment, bal);
    }
    payoffMonth[l.id] = m;
    months = Math.max(months, m);
  });

  return { totalInterest, months, payoffMonth, stalled };
}

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&display=swap');

  html, body {
    margin: 0;
    padding: 0;
    background: #3A2717;
  }

  .fl-shell {
    --ink: #1B2A4A;
    --paper: #EDE4CE;
    --paper-card: #FBF8F0;
    --leather: #4C3423;
    --leather-hi: #5E4430;
    --leather-dk: #3A2717;
    --ribbon-hi: #9C8A78;
    --ribbon: #8B7560;
    --ribbon-dk: #6B5744;
    --brass: #B08A3E;
    --brass-light: #E4C583;
    --maroon: #7A2E2E;
    --forest: #2F5D45;
    --muted: #6B6455;
    --line: #C9BFA3;
    max-width: 480px;
    width: 100%;
    position: fixed;
    top: 0;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    background: var(--paper);
    color: var(--ink);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  /* iOS 26+ Home Screen bug: in standalone mode the viewport comes up short
     by the status-bar height, so top:0/bottom:0, 100% and 100dvh all stop
     early, and a position:fixed shell is only drawn down to that false edge
     even when sized taller. 100lvh is the one unit that measures the full
     screen, and the shell must be in normal flow so the document itself is
     that tall and iOS draws all the way down. Page-level bounce is turned
     off so dragging the header or tab bar doesn't rubber-band the app. */
  @media (display-mode: standalone) {
    html, body { overscroll-behavior: none; }
    .fl-shell { position: relative; bottom: auto; height: 100lvh; }
    .fl-bottomnav { position: absolute; }
  }
  html.fl-standalone, html.fl-standalone body { overscroll-behavior: none; }
  html.fl-standalone .fl-shell { position: relative; bottom: auto; height: 100lvh; }
  html.fl-standalone .fl-bottomnav { position: absolute; }
  .fl-shell * { box-sizing: border-box; }
  .fl-serif { font-family: 'Fraunces', Georgia, "Times New Roman", serif; }
  .fl-mono { font-family: ui-monospace, Menlo, Consolas, "Courier New", monospace; }

  .fl-grain { position: absolute; inset: 0; pointer-events: none; }
  .fl-grain-paper { filter: url(#grainPaper); opacity: 0.5; mix-blend-mode: multiply; z-index: 0; }
  .fl-grain-leather { filter: url(#grainLeather); opacity: 0.6; mix-blend-mode: overlay; z-index: 0; }
  .fl-z1 { position: relative; z-index: 1; }

  .fl-leather {
    background:
      radial-gradient(ellipse 130% 110% at 20% -10%, rgba(255,214,168,0.16), transparent 55%),
      radial-gradient(ellipse 120% 100% at 90% 115%, rgba(0,0,0,0.22), transparent 60%),
      radial-gradient(ellipse 140% 140% at 50% 50%, transparent 55%, rgba(0,0,0,0.14) 100%),
      linear-gradient(155deg, var(--leather-hi) 0%, var(--leather) 48%, var(--leather-dk) 100%);
    color: #F3E7D0;
    position: relative;
  }
  .fl-stitch-bottom {
    border-bottom: 1.5px dashed rgba(228,197,131,0.55);
    box-shadow: 0 1px 0 rgba(0,0,0,0.4), 0 2px 4px rgba(0,0,0,0.25);
  }
  .fl-stitch-top {
    border-top: 1.5px dashed rgba(228,197,131,0.55);
    box-shadow: 0 -1px 0 rgba(0,0,0,0.4), 0 -2px 4px rgba(0,0,0,0.25);
  }
  .fl-rivet {
    width: 6px; height: 6px; border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, var(--brass-light), var(--brass) 60%, #7A5A22 100%);
    box-shadow: 0 1px 1px rgba(0,0,0,0.5);
  }

  .fl-topbar {
    padding: calc(20px + env(safe-area-inset-top, 0px)) 20px 14px;
    position: relative;
    z-index: 1;
  }
  .fl-topbar-rivets {
    position: absolute;
    top: calc(18px + env(safe-area-inset-top, 0px));
    right: 20px;
    display: flex;
    gap: 6px;
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
    opacity: 0.75;
  }
  .fl-back-row {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    color: inherit;
    font-size: 14px;
    margin-bottom: 8px;
    background: none;
    border: none;
    padding: 4px 0;
    opacity: 0.85;
  }

  .fl-content {
    flex: 1;
    min-height: 0;
    padding: 16px 16px calc(74px + env(safe-area-inset-bottom, 0px));
    overflow-y: auto;
    position: relative;
    z-index: 1;
  }

  .fl-bottomnav {
    position: fixed;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 100%;
    max-width: 480px;
    z-index: 1;
  }
  .fl-navbtn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 16px 0 6px;
    background: none;
    border: none;
    color: rgba(243,231,208,0.55);
    font-size: 10.5px;
    font-weight: 600;
    position: relative;
  }
  .fl-navbtn.active { color: #F3E7D0; }
  .fl-ribbon {
    display: none;
    position: absolute; top: -14px; left: 50%; transform: translateX(-50%);
    width: 22px; height: 26px;
    background: linear-gradient(180deg, var(--ribbon-hi) 0%, var(--ribbon) 55%, var(--ribbon-dk) 100%);
    box-shadow:
      inset 2px 0 1px -1px rgba(255,255,255,0.22),
      inset -2px 0 1px -1px rgba(0,0,0,0.28);
    clip-path: polygon(0 0, 100% 0, 100% 78%, 50% 100%, 0 78%);
    filter: drop-shadow(0 2px 3px rgba(0,0,0,0.4));
  }
  .fl-navbtn.active .fl-ribbon { display: block; }
  .fl-ribbon-grain {
    position: absolute; inset: 0;
    clip-path: polygon(0 0, 100% 0, 100% 78%, 50% 100%, 0 78%);
    filter: url(#grainRibbon);
    opacity: 0.5;
    mix-blend-mode: overlay;
    pointer-events: none;
  }

  .fl-summary {
    background: var(--paper-card);
    border: 1px solid var(--line);
    border-radius: 14px;
    box-shadow: 0 1px 0 rgba(255,255,255,0.6) inset, 0 4px 10px rgba(74,44,29,0.10);
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
    background: rgba(107,100,85,0.15);
    border-radius: 6px;
    margin-top: 10px;
    overflow: hidden;
  }
  .fl-progress-fill {
    height: 100%;
    border-radius: 6px;
    background: linear-gradient(90deg, var(--brass), var(--brass-light));
  }

  .fl-card {
    background: var(--paper-card);
    border: 1px solid var(--line);
    border-radius: 14px;
    box-shadow: 0 1px 0 rgba(255,255,255,0.6) inset, 0 4px 10px rgba(74,44,29,0.10);
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
  .fl-overdue {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.02em;
    padding: 2px 8px;
    border-radius: 20px;
    background: rgba(122,46,46,0.10);
    color: var(--maroon);
    border: 1px solid rgba(122,46,46,0.28);
    margin-top: 4px;
  }

  .fl-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.02em;
    padding: 2px 8px;
    border-radius: 20px;
    border: 1px solid transparent;
  }
  .fl-chip.chip-grey {
    background: rgba(107,100,85,0.14);
    color: var(--muted);
    border-color: rgba(107,100,85,0.3);
  }
  .fl-chip.chip-green {
    background: rgba(47,93,69,0.12);
    color: var(--forest);
    border-color: rgba(47,93,69,0.28);
  }
  .fl-chip.chip-blue {
    background: rgba(27,42,74,0.10);
    color: var(--ink);
    border-color: rgba(27,42,74,0.24);
  }
  /* Loan-type tag (Mortgage, Car, ...): brass, so it never reads as a status colour. */
  .fl-chip.chip-tag {
    background: rgba(176,138,62,0.14);
    color: #7A5A22;
    border-color: rgba(176,138,62,0.42);
  }
  .fl-chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }

  .fl-tag-picker {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .fl-tag-option {
    padding: 6px 12px;
    border-radius: 20px;
    border: 1px solid var(--line);
    background: none;
    color: var(--ink);
    font-family: inherit;
    font-size: 13px;
    cursor: pointer;
  }
  .fl-tag-option.selected {
    background: linear-gradient(160deg, var(--leather-hi), var(--leather));
    border-color: var(--leather-dk);
    color: #F3E7D0;
  }

  .fl-switch-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 4px;
  }
  .fl-switch-label { font-size: 14px; color: var(--ink); }
  .fl-switch {
    position: relative;
    flex-shrink: 0;
    width: 46px;
    height: 28px;
    padding: 0;
    border-radius: 14px;
    border: 1px solid var(--line);
    background: rgba(107,100,85,0.18);
    cursor: pointer;
    transition: background 0.15s;
  }
  .fl-switch.on {
    background: linear-gradient(160deg, var(--leather-hi), var(--leather));
    border-color: var(--leather-dk);
  }
  .fl-switch-knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #fff, #E9E1CC);
    box-shadow: 0 1px 2px rgba(0,0,0,0.35);
    transition: transform 0.15s;
  }
  .fl-switch.on .fl-switch-knob {
    transform: translateX(18px);
    background: radial-gradient(circle at 35% 30%, var(--brass-light), var(--brass) 60%, #7A5A22 100%);
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
    border-radius: 12px;
    box-shadow: 0 1px 0 rgba(255,255,255,0.6) inset, 0 3px 8px rgba(74,44,29,0.08);
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
    border-radius: 12px;
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
    border-radius: 14px;
    box-shadow: 0 1px 0 rgba(255,255,255,0.6) inset, 0 4px 10px rgba(74,44,29,0.10);
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
    border-radius: 8px;
    font-size: 14px;
    background: #fff;
    color: var(--ink);
    font-family: inherit;
  }
  .fl-field input:focus {
    outline: 2px solid var(--brass);
    outline-offset: 1px;
  }
  .fl-term-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .fl-term-row input { flex: 1; min-width: 0; }
  .fl-term-row .fl-tag-option { flex-shrink: 0; }
  .fl-form-actions {
    display: flex;
    gap: 8px;
    margin-top: 4px;
  }

  .fl-btn {
    flex: 1;
    padding: 10px;
    border-radius: 10px;
    border: 1px solid var(--leather-dk);
    background: linear-gradient(160deg, var(--leather-hi), var(--leather));
    color: #F3E7D0;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }
  .fl-btn.secondary {
    background: none;
    color: var(--ink);
    border-color: var(--line);
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
    border-radius: 14px;
    box-shadow: 0 1px 0 rgba(255,255,255,0.6) inset, 0 4px 10px rgba(74,44,29,0.10);
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
  }
  .fl-month-row:last-child { border-bottom: none; }
  .fl-month-top {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    cursor: pointer;
  }
  .fl-month-name { font-weight: 600; }
  .fl-month-balance { font-weight: 700; }
  .fl-month-breakdown {
    font-size: 12px;
    color: var(--muted);
    margin-top: 3px;
    cursor: pointer;
  }

  .fl-toast {
    position: fixed;
    bottom: calc(74px + env(safe-area-inset-bottom, 0px));
    left: 50%;
    transform: translateX(-50%);
    background: var(--leather-dk);
    color: #F3E7D0;
    font-size: 12px;
    padding: 6px 14px;
    border-radius: 20px;
    opacity: 0.95;
    z-index: 2;
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

function Switch({ on, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={"fl-switch" + (on ? " on" : "")}
      onClick={() => onChange(!on)}
    >
      <span className="fl-switch-knob" />
    </button>
  );
}

// "2-year term", "18-month term".
function termLabel(months) {
  if (months % 12 === 0) return `${months / 12}-year term`;
  return `${months}-month term`;
}

// The term's last month. The start month counts as month 1, so a 24-month
// term from Jan 2026 ends Dec 2027. With no termStart saved, the term starts
// when tracking started. Display only — the term never affects any balance.
function termEndKey(lender) {
  return monthKeyAdd(lender.termStart || lender.startMonth, lender.termMonths - 1);
}

function termSummary(lender, asOfKey) {
  const end = termEndKey(lender);
  const left = monthsBetween(asOfKey, end) + 1;
  return (
    termLabel(lender.termMonths) +
    " · " +
    (left > 0 ? `ends ${monthKeyShort(end)} · ${left} month${left === 1 ? "" : "s"} to go` : `ended ${monthKeyShort(end)}`)
  );
}

function LenderForm({ initial, onSave, onCancel }) {
  const [name, setName] = useState(initial ? initial.name : "");
  const [category, setCategory] = useState(initial && initial.category ? initial.category : null);
  // The interest switch is the loan's `type`: on = "interest", off = "fixed".
  const [type, setType] = useState(initial ? initial.type || "interest" : "fixed");
  const [amount, setAmount] = useState(initial ? String(initial.totalAmount) : "");
  const [rate, setRate] = useState(initial ? String((initial.annualRate || 0) * 100) : "");
  const [minPayment, setMinPayment] = useState(initial ? String(initial.minPayment || 0) : "0");
  const [protectFromGrowth, setProtectFromGrowth] = useState(initial ? !!initial.protectFromGrowth : false);
  const [dueDay, setDueDay] = useState(initial && initial.dueDay ? String(initial.dueDay) : "");
  const [startMonth, setStartMonth] = useState(initial && initial.startMonth ? initial.startMonth : currentMonthKey());
  // Term is saved as whole months; it reopens in years when it divides evenly.
  const initialTerm = initial && initial.termMonths ? initial.termMonths : null;
  const [hasTerm, setHasTerm] = useState(!!initialTerm);
  const [termUnit, setTermUnit] = useState(initialTerm && initialTerm % 12 === 0 ? "years" : "months");
  const [termLength, setTermLength] = useState(
    initialTerm ? String(initialTerm % 12 === 0 ? initialTerm / 12 : initialTerm) : ""
  );
  // Left empty, the term starts the same month tracking started.
  const [termStart, setTermStart] = useState(initial && initial.termStart ? initial.termStart : "");
  const [termError, setTermError] = useState(false);

  return (
    <div className="fl-panel">
      <p className="fl-panel-title fl-serif">{initial ? "Edit debt" : "Add a new debt"}</p>

      <div className="fl-field">
        <label>Lender name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. City Co-op Bank" />
      </div>

      <div className="fl-field">
        <label>Total amount borrowed (₹)</label>
        <input
          type="number"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
        />
      </div>

      <div className="fl-field">
        <label>Type — optional</label>
        <div className="fl-tag-picker">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className={"fl-tag-option" + (category === c.id ? " selected" : "")}
              aria-pressed={category === c.id}
              onClick={() => setCategory(category === c.id ? null : c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="fl-field">
        <div className="fl-switch-row">
          <span className="fl-switch-label">Charges interest</span>
          <Switch on={type === "interest"} onChange={(on) => setType(on ? "interest" : "fixed")} label="Charges interest" />
        </div>
        <p className="fl-card-sub">
          {type === "interest"
            ? "Interest is added to the balance every month, even a month you don't pay."
            : "No interest — the balance only ever changes when you record a payment."}
        </p>
      </div>

      {type === "interest" && (
        <div className="fl-field">
          <label>Annual interest rate (%)</label>
          <input
            type="number"
            inputMode="decimal"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder="e.g. 9.5"
          />
        </div>
      )}

      {type === "interest" && (
        <div className="fl-field">
          <div className="fl-switch-row">
            <span className="fl-switch-label">Protect from growing</span>
            <Switch on={protectFromGrowth} onChange={setProtectFromGrowth} label="Protect from growing" />
          </div>
          <p className="fl-card-sub">
            Don’t let this debt grow while it waits its turn. In the Strategy plan, it will always get at least that
            month’s interest — recalculated off its real balance each month — even on a month the plan would
            otherwise send it ₹0.
          </p>
        </div>
      )}

      <div className="fl-field">
        <div className="fl-switch-row">
          <span className="fl-switch-label">Payment term</span>
          <Switch
            on={hasTerm}
            onChange={(on) => {
              setHasTerm(on);
              setTermError(false);
            }}
            label="Payment term"
          />
        </div>
        <p className="fl-card-sub">{hasTerm ? "How long you have to pay it back." : "No fixed end date."}</p>
      </div>

      {hasTerm && (
        <>
          <div className="fl-field">
            <label>Term length</label>
            <div className="fl-term-row">
              <input
                type="number"
                inputMode="decimal"
                value={termLength}
                onChange={(e) => {
                  setTermLength(e.target.value);
                  setTermError(false);
                }}
                placeholder={termUnit === "years" ? "e.g. 2" : "e.g. 24"}
              />
              {["months", "years"].map((u) => (
                <button
                  key={u}
                  type="button"
                  className={"fl-tag-option" + (termUnit === u ? " selected" : "")}
                  aria-pressed={termUnit === u}
                  onClick={() => setTermUnit(u)}
                >
                  {u === "months" ? "Months" : "Years"}
                </button>
              ))}
            </div>
            {termError && (
              <p className="fl-overdue">
                <AlertCircle size={12} /> Enter how long the term is, or turn Payment term off.
              </p>
            )}
          </div>

          <div className="fl-field">
            <label>Term started</label>
            <input type="month" value={termStart || startMonth} onChange={(e) => setTermStart(e.target.value)} />
            <p className="fl-card-sub">
              Same as “Started tracking from” unless you change it — e.g. if the debt began before you started
              tracking it here.
            </p>
          </div>
        </>
      )}

      <div className="fl-field">
        <label>
          {type === "fixed" ? "Monthly payment (₹) — leave 0 if flexible" : "Minimum monthly payment (₹) — leave 0 if flexible"}
        </label>
        <input
          type="number"
          inputMode="decimal"
          value={minPayment}
          onChange={(e) => setMinPayment(e.target.value)}
          placeholder="0"
        />
      </div>

      <div className="fl-field">
        <label>Payment due day of month — optional</label>
        <input
          type="number"
          inputMode="numeric"
          min="1"
          max="31"
          value={dueDay}
          onChange={(e) => setDueDay(e.target.value)}
          placeholder="e.g. 5"
        />
      </div>

      <div className="fl-field">
        <label>Started tracking from</label>
        <input type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} />
      </div>

      <div className="fl-form-actions">
        <button className="fl-btn secondary" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="fl-btn"
          onClick={() => {
            if (!name.trim()) return;
            let termMonths = null;
            if (hasTerm) {
              const n = Number(termLength);
              termMonths = Math.round(termUnit === "years" ? n * 12 : n);
              if (!(termMonths >= 1)) {
                setTermError(true);
                return;
              }
            }
            const day = Number(dueDay);
            onSave({
              name: name.trim(),
              category,
              type,
              totalAmount: Number(amount) || 0,
              annualRate: type === "interest" ? (Number(rate) || 0) / 100 : 0,
              minPayment: Number(minPayment) || 0,
              protectFromGrowth: type === "interest" ? protectFromGrowth : false,
              dueDay: day >= 1 && day <= 31 ? day : null,
              startMonth: startMonth || currentMonthKey(),
              termMonths,
              termStart: termMonths ? termStart || null : null,
            });
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}

function MonthEntryForm({ people, monthKey, onMonthKeyChange, defaults, isExisting, onSave, onCancel, title }) {
  const [amounts, setAmounts] = useState(() => {
    const base = {};
    people.forEach((p) => (base[p] = defaults && defaults[p] != null ? String(defaults[p]) : "0"));
    return base;
  });

  return (
    <div className="fl-panel">
      <p className="fl-panel-title fl-serif">{title}</p>

      <div className="fl-field">
        <label>Month</label>
        <input type="month" value={monthKey} onChange={(e) => onMonthKeyChange(e.target.value)} />
      </div>
      {isExisting && (
        <p className="fl-card-sub" style={{ marginTop: -6, marginBottom: 10 }}>
          This month already has a recorded payment — saving will update it.
        </p>
      )}

      {people.length === 0 && (
        <p className="fl-card-sub" style={{ marginBottom: 10 }}>
          No contributors yet — add people from the People tab first.
        </p>
      )}
      {people.map((p) => (
        <div className="fl-field" key={p}>
          <label>{p}’s contribution (₹)</label>
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

function StrategyBudgetForm({ initialBudget, onSave, onCancel }) {
  const [budget, setBudget] = useState(String(initialBudget || 0));
  return (
    <div className="fl-panel">
      <p className="fl-panel-title fl-serif">Set your monthly budget</p>
      <div className="fl-field">
        <label>Total your family can put toward ALL debts combined, each month (₹)</label>
        <input
          type="number"
          inputMode="decimal"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          placeholder="0"
        />
      </div>
      <div className="fl-form-actions">
        <button className="fl-btn secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="fl-btn" onClick={() => onSave(Number(budget) || 0)}>
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
  const [pendingMonthKey, setPendingMonthKey] = useState(null);
  const [newPerson, setNewPerson] = useState("");
  const [editingBudget, setEditingBudget] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);
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

        const rawLoaded = row && row.payload ? row.payload : defaultData();
        const { data: migrated, changed } = migrateData(rawLoaded);

        setData(migrated);
        lastWrittenJson.current = JSON.stringify(migrated);

        if (!row || !row.payload || changed) {
          const { error: upsertError } = await supabase
            .from("ledger")
            .upsert({ id: LEDGER_ROW_ID, payload: migrated });
          if (upsertError) throw upsertError;
        }
      } catch (e) {
        console.error("load failed", e);
        setConnectionError(true);
        setData(defaultData());
      } finally {
        setLoading(false);
      }
    })();

    const channel = supabase
      .channel("ledger-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ledger", filter: `id=eq.${LEDGER_ROW_ID}` },
        (payload) => {
          const incoming = payload.new && payload.new.payload;
          if (!incoming) return;
          const incomingJson = JSON.stringify(incoming);
          if (incomingJson === lastWrittenJson.current) return;
          const { data: migrated } = migrateData(incoming);
          lastWrittenJson.current = JSON.stringify(migrated);
          setData(migrated);
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
          Couldn’t connect to the shared database. Check that VITE_SUPABASE_URL and
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
  const asOfKey = currentMonthKey();
  const today = new Date();

  const lenderSummaries = lenders.map((l) => {
    const entries = payments[l.id] || {};
    const { rows, finalBalance } = computeSchedule(l, entries, asOfKey);
    const currentRow = rows[rows.length - 1];
    const currentEntry = entries[asOfKey];
    const isOverdue = !!l.dueDay && !currentEntry && today.getDate() > l.dueDay && finalBalance > 0.5;
    const daysUntilDue = l.dueDay ? l.dueDay - today.getDate() : null;
    const isDueSoon =
      !!l.dueDay && !currentEntry && finalBalance > 0.5 && daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 5;
    const isPaidThisMonth = !!currentEntry && !!currentRow && currentRow.totalPaid > 0.5;
    // A past month (before this one) that has no recorded entry at all, from a loan
    // that's still owed and does have a due date to miss — only counted while there
    // was actually a balance outstanding going into that month.
    const missedMonths =
      l.dueDay && finalBalance > 0.5 ? rows.slice(0, -1).filter((r) => !r.recorded && r.opening > 0.5) : [];
    return { ...l, remaining: finalBalance, isOverdue, isDueSoon, daysUntilDue, isPaidThisMonth, missedMonths };
  });

  const totalAmount = lenderSummaries.reduce((s, l) => s + (Number(l.totalAmount) || 0), 0);
  const totalRemaining = lenderSummaries.reduce((s, l) => s + l.remaining, 0);
  const totalPaid = totalAmount - totalRemaining;
  const overallPct = totalAmount > 0 ? Math.min(totalPaid / totalAmount, 1) : 0;

  const strategy = data.strategy || { budget: 0, type: "avalanche" };

  const strategyLoans = lenders
    .map((l) => {
      const entries = payments[l.id] || {};
      const { finalBalance } = computeSchedule(l, entries, asOfKey);
      return {
        id: l.id,
        name: l.name,
        rate: l.type === "fixed" ? 0 : Number(l.annualRate) || 0,
        balance: finalBalance,
        minPayment: Number(l.minPayment) || 0,
        currentPayment: getCurrentPayment(l, entries),
        protectFromGrowth: l.type !== "fixed" && !!l.protectFromGrowth,
      };
    })
    .filter((l) => l.balance > 0.5);

  const strategyResult =
    strategyLoans.length > 0
      ? simulateStrategy(strategyLoans, strategy.type, Number(strategy.budget) || 0)
      : null;
  const statusQuoResult = strategyLoans.length > 0 ? simulateStatusQuo(strategyLoans) : null;

  function updateStrategy(fields) {
    persist({ ...data, strategy: { ...strategy, ...fields } });
    setEditingBudget(false);
  }

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

  function saveMonthEntry(loanId, monthKey, amounts) {
    const existing = payments[loanId] || {};
    const nextEntries = { ...existing, [monthKey]: { amounts } };
    persist({ ...data, payments: { ...payments, [loanId]: nextEntries } });
    setPendingMonthKey(null);
  }

  function deleteMonthEntry(loanId, monthKey) {
    const existing = { ...(payments[loanId] || {}) };
    delete existing[monthKey];
    persist({ ...data, payments: { ...payments, [loanId]: existing } });
  }

  function openLoan(id) {
    setSelectedLoanId(id);
    setPendingMonthKey(null);
    setView("loanDetail");
  }

  const selectedLoan = lenders.find((l) => l.id === selectedLoanId) || null;

  return (
    <div className="fl-shell">
      <style>{styles}</style>
      <svg width="0" height="0" style={{ position: "absolute" }}>
        <defs>
          <filter id="grainLeather" x="-2%" y="-2%" width="104%" height="104%">
            <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="4" seed="11" stitchTiles="stitch" result="n" />
            <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.6 0.6 0.6 0 0" />
          </filter>
          <filter id="grainPaper" x="-2%" y="-2%" width="104%" height="104%">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4" stitchTiles="stitch" result="n" />
            <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.2 0.2 0.2 0 0" />
          </filter>
          <filter id="grainRibbon" x="-2%" y="-2%" width="104%" height="104%">
            <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="3" seed="27" stitchTiles="stitch" result="n" />
            <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.5 0.5 0.5 0 0" />
          </filter>
        </defs>
      </svg>
      <div className="fl-grain fl-grain-paper"></div>

      <div className="fl-topbar fl-leather fl-stitch-bottom">
        <div className="fl-grain fl-grain-leather"></div>
        <div className="fl-topbar-rivets">
          <div className="fl-rivet"></div>
          <div className="fl-rivet"></div>
        </div>
        <div className="fl-z1">
          {view === "loanDetail" && selectedLoan ? (
            <>
              <button className="fl-back-row" onClick={() => setView("loans")}>
                <ChevronLeft size={16} /> Debts
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
      </div>

      <div className="fl-content">
        {view === "dashboard" && (
          <>
            <div className="fl-summary">
              <p className="fl-summary-label">Total remaining across all debts</p>
              <p className="fl-summary-value fl-mono">{fmt(totalRemaining)}</p>
              <div className="fl-progress-track">
                <div className="fl-progress-fill" style={{ width: (overallPct * 100).toFixed(1) + "%" }} />
              </div>
              <p className="fl-card-sub" style={{ marginTop: 8 }}>
                {fmt(totalPaid)} paid of {fmt(totalAmount)}
              </p>
            </div>

            {lenderSummaries.length === 0 && (
              <div className="fl-empty">Nothing added yet. Add one from the Debts tab.</div>
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
                  {(categoryLabel(l.category) ||
                    l.protectFromGrowth ||
                    l.isPaidThisMonth ||
                    l.isOverdue ||
                    l.isDueSoon ||
                    l.missedMonths.length > 0) && (
                    <div className="fl-chip-row">
                      {categoryLabel(l.category) && <span className="fl-chip chip-tag">{categoryLabel(l.category)}</span>}
                      {l.protectFromGrowth && <span className="fl-chip chip-blue">protected</span>}
                      {l.isPaidThisMonth && (
                        <span className="fl-chip chip-green">
                          <Check size={12} /> Paid {monthKeyShort(asOfKey)}
                        </span>
                      )}
                      {l.isOverdue && (
                        <span className="fl-overdue" style={{ marginTop: 0 }}>
                          <AlertCircle size={12} /> Payment overdue for {monthKeyLabel(asOfKey)}
                        </span>
                      )}
                      {l.isDueSoon && (
                        <span className="fl-chip chip-grey">
                          {l.daysUntilDue === 0
                            ? "Due today"
                            : `Due in ${l.daysUntilDue} day${l.daysUntilDue === 1 ? "" : "s"}`}
                        </span>
                      )}
                      {l.missedMonths.length > 0 && (
                        <span className="fl-overdue" style={{ marginTop: 0 }}>
                          <AlertCircle size={12} />{" "}
                          {l.missedMonths.length === 1
                            ? `Missed ${monthKeyShort(l.missedMonths[0].key)}`
                            : `${l.missedMonths.length} months missed`}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {view === "loans" && (
          <>
            <p className="fl-section-title">Your debts &amp; creditors</p>
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
                    <div className="fl-list-row-sub fl-mono">
                      {fmt(l.totalAmount)} ·{" "}
                      {l.type === "fixed" ? "no interest" : `${((l.annualRate || 0) * 100).toFixed(2)}% p.a.`}
                      {l.dueDay ? ` · due on the ${ordinal(l.dueDay)}` : ""}
                    </div>
                    {(categoryLabel(l.category) || l.protectFromGrowth) && (
                      <div className="fl-chip-row" style={{ marginTop: 5 }}>
                        {categoryLabel(l.category) && <span className="fl-chip chip-tag">{categoryLabel(l.category)}</span>}
                        {l.protectFromGrowth && <span className="fl-chip chip-blue">protected</span>}
                      </div>
                    )}
                  </div>
                  <button className="fl-icon-btn" onClick={() => setEditingLoanId(l.id)} aria-label="Edit debt">
                    <Pencil size={16} />
                  </button>
                  <ConfirmButton label="delete debt" onConfirm={() => deleteLoan(l.id)} />
                  <button className="fl-icon-btn" onClick={() => openLoan(l.id)} aria-label="Open debt">
                    <ChevronRight size={16} />
                  </button>
                </div>
              )
            )}

            {showAddLoan ? (
              <LenderForm onCancel={() => setShowAddLoan(false)} onSave={addLoan} />
            ) : (
              <button className="fl-add-row" onClick={() => setShowAddLoan(true)}>
                <Plus size={16} /> Add a debt or creditor
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

        {view === "strategy" && (
          <>
            <p className="fl-section-title">Monthly budget for all debts</p>

            {editingBudget ? (
              <StrategyBudgetForm
                initialBudget={strategy.budget}
                onCancel={() => setEditingBudget(false)}
                onSave={(budget) => updateStrategy({ budget })}
              />
            ) : (
              <div className="fl-summary">
                <div className="fl-card-row">
                  <p className="fl-summary-label">You can put toward debts each month</p>
                  <button className="fl-icon-btn" onClick={() => setEditingBudget(true)} aria-label="Edit budget">
                    <Pencil size={14} />
                  </button>
                </div>
                <p className="fl-summary-value fl-mono">{fmt(strategy.budget)}</p>
              </div>
            )}

            <p className="fl-section-title">Strategy</p>
            <div className="fl-form-actions" style={{ marginBottom: 14 }}>
              <button
                className={"fl-btn" + (strategy.type === "avalanche" ? "" : " secondary")}
                onClick={() => updateStrategy({ type: "avalanche" })}
              >
                Avalanche
              </button>
              <button
                className={"fl-btn" + (strategy.type === "snowball" ? "" : " secondary")}
                onClick={() => updateStrategy({ type: "snowball" })}
              >
                Snowball
              </button>
            </div>
            <p className="fl-card-sub" style={{ marginTop: -8, marginBottom: 16 }}>
              {strategy.type === "avalanche"
                ? "Targets the highest-interest debt first — saves the most money overall."
                : "Targets the smallest balance first — clears individual debts fastest."}
            </p>

            {strategyLoans.length === 0 && (
              <div className="fl-empty">All debts are paid off, or none are set up yet — nothing to plan.</div>
            )}

            {strategyLoans.length > 0 && strategyResult && !strategyResult.feasible && (
              <div className="fl-panel">
                <p className="fl-card-sub">
                  Your budget of {fmt(strategy.budget)} doesn’t cover the minimum payments across your debts.
                  You need at least {fmt(strategyResult.minRequired)}/month before a strategy can be planned.
                </p>
              </div>
            )}

            {strategyLoans.length > 0 && strategyResult && strategyResult.feasible && (
              <>
                <div className="fl-detail-head">
                  <p className="fl-card-sub">With this strategy</p>
                  <div className="fl-detail-grid">
                    <div>
                      <p className="fl-stat-label">Debt-free in</p>
                      <p className="fl-stat-value fl-mono">{monthsLabel(strategyResult.months)}</p>
                    </div>
                    <div>
                      <p className="fl-stat-label">Total interest</p>
                      <p className="fl-stat-value fl-mono" style={{ color: "var(--maroon)" }}>
                        {fmt(strategyResult.totalInterest)}
                      </p>
                    </div>
                  </div>
                  {statusQuoResult && statusQuoResult.stalled.length === 0 && (
                    <p className="fl-card-sub" style={{ marginTop: 10 }}>
                      At your current pace (no reallocation): {monthsLabel(statusQuoResult.months)} and{" "}
                      {fmt(statusQuoResult.totalInterest)} in interest.
                      {statusQuoResult.totalInterest - strategyResult.totalInterest > 1 && (
                        <>
                          {" "}
                          This strategy saves about{" "}
                          <strong>{fmt(statusQuoResult.totalInterest - strategyResult.totalInterest)}</strong> in
                          interest
                          {statusQuoResult.months > strategyResult.months
                            ? ` and gets you debt-free ${statusQuoResult.months - strategyResult.months} months sooner`
                            : ""}
                          .
                        </>
                      )}
                    </p>
                  )}
                  {statusQuoResult && statusQuoResult.stalled.length > 0 && (
                    <p className="fl-card-sub" style={{ marginTop: 10 }}>
                      At least one debt isn’t currently being paid enough to even cover its own interest — it
                      would never be paid off at today’s pace, so this strategy is the meaningful way forward.
                    </p>
                  )}
                </div>

                <p className="fl-section-title">Pay this for {monthKeyLabel(asOfKey)}</p>
                {strategyLoans
                  .slice()
                  .sort((a, b) => (strategyResult.firstMonthPlan[b.id] || 0) - (strategyResult.firstMonthPlan[a.id] || 0))
                  .map((l) => (
                    <div className="fl-list-row" key={l.id}>
                      <div className="fl-list-row-main">
                        <div className="fl-list-row-name">{l.name}</div>
                        <div className="fl-list-row-sub fl-mono">
                          {(l.rate * 100).toFixed(2)}% p.a. · balance {fmt(l.balance)}
                        </div>
                        {l.protectFromGrowth && (
                          <div style={{ marginTop: 5 }}>
                            <span className="fl-chip chip-blue">protected</span>
                          </div>
                        )}
                      </div>
                      <div className="fl-card-balance fl-mono">{fmt(strategyResult.firstMonthPlan[l.id] || 0)}</div>
                    </div>
                  ))}

                <p className="fl-section-title">Payoff order</p>
                {strategyLoans
                  .slice()
                  .sort((a, b) => (strategyResult.payoffMonth[a.id] || 9999) - (strategyResult.payoffMonth[b.id] || 9999))
                  .map((l, i) => (
                    <div className="fl-month-row" key={l.id}>
                      <div className="fl-month-top" style={{ cursor: "default" }}>
                        <span className="fl-month-name">
                          {i + 1}. {l.name}
                        </span>
                        <span className="fl-month-balance fl-mono">{monthsLabel(strategyResult.payoffMonth[l.id])}</span>
                      </div>
                    </div>
                  ))}
              </>
            )}

            <p className="fl-card-sub" style={{ marginTop: 14 }}>
              Set each debt’s minimum monthly payment from its edit form on the Debts tab — leave it at 0 for
              flexible, informal ones, or tick “protect from growing” on a debt that must never be left to pile up
              interest while it waits its turn. This isn’t financial advice tailored to your situation; check things
              like tax benefits or prepayment penalties before making big changes.
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
                const entries = payments[selectedLoan.id] || {};
                const { rows, finalBalance, nextInterest } = computeSchedule(selectedLoan, entries, asOfKey);
                const currentEntry = entries[asOfKey];
                const isOverdue =
                  !!selectedLoan.dueDay && !currentEntry && today.getDate() > selectedLoan.dueDay && finalBalance > 0.5;
                const suggestedMonth = getSuggestedMonth(selectedLoan, entries, asOfKey);

                return (
                  <>
                    <div className="fl-detail-head">
                      <div className="fl-card-row">
                        <span className="fl-card-sub">Total amount borrowed</span>
                        <button className="fl-icon-btn" onClick={() => setEditingLoanId(selectedLoan.id)} aria-label="Edit debt details">
                          <Pencil size={14} />
                        </button>
                      </div>
                      <p className="fl-stat-value fl-mono" style={{ fontSize: 20 }}>{fmt(selectedLoan.totalAmount)}</p>
                      <p className="fl-card-sub" style={{ marginTop: 4 }}>
                        {selectedLoan.type === "fixed"
                          ? "No interest"
                          : `${((selectedLoan.annualRate || 0) * 100).toFixed(2)}% per annum`}
                        {selectedLoan.dueDay ? ` · due on the ${ordinal(selectedLoan.dueDay)}` : ""}
                        {selectedLoan.protectFromGrowth ? " · protected from growing" : ""}
                      </p>
                      {selectedLoan.termMonths ? (
                        <p className="fl-card-sub">{termSummary(selectedLoan, asOfKey)}</p>
                      ) : null}
                      {categoryLabel(selectedLoan.category) && (
                        <div className="fl-chip-row" style={{ marginTop: 6 }}>
                          <span className="fl-chip chip-tag">{categoryLabel(selectedLoan.category)}</span>
                        </div>
                      )}
                      {isOverdue && (
                        <p className="fl-overdue">
                          <AlertCircle size={12} /> Overdue for {monthKeyLabel(asOfKey)}
                        </p>
                      )}

                      <div className="fl-detail-grid">
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
                        {selectedLoan.type !== "fixed" && (
                          <div>
                            <p className="fl-stat-label">Next month’s interest</p>
                            <p className="fl-stat-value fl-mono">{fmt(nextInterest)}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <p className="fl-section-title">Monthly entries</p>

                    {rows.map((row) =>
                      pendingMonthKey === row.key ? (
                        <MonthEntryForm
                          key={row.key}
                          monthKey={row.key}
                          onMonthKeyChange={setPendingMonthKey}
                          defaults={row.amounts}
                          isExisting={row.recorded}
                          people={people}
                          title={(row.recorded ? "Edit " : "Record ") + monthKeyLabel(row.key)}
                          onCancel={() => setPendingMonthKey(null)}
                          onSave={(amounts) => saveMonthEntry(selectedLoan.id, row.key, amounts)}
                        />
                      ) : (
                        <div className="fl-month-row" key={row.key}>
                          <div className="fl-month-top" onClick={() => setPendingMonthKey(row.key)}>
                            <span className="fl-month-name">{monthKeyShort(row.key)}</span>
                            <span className="fl-month-balance fl-mono">{fmt(row.remaining)}</span>
                          </div>
                          <div className="fl-month-breakdown" onClick={() => setPendingMonthKey(row.key)}>
                            {row.recorded
                              ? people.map((p) => `${p} ${fmt(row.amounts[p] || 0)}`).join(" · ") +
                                (selectedLoan.type !== "fixed" ? ` — interest ${fmt(row.interest)}` : "")
                              : selectedLoan.type !== "fixed"
                              ? `No payment recorded — interest ${fmt(row.interest)} added`
                              : "No payment recorded"}
                          </div>
                          {row.recorded && (
                            <div style={{ marginTop: 6 }}>
                              <ConfirmButton
                                label={"delete " + monthKeyShort(row.key) + " entry"}
                                onConfirm={() => deleteMonthEntry(selectedLoan.id, row.key)}
                              />
                            </div>
                          )}
                        </div>
                      )
                    )}

                    {rows.length === 0 && (
                      <p className="fl-card-sub" style={{ marginBottom: 8 }}>
                        No months recorded yet.
                      </p>
                    )}

                    {pendingMonthKey !== null && !rows.some((r) => r.key === pendingMonthKey) && (
                      <MonthEntryForm
                        monthKey={pendingMonthKey}
                        onMonthKeyChange={setPendingMonthKey}
                        defaults={null}
                        isExisting={false}
                        people={people}
                        title={"Record " + monthKeyLabel(pendingMonthKey)}
                        onCancel={() => setPendingMonthKey(null)}
                        onSave={(amounts) => saveMonthEntry(selectedLoan.id, pendingMonthKey, amounts)}
                      />
                    )}

                    {pendingMonthKey === null && (
                      <button className="fl-add-row" onClick={() => setPendingMonthKey(suggestedMonth)}>
                        <Plus size={16} /> Record a payment
                      </button>
                    )}
                  </>
                );
              })()
            )}
          </>
        )}
      </div>

      {toast && <div className="fl-toast">{toast}</div>}

      <div className="fl-bottomnav fl-leather fl-stitch-top">
        <div className="fl-grain fl-grain-leather"></div>
        <div
          className="fl-z1"
          style={{ display: "flex", width: "100%", padding: "4px 6px calc(6px + env(safe-area-inset-bottom, 0px))" }}
        >
          <button
            className={"fl-navbtn " + (view === "dashboard" ? "active" : "")}
            onClick={() => setView("dashboard")}
          >
            <div className="fl-ribbon"><div className="fl-ribbon-grain"></div></div>
            <Home size={16} />
            Dashboard
          </button>
          <button
            className={"fl-navbtn " + (view === "loans" || view === "loanDetail" ? "active" : "")}
            onClick={() => setView("loans")}
          >
            <div className="fl-ribbon"><div className="fl-ribbon-grain"></div></div>
            <Landmark size={16} />
            Debts
          </button>
          <button
            className={"fl-navbtn " + (view === "strategy" ? "active" : "")}
            onClick={() => setView("strategy")}
          >
            <div className="fl-ribbon"><div className="fl-ribbon-grain"></div></div>
            <Target size={16} />
            Strategy
          </button>
          <button
            className={"fl-navbtn " + (view === "people" ? "active" : "")}
            onClick={() => setView("people")}
          >
            <div className="fl-ribbon"><div className="fl-ribbon-grain"></div></div>
            <Users size={16} />
            People
          </button>
        </div>
      </div>
    </div>
  );
}
