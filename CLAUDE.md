# Family Ledger

A React + Vite app for tracking family loans/debts between a few people, with Supabase for realtime shared storage (the whole app's data lives in one JSON blob in a single Supabase table row). Almost everything lives in one file: `src/App.jsx` — pure calculation functions at the top, all CSS in a `const styles` template string, then the component and its JSX.

## Design system

The UI is a "leather passbook" theme (leather, paper, and ribbon-bookmark textures, brass accents), matched to an approved design mockup. In `src/App.jsx`:

- `const styles` (~line 331) holds all CSS, including SVG grain-texture filter defs referenced via `url(#grainLeather)` etc. — filter regions must stay tightly clipped or the texture bleeds past its element.
- `.fl-shell` is the full-screen app container. It's pinned with `position: fixed; top: 0; bottom: 0` rather than `height: 100vh/100dvh`, specifically to avoid an iOS bug where `dvh` under-measures the screen in standalone ("Add to Home Screen") mode.
- `.fl-topbar` / `.fl-bottomnav` are the leather header and tab bar, padded with `env(safe-area-inset-top/bottom)` for the notch and home-indicator.
- Status chips (`.fl-chip` + `.chip-green` / `.chip-grey` / `.chip-blue`, and `.fl-overdue` for red) follow a fixed color convention: paid = green, missed/overdue = red, due soon = grey, protected = blue.

## Open item

If a white gap ever reappears at a screen edge in iOS standalone mode, check whether `index.html`'s `<meta name="viewport">` includes `viewport-fit=cover` — required for the page to draw under the safe areas at all.

## Working with this project

- The project owner isn't a developer — explain changes in plain language, not jargon.
- This holds real, live family loan balances. Treat any change to the calculation logic (interest, schedules, payoff strategy simulations) as high-stakes: verify it before calling it done.
- Changes get tested on a real phone, both as a normal Safari tab and as an "Add to Home Screen" app — these can behave differently (see the fixed-positioning note above), so flag anything that might diverge between the two.
