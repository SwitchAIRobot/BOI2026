export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
export const fromMin = (n) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

/** End time in minutes. Sessions with no end time are treated as 60 minutes long. */
export const endMin = (s) => (s.endTime ? toMin(s.endTime) : toMin(s.startTime) + 60);
export const startMin = (s) => toMin(s.startTime);
export const timeText = (s) => (s.endTime ? `${s.startTime}–${s.endTime}` : `${s.startTime} onwards`);

export const overlaps = (a, b) => a.date === b.date && startMin(a) < endMin(b) && startMin(b) < endMin(a);

const dayFmt = (date, opts) => new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", opts);
export const dayLong = (date) => dayFmt(date, { weekday: "long", day: "numeric", month: "long" });
export const dayShort = (date) => dayFmt(date, { weekday: "short", day: "numeric", month: "short" });

export const speakerLine = (s) => s.speakers.map((n) => (s.speakerRoles?.[n] ? `${n} (${s.speakerRoles[n]})` : n)).join(", ");

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
