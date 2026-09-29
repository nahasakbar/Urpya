// Pure helpers for comparing and undoing changes to the app's data (no
// database here, so they can be tested on their own).

export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// What Undo should save: the current data with only the things one save changed
// (from `prev` to `next`) put back — so an Undo never also reverses a change
// someone else made in the meantime.
export function undoOf(prev, next, current) {
  const out = { ...current };
  for (const key of ["lenders", "incomes"]) {
    const before = new Map((prev[key] || []).map((o) => [o.id, o]));
    const after = new Map((next[key] || []).map((o) => [o.id, o]));
    const list = [...(current[key] || [])];
    for (const id of new Set([...before.keys(), ...after.keys()])) {
      if (same(before.get(id), after.get(id))) continue;
      const at = list.findIndex((o) => o.id === id);
      if (!before.has(id)) {
        if (at >= 0) list.splice(at, 1);
      } else if (at >= 0) {
        list[at] = before.get(id);
      } else {
        const originalAt = (prev[key] || []).findIndex((o) => o.id === id);
        list.splice(Math.min(originalAt, list.length), 0, before.get(id));
      }
    }
    out[key] = list;
  }
  for (const key of ["payments", "incomeRecords"]) {
    const result = { ...(current[key] || {}) };
    const pk = prev[key] || {};
    const nk = next[key] || {};
    for (const itemId of new Set([...Object.keys(pk), ...Object.keys(nk)])) {
      const pm = pk[itemId] || {};
      const nm = nk[itemId] || {};
      for (const month of new Set([...Object.keys(pm), ...Object.keys(nm)])) {
        if (same(pm[month], nm[month])) continue;
        const months = { ...(result[itemId] || {}) };
        if (pm[month] === undefined) delete months[month];
        else months[month] = pm[month];
        result[itemId] = months;
      }
    }
    out[key] = result;
  }
  for (const key of ["people", "strategy", "currency"]) {
    if (!same(prev[key], next[key])) out[key] = prev[key];
  }
  return out;
}
