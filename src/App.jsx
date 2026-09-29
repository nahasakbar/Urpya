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
  TrendingUp,
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

// Same idea for income sources (see computeIncome).
const INCOME_CATEGORIES = [
  { id: "business", label: "Business" },
  { id: "shop", label: "Shop" },
  { id: "real-estate", label: "Real estate" },
  { id: "rental", label: "Rental" },
  { id: "farm", label: "Farm" },
  { id: "vehicle", label: "Vehicle hire" },
  { id: "other", label: "Other" },
];

function categoryLabel(id, list = CATEGORIES) {
  const c = list.find((c) => c.id === id);
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

// ---- Repayment plans ----
// Some lenders don't quote an interest rate: they hand over an amount, agree a
// larger total to repay, and set a monthly amount that rises over a term. Such
// a debt is saved as a no-interest ("fixed") debt whose totalAmount is the
// total to repay, plus repaymentPlan: { received, amounts }, where amounts[i]
// is what's due in month i of the term (month 0 = termStart, or startMonth if
// unset). The balance is simply total to repay minus payments; paying early
// never shrinks the total.

// Evenly rising amounts: starts at `first` and goes up by the same step each
// month so all `months` payments add up to exactly `total`. Rounded to whole
// rupees, with the last month absorbing the rounding. Null if impossible (bad
// inputs, or it would need a negative payment).
function spreadPlanAmounts(total, first, months) {
  if (!(total > 0) || !(first >= 0) || !(months >= 1)) return null;
  if (months === 1) return [Math.round(total)];
  const step = (total - months * first) / ((months * (months - 1)) / 2);
  const amounts = [];
  for (let i = 0; i < months - 1; i++) amounts.push(Math.round(first + i * step));
  amounts.push(Math.round(total - amounts.reduce((s, v) => s + v, 0)));
  return amounts.some((a) => a < 0) ? null : amounts;
}

// What the plan says is due in a given month (0 outside the plan).
function planDueFor(lender, key) {
  const plan = lender.repaymentPlan;
  if (!plan) return 0;
  const i = monthsBetween(lender.termStart || lender.startMonth, key);
  return i >= 0 && i < plan.amounts.length ? plan.amounts[i] : 0;
}

// What's due each month from `fromKey` to the plan's last month (empty once
// the plan has ended).
function upcomingPlanAmounts(lender, fromKey) {
  const plan = lender.repaymentPlan;
  if (!plan) return [];
  const end = monthKeyAdd(lender.termStart || lender.startMonth, plan.amounts.length - 1);
  const out = [];
  for (let k = fromKey; monthsBetween(k, end) >= 0; k = monthKeyAdd(k, 1)) out.push(planDueFor(lender, k));
  return out;
}

// How far payments trail the plan: everything due before this month minus
// everything paid before it. The current month isn't counted until it's over.
function planShortfall(lender, rows, asOfKey) {
  let due = 0;
  let paid = 0;
  rows.forEach((r) => {
    if (r.key < asOfKey) {
      due += planDueFor(lender, r.key);
      paid += r.totalPaid;
    }
  });
  return Math.max(due - paid, 0);
}

// The yearly interest rate an ordinary loan would need to cost the same, for
// comparing a plan with other debts: the monthly rate at which the payments
// (the first one a month after the money arrives) exactly repay what was
// received, times 12. Display only. Null when the plan charges nothing.
function planYearlyRate(received, amounts) {
  const total = amounts.reduce((s, v) => s + v, 0);
  if (!(received > 0) || total <= received) return null;
  const presentValue = (r) => amounts.reduce((s, p, i) => s + p / Math.pow(1 + r, i + 1), 0);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (presentValue(mid) > received) lo = mid;
    else hi = mid;
  }
  return ((lo + hi) / 2) * 12;
}

// ---- Income sources ----
// A business, property, farm etc. that brings money in. Saved in data.incomes
// as { id, name, category, capital, startMonth, usualIncome, usualExpenses,
// incomeDay, growth }, with actual figures in data.incomeRecords[id]["YYYY-MM"] = {
// income, expenses }. Entirely separate from the debts: nothing here feeds
// into any balance or the Strategy plan.
//
// incomeDay (optional): day of the month the income usually arrives — display only.
//
// growth (optional): { pct, everyMonths, firstMonth } — the usual income rises
// by pct every `everyMonths` (entered in years), first in firstMonth (null = one period after the
// start month). Each rise builds on the last, like interest. Expenses don't rise.

// When a source's first income rise happens.
function firstIncomeRise(source) {
  const g = source.growth;
  return g.firstMonth || monthKeyAdd(source.startMonth || currentMonthKey(), g.everyMonths);
}

function hasIncomeGrowth(source) {
  const g = source.growth;
  return !!g && g.pct > 0 && g.everyMonths >= 1;
}

// The usual income expected in a given month, with any rises applied by then.
function expectedIncomeFor(source, key) {
  const base = Number(source.usualIncome) || 0;
  if (!hasIncomeGrowth(source)) return base;
  const since = monthsBetween(firstIncomeRise(source), key);
  if (since < 0) return base;
  const rises = 1 + Math.floor(since / source.growth.everyMonths);
  return base * Math.pow(1 + source.growth.pct, rises);
}

// "5% every year", "10% every 6 months".
function incomeGrowthLabel(growth) {
  const pct = Math.round(growth.pct * 100 * 100) / 100;
  const m = growth.everyMonths;
  const every =
    m % 12 === 0 ? (m === 12 ? "year" : `${m / 12} years`) : m === 1 ? "month" : `${m} months`;
  return `${pct}% every ${every}`;
}

// The next month (after `asOfKey`) the income rises, and what it rises to.
function nextIncomeRise(source, asOfKey) {
  if (!hasIncomeGrowth(source)) return null;
  const first = firstIncomeRise(source);
  const since = monthsBetween(first, asOfKey);
  const key = since < 0 ? first : monthKeyAdd(first, (Math.floor(since / source.growth.everyMonths) + 1) * source.growth.everyMonths);
  return { key, amount: expectedIncomeFor(source, key) };
}

// Month-by-month figures from the start month to now. Only recorded months
// count toward the totals — a month nobody has recorded yet counts as nothing,
// not as the usual figures.
function computeIncome(source, records, asOfKey) {
  const start = source.startMonth || asOfKey;
  const span = Math.max(monthsBetween(start, asOfKey) + 1, 0);
  const rows = [];
  let totalIncome = 0;
  let totalExpenses = 0;
  for (let i = 0; i < span; i++) {
    const key = monthKeyAdd(start, i);
    const rec = records ? records[key] : null;
    const income = rec ? Number(rec.income) || 0 : 0;
    const expenses = rec ? Number(rec.expenses) || 0 : 0;
    totalIncome += income;
    totalExpenses += expenses;
    rows.push({ key, recorded: !!rec, income, expenses, profit: income - expenses });
  }
  const totalProfit = totalIncome - totalExpenses;
  const capital = Number(source.capital) || 0;
  const usualExpenses = Number(source.usualExpenses) || 0;
  // This month's usual profit (with any income rises applied so far).
  const usualProfit = expectedIncomeFor(source, asOfKey) - usualExpenses;
  const stillToEarnBack = Math.max(capital - totalProfit, 0);
  // Months until the capital is earned back if the usual profit keeps coming
  // in: 0 once it has been (or there's no capital), null if the usual figures
  // never make it back (checked 100 years out).
  let monthsToPayback = 0;
  if (capital > 0 && stillToEarnBack > 0.5) {
    if (!hasIncomeGrowth(source)) {
      monthsToPayback = usualProfit > 0 ? Math.ceil(stillToEarnBack / usualProfit) : null;
    } else {
      let earned = 0;
      let n = 0;
      while (earned < stillToEarnBack - 0.5 && n < 1200) {
        n++;
        earned += expectedIncomeFor(source, monthKeyAdd(asOfKey, n)) - usualExpenses;
      }
      monthsToPayback = earned >= stillToEarnBack - 0.5 ? n : null;
    }
  }
  return {
    rows,
    totalIncome,
    totalExpenses,
    totalProfit,
    capital,
    usualProfit,
    recoveredPct: capital > 0 ? Math.min(Math.max(totalProfit, 0) / capital, 1) : 0,
    stillToEarnBack,
    monthsToPayback,
  };
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
// A loan with a `schedule` (a repayment plan: what's due each month from now
// on) is paid exactly that each month, and whatever's left once it runs out.
// It never gets extra money, since paying a plan early doesn't cut its total.
function simulateStrategy(loans, strategyType, budget, maxMonths = 600) {
  let state = loans.map((l) => ({ ...l }));
  // A "protected" loan's real floor for month 1 is whichever is bigger: its stated
  // minimum, or the interest it's about to accrue on its starting balance — that's
  // what actually stops it from growing, not just its (possibly 0) minPayment.
  // A repayment plan counts at its largest upcoming payment, so a rising plan
  // can't outgrow the budget later on.
  const initialMinSum = state.reduce((s, l) => {
    const floor = l.schedule
      ? Math.min(l.balance, l.schedule.length > 0 ? Math.max(...l.schedule) : l.balance)
      : l.protectFromGrowth
      ? Math.max(l.minPayment || 0, l.balance * (l.rate / 12))
      : l.minPayment || 0;
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
      const floor = l.schedule
        ? month <= l.schedule.length
          ? l.schedule[month - 1]
          : l.balance
        : l.protectFromGrowth
        ? Math.max(l.minPayment || 0, interestThisMonth[l.id] || 0)
        : l.minPayment || 0;
      const pay = Math.min(floor, l.balance, budgetLeft);
      l.balance -= pay;
      budgetLeft -= pay;
      plan[l.id] = (plan[l.id] || 0) + pay;
    });

    const extraTargets = active.filter((l) => !l.schedule);
    const ordered =
      strategyType === "avalanche"
        ? [...extraTargets].sort((a, b) => b.rate - a.rate)
        : [...extraTargets].sort((a, b) => a.balance - b.balance);

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
    if (l.schedule) {
      // A repayment plan is paid as scheduled; anything still owed when it
      // runs out is paid off the month after.
      let bal = l.balance;
      let m = 0;
      while (bal > 0.5 && m < maxMonths) {
        const pay = m < l.schedule.length ? l.schedule[m] : bal;
        m++;
        bal -= Math.min(pay, bal);
      }
      payoffMonth[l.id] = m;
      months = Math.max(months, m);
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

// ---- Debt budget made of parts ----
// strategy.budgetParts (optional) says what the monthly debt budget is made of:
//   { id, kind: "set", label, amount }       a fixed amount (salary, a person's share…)
//   { id, kind: "income", incomeId, share }  a share (0–1) of an income source's usual profit
// The budget is their sum, worked out fresh each time, so an income share follows
// that source's profit (and its yearly rises). With no parts saved, the old single
// strategy.budget is the whole budget, exactly as before. strategy.budget is still
// saved alongside the parts as a snapshot of the total.

const GOAL_EXTRA_LABEL = "Extra for debt-free goal";

// The parts to show and edit: the saved ones, or the old single budget as one set amount.
function budgetPartsOf(strategy) {
  if (Array.isArray(strategy.budgetParts)) return strategy.budgetParts;
  const b = Number(strategy.budget) || 0;
  return b > 0 ? [{ id: "set-base", kind: "set", label: "Set amount", amount: b }] : [];
}

// What one part adds to this month's budget. An income share uses the source's usual
// profit now; a source that hasn't started, makes a loss or no longer exists adds nothing.
function budgetPartAmount(part, incomesById, asOfKey) {
  if (part.kind === "income") {
    const src = incomesById[part.incomeId];
    if (!src || (src.startMonth || asOfKey) > asOfKey) return 0;
    const profit = expectedIncomeFor(src, asOfKey) - (Number(src.usualExpenses) || 0);
    return Math.max(Math.round(profit * (Number(part.share) || 0)), 0);
  }
  return Number(part.amount) || 0;
}

function budgetTotal(parts, incomesById, asOfKey) {
  return parts.reduce((s, p) => s + budgetPartAmount(p, incomesById, asOfKey), 0);
}

// "all of its profit", "half of its profit", "30% of its profit".
function shareLabel(share) {
  if (share >= 1) return "all of its profit";
  if (share === 0.5) return "half of its profit";
  return `${Math.round(share * 1000) / 10}% of its profit`;
}

// The smallest monthly budget (rounded up to the next ₹100) that clears every
// loan within `targetMonths` under the given strategy. Only runs
// simulateStrategy — it doesn't change it. If even paying everything off at
// once can't get there (a repayment plan runs on its own schedule), returns
// { possible: false, soonest } with the soonest achievable month count.
function budgetForTarget(loans, strategyType, targetMonths) {
  const meetsTarget = (budget) => {
    const r = simulateStrategy(loans, strategyType, budget);
    return r.feasible && r.months <= targetMonths;
  };
  // Enough to clear every ordinary loan in month 1 (balance plus that month's
  // interest) while a repayment plan is paid its full remaining balance.
  const everything = Math.ceil(
    loans.reduce((s, l) => s + (l.schedule ? l.balance : l.balance * (1 + l.rate / 12)), 0) + 1
  );
  if (!meetsTarget(everything)) {
    return { possible: false, soonest: simulateStrategy(loans, strategyType, everything).months };
  }
  let lo = 0;
  let hi = everything;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (meetsTarget(mid)) hi = mid;
    else lo = mid;
  }
  const rounded = Math.ceil(hi / 100) * 100;
  return { possible: true, budget: meetsTarget(rounded) ? rounded : hi };
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
  /* Brass "+" (add a debt) in the header's top-right corner. */
  .fl-topbar-add {
    position: absolute;
    top: calc(16px + env(safe-area-inset-top, 0px));
    right: 16px;
    z-index: 2;
    width: 36px;
    height: 36px;
    padding: 0;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #3A2717;
    background: radial-gradient(circle at 35% 30%, var(--brass-light), var(--brass) 60%, #7A5A22 100%);
    border: 1px solid rgba(0,0,0,0.35);
    box-shadow: 0 1px 2px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.35);
    cursor: pointer;
  }
  .fl-topbar-add:active { transform: translateY(1px); }
  .fl-topbar-has-action { padding-right: 48px; }

  /* Full-screen page that slides up over the app (used for adding a debt). */
  .fl-sheet {
    position: absolute;
    inset: 0;
    z-index: 5;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--paper);
    animation: fl-sheet-up 0.22s ease-out;
  }
  @keyframes fl-sheet-up {
    from { transform: translateY(24px); opacity: 0; }
    to { transform: none; opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .fl-sheet { animation: none; }
  }
  .fl-sheet-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: calc(16px + env(safe-area-inset-top, 0px)) 16px 14px 20px;
    z-index: 1;
  }
  .fl-sheet-close {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    padding: 0;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #F3E7D0;
    background: rgba(0,0,0,0.2);
    border: 1px solid rgba(228,197,131,0.45);
    cursor: pointer;
  }
  .fl-sheet-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 16px 16px calc(24px + env(safe-area-inset-bottom, 0px));
    position: relative;
    z-index: 1;
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

  .fl-plan-preview {
    margin-top: 8px;
    padding: 8px 10px;
    border: 1px dashed rgba(176,138,62,0.45);
    border-radius: 8px;
    background: rgba(176,138,62,0.08);
    font-size: 12px;
    line-height: 1.5;
    color: var(--ink);
  }
  .fl-plan-details { margin-top: 10px; font-size: 13px; }
  .fl-plan-details summary {
    cursor: pointer;
    color: var(--ink);
    font-size: 13px;
    padding: 4px 0;
  }
  .fl-plan-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 4px 0;
    border-bottom: 1px dashed var(--line);
  }
  .fl-plan-row input { width: 130px; flex: none; padding: 6px 8px; }

  /* Monthly debt budget: its parts in the editor, and the breakdown on the Strategy card. */
  .fl-budget-part {
    padding: 10px 0;
    border-bottom: 1px dashed var(--line);
  }
  .fl-budget-part input {
    width: 100%;
    padding: 9px 10px;
    border: 1px solid var(--line);
    border-radius: 8px;
    font-size: 14px;
    background: #fff;
    color: var(--ink);
    font-family: inherit;
  }
  .fl-budget-part .fl-term-row input { flex: 1; min-width: 0; width: auto; }
  .fl-budget-part-end { display: inline-flex; align-items: center; gap: 2px; }
  .fl-budget-total {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding-top: 12px;
    font-weight: 700;
    font-size: 15px;
  }
  .fl-budget-breakdown {
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px dashed var(--line);
  }
  .fl-budget-line {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    font-size: 12px;
    color: var(--muted);
    padding: 2px 0;
  }
  .fl-budget-line .fl-mono { color: var(--ink); flex-shrink: 0; }
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
  .fl-stat-edit {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0;
    background: none;
    border: none;
    color: var(--muted);
    font-family: inherit;
    cursor: pointer;
  }
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

// `inSheet`: shown on the full-screen add page, whose header already has the title.
function LenderForm({ initial, onSave, onCancel, inSheet }) {
  const [name, setName] = useState(initial ? initial.name : "");
  const [category, setCategory] = useState(initial && initial.category ? initial.category : null);
  // The interest switch is the loan's `type`: on = "interest", off = "fixed".
  const [type, setType] = useState(initial ? initial.type || "interest" : "fixed");
  const initialPlan = initial && initial.repaymentPlan ? initial.repaymentPlan : null;
  // The top amount is always what was borrowed. On a repayment plan that's the
  // amount received, and the (larger) total to repay is asked for separately.
  const [amount, setAmount] = useState(
    initial ? String(initialPlan ? initialPlan.received : initial.totalAmount) : ""
  );
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
  // Repayment plan: a set total to repay with monthly amounts over the term.
  // planAmounts holds hand-adjusted amounts; null means spread evenly from the
  // first payment.
  const [hasPlan, setHasPlan] = useState(!!initialPlan);
  const [repayTotal, setRepayTotal] = useState(initialPlan ? String(initial.totalAmount) : "");
  const [firstPayment, setFirstPayment] = useState(initialPlan ? String(initialPlan.amounts[0]) : "");
  const [planAmounts, setPlanAmounts] = useState(initialPlan ? initialPlan.amounts.map(String) : null);
  const [planError, setPlanError] = useState("");

  const termMonthsValue = Math.round(termUnit === "years" ? Number(termLength) * 12 : Number(termLength));
  const spread = hasPlan ? spreadPlanAmounts(Number(repayTotal), Number(firstPayment), termMonthsValue) : null;
  const shownAmounts =
    planAmounts && planAmounts.length === termMonthsValue ? planAmounts : spread ? spread.map(String) : null;
  const planNumbers = shownAmounts ? shownAmounts.map((v) => Number(v) || 0) : null;
  const planSum = planNumbers ? planNumbers.reduce((s, v) => s + v, 0) : 0;
  const planMismatch = !!planNumbers && Math.abs(planSum - Number(repayTotal)) > 0.5;
  const planRate = planNumbers && !planMismatch ? planYearlyRate(Number(amount), planNumbers) : null;
  const planFirstKey = termStart || startMonth;

  // Changing what the plan is built from re-spreads it evenly.
  function resetPlan() {
    setPlanAmounts(null);
    setPlanError("");
  }

  function planPreview() {
    if (!planNumbers || planNumbers.length === 0) return null;
    const first = planNumbers[0];
    const last = planNumbers[planNumbers.length - 1];
    let shape;
    if (planNumbers.every((v) => v === first)) shape = `${fmt(first)} every month.`;
    else if (!planAmounts && planNumbers.length > 1) {
      const step = Math.abs(planNumbers[1] - first);
      shape = `${last > first ? "Rises" : "Falls"} by about ${fmt(step)} a month, from ${fmt(first)} to ${fmt(last)}.`;
    } else shape = `From ${fmt(first)} to ${fmt(last)}.`;
    const charge = Number(repayTotal) - Number(amount);
    return (
      <div className="fl-plan-preview">
        {shape}
        {Number(amount) > 0 && charge > 0.5 && (
          <>
            <br />
            Lender’s charge {fmt(charge)}
            {planRate != null ? ` — costs about the same as ${(planRate * 100).toFixed(1)}% a year.` : "."}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="fl-panel">
      {!inSheet && <p className="fl-panel-title fl-serif">{initial ? "Edit debt" : "Add a new debt"}</p>}

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
          onChange={(e) => {
            setAmount(e.target.value);
            setPlanError("");
          }}
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
          <span className="fl-switch-label">Repayment plan</span>
          <Switch
            on={hasPlan}
            onChange={(on) => {
              setHasPlan(on);
              setPlanError("");
              setTermError(false);
            }}
            label="Repayment plan"
          />
        </div>
        <p className="fl-card-sub">
          {hasPlan
            ? "A set total to repay, with monthly amounts over a term — no interest rate."
            : "For lenders who give a total to repay and monthly amounts instead of an interest rate."}
        </p>
      </div>

      {hasPlan && (
        <div className="fl-field">
          <label>Total to repay (₹)</label>
          <input
            type="number"
            inputMode="decimal"
            value={repayTotal}
            onChange={(e) => {
              setRepayTotal(e.target.value);
              resetPlan();
            }}
            placeholder="0"
          />
        </div>
      )}

      {!hasPlan && (
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
      )}

      {!hasPlan && type === "interest" && (
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

      {!hasPlan && type === "interest" && (
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

      {!hasPlan && (
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
      )}

      {(hasTerm || hasPlan) && (
        <>
          <div className="fl-field">
            <label>{hasPlan ? "Repay over" : "Term length"}</label>
            <div className="fl-term-row">
              <input
                type="number"
                inputMode="decimal"
                value={termLength}
                onChange={(e) => {
                  setTermLength(e.target.value);
                  setTermError(false);
                  resetPlan();
                }}
                placeholder={termUnit === "years" ? "e.g. 2" : "e.g. 24"}
              />
              {["months", "years"].map((u) => (
                <button
                  key={u}
                  type="button"
                  className={"fl-tag-option" + (termUnit === u ? " selected" : "")}
                  aria-pressed={termUnit === u}
                  onClick={() => {
                    setTermUnit(u);
                    resetPlan();
                  }}
                >
                  {u === "months" ? "Months" : "Years"}
                </button>
              ))}
            </div>
            {termError && (
              <p className="fl-overdue">
                <AlertCircle size={12} /> Enter how long the term is{hasPlan ? "." : ", or turn Payment term off."}
              </p>
            )}
          </div>

          <div className="fl-field">
            <label>{hasPlan ? "First payment month" : "Term started"}</label>
            <input type="month" value={termStart || startMonth} onChange={(e) => setTermStart(e.target.value)} />
            <p className="fl-card-sub">
              {hasPlan
                ? "The month the first payment is due. Same as “Started tracking from” unless you change it."
                : "Same as “Started tracking from” unless you change it — e.g. if the debt began before you started tracking it here."}
            </p>
          </div>
        </>
      )}

      {hasPlan && (
        <div className="fl-field">
          <label>First month’s payment (₹)</label>
          <input
            type="number"
            inputMode="decimal"
            value={firstPayment}
            onChange={(e) => {
              setFirstPayment(e.target.value);
              resetPlan();
            }}
            placeholder="e.g. 15000"
          />
          <p className="fl-card-sub">
            The app spreads the rest evenly so every month adds up to the total to repay. You can adjust any month
            below.
          </p>
          {planPreview()}
          {shownAmounts && (
            <details className="fl-plan-details">
              <summary>See or adjust each month’s amount</summary>
              {shownAmounts.map((v, i) => (
                <div className="fl-plan-row" key={i}>
                  <span>{monthKeyShort(monthKeyAdd(planFirstKey, i))}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={v}
                    onChange={(e) => {
                      const next = [...shownAmounts];
                      next[i] = e.target.value;
                      setPlanAmounts(next);
                      setPlanError("");
                    }}
                  />
                </div>
              ))}
              <p className="fl-card-sub" style={{ marginTop: 8 }}>
                Adds up to {fmt(planSum)}
                {planMismatch
                  ? ` — ${fmt(Math.abs(planSum - Number(repayTotal)))} ${planSum > Number(repayTotal) ? "more" : "less"} than the total to repay.`
                  : " ✓"}
              </p>
              {planAmounts && (
                <button type="button" className="fl-btn secondary" style={{ marginTop: 6 }} onClick={resetPlan}>
                  Spread evenly again
                </button>
              )}
            </details>
          )}
          {planError && (
            <p className="fl-overdue">
              <AlertCircle size={12} /> {planError}
            </p>
          )}
        </div>
      )}

      {!hasPlan && (
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
      )}

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
            const day = Number(dueDay);
            const common = {
              name: name.trim(),
              category,
              totalAmount: Number(amount) || 0,
              dueDay: day >= 1 && day <= 31 ? day : null,
              startMonth: startMonth || currentMonthKey(),
            };

            if (hasPlan) {
              if (!(termMonthsValue >= 1)) {
                setTermError(true);
                return;
              }
              if (!(Number(amount) > 0)) return setPlanError("Enter the amount you borrowed at the top.");
              if (!(Number(repayTotal) > 0)) return setPlanError("Enter the total you have to repay.");
              if (!planAmounts && !(Number(firstPayment) > 0)) return setPlanError("Enter the first month’s payment.");
              if (!planNumbers)
                return setPlanError("That first payment is too big to spread over this term — check the amounts.");
              if (shownAmounts.some((v) => !(Number(v) >= 0) || v === ""))
                return setPlanError("Every month needs an amount (0 or more).");
              if (planMismatch)
                return setPlanError("The monthly amounts must add up to the total to repay — adjust them or spread evenly again.");
              onSave({
                ...common,
                totalAmount: Number(repayTotal),
                type: "fixed",
                annualRate: 0,
                minPayment: planNumbers[0],
                protectFromGrowth: false,
                termMonths: termMonthsValue,
                termStart: termStart || null,
                repaymentPlan: { received: Number(amount), amounts: planNumbers },
              });
              return;
            }

            let termMonths = null;
            if (hasTerm) {
              termMonths = termMonthsValue;
              if (!(termMonths >= 1)) {
                setTermError(true);
                return;
              }
            }
            onSave({
              ...common,
              type,
              annualRate: type === "interest" ? (Number(rate) || 0) / 100 : 0,
              minPayment: Number(minPayment) || 0,
              protectFromGrowth: type === "interest" ? protectFromGrowth : false,
              termMonths,
              termStart: termMonths ? termStart || null : null,
              repaymentPlan: null,
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

// Builds the monthly debt budget from set amounts and shares of income profit.
function BudgetEditor({ initialParts, incomes, people, asOfKey, onSave, onCancel }) {
  const [parts, setParts] = useState(() =>
    initialParts.map((p) =>
      p.kind === "income"
        ? {
            ...p,
            mode: p.share >= 1 ? "full" : p.share === 0.5 ? "half" : "custom",
            pctText: String(Math.round(p.share * 1000) / 10),
          }
        : { ...p, amountText: String(p.amount) }
    )
  );
  const [error, setError] = useState("");
  const incomesById = Object.fromEntries(incomes.map((s) => [s.id, s]));

  // The share each income row stands for right now, from its Full / Half / Custom choice.
  const shareOf = (p) => (p.mode === "full" ? 1 : p.mode === "half" ? 0.5 : Math.min(Number(p.pctText) || 0, 100) / 100);
  const clean = parts.map((p) =>
    p.kind === "income"
      ? { id: p.id, kind: "income", incomeId: p.incomeId, share: shareOf(p) }
      : { id: p.id, kind: "set", label: (p.label || "").trim() || "Set amount", amount: Number(p.amountText) || 0 }
  );
  const total = budgetTotal(clean, incomesById, asOfKey);
  const usedIncomeIds = new Set(parts.filter((p) => p.kind === "income").map((p) => p.incomeId));
  const usedLabels = new Set(parts.filter((p) => p.kind === "set").map((p) => (p.label || "").trim()));

  function update(i, fields) {
    setParts(parts.map((p, j) => (j === i ? { ...p, ...fields } : p)));
    setError("");
  }
  function remove(i) {
    setParts(parts.filter((_, j) => j !== i));
  }

  return (
    <>
      <div className="fl-panel">
        <p className="fl-card-sub" style={{ marginTop: 0, marginBottom: 10 }}>
          Your monthly debt budget is the total of these. A share of an income source follows its usual profit, so it
          goes up when the income does.
        </p>
        {parts.length === 0 && <p className="fl-card-sub">Nothing in the budget yet — add something below.</p>}

        {parts.map((p, i) => {
          if (p.kind === "income") {
            const src = incomesById[p.incomeId];
            const profit = src ? expectedIncomeFor(src, asOfKey) - (Number(src.usualExpenses) || 0) : 0;
            return (
              <div className="fl-budget-part" key={p.id}>
                <div className="fl-card-row">
                  <span className="fl-list-row-name">{src ? src.name : "Removed income source"}</span>
                  <span className="fl-budget-part-end">
                    <span className="fl-mono">{fmt(budgetPartAmount(clean[i], incomesById, asOfKey))}</span>
                    <button className="fl-icon-btn" onClick={() => remove(i)} aria-label="Remove from budget">
                      <X size={16} />
                    </button>
                  </span>
                </div>
                <p className="fl-card-sub" style={{ margin: "0 0 6px" }}>
                  {profit > 0 ? `Usual profit ${fmt(profit)} a month` : "Makes no profit right now — adds nothing"}
                </p>
                <div className="fl-tag-picker">
                  {[
                    ["full", "Full"],
                    ["half", "Half"],
                    ["custom", "Custom %"],
                  ].map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      className={"fl-tag-option" + (p.mode === mode ? " selected" : "")}
                      aria-pressed={p.mode === mode}
                      onClick={() => update(i, { mode })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {p.mode === "custom" && (
                  <div className="fl-term-row" style={{ marginTop: 8 }}>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={p.pctText}
                      onChange={(e) => update(i, { pctText: e.target.value })}
                      placeholder="e.g. 30"
                    />
                    <span className="fl-card-sub" style={{ flexShrink: 0 }}>% of its profit</span>
                  </div>
                )}
              </div>
            );
          }
          return (
            <div className="fl-budget-part" key={p.id}>
              <div className="fl-term-row">
                <input
                  value={p.label || ""}
                  onChange={(e) => update(i, { label: e.target.value })}
                  placeholder="Name, e.g. Salary"
                />
                <button className="fl-icon-btn" onClick={() => remove(i)} aria-label="Remove from budget">
                  <X size={16} />
                </button>
              </div>
              <input
                type="number"
                inputMode="decimal"
                value={p.amountText}
                onChange={(e) => update(i, { amountText: e.target.value })}
                placeholder="Amount each month (₹)"
                style={{ marginTop: 8 }}
              />
            </div>
          );
        })}

        <div className="fl-budget-total">
          <span>Total each month</span>
          <span className="fl-mono">{fmt(total)}</span>
        </div>
      </div>

      <div className="fl-panel">
      <p className="fl-panel-title fl-serif">Add to the budget</p>
      {incomes.length > 0 && (
        <div className="fl-field">
          <label>A share of an income source</label>
          <div className="fl-tag-picker">
            {incomes
              .filter((s) => !usedIncomeIds.has(s.id))
              .map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="fl-tag-option"
                  onClick={() =>
                    setParts([...parts, { id: uid("bp"), kind: "income", incomeId: s.id, mode: "full", pctText: "100" }])
                  }
                >
                  + {s.name}
                </button>
              ))}
            {incomes.every((s) => usedIncomeIds.has(s.id)) && (
              <p className="fl-card-sub" style={{ margin: 0 }}>All your income sources are already in the budget.</p>
            )}
          </div>
        </div>
      )}
      <div className="fl-field">
        <label>A set amount each month</label>
        <div className="fl-tag-picker">
          {people
            .filter((name) => !usedLabels.has(name))
            .map((name) => (
              <button
                key={name}
                type="button"
                className="fl-tag-option"
                onClick={() => setParts([...parts, { id: uid("bp"), kind: "set", label: name, amountText: "" }])}
              >
                + {name}
              </button>
            ))}
          <button
            type="button"
            className="fl-tag-option"
            onClick={() => setParts([...parts, { id: uid("bp"), kind: "set", label: "", amountText: "" }])}
          >
            + Other amount
          </button>
        </div>
      </div>
      </div>

      {error && (
        <p className="fl-overdue" style={{ marginBottom: 10 }}>
          <AlertCircle size={12} /> {error}
        </p>
      )}
      <div className="fl-form-actions">
        <button className="fl-btn secondary" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="fl-btn"
          onClick={() => {
            const badPct = parts.find((p) => p.kind === "income" && p.mode === "custom" && !(Number(p.pctText) > 0 && Number(p.pctText) <= 100));
            if (badPct) return setError("Enter a custom % between 1 and 100, or pick Full or Half.");
            if (parts.some((p) => p.kind === "set" && Number(p.amountText) < 0)) return setError("Amounts can’t be negative.");
            // A set amount left empty or at 0 is dropped rather than saved.
            onSave(clean.filter((p) => p.kind === "income" || p.amount > 0));
          }}
        >
          Save
        </button>
      </div>
    </>
  );
}

function DebtFreeGoalForm({ initialMonths, onSave, onCancel, onRemove }) {
  const [unit, setUnit] = useState(initialMonths && initialMonths % 12 === 0 ? "years" : "months");
  const [length, setLength] = useState(
    initialMonths ? String(initialMonths % 12 === 0 ? initialMonths / 12 : initialMonths) : ""
  );
  const months = Math.round(unit === "years" ? Number(length) * 12 : Number(length));

  return (
    <div className="fl-panel">
      <p className="fl-panel-title fl-serif">When do you want to be debt-free?</p>
      <div className="fl-field">
        <label>Debt-free in</label>
        <div className="fl-term-row">
          <input
            type="number"
            inputMode="decimal"
            value={length}
            onChange={(e) => setLength(e.target.value)}
            placeholder={unit === "years" ? "e.g. 3" : "e.g. 36"}
          />
          {["months", "years"].map((u) => (
            <button
              key={u}
              type="button"
              className={"fl-tag-option" + (unit === u ? " selected" : "")}
              aria-pressed={unit === u}
              onClick={() => setUnit(u)}
            >
              {u === "months" ? "Months" : "Years"}
            </button>
          ))}
        </div>
        {months >= 1 && (
          <p className="fl-card-sub" style={{ marginTop: 6 }}>
            That’s by {monthKeyLabel(monthKeyAdd(currentMonthKey(), months - 1))}.
          </p>
        )}
      </div>
      <div className="fl-form-actions">
        {onRemove && (
          <button className="fl-btn secondary" onClick={onRemove}>
            Remove goal
          </button>
        )}
        <button className="fl-btn secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="fl-btn" onClick={() => months >= 1 && onSave(months)}>
          Save
        </button>
      </div>
    </div>
  );
}

// Full-screen page that slides up over the app, with its own header and close button.
function Sheet({ title, onClose, children }) {
  return (
    <div className="fl-sheet" role="dialog" aria-modal="true" aria-label={title}>
      <div className="fl-grain fl-grain-paper"></div>
      <div className="fl-sheet-head fl-leather fl-stitch-bottom">
        <div className="fl-grain fl-grain-leather"></div>
        <h2 className="fl-title fl-serif fl-z1">{title}</h2>
        <button className="fl-sheet-close fl-z1" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
      </div>
      <div className="fl-sheet-body">{children}</div>
    </div>
  );
}

function IncomeForm({ initial, onSave, onCancel, inSheet }) {
  const [name, setName] = useState(initial ? initial.name : "");
  const [category, setCategory] = useState(initial && initial.category ? initial.category : null);
  const [capital, setCapital] = useState(initial ? String(initial.capital || 0) : "");
  const [usualIncome, setUsualIncome] = useState(initial ? String(initial.usualIncome || 0) : "");
  const [usualExpenses, setUsualExpenses] = useState(initial ? String(initial.usualExpenses || 0) : "");
  const [startMonth, setStartMonth] = useState(initial && initial.startMonth ? initial.startMonth : currentMonthKey());
  const [incomeDay, setIncomeDay] = useState(initial && initial.incomeDay ? String(initial.incomeDay) : "");
  // Income increases: saved as { pct, everyMonths, firstMonth }, entered in years.
  const initialGrowth = initial && hasIncomeGrowth(initial) ? initial.growth : null;
  const [hasGrowth, setHasGrowth] = useState(!!initialGrowth);
  const [growthPct, setGrowthPct] = useState(initialGrowth ? String(Math.round(initialGrowth.pct * 100 * 1e6) / 1e6) : "");
  const [growthEvery, setGrowthEvery] = useState(
    initialGrowth ? String(Math.round((initialGrowth.everyMonths / 12) * 100) / 100) : "1"
  );
  // Left empty, the first increase comes one period after the start month.
  const [growthFirst, setGrowthFirst] = useState(initialGrowth && initialGrowth.firstMonth ? initialGrowth.firstMonth : "");
  const [growthError, setGrowthError] = useState(false);
  const cap = Number(capital) || 0;
  const growthEveryMonths = Math.round(Number(growthEvery) * 12);
  const growthEveryText = Number(growthEvery) > 0 && Number(growthEvery) !== 1 ? `${Number(growthEvery)} years` : "A year";
  const growth =
    hasGrowth && Number(growthPct) > 0 && growthEveryMonths >= 1
      ? { pct: Number(growthPct) / 100, everyMonths: growthEveryMonths, firstMonth: growthFirst || null }
      : null;
  // The source as it would be saved, for the live preview.
  const draft = {
    capital: cap,
    startMonth: startMonth || currentMonthKey(),
    usualIncome: Number(usualIncome) || 0,
    usualExpenses: Number(usualExpenses) || 0,
    growth,
  };
  const draftStats = computeIncome(draft, {}, draft.startMonth);
  const usualProfit = draftStats.usualProfit;
  const firstRise = growth ? nextIncomeRise(draft, draft.startMonth) : null;
  const secondRise = firstRise ? nextIncomeRise(draft, firstRise.key) : null;

  return (
    <div className="fl-panel">
      {!inSheet && <p className="fl-panel-title fl-serif">{initial ? "Edit income source" : "Add an income source"}</p>}

      <div className="fl-field">
        <label>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kochi shop, Aluva flat" />
      </div>

      <div className="fl-field">
        <label>Type — optional</label>
        <div className="fl-tag-picker">
          {INCOME_CATEGORIES.map((c) => (
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
        <label>Capital put in (₹) — leave 0 if none</label>
        <input type="number" inputMode="decimal" value={capital} onChange={(e) => setCapital(e.target.value)} placeholder="0" />
      </div>

      <div className="fl-field">
        <label>Usual monthly income (₹)</label>
        <input
          type="number"
          inputMode="decimal"
          value={usualIncome}
          onChange={(e) => setUsualIncome(e.target.value)}
          placeholder="0"
        />
      </div>

      <div className="fl-field">
        <label>Income comes in on (day of month) — optional</label>
        <input
          type="number"
          inputMode="numeric"
          min="1"
          max="31"
          value={incomeDay}
          onChange={(e) => setIncomeDay(e.target.value)}
          placeholder="e.g. 5"
        />
      </div>

      <div className="fl-field">
        <div className="fl-switch-row">
          <span className="fl-switch-label">Income increases</span>
          <Switch
            on={hasGrowth}
            onChange={(on) => {
              setHasGrowth(on);
              setGrowthError(false);
            }}
            label="Income increases"
          />
        </div>
        <p className="fl-card-sub">
          {hasGrowth
            ? "The usual income goes up by a set % at regular times — each rise builds on the last, like interest."
            : "For income that goes up over time, like rent that rises every year."}
        </p>
      </div>

      {hasGrowth && (
        <>
          <div className="fl-field">
            <label>Increase (%)</label>
            <input
              type="number"
              inputMode="decimal"
              value={growthPct}
              onChange={(e) => {
                setGrowthPct(e.target.value);
                setGrowthError(false);
              }}
              placeholder="e.g. 5"
            />
          </div>
          <div className="fl-field">
            <label>Every (years)</label>
            <input
              type="number"
              inputMode="decimal"
              value={growthEvery}
              onChange={(e) => {
                setGrowthEvery(e.target.value);
                setGrowthError(false);
              }}
              placeholder="e.g. 1"
            />
          </div>
          <div className="fl-field">
            <label>First increase</label>
            <input
              type="month"
              value={growthFirst || (growthEveryMonths >= 1 ? monthKeyAdd(draft.startMonth, growthEveryMonths) : "")}
              onChange={(e) => setGrowthFirst(e.target.value)}
            />
            <p className="fl-card-sub">{growthEveryText} after it started, unless you change it.</p>
            {growthError && (
              <p className="fl-overdue">
                <AlertCircle size={12} /> Enter the increase % and every how many years, or turn Income increases off.
              </p>
            )}
          </div>
        </>
      )}

      <div className="fl-field">
        <label>Usual monthly expenses (₹)</label>
        <input
          type="number"
          inputMode="decimal"
          value={usualExpenses}
          onChange={(e) => setUsualExpenses(e.target.value)}
          placeholder="0"
        />
        {(Number(usualIncome) > 0 || Number(usualExpenses) > 0) && (
          <div className="fl-plan-preview">
            {usualProfit >= 0 ? `Usual profit ${fmt(usualProfit)} a month` : `Usually a loss of ${fmt(-usualProfit)} a month`}
            {cap > 0 && draftStats.monthsToPayback > 0
              ? ` — earns back the capital in about ${monthsLabel(draftStats.monthsToPayback)}.`
              : "."}
            {firstRise && (
              <>
                <br />
                Income rises to {fmt(firstRise.amount)} from {monthKeyShort(firstRise.key)}
                {secondRise ? `, then ${fmt(secondRise.amount)} from ${monthKeyShort(secondRise.key)}` : ""}.
              </>
            )}
          </div>
        )}
      </div>

      <div className="fl-field">
        <label>Started (or started tracking) from</label>
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
            if (hasGrowth && !growth) {
              setGrowthError(true);
              return;
            }
            onSave({
              name: name.trim(),
              category,
              capital: cap,
              usualIncome: Number(usualIncome) || 0,
              usualExpenses: Number(usualExpenses) || 0,
              startMonth: startMonth || currentMonthKey(),
              incomeDay: Number.isInteger(Number(incomeDay)) && Number(incomeDay) >= 1 && Number(incomeDay) <= 31 ? Number(incomeDay) : null,
              growth,
            });
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}

function IncomeMonthForm({ monthKey, onMonthKeyChange, defaults, isExisting, onSave, onCancel, title }) {
  const [income, setIncome] = useState(String(defaults.income || 0));
  const [expenses, setExpenses] = useState(String(defaults.expenses || 0));
  const profit = (Number(income) || 0) - (Number(expenses) || 0);

  return (
    <div className="fl-panel">
      <p className="fl-panel-title fl-serif">{title}</p>

      <div className="fl-field">
        <label>Month</label>
        <input type="month" value={monthKey} onChange={(e) => onMonthKeyChange(e.target.value)} />
      </div>
      {isExisting && (
        <p className="fl-card-sub" style={{ marginTop: -6, marginBottom: 10 }}>
          This month already has figures recorded — saving will update them.
        </p>
      )}

      <div className="fl-field">
        <label>Income (₹)</label>
        <input type="number" inputMode="decimal" value={income} onChange={(e) => setIncome(e.target.value)} />
      </div>
      <div className="fl-field">
        <label>Expenses (₹)</label>
        <input type="number" inputMode="decimal" value={expenses} onChange={(e) => setExpenses(e.target.value)} />
        <p className="fl-card-sub" style={{ marginTop: 6, color: profit < 0 ? "var(--maroon)" : "var(--forest)" }}>
          {profit < 0 ? `Loss ${fmt(-profit)}` : `Profit ${fmt(profit)}`}
        </p>
      </div>

      <div className="fl-form-actions">
        <button className="fl-btn secondary" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="fl-btn"
          onClick={() => onSave({ income: Number(income) || 0, expenses: Number(expenses) || 0 })}
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
  const [pendingMonthKey, setPendingMonthKey] = useState(null);
  const [selectedIncomeId, setSelectedIncomeId] = useState(null);
  const [showAddIncome, setShowAddIncome] = useState(false);
  const [editingIncomeId, setEditingIncomeId] = useState(null);
  const [pendingIncomeMonth, setPendingIncomeMonth] = useState(null);
  const [newPerson, setNewPerson] = useState("");
  const [showBudgetEditor, setShowBudgetEditor] = useState(false);
  const [editingGoal, setEditingGoal] = useState(false);
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
    // On a repayment plan, only a month with something due can be due, paid or overdue.
    const plan = !!l.repaymentPlan;
    const dueThisMonth = plan ? planDueFor(l, asOfKey) : 0;
    const paidThisMonth = currentEntry && currentRow ? currentRow.totalPaid : 0;
    const somethingDue = !plan || dueThisMonth > 0;
    const isOverdue = !!l.dueDay && !currentEntry && today.getDate() > l.dueDay && finalBalance > 0.5 && somethingDue;
    const daysUntilDue = l.dueDay ? l.dueDay - today.getDate() : null;
    const isDueSoon =
      !!l.dueDay &&
      !currentEntry &&
      finalBalance > 0.5 &&
      daysUntilDue !== null &&
      daysUntilDue >= 0 &&
      daysUntilDue <= 5 &&
      somethingDue;
    const isPaidThisMonth =
      !!currentEntry && !!currentRow && currentRow.totalPaid > 0.5 && (!plan || paidThisMonth >= dueThisMonth - 0.5);
    // Recorded this month, but for less than the plan says is due.
    const shortThisMonth =
      plan && currentEntry && dueThisMonth > 0 && paidThisMonth < dueThisMonth - 0.5 ? dueThisMonth - paidThisMonth : 0;
    // A past month (before this one) that has no recorded entry at all, from a loan
    // that's still owed and does have a due date to miss — only counted while there
    // was actually a balance outstanding going into that month. A repayment plan
    // reports how far behind it is instead (which also covers part-paid months).
    const missedMonths =
      !plan && l.dueDay && finalBalance > 0.5 ? rows.slice(0, -1).filter((r) => !r.recorded && r.opening > 0.5) : [];
    const behindPlan = plan && finalBalance > 0.5 ? planShortfall(l, rows, asOfKey) : 0;
    return {
      ...l,
      remaining: finalBalance,
      isOverdue,
      isDueSoon,
      daysUntilDue,
      isPaidThisMonth,
      missedMonths,
      dueThisMonth,
      shortThisMonth,
      behindPlan,
      interestThisMonth: currentRow ? currentRow.interest : 0,
    };
  });

  const totalAmount = lenderSummaries.reduce((s, l) => s + (Number(l.totalAmount) || 0), 0);
  const totalRemaining = lenderSummaries.reduce((s, l) => s + l.remaining, 0);
  const totalPaid = totalAmount - totalRemaining;
  // Kept between 0 and 1: when interest has grown balances past the amounts
  // borrowed, "paid" goes negative, and a negative width drew the bar as full.
  const overallPct = totalAmount > 0 ? Math.max(Math.min(totalPaid / totalAmount, 1), 0) : 0;

  // Income sources: kept apart from the debts, and never part of their maths.
  const incomes = data.incomes || [];
  const incomeRecords = data.incomeRecords || {};
  const incomeSummaries = incomes.map((s) => ({ ...s, stats: computeIncome(s, incomeRecords[s.id], asOfKey) }));
  const selectedIncome = incomeSummaries.find((s) => s.id === selectedIncomeId) || null;
  const activeIncomes = incomeSummaries.filter((s) => (s.startMonth || asOfKey) <= asOfKey);
  const recordedThisMonth = activeIncomes.filter((s) => incomeRecords[s.id] && incomeRecords[s.id][asOfKey]);
  const profitThisMonth = recordedThisMonth.reduce((sum, s) => {
    const r = incomeRecords[s.id][asOfKey];
    return sum + ((Number(r.income) || 0) - (Number(r.expenses) || 0));
  }, 0);
  const usualProfitTotal = activeIncomes.reduce((sum, s) => sum + s.stats.usualProfit, 0);
  // Combined figures for the summary card at the top of the Income tab.
  const usualIncomeTotal = activeIncomes.reduce((sum, s) => sum + expectedIncomeFor(s, asOfKey), 0);
  const usualExpensesTotal = activeIncomes.reduce((sum, s) => sum + (Number(s.usualExpenses) || 0), 0);
  const incomeCapital = incomeSummaries.reduce((sum, s) => sum + s.stats.capital, 0);
  const incomeEarnedBack = incomeSummaries.reduce(
    (sum, s) => sum + Math.min(Math.max(s.stats.totalProfit, 0), s.stats.capital),
    0
  );
  const incomeProfitSoFar = incomeSummaries.reduce((sum, s) => sum + s.stats.totalProfit, 0);
  const signedFmt = (v) => (v < 0 ? "−" + fmt(-v) : fmt(v));

  const strategy = data.strategy || { budget: 0, type: "avalanche" };
  // The monthly debt budget: the old single amount, or the total of its parts
  // (set amounts plus shares of income profit, worked out for this month).
  const incomesById = Object.fromEntries(incomes.map((s) => [s.id, s]));
  const budgetParts = budgetPartsOf(strategy);
  const effectiveBudget = budgetTotal(budgetParts, incomesById, asOfKey);
  // How much of each income source goes toward debts, for the Income screens.
  const toDebtsByIncome = {};
  budgetParts.forEach((p) => {
    if (p.kind !== "income") return;
    const amount = budgetPartAmount(p, incomesById, asOfKey);
    const prev = toDebtsByIncome[p.incomeId];
    toDebtsByIncome[p.incomeId] = { amount: (prev ? prev.amount : 0) + amount, share: (prev ? prev.share : 0) + p.share };
  });
  const incomeToDebts = Object.values(toDebtsByIncome).reduce((sum, t) => sum + t.amount, 0);

  const strategyLoans = lenders
    .map((l) => {
      const entries = payments[l.id] || {};
      const { rows, finalBalance } = computeSchedule(l, entries, asOfKey);
      // A repayment plan's schedule starts with this month's due, less anything
      // already paid toward it (its balance already reflects that payment).
      let schedule = null;
      if (l.repaymentPlan) {
        schedule = upcomingPlanAmounts(l, asOfKey);
        const currentRow = rows[rows.length - 1];
        if (schedule.length > 0 && entries[asOfKey] && currentRow) {
          schedule[0] = Math.max(schedule[0] - currentRow.totalPaid, 0);
        }
      }
      return {
        id: l.id,
        name: l.name,
        rate: l.type === "fixed" ? 0 : Number(l.annualRate) || 0,
        balance: finalBalance,
        minPayment: Number(l.minPayment) || 0,
        currentPayment: getCurrentPayment(l, entries),
        protectFromGrowth: l.type !== "fixed" && !!l.protectFromGrowth,
        schedule,
      };
    })
    .filter((l) => l.balance > 0.5);

  const strategyResult =
    strategyLoans.length > 0
      ? simulateStrategy(strategyLoans, strategy.type, effectiveBudget)
      : null;
  const statusQuoResult = strategyLoans.length > 0 ? simulateStatusQuo(strategyLoans) : null;

  // What a debt asks for this month, for the Dashboard's "due" tags: a repayment
  // plan's scheduled amount, else its minimum (a protected debt's is at least this
  // month's interest). A flexible debt has no required amount, so it shows the
  // Strategy plan's suggestion instead, labelled as such. Never more than is owed.
  function payableThisMonth(l) {
    const capped = (amount, fromPlan) => ({ amount: Math.min(amount, l.remaining), fromPlan });
    if (l.repaymentPlan) return capped(l.dueThisMonth, false);
    const min = Number(l.minPayment) || 0;
    const required = l.protectFromGrowth ? Math.max(min, l.interestThisMonth) : min;
    if (required > 0.5) return capped(required, false);
    const planned = strategyResult && strategyResult.feasible ? strategyResult.firstMonthPlan[l.id] || 0 : 0;
    return planned > 0.5 ? capped(planned, true) : null;
  }
  // Debt-free goal: the monthly budget needed to clear everything by then.
  const goalMonths = strategy.targetMonths || null;
  const goalResult =
    goalMonths && strategyLoans.length > 0 ? budgetForTarget(strategyLoans, strategy.type, goalMonths) : null;
  const byMonth = (months) => monthKeyShort(monthKeyAdd(asOfKey, months - 1));
  const goalBlock =
    strategyLoans.length === 0 ? null : editingGoal ? (
      <DebtFreeGoalForm
        initialMonths={goalMonths || (strategyResult && strategyResult.feasible ? strategyResult.months : null)}
        onCancel={() => setEditingGoal(false)}
        onSave={(months) => updateStrategy({ targetMonths: months })}
        onRemove={goalMonths ? () => updateStrategy({ targetMonths: null }) : null}
      />
    ) : goalResult ? (
      <div className="fl-summary">
        <div className="fl-card-row">
          <p className="fl-summary-label">
            Goal: debt-free in {monthsLabel(goalMonths)} (by {byMonth(goalMonths)})
          </p>
          <button className="fl-icon-btn" onClick={() => setEditingGoal(true)} aria-label="Edit debt-free goal">
            <Pencil size={14} />
          </button>
        </div>
        {goalResult.possible ? (
          <>
            <p className="fl-summary-value fl-mono" style={{ fontSize: 22 }}>
              {fmt(goalResult.budget)} a month
            </p>
            <p className="fl-card-sub" style={{ marginTop: 4 }}>
              {goalResult.budget > effectiveBudget + 0.5
                ? `Put this toward debts each month — ${fmt(goalResult.budget - effectiveBudget)} more than your budget of ${fmt(effectiveBudget)}.`
                : goalResult.budget < effectiveBudget - 0.5
                ? `Your budget of ${fmt(effectiveBudget)} already gets you there — this is the least that would.`
                : "That’s exactly your budget now."}
            </p>
            {goalResult.budget > effectiveBudget + 0.5 && (
              <button
                className="fl-btn"
                style={{ marginTop: 10, width: "100%" }}
                onClick={() => addExtraToBudget(goalResult.budget - effectiveBudget)}
              >
                Add {fmt(goalResult.budget - effectiveBudget)} to my budget
              </button>
            )}
          </>
        ) : (
          <p className="fl-card-sub" style={{ marginTop: 4 }}>
            Not possible — the soonest is {monthsLabel(goalResult.soonest)} (by {byMonth(goalResult.soonest)}), because a
            repayment plan runs on its own schedule and can’t be paid off faster.
          </p>
        )}
      </div>
    ) : (
      <button className="fl-add-row" style={{ marginBottom: 14 }} onClick={() => setEditingGoal(true)}>
        <Target size={16} /> Set a debt-free goal
      </button>
    );

  function updateStrategy(fields) {
    persist({ ...data, strategy: { ...strategy, ...fields } });
    setShowBudgetEditor(false);
    setEditingGoal(false);
  }

  // Saves the budget's parts, with their current total kept as strategy.budget.
  function saveBudgetParts(parts) {
    updateStrategy({ budgetParts: parts, budget: budgetTotal(parts, incomesById, asOfKey) });
  }

  // The goal card's "Add ₹X to my budget": tops up (or creates) a set amount for it.
  function addExtraToBudget(extra) {
    const i = budgetParts.findIndex((p) => p.kind === "set" && p.label === GOAL_EXTRA_LABEL);
    saveBudgetParts(
      i >= 0
        ? budgetParts.map((p, j) => (j === i ? { ...p, amount: p.amount + extra } : p))
        : [...budgetParts, { id: uid("bp"), kind: "set", label: GOAL_EXTRA_LABEL, amount: extra }]
    );
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

  function addIncome(fields) {
    persist({ ...data, incomes: [...incomes, { id: uid("inc"), ...fields }] });
    setShowAddIncome(false);
  }

  function updateIncome(id, fields) {
    persist({ ...data, incomes: incomes.map((s) => (s.id === id ? { ...s, ...fields } : s)) });
    setEditingIncomeId(null);
  }

  function deleteIncome(id) {
    const nextRecords = { ...incomeRecords };
    delete nextRecords[id];
    const next = { ...data, incomes: incomes.filter((s) => s.id !== id), incomeRecords: nextRecords };
    if (Array.isArray(strategy.budgetParts)) {
      const parts = strategy.budgetParts.filter((p) => !(p.kind === "income" && p.incomeId === id));
      next.strategy = { ...strategy, budgetParts: parts, budget: budgetTotal(parts, incomesById, asOfKey) };
    }
    persist(next);
    if (selectedIncomeId === id) {
      setSelectedIncomeId(null);
      setView("income");
    }
  }

  function saveIncomeMonth(id, monthKey, figures) {
    const existing = incomeRecords[id] || {};
    persist({ ...data, incomeRecords: { ...incomeRecords, [id]: { ...existing, [monthKey]: figures } } });
    setPendingIncomeMonth(null);
  }

  function deleteIncomeMonth(id, monthKey) {
    const existing = { ...(incomeRecords[id] || {}) };
    delete existing[monthKey];
    persist({ ...data, incomeRecords: { ...incomeRecords, [id]: existing } });
  }

  function openIncome(id) {
    setSelectedIncomeId(id);
    setPendingIncomeMonth(null);
    setView("incomeDetail");
  }

  // The header's + adds to whichever list is showing: Debts or Income.
  const canAddFromHeader = view === "loans" || view === "income";

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
        {canAddFromHeader ? (
          <button
            className="fl-topbar-add"
            onClick={() => (view === "income" ? setShowAddIncome(true) : setShowAddLoan(true))}
            aria-label={view === "income" ? "Add an income source" : "Add a debt"}
          >
            <Plus size={20} strokeWidth={2.5} />
          </button>
        ) : (
          <div className="fl-topbar-rivets">
            <div className="fl-rivet"></div>
            <div className="fl-rivet"></div>
          </div>
        )}
        <div className={"fl-z1" + (canAddFromHeader ? " fl-topbar-has-action" : "")}>
          {view === "loanDetail" && selectedLoan ? (
            <>
              <button className="fl-back-row" onClick={() => setView("loans")}>
                <ChevronLeft size={16} /> Debts
              </button>
              <h1 className="fl-title fl-serif">{selectedLoan.name}</h1>
            </>
          ) : view === "incomeDetail" && selectedIncome ? (
            <>
              <button className="fl-back-row" onClick={() => setView("income")}>
                <ChevronLeft size={16} /> Income
              </button>
              <h1 className="fl-title fl-serif">{selectedIncome.name}</h1>
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

            {activeIncomes.length > 0 && (
              <div className="fl-summary" style={{ cursor: "pointer" }} onClick={() => setView("income")}>
                <p className="fl-summary-label">Income · {monthKeyLabel(asOfKey)}</p>
                {recordedThisMonth.length > 0 ? (
                  <p
                    className="fl-summary-value fl-mono"
                    style={{ fontSize: 22, color: profitThisMonth < 0 ? "var(--maroon)" : "var(--forest)" }}
                  >
                    {profitThisMonth < 0 ? `${fmt(-profitThisMonth)} loss` : `${fmt(profitThisMonth)} profit`}
                  </p>
                ) : (
                  <p className="fl-list-row-name" style={{ margin: "2px 0 0" }}>Nothing recorded yet this month</p>
                )}
                <p className="fl-card-sub" style={{ marginTop: 6 }}>
                  {recordedThisMonth.length} of {activeIncomes.length} recorded ·{" "}
                  {usualProfitTotal >= 0
                    ? `usually ${fmt(usualProfitTotal)} profit a month`
                    : `usually ${fmt(-usualProfitTotal)} loss a month`}
                  {incomeToDebts > 0.5 ? ` · ${fmt(incomeToDebts)} of it goes to debts` : ""}
                </p>
              </div>
            )}

            {lenderSummaries.length === 0 && (
              <div className="fl-empty">Nothing added yet. Add one from the Debts tab.</div>
            )}

            {lenderSummaries.map((l) => {
              const pct = l.totalAmount > 0 ? Math.max(Math.min((l.totalAmount - l.remaining) / l.totalAmount, 1), 0) : 0;
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
                    l.missedMonths.length > 0 ||
                    l.shortThisMonth > 0.5 ||
                    l.behindPlan > 0.5) && (
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
                          {payableThisMonth(l)
                            ? ` · ${payableThisMonth(l).fromPlan ? "plan " : ""}${fmt(payableThisMonth(l).amount)}`
                            : ""}
                        </span>
                      )}
                      {l.isDueSoon &&
                        (() => {
                          const when = l.daysUntilDue === 0 ? "today" : `in ${l.daysUntilDue} day${l.daysUntilDue === 1 ? "" : "s"}`;
                          const pay = payableThisMonth(l);
                          return (
                            <span className="fl-chip chip-grey">
                              {!pay
                                ? `Due ${when}`
                                : pay.fromPlan
                                ? `Due ${when} · plan ${fmt(pay.amount)}`
                                : `${fmt(pay.amount)} due ${when}`}
                            </span>
                          );
                        })()}
                      {l.missedMonths.length > 0 && (
                        <span className="fl-overdue" style={{ marginTop: 0 }}>
                          <AlertCircle size={12} />{" "}
                          {l.missedMonths.length === 1
                            ? `Missed ${monthKeyShort(l.missedMonths[0].key)}`
                            : `${l.missedMonths.length} months missed`}
                        </span>
                      )}
                      {l.shortThisMonth > 0.5 && (
                        <span className="fl-overdue" style={{ marginTop: 0 }}>
                          <AlertCircle size={12} /> {fmt(l.shortThisMonth)} short for {monthKeyShort(asOfKey)}
                        </span>
                      )}
                      {l.behindPlan > 0.5 && (
                        <span className="fl-overdue" style={{ marginTop: 0 }}>
                          <AlertCircle size={12} /> {fmt(l.behindPlan)} behind plan
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
                      {l.repaymentPlan
                        ? "repayment plan"
                        : l.type === "fixed"
                        ? "no interest"
                        : `${((l.annualRate || 0) * 100).toFixed(2)}% p.a.`}
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

            {lenders.length === 0 && (
              <div className="fl-empty">Nothing added yet. Tap + at the top to add a debt.</div>
            )}
          </>
        )}

        {view === "income" && (
          <>
            {incomes.length > 0 && (
              <div className="fl-summary">
                <p className="fl-summary-label">All income sources · usual profit a month</p>
                <p
                  className="fl-summary-value fl-mono"
                  style={{ color: usualProfitTotal < 0 ? "var(--maroon)" : undefined }}
                >
                  {signedFmt(usualProfitTotal)}
                </p>
                <p className="fl-card-sub" style={{ marginTop: 4 }}>
                  {fmt(usualIncomeTotal)} in · {fmt(usualExpensesTotal)} out · {activeIncomes.length} source
                  {activeIncomes.length === 1 ? "" : "s"}
                </p>
                {incomeCapital > 0 && (
                  <>
                    <div className="fl-progress-track">
                      <div
                        className="fl-progress-fill"
                        style={{ width: ((incomeEarnedBack / incomeCapital) * 100).toFixed(1) + "%" }}
                      />
                    </div>
                    <p className="fl-card-sub" style={{ marginTop: 8 }}>
                      {fmt(incomeEarnedBack)} of {fmt(incomeCapital)} capital earned back (
                      {Math.floor((incomeEarnedBack / incomeCapital) * 100)}%)
                    </p>
                  </>
                )}
                <div className="fl-budget-breakdown">
                  <div className="fl-budget-line">
                    <span>Profit so far (recorded months)</span>
                    <span className="fl-mono">{signedFmt(incomeProfitSoFar)}</span>
                  </div>
                  <div className="fl-budget-line">
                    <span>
                      {monthKeyLabel(asOfKey)} · {recordedThisMonth.length} of {activeIncomes.length} recorded
                    </span>
                    <span className="fl-mono">{recordedThisMonth.length > 0 ? signedFmt(profitThisMonth) : "—"}</span>
                  </div>
                  {incomeToDebts > 0.5 && (
                    <div className="fl-budget-line">
                      <span>Goes toward debts each month</span>
                      <span className="fl-mono">{fmt(incomeToDebts)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <p className="fl-section-title">Your income sources</p>
            {incomeSummaries.map((s) =>
              editingIncomeId === s.id ? (
                <IncomeForm
                  key={s.id}
                  initial={s}
                  onCancel={() => setEditingIncomeId(null)}
                  onSave={(fields) => updateIncome(s.id, fields)}
                />
              ) : (
                <div className="fl-list-row" key={s.id}>
                  <div className="fl-list-row-main" onClick={() => openIncome(s.id)}>
                    <div className="fl-list-row-name">{s.name}</div>
                    <div className="fl-list-row-sub fl-mono">
                      {s.stats.capital > 0 ? `${fmt(s.stats.capital)} capital · ` : ""}
                      {s.stats.usualProfit >= 0
                        ? `usually ${fmt(s.stats.usualProfit)}/mo profit`
                        : `usually ${fmt(-s.stats.usualProfit)}/mo loss`}
                      {s.incomeDay ? ` · comes in on the ${ordinal(s.incomeDay)}` : ""}
                      {toDebtsByIncome[s.id] ? ` · ${fmt(toDebtsByIncome[s.id].amount)}/mo to debts` : ""}
                    </div>
                    {categoryLabel(s.category, INCOME_CATEGORIES) && (
                      <div className="fl-chip-row" style={{ marginTop: 5 }}>
                        <span className="fl-chip chip-tag">{categoryLabel(s.category, INCOME_CATEGORIES)}</span>
                      </div>
                    )}
                  </div>
                  <button className="fl-icon-btn" onClick={() => setEditingIncomeId(s.id)} aria-label="Edit income source">
                    <Pencil size={16} />
                  </button>
                  <ConfirmButton label="delete income source" onConfirm={() => deleteIncome(s.id)} />
                  <button className="fl-icon-btn" onClick={() => openIncome(s.id)} aria-label="Open income source">
                    <ChevronRight size={16} />
                  </button>
                </div>
              )
            )}
            {incomes.length === 0 && (
              <div className="fl-empty">
                Nothing added yet. Tap + at the top to add a business, property or other income source.
              </div>
            )}
          </>
        )}

        {view === "incomeDetail" && selectedIncome && (
          <>
            {editingIncomeId === selectedIncome.id ? (
              <IncomeForm
                initial={selectedIncome}
                onCancel={() => setEditingIncomeId(null)}
                onSave={(fields) => updateIncome(selectedIncome.id, fields)}
              />
            ) : (
              (() => {
                const s = selectedIncome;
                const st = s.stats;
                const records = incomeRecords[s.id] || {};
                const suggestedMonth = getSuggestedMonth(s, records, asOfKey);
                const toGo =
                  st.monthsToPayback > 0
                    ? ` · about ${monthsLabel(st.monthsToPayback)} to go at the usual profit`
                    : st.monthsToPayback === null
                    ? " · the usual figures don’t make a profit yet"
                    : "";
                const profitColor = (v) => (v < 0 ? "var(--maroon)" : "var(--forest)");

                return (
                  <>
                    <div className="fl-detail-head">
                      <div className="fl-card-row">
                        <span className="fl-card-sub">Capital put in</span>
                        <button className="fl-icon-btn" onClick={() => setEditingIncomeId(s.id)} aria-label="Edit income source details">
                          <Pencil size={14} />
                        </button>
                      </div>
                      <p className="fl-stat-value fl-mono" style={{ fontSize: 20 }}>{fmt(st.capital)}</p>
                      <p className="fl-card-sub" style={{ marginTop: 4 }}>
                        Started {monthKeyShort(s.startMonth || asOfKey)} · usually{" "}
                        {fmt(expectedIncomeFor(s, asOfKey))} in, {fmt(s.usualExpenses)} out
                        {s.incomeDay ? ` · comes in on the ${ordinal(s.incomeDay)}` : ""}
                      </p>
                      {toDebtsByIncome[s.id] && (
                        <p className="fl-card-sub">
                          Goes toward debts: {fmt(toDebtsByIncome[s.id].amount)} a month ({shareLabel(toDebtsByIncome[s.id].share)}) — change
                          it from the budget on the Strategy tab
                        </p>
                      )}
                      {hasIncomeGrowth(s) && (
                        <p className="fl-card-sub">
                          Income rises {incomeGrowthLabel(s.growth)}
                          {(() => {
                            const next = nextIncomeRise(s, asOfKey);
                            return next ? ` · next: ${fmt(next.amount)} from ${monthKeyShort(next.key)}` : "";
                          })()}
                        </p>
                      )}
                      {categoryLabel(s.category, INCOME_CATEGORIES) && (
                        <div className="fl-chip-row" style={{ marginTop: 6 }}>
                          <span className="fl-chip chip-tag">{categoryLabel(s.category, INCOME_CATEGORIES)}</span>
                        </div>
                      )}
                      {st.capital > 0 && (
                        <>
                          <div className="fl-progress-track">
                            <div className="fl-progress-fill" style={{ width: (st.recoveredPct * 100).toFixed(1) + "%" }} />
                          </div>
                          <p className="fl-card-sub" style={{ marginTop: 6 }}>
                            {st.totalProfit >= st.capital
                              ? `Capital fully earned back ✓${
                                  st.totalProfit - st.capital > 0.5 ? ` — ${fmt(st.totalProfit - st.capital)} beyond it` : ""
                                }`
                              : st.totalProfit > 0
                              ? `${fmt(st.totalProfit)} of ${fmt(st.capital)} earned back (${Math.floor(st.recoveredPct * 100)}%)${toGo}`
                              : `Nothing earned back yet${toGo}`}
                          </p>
                        </>
                      )}

                      <div className="fl-detail-grid">
                        <div>
                          <p className="fl-stat-label">{st.totalProfit < 0 ? "Loss so far" : "Profit so far"}</p>
                          <p className="fl-stat-value fl-mono" style={{ color: profitColor(st.totalProfit) }}>
                            {fmt(Math.abs(st.totalProfit))}
                          </p>
                        </div>
                        <div>
                          <p className="fl-stat-label">{st.usualProfit < 0 ? "Usual monthly loss" : "Usual monthly profit"}</p>
                          <p className="fl-stat-value fl-mono">{fmt(Math.abs(st.usualProfit))}</p>
                        </div>
                      </div>
                    </div>

                    <p className="fl-section-title">Monthly figures</p>

                    {st.rows.map((row) =>
                      pendingIncomeMonth === row.key ? (
                        <IncomeMonthForm
                          key={row.key}
                          monthKey={row.key}
                          onMonthKeyChange={setPendingIncomeMonth}
                          defaults={
                            row.recorded
                              ? row
                              : { income: Math.round(expectedIncomeFor(s, row.key)), expenses: s.usualExpenses }
                          }
                          isExisting={row.recorded}
                          title={(row.recorded ? "Edit " : "Record ") + monthKeyLabel(row.key)}
                          onCancel={() => setPendingIncomeMonth(null)}
                          onSave={(figures) => saveIncomeMonth(s.id, row.key, figures)}
                        />
                      ) : (
                        <div className="fl-month-row" key={row.key}>
                          <div className="fl-month-top" onClick={() => setPendingIncomeMonth(row.key)}>
                            <span className="fl-month-name">{monthKeyShort(row.key)}</span>
                            <span className="fl-month-balance fl-mono" style={{ color: row.recorded ? profitColor(row.profit) : undefined }}>
                              {row.recorded ? (row.profit < 0 ? "−" : "") + fmt(Math.abs(row.profit)) : "—"}
                            </span>
                          </div>
                          <div className="fl-month-breakdown" onClick={() => setPendingIncomeMonth(row.key)}>
                            {row.recorded
                              ? `Income ${fmt(row.income)} · Expenses ${fmt(row.expenses)}`
                              : "Not recorded yet"}
                          </div>
                          {row.recorded && (
                            <div style={{ marginTop: 6 }}>
                              <ConfirmButton
                                label={"delete " + monthKeyShort(row.key) + " figures"}
                                onConfirm={() => deleteIncomeMonth(s.id, row.key)}
                              />
                            </div>
                          )}
                        </div>
                      )
                    )}

                    {st.rows.length === 0 && (
                      <p className="fl-card-sub" style={{ marginBottom: 8 }}>
                        Starts {monthKeyLabel(s.startMonth)} — nothing to record yet.
                      </p>
                    )}

                    {pendingIncomeMonth !== null && !st.rows.some((r) => r.key === pendingIncomeMonth) && (
                      <IncomeMonthForm
                        key={pendingIncomeMonth}
                        monthKey={pendingIncomeMonth}
                        onMonthKeyChange={setPendingIncomeMonth}
                        defaults={{ income: Math.round(expectedIncomeFor(s, pendingIncomeMonth)), expenses: s.usualExpenses }}
                        isExisting={!!records[pendingIncomeMonth]}
                        title={"Record " + monthKeyLabel(pendingIncomeMonth)}
                        onCancel={() => setPendingIncomeMonth(null)}
                        onSave={(figures) => saveIncomeMonth(s.id, pendingIncomeMonth, figures)}
                      />
                    )}

                    {pendingIncomeMonth === null && st.rows.length > 0 && (
                      <button className="fl-add-row" onClick={() => setPendingIncomeMonth(suggestedMonth)}>
                        <Plus size={16} /> Record a month
                      </button>
                    )}
                  </>
                );
              })()
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

            <div className="fl-summary">
              <div className="fl-card-row">
                <p className="fl-summary-label">You can put toward debts each month</p>
                <button className="fl-icon-btn" onClick={() => setShowBudgetEditor(true)} aria-label="Edit budget">
                  <Pencil size={14} />
                </button>
              </div>
              <p className="fl-summary-value fl-mono">{fmt(effectiveBudget)}</p>
              {(budgetParts.length > 1 || budgetParts.some((p) => p.kind === "income")) && (
                <div className="fl-budget-breakdown">
                  {budgetParts.map((p) => (
                    <div className="fl-budget-line" key={p.id}>
                      <span>
                        {p.kind === "income"
                          ? `${incomesById[p.incomeId] ? incomesById[p.incomeId].name : "Removed income source"} · ${shareLabel(p.share)}`
                          : p.label}
                      </span>
                      <span className="fl-mono">{fmt(budgetPartAmount(p, incomesById, asOfKey))}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {activeIncomes.length > 0 && (
              <p className="fl-card-sub" style={{ marginTop: -6, marginBottom: 12 }}>
                {usualProfitTotal < 0
                  ? `Your income sources usually run at a ${fmt(-usualProfitTotal)} loss a month.`
                  : incomeToDebts > 0.5
                  ? `Your income sources usually make ${fmt(usualProfitTotal)} profit a month — ${fmt(incomeToDebts)} of it goes toward debts.`
                  : `Your income sources usually make ${fmt(usualProfitTotal)} profit a month. None of it is in this budget yet — tap ✎ to add a share.`}
              </p>
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
                  Your budget of {fmt(effectiveBudget)} doesn’t cover the minimum payments across your debts.
                  You need at least {fmt(strategyResult.minRequired)}/month before a strategy can be planned.
                </p>
              </div>
            )}

            {strategyLoans.length > 0 && strategyResult && !strategyResult.feasible && goalBlock}

            {strategyLoans.length > 0 && strategyResult && strategyResult.feasible && (
              <>
                <div className="fl-detail-head">
                  <p className="fl-card-sub">With this strategy</p>
                  <div className="fl-detail-grid">
                    <div>
                      <button className="fl-stat-edit" onClick={() => setEditingGoal(true)} aria-label="Set a debt-free goal">
                        <span className="fl-stat-label">Debt-free in</span>
                        <Pencil size={11} />
                      </button>
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

                <div style={{ marginTop: 14 }}>{goalBlock}</div>

                <p className="fl-section-title">Pay this for {monthKeyLabel(asOfKey)}</p>
                {strategyLoans
                  .slice()
                  .sort((a, b) => (strategyResult.firstMonthPlan[b.id] || 0) - (strategyResult.firstMonthPlan[a.id] || 0))
                  .map((l) => (
                    <div className="fl-list-row" key={l.id}>
                      <div className="fl-list-row-main">
                        <div className="fl-list-row-name">{l.name}</div>
                        <div className="fl-list-row-sub fl-mono">
                          {l.schedule ? "repayment plan" : `${(l.rate * 100).toFixed(2)}% p.a.`} · balance {fmt(l.balance)}
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
              flexible, informal ones, or turn on “protect from growing” for a debt that must never be left to pile up
              interest while it waits its turn. A debt on a repayment plan only ever gets what’s due that month,
              since paying it early doesn’t reduce its total. This isn’t financial advice tailored to your situation; check things
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
                const summary = lenderSummaries.find((s) => s.id === selectedLoan.id);
                const isOverdue = summary.isOverdue;
                const suggestedMonth = getSuggestedMonth(selectedLoan, entries, asOfKey);
                const plan = selectedLoan.repaymentPlan;
                const planCharge = plan ? (selectedLoan.totalAmount || 0) - plan.received : 0;
                const planRate = plan ? planYearlyRate(plan.received, plan.amounts) : null;
                const upcoming = plan
                  ? plan.amounts
                      .map((amt, i) => ({ key: monthKeyAdd(selectedLoan.termStart || selectedLoan.startMonth, i), amt }))
                      .filter((m) => m.key > asOfKey)
                  : [];

                return (
                  <>
                    <div className="fl-detail-head">
                      <div className="fl-card-row">
                        <span className="fl-card-sub">{plan ? "Total to repay" : "Total amount borrowed"}</span>
                        <button className="fl-icon-btn" onClick={() => setEditingLoanId(selectedLoan.id)} aria-label="Edit debt details">
                          <Pencil size={14} />
                        </button>
                      </div>
                      <p className="fl-stat-value fl-mono" style={{ fontSize: 20 }}>{fmt(selectedLoan.totalAmount)}</p>
                      <p className="fl-card-sub" style={{ marginTop: 4 }}>
                        {plan
                          ? `Repayment plan · received ${fmt(plan.received)}`
                          : selectedLoan.type === "fixed"
                          ? "No interest"
                          : `${((selectedLoan.annualRate || 0) * 100).toFixed(2)}% per annum`}
                        {selectedLoan.dueDay ? ` · due on the ${ordinal(selectedLoan.dueDay)}` : ""}
                        {selectedLoan.protectFromGrowth ? " · protected from growing" : ""}
                      </p>
                      {plan && planCharge > 0.5 && (
                        <p className="fl-card-sub">
                          Lender’s charge {fmt(planCharge)}
                          {planRate != null ? ` — costs about the same as ${(planRate * 100).toFixed(1)}% a year` : ""}
                        </p>
                      )}
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
                      {summary.shortThisMonth > 0.5 && (
                        <p className="fl-overdue">
                          <AlertCircle size={12} /> {fmt(summary.shortThisMonth)} short for {monthKeyLabel(asOfKey)}
                        </p>
                      )}
                      {summary.behindPlan > 0.5 && (
                        <p className="fl-overdue">
                          <AlertCircle size={12} /> {fmt(summary.behindPlan)} behind plan from earlier months
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
                        {plan && (
                          <div>
                            <p className="fl-stat-label">Due for {monthKeyShort(asOfKey)}</p>
                            <p className="fl-stat-value fl-mono">{fmt(summary.dueThisMonth)}</p>
                          </div>
                        )}
                      </div>
                      {upcoming.length > 0 && (
                        <details className="fl-plan-details">
                          <summary>Upcoming payments ({upcoming.length})</summary>
                          {upcoming.map((m) => (
                            <div className="fl-plan-row" key={m.key}>
                              <span>{monthKeyShort(m.key)}</span>
                              <span className="fl-mono">{fmt(m.amt)}</span>
                            </div>
                          ))}
                        </details>
                      )}
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
                            {plan && planDueFor(selectedLoan, row.key) > 0 && ` — ${fmt(planDueFor(selectedLoan, row.key))} due`}
                          </div>
                          {plan &&
                            row.recorded &&
                            row.totalPaid < planDueFor(selectedLoan, row.key) - 0.5 && (
                              <p className="fl-overdue">
                                <AlertCircle size={12} /> {fmt(planDueFor(selectedLoan, row.key) - row.totalPaid)} short
                              </p>
                            )}
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

      {showAddLoan && (
        <Sheet title="Add a new debt" onClose={() => setShowAddLoan(false)}>
          <LenderForm inSheet onCancel={() => setShowAddLoan(false)} onSave={addLoan} />
        </Sheet>
      )}

      {showBudgetEditor && (
        <Sheet title="Monthly budget" onClose={() => setShowBudgetEditor(false)}>
          <BudgetEditor
            initialParts={budgetParts}
            incomes={incomeSummaries}
            people={people}
            asOfKey={asOfKey}
            onCancel={() => setShowBudgetEditor(false)}
            onSave={saveBudgetParts}
          />
        </Sheet>
      )}

      {showAddIncome && (
        <Sheet title="Add an income source" onClose={() => setShowAddIncome(false)}>
          <IncomeForm inSheet onCancel={() => setShowAddIncome(false)} onSave={addIncome} />
        </Sheet>
      )}

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
            className={"fl-navbtn " + (view === "income" || view === "incomeDetail" ? "active" : "")}
            onClick={() => setView("income")}
          >
            <div className="fl-ribbon"><div className="fl-ribbon-grain"></div></div>
            <TrendingUp size={16} />
            Income
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
