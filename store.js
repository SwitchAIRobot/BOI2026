// All user data lives in this browser's localStorage. Nothing is sent anywhere.
const CAL_KEY = "boi2026.calendar.v1";
const LUCKY_KEY = "boi2026.lucky.v1";
const PREF_KEY = "boi2026.prefs.v1";

const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode or full: keep working in memory */ } };

const ids = new Set(read(CAL_KEY, []));
const lucky = new Set(read(LUCKY_KEY, []).filter((id) => ids.has(id)));   // sessions added by the lucky dip
const save = () => { write(CAL_KEY, [...ids]); write(LUCKY_KEY, [...lucky]); };

export const calendar = {
  has: (id) => ids.has(id),
  all: () => [...ids],
  size: () => ids.size,
  isLucky: (id) => lucky.has(id),
  hasLucky: () => lucky.size > 0,
  toggle(id) {
    if (ids.has(id)) { ids.delete(id); lucky.delete(id); } else ids.add(id);
    save();
    return ids.has(id);
  },
  addLucky(list) { list.forEach((id) => { ids.add(id); lucky.add(id); }); save(); },
  removeLucky() { lucky.forEach((id) => ids.delete(id)); lucky.clear(); save(); },
  clear() { ids.clear(); lucky.clear(); save(); },
};

export const prefs = {
  get: (key, fallback) => read(PREF_KEY, {})[key] ?? fallback,
  set(key, value) { const all = read(PREF_KEY, {}); all[key] = value; write(PREF_KEY, all); },
};
