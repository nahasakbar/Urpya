// Everything the app reads from and writes to the database.
//
// Each debt, income source, monthly entry and person's settings is its own row
// (see supabase/accounts-setup.sql), so saves are small and two people editing
// different things never overwrite each other. Rows carry a version number: a
// save based on an out-of-date version is refused, and the app reloads instead
// of overwriting someone else's change.
//
// The rest of the app keeps working on the same in-memory shape as before —
// { people, lenders, payments, strategy, incomes, incomeRecords } — which
// `assemble` builds from the rows. `saveChanges` compares a "before" and "after"
// of that shape and writes only what changed; Undo saves back just what one
// save changed (see undoOf in changes.js).
import { supabase, LEDGER_ROW_ID } from "./supabaseClient.js";
import { migrateData } from "./calc.js";
import { same } from "./changes.js";
export { undoOf } from "./changes.js";

export class ConflictError extends Error {}

export function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function check(result) {
  if (result.error) throw result.error;
  return result.data;
}

// Keeps request URLs short when asking for the entries of many items at once.
async function selectIn(table, column, values) {
  const out = [];
  for (let i = 0; i < values.length; i += 80) {
    out.push(...check(await supabase.from(table).select("*").in(column, values.slice(i, i + 80))));
  }
  return out;
}

export async function loadEverything() {
  const [items, shares, settings] = await Promise.all([
    supabase.from("items").select("*").is("deleted_at", null).then(check),
    supabase.from("item_shares").select("*").then(check),
    supabase.from("user_settings").select("*").maybeSingle().then(check),
  ]);
  const entries = items.length ? await selectIn("entries", "item_id", items.map((i) => i.id)) : [];
  return { items, shares, entries, settings };
}

// Items keep the order they were added in (`position`), oldest first.
function byPosition(a, b) {
  const pa = a.data.position ?? Infinity;
  const pb = b.data.position ?? Infinity;
  if (pa !== pb) return pa - pb;
  return String(a.created_at).localeCompare(String(b.created_at));
}

// Builds the app's in-memory shape from rows, plus `meta`: versions and
// ownership/sharing per item, kept apart so the data itself is exactly what
// the calculations expect.
export function assemble({ items, shares, entries, settings }) {
  const lenders = [];
  const incomes = [];
  const payments = {};
  const incomeRecords = {};
  const meta = { items: {}, entries: {}, settingsVersion: settings ? settings.version : null };
  for (const it of [...items].sort(byPosition)) {
    const obj = { ...it.data, id: it.id };
    if (it.kind === "debt") {
      lenders.push(obj);
      payments[it.id] = {};
    } else if (it.kind === "income") {
      incomes.push(obj);
      incomeRecords[it.id] = {};
    } else continue;
    meta.items[it.id] = {
      kind: it.kind,
      version: it.version,
      ownerId: it.owner_id,
      ownerEmail: it.owner_email,
      shares: [],
    };
  }
  for (const s of shares) {
    if (meta.items[s.item_id]) meta.items[s.item_id].shares.push({ email: s.email, role: s.role });
  }
  for (const e of entries) {
    const m = meta.items[e.item_id];
    if (!m) continue;
    (m.kind === "debt" ? payments : incomeRecords)[e.item_id][e.month] = e.data;
    meta.entries[e.item_id + "|" + e.month] = e.version;
  }
  const sd = settings ? settings.data || {} : {};
  const raw = {
    people: sd.people || [],
    lenders,
    payments,
    strategy: sd.strategy || { budget: 0, type: "avalanche" },
    incomes,
    incomeRecords,
  };
  // Fills in defaults for any missing fields in memory only; nothing is written.
  const { data } = migrateData(raw);
  return { data, meta, hasSettings: !!settings };
}

const withoutId = ({ id, ...rest }) => rest;

async function insertItem(kind, obj, meta) {
  const [row] = check(
    await supabase.from("items").insert({ id: obj.id, kind, data: withoutId(obj) }).select("*")
  );
  meta.items[obj.id] = { kind, version: row.version, ownerId: row.owner_id, ownerEmail: row.owner_email, shares: [] };
}

async function updateItem(id, fields, meta) {
  const m = meta.items[id];
  const rows = check(
    await supabase.from("items").update(fields).eq("id", id).eq("version", m.version).select("version")
  );
  if (rows.length === 0) throw new ConflictError("item " + id);
  m.version = rows[0].version;
}

async function saveEntry(itemId, month, entry, meta) {
  const key = itemId + "|" + month;
  const known = meta.entries[key];
  if (known != null) {
    const rows = check(
      await supabase
        .from("entries")
        .update({ data: entry })
        .eq("item_id", itemId)
        .eq("month", month)
        .eq("version", known)
        .select("version")
    );
    if (rows.length === 0) throw new ConflictError("entry " + key);
    meta.entries[key] = rows[0].version;
  } else {
    const res = await supabase.from("entries").insert({ item_id: itemId, month, data: entry }).select("version");
    if (res.error && res.error.code === "23505") throw new ConflictError("entry " + key);
    meta.entries[key] = check(res)[0].version;
  }
}

async function deleteEntry(itemId, month, meta) {
  const key = itemId + "|" + month;
  const rows = check(
    await supabase
      .from("entries")
      .delete()
      .eq("item_id", itemId)
      .eq("month", month)
      .eq("version", meta.entries[key])
      .select("month")
  );
  if (rows.length === 0) throw new ConflictError("entry " + key);
  delete meta.entries[key];
}

// Writes the difference between `prev` and `next`. `deletedIds` remembers items
// deleted earlier in this session, so bringing one back (Undo) restores it
// rather than creating a copy.
export async function saveChanges(prev, next, meta, userId, deletedIds) {
  const removedNow = new Set();
  const groups = [
    ["debt", prev.lenders, next.lenders],
    ["income", prev.incomes || [], next.incomes || []],
  ];
  for (const [kind, before, after] of groups) {
    const b = new Map(before.map((o) => [o.id, o]));
    const a = new Map(after.map((o) => [o.id, o]));
    for (const [id, obj] of a) {
      if (!b.has(id)) {
        if (deletedIds.has(id) && meta.items[id]) {
          await updateItem(id, { deleted_at: null, data: withoutId(obj) }, meta);
          deletedIds.delete(id);
        } else {
          await insertItem(kind, obj, meta);
        }
      } else if (!same(withoutId(b.get(id)), withoutId(obj))) {
        await updateItem(id, { data: withoutId(obj) }, meta);
      }
    }
    for (const id of b.keys()) {
      if (!a.has(id)) {
        // Kept, not erased: it moves to "Recently deleted" with its entries.
        await updateItem(id, { deleted_at: new Date().toISOString() }, meta);
        deletedIds.add(id);
        removedNow.add(id);
      }
    }
  }

  const entryGroups = [
    [prev.payments || {}, next.payments || {}],
    [prev.incomeRecords || {}, next.incomeRecords || {}],
  ];
  for (const [before, after] of entryGroups) {
    for (const itemId of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (removedNow.has(itemId) || !meta.items[itemId]) continue;
      const bm = before[itemId] || {};
      const am = after[itemId] || {};
      for (const month of new Set([...Object.keys(bm), ...Object.keys(am)])) {
        if (!(month in am)) await deleteEntry(itemId, month, meta);
        else if (!(month in bm) || !same(bm[month], am[month])) await saveEntry(itemId, month, am[month], meta);
      }
    }
  }

  const settingsBefore = { people: prev.people, strategy: prev.strategy };
  const settingsAfter = { people: next.people, strategy: next.strategy };
  if (!same(settingsBefore, settingsAfter)) await saveSettings(settingsAfter, meta, userId);
}

export async function saveSettings(settings, meta, userId) {
  if (meta.settingsVersion != null) {
    const rows = check(
      await supabase
        .from("user_settings")
        .update({ data: settings })
        .eq("user_id", userId)
        .eq("version", meta.settingsVersion)
        .select("version")
    );
    if (rows.length === 0) throw new ConflictError("settings");
    meta.settingsVersion = rows[0].version;
  } else {
    const res = await supabase.from("user_settings").insert({ data: settings }).select("version");
    if (res.error && res.error.code === "23505") throw new ConflictError("settings");
    meta.settingsVersion = check(res)[0].version;
  }
}

// ---- Sharing ----
export async function addShare(itemId, email, role) {
  check(await supabase.from("item_shares").insert({ item_id: itemId, email: email.trim().toLowerCase(), role }));
}
export async function removeShare(itemId, email) {
  check(await supabase.from("item_shares").delete().eq("item_id", itemId).eq("email", email));
}

// ---- Recently deleted and history ----
export async function loadDeleted() {
  return check(
    await supabase.from("items").select("*").not("deleted_at", "is", null).order("deleted_at", { ascending: false })
  );
}
export async function restoreItem(id, version) {
  const rows = check(
    await supabase.from("items").update({ deleted_at: null }).eq("id", id).eq("version", version).select("version")
  );
  if (rows.length === 0) throw new ConflictError("item " + id);
}
export async function loadHistory(limit = 60) {
  return check(await supabase.from("history").select("*").order("changed_at", { ascending: false }).limit(limit));
}

// ---- The old shared family ledger ----

// The old single-row ledger, if it can still be read (it can't once
// lock-old-ledger.sql has been run): { ledger, importedBy } — importedBy is who
// has already imported it, so nobody else makes a duplicate copy.
export async function readOldLedger() {
  const res = await supabase.from("ledger").select("payload").eq("id", LEDGER_ROW_ID).maybeSingle();
  if (res.error || !res.data || !res.data.payload) return null;
  const payload = res.data.payload;
  return { ledger: migrateData(payload).data, importedBy: payload.importedBy || null };
}

// Notes on the old row who imported it (only adds these two fields; the data
// itself isn't changed). Best-effort: the import has already succeeded.
export async function markOldLedgerImported(email) {
  const res = await supabase.from("ledger").select("payload").eq("id", LEDGER_ROW_ID).maybeSingle();
  if (res.error || !res.data) return;
  await supabase
    .from("ledger")
    .update({ payload: { ...res.data.payload, importedBy: email, importedAt: new Date().toISOString() } })
    .eq("id", LEDGER_ROW_ID);
}

// Copies the old ledger into the signed-in person's account: every debt and
// income source becomes an item they own (with a fresh id), every month becomes
// an entry, and contributor names + Strategy go into their settings. The old
// data itself isn't changed.
export async function importOldLedger(old, meta, userId) {
  const idMap = {};
  const itemRows = [];
  (old.lenders || []).forEach((l, i) => {
    idMap[l.id] = newId();
    itemRows.push({ id: idMap[l.id], kind: "debt", data: { ...withoutId(l), position: i } });
  });
  (old.incomes || []).forEach((s, i) => {
    idMap[s.id] = newId();
    itemRows.push({ id: idMap[s.id], kind: "income", data: { ...withoutId(s), position: 1000 + i } });
  });
  if (itemRows.length) check(await supabase.from("items").insert(itemRows));

  const entryRows = [];
  for (const [store, byItem] of [["payments", old.payments || {}], ["incomeRecords", old.incomeRecords || {}]]) {
    for (const [oldId, months] of Object.entries(byItem)) {
      if (!idMap[oldId]) continue;
      for (const [month, entry] of Object.entries(months || {})) {
        entryRows.push({ item_id: idMap[oldId], month, data: entry });
      }
    }
  }
  for (let i = 0; i < entryRows.length; i += 200) check(await supabase.from("entries").insert(entryRows.slice(i, i + 200)));

  const strategy = { ...(old.strategy || { budget: 0, type: "avalanche" }) };
  if (Array.isArray(strategy.budgetParts)) {
    strategy.budgetParts = strategy.budgetParts
      .filter((p) => p.kind !== "income" || idMap[p.incomeId])
      .map((p) => (p.kind === "income" ? { ...p, incomeId: idMap[p.incomeId] } : p));
  }
  await saveSettings({ people: old.people || [], strategy }, meta, userId);
  return { debts: old.lenders.length, incomes: (old.incomes || []).length, entries: entryRows.length };
}

// Live updates: calls `onChange` when anything the person can see changes.
export function subscribe(onChange) {
  const channel = supabase.channel("ledger-live");
  for (const table of ["items", "entries", "item_shares", "user_settings"]) {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, onChange);
  }
  channel.subscribe();
  return () => supabase.removeChannel(channel);
}
