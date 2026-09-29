// Pure calculations for the ledger: dates, balances, repayment plans, income,
// and the payoff Strategy. No React and no database here, so they can be
// tested on their own (see src/calc.test.js). Treat changes as high-stakes:
// they move real balances and plans.

export function uid(prefix) {
  return prefix + "-" + Math.random().toString(36).slice(2, 9);
}

export function fmt(n) {
  const v = Math.round(Number(n) || 0);
  return "₹" + v.toLocaleString("en-IN");
}

export function pad2(n) {
  return String(n).padStart(2, "0");
}

// "2026-09" style keys: sortable as strings, easy to store as object keys.
export function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

export function monthKeyAdd(key, n) {
  const [y, m] = key.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (((total % 12) + 12) % 12) + 1;
  return `${ny}-${pad2(nm)}`;
}

export function monthsBetween(a, b) {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return by * 12 + bm - (ay * 12 + am);
}

export function monthKeyLabel(key) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export function monthKeyShort(key) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

export function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// What kind of borrowing a loan is, shown as a tag. Purely a label — it never
// affects any calculation. Stored as `category`; the separate `type` field
// ("interest" / "fixed") is what controls interest.
export const CATEGORIES = [
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
export const INCOME_CATEGORIES = [
  { id: "business", label: "Business" },
  { id: "shop", label: "Shop" },
  { id: "real-estate", label: "Real estate" },
  { id: "rental", label: "Rental" },
  { id: "farm", label: "Farm" },
  { id: "vehicle", label: "Vehicle hire" },
  { id: "other", label: "Other" },
];

export function categoryLabel(id, list = CATEGORIES) {
  const c = list.find((c) => c.id === id);
  return c ? c.label : null;
}

export function defaultData() {
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
export function migrateData(raw) {
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
export function computeSchedule(lender, entriesMap, asOfKey) {
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
export function getCurrentPayment(lender, entriesMap) {
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
export function getSuggestedMonth(lender, entriesMap, asOfKey) {
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
export function spreadPlanAmounts(total, first, months) {
  if (!(total > 0) || !(first >= 0) || !(months >= 1)) return null;
  if (months === 1) return [Math.round(total)];
  const step = (total - months * first) / ((months * (months - 1)) / 2);
  const amounts = [];
  for (let i = 0; i < months - 1; i++) amounts.push(Math.round(first + i * step));
  amounts.push(Math.round(total - amounts.reduce((s, v) => s + v, 0)));
  return amounts.some((a) => a < 0) ? null : amounts;
}

// What the plan says is due in a given month (0 outside the plan).
export function planDueFor(lender, key) {
  const plan = lender.repaymentPlan;
  if (!plan) return 0;
  const i = monthsBetween(lender.termStart || lender.startMonth, key);
  return i >= 0 && i < plan.amounts.length ? plan.amounts[i] : 0;
}

// What's due each month from `fromKey` to the plan's last month (empty once
// the plan has ended).
export function upcomingPlanAmounts(lender, fromKey) {
  const plan = lender.repaymentPlan;
  if (!plan) return [];
  const end = monthKeyAdd(lender.termStart || lender.startMonth, plan.amounts.length - 1);
  const out = [];
  for (let k = fromKey; monthsBetween(k, end) >= 0; k = monthKeyAdd(k, 1)) out.push(planDueFor(lender, k));
  return out;
}

// How far payments trail the plan: everything due before this month minus
// everything paid before it. The current month isn't counted until it's over.
export function planShortfall(lender, rows, asOfKey) {
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
export function planYearlyRate(received, amounts) {
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
export function firstIncomeRise(source) {
  const g = source.growth;
  return g.firstMonth || monthKeyAdd(source.startMonth || currentMonthKey(), g.everyMonths);
}

export function hasIncomeGrowth(source) {
  const g = source.growth;
  return !!g && g.pct > 0 && g.everyMonths >= 1;
}

// The usual income expected in a given month, with any rises applied by then.
export function expectedIncomeFor(source, key) {
  const base = Number(source.usualIncome) || 0;
  if (!hasIncomeGrowth(source)) return base;
  const since = monthsBetween(firstIncomeRise(source), key);
  if (since < 0) return base;
  const rises = 1 + Math.floor(since / source.growth.everyMonths);
  return base * Math.pow(1 + source.growth.pct, rises);
}

// "5% every year", "10% every 6 months".
export function incomeGrowthLabel(growth) {
  const pct = Math.round(growth.pct * 100 * 100) / 100;
  const m = growth.everyMonths;
  const every =
    m % 12 === 0 ? (m === 12 ? "year" : `${m / 12} years`) : m === 1 ? "month" : `${m} months`;
  return `${pct}% every ${every}`;
}

// The next month (after `asOfKey`) the income rises, and what it rises to.
export function nextIncomeRise(source, asOfKey) {
  if (!hasIncomeGrowth(source)) return null;
  const first = firstIncomeRise(source);
  const since = monthsBetween(first, asOfKey);
  const key = since < 0 ? first : monthKeyAdd(first, (Math.floor(since / source.growth.everyMonths) + 1) * source.growth.everyMonths);
  return { key, amount: expectedIncomeFor(source, key) };
}

// Month-by-month figures from the start month to now. Only recorded months
// count toward the totals — a month nobody has recorded yet counts as nothing,
// not as the usual figures.
export function computeIncome(source, records, asOfKey) {
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

export function monthsLabel(m) {
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
//
// Month 1 is the current month. Balances come from computeSchedule, which has
// already added this month's interest, so month 1 adds no interest of its own;
// interest accrues from month 2 on. `currentInterest` (this month's interest,
// already in the balance) is what a protected loan's month-1 floor must cover.
export function month1Interest(l) {
  return l.currentInterest != null ? l.currentInterest : l.balance * (l.rate / 12);
}

// `budget` is a number, or a function giving month m's budget (m = 1 is this
// month) when part of it follows income that rises over time.
export function simulateStrategy(loans, strategyType, budget, maxMonths = 600) {
  const budgetFor = typeof budget === "function" ? budget : () => budget;
  let state = loans.map((l) => ({ ...l }));
  // A "protected" loan's real floor for month 1 is whichever is bigger: its stated
  // minimum, or this month's interest — that's what actually stops it from growing,
  // not just its (possibly 0) minPayment.
  // A repayment plan counts at its largest upcoming payment, so a rising plan
  // can't outgrow the budget later on.
  const initialMinSum = state.reduce((s, l) => {
    const floor = l.schedule
      ? Math.min(l.balance, l.schedule.length > 0 ? Math.max(...l.schedule) : l.balance)
      : l.protectFromGrowth
      ? Math.max(l.minPayment || 0, month1Interest(l))
      : l.minPayment || 0;
    return s + floor;
  }, 0);
  if (initialMinSum > budgetFor(1) + 0.5) {
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
        if (month === 1) {
          // Already in the balance — only needed for a protected loan's floor.
          interestThisMonth[l.id] = month1Interest(l);
          return;
        }
        const interest = l.balance * (l.rate / 12);
        interestThisMonth[l.id] = interest;
        l.balance += interest;
        totalInterest += interest;
      }
    });

    let budgetLeft = budgetFor(month);
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
export function simulateStatusQuo(loans, maxMonths = 600) {
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
      // Month 1 is the current month, whose interest is already in the balance.
      const interest = m === 1 ? 0 : bal * monthlyRate;
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

export const GOAL_EXTRA_LABEL = "Extra for debt-free goal";

// The parts to show and edit: the saved ones, or the old single budget as one set amount.
export function budgetPartsOf(strategy) {
  if (Array.isArray(strategy.budgetParts)) return strategy.budgetParts;
  const b = Number(strategy.budget) || 0;
  return b > 0 ? [{ id: "set-base", kind: "set", label: "Set amount", amount: b }] : [];
}

// What one part adds to this month's budget. An income share uses the source's usual
// profit now; a source that hasn't started, makes a loss or no longer exists adds nothing.
export function budgetPartAmount(part, incomesById, asOfKey) {
  if (part.kind === "income") {
    const src = incomesById[part.incomeId];
    if (!src || (src.startMonth || asOfKey) > asOfKey) return 0;
    const profit = expectedIncomeFor(src, asOfKey) - (Number(src.usualExpenses) || 0);
    return Math.max(Math.round(profit * (Number(part.share) || 0)), 0);
  }
  return Number(part.amount) || 0;
}

export function budgetTotal(parts, incomesById, asOfKey) {
  return parts.reduce((s, p) => s + budgetPartAmount(p, incomesById, asOfKey), 0);
}

// "all of its profit", "half of its profit", "30% of its profit".
export function shareLabel(share) {
  if (share >= 1) return "all of its profit";
  if (share === 0.5) return "half of its profit";
  return `${Math.round(share * 1000) / 10}% of its profit`;
}

// The smallest monthly budget (rounded up to the next ₹100) that clears every
// loan within `targetMonths` under the given strategy. Only runs
// simulateStrategy — it doesn't change it. If even paying everything off at
// once can't get there (a repayment plan runs on its own schedule), returns
// { possible: false, soonest } with the soonest achievable month count.
// `budgetRise(m)` (optional) is how much more than this month's budget month m
// will have — from income shares that grow over time. The answer is then the
// budget needed *now*, with those rises still to come on top.
export function budgetForTarget(loans, strategyType, targetMonths, budgetRise = null) {
  const withRise = (budget) => (budgetRise ? (m) => budget + budgetRise(m) : budget);
  const meetsTarget = (budget) => {
    const r = simulateStrategy(loans, strategyType, withRise(budget));
    return r.feasible && r.months <= targetMonths;
  };
  // Enough to clear every ordinary loan in month 1 (balance plus that month's
  // interest) while a repayment plan is paid its full remaining balance — plus
  // every minimum on top, since the budget check counts a minimum in full even
  // when it's more than the balance left (e.g. ₹3,000 left on a ₹15,000 EMI).
  const everything = Math.ceil(
    loans.reduce(
      (s, l) =>
        s +
        (l.schedule ? l.balance : l.balance * (1 + l.rate / 12)) +
        (l.minPayment || 0) +
        (l.protectFromGrowth ? month1Interest(l) : 0),
      0
    ) + 1
  );
  if (!meetsTarget(everything)) {
    return { possible: false, soonest: simulateStrategy(loans, strategyType, withRise(everything)).months };
  }
  // With rising income shares, the rises alone might already be enough.
  if (meetsTarget(0)) return { possible: true, budget: 0 };
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
