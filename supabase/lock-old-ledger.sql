-- ===================================================================
-- Lock the old shared "ledger" row.
-- Run this AFTER you've signed in to the new app, imported the family
-- ledger and checked everything came across. It removes the rules that
-- let anyone with the app's link read or change the old data. The data
-- itself stays in the table as a backup, visible only here in Supabase.
-- ===================================================================
drop policy if exists "Allow anon read" on public.ledger;
drop policy if exists "Allow anon insert" on public.ledger;
drop policy if exists "Allow anon update" on public.ledger;
alter table public.ledger enable row level security;
revoke all on public.ledger from anon, authenticated;
