-- ===================================================================
-- Ledger: accounts, sharing and history
-- Run once in Supabase → SQL Editor → New query → paste → Run.
-- Safe to run again. It doesn't touch the old "ledger" table; the app
-- reads that once to import it, and lock-old-ledger.sql closes it after.
-- ===================================================================

-- The signed-in person's email, lower-cased, from their login token.
create or replace function public.current_email() returns text
language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

-- ---- Tables --------------------------------------------------------

-- A debt or an income source (expenses later). Its fields live in `data`,
-- in the same shape the app's calculations use.
create table if not exists public.items (
  id text primary key default gen_random_uuid()::text,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  owner_email text not null default public.current_email(),
  kind text not null check (kind in ('debt', 'income', 'expense')),
  data jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_email text
);

-- Who else can see an item. Invites are by email, so they work before the
-- other person has signed in for the first time.
create table if not exists public.item_shares (
  item_id text not null references public.items(id) on delete cascade,
  email text not null check (email = lower(email) and email like '%@%'),
  role text not null default 'editor' check (role in ('editor', 'viewer')),
  invited_by_email text not null default public.current_email(),
  created_at timestamptz not null default now(),
  primary key (item_id, email)
);

-- One month of an item: a debt's payments ({ amounts: { name: ₹ } }) or an
-- income source's figures ({ income, expenses }). Saved one row at a time,
-- so two people recording different months never overwrite each other.
create table if not exists public.entries (
  item_id text not null references public.items(id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by_email text,
  primary key (item_id, month)
);

-- Each person's own settings: contributor names and their Strategy
-- (budget, its parts, goal).
create table if not exists public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

-- Every change, with who made it and what it was before and after. Powers
-- the Activity list, Undo and restoring. Only the database writes here.
create table if not exists public.history (
  id bigint generated always as identity primary key,
  item_id text,
  table_name text not null,
  month text,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  changed_by_email text,
  changed_at timestamptz not null default now()
);
create index if not exists history_item_idx on public.history (item_id, changed_at desc);
create index if not exists history_email_idx on public.history (changed_by_email, changed_at desc);
create index if not exists item_shares_email_idx on public.item_shares (email);

-- ---- Who can see and change what ------------------------------------
-- These run with the table owner's rights so the access rules below can
-- look across tables without tripping over each other.

create or replace function public.is_shared_with_me(p_item text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from item_shares s where s.item_id = p_item and s.email = current_email())
$$;

create or replace function public.owns_item(p_item text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from items i where i.id = p_item and i.owner_id = auth.uid())
$$;

create or replace function public.can_see_item(p_item text) returns boolean
language sql stable security definer set search_path = public as $$
  select owns_item(p_item) or is_shared_with_me(p_item)
$$;

create or replace function public.can_edit_item(p_item text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from items i
    where i.id = p_item and i.deleted_at is null
      and (i.owner_id = auth.uid()
           or exists (select 1 from item_shares s
                      where s.item_id = i.id and s.email = current_email() and s.role = 'editor'))
  )
$$;

alter table public.items enable row level security;
alter table public.item_shares enable row level security;
alter table public.entries enable row level security;
alter table public.user_settings enable row level security;
alter table public.history enable row level security;

-- Items: yours, plus live items shared with you. Only you can add items as
-- yourself; editors can change them; only the owner deletes.
drop policy if exists items_select on public.items;
create policy items_select on public.items for select to authenticated
  using (owner_id = auth.uid() or (deleted_at is null and public.is_shared_with_me(id)));
drop policy if exists items_insert on public.items;
create policy items_insert on public.items for insert to authenticated
  with check (owner_id = auth.uid());
drop policy if exists items_update on public.items;
create policy items_update on public.items for update to authenticated
  using (owner_id = auth.uid() or public.can_edit_item(id))
  with check (owner_id = auth.uid() or public.can_edit_item(id));
drop policy if exists items_delete on public.items;
create policy items_delete on public.items for delete to authenticated
  using (owner_id = auth.uid());

-- Shares: visible to everyone on the item; only the owner adds or changes
-- them; anyone can take themselves off an item shared with them.
drop policy if exists shares_select on public.item_shares;
create policy shares_select on public.item_shares for select to authenticated
  using (public.can_see_item(item_id));
drop policy if exists shares_insert on public.item_shares;
create policy shares_insert on public.item_shares for insert to authenticated
  with check (public.owns_item(item_id) and email <> public.current_email());
drop policy if exists shares_update on public.item_shares;
create policy shares_update on public.item_shares for update to authenticated
  using (public.owns_item(item_id)) with check (public.owns_item(item_id));
drop policy if exists shares_delete on public.item_shares;
create policy shares_delete on public.item_shares for delete to authenticated
  using (public.owns_item(item_id) or email = public.current_email());

-- Monthly entries: follow their item.
drop policy if exists entries_select on public.entries;
create policy entries_select on public.entries for select to authenticated
  using (public.can_see_item(item_id));
drop policy if exists entries_insert on public.entries;
create policy entries_insert on public.entries for insert to authenticated
  with check (public.can_edit_item(item_id));
drop policy if exists entries_update on public.entries;
create policy entries_update on public.entries for update to authenticated
  using (public.can_edit_item(item_id)) with check (public.can_edit_item(item_id));
drop policy if exists entries_delete on public.entries;
create policy entries_delete on public.entries for delete to authenticated
  using (public.can_edit_item(item_id));

-- Settings: your own only.
drop policy if exists settings_own on public.user_settings;
create policy settings_own on public.user_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- History: for items you can see, and your own settings changes.
drop policy if exists history_select on public.history;
create policy history_select on public.history for select to authenticated
  using ((item_id is not null and public.can_see_item(item_id))
         or (table_name = 'user_settings' and changed_by_email = public.current_email()));

-- Nothing for signed-out visitors; only what the rules above allow for
-- signed-in people.
revoke all on public.items, public.item_shares, public.entries, public.user_settings, public.history from anon;
grant select, insert, update, delete on public.items, public.item_shares, public.entries, public.user_settings to authenticated;
grant select on public.history to authenticated;

-- ---- Automatic bookkeeping -----------------------------------------

-- Items: stamp the owner, count versions (so two people saving at once
-- can't silently overwrite each other), and guard ownership and deleting.
create or replace function public.items_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.owner_id := coalesce(auth.uid(), new.owner_id);
    new.owner_email := coalesce(nullif(current_email(), ''), new.owner_email);
    new.version := 1;
    new.created_at := now();
  else
    if new.owner_id is distinct from old.owner_id or new.owner_email is distinct from old.owner_email then
      raise exception 'The owner of an item can''t be changed';
    end if;
    if new.deleted_at is distinct from old.deleted_at and auth.uid() is distinct from old.owner_id
       and auth.uid() is not null then
      raise exception 'Only the owner can delete or restore this';
    end if;
    new.version := old.version + 1;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  new.updated_by_email := nullif(current_email(), '');
  return new;
end $$;
drop trigger if exists items_before_write on public.items;
create trigger items_before_write before insert or update on public.items
  for each row execute function public.items_before_write();

create or replace function public.entries_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.version := 1; else new.version := old.version + 1; end if;
  new.updated_at := now();
  new.updated_by_email := nullif(current_email(), '');
  return new;
end $$;
drop trigger if exists entries_before_write on public.entries;
create trigger entries_before_write before insert or update on public.entries
  for each row execute function public.entries_before_write();

create or replace function public.settings_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.version := 1; else new.version := old.version + 1; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists settings_before_write on public.user_settings;
create trigger settings_before_write before insert or update on public.user_settings
  for each row execute function public.settings_before_write();

-- History: one row per change, with the before and after.
create or replace function public.log_history() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_item text;
  v_month text;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  if tg_table_name = 'items' then
    v_item := r.id;
  elsif tg_table_name in ('entries', 'item_shares') then
    v_item := r.item_id;
  end if;
  if tg_table_name = 'entries' then v_month := r.month; end if;
  insert into history (item_id, table_name, month, action, old_data, new_data, changed_by_email)
  values (v_item, tg_table_name, v_month, lower(tg_op),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end,
          nullif(current_email(), ''));
  return null;
end $$;
drop trigger if exists items_history on public.items;
create trigger items_history after insert or update or delete on public.items
  for each row execute function public.log_history();
drop trigger if exists entries_history on public.entries;
create trigger entries_history after insert or update or delete on public.entries
  for each row execute function public.log_history();
drop trigger if exists shares_history on public.item_shares;
create trigger shares_history after insert or update or delete on public.item_shares
  for each row execute function public.log_history();
drop trigger if exists settings_history on public.user_settings;
create trigger settings_history after insert or update on public.user_settings
  for each row execute function public.log_history();

-- ---- Account tools ---------------------------------------------------

-- The currency of each item shared with you (its owner's choice), so its
-- amounts show in the right currency. Accounts that never chose one are in
-- rupees. Reveals nothing else about the owner's settings.
create or replace function public.shared_item_currencies()
returns table (item_id text, currency text)
language sql stable security definer set search_path = public as $$
  select i.id, coalesce(us.data ->> 'currency', 'INR')
  from items i
  join item_shares s on s.item_id = i.id and s.email = current_email()
  left join user_settings us on us.user_id = i.owner_id
  where i.deleted_at is null
$$;
revoke execute on function public.shared_item_currencies() from public, anon;
grant execute on function public.shared_item_currencies() to authenticated;

-- "Delete my account": removes everything the signed-in person owns (their
-- items with every month, share and history row, and their settings), takes
-- them off items others shared with them, and deletes their sign-in. All or
-- nothing: if any step fails, nothing is removed.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email text := current_email();
  v_items text[];
begin
  if v_uid is null then
    raise exception 'Not signed in';
  end if;
  select coalesce(array_agg(id), '{}') into v_items from items where owner_id = v_uid;
  delete from item_shares where email = v_email and v_email <> '';
  delete from items where owner_id = v_uid;
  delete from user_settings where user_id = v_uid;
  delete from history
   where item_id = any (v_items)
      or (table_name = 'user_settings' and changed_by_email = v_email and v_email <> '');
  delete from auth.users where id = v_uid;
end $$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---- Live updates ----------------------------------------------------
-- Everyone on a shared item sees changes within a second or two.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['items', 'entries', 'item_shares', 'user_settings'] loop
      if not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
