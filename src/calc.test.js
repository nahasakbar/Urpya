// Checks for the ledger's calculations. These run before every build (see the
// "build" script in package.json), so a change that breaks the sums can't be
// deployed. The golden snapshot at the bottom pins today's Strategy results: if
// a change moves them on purpose, review the diff and update it with
// `npx vitest run -u`.
import { describe, it, expect } from "vitest";
import {
  computeSchedule,
  spreadPlanAmounts,
  planDueFor,
  upcomingPlanAmounts,
  planShortfall,
  planYearlyRate,
  equalPayment,
  termPayoff,
  computeIncome,
  expectedIncomeFor,
  nextIncomeRise,
  simulateStrategy,
  simulateStatusQuo,
  budgetForTarget,
  budgetPartsOf,
  budgetPartAmount,
  budgetTotal,
  shareLabel,
  monthKeyAdd,
  fmt,
  fmtIn,
  fmtCompact,
  setCurrency,
  currencySymbol,
} from "./calc.js";

const sum = (a) => a.reduce((s, v) => s + v, 0);

// Small repeatable random numbers, so random checks are the same every run.
function seeded(seed) {
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  return { rnd, pick: (a) => a[Math.floor(rnd() * a.length)] };
}

function randomLoans({ rnd, pick }, { plans = true } = {}) {
  return Array.from({ length: 1 + Math.floor(rnd() * 5) }, (_, i) => {
    const rate = pick([0, 0, 0.05, 0.09, 0.105, 0.12, 0.18, 0.24]);
    const balance = 1000 + Math.round(rnd() * 1500000);
    return {
      id: "l" + i,
      name: "L" + i,
      rate,
      balance,
      currentInterest: balance - balance / (1 + rate / 12),
      minPayment: pick([0, 0, 1000, 5000, 15000]),
      protectFromGrowth: rnd() < 0.3,
      schedule: plans && rnd() < 0.15 ? [5000, 5500, 6000, 6500, 7000] : null,
      currentPayment: pick([0, 2000, 10000, 25000]),
    };
  });
}

describe("balances (computeSchedule)", () => {
  it("adds a month's interest before taking that month's payments", () => {
    const loan = { type: "interest", annualRate: 0.12, totalAmount: 100000, startMonth: "2026-01" };
    const { rows, finalBalance } = computeSchedule(loan, { "2026-01": { amounts: { A: 2000, B: 1000 } } }, "2026-02");
    expect(rows[0].interest).toBeCloseTo(1000);
    expect(rows[0].remaining).toBeCloseTo(98000);
    expect(rows[1].interest).toBeCloseTo(980);
    expect(finalBalance).toBeCloseTo(98980);
  });

  it("never charges interest on a no-interest debt", () => {
    const loan = { type: "fixed", annualRate: 0.3, totalAmount: 20000, startMonth: "2026-08" };
    expect(computeSchedule(loan, { "2026-08": { amounts: { A: 2000 } } }, "2026-09").finalBalance).toBe(18000);
  });
});

describe("repayment plans", () => {
  const amounts = spreadPlanAmounts(475000, 15000, 24);

  it("spreads a rising plan so it adds up exactly to the total", () => {
    expect(amounts).toHaveLength(24);
    expect(sum(amounts)).toBe(475000);
    expect(amounts[0]).toBe(15000);
    expect(amounts[23]).toBe(24583);
    for (let i = 1; i < 24; i++) expect(amounts[i]).toBeGreaterThanOrEqual(amounts[i - 1]);
    expect(spreadPlanAmounts(475000, 45000, 24)).toBeNull();
    expect(spreadPlanAmounts(24000, 1000, 24)).toEqual(Array(24).fill(1000));
  });

  it("knows what's due each month and how far behind it is", () => {
    const debt = { startMonth: "2026-09", termStart: "2026-10", termMonths: 24, repaymentPlan: { received: 350000, amounts } };
    expect(planDueFor(debt, "2026-09")).toBe(0);
    expect(planDueFor(debt, "2026-10")).toBe(15000);
    expect(planDueFor(debt, "2028-10")).toBe(0);
    expect(upcomingPlanAmounts(debt, "2026-09")).toHaveLength(25);
    const rows = [
      { key: "2026-10", totalPaid: 15000 },
      { key: "2026-11", totalPaid: 10000 },
      { key: "2026-12", totalPaid: 0 },
    ];
    expect(planShortfall(debt, rows, "2026-12")).toBe(amounts[1] - 10000);
  });

  it("works out the equivalent yearly rate (₹3.5L → ₹4.75L over 24 months ≈ 28.6%)", () => {
    expect(planYearlyRate(350000, amounts)).toBeCloseTo(0.2863, 3);
    expect(planYearlyRate(475000, amounts)).toBeNull();
  });

  it("gets exactly what's due in the plan and never extra money", () => {
    const bank = { id: "bank", rate: 0.12, balance: 900000, minPayment: 10000, protectFromGrowth: false, schedule: null, currentInterest: 9000 };
    const plan = { id: "plan", rate: 0, balance: 475000, minPayment: 15000, protectFromGrowth: false, schedule: amounts.slice(), currentInterest: 0 };
    for (const type of ["avalanche", "snowball"]) {
      const r = simulateStrategy([bank, plan], type, 60000);
      expect(Math.round(r.firstMonthPlan.plan)).toBe(15000);
      expect(Math.round(r.firstMonthPlan.bank)).toBe(45000);
      expect(r.payoffMonth.plan).toBe(24);
    }
    const tight = simulateStrategy([bank, plan], "avalanche", 30000);
    expect(tight.feasible).toBe(false);
    expect(Math.round(tight.minRequired)).toBe(10000 + amounts[23]);
  });
});

describe("total payable over a payment term", () => {
  it("matches a bank EMI: ₹1,00,000 at 12% over 2 years is about ₹4,707 a month, ₹1,12,976 in all", () => {
    const e = equalPayment(100000, 0.12, 24);
    expect(e.monthly).toBeCloseTo(4707.35, 2);
    expect(e.total).toBeCloseTo(112976.33, 1);
    expect(e.interest).toBeCloseTo(12976.33, 1);
    // No interest: just the amount split evenly.
    expect(equalPayment(120000, 0, 12)).toEqual({ monthly: 10000, total: 120000, interest: 0 });
    expect(equalPayment(0, 0.12, 24)).toBe(null);
    expect(equalPayment(1000, 0.12, 0)).toBe(null);
  });

  it("gives the same figures for a brand-new debt", () => {
    const lender = { type: "interest", totalAmount: 100000, annualRate: 0.12, startMonth: "2026-01", termMonths: 24 };
    const p = termPayoff(lender, {}, "2026-01");
    const e = equalPayment(100000, 0.12, 24);
    expect(p.endKey).toBe("2027-12");
    expect(p.paymentsLeft).toBe(24);
    expect(p.monthly).toBeCloseTo(e.monthly, 6);
    expect(p.total).toBeCloseTo(e.total, 6);
    expect(p.interest).toBeCloseTo(e.interest, 6);
  });

  it("only applies to an interest debt with a term that isn't on a repayment plan", () => {
    const base = { totalAmount: 50000, annualRate: 0.1, startMonth: "2026-01", termMonths: 12 };
    expect(termPayoff({ ...base, type: "fixed" }, {}, "2026-03")).toBe(null);
    expect(termPayoff({ ...base, type: "interest", termMonths: null }, {}, "2026-03")).toBe(null);
    expect(termPayoff({ ...base, type: "interest", repaymentPlan: { received: 40000, amounts: [50000] } }, {}, "2026-03")).toBe(null);
  });

  it("once the term is over, what's left is simply what's still owed", () => {
    const lender = { type: "interest", totalAmount: 10000, annualRate: 0.12, startMonth: "2026-01", termMonths: 3 };
    const entries = { "2026-01": { amounts: { A: 3000 } }, "2026-02": { amounts: { A: 3000 } } };
    const p = termPayoff(lender, entries, "2026-06");
    const { finalBalance } = computeSchedule(lender, entries, "2026-06");
    expect(p.paymentsLeft).toBe(0);
    expect(p.monthly).toBe(null);
    expect(p.remaining).toBeCloseTo(finalBalance, 6);
    expect(p.total).toBeCloseTo(6000 + finalBalance, 6);
  });

  // The proof that the monthly figure is right: record exactly that payment in
  // every remaining month of the term and the app's own balance sum must reach
  // zero in the term's last month, with every payment adding up to `total`.
  it("paying the monthly figure clears the debt exactly at the end of the term, whatever came before", () => {
    const r = seeded(20261002);
    for (let n = 0; n < 400; n++) {
      const startMonth = monthKeyAdd("2024-01", Math.floor(r.rnd() * 30));
      const termMonths = 1 + Math.floor(r.rnd() * 60);
      const lender = {
        type: "interest",
        totalAmount: 1000 + Math.round(r.rnd() * 2000000),
        annualRate: r.pick([0, 0.05, 0.09, 0.105, 0.12, 0.18, 0.24, 0.36]),
        startMonth,
        termMonths,
        // Sometimes the term begins before or after tracking did.
        termStart: r.rnd() < 0.3 ? monthKeyAdd(startMonth, Math.floor(r.rnd() * 9) - 2) : null,
      };
      const termStart = lender.termStart || startMonth;
      const endKey = monthKeyAdd(termStart, termMonths - 1);
      // "Today" is anywhere from the start to the term's last month (or the
      // start itself, when the term ended before tracking began).
      let asOf = monthKeyAdd(startMonth, Math.floor(r.rnd() * 40));
      if (asOf > endKey) asOf = endKey;
      if (asOf < startMonth) asOf = startMonth;
      // A messy history: some months paid (small, so it can't be cleared early), some missed.
      const entries = {};
      for (let k = startMonth; k <= asOf; k = monthKeyAdd(k, 1)) {
        if (k === asOf ? r.rnd() < 0.5 : r.rnd() < 0.6) entries[k] = { amounts: { A: Math.round(r.rnd() * lender.totalAmount * 0.01) } };
      }
      const p = termPayoff(lender, entries, asOf);
      expect(p.endKey).toBe(endKey);
      if (p.paymentsLeft === 0) {
        // No payment months left: the term is over, or ends this month and is already recorded.
        expect(p.remaining).toBeCloseTo(p.balance, 6);
        continue;
      }
      expect(p.monthly).toBeGreaterThan(0);
      const future = { ...entries };
      let count = 0;
      for (let k = asOf; k <= endKey; k = monthKeyAdd(k, 1)) {
        const payable = k >= termStart && !(k === asOf && entries[asOf]);
        if (payable) {
          future[k] = { amounts: { A: p.monthly } };
          count++;
        }
      }
      expect(count).toBe(p.paymentsLeft);
      const end = computeSchedule(lender, future, endKey);
      expect(Math.abs(end.finalBalance)).toBeLessThan(0.01);
      // The month before, something was still owed: it isn't cleared early.
      if (endKey > asOf) expect(computeSchedule(lender, future, monthKeyAdd(endKey, -1)).finalBalance).toBeGreaterThan(0.01);
      const allPaid = sum(end.rows.map((row) => row.totalPaid));
      expect(allPaid).toBeCloseTo(p.total, 4);
      expect(p.interest).toBeCloseTo(p.total - lender.totalAmount, 4);
    }
  });
});

describe("income", () => {
  it("counts only recorded months and estimates when capital is earned back", () => {
    const shop = { capital: 1000000, startMonth: "2026-06", usualIncome: 60000, usualExpenses: 20000 };
    const records = {
      "2026-06": { income: 50000, expenses: 25000 },
      "2026-07": { income: 70000, expenses: 20000 },
      "2026-09": { income: 30000, expenses: 40000 },
      "2026-10": { income: 99999, expenses: 0 },
    };
    const s = computeIncome(shop, records, "2026-09");
    expect(s.rows.map((r) => r.recorded)).toEqual([true, true, false, true]);
    expect(s.totalProfit).toBe(65000);
    expect(s.monthsToPayback).toBe(24);
  });

  it("applies yearly rises on top of each other, like interest", () => {
    const rent = { startMonth: "2026-09", usualIncome: 10000, usualExpenses: 1000, growth: { pct: 0.05, everyMonths: 12, firstMonth: null } };
    expect(expectedIncomeFor(rent, "2027-08")).toBe(10000);
    expect(expectedIncomeFor(rent, "2027-09")).toBeCloseTo(10500);
    expect(expectedIncomeFor(rent, "2028-09")).toBeCloseTo(11025);
    expect(nextIncomeRise(rent, "2026-09")).toEqual({ key: "2027-09", amount: 10500 });
    const flat = computeIncome({ ...rent, capital: 200000, growth: null }, {}, "2026-09");
    const rising = computeIncome({ ...rent, capital: 200000, growth: { pct: 0.2, everyMonths: 12, firstMonth: null } }, {}, "2026-09");
    expect(flat.monthsToPayback).toBe(23);
    expect(rising.monthsToPayback).toBeLessThan(flat.monthsToPayback);
  });
});

describe("debt budget made of parts", () => {
  it("treats an old single budget as one set amount with the same total", () => {
    for (const b of [0, 15000, 209000]) expect(budgetTotal(budgetPartsOf({ budget: b }), {}, "2026-09")).toBe(b);
  });

  it("adds shares of income profit, following each source's rises", () => {
    const tm = { id: "tm", startMonth: "2026-09", usualIncome: 30000, usualExpenses: 2000, growth: { pct: 0.05, everyMonths: 12, firstMonth: null } };
    const loss = { id: "loss", startMonth: "2026-01", usualIncome: 5000, usualExpenses: 8000 };
    const parts = [
      { id: "s", kind: "set", label: "Set amount", amount: 100000 },
      { id: "i", kind: "income", incomeId: "tm", share: 1 },
      { id: "l", kind: "income", incomeId: "loss", share: 1 },
      { id: "g", kind: "income", incomeId: "gone", share: 1 },
    ];
    const byId = { tm, loss };
    expect(budgetPartAmount(parts[2], byId, "2026-09")).toBe(0);
    expect(budgetTotal(parts, byId, "2026-09")).toBe(128000);
    expect(budgetTotal(parts, byId, "2027-09")).toBe(129500);
    expect(budgetTotal(parts, byId, "2028-09")).toBe(131075);
    expect(shareLabel(0.5)).toBe("half of its profit");
  });
});

describe("Strategy", () => {
  it("doesn't charge this month's interest twice (month 1 = the current month)", () => {
    const flex = { id: "f", rate: 0.12, balance: 40400, currentInterest: 400, minPayment: 0, protectFromGrowth: false, schedule: null };
    const r = simulateStrategy([flex], "avalanche", 50000);
    expect(r.firstMonthPlan.f).toBe(40400);
    expect(r.totalInterest).toBe(0);
    expect(r.months).toBe(1);
  });

  it("follows a budget that rises: ₹2L at ₹10k then ₹20k a month is cleared in 16 months, not 20", () => {
    const one = [{ id: "a", rate: 0, balance: 200000, currentInterest: 0, minPayment: 0, protectFromGrowth: false, schedule: null }];
    expect(simulateStrategy(one, "avalanche", (m) => (m <= 12 ? 10000 : 20000)).months).toBe(16);
    expect(simulateStrategy(one, "avalanche", 10000).months).toBe(20);
  });

  it("gives the same answer for a flat budget as a number or as a function", () => {
    const g = seeded(11);
    for (let t = 0; t < 300; t++) {
      const loans = randomLoans(g);
      const budget = g.pick([0, 15000, 125000]);
      expect(simulateStrategy(loans.map((l) => ({ ...l })), "avalanche", () => budget)).toEqual(
        simulateStrategy(loans.map((l) => ({ ...l })), "avalanche", budget)
      );
    }
  });

  it("finds the smallest budget that meets a debt-free goal", () => {
    const g = seeded(3);
    for (let t = 0; t < 150; t++) {
      const loans = randomLoans(g);
      const type = g.pick(["avalanche", "snowball"]);
      const target = g.pick([6, 12, 24, 60]);
      const r = budgetForTarget(loans, type, target);
      if (!r.possible) {
        expect(r.soonest).toBeGreaterThan(target);
        continue;
      }
      const meets = (b) => {
        const x = simulateStrategy(loans, type, b);
        return x.feasible && x.months <= target;
      };
      expect(meets(r.budget)).toBe(true);
      expect(meets(r.budget - 100)).toBe(false);
      expect(r.budget % 100).toBe(0);
    }
  });

  it("rounds the goal budget to 10 in currencies that use a step of 10", () => {
    const g = seeded(5);
    for (let t = 0; t < 60; t++) {
      const loans = randomLoans(g, { plans: false });
      const type = g.pick(["avalanche", "snowball"]);
      const target = g.pick([12, 24, 60]);
      const r = budgetForTarget(loans, type, target, null, 10);
      if (!r.possible) continue;
      const meets = (b) => {
        const x = simulateStrategy(loans, type, b);
        return x.feasible && x.months <= target;
      };
      expect(meets(r.budget)).toBe(true);
      expect(meets(r.budget - 10)).toBe(false);
      expect(r.budget % 10).toBe(0);
    }
  });

  it("says ₹0 when rising income alone meets the goal", () => {
    const small = [{ id: "s", rate: 0, balance: 1000, currentInterest: 0, minPayment: 0, protectFromGrowth: false, schedule: null }];
    expect(budgetForTarget(small, "avalanche", 24, (m) => (m > 12 ? 5000 : 0))).toEqual({ possible: true, budget: 0 });
  });

  it("records the balance month by month without changing any result", () => {
    const g = seeded(11);
    for (let t = 0; t < 120; t++) {
      const loans = randomLoans(g);
      const type = g.pick(["avalanche", "snowball"]);
      const budget = g.pick([10000, 60000, 125000, 400000]);
      const plain = simulateStrategy(loans.map((l) => ({ ...l })), type, budget);
      const tracked = simulateStrategy(loans.map((l) => ({ ...l })), type, budget, 600, { track: true });
      const { balances, ...rest } = tracked;
      expect(rest).toEqual(plain);
      if (!plain.feasible) {
        expect(balances).toBeUndefined();
        continue;
      }
      expect(balances.length).toBe(plain.months);
      if (plain.months < 600) expect(balances[balances.length - 1]).toBeLessThan(0.5 * loans.length + 0.01);
      balances.forEach((b) => expect(b).toBeGreaterThanOrEqual(0));
    }
  });

  it("status quo: month 1 adds no interest", () => {
    const l = { id: "x", rate: 0.12, balance: 10100, currentInterest: 100, currentPayment: 10100, schedule: null };
    const r = simulateStatusQuo([l]);
    expect(r.payoffMonth.x).toBe(1);
    expect(r.totalInterest).toBe(0);
  });
});

describe("currency", () => {
  it("shows rupees by default, and each person's chosen currency", () => {
    expect(fmt(1234567)).toBe("₹12,34,567");
    expect(currencySymbol()).toBe("₹");
    setCurrency("AED");
    try {
      expect(fmt(1234567.4)).toBe("AED 1,234,567");
      expect(currencySymbol()).toBe("AED");
      expect(fmtIn(1500, "INR")).toBe("₹1,500");
    } finally {
      setCurrency("INR");
    }
    expect(fmtIn(99, "XYZ")).toBe("₹99");
    expect(fmt(0)).toBe("₹0");
  });

  it("shortens money for charts: lakh and crore in rupees, k and M elsewhere", () => {
    expect(fmtCompact(656147)).toBe("₹6.6L");
    expect(fmtCompact(12500000)).toBe("₹1.3Cr");
    expect(fmtCompact(15000)).toBe("₹15k");
    expect(fmtCompact(999)).toBe("₹999");
    expect(fmtCompact(-2500)).toBe("−₹2.5k");
    setCurrency("AED");
    try {
      expect(fmtCompact(1234567)).toBe("AED 1.2M");
      expect(fmtCompact(250000)).toBe("AED 250k");
    } finally {
      setCurrency("INR");
    }
  });
});

describe("golden snapshot", () => {
  it("keeps today's Strategy results for 150 fixed sets of debts", () => {
    const g = seeded(2026);
    const results = [];
    for (let t = 0; t < 150; t++) {
      const loans = randomLoans(g);
      const budget = g.pick([10000, 60000, 125000, 400000]);
      const type = g.pick(["avalanche", "snowball"]);
      const r = simulateStrategy(loans.map((l) => ({ ...l })), type, budget);
      const round = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, Math.round(v)]));
      results.push(
        r.feasible
          ? { months: r.months, interest: Math.round(r.totalInterest), payoff: r.payoffMonth, first: round(r.firstMonthPlan) }
          : { minRequired: Math.round(r.minRequired) }
      );
    }
    expect(results).toMatchSnapshot();
    expect(monthKeyAdd("2026-12", 1)).toBe("2027-01");
  });
});
