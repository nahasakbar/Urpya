import { useState, useEffect, useLayoutEffect, useRef } from "react";
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
  Eye,
  EyeOff,
  LayoutDashboard,
  CalendarClock,
  WifiOff,
  Briefcase,
  Info,
  Wallet,
} from "lucide-react";
import { supabase, getRememberMe, setRememberMe, loadAuthSettings, openedFromEmailLink } from "./supabaseClient.js";
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
import { Amount } from "./motion.jsx";
import { AreaChart, BarPairs, Ring, SegmentBar } from "./charts.jsx";


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

// A bottom sheet over the app (a centred dialog on wide screens). It slides
// in, and out again when closed with ✕, the backdrop, Escape or a downward
// drag of its header. Closing after a save is immediate (the parent unmounts it).
function Sheet({ title, onClose, children }) {
  const [closing, setClosing] = useState(false);
  const [drag, setDrag] = useState(0);
  const dragStart = useRef(null);
  const close = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 200);
  };
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  function onDown(e) {
    if (e.target.closest("button")) return;
    dragStart.current = e.clientY;
    e.currentTarget.setPointerCapture && e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onMove(e) {
    if (dragStart.current == null) return;
    setDrag(Math.max(e.clientY - dragStart.current, 0));
  }
  function onUp() {
    if (dragStart.current == null) return;
    dragStart.current = null;
    if (drag > 110) close();
    else setDrag(0);
  }
  return (
    <div className={"ox-layer" + (closing ? " closing" : "")} role="dialog" aria-modal="true" aria-label={title}>
      <div className="ox-backdrop" onClick={close} />
      <div
        className="fl-sheet"
        style={drag ? { transform: `translateY(${drag}px)`, transition: "none", "--drag": drag + "px" } : undefined}
      >
        <div className="ox-grabber" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
        <div className="fl-sheet-head" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <h2 className="fl-title">{title}</h2>
          <button className="fl-sheet-close" onClick={close} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="fl-sheet-body">{children}</div>
      </div>
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
  if (!a.owner) return <span className="fl-chip chip-shared">from {(a.ownerName || a.ownerEmail || "").split(/\s+/)[0]}</span>;
  if (a.shares.length) return <span className="fl-chip chip-shared">shared · {a.shares.length}</span>;
  return null;
}

// Initials for an avatar: "Nahas Akbar" → "NA".
function initialsOf(name) {
  return (
    String(name || "?")
      .trim()
      .split(/\s+/)
      .map((w) => w.charAt(0))
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

// A readable name from an email when nobody has given one: "riyas.k@…" → "Riyas k".
function nameFromEmail(email) {
  const local = String(email || "").split("@")[0].replace(/[._-]+/g, " ").trim() || "Someone";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

// Sends an invite through the phone's share sheet, else copies it, else opens
// an email. Returns "copied" when it was copied, so the caller can say so.
async function sendInviteMessage(to, text) {
  try {
    if (navigator.share) {
      await navigator.share({ title: "Ledger", text });
      return "shared";
    }
  } catch (e) {
    if (e && e.name === "AbortError") return "cancelled";
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch (e) {
    window.location.href = `mailto:${to}?subject=${encodeURIComponent("Ledger")}&body=${encodeURIComponent(text)}`;
    return "mail";
  }
}

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Name + email for inviting someone new (Account → People, or from a debt).
function InvitePersonForm({ onInvite, onCancel, withRole = false, submitLabel = "Invite" }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("editor");
  const [busy, setBusy] = useState(false);
  const valid = name.trim() && EMAIL_OK.test(email.trim());
  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    const ok = await onInvite(name.trim(), email.trim().toLowerCase(), role);
    setBusy(false);
    if (ok) {
      setName("");
      setEmail("");
    }
  }
  return (
    <div>
      <div className="fl-field">
        <label>Their name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" placeholder="e.g. Riyas" />
      </div>
      <div className="fl-field">
        <label>Their email</label>
        <input
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="name@example.com"
        />
      </div>
      {withRole && (
        <div className="fl-tag-picker" style={{ marginBottom: 14 }}>
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
      )}
      <div className="fl-form-actions">
        {onCancel && (
          <button className="fl-btn secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
        <button className="fl-btn" onClick={submit} disabled={!valid || busy}>
          <Plus size={16} /> {busy ? "Adding…" : submitLabel}
        </button>
      </div>
    </div>
  );
}

// Who can see one debt or income source. The owner picks from their people
// (not shared / can edit / view only) or invites someone new; someone it's
// shared with sees who shared it and can leave.
function SharePanel({ itemName, a, myEmail, people, onAccess, onInvite, onUnshare, kindLabel }) {
  const [inviting, setInviting] = useState(false);
  const [busy, setBusy] = useState(null);
  const [copied, setCopied] = useState(false);
  const appUrl = typeof window !== "undefined" ? window.location.origin : "";

  async function invite(to) {
    const text = `I've shared “${itemName}” with you on Ledger. Open ${appUrl} and sign up or sign in with ${to} to see it.`;
    setCopied((await sendInviteMessage(to, text)) === "copied");
  }

  if (!a.owner) {
    return (
      <div className="fl-panel">
        <p className="fl-panel-title">Shared with you</p>
        <p className="fl-card-sub" style={{ marginBottom: 12 }}>
          {a.ownerName} ({a.ownerEmail}) shared this {kindLabel} with you — you can {a.canEdit ? "record and edit" : "only view"} it.
        </p>
        <div className="fl-form-actions">
          <ConfirmTextButton label="Leave" confirmLabel="Yes, leave" onConfirm={() => onUnshare(myEmail, true)} />
        </div>
      </div>
    );
  }

  const roleOf = (email) => (a.shares.find((sh) => sh.email === email) || {}).role || "none";
  return (
    <div className="fl-panel">
      <p className="fl-panel-title">Who can see this</p>
      <p className="fl-card-sub" style={{ marginBottom: 12 }}>
        {a.shares.length === 0
          ? `Only you can see this ${kindLabel}. Choose people to manage it with.`
          : `Shared with ${a.shares.length} ${a.shares.length === 1 ? "person" : "people"}. They see it, its months and its history.`}
      </p>
      {people.length > 0 && (
        <div className="ox-list">
          {people.map((p) => {
            const role = roleOf(p.email);
            return (
              <div className="ox-row ox-person" key={p.email}>
                <span className={"ox-avatar sm" + (role === "none" ? " muted" : "")} aria-hidden="true">
                  {initialsOf(p.name)}
                </span>
                <span className="ox-row-main">
                  <span className="ox-row-name">{p.name}</span>
                  <span className="ox-row-sub">{p.email}</span>
                </span>
                {role !== "none" && (
                  <button className="fl-icon-btn" onClick={() => invite(p.email)} aria-label={"Send " + p.name + " an invite"}>
                    <Mail size={16} />
                  </button>
                )}
                <select
                  className={"ox-access" + (role !== "none" ? " on" : "")}
                  value={role}
                  disabled={busy === p.email}
                  aria-label={"What " + p.name + " can do"}
                  onChange={async (e) => {
                    setBusy(p.email);
                    await onAccess(p.email, e.target.value, p.name);
                    setBusy(null);
                  }}
                >
                  <option value="none">Not shared</option>
                  <option value="editor">Can edit</option>
                  <option value="viewer">View only</option>
                </select>
              </div>
            );
          })}
        </div>
      )}
      {inviting ? (
        <div style={{ marginTop: 16 }}>
          <InvitePersonForm
            withRole
            submitLabel="Invite and share"
            onCancel={() => setInviting(false)}
            onInvite={async (name, email, role) => {
              const ok = await onInvite(name, email, role);
              if (ok) setInviting(false);
              return ok;
            }}
          />
        </div>
      ) : (
        <button className="fl-add-row" onClick={() => setInviting(true)}>
          <Plus size={16} /> {people.length ? "Invite someone new" : "Invite someone"}
        </button>
      )}
      {copied && (
        <p className="fl-card-sub" style={{ marginTop: 10 }}>
          Invite copied — paste it into WhatsApp or a message.
        </p>
      )}
    </div>
  );
}

// Your own name, which shows on the payments you record and to the people you
// share with. Saved on your sign-in (it's the same one sign-up asks for).
function YourNameForm({ current, onDone }) {
  const [name, setName] = useState(current || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    if (!name.trim()) return setError("Enter your name.");
    setBusy(true);
    setError("");
    const { error: err } = await supabase.auth.updateUser({ data: { full_name: name.trim() } });
    setBusy(false);
    if (err) {
      console.error("name not saved", err);
      return setError("Couldn’t save your name — try again.");
    }
    onDone(true);
  }
  return (
    <div style={{ padding: "4px 0" }}>
      <div className="fl-field">
        <label>Your name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} autoComplete="name" />
      </div>
      {error && <p className="ox-field-error">{error}</p>}
      <div className="fl-form-actions">
        <button className="fl-btn secondary" onClick={() => onDone(false)} disabled={busy}>
          Cancel
        </button>
        <button className="fl-btn" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
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
        Your name and email address; your password, stored scrambled so nobody can read it (not even the person
        who runs Ledger); and what you type in: debts, payments, income, your budget and the names you add. If you
        sign in with Google, Ledger gets only your name and email address from Google. Nothing else — no contacts,
        no location and no bank connection.
      </p>
      <p className="fl-panel-title fl-serif">Who can see it</p>
      <p>
        Only you — plus anyone you share a particular debt or income source with, who sees just that item, its
        monthly entries and its history. The people you share with, and the people who share with you, see the
        name you signed up with. Signed-out visitors see nothing.
      </p>
      <p>
        Everything is stored with Supabase, a database hosting company, and emails with codes (to confirm your email
        or reset your password) are sent through Gmail. The
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
      <p>Reply to any email from Ledger.</p>
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

// Google's "G", for the Continue with Google button.
function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

const MIN_PASSWORD = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A password box with a show/hide eye.
function PasswordField({ label, value, onChange, onEnter, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <div className="fl-field">
      <label>{label}</label>
      <div className="fl-password">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onEnter && onEnter()}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <button
          type="button"
          className="fl-password-eye"
          onClick={() => setShow(!show)}
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <Eye size={18} /> : <EyeOff size={18} />}
        </button>
      </div>
    </div>
  );
}

// Plain terms, shown from the sign-up screen.
function TermsNote() {
  return (
    <div className="fl-prose">
      <p className="fl-panel-title fl-serif">Using Ledger</p>
      <p>
        Ledger is a free tool to help you keep track of your debts and income and plan how to pay them off. You’re
        welcome to use it for yourself and to share items with the people you manage them with.
      </p>
      <p className="fl-panel-title fl-serif">Not financial advice</p>
      <p>
        Balances, plans and dates are calculations from what you enter. They can’t know everything about your
        situation, so check anything important with your lender before acting on it.
      </p>
      <p className="fl-panel-title fl-serif">Your part</p>
      <p>
        You’re responsible for what you enter and who you share it with. Keep your password to yourself, and don’t
        use Ledger for anything unlawful or to store other people’s details without their agreement. Accounts that
        are misused may be removed.
      </p>
      <p className="fl-panel-title fl-serif">No guarantees</p>
      <p>
        Ledger is provided as it is. It’s looked after carefully, but it may sometimes be unavailable or have
        mistakes, so keep your own copy (Account → Download a backup). You can delete your account at any time.
      </p>
      <p className="fl-panel-title fl-serif">Changes</p>
      <p>These terms may be updated; the app always shows the latest. Questions: reply to any email from Ledger.</p>
    </div>
  );
}

// Signing in and creating an account: email + password, or Google once it's
// switched on in Supabase. A new account confirms its email, and a forgotten
// password is reset, with the 6-digit code from the email — or with the link
// in it, for when Supabase sends its own template instead of ours (it falls
// back to that when it can't load ours). `onHold(true)` keeps this screen up
// while a password reset finishes, since the code or link signs you in before
// the new password is saved. `recoveryEmail` is set when a reset link opened
// the app: then only the new password is asked for.
function SignIn({ notice, onHold, recoveryEmail }) {
  const [stage, setStage] = useState("signin"); // signin | signup | confirm | forgot | reset
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [agree, setAgree] = useState(false);
  const [remember, setRemember] = useState(getRememberMe);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [resetVerified, setResetVerified] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [googleOn, setGoogleOn] = useState(false);
  const bot = useTurnstile(TURNSTILE_SITE_KEY);
  const waitingForBot = bot.enabled && !bot.token && !bot.failed;
  const cleanEmail = email.trim().toLowerCase();

  useEffect(() => {
    loadAuthSettings().then((s) => setGoogleOn(!!(s && s.external && s.external.google)));
    // Back from Google or an email link with an error (sign-in cancelled, or
    // a link that has expired or was already used).
    const params = new URLSearchParams(window.location.hash.slice(1) + "&" + window.location.search.slice(1));
    const why = params.get("error_description");
    if (why) {
      setError(
        params.get("error_code") === "otp_expired"
          ? "That email link has expired or was already used. Sign in, or ask for a new code."
          : "Sign-in didn’t finish: " + why.replace(/\+/g, " ")
      );
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  // A password-reset link opened the app: it has already signed in, so only
  // the new password is needed.
  useEffect(() => {
    if (!recoveryEmail) return;
    setEmail(recoveryEmail);
    setStage("reset");
    setResetVerified(true);
    setPassword("");
    setError("");
    setInfo("");
  }, [recoveryEmail]);

  function go(next) {
    setStage(next);
    setError("");
    setInfo("");
    setCode("");
  }

  // Requests that need a robot-check pass. Each pass works only once, so the
  // check is reset after every request. If the check couldn't run, it asks
  // anyway and Supabase's setting decides.
  async function withBot(run) {
    if (waitingForBot) {
      setError("One moment — just checking you’re a person, not a bot.");
      return null;
    }
    setBusy(true);
    setError("");
    setInfo("");
    try {
      return await run(bot.token || undefined);
    } catch (e) {
      return { error: e };
    } finally {
      if (bot.enabled) bot.reset();
      setBusy(false);
    }
  }

  function explain(err, fallback) {
    const msg = (err && err.message) || "";
    if (/captcha/i.test(msg)) return "The robot check didn’t go through — reload the page and try again.";
    if (/rate limit|seconds|too many/i.test(msg)) return "Too many tries just now — wait a minute and try again.";
    return fallback;
  }

  const ALREADY =
    "There’s already an account with this email. Sign in instead — or tap “Forgot password?” if you haven’t set a password yet.";

  async function signIn() {
    if (!EMAIL_RE.test(cleanEmail)) return setError("Enter your email address.");
    if (!password) return setError("Enter your password.");
    setRememberMe(remember);
    const res = await withBot((captchaToken) =>
      supabase.auth.signInWithPassword({ email: cleanEmail, password, options: { captchaToken } })
    );
    if (!res || !res.error) return;
    console.error("sign in failed", res.error);
    const msg = res.error.message || "";
    if (/not confirmed/i.test(msg)) {
      go("confirm");
      setInfo("Your email isn’t confirmed yet. Tap “Send a new code”, then enter it here.");
      return;
    }
    setError(
      /invalid login/i.test(msg)
        ? "Wrong email or password. Used to sign in with a code? Tap “Forgot password?” to set a password."
        : explain(res.error, "Couldn’t sign in — check your connection and try again.")
    );
  }

  async function signUp() {
    if (!name.trim()) return setError("Enter your name.");
    if (!EMAIL_RE.test(cleanEmail)) return setError("Enter your email address.");
    if (password.length < MIN_PASSWORD) return setError(`Choose a password of at least ${MIN_PASSWORD} characters.`);
    if (!agree) return setError("Please agree to the Terms and Privacy Policy first.");
    setRememberMe(remember);
    const res = await withBot((captchaToken) =>
      supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: { data: { full_name: name.trim() }, captchaToken, emailRedirectTo: window.location.origin },
      })
    );
    if (!res) return;
    if (res.error) {
      console.error("sign up failed", res.error);
      return setError(
        /registered|exists/i.test(res.error.message || "")
          ? ALREADY
          : explain(res.error, "Couldn’t create your account — check your connection and try again.")
      );
    }
    // Supabase answers an email that already has an account with an empty
    // user rather than an error, and sends nothing.
    const u = res.data && res.data.user;
    if (u && Array.isArray(u.identities) && u.identities.length === 0) return setError(ALREADY);
    if (res.data && res.data.session) return; // no confirmation needed: signed in already
    go("confirm");
  }

  async function confirmEmail() {
    const token = code.replace(/\D/g, "");
    if (token.length < 6) return setError("Enter the code from the email.");
    setBusy(true);
    setError("");
    const { error: err } = await supabase.auth.verifyOtp({ email: cleanEmail, token, type: "email" });
    setBusy(false);
    if (err) {
      console.error("confirm failed", err);
      setError("That code didn’t work — check it, or send a new one.");
    }
    // Otherwise the account is confirmed and signed in, and the app opens.
  }

  async function resendConfirmation() {
    const res = await withBot((captchaToken) =>
      supabase.auth.resend({
        type: "signup",
        email: cleanEmail,
        options: { captchaToken, emailRedirectTo: window.location.origin },
      })
    );
    if (!res) return;
    if (res.error) {
      console.error("resend failed", res.error);
      return setError(explain(res.error, "Couldn’t send a new code — try again."));
    }
    setInfo(`A new code is on its way to ${cleanEmail}.`);
  }

  async function sendResetCode() {
    if (!EMAIL_RE.test(cleanEmail)) return setError("Enter your email address.");
    const res = await withBot((captchaToken) =>
      supabase.auth.resetPasswordForEmail(cleanEmail, { captchaToken, redirectTo: window.location.origin })
    );
    if (!res) return;
    if (res.error) {
      console.error("reset code failed", res.error);
      return setError(explain(res.error, "Couldn’t send the code — check the email and your connection."));
    }
    if (stage !== "reset") {
      go("reset");
      setPassword("");
      setResetVerified(false);
    } else {
      setInfo(`A new code is on its way to ${cleanEmail}.`);
    }
  }

  async function saveNewPassword() {
    const token = code.replace(/\D/g, "");
    if (!resetVerified && token.length < 6) return setError("Enter the code from the email.");
    if (password.length < MIN_PASSWORD) return setError(`Choose a password of at least ${MIN_PASSWORD} characters.`);
    setBusy(true);
    setError("");
    setRememberMe(remember);
    onHold(true);
    if (!resetVerified) {
      const v = await supabase.auth.verifyOtp({ email: cleanEmail, token, type: "recovery" });
      if (v.error) {
        console.error("reset code didn’t work", v.error);
        onHold(false);
        setBusy(false);
        return setError("That code didn’t work — check it, or send a new one.");
      }
      setResetVerified(true);
    }
    const u = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (u.error && !/different from the old/i.test(u.error.message || "")) {
      console.error("new password not saved", u.error);
      return setError("Couldn’t save the new password — try again, or tap “Skip” and change it later in Account.");
    }
    onHold(false); // saved (or it was already this password): open the app
  }

  async function continueWithGoogle() {
    setRememberMe(remember);
    setBusy(true);
    setError("");
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (err) {
      console.error("google failed", err);
      setBusy(false);
      setError("Couldn’t open Google sign-in — try again.");
    }
  }

  const needsBot = stage === "signin" || stage === "signup" || stage === "forgot";
  const mainBlocked = busy || (needsBot && waitingForBot);
  const screens = {
    signin: {
      title: "Welcome back",
      sub: "Sign in with your email and password to see your ledger.",
      action: "Sign in",
      run: signIn,
    },
    signup: {
      title: "Create your account",
      sub: "Give your name, email and a password to get started.",
      action: "Sign up",
      run: signUp,
    },
    confirm: {
      title: "Confirm your email",
      sub: `Enter the 6-digit code we sent to ${cleanEmail}, or tap the link in that email. It can take a minute — check spam too.`,
      action: "Confirm",
      run: confirmEmail,
    },
    forgot: {
      title: "Forgot your password?",
      sub: "Enter your email and we’ll send you a code to set a new one.",
      action: "Send code",
      run: sendResetCode,
    },
    reset: {
      title: "Set a new password",
      sub: resetVerified
        ? `Choose a new password for ${cleanEmail}.`
        : `If there’s an account for ${cleanEmail}, we’ve sent it an email. Enter its 6-digit code and a new password here, or tap the link in it.`,
      action: "Save new password",
      run: saveNewPassword,
    },
  };
  const screen = screens[stage];
  const onEnter = () => !mainBlocked && screen.run();

  return (
    <div className="fl-shell">
      <style>{styles}</style>
      <div className="ox-auth-wrap">
        <div className="fl-auth" key={stage}>
          <div className="ox-auth-brand">
            <span className="ox-brand-mark" aria-hidden="true" /> Ledger
          </div>
          {!(stage === "signin" || (stage === "reset" && resetVerified)) && (
            // Once a reset code or link has signed in, the way on is saving
            // the password or "Skip", not back to the sign-in form.
            <button className="fl-back-row" onClick={() => go("signin")} disabled={busy}>
              <ChevronLeft size={18} /> Sign in
            </button>
          )}
          {notice && (
            <div className="ox-banner info">
              <Check size={18} /> <span>{notice}</span>
            </div>
          )}
          <h2 className="fl-auth-title">{screen.title}</h2>
          <p className="fl-auth-sub">{screen.sub}</p>

          {(stage === "signin" || stage === "signup") && googleOn && (
            <>
              <button className="fl-social-btn" onClick={continueWithGoogle} disabled={busy}>
                <GoogleLogo /> Continue with Google
              </button>
              <p className="fl-auth-fine">
                Continuing with Google means you agree to the{" "}
                <button className="fl-link" onClick={() => setSheet("terms")}>
                  Terms
                </button>{" "}
                and{" "}
                <button className="fl-link" onClick={() => setSheet("privacy")}>
                  Privacy Policy
                </button>
                .
              </p>
              <div className="fl-auth-or">or</div>
            </>
          )}

          {stage === "signup" && (
            <div className="fl-field">
              <label>Full name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onEnter()}
                autoComplete="name"
                placeholder="e.g. Fathima Rahman"
              />
            </div>
          )}

          {(stage === "signin" || stage === "signup" || stage === "forgot") && (
            <div className="fl-field">
              <label>Email address</label>
              <input
                type="email"
                inputMode="email"
                autoComplete={stage === "signup" ? "email" : "username"}
                autoCapitalize="none"
                autoCorrect="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onEnter()}
                placeholder="name@example.com"
              />
            </div>
          )}

          {(stage === "signin" || stage === "signup") && (
            <PasswordField
              label="Password"
              value={password}
              onChange={setPassword}
              onEnter={onEnter}
              autoComplete={stage === "signin" ? "current-password" : "new-password"}
            />
          )}

          {(stage === "confirm" || (stage === "reset" && !resetVerified)) && (
            <div className="fl-field">
              <label>Code from the email</label>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onEnter()}
                placeholder="123456"
                className="fl-code-input"
              />
            </div>
          )}

          {stage === "reset" && (
            <PasswordField
              label={`New password (at least ${MIN_PASSWORD} characters)`}
              value={password}
              onChange={setPassword}
              onEnter={onEnter}
              autoComplete="new-password"
            />
          )}

          {stage === "signin" && (
            <div className="fl-auth-row">
              <span className="fl-auth-check">
                <Switch on={remember} onChange={setRemember} label="Remember me" />
                Remember me
              </span>
              <button className="fl-link" onClick={() => go("forgot")}>
                Forgot password?
              </button>
            </div>
          )}

          {stage === "signup" && (
            <div className="fl-auth-row">
              <span className="fl-auth-check">
                <Switch on={agree} onChange={setAgree} label="I agree to the Terms and Privacy Policy" />
                <span>
                  I agree to the{" "}
                  <button className="fl-link" onClick={() => setSheet("terms")}>
                    Terms
                  </button>{" "}
                  &amp;{" "}
                  <button className="fl-link" onClick={() => setSheet("privacy")}>
                    Privacy Policy
                  </button>
                </span>
              </span>
            </div>
          )}

          <button className="fl-btn fl-auth-main" onClick={screen.run} disabled={mainBlocked}>
            {busy ? "One moment…" : needsBot && waitingForBot ? "One moment…" : screen.action}
          </button>

          {(stage === "confirm" || (stage === "reset" && !resetVerified)) && (
            <p className="fl-auth-switch">
              No code?{" "}
              <button
                className="fl-link"
                onClick={stage === "confirm" ? resendConfirmation : sendResetCode}
                disabled={busy || waitingForBot}
              >
                Send a new code
              </button>
            </p>
          )}
          {stage === "reset" && resetVerified && (
            <p className="fl-auth-switch">
              <button className="fl-link" onClick={() => onHold(false)}>
                Skip — I’ll change it later in Account
              </button>
            </p>
          )}

          {info && (
            <div className="ox-banner info" style={{ marginTop: 16 }}>
              <Mail size={18} /> <span>{info}</span>
            </div>
          )}
          {error && (
            <div className="ox-banner error ox-shake" style={{ marginTop: 16 }} key={error} role="alert">
              <AlertCircle size={18} /> <span>{error}</span>
            </div>
          )}
          {bot.enabled && <div className="fl-turnstile" ref={bot.boxRef} />}
          {bot.failed && (
            <p className="fl-card-sub" style={{ marginTop: 10, textAlign: "center" }}>
              The robot check couldn’t run here (error {bot.failed}).
            </p>
          )}

          {stage === "signin" && (
            <p className="fl-auth-switch">
              Don’t have an account?{" "}
              <button className="fl-link" onClick={() => go("signup")}>
                Sign up
              </button>
            </p>
          )}
          {stage === "signup" && (
            <p className="fl-auth-switch">
              Already have an account?{" "}
              <button className="fl-link" onClick={() => go("signin")}>
                Sign in
              </button>
            </p>
          )}
          <p className="fl-signin-links">
            <button className="fl-link" onClick={() => setSheet("privacy")}>
              Privacy
            </button>{" "}
            ·{" "}
            <button className="fl-link" onClick={() => setSheet("terms")}>
              Terms
            </button>
          </p>
        </div>
      </div>
      {sheet && (
        <Sheet title={sheet === "terms" ? "Terms" : "Privacy"} onClose={() => setSheet(null)}>
          {sheet === "terms" ? <TermsNote /> : <PrivacyNote />}
        </Sheet>
      )}
    </div>
  );
}

// Change (or, after Google sign-in, add) a password while signed in.
function ChangePasswordPanel() {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function save() {
    if (pw.length < MIN_PASSWORD) return setMsg(`Choose a password of at least ${MIN_PASSWORD} characters.`);
    setBusy(true);
    setMsg("");
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) {
      console.error("change password failed", error);
      const m = error.message || "";
      setMsg(
        /different from the old/i.test(m)
          ? "That’s already your password."
          : /reauth|recent/i.test(m)
          ? "For safety, sign out and use “Forgot password?” to change it."
          : "Couldn’t change it — try again."
      );
      return;
    }
    setPw("");
    setMsg("Password changed.");
  }
  return (
    <div className="fl-panel">
      <PasswordField label="New password" value={pw} onChange={setPw} onEnter={save} autoComplete="new-password" />
      <div className="fl-form-actions">
        <button className="fl-btn" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Change password"}
        </button>
      </div>
      <p className="fl-card-sub" style={{ marginTop: 10 }}>
        {msg || "Signed in with Google? Add a password here to be able to sign in with your email too."}
      </p>
    </div>
  );
}

// The shape of the Overview while it loads: shimmering placeholders where the
// figures and chart will appear, so the page doesn't jump when they arrive.
function LoadingSkeleton() {
  const bar = (w, h, extra = {}) => <div className="ox-skel" style={{ width: w, height: h, ...extra }} />;
  return (
    <div className="ox-app" aria-busy="true" aria-label="Loading your ledger">
      <aside className="ox-sidebar">
        <div className="ox-brand">
          <span className="ox-brand-mark" aria-hidden="true" /> Ledger
        </div>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i}>{bar("100%", 38, { margin: "4px 0" })}</div>
        ))}
      </aside>
      <div className="ox-main">
        <div className="fl-topbar">
          <div className="ox-topbar-text">
            {bar(130, 12, { marginBottom: 10 })}
            {bar(170, 26)}
          </div>
        </div>
        <div className="fl-content">
          <div className="ox-page">
            <div className="ox-grid two">
              <div className="ox-stack">
                <div className="ox-card ox-hero">
                  {bar(90, 12)}
                  {bar("62%", 48, { marginTop: 14 })}
                  {bar("100%", 6, { marginTop: 24 })}
                </div>
                <div className="ox-tiles">
                  {[0, 1, 2].map((i) => (
                    <div className="ox-tile" key={i}>
                      {bar(30, 30, { borderRadius: 9 })}
                      {bar("70%", 11, { marginTop: 12 })}
                      {bar("55%", 20, { marginTop: 8 })}
                    </div>
                  ))}
                </div>
                <div className="ox-card">{bar("100%", 190)}</div>
              </div>
              <div className="ox-stack">
                <div className="ox-card">{bar("100%", 220)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Signed-in person → their ledger; otherwise the sign-in screen.
export default function App() {
  const [session, setSession] = useState(undefined);
  const [notice, setNotice] = useState("");
  // Opened from a password-reset link: stay on the sign-in screen to ask for
  // the new password before opening the app.
  const [recovering, setRecovering] = useState(openedFromEmailLink === "recovery");
  const [hold, setHold] = useState(openedFromEmailLink === "recovery");
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      // A reset link that didn't sign in (e.g. expired): nothing to wait for.
      if (!data.session) {
        setRecovering(false);
        setHold(false);
      }
      setSession(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") {
        setRecovering(true);
        setHold(true);
      }
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  if (session === undefined) {
    return (
      <div className="fl-shell">
        <style>{styles}</style>
        <div className="ox-center" aria-busy="true" aria-label="Loading">
          <span className="ox-brand-mark ox-splash-mark" aria-hidden="true" />
        </div>
      </div>
    );
  }
  if (!session || hold) {
    return (
      <SignIn
        notice={notice}
        onHold={(on) => {
          setHold(on);
          if (!on) setRecovering(false);
        }}
        recoveryEmail={recovering && session ? session.user.email : null}
      />
    );
  }
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
  // A starting name for recording payments: the first name given at sign-up
  // (or by Google), else the first part of the email.
  const fullName = ((user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || "").trim();
  const myName = (() => {
    if (fullName) return fullName.split(/\s+/)[0];
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
  // Onyx frame: the Add menu, the header's edge once content scrolls under it,
  // and the tab bar's highlight, which slides to the current tab.
  const [addMenu, setAddMenu] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [navPill, setNavPill] = useState(null);
  const contentRef = useRef(null);
  const navRef = useRef(null);
  const scrolledRef = useRef(false);
  useLayoutEffect(() => {
    function place() {
      const nav = navRef.current;
      const t = view === "loanDetail" ? "loans" : view === "incomeDetail" ? "income" : view;
      const btn = nav && nav.querySelector(`[data-tab="${t}"]`);
      setNavPill(btn ? { x: btn.offsetLeft - 6, w: btn.offsetWidth } : null);
    }
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [view, loading]);

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

  function showToast(msg, undo = null, ms = undo ? 6000 : 1800) {
    const tone = /couldn|didn’t|didn't|someone else|already shared/i.test(msg)
      ? "error"
      : /^no /i.test(msg)
      ? "info"
      : "done";
    setToast({ msg, undo, tone, id: Date.now() });
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
        <LoadingSkeleton />
      </div>
    );
  }

  if (connectionError) {
    return (
      <div className="fl-shell">
        <style>{styles}</style>
        <div className="ox-center">
          <div className="ox-state" role="alert">
            <div className="ox-state-icon">
              <WifiOff size={28} />
            </div>
            <h2>Can’t reach your ledger</h2>
            <p>Check your connection, then try again. Nothing you’ve saved is lost.</p>
            <div className="fl-form-actions">
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
      ? simulateStrategy(strategyLoans, strategy.type, strategyBudget, 600, { track: true })
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
    const ownerName = (metaRef.current.accounts || {})[m.ownerEmail] || nameFromEmail(m.ownerEmail);
    return {
      owner,
      canEdit: owner || (mine && mine.role === "editor"),
      shares: m.shares,
      ownerEmail: m.ownerEmail,
      ownerName,
      myRole: mine && mine.role,
    };
  }

  // ---- People: those you've invited, and who can see what ----
  const contacts = data.contacts || [];
  // Everyone you've invited, plus anyone something of yours is already shared
  // with (so nobody with access is hidden from this list).
  // Once someone has signed up (and something is shared between you), they
  // show under the name they gave; until then, under the name you gave.
  const accounts = metaRef.current.accounts || {};
  const knownPeople = (() => {
    const person = (email, given, saved) => {
      const own = accounts[email];
      const name = own || given || nameFromEmail(email);
      return { email, name, given, joined: email in accounts, saved, payName: own ? own.split(/\s+/)[0] : name };
    };
    const list = contacts.map((c) => person(c.email, c.name, true));
    const seen = new Set(list.map((x) => x.email));
    Object.values(metaRef.current.items).forEach((m) => {
      if (m.ownerId !== user.id) return;
      m.shares.forEach((sh) => {
        if (seen.has(sh.email)) return;
        seen.add(sh.email);
        list.push(person(sh.email, null, false));
      });
    });
    return list;
  })();
  // The name someone's payments go under: the first name they signed up with
  // (the same one their own app uses), else the name you gave them.
  const personName = (email) => (knownPeople.find((x) => x.email === email) || { payName: nameFromEmail(email) }).payName;
  // Who did something, by name: yourself, the people you know, then their email.
  const whoName = (email) =>
    !email
      ? "Someone"
      : email === myEmail
      ? "You"
      : (knownPeople.find((x) => x.email === email) || {}).name || accounts[email] || email;
  const ownedSharedWith = (email) =>
    Object.entries(metaRef.current.items)
      .filter(([, m]) => m.ownerId === user.id && m.shares.some((sh) => sh.email === email))
      .map(([id]) => id);

  // Names on a debt's payment form: you, plus the people it's shared with (on
  // your own debts), or everyone who has paid into it (on someone else's).
  // Editing a month also keeps whoever paid in that month.
  function namesFor(loanId, monthKey) {
    const a = access(loanId);
    const names = [myName];
    if (a.owner) a.shares.forEach((sh) => names.push(personName(sh.email)));
    else Object.values(payments[loanId] || {}).forEach((e) => Object.keys((e && e.amounts) || {}).forEach((n) => names.push(n)));
    const entry = monthKey && (payments[loanId] || {})[monthKey];
    if (entry && entry.amounts) Object.keys(entry.amounts).forEach((n) => names.push(n));
    return [...new Set(names)];
  }

  async function addPerson(name, email) {
    if (email === myEmail) {
      showToast("That’s your own email", null, 3000);
      return false;
    }
    if (contacts.some((c) => c.email === email)) {
      showToast(`${personName(email)} is already in your people`, null, 3000);
      return false;
    }
    persist({ ...dataRef.current, contacts: [...(dataRef.current.contacts || []), { name, email }] }, { message: `${name} added` });
    await saveQueue.current;
    return true;
  }

  // Taking someone off your list also stops sharing everything with them.
  async function removePerson(person) {
    const ids = ownedSharedWith(person.email);
    try {
      for (const id of ids) await store.removeShare(id, person.email);
    } catch (e) {
      console.error("unshare failed", e);
      showToast("Couldn’t remove them — try again", null, 4000);
      await reload();
      return;
    }
    await saveQueue.current;
    await reload();
    const now = dataRef.current;
    const kept = (now.contacts || []).filter((c) => c.email !== person.email);
    const msg = ids.length ? `${person.name} removed from ${ids.length} item${ids.length === 1 ? "" : "s"}` : `${person.name} removed`;
    if (kept.length !== (now.contacts || []).length) persist({ ...now, contacts: kept }, { message: msg, undoable: false });
    else showToast(msg);
  }

  // Gives someone access to one item, changes what they can do, or takes it away.
  async function changeAccess(itemId, email, role, name) {
    const current = ((metaRef.current.items[itemId] || {}).shares || []).find((sh) => sh.email === email);
    try {
      if (role === "none") {
        if (current) await store.removeShare(itemId, email);
      } else if (!current) {
        await store.addShare(itemId, email, role);
      } else if (current.role !== role) {
        await store.setShareRole(itemId, email, role);
      }
      await reload();
      showToast(role === "none" ? `Stopped sharing with ${name}` : role === "viewer" ? `${name} can view it` : `${name} can edit it`);
      return true;
    } catch (e) {
      console.error("sharing failed", e);
      showToast("Couldn’t change sharing — try again", null, 4000);
      return false;
    }
  }

  async function inviteToItem(itemId, name, email, role) {
    const known = contacts.some((c) => c.email === email);
    if (!known && !(await addPerson(name, email))) return false;
    return changeAccess(itemId, email, role, name);
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
    const names = namesFor(loanId, monthKey);
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

  // One debt as a card (Overview and Debts): balance, progress, what's due.
  function renderDebtCard(l, i) {
              const pct = l.totalAmount > 0 ? Math.max(Math.min((l.totalAmount - l.remaining) / l.totalAmount, 1), 0) : 0;
              return (
                <div className="fl-card ox-rise" style={{ "--i": Math.min(i, 8) + 4 }} key={l.id} onClick={() => openLoan(l.id)}>
                  <div className="fl-card-row">
                    <span className="fl-card-name">{l.name}</span>
                    <span className="fl-card-balance fl-mono">{fmt(l.remaining)}</span>
                  </div>
                  <div className="fl-progress-track">
                    <div className="fl-progress-fill" style={{ width: (pct * 100).toFixed(1) + "%" }} />
                  </div>
                  <div className="ox-card-foot">
                    <span>of {fmt(l.totalAmount)}</span>
                    <span>{Math.round(pct * 100)}% repaid</span>
                  </div>
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
  }

  // ---- Onyx frame: where we are and how to get around ----
  const tab = view === "loanDetail" ? "loans" : view === "incomeDetail" ? "income" : view;
  const TITLES = { dashboard: "Overview", loans: "Debts", income: "Income", strategy: "Plan", account: "Account" };
  const hourNow = today.getHours();
  const greeting = hourNow < 5 ? "Good evening" : hourNow < 12 ? "Good morning" : hourNow < 17 ? "Good afternoon" : "Good evening";
  const EYEBROWS = {
    dashboard: `${greeting}, ${myName}`,
    loans: "Everything you owe",
    income: "What comes in",
    strategy: "Your way to debt-free",
    account: "Your settings and data",
  };
  const initials = (fullName || myName)
    .split(/\s+/)
    .map((w) => w.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const NAV = [
    ["dashboard", "Overview", LayoutDashboard],
    ["loans", "Debts", Landmark],
    ["income", "Income", TrendingUp],
    ["strategy", "Plan", Target],
  ];
  function go(next) {
    setView(next);
    if (next === "account") loadAccountLists();
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }
  function onContentScroll(e) {
    const s = e.currentTarget.scrollTop > 4;
    if (s !== scrolledRef.current) {
      scrolledRef.current = s;
      setScrolled(s);
    }
  }
  const pageKey = view + "|" + (view === "loanDetail" ? selectedLoanId : view === "incomeDetail" ? selectedIncomeId : "");

  // ---- Charts: the plan's path to debt-free, and who is owed what ----
  const payoffPoints = (() => {
    if (!strategyResult || !strategyResult.feasible || !strategyResult.balances) return null;
    const startTotal = strategyLoans.reduce((sum, l) => sum + l.balance, 0);
    const all = [
      { label: "Now", value: startTotal },
      ...strategyResult.balances.map((b, i) => ({ label: monthKeyShort(monthKeyAdd(asOfKey, i)), value: b })),
    ];
    if (all.length <= 90) return all;
    const step = Math.ceil(all.length / 90);
    const out = all.filter((_, i) => i % step === 0);
    if (out[out.length - 1] !== all[all.length - 1]) out.push(all[all.length - 1]);
    return out;
  })();
  const OWE_COLORS = ["#e3bb6f", "#86a9f2", "#a99bd6", "#d9a08a", "#7fb3c4", "#5b6472"];
  // What's owed by debt type (Mortgage, Car…), for the Debts tab.
  const debtTypeItems = (() => {
    const byType = {};
    lenderSummaries.forEach((l) => {
      if (l.remaining <= 0.5) return;
      const name = categoryLabel(l.category) || "Untagged";
      byType[name] = (byType[name] || 0) + l.remaining;
    });
    return Object.entries(byType)
      .sort((x, y) => y[1] - x[1])
      .map(([name, value], i) => ({ id: name, name, value, color: OWE_COLORS[Math.min(i, OWE_COLORS.length - 1)] }));
  })();
  // Income and expenses of all sources together, for the last eight months
  // that have anything recorded.
  const incomeMonths = (() => {
    const out = [];
    for (let k = 11; k >= 0; k--) {
      const key = monthKeyAdd(asOfKey, -k);
      let inc = 0;
      let exp = 0;
      let any = false;
      incomes.forEach((src) => {
        const r = (incomeRecords[src.id] || {})[key];
        if (!r) return;
        any = true;
        inc += Number(r.income) || 0;
        exp += Number(r.expenses) || 0;
      });
      if (any) out.push({ label: monthKeyShort(key).split(" ")[0], full: monthKeyShort(key), a: inc, b: exp });
    }
    return out.slice(-8);
  })();
  const oweItems = (() => {
    const owing = lenderSummaries.filter((l) => l.remaining > 0.5).sort((a, b) => b.remaining - a.remaining);
    const top = owing.slice(0, 5).map((l, i) => ({ id: l.id, name: l.name, value: l.remaining, color: OWE_COLORS[i] }));
    const rest = owing.slice(5).reduce((sum, l) => sum + l.remaining, 0);
    if (rest > 0.5) top.push({ id: "other", name: `${owing.length - 5} more`, value: rest, color: OWE_COLORS[5] });
    return top;
  })();

  return (
    <div className="fl-shell">
      <style>{styles}</style>
      <div className="ox-app">
        <aside className="ox-sidebar" aria-label="Main">
          <div className="ox-brand">
            <span className="ox-brand-mark" aria-hidden="true" /> Ledger
          </div>
          <button className="fl-btn ox-side-add" onClick={() => setAddMenu("menu")}>
            <Plus size={18} /> Add
          </button>
          {NAV.map(([id, label, Icon]) => (
            <button
              key={id}
              className={"ox-side-link" + (tab === id ? " active" : "")}
              onClick={() => go(id)}
              aria-current={tab === id ? "page" : undefined}
            >
              <Icon size={18} /> {label}
            </button>
          ))}
          <button className="ox-side-foot" onClick={() => go("account")} aria-current={tab === "account" ? "page" : undefined}>
            <span className="ox-avatar" aria-hidden="true">
              {initials}
            </span>
            <span className="ox-side-foot-text">
              {fullName || myName}
              <span>{myEmail}</span>
            </span>
          </button>
        </aside>

        <div className="ox-main">
          <header className={"fl-topbar" + (scrolled ? " scrolled" : "")}>
            <div className="ox-topbar-text">
              {view === "loanDetail" && selectedLoan ? (
                <>
                  <button className="fl-back-row" onClick={() => go("loans")}>
                    <ChevronLeft size={18} /> Debts
                  </button>
                  <h1 className="fl-title">{selectedLoan.name}</h1>
                </>
              ) : view === "incomeDetail" && selectedIncome ? (
                <>
                  <button className="fl-back-row" onClick={() => go("income")}>
                    <ChevronLeft size={18} /> Income
                  </button>
                  <h1 className="fl-title">{selectedIncome.name}</h1>
                </>
              ) : (
                <>
                  <p className="ox-eyebrow">{EYEBROWS[view] || ""}</p>
                  <h1 className="fl-title">{TITLES[view] || "Ledger"}</h1>
                </>
              )}
            </div>
            <div className="ox-topbar-actions">
              {(view === "loans" || view === "income") && (
                <button
                  className="fl-btn small secondary"
                  onClick={() => (view === "income" ? setShowAddIncome(true) : setShowAddLoan(true))}
                >
                  <Plus size={16} /> {view === "income" ? "Add source" : "Add debt"}
                </button>
              )}
              <button className="ox-avatar" onClick={() => go("account")} aria-label="Account">
                {initials}
              </button>
            </div>
          </header>

          <div className="fl-content" ref={contentRef} onScroll={onContentScroll}>
            <div className={"ox-page" + (view === "account" || view === "loanDetail" || view === "incomeDetail" ? " narrow" : "")} key={pageKey}>
        {view === "dashboard" && isEmptyAccount && (
          <div className="ox-card ox-hero ox-rise" style={{ maxWidth: 640, margin: "8px auto 0" }}>
            <div className="ox-empty-icon">
              <Wallet size={26} />
            </div>
            <h2 className="fl-title" style={{ whiteSpace: "normal", marginBottom: 8 }}>
              Welcome to Ledger
            </h2>
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
          <div className={"ox-banner ox-rise " + (importResult.matches ? "info" : "error")} style={{ display: "block" }}>
            <p className="fl-panel-title">{importResult.matches ? "Imported ✓" : "Imported — please check"}</p>
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
          <div className="ox-card ox-hero ox-rise" style={{ maxWidth: 640, margin: "8px auto 0" }}>
            <div className="ox-empty-icon">
              <Wallet size={26} />
            </div>
            <h2 className="fl-title" style={{ whiteSpace: "normal", marginBottom: 6 }}>
              Let’s set up your ledger
            </h2>
            <p className="ox-card-sub" style={{ marginBottom: 20 }}>
              Add what you owe and what comes in. This overview fills in as you go.
            </p>
            <GettingStartedSteps />
            <div className="fl-form-actions">
              <button className="fl-btn secondary" onClick={() => setShowAddIncome(true)}>
                <Plus size={16} /> Add income
              </button>
              <button className="fl-btn" onClick={() => setShowAddLoan(true)}>
                <Plus size={16} /> Add a debt
              </button>
            </div>
          </div>
        )}

        {view === "dashboard" && !isEmptyAccount && (data.lenders.length > 0 || (data.incomes || []).length > 0) && (
          <div className="ox-grid two">
            <div className="ox-stack">
              <section className="ox-card ox-hero ox-rise" style={{ "--i": 0 }}>
                <div className="ox-card-head" style={{ marginBottom: 0 }}>
                  <p className="ox-label">Total owed</p>
                  {strategyResult && strategyResult.feasible && (
                    <button className="fl-chip chip-accent fl-tap" onClick={() => go("strategy")}>
                      <Target size={12} /> Debt-free by {byMonth(strategyResult.months)}
                    </button>
                  )}
                </div>
                <p className="ox-amount-xl">
                  <Amount value={totalRemaining} countUp />
                </p>
                <div className="ox-bar">
                  <div className="ox-bar-fill" style={{ width: (overallPct * 100).toFixed(1) + "%" }} />
                </div>
                <div className="ox-card-foot">
                  <span>
                    {totalPaid >= 0
                      ? `${fmt(totalPaid)} repaid of ${fmt(totalAmount)}`
                      : `Interest has added ${fmt(-totalPaid)} to the ${fmt(totalAmount)} borrowed`}
                  </span>
                  <span>{Math.round(overallPct * 100)}%</span>
                </div>
              </section>

              <div className="ox-tiles">
                <button
                  className="ox-tile ox-rise"
                  style={{ "--i": 1 }}
                  onClick={() => (thisMonthItems.length ? document.getElementById("ox-this-month")?.scrollIntoView({ behavior: "smooth", block: "start" }) : go("loans"))}
                >
                  <span className={"ox-tile-icon" + (monthDue > 0.5 ? " neg" : " pos")}>
                    <CalendarClock size={16} />
                  </span>
                  <span className="ox-label">Still to pay</span>
                  <span className="ox-tile-value">
                    <Amount value={monthDue} />
                  </span>
                  <span className="ox-tile-sub">
                    {monthPaid > 0.5 ? `${fmt(monthPaid)} paid in ${monthKeyShort(asOfKey).split(" ")[0]}` : `this month · ${monthKeyShort(asOfKey)}`}
                  </span>
                </button>
                <button className="ox-tile ox-rise" style={{ "--i": 2 }} onClick={() => go("income")}>
                  <span className="ox-tile-icon pos">
                    <TrendingUp size={16} />
                  </span>
                  <span className="ox-label">{recordedThisMonth.length > 0 ? "Profit this month" : "Usual profit"}</span>
                  <span className={"ox-tile-value" + ((recordedThisMonth.length > 0 ? profitThisMonth : usualProfitTotal) < 0 ? " ox-neg" : "")}>
                    <Amount value={recordedThisMonth.length > 0 ? profitThisMonth : usualProfitTotal} signed />
                  </span>
                  <span className="ox-tile-sub">
                    {activeIncomes.length === 0
                      ? "No income sources yet"
                      : `${recordedThisMonth.length} of ${activeIncomes.length} recorded`}
                  </span>
                </button>
                <button className="ox-tile ox-rise" style={{ "--i": 3 }} onClick={() => go("strategy")}>
                  <span className="ox-tile-icon accent">
                    <Target size={16} />
                  </span>
                  <span className="ox-label">Debt-free in</span>
                  <span className="ox-tile-value">
                    {strategyResult && strategyResult.feasible ? monthsLabel(strategyResult.months) : strategyLoans.length === 0 ? "Done" : "—"}
                  </span>
                  <span className="ox-tile-sub">
                    {strategyResult && strategyResult.feasible
                      ? `by ${byMonth(strategyResult.months)}`
                      : strategyLoans.length === 0
                      ? "Nothing owed"
                      : "Set your budget"}
                  </span>
                </button>
              </div>

              <section className="ox-card ox-rise" style={{ "--i": 4 }}>
                <div className="ox-card-head">
                  <div>
                    <h2 className="ox-card-title">Path to debt-free</h2>
                    <p className="ox-card-sub">
                      {payoffPoints ? `Projected total owed, paying ${fmt(effectiveBudget)} a month` : "Your plan, month by month"}
                    </p>
                  </div>
                  <button className="ox-section-link" onClick={() => go("strategy")}>
                    Plan <ChevronRight size={14} />
                  </button>
                </div>
                {payoffPoints ? (
                  <AreaChart
                    points={payoffPoints}
                    endMarker
                    height={210}
                    tipValue={(v) => (v < 0.5 ? "Debt-free" : fmt(v) + " left")}
                    ariaLabel={`Projected total owed falls to zero by ${byMonth(strategyResult.months)}`}
                  />
                ) : (
                  <div className="ox-empty" style={{ padding: "28px 16px" }}>
                    <div className="ox-empty-icon">
                      <Target size={24} />
                    </div>
                    <p className="ox-empty-title">{strategyLoans.length === 0 ? "Nothing owed" : "No plan yet"}</p>
                    <p>
                      {strategyLoans.length === 0
                        ? "Every debt is paid off, or none are added yet."
                        : strategyResult && !strategyResult.feasible
                        ? `Your budget doesn’t cover the minimum payments yet. You need at least ${fmt(strategyResult.minRequired)} a month.`
                        : "Set what you can put toward debts each month."}
                    </p>
                    {strategyLoans.length > 0 && (
                      <button className="fl-btn" onClick={() => go("strategy")}>
                        Open your plan
                      </button>
                    )}
                  </div>
                )}
              </section>

              {lenderSummaries.length > 0 && (
                <>
                  <p className="ox-section">
                    Your debts
                    <button className="ox-section-link" onClick={() => go("loans")}>
                      See all <ChevronRight size={14} />
                    </button>
                  </p>
                  <div>{lenderSummaries.map((l, i) => renderDebtCard(l, i))}</div>
                </>
              )}
            </div>

            <div className="ox-stack">
              {thisMonthItems.length > 0 && (
                <section id="ox-this-month">
            {thisMonthItems.length > 0 && (
                  <>
                    <p className="ox-section">
                      This month <span className="ox-faint" style={{ fontWeight: 500 }}>{monthKeyLabel(asOfKey)}</span>
                    </p>
                    <div className="fl-month-list ox-rise" style={{ "--i": 2 }}>
                      {thisMonthItems.map((x) => (
                        <button
                          key={x.kind + x.id}
                          className="fl-month-item"
                          disabled={!x.canEdit}
                          onClick={() => openRecord(x.kind, x.id)}
                          aria-label={(x.kind === "debt" ? "Record payment for " : "Record income for ") + x.name}
                        >
                          <span className={"fl-day" + (x.kind === "income" ? " fl-day-in" : x.status === "overdue" || x.status === "short" ? " ox-day-late" : "")}>
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
                  <p className="fl-card-sub" style={{ margin: "10px 4px 0" }}>
                    {fmt(monthDue)} still to pay · {fmt(monthPaid)} paid · {fmt(monthIn)} coming in
                  </p>
                </section>
              )}

              {oweItems.length > 1 && (
                <section className="ox-card ox-rise" style={{ "--i": 3 }}>
                  <div className="ox-card-head">
                    <div>
                      <h2 className="ox-card-title">Where you owe</h2>
                      <p className="ox-card-sub">Share of the {fmt(totalRemaining)} still owed</p>
                    </div>
                  </div>
                  <SegmentBar items={oweItems} onPick={openLoan} />
                </section>
              )}

              {activeIncomes.length > 0 && (
                <button className="ox-card tap ox-rise" style={{ "--i": 4, textAlign: "left", color: "inherit", width: "100%" }} onClick={() => go("income")}>
                  <div className="ox-card-head" style={{ marginBottom: 6 }}>
                    <h2 className="ox-card-title">Income · {monthKeyShort(asOfKey)}</h2>
                    <ChevronRight size={16} className="ox-faint" />
                  </div>
                  <p className={"ox-amount-md" + (recordedThisMonth.length > 0 && profitThisMonth < 0 ? " ox-neg" : "")}>
                    {recordedThisMonth.length > 0 ? <Amount value={profitThisMonth} signed /> : "Nothing recorded yet"}
                  </p>
                  <p className="fl-card-sub">
                    {usualProfitTotal >= 0 ? `Usually ${fmt(usualProfitTotal)} profit a month` : `Usually ${fmt(-usualProfitTotal)} loss a month`}
                    {incomeToDebts > 0.5 ? ` · ${fmt(incomeToDebts)} goes to debts` : ""}
                  </p>
                </button>
              )}
            </div>
          </div>
        )}

        {view === "dashboard" && otherCurrencyNote(otherCurrencyItems)}

        {view === "loans" && (
          <>
            {lenders.length > 0 ? (
              <div className="ox-grid two">
                <div className="ox-stack">
                  <section className="ox-card ox-hero ox-rise" style={{ "--i": 0 }}>
                    <p className="ox-label">Total owed</p>
                    <p className="ox-amount-lg">
                      <Amount value={totalRemaining} />
                    </p>
                    <div className="fl-detail-grid">
                      <div>
                        <p className="fl-stat-label">Borrowed</p>
                        <p className="fl-stat-value">{fmt(totalAmount)}</p>
                      </div>
                      <div>
                        <p className="fl-stat-label">Due in {monthKeyShort(asOfKey).split(" ")[0]}</p>
                        <p className="fl-stat-value">{fmt(monthDue + monthPaid)}</p>
                      </div>
                    </div>
                  </section>
                  <div>{lenderSummaries.map((l, i) => renderDebtCard(l, i))}</div>
                </div>
                <div className="ox-stack">
                  {oweItems.length > 1 && (
                    <section className="ox-card ox-rise" style={{ "--i": 2 }}>
                      <div className="ox-card-head">
                        <div>
                          <h2 className="ox-card-title">Where you owe</h2>
                          <p className="ox-card-sub">Share of what’s still owed</p>
                        </div>
                      </div>
                      <SegmentBar items={oweItems} onPick={openLoan} />
                    </section>
                  )}
                  {debtTypeItems.length > 1 && (
                    <section className="ox-card ox-rise" style={{ "--i": 3 }}>
                      <div className="ox-card-head">
                        <div>
                          <h2 className="ox-card-title">By type</h2>
                          <p className="ox-card-sub">What kind of debt it is</p>
                        </div>
                      </div>
                      <SegmentBar items={debtTypeItems} />
                    </section>
                  )}
                </div>
              </div>
            ) : (
              <div className="ox-empty ox-rise" style={{ maxWidth: 560, margin: "8px auto 0" }}>
                <div className="ox-empty-icon">
                  <Landmark size={24} />
                </div>
                <p className="ox-empty-title">No debts yet</p>
                <p>Add a loan, card or money you owe to see what’s left and when it’ll be paid off.</p>
                <button className="fl-btn" onClick={() => setShowAddLoan(true)}>
                  <Plus size={16} /> Add a debt
                </button>
              </div>
            )}
            {otherCurrencyNote(otherCurrencyItems.filter((x) => x.kind === "debt"))}
          </>
        )}

        {view === "income" && (
          <>
            {incomes.length > 0 ? (
              <div className="ox-grid two">
                <div className="ox-stack">
                  <section className="ox-card ox-hero ox-rise" style={{ "--i": 0 }}>
                    <p className="ox-label">Usual profit a month</p>
                    <p className={"ox-amount-lg" + (usualProfitTotal < 0 ? " ox-neg" : "")}>
                      <Amount value={usualProfitTotal} signed />
                    </p>
                    <p className="fl-card-sub" style={{ marginTop: 6 }}>
                      {fmt(usualIncomeTotal)} in · {fmt(usualExpensesTotal)} out · {activeIncomes.length} source
                      {activeIncomes.length === 1 ? "" : "s"}
                    </p>
                    {incomeCapital > 0 && (
                      <>
                        <div className="ox-bar">
                          <div
                            className="ox-bar-fill pos"
                            style={{ width: Math.min((incomeEarnedBack / incomeCapital) * 100, 100).toFixed(1) + "%" }}
                          />
                        </div>
                        <div className="ox-card-foot">
                          <span>
                            {fmt(incomeEarnedBack)} of {fmt(incomeCapital)} capital earned back
                          </span>
                          <span>{Math.floor((incomeEarnedBack / incomeCapital) * 100)}%</span>
                        </div>
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
                  </section>

                  <section className="ox-card ox-rise" style={{ "--i": 1 }}>
                    <div className="ox-card-head">
                      <div>
                        <h2 className="ox-card-title">Income vs expenses</h2>
                        <p className="ox-card-sub">Recorded months, all sources together</p>
                      </div>
                    </div>
                    {incomeMonths.length > 0 ? (
                      <BarPairs data={incomeMonths} ariaLabel="Income and expenses for each recorded month" />
                    ) : (
                      <div className="ox-empty" style={{ padding: "28px 16px" }}>
                        <div className="ox-empty-icon">
                          <TrendingUp size={24} />
                        </div>
                        <p className="ox-empty-title">No months recorded yet</p>
                        <p>Record a month’s income and costs to see how each source is doing.</p>
                      </div>
                    )}
                  </section>
                </div>

                <div className="ox-stack">
                  <p className="ox-section">Your income sources</p>
                  <div className="ox-list ox-rise" style={{ "--i": 2 }}>
                    {incomeSummaries.map((src) => (
                      <button key={src.id} className="ox-row" onClick={() => openIncome(src.id)}>
                        <span className="ox-row-icon accent">
                          <Briefcase size={18} />
                        </span>
                        <span className="ox-row-main">
                          <span className="ox-row-name">{src.name}</span>
                          <span className="ox-row-sub">
                            {[
                              categoryLabel(src.category, INCOME_CATEGORIES),
                              src.incomeDay ? `on the ${ordinal(src.incomeDay)}` : null,
                              toDebtsByIncome[src.id] ? `${fmt(toDebtsByIncome[src.id].amount)} to debts` : null,
                              !access(src.id).owner ? `from ${(access(src.id).ownerEmail || "").split("@")[0]}` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ") || "Income source"}
                          </span>
                        </span>
                        <span className="ox-row-end">
                          <span className={"ox-row-amount" + (src.stats.usualProfit < 0 ? " ox-neg" : " ox-pos")}>
                            {signedFmt(src.stats.usualProfit)}
                          </span>
                          <span className="ox-row-sub">a month</span>
                        </span>
                        <ChevronRight size={16} className="ox-faint" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="ox-empty ox-rise" style={{ maxWidth: 560, margin: "8px auto 0" }}>
                <div className="ox-empty-icon">
                  <Briefcase size={24} />
                </div>
                <p className="ox-empty-title">No income sources yet</p>
                <p>Add a salary, business, property or rental to track what comes in and what it costs.</p>
                <button className="fl-btn" onClick={() => setShowAddIncome(true)}>
                  <Plus size={16} /> Add income source
                </button>
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
                const src = selectedIncome;
                const st = src.stats;
                const records = incomeRecords[src.id] || {};
                const suggestedMonth = getSuggestedMonth(src, records, asOfKey);
                const acc = access(src.id);
                const toGo =
                  st.monthsToPayback > 0
                    ? ` · about ${monthsLabel(st.monthsToPayback)} to go at the usual profit`
                    : st.monthsToPayback === null
                    ? " · the usual figures don’t make a profit yet"
                    : "";
                const recordMonth = (month) => acc.canEdit && setRecordTarget({ kind: "income", id: src.id, month });
                const recorded = st.rows.filter((r) => r.recorded).slice(-12);

                return (
                  <div className="ox-stack">
                    <section className="ox-card ox-hero ox-rise" style={{ "--i": 0 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                        <div style={{ minWidth: 0 }}>
                          <p className="ox-label">{st.totalProfit < 0 ? "Loss so far" : "Profit so far"}</p>
                          <p className={"ox-amount-xl" + (st.totalProfit < 0 ? " ox-neg" : "")} style={{ fontSize: "clamp(34px, 8vw, 46px)" }}>
                            <Amount value={st.totalProfit} signed countUp />
                          </p>
                          <p className="fl-card-sub" style={{ marginTop: 6 }}>
                            Started {monthKeyShort(src.startMonth || asOfKey)} · usually {fmt(expectedIncomeFor(src, asOfKey))} in,{" "}
                            {fmt(src.usualExpenses)} out
                            {src.incomeDay ? ` · comes in on the ${ordinal(src.incomeDay)}` : ""}
                          </p>
                        </div>
                        {st.capital > 0 && (
                          <Ring value={st.recoveredPct} size={96} tone="pos">
                            <strong>{Math.floor(st.recoveredPct * 100)}%</strong>
                            <span>earned back</span>
                          </Ring>
                        )}
                      </div>

                      {(categoryLabel(src.category, INCOME_CATEGORIES) || !acc.owner || acc.shares.length > 0) && (
                        <div className="fl-chip-row">
                          {categoryLabel(src.category, INCOME_CATEGORIES) && (
                            <span className="fl-chip chip-tag">{categoryLabel(src.category, INCOME_CATEGORIES)}</span>
                          )}
                          <SharedChip a={acc} />
                        </div>
                      )}

                      <div className="fl-detail-grid four">
                        <div>
                          <p className="fl-stat-label">{st.usualProfit < 0 ? "Usual loss" : "Usual profit"}</p>
                          <p className={"fl-stat-value" + (st.usualProfit < 0 ? " ox-neg" : " ox-pos")}>{fmt(Math.abs(st.usualProfit))}</p>
                        </div>
                        <div>
                          <p className="fl-stat-label">Capital put in</p>
                          <p className="fl-stat-value">{fmt(st.capital)}</p>
                        </div>
                        {toDebtsByIncome[src.id] && (
                          <div>
                            <p className="fl-stat-label">To debts a month</p>
                            <p className="fl-stat-value">{fmt(toDebtsByIncome[src.id].amount)}</p>
                          </div>
                        )}
                      </div>

                      {st.capital > 0 && (
                        <p className="fl-card-sub" style={{ marginTop: 14 }}>
                          {st.totalProfit >= st.capital
                            ? `Capital fully earned back${st.totalProfit - st.capital > 0.5 ? ` — ${fmt(st.totalProfit - st.capital)} beyond it` : ""}`
                            : st.totalProfit > 0
                            ? `${fmt(st.totalProfit)} of ${fmt(st.capital)} earned back${toGo}`
                            : `Nothing earned back yet${toGo}`}
                        </p>
                      )}
                      {toDebtsByIncome[src.id] && (
                        <p className="fl-card-sub">
                          {shareLabel(toDebtsByIncome[src.id].share)} goes toward debts. Change it from the budget on the Plan tab.
                        </p>
                      )}
                      {hasIncomeGrowth(src) && (
                        <p className="fl-card-sub">
                          Income rises {incomeGrowthLabel(src.growth)}
                          {(() => {
                            const next = nextIncomeRise(src, asOfKey);
                            return next ? ` · next: ${fmt(next.amount)} from ${monthKeyShort(next.key)}` : "";
                          })()}
                        </p>
                      )}

                      {acc.canEdit && (
                        <div className="fl-form-actions" style={{ marginTop: 18 }}>
                          <button className="fl-btn secondary" onClick={() => setEditingIncomeId(src.id)}>
                            <Pencil size={16} /> Edit
                          </button>
                          <button className="fl-btn" onClick={() => recordMonth(suggestedMonth)}>
                            <Plus size={16} /> Record a month
                          </button>
                        </div>
                      )}
                    </section>

                    {recorded.length > 0 && (
                      <section className="ox-card ox-rise" style={{ "--i": 1 }}>
                        <div className="ox-card-head">
                          <div>
                            <h2 className="ox-card-title">Month by month</h2>
                            <p className="ox-card-sub">Income and expenses, recorded months</p>
                          </div>
                        </div>
                        <BarPairs
                          data={recorded.map((r) => ({ label: monthKeyShort(r.key).split(" ")[0], full: monthKeyShort(r.key), a: r.income, b: r.expenses }))}
                          ariaLabel={`Income and expenses of ${src.name} for each recorded month`}
                        />
                      </section>
                    )}

                    <div>
                      <p className="ox-section">Monthly figures</p>
                      {st.rows.length > 0 ? (
                        <div className="ox-list ox-rise" style={{ "--i": 2 }}>
                          {st.rows
                            .slice()
                            .reverse()
                            .map((row) => (
                              <div className="fl-month-row" key={row.key}>
                                <div className="fl-month-top" onClick={() => recordMonth(row.key)}>
                                  <span className="fl-month-name">{monthKeyShort(row.key)}</span>
                                  <span className={"fl-month-balance" + (row.recorded ? (row.profit < 0 ? " ox-neg" : " ox-pos") : " ox-faint")}>
                                    {row.recorded ? (row.profit < 0 ? "−" : "") + fmt(Math.abs(row.profit)) : "—"}
                                  </span>
                                </div>
                                <div className="fl-month-breakdown" onClick={() => recordMonth(row.key)}>
                                  {row.recorded ? `Income ${fmt(row.income)} · Expenses ${fmt(row.expenses)}` : "Not recorded yet — tap to record"}
                                </div>
                                {row.recorded && acc.canEdit && (
                                  <div style={{ marginTop: 4, marginLeft: -8 }}>
                                    <ConfirmButton
                                      label={"delete " + monthKeyShort(row.key) + " figures"}
                                      onConfirm={() => deleteIncomeMonth(src.id, row.key)}
                                    />
                                  </div>
                                )}
                              </div>
                            ))}
                        </div>
                      ) : (
                        <div className="ox-empty">
                          <p className="ox-empty-title">Nothing to record yet</p>
                          <p>Starts {monthKeyLabel(src.startMonth)}.</p>
                        </div>
                      )}
                    </div>

                    <SharePanel
                      itemName={src.name}
                      kindLabel="income source"
                      a={acc}
                      myEmail={myEmail}
                      people={knownPeople}
                      onAccess={(email, role, name) => changeAccess(src.id, email, role, name)}
                      onInvite={(name, email, role) => inviteToItem(src.id, name, email, role)}
                      onUnshare={(email, leaving) => unshareItem(src.id, email, leaving)}
                    />

                    {acc.owner && (
                      <div className="fl-panel">
                        <p className="fl-panel-title">Delete this income source</p>
                        <p className="fl-card-sub" style={{ marginBottom: 12 }}>
                          It moves to Recently deleted in Account, with its figures. Any share of it in your debt budget is removed.
                        </p>
                        <div className="fl-form-actions">
                          <ConfirmTextButton label="Delete income source" confirmLabel="Yes, delete it" onConfirm={() => deleteIncome(src.id)} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()
            )}
          </>
        )}

        {view === "account" && (
          <>
            <section className="ox-card ox-hero ox-rise" style={{ marginBottom: 8 }}>
              {editingName === "profile" ? (
                <YourNameForm
                  current={fullName}
                  onDone={(saved) => {
                    setEditingName(false);
                    if (saved) showToast("Name saved");
                  }}
                />
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <span className="ox-avatar" style={{ width: 52, height: 52, fontSize: 18, cursor: "default" }} aria-hidden="true">
                    {initials}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="ox-card-title" style={{ fontSize: 17 }}>{fullName || "No name yet"}</p>
                    <p className="ox-card-sub" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {myEmail}
                    </p>
                  </div>
                  <button className="fl-icon-btn" onClick={() => setEditingName("profile")} aria-label="Change your name">
                    <Pencil size={16} />
                  </button>
                </div>
              )}
              {editingName !== "profile" && (
                <div className="fl-form-actions" style={{ marginTop: 16 }}>
                  <button className="fl-btn secondary" onClick={() => setEditingName("profile")}>
                    <Pencil size={16} /> {fullName ? "Change name" : "Add your name"}
                  </button>
                  <button className="fl-btn secondary" onClick={() => supabase.auth.signOut()}>
                    <LogOut size={16} /> Sign out
                  </button>
                </div>
              )}
            </section>

            <p className="fl-section-title">Password</p>
            <ChangePasswordPanel />

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

            <p className="fl-section-title">People</p>
            <p className="fl-card-sub" style={{ margin: "-4px 2px 12px" }}>
              Invite the people you manage money with. Then, on any debt or income source, choose who can see it. Their
              names show on the payment form for what’s shared with them.
            </p>
            {!fullName && !editingName && (
              <div className="ox-banner info">
                <Info size={18} />
                <span>
                  Add your name so payments you record show under it.{" "}
                  <button className="fl-link" onClick={() => setEditingName("people")}>
                    Add your name
                  </button>
                </span>
              </div>
            )}
            <div className="ox-list">
              <div className="ox-row ox-person" style={editingName === "people" ? { display: "block" } : undefined}>
                {editingName === "people" ? (
                  <YourNameForm
                    current={fullName}
                    onDone={(saved) => {
                      setEditingName(false);
                      if (saved) showToast("Name saved");
                    }}
                  />
                ) : (
                  <>
                    <span className="ox-avatar sm" aria-hidden="true">
                      {initials}
                    </span>
                    <span className="ox-row-main">
                      <span className="ox-row-name">
                        {fullName || myName} <span className="ox-faint">· you</span>
                      </span>
                      <span className="ox-row-sub">{myEmail}</span>
                    </span>
                    <button className="fl-icon-btn" onClick={() => setEditingName("people")} aria-label="Change your name">
                      <Pencil size={16} />
                    </button>
                  </>
                )}
              </div>
              {knownPeople.map((person) => {
                const n = ownedSharedWith(person.email).length;
                return (
                  <div className="ox-row ox-person" key={person.email}>
                    <span className={"ox-avatar sm" + (n ? "" : " muted")} aria-hidden="true">
                      {initialsOf(person.name)}
                    </span>
                    <span className="ox-row-main">
                      <span className="ox-row-name">{person.name}</span>
                      <span className="ox-row-sub">
                        {person.email} · {n ? `${n} shared` : "nothing shared yet"}
                        {n ? (person.joined ? " · joined" : " · not joined yet") : ""}
                      </span>
                    </span>
                    <button
                      className="fl-icon-btn"
                      onClick={() =>
                        sendInviteMessage(
                          person.email,
                          `I've invited you to Ledger. Open ${window.location.origin} and sign up with ${person.email} to see what I share with you.`
                        ).then((how) => how === "copied" && showToast("Invite copied — paste it into a message", null, 3000))
                      }
                      aria-label={"Send " + person.name + " an invite"}
                    >
                      <Mail size={16} />
                    </button>
                    <ConfirmButton label={"remove " + person.name} onConfirm={() => removePerson(person)} />
                  </div>
                );
              })}
            </div>
            <div className="fl-panel" style={{ marginTop: 12 }}>
              <p className="fl-panel-title">Invite someone</p>
              <InvitePersonForm onInvite={(name, email) => addPerson(name, email)} />
              <p className="fl-card-sub" style={{ marginTop: 12 }}>
                Removing someone also stops sharing everything with them. Payments they recorded stay in each debt’s
                history.
              </p>
            </div>

            <p className="fl-section-title">Activity</p>
            {activity === null && <p className="fl-card-sub">Loading…</p>}
            {activity && activity.length === 0 && <p className="fl-card-sub">No changes yet.</p>}
            {activity && activity.length > 0 && (
              <div className="ox-list">
                {activity.map((h) => {
                const d = describeChange(h, {
                  myEmail,
                  names: Object.fromEntries([...data.lenders, ...(data.incomes || [])].map((x) => [x.id, x.name])),
                  currencyOf: itemCurrency,
                  nameOf: whoName,
                });
                return (
                  <div className="fl-activity-row" key={h.id}>
                    <span>
                      <strong>{d.who === "You" || d.who === "Someone" ? d.who : whoName(d.who)}</strong> {d.text}
                    </span>
                    <span className="fl-card-sub">{d.when}</span>
                  </div>
                );
                })}
              </div>
            )}

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
          <div className="ox-grid two">
            <div className="ox-stack">
              {strategyLoans.length === 0 && (
                <div className="ox-empty ox-rise">
                  <div className="ox-empty-icon">
                    <Target size={24} />
                  </div>
                  <p className="ox-empty-title">Nothing to plan</p>
                  <p>Every debt is paid off, or none are added yet.</p>
                  <button className="fl-btn" onClick={() => setShowAddLoan(true)}>
                    <Plus size={16} /> Add a debt
                  </button>
                </div>
              )}

              {strategyLoans.length > 0 && strategyResult && !strategyResult.feasible && (
                <>
                  <div className="ox-banner error ox-rise">
                    <AlertCircle size={18} />
                    <span>
                      Your budget of {fmt(effectiveBudget)} doesn’t cover the minimum payments across your debts. You need at
                      least {fmt(strategyResult.minRequired)} a month before a plan can be made.
                    </span>
                  </div>
                  {goalBlock}
                </>
              )}

              {strategyLoans.length > 0 && strategyResult && strategyResult.feasible && (
                <>
                  <section className="ox-card ox-hero ox-rise" style={{ "--i": 0 }}>
                    <div className="ox-card-head" style={{ marginBottom: 0 }}>
                      <p className="ox-label">Debt-free in</p>
                      <span className="fl-chip chip-accent">{strategy.type === "avalanche" ? "Avalanche" : "Snowball"}</span>
                    </div>
                    <p className="ox-amount-xl">{monthsLabel(strategyResult.months)}</p>
                    <p className="fl-card-sub" style={{ marginTop: 6 }}>
                      by {monthKeyLabel(monthKeyAdd(asOfKey, strategyResult.months - 1))} ·{" "}
                      <span className="ox-neg">{fmt(strategyResult.totalInterest)}</span> in interest
                    </p>
                    {statusQuoResult && statusQuoResult.stalled.length === 0 && (
                      <>
                        <div className="ox-compare">
                          <p className="ox-label" style={{ marginBottom: -4 }}>
                            Time to debt-free
                          </p>
                          {[
                            ["Your plan", strategyResult.months, true],
                            ["Current pace", statusQuoResult.months, false],
                          ].map(([label, m, mine]) => (
                            <div className="ox-compare-row" key={label}>
                              <span>{label}</span>
                              <div className="ox-compare-track">
                                <div
                                  className={"ox-compare-fill" + (mine ? " accent" : "")}
                                  style={{ width: (m / Math.max(strategyResult.months, statusQuoResult.months, 1)) * 100 + "%" }}
                                />
                              </div>
                              <span className="ox-compare-val">{monthsLabel(m)}</span>
                            </div>
                          ))}
                          <p className="ox-label" style={{ margin: "8px 0 -4px" }}>
                            Interest paid
                          </p>
                          {[
                            ["Your plan", strategyResult.totalInterest, true],
                            ["Current pace", statusQuoResult.totalInterest, false],
                          ].map(([label, v, mine]) => (
                            <div className="ox-compare-row" key={label}>
                              <span>{label}</span>
                              <div className="ox-compare-track">
                                <div
                                  className={"ox-compare-fill" + (mine ? " accent" : "")}
                                  style={{
                                    width:
                                      (v / Math.max(strategyResult.totalInterest, statusQuoResult.totalInterest, 1)) * 100 + "%",
                                  }}
                                />
                              </div>
                              <span className="ox-compare-val">{fmt(v)}</span>
                            </div>
                          ))}
                        </div>
                        {statusQuoResult.totalInterest - strategyResult.totalInterest > 1 && (
                          <p className="fl-card-sub" style={{ marginTop: 14 }}>
                            This plan saves about{" "}
                            <strong className="ox-pos">{fmt(statusQuoResult.totalInterest - strategyResult.totalInterest)}</strong> in interest
                            {statusQuoResult.months > strategyResult.months
                              ? ` and gets you debt-free ${statusQuoResult.months - strategyResult.months} months sooner`
                              : ""}
                            .
                          </p>
                        )}
                      </>
                    )}
                    {statusQuoResult && statusQuoResult.stalled.length > 0 && (
                      <p className="fl-card-sub" style={{ marginTop: 14 }}>
                        At least one debt isn’t being paid enough to cover its own interest, so at today’s pace it would never
                        be paid off. This plan is the way forward.
                      </p>
                    )}
                  </section>

                  {payoffPoints && (
                    <section className="ox-card ox-rise" style={{ "--i": 1 }}>
                      <div className="ox-card-head">
                        <div>
                          <h2 className="ox-card-title">Path to debt-free</h2>
                          <p className="ox-card-sub">Total owed each month on this plan</p>
                        </div>
                      </div>
                      <AreaChart
                        points={payoffPoints}
                        endMarker
                        height={220}
                        tipValue={(v) => (v < 0.5 ? "Debt-free" : fmt(v) + " left")}
                        ariaLabel={`Projected total owed falls to zero by ${byMonth(strategyResult.months)}`}
                      />
                    </section>
                  )}

                  <div className="ox-rise" style={{ "--i": 2 }}>{goalBlock}</div>

                  <div>
                    <p className="ox-section">
                      Pay this for {monthKeyLabel(asOfKey)}
                      <span className="ox-faint" style={{ fontWeight: 500 }}>
                        {fmt(Object.values(strategyResult.firstMonthPlan).reduce((sum, v) => sum + v, 0))}
                      </span>
                    </p>
                    <div className="ox-list ox-rise" style={{ "--i": 3 }}>
                      {strategyLoans
                        .slice()
                        .sort((x, y) => (strategyResult.firstMonthPlan[y.id] || 0) - (strategyResult.firstMonthPlan[x.id] || 0))
                        .map((l) => (
                          <button key={l.id} className="ox-row" onClick={() => openLoan(l.id)}>
                            <span className="ox-row-main">
                              <span className="ox-row-name">{l.name}</span>
                              <span className="ox-row-sub">
                                {l.schedule ? "repayment plan" : `${(l.rate * 100).toFixed(2)}% a year`} · {fmt(l.balance)} owed
                                {l.protectFromGrowth ? " · protected" : ""}
                              </span>
                            </span>
                            <span className="ox-row-end">
                              <span className="ox-row-amount">{fmt(strategyResult.firstMonthPlan[l.id] || 0)}</span>
                            </span>
                          </button>
                        ))}
                    </div>
                  </div>

                  <div>
                    <p className="ox-section">Payoff order</p>
                    <div className="ox-card ox-rise" style={{ "--i": 4 }}>
                      <div className="ox-timeline">
                        {strategyLoans
                          .slice()
                          .sort((x, y) => (strategyResult.payoffMonth[x.id] || 9999) - (strategyResult.payoffMonth[y.id] || 9999))
                          .map((l) => (
                            <div className="ox-tl-item" key={l.id}>
                              <span>{l.name}</span>
                              <span className="ox-tl-when">
                                {strategyResult.payoffMonth[l.id]
                                  ? `${byMonth(strategyResult.payoffMonth[l.id])} · ${monthsLabel(strategyResult.payoffMonth[l.id])}`
                                  : "not within 50 years"}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="ox-stack">
              <section className="ox-card ox-rise" style={{ "--i": 1 }}>
                <div className="ox-card-head" style={{ marginBottom: 0 }}>
                  <p className="ox-label">Monthly budget for debts</p>
                  <button className="fl-icon-btn" onClick={() => setShowBudgetEditor(true)} aria-label="Edit budget">
                    <Pencil size={16} />
                  </button>
                </div>
                <p className="ox-amount-lg">
                  <Amount value={effectiveBudget} />
                </p>
                {nextBudgetRise && (
                  <p className="fl-card-sub" style={{ marginTop: 6 }}>
                    Rises to {fmt(nextBudgetRise.amount)} from {monthKeyShort(nextBudgetRise.key)} as income grows. The plan counts
                    every future rise.
                  </p>
                )}
                {(budgetParts.length > 1 || budgetParts.some((pt) => pt.kind === "income")) && (
                  <div className="fl-budget-breakdown">
                    {budgetParts.map((pt) => (
                      <div className="fl-budget-line" key={pt.id}>
                        <span>
                          {pt.kind === "income"
                            ? `${incomesById[pt.incomeId] ? incomesById[pt.incomeId].name : "Removed income source"} · ${shareLabel(pt.share)}${
                                incomesById[pt.incomeId] && hasIncomeGrowth(incomesById[pt.incomeId])
                                  ? ` · rises ${incomeGrowthLabel(incomesById[pt.incomeId].growth)}`
                                  : ""
                              }`
                            : pt.label}
                        </span>
                        <span className="fl-mono">{fmt(budgetPartAmount(pt, incomesById, asOfKey))}</span>
                      </div>
                    ))}
                  </div>
                )}
                {activeIncomes.length > 0 && (
                  <p className="fl-card-sub" style={{ marginTop: 12 }}>
                    {usualProfitTotal < 0
                      ? `Your income sources usually run at a ${fmt(-usualProfitTotal)} loss a month.`
                      : incomeToDebts > 0.5
                      ? `Your income sources usually make ${fmt(usualProfitTotal)} profit a month; ${fmt(incomeToDebts)} of it goes toward debts.`
                      : `Your income sources usually make ${fmt(usualProfitTotal)} profit a month. None of it is in this budget yet: edit the budget to add a share.`}
                  </p>
                )}
                <div className="fl-form-actions" style={{ marginTop: 16 }}>
                  <button className="fl-btn secondary" onClick={() => setShowBudgetEditor(true)}>
                    <Pencil size={16} /> Change budget
                  </button>
                </div>
              </section>

              <section className="ox-card ox-rise" style={{ "--i": 2 }}>
                <p className="ox-label" style={{ marginBottom: 12 }}>
                  Which debt gets the extra
                </p>
                <div className="ox-seg" role="radiogroup" aria-label="Strategy">
                  <span className="ox-seg-pill" style={{ transform: strategy.type === "snowball" ? "translateX(100%)" : "none" }} />
                  <button
                    role="radio"
                    aria-checked={strategy.type === "avalanche"}
                    className={strategy.type === "avalanche" ? "on" : ""}
                    onClick={() => strategy.type !== "avalanche" && updateStrategy({ type: "avalanche" })}
                  >
                    Avalanche
                  </button>
                  <button
                    role="radio"
                    aria-checked={strategy.type === "snowball"}
                    className={strategy.type === "snowball" ? "on" : ""}
                    onClick={() => strategy.type !== "snowball" && updateStrategy({ type: "snowball" })}
                  >
                    Snowball
                  </button>
                </div>
                <p className="fl-card-sub" style={{ marginTop: 12 }}>
                  {strategy.type === "avalanche"
                    ? "Highest interest first: saves the most money overall."
                    : "Smallest balance first: clears individual debts fastest."}
                </p>
              </section>

              <p className="fl-card-sub" style={{ margin: "4px 4px 0", lineHeight: 1.6 }}>
                Set each debt’s minimum monthly payment from its edit form: leave it at 0 for flexible, informal ones, or turn on
                “protect from growing” for a debt that must never pile up interest while it waits its turn. A debt on a repayment
                plan only ever gets what’s due that month, since paying it early doesn’t reduce its total. This isn’t financial
                advice; check things like tax benefits or prepayment penalties before making big changes.
              </p>
            </div>
          </div>
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
                const summary = lenderSummaries.find((x) => x.id === selectedLoan.id);
                const isOverdue = summary.isOverdue;
                const suggestedMonth = getSuggestedMonth(selectedLoan, entries, asOfKey);
                const acc = access(selectedLoan.id);
                const plan = selectedLoan.repaymentPlan;
                const planCharge = plan ? (selectedLoan.totalAmount || 0) - plan.received : 0;
                const planRate = plan ? planYearlyRate(plan.received, plan.amounts) : null;
                const upcoming = plan
                  ? plan.amounts
                      .map((amt, i) => ({ key: monthKeyAdd(selectedLoan.termStart || selectedLoan.startMonth, i), amt }))
                      .filter((m) => m.key > asOfKey)
                  : [];
                const total = Number(selectedLoan.totalAmount) || 0;
                const paidPct = total > 0 ? Math.max(Math.min((total - finalBalance) / total, 1), 0) : 0;
                const recordMonth = (month) => acc.canEdit && setRecordTarget({ kind: "debt", id: selectedLoan.id, month });

                return (
                  <div className="ox-stack">
                    <section className="ox-card ox-hero ox-rise" style={{ "--i": 0 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                        <div style={{ minWidth: 0 }}>
                          <p className="ox-label">Still owed</p>
                          <p className="ox-amount-xl" style={{ fontSize: "clamp(34px, 8vw, 46px)" }}>
                            <Amount value={finalBalance} countUp />
                          </p>
                          <p className="fl-card-sub" style={{ marginTop: 6 }}>
                            {plan
                              ? `Repayment plan · received ${fmt(plan.received)}`
                              : selectedLoan.type === "fixed"
                              ? "No interest"
                              : `${((selectedLoan.annualRate || 0) * 100).toFixed(2)}% a year`}
                            {selectedLoan.dueDay ? ` · due on the ${ordinal(selectedLoan.dueDay)}` : ""}
                          </p>
                        </div>
                        <Ring value={paidPct} size={96}>
                          <strong>{Math.round(paidPct * 100)}%</strong>
                          <span>repaid</span>
                        </Ring>
                      </div>

                      {(categoryLabel(selectedLoan.category) ||
                        selectedLoan.protectFromGrowth ||
                        !acc.owner ||
                        acc.shares.length > 0 ||
                        isOverdue ||
                        summary.shortThisMonth > 0.5 ||
                        summary.behindPlan > 0.5 ||
                        summary.isPaidThisMonth) && (
                        <div className="fl-chip-row">
                          {categoryLabel(selectedLoan.category) && (
                            <span className="fl-chip chip-tag">{categoryLabel(selectedLoan.category)}</span>
                          )}
                          <SharedChip a={acc} />
                          {selectedLoan.protectFromGrowth && <span className="fl-chip chip-blue">protected</span>}
                          {summary.isPaidThisMonth && (
                            <span className="fl-chip chip-green">
                              <Check size={12} /> Paid {monthKeyShort(asOfKey)}
                            </span>
                          )}
                          {isOverdue && (
                            <span className="fl-overdue">
                              <AlertCircle size={12} /> Overdue for {monthKeyLabel(asOfKey)}
                            </span>
                          )}
                          {summary.shortThisMonth > 0.5 && (
                            <span className="fl-overdue">
                              <AlertCircle size={12} /> {fmt(summary.shortThisMonth)} short for {monthKeyShort(asOfKey)}
                            </span>
                          )}
                          {summary.behindPlan > 0.5 && (
                            <span className="fl-overdue">
                              <AlertCircle size={12} /> {fmt(summary.behindPlan)} behind plan
                            </span>
                          )}
                        </div>
                      )}

                      <div className="fl-detail-grid four">
                        <div>
                          <p className="fl-stat-label">{plan ? "Total to repay" : "Borrowed"}</p>
                          <p className="fl-stat-value">{fmt(total)}</p>
                        </div>
                        <div>
                          <p className="fl-stat-label">Paid so far</p>
                          <p className="fl-stat-value ox-pos">{fmt(total - finalBalance)}</p>
                        </div>
                        {selectedLoan.type !== "fixed" && (
                          <div>
                            <p className="fl-stat-label">Next month’s interest</p>
                            <p className="fl-stat-value">{fmt(nextInterest)}</p>
                          </div>
                        )}
                        {plan && (
                          <div>
                            <p className="fl-stat-label">Due for {monthKeyShort(asOfKey)}</p>
                            <p className="fl-stat-value">{fmt(summary.dueThisMonth)}</p>
                          </div>
                        )}
                        {!plan && Number(selectedLoan.minPayment) > 0 && (
                          <div>
                            <p className="fl-stat-label">{selectedLoan.type === "fixed" ? "Monthly payment" : "Minimum payment"}</p>
                            <p className="fl-stat-value">{fmt(selectedLoan.minPayment)}</p>
                          </div>
                        )}
                      </div>

                      {plan && planCharge > 0.5 && (
                        <p className="fl-card-sub" style={{ marginTop: 14 }}>
                          Lender’s charge {fmt(planCharge)}
                          {planRate != null ? ` — costs about the same as ${(planRate * 100).toFixed(1)}% a year` : ""}
                        </p>
                      )}
                      {selectedLoan.termMonths ? (
                        <p className="fl-card-sub" style={{ marginTop: plan && planCharge > 0.5 ? 2 : 14 }}>
                          {termSummary(selectedLoan, asOfKey)}
                        </p>
                      ) : null}
                      {selectedLoan.protectFromGrowth && (
                        <p className="fl-card-sub">Protected from growing: the plan always covers at least its interest.</p>
                      )}

                      {acc.canEdit && (
                        <div className="fl-form-actions" style={{ marginTop: 18 }}>
                          <button className="fl-btn secondary" onClick={() => setEditingLoanId(selectedLoan.id)}>
                            <Pencil size={16} /> Edit
                          </button>
                          <button className="fl-btn" onClick={() => recordMonth(suggestedMonth)}>
                            <Plus size={16} /> Record a payment
                          </button>
                        </div>
                      )}

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
                    </section>

                    {rows.length >= 2 && (
                      <section className="ox-card ox-rise" style={{ "--i": 1 }}>
                        <div className="ox-card-head">
                          <div>
                            <h2 className="ox-card-title">Balance over time</h2>
                            <p className="ox-card-sub">Since {monthKeyShort(selectedLoan.startMonth || asOfKey)}, after each month’s payments</p>
                          </div>
                        </div>
                        <AreaChart
                          points={[
                            { label: "Start", value: total },
                            ...rows.map((r) => ({ label: monthKeyShort(r.key), value: r.remaining })),
                          ]}
                          height={180}
                          tipValue={(v) => fmt(v) + " owed"}
                          ariaLabel={`Balance of ${selectedLoan.name} month by month`}
                        />
                      </section>
                    )}

                    <div>
                      <p className="ox-section">Month by month</p>
                      {rows.length > 0 ? (
                        <div className="ox-list ox-rise" style={{ "--i": 2 }}>
                          {rows
                            .slice()
                            .reverse()
                            .map((row) => (
                              <div className="fl-month-row" key={row.key}>
                                <div className="fl-month-top" onClick={() => recordMonth(row.key)}>
                                  <span className="fl-month-name">{monthKeyShort(row.key)}</span>
                                  <span className="fl-month-balance">{fmt(row.remaining)}</span>
                                </div>
                                <div className="fl-month-breakdown" onClick={() => recordMonth(row.key)}>
                                  {row.recorded
                                    ? Object.entries(row.amounts)
                                        .filter(([, v]) => (Number(v) || 0) !== 0)
                                        .map(([p, v]) => `${p} ${fmt(v)}`)
                                        .join(" · ") +
                                      (selectedLoan.type !== "fixed" ? ` — interest ${fmt(row.interest)}` : "")
                                    : selectedLoan.type !== "fixed"
                                    ? `No payment recorded — interest ${fmt(row.interest)} added`
                                    : "No payment recorded"}
                                  {plan && planDueFor(selectedLoan, row.key) > 0 && ` — ${fmt(planDueFor(selectedLoan, row.key))} due`}
                                </div>
                                {plan && row.recorded && row.totalPaid < planDueFor(selectedLoan, row.key) - 0.5 && (
                                  <p className="fl-overdue" style={{ marginTop: 6 }}>
                                    <AlertCircle size={12} /> {fmt(planDueFor(selectedLoan, row.key) - row.totalPaid)} short
                                  </p>
                                )}
                                {row.recorded && acc.canEdit && (
                                  <div style={{ marginTop: 4, marginLeft: -8 }}>
                                    <ConfirmButton
                                      label={"delete " + monthKeyShort(row.key) + " entry"}
                                      onConfirm={() => deleteMonthEntry(selectedLoan.id, row.key)}
                                    />
                                  </div>
                                )}
                              </div>
                            ))}
                        </div>
                      ) : (
                        <div className="ox-empty">
                          <p className="ox-empty-title">No months yet</p>
                          <p>Tracking starts {monthKeyLabel(selectedLoan.startMonth || asOfKey)}.</p>
                        </div>
                      )}
                    </div>

                    <SharePanel
                      itemName={selectedLoan.name}
                      kindLabel="debt"
                      a={acc}
                      myEmail={myEmail}
                      people={knownPeople}
                      onAccess={(email, role, name) => changeAccess(selectedLoan.id, email, role, name)}
                      onInvite={(name, email, role) => inviteToItem(selectedLoan.id, name, email, role)}
                      onUnshare={(email, leaving) => unshareItem(selectedLoan.id, email, leaving)}
                    />

                    {acc.owner && (
                      <div className="fl-panel">
                        <p className="fl-panel-title">Delete this debt</p>
                        <p className="fl-card-sub" style={{ marginBottom: 12 }}>
                          It moves to Recently deleted in Account, with its payments, so you can bring it back.
                        </p>
                        <div className="fl-form-actions">
                          <ConfirmTextButton label="Delete debt" confirmLabel="Yes, delete it" onConfirm={() => deleteLoan(selectedLoan.id)} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()
            )}
          </>
        )}
            </div>
          </div>
        </div>
      </div>

      {toast && (
        <div className="fl-toast" role="status" key={toast.id}>
          <span className={"ox-toast-icon" + (toast.tone === "error" ? " error" : toast.tone === "info" ? " info" : "")}>
            {toast.tone === "error" ? (
              <AlertCircle size={16} />
            ) : toast.tone === "info" ? (
              <Info size={16} />
            ) : (
              <svg className="ox-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            )}
          </span>
          <span>{toast.msg}</span>
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
                  people={namesFor(t.id, t.month)}
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
            people={[myName, ...knownPeople.map((x) => x.name)]}
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

      {addMenu && (
        <Sheet
          title={addMenu === "debt" ? "Record a payment" : addMenu === "income" ? "Record income" : "Add"}
          onClose={() => setAddMenu(null)}
        >
          {addMenu === "menu" && (
            <div className="ox-add-grid">
              <button className="ox-add-option" style={{ "--i": 0 }} onClick={() => setAddMenu("debt")}>
                <span className="ox-row-icon accent">
                  <Wallet size={20} />
                </span>
                <strong>Record a payment</strong>
                <span>What you paid toward a debt</span>
              </button>
              <button className="ox-add-option" style={{ "--i": 1 }} onClick={() => setAddMenu("income")}>
                <span className="ox-row-icon accent">
                  <TrendingUp size={20} />
                </span>
                <strong>Record income</strong>
                <span>A month’s income and costs</span>
              </button>
              <button
                className="ox-add-option"
                style={{ "--i": 2 }}
                onClick={() => {
                  setAddMenu(null);
                  setShowAddLoan(true);
                }}
              >
                <span className="ox-row-icon">
                  <Landmark size={20} />
                </span>
                <strong>Add a debt</strong>
                <span>A loan, card or money you owe</span>
              </button>
              <button
                className="ox-add-option"
                style={{ "--i": 3 }}
                onClick={() => {
                  setAddMenu(null);
                  setShowAddIncome(true);
                }}
              >
                <span className="ox-row-icon">
                  <Briefcase size={20} />
                </span>
                <strong>Add income source</strong>
                <span>A salary, business or rental</span>
              </button>
            </div>
          )}
          {addMenu === "debt" &&
            (() => {
              const choices = lenderSummaries.filter((l) => access(l.id).canEdit && (l.remaining > 0.5 || (payments[l.id] || {})[asOfKey]));
              if (choices.length === 0) {
                return (
                  <div className="ox-empty">
                    <div className="ox-empty-icon">
                      <Landmark size={24} />
                    </div>
                    <p className="ox-empty-title">No debts to record yet</p>
                    <p>Add a debt first, then record what you pay each month.</p>
                    <button
                      className="fl-btn"
                      onClick={() => {
                        setAddMenu(null);
                        setShowAddLoan(true);
                      }}
                    >
                      <Plus size={16} /> Add a debt
                    </button>
                  </div>
                );
              }
              return (
                <div className="ox-list">
                  {choices.map((l) => {
                    const pay = payableThisMonth(l);
                    return (
                      <button
                        key={l.id}
                        className="ox-row"
                        onClick={() => {
                          setAddMenu(null);
                          openRecord("debt", l.id);
                        }}
                      >
                        <span className="ox-row-main">
                          <span className="ox-row-name">{l.name}</span>
                          <span className="ox-row-sub">
                            {l.isPaidThisMonth
                              ? `Paid for ${monthKeyShort(asOfKey)}`
                              : l.isOverdue
                              ? "Overdue"
                              : l.dueDay
                              ? `Due on the ${ordinal(l.dueDay)}`
                              : "No due day"}
                          </span>
                        </span>
                        <span className="ox-row-end">
                          <span className="ox-row-amount">{pay && !pay.fromPlan ? fmt(pay.amount) : fmt(l.remaining)}</span>
                          <span className="ox-row-sub">{pay && !pay.fromPlan ? "due" : "owed"}</span>
                        </span>
                        <ChevronRight size={16} className="ox-faint" />
                      </button>
                    );
                  })}
                </div>
              );
            })()}
          {addMenu === "income" &&
            (() => {
              const choices = activeIncomes.filter((src) => access(src.id).canEdit);
              if (choices.length === 0) {
                return (
                  <div className="ox-empty">
                    <div className="ox-empty-icon">
                      <Briefcase size={24} />
                    </div>
                    <p className="ox-empty-title">No income sources yet</p>
                    <p>Add a salary, business or rental to record what comes in.</p>
                    <button
                      className="fl-btn"
                      onClick={() => {
                        setAddMenu(null);
                        setShowAddIncome(true);
                      }}
                    >
                      <Plus size={16} /> Add income source
                    </button>
                  </div>
                );
              }
              return (
                <div className="ox-list">
                  {choices.map((src) => {
                    const rec = (incomeRecords[src.id] || {})[asOfKey];
                    return (
                      <button
                        key={src.id}
                        className="ox-row"
                        onClick={() => {
                          setAddMenu(null);
                          openRecord("income", src.id);
                        }}
                      >
                        <span className="ox-row-main">
                          <span className="ox-row-name">{src.name}</span>
                          <span className="ox-row-sub">{rec ? `Recorded for ${monthKeyShort(asOfKey)}` : "Not recorded this month"}</span>
                        </span>
                        <span className="ox-row-end">
                          <span className="ox-row-amount">{fmt(rec ? Number(rec.income) || 0 : expectedIncomeFor(src, asOfKey))}</span>
                          <span className="ox-row-sub">{rec ? "came in" : "expected"}</span>
                        </span>
                        <ChevronRight size={16} className="ox-faint" />
                      </button>
                    );
                  })}
                </div>
              );
            })()}
        </Sheet>
      )}

      <nav className="fl-bottomnav" aria-label="Main">
        <div className="ox-nav" ref={navRef}>
          {navPill && <span className="ox-nav-pill" style={{ width: navPill.w, transform: `translateX(${navPill.x}px)` }} />}
          <button
            data-tab="dashboard"
            className={"fl-navbtn" + (tab === "dashboard" ? " active" : "")}
            onClick={() => go("dashboard")}
            aria-current={tab === "dashboard" ? "page" : undefined}
          >
            <LayoutDashboard size={21} />
            Overview
          </button>
          <button
            data-tab="loans"
            className={"fl-navbtn" + (tab === "loans" ? " active" : "")}
            onClick={() => go("loans")}
            aria-current={tab === "loans" ? "page" : undefined}
          >
            <Landmark size={21} />
            Debts
          </button>
          <button className="ox-nav-add" onClick={() => setAddMenu("menu")} aria-label="Add">
            <Plus size={24} />
          </button>
          <button
            data-tab="income"
            className={"fl-navbtn" + (tab === "income" ? " active" : "")}
            onClick={() => go("income")}
            aria-current={tab === "income" ? "page" : undefined}
          >
            <TrendingUp size={21} />
            Income
          </button>
          <button
            data-tab="strategy"
            className={"fl-navbtn" + (tab === "strategy" ? " active" : "")}
            onClick={() => go("strategy")}
            aria-current={tab === "strategy" ? "page" : undefined}
          >
            <Target size={21} />
            Plan
          </button>
        </div>
      </nav>
    </div>
  );
}
