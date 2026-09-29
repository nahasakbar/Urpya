# Family Ledger

A React + Vite app for tracking family loans/debts between a few people, with Supabase for realtime shared storage (the whole app's data lives in one JSON blob in a single Supabase table row). Almost everything lives in one file: `src/App.jsx` — pure calculation functions at the top, all CSS in a `const styles` template string, then the component and its JSX.

## Design system

The UI is a "leather passbook" theme (leather, paper, and ribbon-bookmark textures, brass accents), matched to an approved design mockup. In `src/App.jsx`:

- `const styles` (~line 331) holds all CSS, including SVG grain-texture filter defs referenced via `url(#grainLeather)` etc. — filter regions must stay tightly clipped or the texture bleeds past its element.
- `.fl-shell` is the full-screen app container, pinned with `position: fixed; top: 0; bottom: 0`. In standalone ("Add to Home Screen") mode it switches to `position: relative; height: 100lvh`, and `.fl-bottomnav` switches from fixed to absolute (via `@media (display-mode: standalone)`, plus an `html.fl-standalone` class set from `navigator.standalone` in `index.html`). This works around an iOS 26+ bug where, in standalone mode, `bottom: 0`, `100%`, `100dvh` and `100svh` all come up short by the status-bar height, leaving a strip below the tab bar. Only `100lvh` measures the full screen. Sizing the fixed shell to `100lvh` alone was tried and failed: iOS still only drew it down to the false edge, cutting off the tab-bar labels. The shell has to be in normal flow so the document itself is full height. Page-level bounce (`overscroll-behavior: none` on html/body) is off in standalone so dragging the header or tab bar doesn't rubber-band the whole app. The page background behind the app is leather brown, so if the strip ever comes back it will look brown, not white.
- `.fl-topbar` / `.fl-bottomnav` are the leather header and tab bar, padded with `env(safe-area-inset-top/bottom)` for the notch and home-indicator.
- Status chips (`.fl-chip` + `.chip-green` / `.chip-grey` / `.chip-blue`, and `.fl-overdue` for red) follow a fixed color convention: paid = green, missed/overdue = red, due soon = grey, protected = blue. The loan-type tag (Mortgage, Car, …) uses brass (`.chip-tag`) so it never reads as a status.

## Loan fields

On screen, entries are called **debts** (the tab is "Debts", "Add a debt or creditor", "Total amount borrowed"), since they're no longer only loans. The code still names them loans/lenders internally. Keep new on-screen wording to "debt".

- `category` is the optional loan-type tag (ids in `CATEGORIES` in `src/App.jsx`). It's a label only and never enters any calculation. Loans saved before it existed simply have no tag, and `migrateData` deliberately doesn't backfill it, so no silent write hits the live data.
- `type` controls interest: `"interest"` or `"fixed"` (no interest). The "Charges interest" switch in `LenderForm` is this field (on = `"interest"`), so don't confuse it with `category`.
- `termMonths` / `termStart` are the optional payment term (whole months, plus the month it began; `termStart` null means it began at `startMonth`). Display only: the debt's page shows "2-year term · ends … · N months to go". It doesn't feed into balances or the Strategy plan.
- The form's on/off controls (repayment plan, interest, protect from growing, payment term) all use the shared `Switch` component.
- `repaymentPlan: { received, amounts }` covers lenders who give a total to repay plus monthly amounts instead of an interest rate. Such a debt is saved as `type: "fixed"` with `totalAmount` = total to repay, `termMonths` = `amounts.length`, and `amounts[i]` due in month i from `termStart || startMonth`. So `computeSchedule` needs no changes: balance = total − payments. In the form, the top "Total amount borrowed" box always means what was borrowed (on a plan, it's saved as `received`). The plan section asks separately for "Total to repay", which is saved as `totalAmount`. The form spreads amounts evenly from the first payment (`spreadPlanAmounts`), lets any month be hand-adjusted, and refuses to save unless they add up to the total. The debt page and dashboard show what's due, "short" and "behind plan", plus an equivalent yearly rate (`planYearlyRate`) that is display only.
- In the Strategy simulations, a loan with a `schedule` (built from the plan) is paid exactly what's due each month and never gets extra money, because paying early doesn't cut the total. It counts at its largest upcoming payment in the budget check. Loans without a schedule behave exactly as before; this was verified with a randomized before/after comparison.

## Testing without touching live data

`.env.local` points at the live family database, so never click Save in the normal dev server. To test the form end-to-end, run a small local stand-in for the Supabase `ledger` table with made-up loans (GET returns `[{payload}]`, POST upsert stores it and returns 201, plus CORS). Then start a second Vite on another port with `VITE_SUPABASE_URL=http://127.0.0.1:<port> VITE_SUPABASE_ANON_KEY=test`, since shell env vars override `.env.local`. Confirm no requests go to supabase.co before saving anything.

## If the bottom strip returns

The normal-flow `100lvh` fix for the bottom strip (above) was confirmed working on the real phone in Home Screen mode on 2026-09-29, and Safari tab mode was unaffected. If a gap ever comes back at a screen edge there, first check that `index.html`'s `<meta name="viewport">` still includes `viewport-fit=cover`, which the page needs to draw under the safe areas at all.

## Working with this project

- The project owner isn't a developer — explain changes in plain language, not jargon.
- This holds real, live family loan balances. Treat any change to the calculation logic (interest, schedules, payoff strategy simulations) as high-stakes: verify it before calling it done.
- Changes get tested on a real phone, both as a normal Safari tab and as an "Add to Home Screen" app — these can behave differently (see the fixed-positioning note above), so flag anything that might diverge between the two.
