// Builds an .ics calendar file of due dates, so reminders come from the phone's
// own Calendar app (an alert at 9 am the day before), with no server needed.
//
// events: [{ uid, title, day, fromKey }]  — every month on `day` from month `fromKey`
//     or  [{ uid, title, date: "YYYY-MM-DD" }] — once.
// A day past the end of a short month falls on that month's last day.

const pad = (n) => String(n).padStart(2, "0");

function escapeText(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// Long lines are folded at 75 characters, as the calendar format requires.
function fold(line) {
  const out = [];
  let rest = line;
  while (rest.length > 75) {
    out.push(rest.slice(0, 75));
    rest = " " + rest.slice(75);
  }
  out.push(rest);
  return out.join("\r\n");
}

function daysInMonth(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function stamp(d) {
  return (
    d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + "T" +
    pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + "Z"
  );
}

export function buildCalendar(events, now = new Date()) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Ledger//Due dates//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Ledger due dates"];
  for (const ev of events) {
    let start;
    let rule = null;
    if (ev.date) {
      start = ev.date.replace(/-/g, "");
    } else {
      const day = Math.min(ev.day, daysInMonth(ev.fromKey));
      start = ev.fromKey.replace("-", "") + pad(day);
      if (ev.day <= 28) {
        rule = `RRULE:FREQ=MONTHLY;BYMONTHDAY=${ev.day}`;
      } else {
        const days = [];
        for (let d = 28; d <= ev.day; d++) days.push(d);
        rule = `RRULE:FREQ=MONTHLY;BYMONTHDAY=${days.join(",")};BYSETPOS=-1`;
      }
    }
    lines.push(
      "BEGIN:VEVENT",
      `UID:${ev.uid}`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${start}`,
      ...(rule ? [rule] : []),
      `SUMMARY:${escapeText(ev.title)}`,
      ...(ev.description ? [`DESCRIPTION:${escapeText(ev.description)}`] : []),
      "TRANSP:TRANSPARENT",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeText(ev.title)}`,
      "TRIGGER:-PT15H",
      "END:VALARM",
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
