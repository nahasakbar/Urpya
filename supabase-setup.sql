-- Run this once in your Supabase project's SQL Editor
-- (Dashboard → SQL Editor → New query → paste this → Run)

create table if not exists ledger (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

-- Keep updated_at current on every save
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists ledger_set_updated_at on ledger;
create trigger ledger_set_updated_at
  before update on ledger
  for each row execute procedure set_updated_at();

-- Row Level Security: this app has no login system, so it uses the
-- public "anon" key for everyone in the family. That means anyone who
-- has your app's link AND inspects its files could read/write this
-- table. That's an acceptable trade-off for a private family tool,
-- but don't use this table for anything more sensitive than what's
-- already in the ledger.
alter table ledger enable row level security;

drop policy if exists "Allow anon read" on ledger;
create policy "Allow anon read" on ledger for select using (true);

drop policy if exists "Allow anon insert" on ledger;
create policy "Allow anon insert" on ledger for insert with check (true);

drop policy if exists "Allow anon update" on ledger;
create policy "Allow anon update" on ledger for update using (true);

-- Enable realtime updates on this table so every family member's app
-- picks up changes live. This adds the table to Supabase's built-in
-- "supabase_realtime" publication (the underlying thing the dashboard's
-- Database → Publications toggle controls) — running it here is more
-- reliable than hunting for the toggle, since its exact location has
-- moved around between Supabase dashboard versions.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ledger'
  ) then
    alter publication supabase_realtime add table ledger;
  end if;
end $$;
