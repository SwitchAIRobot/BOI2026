# Battle of Ideas 2026: festival app

A free, installable web app (PWA): festival timetable, personal calendar with lucky dip, fuzzy search, and a Church House floor plan with directions.
No backend, no login, no paid services. Your chosen sessions are saved only in your own browser (localStorage).

Plain HTML, CSS and JavaScript with no build step. **Every file sits in one folder, with no subfolders**, so you can upload the lot to GitHub in one go.

## The files

| File | What it is |
|---|---|
| `index.html`, `styles.css`, `app.js`, `store.js`, `search.js`, `lucky.js`, `ics.js`, `util.js` | The app |
| `timetable.json` | All sessions (made from the CSV by the parser) |
| `rooms.json` | Room directions and map marker positions. Edit by hand |
| `boi_timetable_raw.csv` | The source CSV |
| `parse_timetable.py` | One-time CSV to JSON parser |
| `parse_flags.json` | Rows the parser wants you to check |
| `floorplan.jpg` | Floor plan shown in the Rooms tab |
| `sw.js`, `manifest.webmanifest`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` | Offline support and install-to-home-screen |
| `fuse.min.js` | Optional local copy of Fuse.js (see "Search") |

## Try it on your computer

Service workers need a web server, so don't double-click `index.html`. In this folder run:

```
python3 -m http.server 8000
```

Then open http://localhost:8000.

## 1. Update the timetable

1. Edit `boi_timetable_raw.csv` (keep the header row). Columns:
   `Date` (dd/mm/yyyy), `Theme`, `Title`, `Speakers` (separate with `;`, add roles in brackets, e.g. `Jon Holbrook (Chair)`), `Room`, `Day`, `startTime`, `endTime` (HH:MM, 24-hour), `Floor`, `Venue`.
2. Run `python3 parse_timetable.py`.
3. Read the flags it prints (also saved in `parse_flags.json`), fix the CSV if needed and run it again.
4. Upload the new `timetable.json` to GitHub (see "Updating later"). Phones fetch fresh data whenever they are online.

The header dates and day tabs come from the data, so changing the dates in the CSV is all you need.

Session ids look like `sat-1015-assembly-hall` (day, start time, room). If you change a session's time or room, its id changes, and anyone who had saved it must add it again.

Rows flagged in the current data:
- **Saturday Night Drinks**: the CSV gives no room ("see programme p12"). Shown as "Location TBC".
- **End of Festival Party**: no end time. The app assumes 60 minutes.
- **9 sessions at The Abbey Centre**: a different building, not on the Church House plan. They have no map marker, and their directions in `rooms.json` say "EDIT ME".

## 2. Edit room directions and map markers

Open `rooms.json`. Each room looks like this:

```json
{ "name": "Council Room", "venue": "Church House", "floor": "Ground floor",
  "x": 59.4, "y": 62.6,
  "directions": "Ground floor. Come in by the Great Smith Street entrance..." }
```

- `directions`: plain text, edit freely.
- `x`, `y`: marker position on the plan as a percentage of image width and height (0 to 100). `x` is 0 at the left edge, `y` is 0 at the top. Use `null` for rooms not on the plan.
- `name` must match the `Room` text in the CSV exactly.
- Room order in the file is the column order in the timetable grid.
- `info` at the top feeds the "Entrances and facilities" box.

To use a different plan, replace `floorplan.jpg` (or change `plan.image`) and re-measure `x` and `y`. The current directions were written from the supplied plan, so check them on site.

## 3. Search

Search uses [Fuse.js](https://www.fusejs.io/) v7. By default the app loads it from jsDelivr when first online, and the service worker keeps a copy for offline use. To bundle it so nothing depends on a CDN, save this file next to `index.html`:

https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.min.js

Name it `fuse.min.js`. If Fuse.js can't load at all, a simpler built-in matcher takes over.

Times work too: "2pm", "14:00", "1400" and "sunday 11:00" show sessions running at that time.

## 4. Calendar and lucky dip

- My Calendar shows a grid: time down the side, dates across the top. Overlapping sessions sit side by side and trigger a warning.
- **Lucky dip** fills every free slot on each day with random sessions that never overlap. It keeps sessions you chose yourself and skips the welcome address, drinks and party. Press **Re-roll lucky dip** to replace only the random ones.
- **Export to phone calendar** downloads an `.ics` file. Open it on your phone to add the events.

## 5. Deploy free on GitHub Pages

1. Sign up or log in at https://github.com.
2. Click **+**, then **New repository**. Name it e.g. `boi-2026`, choose **Public**, then **Create repository**.
3. Click **uploading an existing file** (or **Add file, Upload files**). Select all the files in this folder and drag them in. Click **Commit changes**.
4. Check that `index.html` is listed at the top level of the repository.
5. Go to **Settings, Pages**. Under "Build and deployment" choose **Deploy from a branch**, branch **main**, folder **/ (root)**, then **Save**.
6. After a minute or two your site is live at `https://YOUR-USERNAME.github.io/boi-2026/`.

### Installing on a phone
- **iPhone (Safari)**: Share, then **Add to Home Screen**.
- **Android (Chrome)**: menu, then **Install app**.

### Updating later
On the repository page choose **Add file, Upload files**, drop in the changed files and commit. Data files (`timetable.json`, `rooms.json`) go live straight away. If you change app code (`app.js`, `styles.css`, `index.html` and so on), also change `CACHE = "boi2026-v2"` in `sw.js` to `v3`, `v4` and so on, so phones drop their old copy.

## Design notes

- Colours are tokens at the top of `styles.css`. Lime `#84CC16` is used for the header, buttons, active tab and highlights, always with dark text (`#1F2937`) on it. Headings are dark text on a lime stroke, because lime text on white is too faint to read.
- In the timetable, sessions already in My Calendar are faded and marked "Added". Overlaps get a dashed amber outline.
