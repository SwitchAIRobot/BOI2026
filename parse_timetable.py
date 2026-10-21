#!/usr/bin/env python3
"""
One-time parser: boi_timetable_raw.csv  ->  timetable.json (+ parse_flags.json)

Run from this folder:   python3 parse_timetable.py
Needs only Python 3.8+ (no extra packages).

Anything it is not fully confident about is written to data/parse_flags.json
and printed, so you can check those rows against the programme.
"""
import csv, json, re, sys, datetime, pathlib, collections

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "boi_timetable_raw.csv"
OUT = ROOT / "timetable.json"
FLAGS = ROOT / "parse_flags.json"

HOME_VENUE = "Church House"          # the venue covered by the floor plan
TBC_ROOM = "Location TBC"            # label used when the CSV gives no real room
TIME_RE = re.compile(r"^([01]?\d|2[0-3]):[0-5]\d$")


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def clean(text):
    return re.sub(r"\s+", " ", (text or "").strip())


def parse_speakers(raw):
    """'A; B (Chair)' -> (['A', 'B'], {'B': 'Chair'})"""
    names, roles = [], {}
    for part in [p.strip() for p in raw.split(";") if p.strip()]:
        m = re.match(r"^(.*?)\s*\(([^)]*)\)\s*$", part)
        name, role = (m.group(1).strip(), m.group(2).strip()) if m else (part, "")
        names.append(name)
        if role:
            roles[name] = role
    return names, roles


def to_min(t):
    h, m = t.split(":")
    return int(h) * 60 + int(m)


def main():
    flags, sessions = [], []
    with open(SRC, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))

    for n, row in enumerate(rows, start=2):  # row 1 is the header
        def flag(severity, issue):
            flags.append({"csvRow": n, "severity": severity, "issue": issue,
                          "title": clean(row.get("Title")), "raw": dict(row)})

        title = clean(row.get("Title"))
        theme = clean(row.get("Theme"))
        raw_room = clean(row.get("Room"))
        venue = clean(row.get("Venue"))
        floor = clean(row.get("Floor")) or None
        start = clean(row.get("startTime"))
        end = clean(row.get("endTime")) or None
        day = clean(row.get("Day"))

        # Date
        try:
            d = datetime.datetime.strptime(clean(row.get("Date")), "%d/%m/%Y").date()
        except ValueError:
            flag("check", "Date is not dd/mm/yyyy"); continue
        if d.strftime("%A") != day:
            flag("check", f"Day says {day} but the date is a {d.strftime('%A')}")

        # Times
        if not TIME_RE.match(start):
            flag("check", f"Start time '{start}' is not HH:MM"); continue
        start = start.zfill(5)
        if end:
            if not TIME_RE.match(end):
                flag("check", f"End time '{end}' is not HH:MM"); end = None
            else:
                end = end.zfill(5)
                if to_min(end) <= to_min(start):
                    flag("check", f"End time {end} is not after start {start}")
        if not end:
            flag("check", "No end time in the CSV. The app assumes 60 minutes on the grid and in the .ics export")

        # Room
        room = raw_room
        if not raw_room or raw_room.lower().startswith("not specified"):
            room = TBC_ROOM
            flag("check", f"No room given ('{raw_room}'). Set to '{TBC_ROOM}'")
        if not floor and room != TBC_ROOM:
            flag("check", "No floor given")
        if venue and venue != HOME_VENUE:
            flag("info", f"Held at {venue}, not on the Church House floor plan. Add its directions in rooms.json")

        speakers, roles = parse_speakers(clean(row.get("Speakers")))
        if not speakers:
            flag("info", "No speakers listed (fine for drinks, parties and addresses)")
        if any("," in s for s in speakers):
            flag("check", "A speaker name contains a comma. Check the split")
        if re.search(r"Ã|Â|�", title + " " + " ".join(speakers)):
            flag("check", "Possible garbled characters in title or speakers")

        sessions.append({
            "id": f"{day[:3].lower()}-{start.replace(':', '')}-{slug(room)}",
            "theme": theme,
            "title": title,
            "speakers": speakers,
            "speakerRoles": roles,
            "room": room,
            "day": day,
            "date": d.isoformat(),
            "startTime": start,
            "endTime": end,
            "floor": floor,
            "venue": venue,
        })

    # Duplicate ids and overlaps inside one room
    seen = collections.Counter(s["id"] for s in sessions)
    for sid, c in seen.items():
        if c > 1:
            flags.append({"csvRow": None, "severity": "check", "issue": f"Duplicate id {sid}", "title": "", "raw": {}})
    by_room = collections.defaultdict(list)
    for s in sessions:
        by_room[(s["date"], s["room"])].append(s)
    for (date, room), items in by_room.items():
        items.sort(key=lambda s: s["startTime"])
        for a, b in zip(items, items[1:]):
            a_end = to_min(a["endTime"]) if a["endTime"] else to_min(a["startTime"]) + 60
            if to_min(b["startTime"]) < a_end:
                flags.append({"csvRow": None, "severity": "check",
                              "issue": f"Overlap in {room} on {date}: '{a['title']}' and '{b['title']}'",
                              "title": a["title"], "raw": {}})

    sessions.sort(key=lambda s: (s["date"], s["startTime"], s["room"]))
    OUT.write_text(json.dumps(sessions, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    FLAGS.write_text(json.dumps(flags, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"Parsed {len(sessions)} sessions -> {OUT.relative_to(ROOT)}")
    print(f"{len(flags)} flag(s) -> {FLAGS.relative_to(ROOT)}")
    for fl in flags:
        print(f"  [{fl['severity']:5}] row {fl['csvRow']}: {fl['issue']}  ({fl['title'][:50]})")


if __name__ == "__main__":
    sys.exit(main())
