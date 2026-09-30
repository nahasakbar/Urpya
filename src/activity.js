// Turns rows from the database's history table into plain sentences for the
// Activity list, e.g. "Riyas recorded ₹15,000 for PNB Housing · Sept 2026".
import { fmt, fmtIn, monthKeyShort } from "./calc.js";

export function timeAgo(when, now = new Date()) {
  const secs = Math.max(0, (now - new Date(when)) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} hr ago`;
  if (secs < 172800) return "yesterday";
  return new Date(when).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function totalOf(entry) {
  if (!entry) return 0;
  if (entry.amounts) return Object.values(entry.amounts).reduce((s, v) => s + (Number(v) || 0), 0);
  return (Number(entry.income) || 0) - (Number(entry.expenses) || 0);
}

// `names` maps item id → name, for changes to entries and shares (whose rows
// don't carry the item's name); `currencyOf(itemId)` gives an item's currency
// when it may differ from yours; `nameOf(email)` turns an email into a person's
// name where one is known. Returns { who, text, when }.
export function describeChange(h, { myEmail, names = {}, now = new Date(), currencyOf = null, nameOf = (e) => e } = {}) {
  const fmt$ = (n) => (currencyOf && h.item_id ? fmtIn(n, currencyOf(h.item_id)) : fmt(n));
  const who = !h.changed_by_email ? "Someone" : h.changed_by_email === myEmail ? "You" : h.changed_by_email;
  const itemData = (h.new_data && h.new_data.data) || (h.old_data && h.old_data.data) || null;
  const name = (h.table_name === "items" && itemData && itemData.name) || names[h.item_id] || "an item";
  const q = `“${name}”`;
  let text;

  if (h.table_name === "items") {
    const wasDeleted = h.old_data && h.old_data.deleted_at;
    const isDeleted = h.new_data && h.new_data.deleted_at;
    if (h.action === "insert") text = `added ${q}`;
    else if (h.action === "delete") text = `permanently deleted ${q}`;
    else if (!wasDeleted && isDeleted) text = `deleted ${q}`;
    else if (wasDeleted && !isDeleted) text = `restored ${q}`;
    else text = `edited ${q}`;
  } else if (h.table_name === "entries") {
    const entry = (h.new_data && h.new_data.data) || (h.old_data && h.old_data.data);
    const month = h.month ? monthKeyShort(h.month) : "a month";
    const isIncome = entry && !entry.amounts;
    if (h.action === "delete") text = `removed the ${month} entry for ${q}`;
    else if (isIncome) {
      const p = totalOf(entry);
      text = `recorded ${month} for ${q} (${p < 0 ? `${fmt$(-p)} loss` : `${fmt$(p)} profit`})`;
    } else if (h.action === "update") text = `changed the ${month} payment for ${q} to ${fmt$(totalOf(entry))}`;
    else text = `recorded ${fmt$(totalOf(entry))} for ${q} · ${month}`;
  } else if (h.table_name === "item_shares") {
    const share = h.new_data || h.old_data || {};
    const them = nameOf(share.email);
    if (h.action === "delete") text = share.email === h.changed_by_email ? `left ${q}` : `stopped sharing ${q} with ${them}`;
    else if (h.action === "update") text = `changed ${them}'s access to ${q}`;
    else text = `shared ${q} with ${them}${share.role === "viewer" ? " (view only)" : ""}`;
  } else {
    text = who === "You" ? "updated your budget and settings" : "updated their budget and settings";
  }
  return { who, text, when: timeAgo(h.changed_at, now) };
}
