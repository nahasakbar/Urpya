import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY " +
      "in a .env.local file (for local dev) or in your Vercel project's Environment Variables (for deployment)."
  );
}

// "Remember me": on (the default), a sign-in is kept in localStorage and lasts
// until you sign out. Off, it's kept in sessionStorage instead, so it ends when
// the browser is closed. The choice itself is remembered in localStorage.
const REMEMBER_KEY = "ledger-remember-me";
function safely(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}
export function getRememberMe() {
  return safely(() => localStorage.getItem(REMEMBER_KEY), null) !== "0";
}
export function setRememberMe(on) {
  safely(() => localStorage.setItem(REMEMBER_KEY, on ? "1" : "0"));
}
const authStorage = {
  getItem: (key) => safely(() => localStorage.getItem(key) ?? sessionStorage.getItem(key), null),
  setItem: (key, value) =>
    safely(() => {
      const [keep, drop] = getRememberMe() ? [localStorage, sessionStorage] : [sessionStorage, localStorage];
      keep.setItem(key, value);
      drop.removeItem(key);
    }),
  removeItem: (key) =>
    safely(() => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    }),
};

export const supabase = createClient(supabaseUrl || "", supabaseAnonKey || "", {
  auth: { storage: authStorage },
});

// Which sign-in providers are switched on in Supabase (Authentication →
// Sign In / Providers), so the Google button only shows once it's set up.
export async function loadAuthSettings() {
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: supabaseAnonKey } });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// The old shared family ledger's row, read once to import it.
export const LEDGER_ROW_ID = "family-ledger-main";
