import { toMin, fromMin, endMin, speakerLine } from "./util.js";

const esc = (t) => String(t ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const fold = (line) => { const out = []; while (line.length > 73) { out.push(line.slice(0, 73)); line = " " + line.slice(73); } out.push(line); return out.join("\r\n"); };
const stamp = (date, mins) => `${date.replaceAll("-", "")}T${fromMin(mins).replace(":", "")}00`;
const utcNow = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

const TZ = [
  "BEGIN:VTIMEZONE", "TZID:Europe/London",
  "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0000", "TZOFFSETTO:+0100", "TZNAME:BST", "DTSTART:19700329T010000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
  "BEGIN:STANDARD", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0000", "TZNAME:GMT", "DTSTART:19701025T020000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
  "END:VTIMEZONE",
];

export function buildICS(sessions) {
  const now = utcNow();
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Battle of Ideas 2026 app//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Battle of Ideas 2026", ...TZ];
  for (const s of sessions) {
    const where = [s.room, s.venue, s.floor].filter(Boolean).join(", ");
    const desc = [s.theme, speakerLine(s) && `With ${speakerLine(s)}`].filter(Boolean).join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${s.id}@battle-of-ideas-2026`,
      `DTSTAMP:${now}`,
      `DTSTART;TZID=Europe/London:${stamp(s.date, toMin(s.startTime))}`,
      `DTEND;TZID=Europe/London:${stamp(s.date, endMin(s))}`,
      `SUMMARY:${esc(s.title)}`,
      `LOCATION:${esc(where)}`,
      `DESCRIPTION:${esc(desc)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function downloadICS(sessions) {
  const blob = new Blob([buildICS(sessions)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: "battle-of-ideas-2026.ics" });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
