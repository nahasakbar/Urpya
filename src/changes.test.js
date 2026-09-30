import { describe, it, expect } from "vitest";
import { undoOf } from "./changes.js";

const base = {
  people: ["A", "B"],
  lenders: [
    { id: "d1", name: "Bank", totalAmount: 100 },
    { id: "d2", name: "Uncle", totalAmount: 50 },
  ],
  payments: { d1: { "2026-08": { amounts: { A: 10 } } }, d2: {} },
  strategy: { budget: 100, type: "avalanche" },
  incomes: [{ id: "i1", name: "Shop" }],
  incomeRecords: { i1: {} },
};

describe("Undo", () => {
  it("puts back a recorded payment, an edit, an addition and a deletion", () => {
    const recorded = { ...base, payments: { ...base.payments, d1: { ...base.payments.d1, "2026-09": { amounts: { A: 5 } } } } };
    expect(undoOf(base, recorded, recorded)).toEqual(base);

    const edited = { ...base, lenders: [{ ...base.lenders[0], totalAmount: 999 }, base.lenders[1]] };
    expect(undoOf(base, edited, edited)).toEqual(base);

    const added = { ...base, lenders: [...base.lenders, { id: "d3", name: "New" }] };
    expect(undoOf(base, added, added)).toEqual(base);

    const deleted = { ...base, lenders: [base.lenders[1]] };
    expect(undoOf(base, deleted, deleted)).toEqual(base);

    const budget = { ...base, strategy: { budget: 5, type: "snowball" } };
    expect(undoOf(base, budget, budget)).toEqual(base);

    const currency = { ...base, currency: "AED" };
    expect(undoOf(base, currency, currency)).toEqual({ ...base, currency: undefined });

    const invited = { ...base, contacts: [{ name: "Riyas", email: "riyas@example.com" }] };
    expect(undoOf(base, invited, invited)).toEqual({ ...base, contacts: undefined });
  });

  it("leaves alone anything someone else changed in the meantime", () => {
    const mine = { ...base, payments: { ...base.payments, d1: { ...base.payments.d1, "2026-09": { amounts: { A: 5 } } } } };
    // Meanwhile someone else recorded Uncle's payment and renamed the shop.
    const current = {
      ...mine,
      payments: { ...mine.payments, d2: { "2026-09": { amounts: { B: 7 } } } },
      incomes: [{ id: "i1", name: "Shop (renamed)" }],
    };
    const undone = undoOf(base, mine, current);
    expect(undone.payments.d1["2026-09"]).toBeUndefined();
    expect(undone.payments.d1["2026-08"]).toEqual({ amounts: { A: 10 } });
    expect(undone.payments.d2["2026-09"]).toEqual({ amounts: { B: 7 } });
    expect(undone.incomes[0].name).toBe("Shop (renamed)");
  });
});
