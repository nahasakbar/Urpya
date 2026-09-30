// All of the app's CSS: the Onyx design system (dark, calm, precise), injected
// by <style> tags. Tokens first, then layout, components, charts and motion.
// See CLAUDE.md → Design system for the rules behind it.
export const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Geist:wght@300..700&family=Geist+Mono:wght@400..600&display=swap');

  /* ---------------------------------------------------------------- tokens */
  :root {
    /* Surfaces: near-black ground, each layer a step lighter. */
    --bg: #0a0c10;
    --surface-1: #12151b;
    --surface-2: #181c23;
    --surface-3: #1f242c;
    --surface-hover: #1c2129;
    --line: #232831;
    --line-strong: #2e343e;
    --line-control: #68717f;

    /* Text */
    --text: #f2f4f7;
    --text-2: #a9b1bd;
    --text-3: #858d9a;

    /* Meaning */
    --accent: #e3bb6f;
    --accent-strong: #f0cc88;
    --on-accent: #1a1407;
    --accent-soft: rgba(227,187,111,0.12);
    --positive: #4cc592;
    --positive-soft: rgba(76,197,146,0.13);
    --negative: #f2727a;
    --negative-soft: rgba(242,114,122,0.13);
    --info: #86a9f2;
    --info-soft: rgba(134,169,242,0.13);
    --neutral-soft: rgba(255,255,255,0.07);
    --bar-out: #6b7482;

    /* Type */
    --font: "Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    --font-mono: "Geist Mono", ui-monospace, "SF Mono", Menlo, monospace;

    /* Spacing (4px base) */
    --s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 16px; --s-5: 20px;
    --s-6: 24px; --s-8: 32px; --s-10: 40px; --s-12: 48px;

    /* Radius */
    --r-xs: 6px; --r-sm: 10px; --r-md: 14px; --r-lg: 20px; --r-xl: 28px; --r-pill: 999px;

    /* Elevation */
    --shadow-1: 0 1px 0 rgba(255,255,255,0.035) inset, 0 1px 2px rgba(0,0,0,0.45);
    --shadow-2: 0 1px 0 rgba(255,255,255,0.05) inset, 0 12px 32px -12px rgba(0,0,0,0.7);
    --shadow-3: 0 -1px 0 rgba(255,255,255,0.06) inset, 0 -24px 64px -16px rgba(0,0,0,0.75);
    --glow-accent: 0 8px 28px -10px rgba(227,187,111,0.55);

    /* Motion */
    --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
    --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
    --dur-fast: 140ms;
    --dur: 220ms;
    --dur-slow: 380ms;
    --dur-chart: 700ms;

    color-scheme: dark;
  }

  html, body {
    margin: 0;
    padding: 0;
    background: var(--bg);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  /* ---------------------------------------------------------------- frame */
  .fl-shell {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background:
      radial-gradient(1200px 520px at 12% -12%, rgba(227,187,111,0.06), transparent 60%),
      radial-gradient(900px 480px at 110% 0%, rgba(134,169,242,0.05), transparent 55%),
      var(--bg);
    color: var(--text);
    font-family: var(--font);
    font-size: 15px;
    line-height: 1.45;
    font-feature-settings: "ss01", "cv11";
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
  .fl-shell *, .fl-shell *::before, .fl-shell *::after { box-sizing: border-box; }
  .fl-shell .lucide { stroke-width: 1.75; flex-shrink: 0; }
  .fl-shell button { font-family: inherit; -webkit-tap-highlight-color: transparent; }
  .fl-shell :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: var(--r-xs); }
  .fl-mono, .ox-num { font-variant-numeric: tabular-nums; font-feature-settings: "tnum"; }
  .fl-serif { font-family: var(--font); }

  /* App layout: sidebar + main on wide screens, header + bottom nav on phones. */
  .ox-app { flex: 1; min-height: 0; display: flex; }
  .ox-main { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; position: relative; }

  .ox-sidebar { display: none; }
  @media (min-width: 960px) {
    .ox-sidebar {
      display: flex;
      flex-direction: column;
      gap: var(--s-1);
      width: 248px;
      flex-shrink: 0;
      padding: var(--s-6) var(--s-4) var(--s-4);
      border-right: 1px solid var(--line);
      background: linear-gradient(180deg, rgba(255,255,255,0.015), transparent 40%);
    }
  }
  .ox-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 var(--s-2) var(--s-6);
    font-size: 17px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .ox-brand-mark {
    width: 26px;
    height: 26px;
    border-radius: 8px;
    background: linear-gradient(145deg, var(--accent-strong), #b88f45);
    box-shadow: 0 0 0 1px rgba(255,255,255,0.08) inset, var(--glow-accent);
    position: relative;
  }
  .ox-brand-mark::after {
    content: "";
    position: absolute;
    left: 7px; right: 7px; top: 8px; height: 2px;
    background: var(--on-accent);
    border-radius: 2px;
    box-shadow: 0 5px 0 var(--on-accent), 0 10px 0 rgba(26,20,7,0.55);
  }
  .ox-sidebar .ox-side-add { flex: 0 0 auto; margin: 0 0 var(--s-4); }
  .ox-side-link {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    width: 100%;
    padding: 10px var(--s-3);
    border: none;
    border-radius: var(--r-sm);
    background: none;
    color: var(--text-2);
    font-size: 14px;
    font-weight: 500;
    text-align: left;
    cursor: pointer;
    position: relative;
    transition: color var(--dur-fast), background var(--dur-fast);
  }
  .ox-side-link:hover { color: var(--text); background: var(--surface-hover); }
  .ox-side-link.active { color: var(--text); background: var(--surface-2); box-shadow: 0 0 0 1px var(--line) inset; }
  .ox-side-link.active::before {
    content: "";
    position: absolute;
    left: -16px; top: 10px; bottom: 10px; width: 3px;
    border-radius: 0 3px 3px 0;
    background: var(--accent);
  }
  .ox-side-foot {
    margin-top: auto;
    display: flex;
    align-items: center;
    gap: var(--s-3);
    padding: var(--s-3);
    border-radius: var(--r-md);
    border: 1px solid var(--line);
    background: var(--surface-1);
    cursor: pointer;
    color: var(--text);
    width: 100%;
    text-align: left;
  }
  .ox-side-foot:hover { background: var(--surface-hover); }
  .ox-side-foot-text { min-width: 0; display: flex; flex-direction: column; }
  .ox-side-foot-text span { font-size: 12px; color: var(--text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .ox-avatar {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 600;
    color: var(--on-accent);
    background: linear-gradient(145deg, var(--accent-strong), #b88f45);
    border: none;
    cursor: pointer;
  }

  /* Header */
  .fl-topbar {
    position: relative;
    z-index: 3;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--s-3);
    padding: calc(14px + env(safe-area-inset-top, 0px)) var(--s-5) var(--s-3);
    background: linear-gradient(180deg, rgba(10,12,16,0.92), rgba(10,12,16,0.72));
    backdrop-filter: saturate(140%) blur(16px);
    -webkit-backdrop-filter: saturate(140%) blur(16px);
    border-bottom: 1px solid transparent;
    transition: border-color var(--dur);
  }
  .fl-topbar.scrolled { border-bottom-color: var(--line); }
  @media (min-width: 960px) {
    .fl-topbar { padding: var(--s-6) var(--s-8) var(--s-4); }
  }
  .ox-topbar-text { min-width: 0; }
  .fl-title {
    font-size: 26px;
    font-weight: 600;
    letter-spacing: -0.025em;
    line-height: 1.15;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .fl-subtitle { margin: 2px 0 0; font-size: 13px; color: var(--text-3); }
  .ox-eyebrow { margin: 0 0 2px; font-size: 13px; color: var(--text-3); font-weight: 500; }
  .fl-back-row {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin: 0 0 6px -6px;
    padding: 4px 8px 4px 4px;
    border: none;
    border-radius: var(--r-pill);
    background: none;
    color: var(--text-2);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: color var(--dur-fast), background var(--dur-fast);
  }
  .fl-back-row:hover { color: var(--text); background: var(--surface-hover); }
  .ox-topbar-actions { display: flex; align-items: center; gap: var(--s-2); flex-shrink: 0; }
  @media (min-width: 960px) { .ox-topbar-actions .ox-avatar { display: none; } }

  /* Scrolling content */
  .fl-content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: var(--s-2) var(--s-4) calc(104px + env(safe-area-inset-bottom, 0px));
    position: relative;
    z-index: 1;
    scroll-behavior: smooth;
  }
  @media (min-width: 960px) {
    .fl-content { padding: var(--s-2) var(--s-8) var(--s-12); }
  }
  .ox-page { max-width: 1120px; margin: 0 auto; animation: ox-page-in var(--dur-slow) var(--ease-out) both; }
  .ox-page.narrow { max-width: 680px; }
  @keyframes ox-page-in {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: none; }
  }
  .ox-rise { animation: ox-rise 460ms var(--ease-out) both; animation-delay: calc(var(--i, 0) * 45ms); }
  @keyframes ox-rise {
    from { opacity: 0; transform: translateY(14px) scale(0.99); }
    to { opacity: 1; transform: none; }
  }

  /* Grids */
  .ox-stack { display: flex; flex-direction: column; gap: var(--s-4); }
  .ox-grid { display: grid; gap: var(--s-4); grid-template-columns: minmax(0, 1fr); }
  @media (min-width: 960px) {
    .ox-grid.two { grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); align-items: start; }
    .ox-grid.halves { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  .ox-tiles { display: grid; gap: var(--s-3); grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ox-tiles > :last-child:nth-child(odd) { grid-column: 1 / -1; }
  @media (min-width: 720px) {
    .ox-tiles { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .ox-tiles > :last-child:nth-child(odd) { grid-column: auto; }
  }

  /* Bottom navigation (phones) */
  .fl-bottomnav {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 4;
    padding: 0 var(--s-3) calc(8px + env(safe-area-inset-bottom, 0px));
    pointer-events: none;
  }
  @media (min-width: 960px) { .fl-bottomnav { display: none; } }
  .ox-nav {
    pointer-events: auto;
    position: relative;
    display: flex;
    align-items: center;
    max-width: 520px;
    margin: 0 auto;
    padding: 6px;
    border-radius: 24px;
    background: rgba(20,23,29,0.82);
    backdrop-filter: saturate(150%) blur(20px);
    -webkit-backdrop-filter: saturate(150%) blur(20px);
    border: 1px solid var(--line-strong);
    box-shadow: 0 16px 40px -12px rgba(0,0,0,0.8);
  }
  .fl-navbtn {
    flex: 1;
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    min-height: 52px;
    padding: 7px 0 5px;
    border: none;
    border-radius: 18px;
    background: none;
    color: var(--text-3);
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: color var(--dur);
  }
  .fl-navbtn.active { color: var(--text); }
  .fl-navbtn:active { transform: scale(0.96); }
  .ox-nav-pill {
    position: absolute;
    top: 6px;
    bottom: 6px;
    left: 6px;
    border-radius: 18px;
    background: var(--surface-3);
    box-shadow: 0 0 0 1px var(--line-strong) inset;
    transition: transform var(--dur-slow) var(--ease-out), width var(--dur-slow) var(--ease-out), opacity var(--dur);
    z-index: 0;
  }
  .ox-nav-add {
    flex: 0 0 auto;
    width: 52px;
    height: 52px;
    margin: 0 6px;
    border-radius: 18px;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--on-accent);
    background: linear-gradient(150deg, var(--accent-strong), var(--accent) 55%, #c79a4c);
    box-shadow: 0 0 0 1px rgba(255,255,255,0.18) inset, var(--glow-accent);
    cursor: pointer;
    transition: transform var(--dur-fast) var(--ease-out), box-shadow var(--dur);
  }
  .ox-nav-add:active { transform: scale(0.93); }
  .ox-nav-add .lucide { stroke-width: 2.25; }

  /* ------------------------------------------------------------ surfaces */
  .ox-card, .fl-panel, .fl-summary, .fl-detail-head, .fl-month-list {
    position: relative;
    background: var(--surface-1);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    box-shadow: var(--shadow-1);
    padding: var(--s-5);
  }
  .fl-panel, .fl-summary, .fl-detail-head { margin-bottom: var(--s-4); }
  .ox-card.flush { padding: 0; overflow: hidden; }
  .ox-card.tap, .fl-card { cursor: pointer; transition: transform var(--dur) var(--ease-out), border-color var(--dur), background var(--dur); }
  @media (hover: hover) {
    .ox-card.tap:hover, .fl-card:hover { transform: translateY(-2px); border-color: var(--line-strong); background: #141820; }
  }
  .ox-card.tap:active, .fl-card:active { transform: scale(0.985); }

  .ox-hero {
    padding: var(--s-6);
    background:
      radial-gradient(600px 240px at 0% 0%, rgba(227,187,111,0.10), transparent 60%),
      radial-gradient(420px 200px at 100% 100%, rgba(134,169,242,0.06), transparent 60%),
      var(--surface-1);
    border-color: var(--line-strong);
    overflow: hidden;
  }
  .ox-hero::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    background: linear-gradient(180deg, rgba(255,255,255,0.04), transparent 32%);
  }

  .ox-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
    margin-bottom: var(--s-4);
  }
  .ox-card-title, .fl-panel-title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.005em;
    color: var(--text);
  }
  .fl-panel-title { margin-bottom: var(--s-3); }
  .ox-card-sub { margin: 2px 0 0; font-size: 13px; color: var(--text-3); }

  /* Labels and figures */
  .ox-label, .fl-summary-label, .fl-stat-label {
    margin: 0;
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-3);
  }
  .ox-amount-xl {
    margin: 6px 0 0;
    font-size: clamp(38px, 9vw, 54px);
    font-weight: 500;
    letter-spacing: -0.035em;
    line-height: 1.05;
    font-variant-numeric: tabular-nums;
  }
  .fl-summary-value, .ox-amount-lg {
    margin: 4px 0 0;
    font-size: 30px;
    font-weight: 500;
    letter-spacing: -0.03em;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }
  .ox-amount-md, .fl-stat-value {
    margin: 4px 0 0;
    font-size: 20px;
    font-weight: 500;
    letter-spacing: -0.02em;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
  }
  .fl-card-sub, .fl-list-row-sub, .fl-month-breakdown {
    margin: 2px 0 0;
    font-size: 13px;
    color: var(--text-3);
    line-height: 1.45;
  }
  .ox-pos { color: var(--positive); }
  .ox-neg { color: var(--negative); }
  .ox-muted { color: var(--text-2); }
  .ox-faint { color: var(--text-3); }

  .fl-section-title, .ox-section {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--s-3);
    margin: var(--s-6) 2px var(--s-3);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--text-2);
  }
  .ox-section:first-child, .fl-section-title:first-child { margin-top: var(--s-2); }
  .ox-section-link {
    border: none;
    background: none;
    color: var(--accent);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    padding: 2px 0;
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }

  /* Tiles */
  .ox-tile {
    background: var(--surface-1);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    padding: var(--s-4);
    box-shadow: var(--shadow-1);
    min-width: 0;
    text-align: left;
    color: var(--text);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  button.ox-tile { cursor: pointer; transition: transform var(--dur) var(--ease-out), border-color var(--dur); }
  @media (hover: hover) { button.ox-tile:hover { border-color: var(--line-strong); transform: translateY(-2px); } }
  button.ox-tile:active { transform: scale(0.98); }
  .ox-tile-icon {
    width: 30px; height: 30px;
    border-radius: 9px;
    display: flex; align-items: center; justify-content: center;
    margin-bottom: var(--s-2);
    background: var(--neutral-soft);
    color: var(--text-2);
  }
  .ox-tile-icon.accent { background: var(--accent-soft); color: var(--accent); }
  .ox-tile-icon.pos { background: var(--positive-soft); color: var(--positive); }
  .ox-tile-icon.neg { background: var(--negative-soft); color: var(--negative); }
  .ox-tile-value { font-size: 21px; font-weight: 500; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ox-tile-sub { font-size: 12px; color: var(--text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* Progress */
  .fl-progress-track, .ox-bar {
    height: 6px;
    border-radius: var(--r-pill);
    background: rgba(255,255,255,0.07);
    overflow: hidden;
    margin-top: var(--s-3);
  }
  .fl-progress-fill, .ox-bar-fill {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #b88f45, var(--accent) 60%, var(--accent-strong));
    transform-origin: left center;
    animation: ox-grow 900ms var(--ease-out) both;
    transition: width 600ms var(--ease-out);
  }
  .ox-bar-fill.pos { background: linear-gradient(90deg, #2f9d70, var(--positive)); }
  @keyframes ox-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }

  /* Chips */
  .fl-chip, .fl-overdue {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 9px;
    border-radius: var(--r-pill);
    font-size: 12px;
    font-weight: 500;
    line-height: 1.35;
    letter-spacing: 0;
    border: 1px solid transparent;
    white-space: nowrap;
    background: var(--neutral-soft);
    color: var(--text-2);
  }
  .fl-chip .lucide, .fl-overdue .lucide { width: 12px; height: 12px; }
  .fl-chip.chip-grey { background: var(--neutral-soft); color: var(--text-2); }
  .fl-chip.chip-green { background: var(--positive-soft); color: var(--positive); }
  .fl-chip.chip-blue { background: var(--info-soft); color: var(--info); }
  .fl-chip.chip-tag { background: transparent; color: var(--text-2); border-color: var(--line-strong); }
  .fl-chip.chip-shared { background: transparent; color: var(--text-2); border-color: var(--line-strong); border-style: dashed; }
  .fl-chip.chip-accent { background: var(--accent-soft); color: var(--accent); }
  .fl-overdue { background: var(--negative-soft); color: var(--negative); }
  .fl-chip-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: var(--s-3); }
  .fl-tap { cursor: pointer; transition: filter var(--dur-fast), transform var(--dur-fast); }
  .fl-tap:hover { filter: brightness(1.15); }
  .fl-tap:active { transform: scale(0.96); }
  .ox-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; display: inline-block; }

  /* ------------------------------------------------------------- buttons */
  .fl-form-actions { display: flex; gap: var(--s-2); margin-top: var(--s-2); flex-wrap: wrap; }
  .fl-btn {
    flex: 1;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px var(--s-4);
    border-radius: var(--r-sm);
    border: 1px solid transparent;
    background: linear-gradient(160deg, var(--accent-strong), var(--accent));
    color: var(--on-accent);
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.005em;
    cursor: pointer;
    white-space: nowrap;
    box-shadow: 0 0 0 1px rgba(255,255,255,0.14) inset;
    transition: transform var(--dur-fast) var(--ease-out), box-shadow var(--dur), filter var(--dur), background var(--dur);
  }
  @media (hover: hover) { .fl-btn:hover { box-shadow: 0 0 0 1px rgba(255,255,255,0.2) inset, var(--glow-accent); filter: brightness(1.04); } }
  .fl-btn:active { transform: scale(0.97); }
  .fl-btn.secondary {
    background: var(--surface-2);
    color: var(--text);
    border-color: var(--line-strong);
    box-shadow: none;
  }
  @media (hover: hover) { .fl-btn.secondary:hover { background: var(--surface-3); box-shadow: none; filter: none; } }
  .fl-btn.danger { background: var(--negative); color: #1d0708; box-shadow: none; }
  @media (hover: hover) { .fl-btn.danger:hover { box-shadow: 0 8px 28px -10px rgba(242,114,122,0.5); } }
  .fl-btn.ghost { background: none; color: var(--text-2); box-shadow: none; }
  .fl-btn.small { min-height: 34px; padding: 6px 12px; font-size: 13px; flex: 0 0 auto; border-radius: 9px; }
  .fl-btn:disabled { opacity: 0.45; cursor: default; transform: none; filter: none; box-shadow: none; }
  .ox-btn-row { display: flex; gap: var(--s-2); }

  .fl-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 36px;
    min-height: 36px;
    padding: 6px;
    border: none;
    border-radius: var(--r-sm);
    background: none;
    color: var(--text-3);
    cursor: pointer;
    transition: color var(--dur-fast), background var(--dur-fast), transform var(--dur-fast);
  }
  .fl-icon-btn:hover { color: var(--text); background: var(--surface-hover); }
  .fl-icon-btn:active { transform: scale(0.92); }
  .fl-icon-btn.danger { color: var(--negative); }
  .fl-icon-label { font-size: 13px; margin-left: 4px; font-weight: 500; }
  .fl-confirm-row { display: inline-flex; gap: 4px; align-items: center; animation: ox-fade var(--dur) var(--ease-out); }
  .fl-link {
    background: none;
    border: none;
    padding: 0;
    color: var(--accent);
    font-size: inherit;
    font-weight: 500;
    text-decoration: none;
    cursor: pointer;
  }
  .fl-link:hover { text-decoration: underline; text-underline-offset: 3px; }
  .fl-link:disabled { opacity: 0.5; cursor: default; text-decoration: none; }

  .fl-add-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    min-height: 48px;
    margin-top: var(--s-3);
    border: 1px dashed var(--line-strong);
    border-radius: var(--r-md);
    background: none;
    color: var(--text-2);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: color var(--dur-fast), border-color var(--dur-fast), background var(--dur-fast);
  }
  .fl-add-row:hover { color: var(--text); border-color: var(--line-control); background: var(--surface-1); }

  /* Segmented control */
  .ox-seg {
    position: relative;
    display: flex;
    padding: 4px;
    border-radius: 14px;
    background: var(--surface-2);
    border: 1px solid var(--line);
  }
  .ox-seg-pill {
    position: absolute;
    top: 4px; bottom: 4px; left: 4px;
    width: calc(50% - 4px);
    border-radius: 10px;
    background: var(--surface-3);
    box-shadow: 0 0 0 1px var(--line-strong) inset, 0 2px 8px rgba(0,0,0,0.4);
    transition: transform var(--dur-slow) var(--ease-out);
  }
  .ox-seg button {
    flex: 1;
    position: relative;
    z-index: 1;
    min-height: 40px;
    border: none;
    background: none;
    color: var(--text-3);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: color var(--dur);
  }
  .ox-seg button.on { color: var(--text); }

  /* -------------------------------------------------------------- inputs */
  .fl-field { margin-bottom: var(--s-4); }
  .fl-field label {
    display: block;
    margin-bottom: 6px;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-2);
  }
  .fl-field input, .fl-field select, .fl-budget-part input, .fl-plan-row input {
    width: 100%;
    min-height: 46px;
    padding: 11px 14px;
    border: 1px solid var(--line-control);
    border-radius: var(--r-sm);
    background: var(--surface-2);
    color: var(--text);
    font-family: inherit;
    font-size: 16px;
    font-variant-numeric: tabular-nums;
    transition: border-color var(--dur), box-shadow var(--dur), background var(--dur);
    -webkit-appearance: none;
    appearance: none;
  }
  .fl-field select {
    padding-right: 38px;
    background-image: linear-gradient(45deg, transparent 50%, var(--text-2) 50%), linear-gradient(135deg, var(--text-2) 50%, transparent 50%);
    background-position: calc(100% - 20px) 50%, calc(100% - 15px) 50%;
    background-size: 5px 5px;
    background-repeat: no-repeat;
  }
  .fl-field input::placeholder { color: var(--text-3); }
  .fl-field input:hover, .fl-field select:hover { border-color: #7d8594; }
  .fl-field input:focus, .fl-field select:focus, .fl-budget-part input:focus, .fl-plan-row input:focus {
    outline: none;
    border-color: var(--accent);
    background: var(--surface-3);
    box-shadow: 0 0 0 4px rgba(227,187,111,0.16);
  }
  .fl-field input[aria-invalid="true"] { border-color: var(--negative); box-shadow: 0 0 0 4px rgba(242,114,122,0.14); }
  .fl-term-row { display: flex; align-items: center; gap: var(--s-2); }
  .fl-term-row input { flex: 1; min-width: 0; }
  .fl-term-row .fl-tag-option { flex-shrink: 0; }
  .fl-code-input { font-size: 24px !important; letter-spacing: 0.35em; text-align: center; font-family: var(--font-mono) !important; }

  .fl-tag-picker { display: flex; flex-wrap: wrap; gap: var(--s-2); }
  .fl-tag-option {
    min-height: 38px;
    padding: 7px 14px;
    border-radius: var(--r-pill);
    border: 1px solid var(--line-strong);
    background: var(--surface-2);
    color: var(--text-2);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--dur) var(--ease-out);
  }
  .fl-tag-option:hover { color: var(--text); border-color: var(--line-control); }
  .fl-tag-option:active { transform: scale(0.96); }
  .fl-tag-option.selected { background: var(--accent-soft); border-color: rgba(227,187,111,0.55); color: var(--accent); }

  .fl-switch-row { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); margin-bottom: 6px; }
  .fl-switch-label { font-size: 15px; font-weight: 500; color: var(--text); }
  .fl-switch {
    position: relative;
    flex-shrink: 0;
    width: 50px;
    height: 30px;
    padding: 0;
    border-radius: var(--r-pill);
    border: 1px solid var(--line-control);
    background: var(--surface-3);
    cursor: pointer;
    transition: background var(--dur) var(--ease-out), border-color var(--dur);
  }
  .fl-switch.on { background: var(--accent); border-color: var(--accent); }
  .fl-switch-knob {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #d9dee6;
    box-shadow: 0 2px 6px rgba(0,0,0,0.45);
    transition: transform var(--dur) var(--ease-out), background var(--dur);
  }
  .fl-switch.on .fl-switch-knob { transform: translateX(20px); background: #fff; }
  .fl-switch:active .fl-switch-knob { width: 26px; }
  .fl-switch.on:active .fl-switch-knob { transform: translateX(16px); }

  .fl-password { position: relative; }
  .fl-password input { padding-right: 50px !important; }
  .fl-password-eye {
    position: absolute;
    right: 4px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    padding: 10px;
    border: none;
    border-radius: var(--r-sm);
    background: none;
    color: var(--text-3);
    cursor: pointer;
  }
  .fl-password-eye:hover { color: var(--text); }

  .ox-field-error {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
    font-size: 13px;
    color: var(--negative);
    animation: ox-drop var(--dur) var(--ease-out);
  }
  @keyframes ox-drop { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }

  /* ------------------------------------------------------------- lists */
  .fl-list-row {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    padding: var(--s-3) var(--s-4);
    margin-bottom: var(--s-2);
    background: var(--surface-1);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    transition: border-color var(--dur), background var(--dur);
  }
  .fl-list-row-main { flex: 1; min-width: 0; cursor: pointer; }
  .fl-list-row-name { font-size: 15px; font-weight: 500; color: var(--text); overflow-wrap: anywhere; }

  .ox-list { background: var(--surface-1); border: 1px solid var(--line); border-radius: var(--r-lg); overflow: hidden; }
  .ox-row {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    width: 100%;
    min-height: 60px;
    padding: var(--s-3) var(--s-4);
    border: none;
    border-bottom: 1px solid var(--line);
    background: none;
    color: var(--text);
    font-size: 15px;
    text-align: left;
    cursor: pointer;
    transition: background var(--dur-fast);
  }
  .ox-row:last-child { border-bottom: none; }
  .ox-row:hover { background: var(--surface-hover); }
  .ox-row:active { background: var(--surface-2); }
  .ox-row:disabled { cursor: default; background: none; }
  .ox-row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .ox-row-name { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ox-row-sub { font-size: 13px; color: var(--text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ox-row-end { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; text-align: right; }
  .ox-row-amount { font-weight: 500; font-variant-numeric: tabular-nums; }
  .ox-row-icon {
    width: 40px; height: 40px;
    border-radius: 12px;
    flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    background: var(--surface-3);
    color: var(--text-2);
  }
  .ox-row-icon.accent { background: var(--accent-soft); color: var(--accent); }

  /* People: invited people, and who can see an item */
  .ox-person { cursor: default; }
  .ox-person:hover { background: none; }
  .ox-avatar.sm { width: 34px; height: 34px; font-size: 12px; cursor: default; }
  .ox-avatar.muted { background: var(--surface-3); color: var(--text-2); box-shadow: 0 0 0 1px var(--line-strong) inset; }
  .ox-access {
    flex-shrink: 0;
    min-height: 34px;
    padding: 6px 30px 6px 12px;
    border-radius: var(--r-pill);
    border: 1px solid var(--line-control);
    background-color: var(--surface-2);
    background-image: linear-gradient(45deg, transparent 50%, var(--text-3) 50%), linear-gradient(135deg, var(--text-3) 50%, transparent 50%);
    background-position: calc(100% - 16px) 52%, calc(100% - 11px) 52%;
    background-size: 5px 5px;
    background-repeat: no-repeat;
    color: var(--text-2);
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
    transition: border-color var(--dur), color var(--dur), background-color var(--dur);
  }
  .ox-access.on { border-color: rgba(227,187,111,0.55); background-color: var(--accent-soft); color: var(--accent); }
  .ox-access:disabled { opacity: 0.5; }
  .ox-access:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

  /* This month: date badges */
  .fl-month-list { padding: 0; overflow: hidden; }
  .fl-month-item {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    width: 100%;
    min-height: 64px;
    padding: var(--s-3) var(--s-4);
    border: none;
    border-bottom: 1px solid var(--line);
    background: none;
    color: var(--text);
    text-align: left;
    cursor: pointer;
    transition: background var(--dur-fast);
  }
  .fl-month-item:last-child { border-bottom: none; }
  .fl-month-item:hover { background: var(--surface-hover); }
  .fl-month-item:disabled { cursor: default; background: none; }
  .fl-month-item-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .fl-month-item-main .fl-list-row-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fl-day {
    flex-shrink: 0;
    width: 44px;
    height: 46px;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: var(--surface-3);
    border: 1px solid var(--line-strong);
  }
  .fl-day.fl-day-in { background: var(--positive-soft); border-color: rgba(76,197,146,0.25); }
  .fl-day.ox-day-late { background: var(--negative-soft); border-color: rgba(242,114,122,0.3); }
  .fl-day-num { font-size: 17px; font-weight: 600; line-height: 1; font-variant-numeric: tabular-nums; }
  .fl-day-mon { font-family: var(--font-mono); font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-3); margin-top: 3px; }

  /* Debt cards */
  .fl-card {
    position: relative;
    display: block;
    background: var(--surface-1);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    box-shadow: var(--shadow-1);
    padding: var(--s-4) var(--s-5);
    margin-bottom: var(--s-3);
  }
  .fl-card-row { display: flex; justify-content: space-between; align-items: baseline; gap: var(--s-3); }
  .fl-card-name { font-size: 16px; font-weight: 500; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fl-card-balance { font-size: 18px; font-weight: 500; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; flex-shrink: 0; }
  .ox-card-foot { display: flex; justify-content: space-between; gap: var(--s-2); margin-top: var(--s-2); font-size: 12px; color: var(--text-3); font-variant-numeric: tabular-nums; }

  /* Detail stats */
  .fl-detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s-4) var(--s-3); margin-top: var(--s-5); }
  @media (min-width: 720px) { .fl-detail-grid.four { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
  .fl-stat-edit {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 0; border: none; background: none; cursor: pointer; color: var(--text-3);
  }
  .fl-stat-edit:hover .fl-stat-label, .fl-stat-edit:hover { color: var(--accent); }

  /* Month-by-month history */
  .fl-month-row { padding: var(--s-3) var(--s-4); border-bottom: 1px solid var(--line); }
  .fl-month-row:last-child { border-bottom: none; }
  .fl-month-top { display: flex; justify-content: space-between; gap: var(--s-3); font-size: 15px; cursor: pointer; }
  .fl-month-name { font-weight: 500; }
  .fl-month-balance { font-weight: 500; font-variant-numeric: tabular-nums; }
  .fl-month-breakdown { cursor: pointer; }

  /* Budget and plan details */
  .fl-budget-part { padding: var(--s-3) 0; border-bottom: 1px solid var(--line); }
  .fl-budget-part .fl-term-row input { flex: 1; min-width: 0; width: auto; }
  .fl-budget-part-end { display: inline-flex; align-items: center; gap: 2px; }
  .fl-budget-total { display: flex; justify-content: space-between; align-items: baseline; padding-top: var(--s-4); font-weight: 600; font-size: 16px; }
  .fl-budget-breakdown { margin-top: var(--s-4); padding-top: var(--s-3); border-top: 1px solid var(--line); display: flex; flex-direction: column; gap: 6px; }
  .fl-budget-line { display: flex; justify-content: space-between; gap: var(--s-3); font-size: 13px; color: var(--text-3); }
  .fl-budget-line .fl-mono { color: var(--text); flex-shrink: 0; }
  .fl-plan-preview {
    margin-top: var(--s-2);
    padding: 10px 12px;
    border-radius: var(--r-sm);
    background: var(--accent-soft);
    border: 1px solid rgba(227,187,111,0.3);
    font-size: 13px;
    line-height: 1.5;
    color: var(--text-2);
  }
  .fl-plan-details { margin-top: var(--s-4); font-size: 14px; }
  .fl-plan-details summary { cursor: pointer; color: var(--text-2); padding: 6px 0; font-weight: 500; }
  .fl-plan-row { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); padding: 8px 0; border-bottom: 1px solid var(--line); font-size: 14px; }
  .fl-plan-row input { width: 140px; flex: none; min-height: 38px; padding: 6px 10px; font-size: 15px; }

  .fl-share-row { display: flex; align-items: center; gap: 4px; padding: 8px 0; border-bottom: 1px solid var(--line); }
  .fl-share-email { flex: 1; min-width: 0; font-size: 14px; overflow-wrap: anywhere; }
  .fl-activity-row {
    display: flex;
    justify-content: space-between;
    gap: var(--s-3);
    padding: var(--s-3) var(--s-4);
    border-bottom: 1px solid var(--line);
    font-size: 14px;
    color: var(--text-2);
  }
  .fl-activity-row:last-child { border-bottom: none; }
  .fl-activity-row strong { color: var(--text); font-weight: 500; }
  .fl-activity-row .fl-card-sub { flex-shrink: 0; white-space: nowrap; margin: 0; }

  .fl-steps { margin: 0 0 var(--s-5); padding: 0; list-style: none; counter-reset: step; display: flex; flex-direction: column; gap: var(--s-3); }
  .fl-steps li { counter-increment: step; position: relative; padding-left: 38px; font-size: 14px; line-height: 1.5; color: var(--text-2); }
  .fl-steps li::before {
    content: counter(step);
    position: absolute; left: 0; top: -1px;
    width: 26px; height: 26px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 600;
    background: var(--accent-soft); color: var(--accent);
  }
  .fl-steps strong { color: var(--text); font-weight: 600; }
  .fl-prose p { font-size: 14px; line-height: 1.6; color: var(--text-2); margin: 0 0 var(--s-3); }
  .fl-prose .fl-panel-title { margin: var(--s-5) 0 6px; }
  .fl-prose .fl-panel-title:first-child { margin-top: 0; }

  /* --------------------------------------------------- empty, loading, error */
  .fl-empty, .ox-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: var(--s-2);
    padding: var(--s-10) var(--s-6);
    color: var(--text-3);
    font-size: 14px;
    line-height: 1.5;
  }
  .ox-empty { background: var(--surface-1); border: 1px dashed var(--line-strong); border-radius: var(--r-lg); }
  .ox-empty-icon {
    width: 56px; height: 56px;
    border-radius: 18px;
    display: flex; align-items: center; justify-content: center;
    margin-bottom: var(--s-2);
    background: radial-gradient(circle at 30% 25%, rgba(227,187,111,0.22), rgba(227,187,111,0.06));
    color: var(--accent);
    box-shadow: 0 0 0 1px rgba(227,187,111,0.2) inset;
    animation: ox-float 4s var(--ease-in-out) infinite;
  }
  @keyframes ox-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
  .ox-empty-title { color: var(--text); font-size: 16px; font-weight: 600; margin: 0; }
  .ox-empty .fl-btn { flex: 0 0 auto; margin-top: var(--s-3); }

  .ox-skel {
    border-radius: var(--r-sm);
    background: linear-gradient(90deg, var(--surface-2) 0%, var(--surface-3) 40%, var(--surface-2) 80%);
    background-size: 240% 100%;
    animation: ox-shimmer 1.4s linear infinite;
  }
  @keyframes ox-shimmer { from { background-position: 120% 0; } to { background-position: -120% 0; } }

  .ox-center { flex: 1; display: flex; align-items: center; justify-content: center; padding: var(--s-6); }
  .ox-state {
    max-width: 380px;
    width: 100%;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--s-2);
    animation: ox-page-in var(--dur-slow) var(--ease-out) both;
  }
  .ox-state h2 { margin: 0; font-size: 20px; font-weight: 600; letter-spacing: -0.01em; }
  .ox-state p { margin: 0; color: var(--text-3); font-size: 14px; line-height: 1.55; }
  .ox-state .fl-form-actions { width: 100%; margin-top: var(--s-4); }
  .ox-state-icon {
    width: 64px; height: 64px;
    border-radius: 20px;
    display: flex; align-items: center; justify-content: center;
    margin-bottom: var(--s-2);
    background: var(--negative-soft);
    color: var(--negative);
  }
  .ox-splash-mark { width: 44px; height: 44px; border-radius: 13px; animation: ox-pulse 1.6s var(--ease-in-out) infinite; }
  .ox-splash-mark::after { left: 12px; right: 12px; top: 14px; height: 3px; box-shadow: 0 7px 0 var(--on-accent), 0 14px 0 rgba(26,20,7,0.55); }
  @keyframes ox-pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(0.94); opacity: 0.75; } }

  /* --------------------------------------------------------- sheets */
  .ox-layer { position: fixed; inset: 0; z-index: 20; display: flex; align-items: flex-end; justify-content: center; }
  .ox-backdrop {
    position: absolute; inset: 0;
    background: rgba(3,4,6,0.62);
    backdrop-filter: blur(3px);
    -webkit-backdrop-filter: blur(3px);
    animation: ox-fade var(--dur-slow) var(--ease-out) both;
  }
  .ox-layer.closing .ox-backdrop { animation: ox-fade-out var(--dur) var(--ease-in-out) both; }
  @keyframes ox-fade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes ox-fade-out { from { opacity: 1; } to { opacity: 0; } }
  .fl-sheet {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 640px;
    max-height: calc(100% - 24px - env(safe-area-inset-top, 0px));
    display: flex;
    flex-direction: column;
    background: var(--surface-1);
    border: 1px solid var(--line-strong);
    border-bottom: none;
    border-radius: var(--r-xl) var(--r-xl) 0 0;
    box-shadow: var(--shadow-3);
    animation: ox-sheet-up 420ms var(--ease-out) both;
    touch-action: pan-y;
  }
  .ox-layer.closing .fl-sheet { animation: ox-sheet-down var(--dur) var(--ease-in-out) both; }
  @keyframes ox-sheet-up { from { transform: translateY(100%); } to { transform: none; } }
  @keyframes ox-sheet-down { from { transform: translateY(var(--drag, 0px)); } to { transform: translateY(100%); } }
  @media (min-width: 720px) {
    .ox-layer { align-items: center; padding: var(--s-8); }
    .fl-sheet {
      max-height: min(820px, 100%);
      border-bottom: 1px solid var(--line-strong);
      border-radius: var(--r-xl);
      box-shadow: 0 40px 120px -20px rgba(0,0,0,0.85);
      animation: ox-dialog-in 320ms var(--ease-out) both;
    }
    .ox-layer.closing .fl-sheet { animation: ox-dialog-out var(--dur) var(--ease-in-out) both; }
    .ox-grabber { display: none; }
  }
  @keyframes ox-dialog-in { from { opacity: 0; transform: translateY(12px) scale(0.97); } to { opacity: 1; transform: none; } }
  @keyframes ox-dialog-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(8px) scale(0.98); } }
  .ox-grabber { width: 40px; height: 5px; border-radius: 3px; background: var(--line-control); margin: 10px auto 0; opacity: 0.7; flex-shrink: 0; }
  .fl-sheet-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
    padding: var(--s-3) var(--s-4) var(--s-3) var(--s-5);
    flex-shrink: 0;
    cursor: grab;
  }
  .fl-sheet-head .fl-title { font-size: 19px; letter-spacing: -0.015em; }
  .fl-sheet-close {
    flex-shrink: 0;
    width: 36px; height: 36px;
    padding: 0;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    border: none;
    background: var(--surface-3);
    color: var(--text-2);
    cursor: pointer;
    transition: background var(--dur-fast), color var(--dur-fast), transform var(--dur-fast);
  }
  .fl-sheet-close:hover { color: var(--text); background: var(--line-strong); }
  .fl-sheet-close:active { transform: scale(0.92); }
  .fl-sheet-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: var(--s-2) var(--s-5) calc(var(--s-6) + env(safe-area-inset-bottom, 0px));
  }
  /* A form inside a sheet: panels drop their own frame. */
  .fl-sheet-body .fl-panel { background: none; border: none; box-shadow: none; padding: 0; }

  /* The Add menu */
  .ox-add-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s-3); }
  .ox-add-option {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--s-3);
    padding: var(--s-4);
    min-height: 116px;
    border-radius: var(--r-md);
    border: 1px solid var(--line-strong);
    background: var(--surface-2);
    color: var(--text);
    text-align: left;
    cursor: pointer;
    transition: transform var(--dur) var(--ease-out), border-color var(--dur), background var(--dur);
    animation: ox-rise 420ms var(--ease-out) both;
    animation-delay: calc(var(--i, 0) * 50ms);
  }
  .ox-add-option:hover { border-color: var(--line-control); background: var(--surface-3); }
  .ox-add-option:active { transform: scale(0.97); }
  .ox-add-option strong { font-size: 15px; font-weight: 600; }
  .ox-add-option span { font-size: 13px; color: var(--text-3); line-height: 1.4; }

  /* ---------------------------------------------------------------- toast */
  .fl-toast {
    position: fixed;
    left: 50%;
    bottom: calc(96px + env(safe-area-inset-bottom, 0px));
    transform: translateX(-50%);
    z-index: 30;
    display: flex;
    align-items: center;
    gap: var(--s-3);
    width: max-content;
    max-width: calc(100% - 32px);
    padding: 10px 10px 10px 14px;
    border-radius: 16px;
    background: rgba(31,36,44,0.94);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid var(--line-strong);
    box-shadow: 0 18px 48px -12px rgba(0,0,0,0.8);
    color: var(--text);
    font-size: 14px;
    font-weight: 500;
    line-height: 1.4;
    animation: ox-toast-in 380ms var(--ease-out) both;
  }
  @media (min-width: 960px) { .fl-toast { bottom: var(--s-8); left: calc(50% + 124px); } }
  @keyframes ox-toast-in { from { opacity: 0; transform: translate(-50%, 16px) scale(0.96); } to { opacity: 1; transform: translate(-50%, 0); } }
  .ox-toast-icon {
    width: 26px; height: 26px;
    border-radius: 50%;
    flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    background: var(--positive-soft);
    color: var(--positive);
  }
  .ox-toast-icon.error { background: var(--negative-soft); color: var(--negative); }
  .ox-toast-icon.info { background: var(--info-soft); color: var(--info); }
  .ox-check path { stroke-dasharray: 24; stroke-dashoffset: 24; animation: ox-draw 420ms 120ms var(--ease-out) forwards; }
  @keyframes ox-draw { to { stroke-dashoffset: 0; } }
  .fl-toast-undo {
    flex-shrink: 0;
    min-height: 34px;
    padding: 6px 14px;
    border-radius: 11px;
    border: none;
    background: var(--surface-3);
    color: var(--accent);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }
  .fl-toast-undo:hover { background: var(--line-strong); }

  /* ---------------------------------------------------------------- charts */
  .ox-chart { position: relative; width: 100%; user-select: none; -webkit-user-select: none; touch-action: pan-y; }
  .ox-chart svg { display: block; width: 100%; overflow: visible; }
  .ox-chart-grid { stroke: var(--line); stroke-width: 1; }
  .ox-chart-axis { fill: var(--text-3); font-family: var(--font-mono); font-size: 10.5px; }
  .ox-chart-line { fill: none; stroke: var(--accent); stroke-width: 2.25; stroke-linecap: round; stroke-linejoin: round; }
  .ox-chart-line.draw { stroke-dasharray: 1; stroke-dashoffset: 1; animation: ox-line var(--dur-chart) var(--ease-out) forwards; }
  @keyframes ox-line { to { stroke-dashoffset: 0; } }
  .ox-chart-area { opacity: 0; animation: ox-fade 900ms 200ms var(--ease-out) forwards; }
  .ox-chart-cross { stroke: var(--line-control); stroke-width: 1; stroke-dasharray: 3 3; }
  .ox-chart-dot { fill: var(--bg); stroke: var(--accent); stroke-width: 2.5; }
  .ox-chart-end { fill: var(--positive); }
  .ox-chart-end-ring { fill: none; stroke: var(--positive); stroke-width: 1.5; opacity: 0.5; transform-box: fill-box; transform-origin: center; animation: ox-ping 2.2s var(--ease-out) infinite; }
  @keyframes ox-ping { 0% { transform: scale(1); opacity: 0.6; } 80%, 100% { transform: scale(2.6); opacity: 0; } }
  .ox-tip {
    position: absolute;
    top: 0;
    z-index: 2;
    pointer-events: none;
    padding: 7px 10px;
    border-radius: 10px;
    background: rgba(31,36,44,0.96);
    border: 1px solid var(--line-strong);
    box-shadow: 0 10px 28px -8px rgba(0,0,0,0.8);
    font-size: 12px;
    white-space: nowrap;
    transform: translateX(-50%);
    transition: left 80ms linear;
  }
  .ox-tip strong { display: block; font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--text); }
  .ox-tip span { color: var(--text-3); }
  .ox-bars rect { transform-box: fill-box; transform-origin: bottom; animation: ox-bar 640ms var(--ease-out) both; }
  @keyframes ox-bar { from { transform: scaleY(0); } to { transform: scaleY(1); } }
  .ox-bar-in { fill: var(--positive); }
  .ox-bar-out { fill: var(--bar-out); }
  .ox-bar-hit { fill: transparent; cursor: pointer; }
  .ox-bar-hit.on { fill: rgba(255,255,255,0.04); }
  .ox-legend { display: flex; flex-wrap: wrap; gap: var(--s-2) var(--s-4); margin-top: var(--s-3); font-size: 12px; color: var(--text-3); }
  .ox-legend span { display: inline-flex; align-items: center; gap: 6px; }

  .ox-ring { position: relative; flex-shrink: 0; }
  .ox-ring svg { display: block; transform: rotate(-90deg); }
  .ox-ring-track { fill: none; stroke: rgba(255,255,255,0.07); }
  .ox-ring-fill { fill: none; stroke: var(--accent); stroke-linecap: round; transition: stroke-dashoffset 1100ms var(--ease-out); }
  .ox-ring-fill.pos { stroke: var(--positive); }
  .ox-ring-label { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
  .ox-ring-label strong { font-size: 18px; font-weight: 600; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
  .ox-ring-label span { font-size: 11px; color: var(--text-3); }

  .ox-segbar { display: flex; height: 12px; gap: 3px; border-radius: var(--r-pill); overflow: hidden; }
  .ox-segbar i { display: block; height: 100%; border-radius: 3px; transition: flex-grow 900ms var(--ease-out); min-width: 3px; }
  .ox-seglist { margin-top: var(--s-4); display: flex; flex-direction: column; }
  .ox-segitem { display: flex; align-items: center; gap: var(--s-3); padding: 9px 0; border-bottom: 1px solid var(--line); font-size: 14px; }
  .ox-segitem:last-child { border-bottom: none; padding-bottom: 0; }
  .ox-segitem-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-2); }
  .ox-segitem-pct { color: var(--text-3); font-size: 12px; width: 40px; text-align: right; font-variant-numeric: tabular-nums; }
  .ox-segitem-amt { font-weight: 500; font-variant-numeric: tabular-nums; }

  .ox-compare { display: flex; flex-direction: column; gap: var(--s-3); margin-top: var(--s-4); }
  .ox-compare-row { display: grid; grid-template-columns: 96px minmax(0, 1fr) auto; align-items: center; gap: var(--s-3); font-size: 13px; color: var(--text-3); }
  .ox-compare-track { height: 8px; border-radius: var(--r-pill); background: rgba(255,255,255,0.06); overflow: hidden; }
  .ox-compare-fill { height: 100%; border-radius: inherit; background: var(--line-control); animation: ox-grow 900ms var(--ease-out) both; transform-origin: left; }
  .ox-compare-fill.accent { background: linear-gradient(90deg, #b88f45, var(--accent)); }
  .ox-compare-val { color: var(--text); font-weight: 500; font-variant-numeric: tabular-nums; text-align: right; }

  /* Timeline (payoff order) */
  .ox-timeline { position: relative; padding-left: 28px; }
  .ox-timeline::before { content: ""; position: absolute; left: 9px; top: 8px; bottom: 8px; width: 2px; background: var(--line-strong); border-radius: 2px; }
  .ox-tl-item { position: relative; display: flex; justify-content: space-between; gap: var(--s-3); padding: 8px 0; font-size: 15px; }
  .ox-tl-item::before {
    content: "";
    position: absolute; left: -24px; top: 13px;
    width: 12px; height: 12px; border-radius: 50%;
    background: var(--bg); border: 2px solid var(--accent);
  }
  .ox-tl-item:last-child::before { background: var(--positive); border-color: var(--positive); }
  .ox-tl-when { color: var(--text-3); font-variant-numeric: tabular-nums; flex-shrink: 0; }

  /* ---------------------------------------------------------- sign in */
  .ox-auth-wrap { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; }
  .fl-auth { width: 100%; max-width: 420px; margin: 0 auto; padding: var(--s-4) var(--s-5) calc(var(--s-8) + env(safe-area-inset-bottom, 0px)); animation: ox-page-in var(--dur-slow) var(--ease-out) both; }
  .ox-auth-brand { display: flex; align-items: center; gap: 10px; justify-content: center; margin: calc(var(--s-8) + env(safe-area-inset-top, 0px)) 0 var(--s-8); font-size: 18px; font-weight: 600; }
  .fl-auth-title { text-align: center; font-size: 30px; font-weight: 600; letter-spacing: -0.03em; margin: 0 0 var(--s-2); }
  .fl-auth-sub { text-align: center; font-size: 15px; line-height: 1.5; color: var(--text-3); margin: 0 var(--s-2) var(--s-6); }
  .fl-social-btn {
    width: 100%;
    min-height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    border-radius: var(--r-sm);
    border: 1px solid var(--line-control);
    background: var(--surface-2);
    color: var(--text);
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: background var(--dur), transform var(--dur-fast);
  }
  .fl-social-btn:hover { background: var(--surface-3); }
  .fl-social-btn:active { transform: scale(0.98); }
  .fl-social-btn:disabled { opacity: 0.5; cursor: default; }
  .fl-auth-fine { text-align: center; font-size: 12px; color: var(--text-3); margin: var(--s-2) 0 0; }
  .fl-auth-or { display: flex; align-items: center; gap: var(--s-3); margin: var(--s-5) 0; color: var(--text-3); font-size: 13px; }
  .fl-auth-or::before, .fl-auth-or::after { content: ""; flex: 1; height: 1px; background: var(--line-strong); }
  .fl-auth-row { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); margin: 0 0 var(--s-5); font-size: 14px; color: var(--text-2); }
  .fl-auth-check { display: flex; align-items: center; gap: 10px; }
  .fl-auth-main { width: 100%; min-height: 50px; font-size: 16px; }
  .fl-auth-switch { text-align: center; font-size: 14px; color: var(--text-3); margin: var(--s-5) 0 var(--s-2); }
  .fl-auth-switch .fl-link { font-weight: 600; }
  .fl-signin-links { text-align: center; font-size: 13px; color: var(--text-3); margin: var(--s-3) 0 0; }
  .fl-signin-links .fl-link { color: var(--text-3); }
  .fl-turnstile { display: flex; justify-content: center; }
  .fl-turnstile iframe { margin-top: var(--s-3); }
  .ox-banner {
    display: flex;
    gap: var(--s-3);
    align-items: flex-start;
    padding: var(--s-3) var(--s-4);
    border-radius: var(--r-md);
    background: var(--surface-1);
    border: 1px solid var(--line-strong);
    font-size: 14px;
    color: var(--text-2);
    margin-bottom: var(--s-4);
  }
  .ox-banner.error { background: var(--negative-soft); border-color: rgba(242,114,122,0.3); color: var(--text); }
  .ox-banner.error .lucide { color: var(--negative); }
  .ox-banner.info .lucide { color: var(--info); }
  .ox-banner .lucide { margin-top: 1px; }
  .ox-shake { animation: ox-shake 360ms var(--ease-out); }
  @keyframes ox-shake { 0%, 100% { transform: none; } 25% { transform: translateX(-5px); } 60% { transform: translateX(4px); } }

  /* ------------------------------------------------------ reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .fl-shell *, .fl-shell *::before, .fl-shell *::after, .ox-layer *, .fl-toast {
      animation-duration: 1ms !important;
      animation-delay: 0ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 1ms !important;
    }
    .ox-chart-line.draw { stroke-dashoffset: 0; }
  }
`;
