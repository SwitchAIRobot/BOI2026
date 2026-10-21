// Fuzzy search. Uses Fuse.js when available; falls back to a small built-in matcher so search never breaks offline.
import { esc, toMin, endMin, startMin, fromMin } from "./util.js";

const FUSE_CDN = "https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.min.js";

export function loadFuse() {
  if (window.Fuse) return Promise.resolve(window.Fuse);
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = FUSE_CDN; s.crossOrigin = "anonymous";
    s.onload = () => resolve(window.Fuse || null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
}

/* ---------- time parsing: "2pm", "2:30", "14:00", "1400", "14:", "2 pm" ---------- */
function parseTimeToken(tok) {
  let m = tok.match(/^(\d{1,2})(?:[:.](\d{2}))?(am|pm)$/i);
  let h, min = null, ap = null;
  if (m) { h = +m[1]; min = m[2] != null ? +m[2] : null; ap = m[3].toLowerCase(); }
  else if ((m = tok.match(/^(\d{1,2})[:.](\d{2})$/))) { h = +m[1]; min = +m[2]; }
  else if ((m = tok.match(/^(\d{1,2})[:.]$/))) { h = +m[1]; }
  else if ((m = tok.match(/^(\d{3,4})$/))) { h = Math.floor(+m[1] / 100); min = +m[1] % 100; }
  else if ((m = tok.match(/^(\d{1,2})$/))) { h = +m[1]; }
  else return null;
  if (h > 23 || (min != null && min > 59)) return null;
  if (ap === "pm" && h < 12) h += 12;
  else if (ap === "am" && h === 12) h = 0;
  else if (!ap && h >= 1 && h <= 8) h += 12;          // festival runs ~10:00 to 20:30, so "2" means 2pm
  const start = h * 60 + (min ?? 0);
  return { start, end: min == null ? start + 60 : start + 1, label: min == null ? fromMin(h * 60) + " hour" : fromMin(start) };
}

const DAY_WORDS = { sat: "Saturday", saturday: "Saturday", sun: "Sunday", sunday: "Sunday" };

export function parseQuery(raw) {
  const q = raw.trim().replace(/(\d)\s+(am|pm)\b/gi, "$1$2");
  let time = null, day = null;
  const rest = [];
  for (const tok of q.split(/\s+/).filter(Boolean)) {
    if (!day && DAY_WORDS[tok.toLowerCase()]) { day = DAY_WORDS[tok.toLowerCase()]; continue; }
    if (!time) { const t = parseTimeToken(tok); if (t) { time = t; continue; } }
    rest.push(tok);
  }
  return { time, day, text: rest.join(" ") };
}

/* ---------- highlight helpers ---------- */
export function highlight(text, ranges = []) {
  if (!ranges.length) return esc(text);
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [s, e] of sorted) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1] + 1) last[1] = Math.max(last[1], e); else merged.push([s, e]);
  }
  let out = "", pos = 0;
  for (const [s, e] of merged) { out += esc(text.slice(pos, s)) + "<mark>" + esc(text.slice(s, e + 1)) + "</mark>"; pos = e + 1; }
  return out + esc(text.slice(pos));
}

/* ---------- fallback matcher (used only if Fuse.js could not load) ---------- */
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function fallbackSearch(items, query) {
  const q = query.toLowerCase();
  const tol = q.length >= 7 ? 2 : q.length >= 4 ? 1 : 0;
  const out = [];
  for (const item of items) {
    const hl = { title: [], theme: [], room: [], speakers: {} };
    let score = Infinity;
    const scan = (text, add, w) => {
      const lower = text.toLowerCase(); let i = lower.indexOf(q);
      if (i >= 0) { add([i, i + q.length - 1]); score = Math.min(score, w); return; }
      let pos = 0;
      for (const word of text.split(/\s+/)) {
        const at = text.indexOf(word, pos); pos = at + word.length;
        const probe = word.toLowerCase().slice(0, q.length + tol);
        if (tol && lev(probe, q) <= tol) { add([at, at + word.length - 1]); score = Math.min(score, w + 0.5); }
      }
    };
    item.speakers.forEach((n, i) => scan(n, (r) => (hl.speakers[i] ??= []).push(r), 0));
    scan(item.room, (r) => hl.room.push(r), 0.1);
    scan(item.title, (r) => hl.title.push(r), 0.3);
    scan(item.theme, (r) => hl.theme.push(r), 0.4);
    if (score < Infinity) out.push({ item, score, hl });
  }
  return out.sort((a, b) => a.score - b.score);
}

/* ---------- main factory ---------- */
export function createSearch(items, Fuse) {
  const fuse = Fuse && new Fuse(items, {
    keys: [{ name: "speakers", weight: 0.4 }, { name: "room", weight: 0.3 }, { name: "title", weight: 0.2 }, { name: "theme", weight: 0.1 }],
    includeScore: true, includeMatches: true, ignoreLocation: true, ignoreFieldNorm: true,
    threshold: 0.32, minMatchCharLength: 2,
  });

  function fuseSearch(text) {
    return fuse.search(text).map((r) => {
      const hl = { title: [], theme: [], room: [], speakers: {} };
      for (const m of r.matches || []) {
        if (m.key === "speakers") (hl.speakers[m.refIndex] ??= []).push(...m.indices);
        else if (hl[m.key]) hl[m.key].push(...m.indices);
      }
      return { item: r.item, score: r.score, hl };
    });
  }

  /** Returns { results: [{item, hl, timeHit}], time, day } */
  return function run(raw) {
    const { time, day, text } = parseQuery(raw);
    if (!text && !time && !day) return { results: [], time, day };

    let results = text
      ? (fuse ? fuseSearch(text) : fallbackSearch(items, text))
      : items.map((item) => ({ item, score: 0, hl: { title: [], theme: [], room: [], speakers: {} } }));

    if (day) results = results.filter((r) => r.item.day === day);
    if (time) results = results.filter((r) => startMin(r.item) < time.end && endMin(r.item) > time.start);
    if (time) results.forEach((r) => (r.timeHit = true));

    if (!text) results.sort((a, b) => a.item.date.localeCompare(b.item.date) || startMin(a.item) - startMin(b.item) || a.item.room.localeCompare(b.item.room));
    return { results, time, day };
  };
}
