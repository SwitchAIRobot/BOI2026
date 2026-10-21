// Lucky dip: for each festival day, randomly pick sessions that never overlap each other
// (or anything already in My Calendar), trying many random orders and keeping the fullest day.
import { overlaps } from "./util.js";

const SKIP_THEMES = new Set(["Welcome address", "End address", "Drinks"]);   // addresses and parties, not talks
const TRIES = 80;

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** @param all every session  @param existing sessions already in My Calendar  @param days list of ISO dates */
export function luckyDip(all, existing, days) {
  const picks = [];
  for (const date of days) {
    const fixed = existing.filter((s) => s.date === date);
    const pool = all.filter((s) => s.date === date && !SKIP_THEMES.has(s.theme) && s.room !== "Location TBC" && !existing.some((e) => e.id === s.id));
    let best = [];
    for (let t = 0; t < TRIES; t++) {
      const chosen = [...fixed], added = [], themes = new Set(fixed.map((s) => s.theme));
      const order = shuffle(pool);
      for (const pass of [0, 1]) {            // pass 0 prefers a new theme each time; pass 1 fills any gaps left
        for (const s of order) {
          if (added.includes(s) || (pass === 0 && themes.has(s.theme)) || chosen.some((c) => overlaps(c, s))) continue;
          chosen.push(s); added.push(s); themes.add(s.theme);
        }
      }
      if (added.length >= best.length) best = added;
    }
    picks.push(...best);
  }
  return picks;
}
