import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY " +
      "in a .env.local file (for local dev) or in your Vercel project's Environment Variables (for deployment)."
  );
}

export const supabase = createClient(supabaseUrl || "", supabaseAnonKey || "");

// Every family member's app instance reads and writes this same row,
// which is what makes the ledger shared.
export const LEDGER_ROW_ID = "family-ledger-main";
