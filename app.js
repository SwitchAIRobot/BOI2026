import { calendar, prefs } from "./store.js";
import { createSearch, loadFuse, highlight } from "./search.js";
import { downloadICS } from "./ics.js";
import { luckyDip } from "./lucky.js";
import { esc, toMin, fromMin, startMin, endMin, timeText, overlaps, dayLong, dayShort, speakerLine, todayISO } from "./util.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const MINUS = "\u2212";
const ROW_MIN = 15;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const state = {
  sessions: [], byId: new Map(), days: [], rooms: [], roomMap: new Map(), plan: null, info: [],
  tab: "timetable", date: null, query: "", selectedRoom: null, zoom: false, search: null,
};

/* ------------------------------------------------------------------ boot */
async function boot() {
  const view = $("#view");
  view.innerHTML = `<div class="page"><p>Loading the programme…</p></div>`;
  try {
    const [sessions, roomsJson] = await Promise.all([
      fetch("timetable.json").then((r) => { if (!r.ok) throw new Error("timetable"); return r.json(); }),
      fetch("rooms.json").then((r) => { if (!r.ok) throw new Error("rooms"); return r.json(); }),
    ]);
    setup(sessions, roomsJson);
  } catch (err) {
    view.innerHTML = `<div class="page"><div class="empty"><p><strong>The programme could not be loaded.</strong> Check your connection, then try again.</p><button class="btn" id="retry" type="button">Try again</button></div></div>`;
    $("#retry").onclick = boot;
    return;
  }
  const Fuse = await loadFuse();
  state.search = createSearch(state.sessions, Fuse);
  if (state.query) render();
}

function setup(sessions, roomsJson) {
  state.sessions = sessions;
  state.byId = new Map(sessions.map((s) => [s.id, s]));
  state.days = [...new Set(sessions.map((s) => s.date))].sort();
  state.plan = roomsJson.plan;
  state.info = roomsJson.info || [];

  const order = roomsJson.rooms.map((r) => r.name);
  state.roomMap = new Map(roomsJson.rooms.map((r) => [r.name, r]));
  for (const s of sessions) {      // rooms used in the timetable but missing from rooms.json still work
    if (!state.roomMap.has(s.room)) {
      state.roomMap.set(s.room, { name: s.room, venue: s.venue, floor: s.floor || "", x: null, y: null, directions: "Directions not added yet. Edit rooms.json." });
      order.push(s.room);
    }
  }
  state.rooms = order.map((n) => state.roomMap.get(n));

  const first = state.days[0], last = state.days[state.days.length - 1];
  const range = first === last ? dayLong(first) : `${new Date(`${first}T12:00:00`).getDate()} and ${dayLong(last).replace(/^\w+ /, "")}`;
  $("#subtitle").textContent = `${range}, Church House, Westminster`;

  const today = todayISO();
  state.date = state.days.includes(today) ? today : (state.days.includes(prefs.get("date")) ? prefs.get("date") : state.days[0]);
  const fromHash = location.hash.replace("#", "");
  state.tab = ["timetable", "calendar", "search", "rooms"].includes(fromHash) ? fromHash : "timetable";
  render();
}

/* -------------------------------------------------------- shared helpers */
function toggleBtn(s, extra = "") {
  const on = calendar.has(s.id);
  return `<button type="button" class="toggle ${extra}" data-toggle="${esc(s.id)}" data-on="${on}" aria-label="${on ? "Remove from" : "Add to"} My Calendar: ${esc(s.title)}">${on ? MINUS : "+"}</button>`;
}

function roomLink(name, cls = "room-btn-inline") {
  return `<button type="button" class="${cls}" data-room="${esc(name)}" title="Show on the map">${esc(name)}</button>`;
}

function chosen() { return calendar.all().map((id) => state.byId.get(id)).filter(Boolean); }

function clashes(list = chosen()) {
  const pairs = [];
  const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date) || startMin(a) - startMin(b));
  for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length; j++) if (overlaps(sorted[i], sorted[j])) pairs.push([sorted[i], sorted[j]]);
  return pairs;
}

/** Keeps every [+]/[−] button, highlighted block and badge in step with the calendar. */
function syncAll() {
  const clashIds = new Set(clashes().flat().map((s) => s.id));
  $$("[data-toggle]").forEach((b) => {
    const s = state.byId.get(b.dataset.toggle); if (!s) return;
    const on = calendar.has(s.id);
    b.dataset.on = on;
    if (b.classList.contains("toggle")) b.textContent = on ? MINUS : "+";
    else b.textContent = on ? `${MINUS} Remove from My Calendar` : "+ Add to My Calendar";
    b.setAttribute("aria-label", `${on ? "Remove from" : "Add to"} My Calendar: ${s.title}`);
    const holder = b.closest("[data-id]");
    if (holder) { holder.classList.toggle("in-cal", on); holder.classList.toggle("clash", clashIds.has(s.id)); }
  });
  const n = calendar.size();
  const badge = $("#badge"); badge.textContent = n; badge.hidden = n === 0;
}

let toastTimer;
function toast(msg, warn = false) {
  const t = $("#toast");
  t.textContent = msg; t.classList.toggle("warn", warn); t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), warn ? 5000 : 2200);
}

function onToggle(id) {
  const s = state.byId.get(id); if (!s) return;
  const added = calendar.toggle(id);
  syncAll();
  if (state.tab === "calendar") renderCalendar();
  if (!added) return toast("Removed from My Calendar");
  const clash = chosen().find((o) => o.id !== id && overlaps(o, s));
  if (clash) toast(`Added, but it overlaps with “${clash.title}” (${timeText(clash)}).`, true);
  else toast("Added to My Calendar");
}

/* ----------------------------------------------------------------- render */
function render() {
  $$(".tabs [data-tab]").forEach((b) => {
    if (b.dataset.tab === state.tab) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  const bar = $("#searchbar");
  bar.hidden = !(state.tab === "timetable" || state.tab === "search");
  if ($("#q").value !== state.query) $("#q").value = state.query;
  $("#qclear").hidden = !state.query;

  if (state.tab === "timetable") state.query.trim() ? renderResults() : renderTimetable();
  else if (state.tab === "search") renderResults();
  else if (state.tab === "calendar") renderCalendar();
  else renderRooms();
  syncAll();
}

function setTab(tab, { focus = true } = {}) {
  state.tab = tab;
  history.replaceState(null, "", `#${tab}`);
  render();
  if (focus) $("#view").focus({ preventScroll: true });
}

/* ------------------------------------------------------------- timetable */
function roomsForDay(list) {
  const used = new Set(list.map((s) => s.room));
  return state.rooms.filter((r) => used.has(r.name));
}

function renderTimetable() {
  const list = state.sessions.filter((s) => s.date === state.date);
  const rooms = roomsForDay(list);
  const t0 = Math.floor(Math.min(...list.map(startMin)) / ROW_MIN) * ROW_MIN;
  const t1 = Math.ceil(Math.max(...list.map(endMin)) / ROW_MIN) * ROW_MIN;
  const rows = (t1 - t0) / ROW_MIN;
  const col = new Map(rooms.map((r, i) => [r.name, i + 2]));

  let g = `<div class="g-corner" style="grid-row:1;grid-column:1">Time</div>`;
  rooms.forEach((r, i) => {
    const sub = r.venue && r.venue !== "Church House" ? r.venue : r.floor;
    g += `<div class="g-head" style="grid-row:1;grid-column:${i + 2}"><button type="button" class="room-link" data-room="${esc(r.name)}" title="Show on the map">${esc(r.name)}</button><small>${esc(sub || "")}</small></div>`;
  });
  for (let i = 0; i < rows; i++) {
    const m = t0 + i * ROW_MIN;
    const hour = m % 60 === 0;
    g += `<div class="g-line ${hour ? "hour" : ""}" style="grid-row:${i + 2}"></div>`;
    g += `<div class="g-time" style="grid-row:${i + 2};grid-column:1">${m % 30 === 0 ? fromMin(m) : ""}</div>`;
  }
  for (const s of list) {
    const r0 = 2 + (startMin(s) - t0) / ROW_MIN;
    const r1 = 2 + (endMin(s) - t0) / ROW_MIN;
    const compact = r1 - r0 <= 2;
    g += `<div class="session ${compact ? "compact" : ""}" data-id="${esc(s.id)}" style="grid-row:${r0}/${r1};grid-column:${col.get(s.room)}">
      <button type="button" class="open" data-open="${esc(s.id)}"><span class="s-time">${timeText(s)}</span><span class="s-title">${esc(s.title)}</span>${s.speakers.length ? `<span class="s-spk">${esc(s.speakers.join(", "))}</span>` : ""}</button>
      ${toggleBtn(s)}</div>`;
  }

  const tabs = state.days.map((d) => `<button type="button" data-date="${d}" aria-pressed="${d === state.date}" aria-label="${dayLong(d)}">${dayShort(d)}</button>`).join("");
  $("#view").innerHTML = `<div class="days" role="group" aria-label="Choose day">${tabs}</div>
    <div class="grid-scroll" tabindex="0" role="region" aria-label="Timetable for ${dayLong(state.date)}. Scroll sideways to see more rooms.">
      <div class="grid tt" style="grid-template-columns:var(--timecol) repeat(${rooms.length},var(--col));grid-template-rows:64px repeat(${rows},var(--row))">${g}</div>
    </div>`;
}

/* ---------------------------------------------------------------- search */
function resultCard(r) {
  const s = r.item, h = r.hl;
  const speakers = s.speakers.map((n, i) => {
    const role = s.speakerRoles?.[n] ? ` (${esc(s.speakerRoles[n])})` : "";
    return highlight(n, h.speakers[i]) + role;
  }).join(", ");
  const time = `${dayShort(s.date)}, ${r.timeHit ? `<mark>${timeText(s)}</mark>` : timeText(s)}`;
  return `<li class="card" data-id="${esc(s.id)}">
    <div class="body">
      <button type="button" class="open" data-open="${esc(s.id)}"><span class="c-title">${highlight(s.title, h.title)}</span></button>
      <div class="c-meta"><strong>${time}</strong> · <span>${roomLinkHL(s, h)}</span></div>
      ${speakers ? `<div class="c-spk">${speakers}</div>` : ""}
      ${h.theme.length ? `<div class="c-meta">${highlight(s.theme, h.theme)}</div>` : ""}
    </div>${toggleBtn(s)}</li>`;
}
function roomLinkHL(s, h) {
  return `<button type="button" class="room-btn-inline" data-room="${esc(s.room)}" title="Show on the map">${highlight(s.room, h.room)}</button>`;
}

function renderResults() {
  const q = state.query.trim();
  let body;
  if (!q) {
    const picks = ["Claire Fox", "2pm", "Temple Room", "Sunday 11:00"];
    body = `<div class="empty"><p>Type a speaker, room or time. Small typos are fine, and so are times like <strong>2pm</strong> or <strong>14:00</strong>.</p>
      <div class="chips">${picks.map((p) => `<button type="button" class="chip" data-suggest="${esc(p)}">${esc(p)}</button>`).join("")}</div></div>`;
  } else if (!state.search) {
    body = `<p class="count">Getting search ready…</p>`;
  } else {
    const { results, time } = state.search(q);
    const note = time ? ` running at ${time.label}` : "";
    body = results.length
      ? `<p class="count" aria-live="polite">${results.length} session${results.length === 1 ? "" : "s"}${note}</p><ul class="list">${results.map(resultCard).join("")}</ul>`
      : `<div class="empty"><p>No sessions match “${esc(q)}”. Check the spelling, or try a speaker's surname, a room name or a time like 2pm.</p></div>`;
  }
  const keep = $(".page")?.scrollTop ?? 0;
  const view = $("#view");
  view.innerHTML = `<div class="page">${state.tab === "search" ? `<h2><span>Search</span></h2>` : `<h2><span>Search results</span></h2>`}${body}</div>`;
  if (q && $(".page")) $(".page").scrollTop = keep;
}

/* -------------------------------------------------------------- calendar */
const luckyTag = (s) => (calendar.isLucky(s.id) ? ` <span class="tag">Lucky dip</span>` : "");

/** Calendar grid: time down the side, dates across the top. Overlapping sessions sit side by side in lanes. */
function calendarGrid(list) {
  const t0 = Math.floor(Math.min(...list.map(startMin)) / ROW_MIN) * ROW_MIN;
  const t1 = Math.ceil(Math.max(...list.map(endMin)) / ROW_MIN) * ROW_MIN;
  const rows = (t1 - t0) / ROW_MIN;
  const lane = new Map(), lanes = {};
  for (const date of state.days) {
    const ends = [];
    for (const s of list.filter((x) => x.date === date).sort((a, b) => startMin(a) - startMin(b) || endMin(a) - endMin(b))) {
      let l = ends.findIndex((e) => e <= startMin(s));
      if (l < 0) { l = ends.length; ends.push(0); }
      ends[l] = endMin(s); lane.set(s.id, l);
    }
    lanes[date] = Math.max(1, ends.length);
  }
  const first = {}; let c = 2;
  for (const date of state.days) { first[date] = c; c += lanes[date]; }
  const total = c - 2;

  let g = `<div class="g-corner" style="grid-row:1;grid-column:1">Time</div>`;
  state.days.forEach((date) => { g += `<div class="g-head day" style="grid-row:1;grid-column:${first[date]}/span ${lanes[date]}"><strong>${dayShort(date)}</strong></div>`; });
  for (let i = 0; i < rows; i++) {
    const m = t0 + i * ROW_MIN;
    g += `<div class="g-line ${m % 60 === 0 ? "hour" : ""}" style="grid-row:${i + 2}"></div><div class="g-time" style="grid-row:${i + 2};grid-column:1">${m % 30 === 0 ? fromMin(m) : ""}</div>`;
  }
  for (const s of list) {
    const r0 = 2 + (startMin(s) - t0) / ROW_MIN, r1 = 2 + (endMin(s) - t0) / ROW_MIN;
    g += `<div class="session cal-block ${r1 - r0 <= 2 ? "compact" : ""}" data-id="${esc(s.id)}" style="grid-row:${r0}/${r1};grid-column:${first[s.date] + lane.get(s.id)}">
      <button type="button" class="open" data-open="${esc(s.id)}"><span class="s-time">${timeText(s)}</span><span class="s-title">${esc(s.title)}</span><span class="s-spk">${esc(s.room)}</span></button>
      ${toggleBtn(s)}</div>`;
  }
  return `<div class="grid-scroll cal-scroll" tabindex="0" role="region" aria-label="Your calendar. Scroll sideways to see more.">
    <div class="grid" style="grid-template-columns:var(--timecol) repeat(${total},var(--col));grid-template-rows:44px repeat(${rows},var(--row))">${g}</div></div>`;
}

function renderCalendar() {
  const list = chosen().sort((a, b) => a.date.localeCompare(b.date) || startMin(a) - startMin(b));
  const view = $("#view");
  const luckyBtn = `<button class="btn" type="button" id="lucky">${calendar.hasLucky() ? "Re-roll lucky dip" : "Lucky dip"}</button>`;
  const hint = `<p class="hint">Lucky dip fills every free slot on each day with random sessions, with no overlaps. It keeps the sessions you chose yourself.</p>`;
  if (!list.length) {
    view.innerHTML = `<div class="page"><h2><span>My Calendar</span></h2><div class="empty"><p>Nothing here yet. Tap <strong>+</strong> on any session to add it, or let chance decide.</p><div class="actions">${luckyBtn}<button class="btn ghost" type="button" data-tab-go="timetable">Browse the timetable</button></div></div>${hint}</div>`;
    return;
  }
  const pairs = clashes(list);
  const clashIds = new Set(pairs.flat().map((s) => s.id));
  const warn = pairs.length ? `<div class="notice" role="alert"><div><div>${pairs.length} overlap${pairs.length === 1 ? "" : "s"} in your schedule</div><ul>${pairs.map(([a, b]) => `<li>${dayShort(a.date)}: “${esc(a.title)}” (${timeText(a)}) and “${esc(b.title)}” (${timeText(b)})</li>`).join("")}</ul></div></div>` : "";
  let html = `<h2><span>My Calendar</span></h2>${warn}
    <div class="actions">${luckyBtn}<button class="btn" type="button" id="export">Export to phone calendar</button><button class="btn ghost" type="button" id="clear">Clear all</button></div>
    ${hint}
    <p class="hint">Export downloads an .ics file. Open it on your phone to add ${list.length} session${list.length === 1 ? "" : "s"} to your calendar app.</p>
    <div class="cal-wrap">${calendarGrid(list)}</div>
    <h3><span>List view</span></h3>`;
  for (const date of state.days) {
    const day = list.filter((s) => s.date === date); if (!day.length) continue;
    html += `<h4 class="day-head">${dayLong(date)}</h4><ul class="list">` + day.map((s) => `
      <li class="card in-cal ${clashIds.has(s.id) ? "clash" : ""}" data-id="${esc(s.id)}"><div class="body">
        <button type="button" class="open" data-open="${esc(s.id)}"><span class="c-title">${esc(s.title)}</span></button>
        <div class="c-meta"><strong>${timeText(s)}</strong> · ${roomLink(s.room)}${s.floor ? `, ${esc(s.floor.toLowerCase())}` : ""}${luckyTag(s)}</div>
        ${s.speakers.length ? `<div class="c-spk">${esc(s.speakers.join(", "))}</div>` : ""}
      </div>${toggleBtn(s)}</li>`).join("") + `</ul>`;
  }
  view.innerHTML = `<div class="page">${html}</div>`;
}

function onLucky() {
  const had = calendar.hasLucky();
  if (had) calendar.removeLucky();
  const picks = luckyDip(state.sessions, chosen(), state.days);
  if (!picks.length) { renderCalendar(); syncAll(); return toast(had ? "No free slots to fill" : "No free slots left to fill", true); }
  calendar.addLucky(picks.map((s) => s.id));
  renderCalendar(); syncAll();
  const nDays = new Set(picks.map((s) => s.date)).size;
  toast(`Lucky dip added ${picks.length} session${picks.length === 1 ? "" : "s"} across ${nDays} day${nDays === 1 ? "" : "s"}`);
}

/* ----------------------------------------------------------------- rooms */
function renderRooms() {
  const sel = state.selectedRoom && state.roomMap.get(state.selectedRoom);
  const counts = new Map();
  state.sessions.forEach((s) => counts.set(s.room, (counts.get(s.room) || 0) + 1));

  const marker = sel && sel.x != null
    ? `<div class="marker ${sel.x > 72 ? "right" : sel.x < 28 ? "left" : ""}" style="left:${sel.x}%;top:${sel.y}%"><span>${esc(sel.name)}</span></div>` : "";

  const detail = sel ? `<section class="room-detail" aria-live="polite">
      <h3>${esc(sel.name)}</h3>
      <div class="where">${[sel.venue, sel.floor].filter(Boolean).map(esc).join(", ")}</div>
      <p>${esc(sel.directions)}</p>
      ${sel.x == null ? `<p class="where">This room is not marked on the floor plan.</p>` : ""}
      <button class="btn" type="button" data-find-room="${esc(sel.name)}">See sessions in this room</button>
    </section>` : `<p class="hint">Tap a room below, or a room name anywhere in the app, to see it on the plan.</p>`;

  const groups = [];
  for (const r of state.rooms) {
    const label = r.venue && r.venue !== "Church House" ? r.venue : (r.floor || "Other");
    let g = groups.find((x) => x.label === label);
    if (!g) groups.push((g = { label, rooms: [] }));
    g.rooms.push(r);
  }
  const list = groups.map((g) => `<h3><span>${esc(g.label)}</span></h3><ul class="room-list">${g.rooms.map((r) => {
    const n = counts.get(r.name) || 0;
    return `<li><button type="button" class="room-btn" data-room="${esc(r.name)}" aria-current="${r.name === state.selectedRoom}"><span>${esc(r.name)}</span><small>${n} session${n === 1 ? "" : "s"}</small></button></li>`;
  }).join("")}</ul>`).join("");

  const info = state.info.length ? `<details class="info"><summary>Entrances and facilities</summary><dl>${state.info.map((i) => `<dt>${esc(i.title)}</dt><dd>${esc(i.text)}</dd>`).join("")}</dl></details>` : "";

  $("#view").innerHTML = `<div class="page"><h2><span>Rooms</span></h2>
    <div class="map-card" id="mapcard">
      <div class="map-tools"><button class="btn ghost" type="button" id="zoom">${state.zoom ? "Zoom out" : "Zoom in"}</button><a class="room-btn-inline" href="${esc(state.plan.image)}" target="_blank" rel="noopener">Open full image</a></div>
      <div class="map-scroll" id="mapscroll"><div class="map ${state.zoom ? "zoomed" : ""}"><img src="${esc(state.plan.image)}" alt="${esc(state.plan.alt)}">${marker}</div></div>
    </div>
    ${detail}${list}${info}</div>`;
}

function showRoom(name) {
  state.selectedRoom = name;
  $("#details").open && $("#details").close();
  state.tab = "rooms"; history.replaceState(null, "", "#rooms");
  render();
  const behavior = reduceMotion ? "auto" : "smooth";
  requestAnimationFrame(() => {
    $("#mapcard")?.scrollIntoView({ block: "start", behavior });
    const m = $(".marker"), sc = $("#mapscroll");
    if (m && state.zoom && sc) sc.scrollTo({ left: m.offsetLeft - sc.clientWidth / 2, top: m.offsetTop - sc.clientHeight / 2, behavior });
  });
}

/* --------------------------------------------------------------- details */
function openDetails(id) {
  const s = state.byId.get(id); if (!s) return;
  const dlg = $("#details");
  const spk = s.speakers.length ? `<ul class="d-spk">${s.speakers.map((n) => `<li>${esc(n)}${s.speakerRoles?.[n] ? ` <span>(${esc(s.speakerRoles[n])})</span>` : ""}</li>`).join("")}</ul>` : "";
  const on = calendar.has(id);
  dlg.innerHTML = `<div class="d-wrap" data-id="${esc(id)}">
    <div class="d-top">${s.theme ? `<span class="d-theme">${esc(s.theme)}</span>` : "<span></span>"}<button type="button" class="d-close" data-close aria-label="Close details">×</button></div>
    <h2 id="d-title">${esc(s.title)}</h2>
    <dl class="d-grid">
      <dt>When</dt><dd>${dayLong(s.date)}, ${timeText(s)}</dd>
      <dt>Where</dt><dd>${roomLink(s.room)}${[s.floor, s.venue].filter(Boolean).length ? `<br>${[s.floor, s.venue].filter(Boolean).map(esc).join(", ")}` : ""}</dd>
    </dl>
    ${spk}
    <div class="d-foot">
      <button type="button" class="btn" data-toggle="${esc(id)}" data-on="${on}">${on ? `${MINUS} Remove from My Calendar` : "+ Add to My Calendar"}</button>
      <button type="button" class="btn ghost" data-room="${esc(s.room)}">Show on map</button>
    </div></div>`;
  dlg.showModal();
}

/* ---------------------------------------------------------------- events */
document.addEventListener("click", (e) => {
  const t = e.target;
  const hit = (sel) => t.closest(sel);
  let el;
  if ((el = hit("[data-toggle]"))) return onToggle(el.dataset.toggle);
  if ((el = hit("[data-open]"))) return openDetails(el.dataset.open);
  if ((el = hit("[data-room]"))) return showRoom(el.dataset.room);
  if ((el = hit("[data-find-room]"))) { state.query = el.dataset.findRoom; return setTab("search"); }
  if ((el = hit(".tabs [data-tab]"))) return setTab(el.dataset.tab);
  if ((el = hit("[data-tab-go]"))) return setTab(el.dataset.tabGo);
  if ((el = hit("[data-date]"))) { state.date = el.dataset.date; prefs.set("date", state.date); return renderTimetable(), syncAll(); }
  if ((el = hit("[data-suggest]"))) { state.query = el.dataset.suggest; render(); return $("#q").focus(); }
  if ((el = hit("[data-close]"))) return $("#details").close();
  if (t === $("#details")) return $("#details").close();                  // click on backdrop
  if (hit("#zoom")) { state.zoom = !state.zoom; renderRooms(); return syncAll(); }
  if (hit("#lucky")) return onLucky();
  if (hit("#export")) {
    const list = chosen().sort((a, b) => a.date.localeCompare(b.date) || startMin(a) - startMin(b));
    if (list.length) { downloadICS(list); toast("Calendar file downloaded"); }
    return;
  }
  if (hit("#clear")) { if (confirm("Remove all sessions from My Calendar?")) { calendar.clear(); renderCalendar(); syncAll(); } return; }
  if (hit("#qclear")) { state.query = ""; render(); return $("#q").focus(); }
});

$("#q").addEventListener("input", (e) => {
  state.query = e.target.value;
  $("#qclear").hidden = !state.query;
  if (state.tab === "timetable") state.query.trim() ? renderResults() : renderTimetable();
  else renderResults();
  syncAll();
});
$("#q").addEventListener("keydown", (e) => { if (e.key === "Escape" && state.query) { state.query = ""; e.target.value = ""; render(); } });
window.addEventListener("hashchange", () => {
  const h = location.hash.replace("#", "");
  if (["timetable", "calendar", "search", "rooms"].includes(h) && h !== state.tab) { state.tab = h; render(); }
});

if ("serviceWorker" in navigator) {
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

boot();
