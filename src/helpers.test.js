import { describe, it, expect } from "vitest";
import { buildCalendar } from "./calendar.js";
import { describeChange, timeAgo } from "./activity.js";

describe("calendar reminders", () => {
  const now = new Date(Date.UTC(2026, 8, 29, 10, 0, 0));

  it("repeats monthly on the due day, with an alert the day before at 9 am", () => {
    const ics = buildCalendar([{ uid: "d1@ledger", title: "PNB Housing: ₹15,000 due", day: 5, fromKey: "2026-10" }], now);
    expect(ics).toContain("BEGIN:VCALENDAR\r\n");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261005");
    expect(ics).toContain("RRULE:FREQ=MONTHLY;BYMONTHDAY=5");
    expect(ics).toContain("TRIGGER:-PT15H");
    expect(ics).toContain("DTSTAMP:20260929T100000Z");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("falls on the last day of short months for a day after the 28th", () => {
    const ics = buildCalendar([{ uid: "x", title: "Due", day: 31, fromKey: "2026-09" }], now);
    expect(ics).toContain("DTSTART;VALUE=DATE:20260930");
    expect(ics).toContain("RRULE:FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1");
  });

  it("adds one-off dates, escapes commas and folds long lines", () => {
    const ics = buildCalendar([{ uid: "p", title: "Moneylender, month 3: ₹15,833 due " + "x".repeat(80), date: "2026-12-05" }], now);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261205");
    expect(ics).not.toContain("RRULE");
    expect(ics).toContain("Moneylender\\, month 3");
    for (const line of ics.split("\r\n")) expect(line.length).toBeLessThanOrEqual(75);
  });
});

describe("activity sentences", () => {
  const now = new Date("2026-09-29T12:00:00Z");
  const base = { changed_at: "2026-09-29T11:58:00Z", changed_by_email: "riyas@example.com" };

  it("describes payments, edits, deletes and shares", () => {
    const names = { d1: "PNB Housing" };
    const opts = { myEmail: "nahas@example.com", names, now };
    expect(describeChange({ ...base, table_name: "entries", action: "insert", item_id: "d1", month: "2026-09", new_data: { data: { amounts: { Riyas: 10000, Nahas: 5000 } } } }, opts))
      .toEqual({ who: "riyas@example.com", text: "recorded ₹15,000 for “PNB Housing” · Sept 2026", when: "2 min ago" });
    expect(describeChange({ ...base, changed_by_email: "nahas@example.com", table_name: "items", action: "update", item_id: "d1", old_data: { deleted_at: null, data: { name: "PNB Housing" } }, new_data: { deleted_at: "2026-09-29", data: { name: "PNB Housing" } } }, opts).text)
      .toBe("deleted “PNB Housing”");
    expect(describeChange({ ...base, changed_by_email: "nahas@example.com", table_name: "items", action: "update", item_id: "d1", old_data: { deleted_at: null, data: { name: "PNB Housing" } }, new_data: { deleted_at: null, data: { name: "PNB Housing" } } }, opts).who)
      .toBe("You");
    expect(describeChange({ ...base, changed_by_email: "nahas@example.com", table_name: "item_shares", action: "insert", item_id: "d1", new_data: { email: "uppa@example.com", role: "viewer" } }, opts).text)
      .toBe("shared “PNB Housing” with uppa@example.com (view only)");
    expect(describeChange({ ...base, table_name: "item_shares", action: "delete", item_id: "d1", old_data: { email: "riyas@example.com" } }, opts).text)
      .toBe("left “PNB Housing”");
    expect(describeChange({ ...base, table_name: "entries", action: "insert", item_id: "i1", month: "2026-09", new_data: { data: { income: 30000, expenses: 40000 } } }, { now }).text)
      .toBe("recorded Sept 2026 for “an item” (₹10,000 loss)");
    expect(describeChange({ ...base, changed_by_email: "nahas@example.com", table_name: "user_settings", action: "update" }, opts).text)
      .toBe("updated your budget and settings");
    expect(describeChange({ ...base, table_name: "user_settings", action: "update" }, opts).text)
      .toBe("updated their budget and settings");
  });

  it("shows an item's amounts in its own currency when asked", () => {
    const h = { ...base, table_name: "entries", action: "insert", item_id: "r1", month: "2026-09", new_data: { data: { amounts: { Riyas: 900 } } } };
    expect(describeChange(h, { now, names: { r1: "Car loan" }, currencyOf: () => "AED" }).text).toBe("recorded AED 900 for “Car loan” · Sept 2026");
    expect(describeChange(h, { now, names: { r1: "Car loan" } }).text).toBe("recorded ₹900 for “Car loan” · Sept 2026");
  });

  it("says roughly when", () => {
    expect(timeAgo("2026-09-29T11:59:50Z", now)).toBe("just now");
    expect(timeAgo("2026-09-29T09:00:00Z", now)).toBe("3 hr ago");
    expect(timeAgo("2026-09-28T09:00:00Z", now)).toBe("yesterday");
  });
});
