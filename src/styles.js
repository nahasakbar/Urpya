// All of the app's CSS (the leather passbook look), injected by <style> tags.
// See CLAUDE.md → Design system for the rules behind it.
export const styles = `
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
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-family: inherit;
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
    opacity: 0.97;
    z-index: 6;
    display: flex;
    align-items: center;
    gap: 10px;
    width: max-content;
    max-width: calc(100% - 32px);
    line-height: 1.4;
  }
  /* Undo in the message bar: a big enough target to hit on a phone. */
  .fl-toast-undo {
    flex-shrink: 0;
    background: none;
    border: 1px solid rgba(228,197,131,0.6);
    color: var(--brass-light);
    font-family: inherit;
    font-size: 12px;
    font-weight: 700;
    padding: 6px 12px;
    border-radius: 14px;
    cursor: pointer;
  }

  .fl-confirm-row {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .fl-btn:disabled { opacity: 0.5; cursor: default; }
  .fl-link {
    background: none;
    border: none;
    padding: 0;
    color: var(--ink);
    font-family: inherit;
    font-size: inherit;
    text-decoration: underline;
    cursor: pointer;
  }
  .fl-code-input { font-size: 22px !important; letter-spacing: 0.3em; text-align: center; }
  .fl-icon-label { font-size: 12px; margin-left: 2px; }
  .fl-icon-btn { display: inline-flex; align-items: center; min-width: 32px; min-height: 32px; justify-content: center; }

  /* Shared items: an outlined chip, so it never reads as a status colour. */
  .fl-chip.chip-shared {
    background: transparent;
    color: var(--ink);
    border-color: rgba(27,42,74,0.35);
    border-style: dashed;
  }
  .fl-tap { cursor: pointer; }

  /* This month: one row per payment due or income expected, by date. */
  .fl-month-list {
    background: var(--paper-card);
    border: 1px solid var(--line);
    border-radius: 14px;
    box-shadow: 0 1px 0 rgba(255,255,255,0.6) inset, 0 4px 10px rgba(74,44,29,0.10);
    padding: 4px 12px;
    margin-bottom: 16px;
  }
  .fl-month-item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 56px;
    padding: 8px 0;
    background: none;
    border: none;
    border-bottom: 1px dashed var(--line);
    color: var(--ink);
    font-family: inherit;
    text-align: left;
    cursor: pointer;
  }
  .fl-month-item:last-child { border-bottom: none; }
  .fl-month-item:disabled { cursor: default; }
  .fl-month-item-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .fl-day {
    flex-shrink: 0;
    width: 40px;
    height: 42px;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: linear-gradient(160deg, var(--leather-hi), var(--leather));
    color: #F3E7D0;
    box-shadow: 0 1px 2px rgba(0,0,0,0.3);
  }
  .fl-day.fl-day-in { background: linear-gradient(160deg, #4f7a60, var(--forest)); }
  .fl-day-num { font-size: 15px; font-weight: 700; line-height: 1; }
  .fl-day-mon { font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; opacity: 0.85; margin-top: 2px; }

  /* Sharing and activity lists. */
  .fl-share-row {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 0;
    border-bottom: 1px dashed var(--line);
  }
  .fl-share-email { flex: 1; min-width: 0; font-size: 14px; overflow-wrap: anywhere; }
  .fl-activity-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 0;
    border-bottom: 1px dashed var(--line);
    font-size: 13px;
    overflow-wrap: anywhere;
  }
`;
