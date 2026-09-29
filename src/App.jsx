import { useState, useEffect, useRef } from "react";
import {
  Home,
  Landmark,
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
  User,
  Share2,
  LogOut,
  CalendarPlus,
  Download,
  RotateCcw,
  Mail,
  Shield,
} from "lucide-react";
import { supabase } from "./supabaseClient.js";
import * as store from "./store.js";
import { buildCalendar } from "./calendar.js";
import { describeChange } from "./activity.js";

import {
  uid,
  fmt,
  fmtIn,
  setCurrency,
  currencySymbol,
  currencyInfo,
  CURRENCIES,
  DEFAULT_CURRENCY,
  pad2,
  currentMonthKey,
  monthKeyAdd,
  monthsBetween,
  monthKeyLabel,
  monthKeyShort,
  ordinal,
  CATEGORIES,
  INCOME_CATEGORIES,
  categoryLabel,
  defaultData,
  migrateData,
  computeSchedule,
  getCurrentPayment,
  getSuggestedMonth,
  spreadPlanAmounts,
  planDueFor,
  upcomingPlanAmounts,
  planShortfall,
  planYearlyRate,
  firstIncomeRise,
  hasIncomeGrowth,
  expectedIncomeFor,
  incomeGrowthLabel,
  nextIncomeRise,
  computeIncome,
  monthsLabel,
  month1Interest,
  simulateStrategy,
  simulateStatusQuo,
  GOAL_EXTRA_LABEL,
  budgetPartsOf,
  budgetPartAmount,
  budgetTotal,
  shareLabel,
  budgetForTarget,
} from "./calc.js";
import { styles } from "./styles.js";


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
        <label>Total amount borrowed ({currencySymbol()})</label>
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
          <label>Total to repay ({currencySymbol()})</label>
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
            otherwise send it {fmt(0)}.
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
          <label>First month’s payment ({currencySymbol()})</label>
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
            {type === "fixed" ? "Monthly payment" : "Minimum monthly payment"} ({currencySymbol()}) — leave 0 if flexible
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
          No names yet — add them in the Account tab first.
        </p>
      )}
      {people.map((p) => (
        <div className="fl-field" key={p}>
          <label>{p}’s contribution ({currencySymbol()})</label>
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
                  {src && hasIncomeGrowth(src) ? ` · rises ${incomeGrowthLabel(src.growth)}, and this share with it` : ""}
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
                placeholder={`Amount each month (${currencySymbol()})`}
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
        <label>Capital put in ({currencySymbol()}) — leave 0 if none</label>
        <input type="number" inputMode="decimal" value={capital} onChange={(e) => setCapital(e.target.value)} placeholder="0" />
      </div>

      <div className="fl-field">
        <label>Usual monthly income ({currencySymbol()})</label>
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
        <label>Usual monthly expenses ({currencySymbol()})</label>
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
        <label>Income ({currencySymbol()})</label>
        <input type="number" inputMode="decimal" value={income} onChange={(e) => setIncome(e.target.value)} />
      </div>
      <div className="fl-field">
        <label>Expenses ({currencySymbol()})</label>
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

// "shared · 2" on your items that others can see; "from riyas" on items
// someone has shared with you.
function SharedChip({ a }) {
  if (!a.owner) return <span className="fl-chip chip-shared">from {(a.ownerEmail || "").split("@")[0]}</span>;
  if (a.shares.length) return <span className="fl-chip chip-shared">shared · {a.shares.length}</span>;
  return null;
}

// Sharing controls for one debt or income source: the owner adds or removes
// people (can edit / view only); someone it's shared with can leave.
function SharePanel({ itemName, a, myEmail, onShare, onUnshare, kindLabel }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("editor");
  const [justShared, setJustShared] = useState(null);
  const appUrl = typeof window !== "undefined" ? window.location.origin : "";

  function inviteText(to) {
    return `I've shared “${itemName}” with you on Ledger. Open ${appUrl} and sign in with ${to} to see it.`;
  }

  async function sendInvite(to) {
    const text = inviteText(to);
    try {
      if (navigator.share) {
        await navigator.share({ title: "Ledger", text });
        return;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setJustShared({ email: to, copied: true });
    } catch (e) {
      window.location.href = `mailto:${to}?subject=${encodeURIComponent("Ledger")}&body=${encodeURIComponent(text)}`;
    }
  }

  if (!a.owner) {
    return (
      <div className="fl-panel">
        <p className="fl-panel-title fl-serif">Shared with you</p>
        <p className="fl-card-sub" style={{ marginBottom: 10 }}>
          {a.ownerEmail} shared this {kindLabel} with you — you can {a.canEdit ? "record and edit" : "only view"} it.
        </p>
        <div className="fl-form-actions">
          <ConfirmTextButton label="Leave" confirmLabel="Yes, leave" onConfirm={() => onUnshare(myEmail, true)} />
        </div>
      </div>
    );
  }

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  return (
    <div className="fl-panel">
      <p className="fl-panel-title fl-serif">Sharing</p>
      {a.shares.length === 0 && (
        <p className="fl-card-sub" style={{ marginBottom: 10 }}>
          Only you can see this {kindLabel}. Share it with someone to manage it together.
        </p>
      )}
      {a.shares.map((sh) => (
        <div className="fl-share-row" key={sh.email}>
          <span className="fl-share-email">
            {sh.email}
            <span className="fl-card-sub"> · {sh.role === "viewer" ? "view only" : "can edit"}</span>
          </span>
          <button className="fl-icon-btn" onClick={() => sendInvite(sh.email)} aria-label={"Send invite to " + sh.email}>
            <Mail size={16} />
          </button>
          <ConfirmButton label={"stop sharing with " + sh.email} onConfirm={() => onUnshare(sh.email, false)} />
        </div>
      ))}
      <div className="fl-field" style={{ marginTop: 10 }}>
        <label>Share with (their email)</label>
        <input
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@example.com"
        />
      </div>
      <div className="fl-tag-picker" style={{ marginBottom: 10 }}>
        {[
          ["editor", "Can edit"],
          ["viewer", "View only"],
        ].map(([r, label]) => (
          <button
            key={r}
            type="button"
            className={"fl-tag-option" + (role === r ? " selected" : "")}
            aria-pressed={role === r}
            onClick={() => setRole(r)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="fl-form-actions">
        <button
          className="fl-btn"
          disabled={!valid}
          onClick={async () => {
            const to = email.trim().toLowerCase();
            if (await onShare(to, role)) {
              setEmail("");
              setJustShared({ email: to, copied: false });
            }
          }}
        >
          <Share2 size={14} /> Share
        </button>
      </div>
      {justShared && (
        <p className="fl-card-sub" style={{ marginTop: 10 }}>
          {justShared.copied
            ? "Invite copied — paste it into WhatsApp or a message."
            : `Shared with ${justShared.email}. They’ll see it when they sign in with that email.`}{" "}
          {!justShared.copied && (
            <button className="fl-link" onClick={() => sendInvite(justShared.email)}>
              Send them an invite
            </button>
          )}
        </p>
      )}
    </div>
  );
}

// A button that asks "are you sure?" before doing something you can't undo
// from the toast (like leaving a shared item).
function ConfirmTextButton({ label, confirmLabel, onConfirm }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button className="fl-btn secondary" onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  }
  return (
    <>
      <button className="fl-btn secondary" onClick={() => setAsking(false)}>
        Cancel
      </button>
      <button className="fl-btn danger" onClick={onConfirm}>
        {confirmLabel}
      </button>
    </>
  );
}

function CurrencySelect({ value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Currency">
      {CURRENCIES.map((c) => (
        <option key={c.code} value={c.code}>
          {c.symbol.trim()} · {c.name} ({c.code})
        </option>
      ))}
    </select>
  );
}

// The first steps for someone new: on the welcome screen and an empty Dashboard.
function GettingStartedSteps() {
  return (
    <ol className="fl-steps">
      <li>
        <strong>Add your debts</strong> — loans, credit cards, money borrowed from family. Debts tab, then +.
      </li>
      <li>
        <strong>Record payments</strong> as you make them — tap a debt’s due tag on the Dashboard.
      </li>
      <li>
        <strong>Add your income</strong> — salary, a business, rent. Income tab, then +.
      </li>
      <li>
        <strong>Make a plan</strong> — on the Strategy tab, set what you can put toward debts each month and see when
        you’ll be debt-free.
      </li>
      <li>
        <strong>Share</strong> any debt or income source with family from its page, if you manage it together.
      </li>
    </ol>
  );
}

// In plain words: what's kept, who sees it, and how to take it or delete it.
function PrivacyNote() {
  return (
    <div className="fl-prose">
      <p className="fl-panel-title fl-serif">What Ledger keeps</p>
      <p>
        Your email address, so you can sign in, and what you type in: debts, payments, income, your budget and the
        names you add. Nothing else — no contacts, no location and no bank connection.
      </p>
      <p className="fl-panel-title fl-serif">Who can see it</p>
      <p>
        Only you — plus anyone you share a particular debt or income source with, who sees just that item, its
        monthly entries and its history. Signed-out visitors see nothing.
      </p>
      <p>
        Everything is stored with Supabase, a database hosting company, and sign-in codes are sent through Gmail. The
        person who runs Ledger can reach the database, as with any website, but doesn’t look at or share what’s in
        it. There are no ads, and nothing is sold or used to track you.
        {TURNSTILE_SITE_KEY && " The sign-in page uses Cloudflare Turnstile to check you’re a person, not a bot."}
      </p>
      <p className="fl-panel-title fl-serif">Your data, your choice</p>
      <p>
        Account → Download a backup gives you a copy of everything, any time. Account → Delete my account removes
        your account and everything you own, straight away. Items other people shared with you stay theirs,
        including anything you recorded on them.
      </p>
      <p className="fl-panel-title fl-serif">Not financial advice</p>
      <p>
        Balances, plans and dates are worked out from what you enter, to help you think things through. Check
        anything important with your lender.
      </p>
      <p className="fl-panel-title fl-serif">Questions</p>
      <p>Reply to any sign-in email from Ledger.</p>
    </div>
  );
}

// "Delete my account" — asks for DELETE to be typed, since it can't be undone.
function DeleteAccountPanel({ onDelete }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const ready = typed.trim().toUpperCase() === "DELETE";
  return (
    <div className="fl-panel">
      <p className="fl-card-sub" style={{ marginBottom: 10 }}>
        Deletes your account and everything you own in Ledger: every debt and income source, all their monthly
        entries and history, and your settings. People you’ve shared them with lose them too. This can’t be undone,
        so download a backup first if you might want it.
      </p>
      <div className="fl-field">
        <label>Type DELETE to confirm</label>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          placeholder="DELETE"
        />
      </div>
      <div className="fl-form-actions">
        <button
          className="fl-btn danger"
          disabled={!ready || busy}
          onClick={async () => {
            setBusy(true);
            if (!(await onDelete())) setBusy(false);
          }}
        >
          <Trash2 size={14} /> {busy ? "Deleting…" : "Delete my account"}
        </button>
      </div>
    </div>
  );
}

// Cloudflare Turnstile, the robot check on the sign-in screen. The site key is
// public (it's in every visitor's page); its secret half lives only in
// Supabase → Authentication → Attack Protection, which then refuses code
// requests without a passed check. Off on this computer (localhost isn't one
// of the widget's hostnames); VITE_TURNSTILE_SITE_KEY overrides it, e.g. with
// Cloudflare's always-pass test key for local testing.
const LEDGER_TURNSTILE_KEY = "0x4AAAAAAFJk5k_Kq87TX9qt";
const onLocalhost =
  typeof window !== "undefined" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || (onLocalhost ? "" : LEDGER_TURNSTILE_KEY);

let turnstileLoading = null;
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!turnstileLoading) {
    turnstileLoading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile missing")));
      script.onerror = () => {
        turnstileLoading = null;
        reject(new Error("Turnstile didn’t load"));
      };
      document.head.appendChild(script);
    });
  }
  return turnstileLoading;
}

// Gives a fresh pass token for each code request. The check is invisible
// unless Cloudflare wants a tap. `failed` is Cloudflare's error code, if any.
function useTurnstile(siteKey) {
  const boxRef = useRef(null);
  const widgetRef = useRef(null);
  const [token, setToken] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;
    loadTurnstile().then(
      (ts) => {
        if (cancelled || !boxRef.current) return;
        widgetRef.current = ts.render(boxRef.current, {
          sitekey: siteKey,
          theme: "light",
          appearance: "interaction-only",
          callback: (t) => {
            setToken(t);
            setFailed(false);
          },
          "expired-callback": () => setToken(null),
          "error-callback": (code) => {
            setToken(null);
            setFailed(String(code || "unknown"));
          },
        });
      },
      () => !cancelled && setFailed("didn’t load")
    );
    return () => {
      cancelled = true;
      if (widgetRef.current != null && window.turnstile) window.turnstile.remove(widgetRef.current);
      widgetRef.current = null;
    };
  }, [siteKey]);
  // A pass can only be used once, so each request needs a new one.
  function reset() {
    setToken(null);
    if (widgetRef.current != null && window.turnstile) window.turnstile.reset(widgetRef.current);
  }
  return { enabled: !!siteKey, boxRef, token, failed, reset };
}

// Sign in with a 6-digit code sent by email — no password, and it works inside
// the Home Screen app (a sign-in link would open Safari instead).
function SignIn({ notice }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showPrivacy, setShowPrivacy] = useState(false);
  const bot = useTurnstile(TURNSTILE_SITE_KEY);
  const waitingForBot = bot.enabled && !bot.token;

  async function sendCode() {
    const addr = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) return setError("Enter your email address.");
    // If the check couldn't run, ask anyway: Supabase decides whether a
    // request without a pass is allowed.
    if (waitingForBot && !bot.failed) return setError("One moment — just checking you’re a person, not a bot.");
    setBusy(true);
    setError("");
    const options = { shouldCreateUser: true };
    if (bot.token) options.captchaToken = bot.token;
    const { error: err } = await supabase.auth.signInWithOtp({ email: addr, options });
    if (bot.enabled) bot.reset();
    setBusy(false);
    if (err) {
      console.error("send code failed", err);
      const msg = err.message || "";
      setError(
        /captcha/i.test(msg)
          ? "The robot check didn’t go through — reload the page and try again."
          : /rate|seconds|many/i.test(msg)
          ? "Too many codes asked for just now — wait a minute and try again."
          : "Couldn’t send the code — check the email and your connection."
      );
      return;
    }
    setEmail(addr);
    setStage("code");
  }

  async function verify() {
    const token = code.replace(/\D/g, "");
    if (token.length < 6) return setError("Enter the code from the email.");
    setBusy(true);
    setError("");
    const { error: err } = await supabase.auth.verifyOtp({ email, token, type: "email" });
    setBusy(false);
    if (err) {
      console.error("verify failed", err);
      setError("That code didn’t work — check it, or send a new one.");
    }
  }

  return (
    <div className="fl-shell">
      <style>{styles}</style>
      <div className="fl-topbar fl-leather fl-stitch-bottom">
        <div className="fl-grain fl-grain-leather"></div>
        <div className="fl-topbar-rivets">
          <div className="fl-rivet"></div>
          <div className="fl-rivet"></div>
        </div>
        <div className="fl-z1">
          <h1 className="fl-title fl-serif">Ledger</h1>
          <p className="fl-subtitle">Your debts and income, shared only with who you choose</p>
        </div>
      </div>
      <div className="fl-content">
        {notice && (
          <div className="fl-panel" style={{ marginTop: 8 }}>
            <p className="fl-card-sub">{notice}</p>
          </div>
        )}
        <div className="fl-panel" style={{ marginTop: 8 }}>
          {stage === "email" ? (
            <>
              <p className="fl-panel-title fl-serif">Sign in</p>
              <div className="fl-field">
                <label>Your email</label>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendCode()}
                  placeholder="name@example.com"
                />
              </div>
              <p className="fl-card-sub" style={{ marginBottom: 12 }}>
                We’ll email you a code to sign in. No password needed. New here? The same code creates your account.
              </p>
              <div className="fl-form-actions">
                <button className="fl-btn" onClick={sendCode} disabled={busy || (waitingForBot && !bot.failed)}>
                  {busy ? "Sending…" : waitingForBot && !bot.failed ? "One moment…" : "Email me a code"}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="fl-panel-title fl-serif">Enter your code</p>
              <p className="fl-card-sub" style={{ marginBottom: 10 }}>
                We sent a code to {email}. It can take a minute — check spam too.
              </p>
              <div className="fl-field">
                <label>Code</label>
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && verify()}
                  placeholder="123456"
                  className="fl-code-input"
                />
              </div>
              <div className="fl-form-actions">
                <button
                  className="fl-btn secondary"
                  onClick={() => {
                    setStage("email");
                    setCode("");
                    setError("");
                  }}
                  disabled={busy}
                >
                  Different email
                </button>
                <button className="fl-btn" onClick={verify} disabled={busy}>
                  {busy ? "Checking…" : "Sign in"}
                </button>
              </div>
              <button className="fl-link" style={{ marginTop: 12 }} onClick={sendCode} disabled={busy || (waitingForBot && !bot.failed)}>
                Send a new code
              </button>
            </>
          )}
          {error && (
            <p className="fl-overdue" style={{ marginTop: 12 }}>
              <AlertCircle size={12} /> {error}
            </p>
          )}
          {bot.enabled && <div className="fl-turnstile" ref={bot.boxRef} />}
          {bot.failed && (
            <p className="fl-card-sub" style={{ marginTop: 10 }}>
              The robot check couldn’t run here (error {bot.failed}).
            </p>
          )}
        </div>
        <p className="fl-signin-links">
          <button className="fl-link" onClick={() => setShowPrivacy(true)}>
            Privacy — what’s kept and who can see it
          </button>
        </p>
      </div>
      {showPrivacy && (
        <Sheet title="Privacy" onClose={() => setShowPrivacy(false)}>
          <PrivacyNote />
        </Sheet>
      )}
    </div>
  );
}

// Signed-in person → their ledger; otherwise the sign-in screen.
export default function App() {
  const [session, setSession] = useState(undefined);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  if (session === undefined) {
    return (
      <div className="fl-shell">
        <style>{styles}</style>
        <div className="fl-empty">Loading…</div>
      </div>
    );
  }
  if (!session) return <SignIn notice={notice} />;
  return (
    <Ledger
      key={session.user.id}
      user={session.user}
      onAccountDeleted={() => setNotice("Your account and everything in it has been deleted.")}
    />
  );
}

function Ledger({ user, onAccountDeleted }) {
  const myEmail = (user.email || "").toLowerCase();
  // A starting name for recording payments: the first part of the email.
  const myName = (() => {
    const local = myEmail.split("@")[0].replace(/[._-]+/g, " ").trim() || "Me";
    return local.charAt(0).toUpperCase() + local.slice(1);
  })();
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
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  // Row versions and sharing per item (see store.js), outside React state so a
  // save can update them as it goes.
  const metaRef = useRef({ items: {}, entries: {}, settingsVersion: null });
  // The latest data, for saving: a save (or an Undo tapped seconds later) must
  // compare against what's on screen now, not the copy from when it was created.
  const dataRef = useRef(null);
  function showData(next) {
    dataRef.current = next;
    setData(next);
  }
  const deletedIdsRef = useRef(new Set());
  const saveQueue = useRef(Promise.resolve());
  const savingCount = useRef(0);
  const reloadWanted = useRef(false);
  const reloadTimer = useRef(null);
  const [hasSettings, setHasSettings] = useState(true);
  const [oldLedger, setOldLedger] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const [recordTarget, setRecordTarget] = useState(null);
  const [activity, setActivity] = useState(null);
  const [deletedItems, setDeletedItems] = useState(null);
  const [welcomeCurrency, setWelcomeCurrency] = useState(DEFAULT_CURRENCY);
  const [showPrivacy, setShowPrivacy] = useState(false);

  async function reload() {
    try {
      const rows = await store.loadEverything();
      const { data: next, meta, hasSettings: hs } = store.assemble(rows);
      metaRef.current = meta;
      showData(next);
      setHasSettings(hs);
      setConnectionError(false);
    } catch (e) {
      console.error("load failed", e);
      setConnectionError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    store.readOldLedger().then(setOldLedger, () => setOldLedger(null));
    // Live updates from other people. Our own saves echo back too, so wait until
    // they've finished before refreshing.
    const unsubscribe = store.subscribe(() => {
      clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => {
        if (savingCount.current > 0) reloadWanted.current = true;
        else reload();
      }, 700);
    });
    return () => {
      unsubscribe();
      clearTimeout(reloadTimer.current);
    };
  }, []);

  function showToast(msg, undo = null, ms = undo ? 6000 : 1600) {
    setToast({ msg, undo });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }

  // Shows the change straight away, then saves just the rows that changed (in
  // order, one save at a time). Every save offers Undo, which saves the state
  // from before. If someone else changed the same thing meanwhile, nothing is
  // overwritten: the latest is loaded and the person is told.
  function persist(next, { message = "Saved", undoable = true } = {}) {
    const prev = dataRef.current;
    showData(next);
    savingCount.current++;
    saveQueue.current = saveQueue.current.then(async () => {
      try {
        await store.saveChanges(prev, next, metaRef.current, user.id, deletedIdsRef.current);
        showToast(
          message,
          undoable ? () => persist(store.undoOf(prev, next, dataRef.current), { message: "Undone", undoable: false }) : null
        );
      } catch (e) {
        console.error("save failed", e);
        showToast(
          e instanceof store.ConflictError
            ? "Someone else changed this at the same time — showing the latest now. Please check it and try again."
            : "Couldn’t save — check your connection and try again.",
          null,
          6000
        );
        await reload();
      } finally {
        savingCount.current--;
        if (savingCount.current === 0 && reloadWanted.current) {
          reloadWanted.current = false;
          reload();
        }
      }
    });
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
          Couldn’t load your ledger — check your connection.
          <div className="fl-form-actions" style={{ marginTop: 16 }}>
            <button className="fl-btn secondary" onClick={() => supabase.auth.signOut()}>
              Sign out
            </button>
            <button
              className="fl-btn"
              onClick={() => {
                setLoading(true);
                reload();
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // Amounts show in the person's own currency (only the symbol; nothing is
  // converted). An item shared with you is in its owner's currency; one that
  // differs from yours is left out of your lists and totals, and listed with
  // a note instead, so two currencies are never added together.
  const myCurrency = data.currency || DEFAULT_CURRENCY;
  setCurrency(myCurrency);
  function itemCurrency(id) {
    const m = metaRef.current.items[id];
    if (!m || m.ownerId === user.id) return myCurrency;
    return m.currency || DEFAULT_CURRENCY;
  }
  const otherCurrencyItems = [
    ...data.lenders.map((x) => ({ kind: "debt", id: x.id, name: x.name })),
    ...(data.incomes || []).map((x) => ({ kind: "income", id: x.id, name: x.name })),
  ]
    .filter((x) => itemCurrency(x.id) !== myCurrency)
    .map((x) => ({ ...x, currency: itemCurrency(x.id), ownerEmail: (metaRef.current.items[x.id] || {}).ownerEmail || "" }));

  // Everything below (lists, totals, Strategy) uses these. Saves build on the
  // full data.lenders / data.incomes, so hidden items are never dropped.
  const lenders = data.lenders.filter((l) => itemCurrency(l.id) === myCurrency);
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
  const incomes = (data.incomes || []).filter((s) => itemCurrency(s.id) === myCurrency);
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
  // The budget month by month for the next 50 years (index 0 = this month). An
  // income share follows its source's expected profit, so it rises with the
  // income (yearly increases, or a source that hasn't started yet).
  const budgetByMonth = Array.from({ length: 600 }, (_, i) =>
    i === 0 ? effectiveBudget : budgetTotal(budgetParts, incomesById, monthKeyAdd(asOfKey, i))
  );
  const budgetRises = budgetByMonth.some((b) => Math.abs(b - effectiveBudget) > 0.5);
  // What the Strategy simulations get: the plain number when it never changes
  // (exactly as before), otherwise month m's budget.
  const strategyBudget = budgetRises ? (m) => budgetByMonth[Math.min(m, 600) - 1] : effectiveBudget;
  const nextBudgetRise = (() => {
    const i = budgetByMonth.findIndex((b) => b > effectiveBudget + 0.5);
    return i > 0 ? { key: monthKeyAdd(asOfKey, i), amount: budgetByMonth[i] } : null;
  })();
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
        currentInterest: rows.length > 0 ? rows[rows.length - 1].interest : 0,
      };
    })
    .filter((l) => l.balance > 0.5);

  const strategyResult =
    strategyLoans.length > 0
      ? simulateStrategy(strategyLoans, strategy.type, strategyBudget)
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
    goalMonths && strategyLoans.length > 0
      ? budgetForTarget(
          strategyLoans,
          strategy.type,
          goalMonths,
          budgetRises ? (m) => budgetByMonth[Math.min(m, 600) - 1] - effectiveBudget : null,
          currencyInfo(myCurrency).step
        )
      : null;
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
              {fmt(goalResult.budget)} a month{budgetRises ? " now" : ""}
            </p>
            {budgetRises && (
              <p className="fl-card-sub" style={{ marginTop: 2 }}>
                Then rising on its own as your income shares grow.
              </p>
            )}
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
    const newLoan = { id: store.newId(), position: Date.now(), ...fields };
    persist({ ...data, lenders: [...data.lenders, newLoan] }, { message: "Debt added" });
    setShowAddLoan(false);
  }

  function updateLoan(id, fields) {
    const nextLenders = data.lenders.map((l) => (l.id === id ? { ...l, ...fields } : l));
    persist({ ...data, lenders: nextLenders });
    setEditingLoanId(null);
  }

  // Deleting keeps the monthly entries, so Undo or "Recently deleted" can bring
  // the debt back complete.
  function deleteLoan(id) {
    persist({ ...data, lenders: data.lenders.filter((l) => l.id !== id) }, { message: "Deleted" });
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
    persist({ ...data, payments: { ...payments, [loanId]: nextEntries } }, { message: "Payment saved" });
    setPendingMonthKey(null);
    setRecordTarget(null);
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
    persist({ ...data, incomes: [...(data.incomes || []), { id: store.newId(), position: Date.now(), ...fields }] }, { message: "Income source added" });
    setShowAddIncome(false);
  }

  function updateIncome(id, fields) {
    persist({ ...data, incomes: (data.incomes || []).map((s) => (s.id === id ? { ...s, ...fields } : s)) });
    setEditingIncomeId(null);
  }

  function deleteIncome(id) {
    const next = { ...data, incomes: (data.incomes || []).filter((s) => s.id !== id) };
    if (Array.isArray(strategy.budgetParts)) {
      const parts = strategy.budgetParts.filter((p) => !(p.kind === "income" && p.incomeId === id));
      next.strategy = { ...strategy, budgetParts: parts, budget: budgetTotal(parts, incomesById, asOfKey) };
    }
    persist(next, { message: "Deleted" });
    if (selectedIncomeId === id) {
      setSelectedIncomeId(null);
      setView("income");
    }
  }

  function saveIncomeMonth(id, monthKey, figures) {
    const existing = incomeRecords[id] || {};
    persist({ ...data, incomeRecords: { ...incomeRecords, [id]: { ...existing, [monthKey]: figures } } }, { message: "Figures saved" });
    setPendingIncomeMonth(null);
    setRecordTarget(null);
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

  // ---- Ownership and sharing ----
  // Owner: full control. Shared "editor": can record and edit, not delete.
  // Shared "viewer": can only look.
  function access(id) {
    const m = metaRef.current.items[id];
    if (!m) return { owner: true, canEdit: true, shares: [], ownerEmail: myEmail };
    const owner = m.ownerId === user.id;
    const mine = m.shares.find((x) => x.email === myEmail);
    return { owner, canEdit: owner || (mine && mine.role === "editor"), shares: m.shares, ownerEmail: m.ownerEmail, myRole: mine && mine.role };
  }

  // Contributor names to show for a debt: yours, plus any used on it before
  // (a shared debt can have payments recorded under other people's names).
  function namesFor(loanId) {
    const seen = new Set(people.length ? people : [myName]);
    Object.values(payments[loanId] || {}).forEach((e) => Object.keys((e && e.amounts) || {}).forEach((n) => seen.add(n)));
    return [...seen];
  }

  async function shareItem(itemId, email, role) {
    try {
      await store.addShare(itemId, email, role);
      await reload();
      showToast("Shared");
      return true;
    } catch (e) {
      console.error("share failed", e);
      showToast(e && e.code === "23505" ? "Already shared with that email" : "Couldn’t share — check the email and try again", null, 4000);
      return false;
    }
  }

  async function unshareItem(itemId, email, leaving) {
    try {
      await store.removeShare(itemId, email);
      if (leaving) {
        setSelectedLoanId(null);
        setSelectedIncomeId(null);
        setView("dashboard");
      }
      await reload();
      showToast(leaving ? "You’ve left it" : "Stopped sharing");
    } catch (e) {
      console.error("unshare failed", e);
      showToast("Couldn’t change sharing — try again", null, 4000);
    }
  }

  // ---- First run: bring in the old family ledger, or start fresh ----
  // Only one person should import it: once someone has, everyone else is told
  // to ask them to share instead of making a duplicate copy.
  const oldImportedBy = oldLedger && oldLedger.importedBy;
  const canImport = !!oldLedger && (!oldImportedBy || oldImportedBy === myEmail);
  function totalOwed(d) {
    return d.lenders.reduce((sum, l) => sum + computeSchedule(l, (d.payments || {})[l.id] || {}, asOfKey).finalBalance, 0);
  }

  async function importFamilyLedger() {
    if (!canImport || importing) return;
    setImporting(true);
    try {
      const counts = await store.importOldLedger(oldLedger.ledger, metaRef.current, user.id);
      await store.markOldLedgerImported(myEmail).catch((e) => console.error("mark imported failed", e));
      setOldLedger({ ...oldLedger, importedBy: myEmail });
      const rows = await store.loadEverything();
      const { data: next, meta, hasSettings: hs } = store.assemble(rows);
      metaRef.current = meta;
      showData(next);
      setHasSettings(hs);
      const before = totalOwed(oldLedger.ledger);
      const after = totalOwed(next);
      setImportResult({ ...counts, before, after, matches: Math.abs(before - after) < 1 && next.lenders.length === counts.debts });
    } catch (e) {
      console.error("import failed", e);
      showToast("Import didn’t finish — nothing in the old ledger was changed. Try again.", null, 6000);
      await reload();
    } finally {
      setImporting(false);
    }
  }

  async function startFresh(currency = DEFAULT_CURRENCY) {
    try {
      await store.saveSettings(
        { people: [myName], strategy: { budget: 0, type: "avalanche" }, currency },
        metaRef.current,
        user.id
      );
      await reload();
    } catch (e) {
      console.error("start failed", e);
      showToast("Couldn’t save — check your connection and try again.", null, 5000);
    }
  }

  // ---- Account tools ----
  function changeCurrency(code) {
    if (code === myCurrency) return;
    persist({ ...data, currency: code }, { message: `Currency: ${currencyInfo(code).name}` });
  }

  // Waits for any save still going, then deletes everything in one step. Only
  // signs out once the database confirms the deletion.
  async function deleteAccount() {
    try {
      await saveQueue.current;
      await store.deleteMyAccount();
    } catch (e) {
      console.error("delete account failed", e);
      showToast("Couldn’t delete your account — nothing was removed. Check your connection and try again.", null, 6000);
      return false;
    }
    onAccountDeleted();
    await supabase.auth.signOut({ scope: "local" }).catch((e) => console.error("sign out failed", e));
    return true;
  }

  async function loadAccountLists() {
    try {
      const [hist, gone] = await Promise.all([store.loadHistory(60), store.loadDeleted()]);
      setActivity(hist);
      setDeletedItems(gone);
    } catch (e) {
      console.error("account lists failed", e);
      setActivity([]);
      setDeletedItems([]);
    }
  }

  async function restoreDeleted(item) {
    try {
      await store.restoreItem(item.id, item.version);
      deletedIdsRef.current.delete(item.id);
      await reload();
      await loadAccountLists();
      showToast("Restored");
    } catch (e) {
      console.error("restore failed", e);
      showToast("Couldn’t restore — try again", null, 4000);
    }
  }

  function saveFile(name, type, text) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  // A calendar file with each debt's due date: repeating monthly at the
  // amount it asks for, or month by month for a repayment plan.
  function downloadCalendar() {
    const events = [];
    for (const l of lenderSummaries) {
      if (!l.dueDay || l.remaining <= 0.5) continue;
      if (l.repaymentPlan) {
        const start = l.termStart || l.startMonth;
        l.repaymentPlan.amounts.forEach((amt, i) => {
          const key = monthKeyAdd(start, i);
          if (key < asOfKey || amt <= 0) return;
          const [y, m] = key.split("-").map(Number);
          const day = Math.min(l.dueDay, new Date(y, m, 0).getDate());
          events.push({ uid: `${l.id}-${key}@ledger`, title: `${l.name}: ${fmt(amt)} due`, date: `${key}-${String(day).padStart(2, "0")}` });
        });
      } else {
        const pay = payableThisMonth(l);
        events.push({
          uid: `${l.id}@ledger`,
          title: pay && !pay.fromPlan ? `${l.name}: ${fmt(pay.amount)} due` : `${l.name}: payment due`,
          day: l.dueDay,
          fromKey: asOfKey,
          description: "From your Ledger. If the amount changes, add the reminders again.",
        });
      }
    }
    if (events.length === 0) {
      showToast("No due dates yet — set a due day on your debts first", null, 4000);
      return;
    }
    saveFile("ledger-due-dates.ics", "text/calendar", buildCalendar(events));
  }

  async function downloadBackup() {
    try {
      const rows = await store.loadEverything();
      const stamp = new Date().toISOString().slice(0, 10);
      saveFile(`ledger-backup-${stamp}.json`, "application/json", JSON.stringify({ exportedAt: new Date().toISOString(), by: myEmail, ...rows }, null, 2));
    } catch (e) {
      console.error("backup failed", e);
      showToast("Couldn’t make the backup — try again", null, 4000);
    }
  }

  // ---- Record a month from "This month" or a due tag ----
  function openRecord(kind, id) {
    setRecordTarget({ kind, id, month: asOfKey });
  }

  // Pre-fills a payment with last month's split, or else puts the amount due on
  // the first name.
  function recordDefaults(loanId, monthKey) {
    const entries = payments[loanId] || {};
    if (entries[monthKey]) return { amounts: entries[monthKey].amounts, note: null };
    const prevMonth = entries[monthKeyAdd(monthKey, -1)];
    if (prevMonth && prevMonth.amounts) return { amounts: prevMonth.amounts, note: "Filled in from last month — change anything that’s different." };
    const summary = lenderSummaries.find((x) => x.id === loanId);
    const pay = summary && payableThisMonth(summary);
    const names = namesFor(loanId);
    if (pay && names.length) return { amounts: { [names[0]]: Math.round(pay.amount) }, note: "Filled in with the amount due — split it between people if needed." };
    return { amounts: null, note: null };
  }

  // Items shared with you in a currency other than yours: named, not added in.
  function otherCurrencyNote(items) {
    if (items.length === 0) return null;
    return (
      <div className="fl-panel">
        <p className="fl-panel-title fl-serif">Shared with you in another currency</p>
        {items.map((x) => (
          <p className="fl-card-sub" key={x.id} style={{ margin: "0 0 4px" }}>
            “{x.name}” from {x.ownerEmail.split("@")[0]} · {x.currency}
          </p>
        ))}
        <p className="fl-card-sub" style={{ marginTop: 8 }}>
          Your account is in {currencyInfo(myCurrency).name} ({myCurrency}), so {items.length === 1 ? "this isn’t" : "these aren’t"}{" "}
          shown or added to your totals — amounts in two currencies can’t be added together. To see{" "}
          {items.length === 1 ? "it" : "them"}, change your currency in Account.
        </p>
      </div>
    );
  }

  // The header's + adds to whichever list is showing: Debts or Income.
  const canAddFromHeader = view === "loans" || view === "income";

  // ---- This month: what's due and what's coming in, by date ----
  const thisMonthItems = [];
  for (const l of lenderSummaries) {
    const entry = (payments[l.id] || {})[asOfKey];
    const paid = entry ? Object.values(entry.amounts || {}).reduce((s, v) => s + (Number(v) || 0), 0) : 0;
    if (l.remaining <= 0.5 && !entry) continue;
    const pay = payableThisMonth(l);
    if (!pay && !l.dueDay && !entry) continue;
    thisMonthItems.push({
      kind: "debt",
      id: l.id,
      name: l.name,
      day: l.dueDay || null,
      amount: entry ? paid : pay ? pay.amount : null,
      paid,
      short: l.shortThisMonth > 0.5 ? l.shortThisMonth : 0,
      fromPlan: !entry && pay && pay.fromPlan,
      status: l.isPaidThisMonth ? "paid" : l.shortThisMonth > 0.5 ? "short" : l.isOverdue ? "overdue" : l.isDueSoon ? "soon" : entry ? "paid" : "upcoming",
      daysUntil: l.daysUntilDue,
      canEdit: access(l.id).canEdit,
    });
  }
  for (const src of activeIncomes) {
    const rec = (incomeRecords[src.id] || {})[asOfKey];
    thisMonthItems.push({
      kind: "income",
      id: src.id,
      name: src.name,
      day: src.incomeDay || null,
      amount: rec ? Number(rec.income) || 0 : Math.round(expectedIncomeFor(src, asOfKey)),
      status: rec ? "received" : "expected",
      canEdit: access(src.id).canEdit,
    });
  }
  thisMonthItems.sort((a, b) => (a.day || 99) - (b.day || 99) || a.name.localeCompare(b.name));
  // Still to pay: what's due and not yet paid (for a part-paid month, the shortfall).
  const monthDue = thisMonthItems
    .filter((x) => x.kind === "debt" && x.status !== "paid" && !x.fromPlan)
    .reduce((s, x) => s + (x.status === "short" ? x.short : x.amount || 0), 0);
  const monthPaid = thisMonthItems.filter((x) => x.kind === "debt").reduce((s, x) => s + (x.paid || 0), 0);
  const monthIn = thisMonthItems.filter((x) => x.kind === "income").reduce((s, x) => s + (x.amount || 0), 0);
  // New: nothing saved yet. (metaRef also notices settings saved since the last
  // load, e.g. choosing a currency in Account before getting started.)
  const isEmptyAccount =
    !hasSettings && metaRef.current.settingsVersion == null && lenders.length === 0 && incomes.length === 0;

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
              <h1 className="fl-title fl-serif">Ledger</h1>
              <p className="fl-subtitle">{myEmail}</p>
            </>
          )}
        </div>
      </div>

      <div className="fl-content">
        {view === "dashboard" && isEmptyAccount && (
          <div className="fl-panel">
            <p className="fl-panel-title fl-serif">Welcome to your Ledger</p>
            {canImport ? (
              <>
                <p className="fl-card-sub" style={{ marginBottom: 12 }}>
                  The old shared family ledger is still here, with {oldLedger.ledger.lenders.length} debt
                  {oldLedger.ledger.lenders.length === 1 ? "" : "s"}, {(oldLedger.ledger.incomes || []).length} income
                  source{(oldLedger.ledger.incomes || []).length === 1 ? "" : "s"} and every payment recorded so far.
                  Import it into your account to carry on where you left off — the old copy isn’t changed. Only one
                  person needs to do this; they can then share each debt with the others.
                </p>
                <div className="fl-form-actions">
                  <button className="fl-btn secondary" onClick={startFresh} disabled={importing}>
                    Start fresh
                  </button>
                  <button className="fl-btn" onClick={importFamilyLedger} disabled={importing}>
                    {importing ? "Importing…" : "Import it"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="fl-card-sub" style={{ marginBottom: 12 }}>
                  {oldImportedBy
                    ? `${oldImportedBy} has already moved the family ledger into their account. Ask them to share the debts and income you look after with ${myEmail} — they’ll appear here. Meanwhile you can add your own.`
                    : "Keep track of what you owe and what comes in, and plan the quickest way to be debt-free. Everything you add is private unless you share it."}
                </p>
                <GettingStartedSteps />
                <div className="fl-field">
                  <label>Your currency</label>
                  <CurrencySelect value={welcomeCurrency} onChange={setWelcomeCurrency} />
                </div>
                <p className="fl-card-sub" style={{ marginBottom: 12 }}>
                  You can change it later in Account.
                </p>
                <div className="fl-form-actions">
                  <button className="fl-btn" onClick={() => startFresh(welcomeCurrency)}>
                    Get started
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {view === "dashboard" && importResult && (
          <div className="fl-panel">
            <p className="fl-panel-title fl-serif">{importResult.matches ? "Imported ✓" : "Imported — please check"}</p>
            <p className="fl-card-sub">
              {importResult.debts} debts, {importResult.incomes} income sources and {importResult.entries} monthly entries
              came across. Total still owed: {fmt(importResult.after)}
              {importResult.matches
                ? " — matches the old family ledger exactly."
                : ` — the old ledger showed ${fmt(importResult.before)}. Tell Claude before relying on it.`}
            </p>
            <div className="fl-form-actions" style={{ marginTop: 10 }}>
              <button className="fl-btn secondary" onClick={() => setImportResult(null)}>
                OK
              </button>
            </div>
          </div>
        )}

        {view === "dashboard" && !isEmptyAccount && data.lenders.length === 0 && (data.incomes || []).length === 0 && (
          <div className="fl-panel">
            <p className="fl-panel-title fl-serif">Getting started</p>
            <GettingStartedSteps />
            <div className="fl-form-actions">
              <button className="fl-btn secondary" onClick={() => setShowAddIncome(true)}>
                <Plus size={14} /> Income
              </button>
              <button className="fl-btn" onClick={() => setShowAddLoan(true)}>
                <Plus size={14} /> Debt
              </button>
            </div>
          </div>
        )}

        {view === "dashboard" && !isEmptyAccount && (
          <>
            <div className="fl-summary">
              <p className="fl-summary-label">Total remaining across all debts</p>
              <p className="fl-summary-value fl-mono">{fmt(totalRemaining)}</p>
              <div className="fl-progress-track">
                <div className="fl-progress-fill" style={{ width: (overallPct * 100).toFixed(1) + "%" }} />
              </div>
              <p className="fl-card-sub" style={{ marginTop: 8 }}>
                {totalPaid >= 0
                  ? `${fmt(totalPaid)} paid of ${fmt(totalAmount)}`
                  : `Interest has added ${fmt(-totalPaid)} to the ${fmt(totalAmount)} borrowed`}
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

            {thisMonthItems.length > 0 && (
              <>
                <p className="fl-section-title">This month · {monthKeyLabel(asOfKey)}</p>
                <p className="fl-card-sub" style={{ marginTop: -4, marginBottom: 8 }}>
                  {fmt(monthDue)} still to pay · {fmt(monthPaid)} paid · {fmt(monthIn)} coming in
                </p>
                <div className="fl-month-list">
                  {thisMonthItems.map((x) => (
                    <button
                      key={x.kind + x.id}
                      className="fl-month-item"
                      disabled={!x.canEdit}
                      onClick={() => openRecord(x.kind, x.id)}
                      aria-label={(x.kind === "debt" ? "Record payment for " : "Record income for ") + x.name}
                    >
                      <span className={"fl-day" + (x.kind === "income" ? " fl-day-in" : "")}>
                        <span className="fl-day-num">{x.day || "—"}</span>
                        <span className="fl-day-mon">{monthKeyShort(asOfKey).split(" ")[0]}</span>
                      </span>
                      <span className="fl-month-item-main">
                        <span className="fl-list-row-name">{x.name}</span>
                        <span className="fl-card-sub">
                          {x.kind === "income"
                            ? x.status === "received"
                              ? `${fmt(x.amount)} came in`
                              : `${fmt(x.amount)} expected`
                            : x.status === "paid"
                            ? `${fmt(x.amount)} paid`
                            : x.status === "short"
                            ? `${fmt(x.paid)} paid · ${fmt(x.short)} short`
                            : x.amount == null
                            ? "Payment due"
                            : x.fromPlan
                            ? `Plan suggests ${fmt(x.amount)}`
                            : `${fmt(x.amount)} due`}
                        </span>
                      </span>
                      <span
                        className={
                          x.status === "paid" || x.status === "received"
                            ? "fl-chip chip-green"
                            : x.status === "overdue" || x.status === "short"
                            ? "fl-overdue"
                            : "fl-chip chip-grey"
                        }
                        style={{ marginTop: 0 }}
                      >
                        {x.status === "paid"
                          ? "Paid"
                          : x.status === "received"
                          ? "In"
                          : x.status === "overdue"
                          ? "Overdue"
                          : x.status === "short"
                          ? "Short"
                          : x.status === "soon"
                          ? x.daysUntil === 0
                            ? "Today"
                            : `In ${x.daysUntil} day${x.daysUntil === 1 ? "" : "s"}`
                          : x.kind === "income"
                          ? "Expected"
                          : "Record"}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {lenderSummaries.length > 0 && <p className="fl-section-title">Your debts</p>}

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
                    !access(l.id).owner ||
                    access(l.id).shares.length > 0 ||
                    l.protectFromGrowth ||
                    l.isPaidThisMonth ||
                    l.isOverdue ||
                    l.isDueSoon ||
                    l.missedMonths.length > 0 ||
                    l.shortThisMonth > 0.5 ||
                    l.behindPlan > 0.5) && (
                    <div className="fl-chip-row">
                      {categoryLabel(l.category) && <span className="fl-chip chip-tag">{categoryLabel(l.category)}</span>}
                      <SharedChip a={access(l.id)} />
                      {l.protectFromGrowth && <span className="fl-chip chip-blue">protected</span>}
                      {l.isPaidThisMonth && (
                        <span className="fl-chip chip-green">
                          <Check size={12} /> Paid {monthKeyShort(asOfKey)}
                        </span>
                      )}
                      {l.isOverdue && (
                        <span
                          className="fl-overdue fl-tap"
                          style={{ marginTop: 0 }}
                          onClick={(e) => {
                            if (!access(l.id).canEdit) return;
                            e.stopPropagation();
                            openRecord("debt", l.id);
                          }}
                        >
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
                            <span
                              className="fl-chip chip-grey fl-tap"
                              onClick={(e) => {
                                if (!access(l.id).canEdit) return;
                                e.stopPropagation();
                                openRecord("debt", l.id);
                              }}
                            >
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

        {view === "dashboard" && otherCurrencyNote(otherCurrencyItems)}

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
                    {(categoryLabel(l.category) || l.protectFromGrowth || !access(l.id).owner || access(l.id).shares.length > 0) && (
                      <div className="fl-chip-row" style={{ marginTop: 5 }}>
                        {categoryLabel(l.category) && <span className="fl-chip chip-tag">{categoryLabel(l.category)}</span>}
                        <SharedChip a={access(l.id)} />
                        {l.protectFromGrowth && <span className="fl-chip chip-blue">protected</span>}
                      </div>
                    )}
                  </div>
                  {access(l.id).canEdit && (
                    <button className="fl-icon-btn" onClick={() => setEditingLoanId(l.id)} aria-label="Edit debt">
                      <Pencil size={16} />
                    </button>
                  )}
                  {access(l.id).owner && <ConfirmButton label="delete debt" onConfirm={() => deleteLoan(l.id)} />}
                  <button className="fl-icon-btn" onClick={() => openLoan(l.id)} aria-label="Open debt">
                    <ChevronRight size={16} />
                  </button>
                </div>
              )
            )}

            {lenders.length === 0 && (
              <div className="fl-empty">Nothing added yet. Tap + at the top to add a debt.</div>
            )}
            {otherCurrencyNote(otherCurrencyItems.filter((x) => x.kind === "debt"))}
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
                    {(categoryLabel(s.category, INCOME_CATEGORIES) || !access(s.id).owner || access(s.id).shares.length > 0) && (
                      <div className="fl-chip-row" style={{ marginTop: 5 }}>
                        {categoryLabel(s.category, INCOME_CATEGORIES) && (
                          <span className="fl-chip chip-tag">{categoryLabel(s.category, INCOME_CATEGORIES)}</span>
                        )}
                        <SharedChip a={access(s.id)} />
                      </div>
                    )}
                  </div>
                  {access(s.id).canEdit && (
                    <button className="fl-icon-btn" onClick={() => setEditingIncomeId(s.id)} aria-label="Edit income source">
                      <Pencil size={16} />
                    </button>
                  )}
                  {access(s.id).owner && <ConfirmButton label="delete income source" onConfirm={() => deleteIncome(s.id)} />}
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
            {otherCurrencyNote(otherCurrencyItems.filter((x) => x.kind === "income"))}
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
                const acc = access(s.id);
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
                        {acc.canEdit && (
                          <button className="fl-icon-btn" onClick={() => setEditingIncomeId(s.id)} aria-label="Edit income source details">
                            <Pencil size={14} />
                          </button>
                        )}
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
                          <div className="fl-month-top" onClick={() => acc.canEdit && setPendingIncomeMonth(row.key)}>
                            <span className="fl-month-name">{monthKeyShort(row.key)}</span>
                            <span className="fl-month-balance fl-mono" style={{ color: row.recorded ? profitColor(row.profit) : undefined }}>
                              {row.recorded ? (row.profit < 0 ? "−" : "") + fmt(Math.abs(row.profit)) : "—"}
                            </span>
                          </div>
                          <div className="fl-month-breakdown" onClick={() => acc.canEdit && setPendingIncomeMonth(row.key)}>
                            {row.recorded
                              ? `Income ${fmt(row.income)} · Expenses ${fmt(row.expenses)}`
                              : "Not recorded yet"}
                          </div>
                          {row.recorded && acc.canEdit && (
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

                    {pendingIncomeMonth === null && st.rows.length > 0 && acc.canEdit && (
                      <button className="fl-add-row" onClick={() => setPendingIncomeMonth(suggestedMonth)}>
                        <Plus size={16} /> Record a month
                      </button>
                    )}

                    <div style={{ marginTop: 18 }}>
                      <SharePanel
                        itemName={s.name}
                        kindLabel="income source"
                        a={acc}
                        myEmail={myEmail}
                        onShare={(email, role) => shareItem(s.id, email, role)}
                        onUnshare={(email, leaving) => unshareItem(s.id, email, leaving)}
                      />
                    </div>
                  </>
                );
              })()
            )}
          </>
        )}

        {view === "account" && (
          <>
            <div className="fl-summary">
              <p className="fl-summary-label">Signed in as</p>
              <p className="fl-list-row-name" style={{ margin: "2px 0 10px" }}>{myEmail}</p>
              <div className="fl-form-actions">
                <button className="fl-btn secondary" onClick={() => supabase.auth.signOut()}>
                  <LogOut size={14} /> Sign out
                </button>
              </div>
            </div>

            <p className="fl-section-title">Currency</p>
            <div className="fl-panel">
              <div className="fl-field">
                <CurrencySelect value={myCurrency} onChange={changeCurrency} />
              </div>
              <p className="fl-card-sub">
                Changes the symbol on all your amounts — nothing is converted. People you share with see your items in
                this currency.
              </p>
            </div>

            {oldLedger && (
              <div className="fl-panel">
                <p className="fl-panel-title fl-serif">The old family ledger is still open</p>
                <p className="fl-card-sub" style={{ marginBottom: 10 }}>
                  Anyone with the app’s link can still read and change the old shared copy.
                  {oldImportedBy === myEmail
                    ? " Once you’ve checked your imported debts, lock it (step 4 of the setup guide)."
                    : oldImportedBy
                    ? ` ${oldImportedBy} has imported it and will lock it once they’ve checked it.`
                    : " Import it into your account first, then lock it (step 4 of the setup guide)."}
                </p>
                {canImport && oldImportedBy !== myEmail && !lenders.some((l) => access(l.id).owner) && (
                  <div className="fl-form-actions">
                    <button className="fl-btn" onClick={importFamilyLedger} disabled={importing}>
                      {importing ? "Importing…" : "Import it into my account"}
                    </button>
                  </div>
                )}
              </div>
            )}

            <p className="fl-section-title">Reminders</p>
            <div className="fl-panel">
              <p className="fl-card-sub" style={{ marginBottom: 10 }}>
                Add each debt’s monthly due date to your phone’s calendar, with an alert at 9 am the day before. Debts
                need a due day set. If amounts change, add them again.
              </p>
              <div className="fl-form-actions">
                <button className="fl-btn" onClick={downloadCalendar}>
                  <CalendarPlus size={14} /> Add due dates to my calendar
                </button>
              </div>
            </div>

            <p className="fl-section-title">Names for recording payments</p>
            {people.map((p) => (
              <div className="fl-list-row" key={p}>
                <div className="fl-list-row-main">
                  <div className="fl-list-row-name">{p}</div>
                </div>
                <ConfirmButton label={"remove " + p} onConfirm={() => deletePerson(p)} />
              </div>
            ))}
            {people.length === 0 && <div className="fl-empty">No names yet.</div>}
            <div className="fl-panel" style={{ marginTop: 12 }}>
              <div className="fl-field">
                <label>Add a name</label>
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
              <p className="fl-card-sub" style={{ marginTop: 10 }}>
                When you record a payment you can split it between these names. Removing a name keeps their past
                payments.
              </p>
            </div>

            <p className="fl-section-title">Activity</p>
            {activity === null && <p className="fl-card-sub">Loading…</p>}
            {activity && activity.length === 0 && <p className="fl-card-sub">No changes yet.</p>}
            {activity &&
              activity.map((h) => {
                const d = describeChange(h, {
                  myEmail,
                  names: Object.fromEntries([...data.lenders, ...(data.incomes || [])].map((x) => [x.id, x.name])),
                  currencyOf: itemCurrency,
                });
                return (
                  <div className="fl-activity-row" key={h.id}>
                    <span>
                      <strong>{d.who}</strong> {d.text}
                    </span>
                    <span className="fl-card-sub">{d.when}</span>
                  </div>
                );
              })}

            <p className="fl-section-title">Recently deleted</p>
            {deletedItems && deletedItems.length === 0 && <p className="fl-card-sub">Nothing deleted.</p>}
            {deletedItems &&
              deletedItems.map((it) => (
                <div className="fl-list-row" key={it.id}>
                  <div className="fl-list-row-main">
                    <div className="fl-list-row-name">{it.data.name || "Untitled"}</div>
                    <div className="fl-list-row-sub">
                      {it.kind === "debt" ? "Debt" : "Income source"} · deleted{" "}
                      {new Date(it.deleted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </div>
                  </div>
                  <button className="fl-icon-btn" onClick={() => restoreDeleted(it)} aria-label={"Restore " + (it.data.name || "item")}>
                    <RotateCcw size={16} /> <span className="fl-icon-label">Restore</span>
                  </button>
                </div>
              ))}

            <p className="fl-section-title">Backup</p>
            <div className="fl-panel">
              <p className="fl-card-sub" style={{ marginBottom: 10 }}>
                Download a copy of everything you can see — debts, income, every monthly entry and your settings — to
                keep somewhere safe.
              </p>
              <div className="fl-form-actions">
                <button className="fl-btn secondary" onClick={downloadBackup}>
                  <Download size={14} /> Download a backup
                </button>
              </div>
            </div>

            <p className="fl-section-title">Privacy</p>
            <div className="fl-panel">
              <p className="fl-card-sub" style={{ marginBottom: 10 }}>
                What Ledger keeps, who can see it, and how to take it with you or delete it.
              </p>
              <div className="fl-form-actions">
                <button className="fl-btn secondary" onClick={() => setShowPrivacy(true)}>
                  <Shield size={14} /> Read the privacy note
                </button>
              </div>
            </div>

            <p className="fl-section-title">Delete my account</p>
            <DeleteAccountPanel onDelete={deleteAccount} />
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
              {nextBudgetRise && (
                <p className="fl-card-sub" style={{ marginTop: 4 }}>
                  Rises to {fmt(nextBudgetRise.amount)} from {monthKeyShort(nextBudgetRise.key)} as income grows — the
                  plan below counts every future rise.
                </p>
              )}
              {(budgetParts.length > 1 || budgetParts.some((p) => p.kind === "income")) && (
                <div className="fl-budget-breakdown">
                  {budgetParts.map((p) => (
                    <div className="fl-budget-line" key={p.id}>
                      <span>
                        {p.kind === "income"
                          ? `${incomesById[p.incomeId] ? incomesById[p.incomeId].name : "Removed income source"} · ${shareLabel(p.share)}${
                              incomesById[p.incomeId] && hasIncomeGrowth(incomesById[p.incomeId])
                                ? ` · rises ${incomeGrowthLabel(incomesById[p.incomeId].growth)}`
                                : ""
                            }`
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
                const acc = access(selectedLoan.id);
                const names = namesFor(selectedLoan.id);
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
                        {acc.canEdit && (
                          <button className="fl-icon-btn" onClick={() => setEditingLoanId(selectedLoan.id)} aria-label="Edit debt details">
                            <Pencil size={14} />
                          </button>
                        )}
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
                          people={names}
                          title={(row.recorded ? "Edit " : "Record ") + monthKeyLabel(row.key)}
                          onCancel={() => setPendingMonthKey(null)}
                          onSave={(amounts) => saveMonthEntry(selectedLoan.id, row.key, amounts)}
                        />
                      ) : (
                        <div className="fl-month-row" key={row.key}>
                          <div className="fl-month-top" onClick={() => acc.canEdit && setPendingMonthKey(row.key)}>
                            <span className="fl-month-name">{monthKeyShort(row.key)}</span>
                            <span className="fl-month-balance fl-mono">{fmt(row.remaining)}</span>
                          </div>
                          <div className="fl-month-breakdown" onClick={() => acc.canEdit && setPendingMonthKey(row.key)}>
                            {row.recorded
                              ? names
                                  .filter((p) => people.includes(p) || (Number(row.amounts[p]) || 0) !== 0)
                                  .map((p) => `${p} ${fmt(row.amounts[p] || 0)}`)
                                  .join(" · ") +
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
                          {row.recorded && acc.canEdit && (
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
                        people={names}
                        title={"Record " + monthKeyLabel(pendingMonthKey)}
                        onCancel={() => setPendingMonthKey(null)}
                        onSave={(amounts) => saveMonthEntry(selectedLoan.id, pendingMonthKey, amounts)}
                      />
                    )}

                    {pendingMonthKey === null && acc.canEdit && (
                      <button className="fl-add-row" onClick={() => setPendingMonthKey(suggestedMonth)}>
                        <Plus size={16} /> Record a payment
                      </button>
                    )}

                    <div style={{ marginTop: 18 }}>
                      <SharePanel
                        itemName={selectedLoan.name}
                        kindLabel="debt"
                        a={acc}
                        myEmail={myEmail}
                        onShare={(email, role) => shareItem(selectedLoan.id, email, role)}
                        onUnshare={(email, leaving) => unshareItem(selectedLoan.id, email, leaving)}
                      />
                    </div>
                  </>
                );
              })()
            )}
          </>
        )}
      </div>

      {toast && (
        <div className="fl-toast" role="status">
          {toast.msg}
          {toast.undo && (
            <button
              className="fl-toast-undo"
              onClick={() => {
                const undo = toast.undo;
                setToast(null);
                undo();
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}

      {recordTarget &&
        (() => {
          const t = recordTarget;
          if (t.kind === "debt") {
            const loan = lenders.find((l) => l.id === t.id);
            if (!loan) return null;
            const d = recordDefaults(t.id, t.month);
            return (
              <Sheet title={loan.name} onClose={() => setRecordTarget(null)}>
                {d.note && <p className="fl-card-sub" style={{ margin: "0 0 10px" }}>{d.note}</p>}
                <MonthEntryForm
                  key={t.month}
                  monthKey={t.month}
                  onMonthKeyChange={(m) => setRecordTarget({ ...t, month: m })}
                  defaults={d.amounts}
                  isExisting={!!(payments[t.id] || {})[t.month]}
                  people={namesFor(t.id)}
                  title={((payments[t.id] || {})[t.month] ? "Edit " : "Record ") + monthKeyLabel(t.month)}
                  onCancel={() => setRecordTarget(null)}
                  onSave={(amounts) => saveMonthEntry(t.id, t.month, amounts)}
                />
              </Sheet>
            );
          }
          const src = incomes.find((x) => x.id === t.id);
          if (!src) return null;
          const rec = (incomeRecords[t.id] || {})[t.month];
          return (
            <Sheet title={src.name} onClose={() => setRecordTarget(null)}>
              <IncomeMonthForm
                key={t.month}
                monthKey={t.month}
                onMonthKeyChange={(m) => setRecordTarget({ ...t, month: m })}
                defaults={rec || { income: Math.round(expectedIncomeFor(src, t.month)), expenses: src.usualExpenses }}
                isExisting={!!rec}
                title={(rec ? "Edit " : "Record ") + monthKeyLabel(t.month)}
                onCancel={() => setRecordTarget(null)}
                onSave={(figures) => saveIncomeMonth(t.id, t.month, figures)}
              />
            </Sheet>
          );
        })()}

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

      {showPrivacy && (
        <Sheet title="Privacy" onClose={() => setShowPrivacy(false)}>
          <PrivacyNote />
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
            className={"fl-navbtn " + (view === "account" ? "active" : "")}
            onClick={() => {
              setView("account");
              loadAccountLists();
            }}
          >
            <div className="fl-ribbon"><div className="fl-ribbon-grain"></div></div>
            <User size={16} />
            Account
          </button>
        </div>
      </div>
    </div>
  );
}
