# Urban Connect — Comunitatea începe aproape

Interactive local demo for UniHack 2026 / The Bloom / Connected Communities.

Shared online application: [urban-conect.netlify.app](https://urban-conect.netlify.app).

## Run

Install Node.js 22.12+ or 24 LTS, then clone the repository and run these commands:

```sh
git clone https://github.com/Crenicean-Radu/unihack_connected_comunities.git
cd unihack_connected_comunities
npm ci
npm run dev
```

On Windows, use `npm.cmd` if PowerShell blocks the `npm` script. Open the URL printed by Vite (normally http://127.0.0.1:5173). For a production preview:

```powershell
npm.cmd run build
npm.cmd run preview -- --port 5174
```

## What the demo does

- Live MapLibre/OpenFreeMap Liberty map of Timișoara. Desktop opens on the community list. On mobile, one bottom panel switches between tools and pin details and leaves map controls accessible.
- One active community filter (reports, activities or discussions) controls the community map and list. Optional marker labels, saved pins and explicit location selection before publication.
- Searchable local directory of 4,227 named OSM places and buildings. The unfiltered directory starts with well-known Timișoara landmarks. Results open docked details and can be shared via WhatsApp or a public OpenStreetMap link.
- Static real OSM overlays: cycling infrastructure, tram tracks, mapped sidewalks, parks/sports/museums/tram stops. Independent toggles, provenance, geometry-vs-road-tag legend, clickable explanations and place actions.
- Reports with compressed WebP photos, community confirmation, resolve/reopen and author editing.
- Independent activities, automatic organizer participation, capacity-safe joins and withdrawals, cancellation, expiry.
- A public conversation on every announcement in shared mode, shown beside the list on desktop and full screen on mobile. Demo messages persist locally and sync across tabs.
- Live FOSSGIS OSRM walking, cycling and driving round trips with 2–7 stops, provider-defined visit order, numbered map stops, distance and estimated duration. Cancel a calculation or clear the displayed route while retaining the stops. Stops can be community pins, real OSM places or manually selected points.
- Local content reporting, explicitly without an active moderation service.

**Demo boundary:** records and photos persist in IndexedDB in the current browser and origin. The Radu/Ana/Mihai profiles are simulated test identities, not real authentication. Other devices and browsers do not share these records. Initial example records are marked DEMO; their images are local illustrations. An OSRM outage produces an error and preserves selected stops; no fabricated fallback route is drawn.

## Team development and data

The demo starts from bundled sample records and needs no Supabase account or environment variables. Edits, photos and messages stay in IndexedDB, scoped to the browser profile and site address. Tabs in the same browser profile and origin share changes. Each teammate's browser and any Netlify deployment have separate test data. Test records and photos created in the browser are not committed to Git.

Use a branch for each change and open a pull request into `main`. Both original reference documents are in `Documente_Initiale/`.

## Shared mode on Supabase

1. In the intended development project, apply [the Vecin migration](supabase/migrations/202611120001_vecin.sql) with Supabase CLI or SQL Editor. It creates private application tables, the public read/write RPCs, the photo bucket and the Realtime revision table.
2. Configure Supabase Auth email sign-in and add the application's origin and intended pin redirect paths to the Auth redirect allow list. Existing confirmed accounts can use the password option. Magic-link delivery requires an email provider with sufficient capacity for the intended audience.
3. Set `VITE_APP_MODE=cloud`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in ignored `.env.local` or in the Netlify build environment. Netlify builds `dist` and serves direct SPA links using `netlify.toml`.
4. With two browser profiles or devices, sign in, publish a new pin with a photo, open its shared link and exchange messages. Have two users try to claim the last spot and verify one can claim it. Check that a different user cannot edit the pin or remove its photo.

In shared mode, published pins, photos and messages are public, saved pins are account-specific, and reports of inappropriate content are stored for review by the project operator. The hackathon UI shows the latest 100 messages per pin.

### Jury dataset

The configured development project contains 8 examples with titles prefixed `DEMO · `, 3 reports, 3 activities and 2 discussions. The UI labels their illustrations and records as demo. Their locations are illustrative and their activities are synthetic.

To populate an empty project using two confirmed accounts, create a local, Git-ignored JSON file with two `{ "email": "...", "password": "..." }` objects in an array and run this command with Node.js 24:

```sh
node --experimental-strip-types scripts/seed-demo.mjs path/to/accounts.json
```

The script uses the public project configuration from `.env.local`, signs in as ordinary users and verifies the 8 pins through the second account. IDs are deterministic so rerunning preserves existing pins. Activity dates are set when the seed is first published. Check dates before the jury session and edit or replace any expired examples through their author accounts.

### Netlify setup

The production Netlify project `urban-conect` in the `jupan-racing` team deploys this repository's `main` branch. Its build environment uses the existing Supabase project for accounts, pins, photos and messages. Use [urban-conect.netlify.app](https://urban-conect.netlify.app) for shared links and production checks.

Connect this repository and select `main` in Netlify. Leave the base directory empty. `netlify.toml` sets Node.js 24, the build command, `dist` and the SPA fallback. For the shared application, set `VITE_APP_MODE=cloud`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the Netlify build environment, then rebuild. For email sign-in, configure `https://urban-conect.netlify.app` as the Supabase Auth Site URL and allow `https://urban-conect.netlify.app/**` in Redirect URLs, since users can request a link while viewing a pin. The Git-ignored local environment is specific to this computer.

## Checks

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Tests cover domain permissions, invalid input, idempotent message/publication IDs, report confirmation, activity chronology and capacity, concurrent IndexedDB enrollment, persistence, coordinate order, per-mode routing endpoints, routing failure responses, real GeoJSON data integrity/classification, place search and ranking, and 2D building rendering. The pre-fix audit and its captures are in [docs/AUDIT_VECIN.md](docs/AUDIT_VECIN.md). Hosted sign-in, Storage, Realtime and Netlify require the shared environment above.

Static data refresh (network required): run `node scripts/fetch-infrastructure.mjs`, then `node scripts/expand-places.mjs`. The second step includes named services and polygon-center POIs; do not omit it when replacing the extracted data. No Overpass query is issued by the application during normal use.

## Sources and attribution

Map data © OpenStreetMap contributors, © OpenMapTiles, hosted by OpenFreeMap. Map rendering MapLibre GL JS. Routing OSRM public demo service (best effort, no SLA). Icons Lucide. Fonts DM Sans / Manrope via Google Fonts, with local system fallbacks. Illustrations are project SVG assets. Initial project specifications are in `Documente_Initiale` and remain unchanged.
