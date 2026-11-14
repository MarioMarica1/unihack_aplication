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

In **Comunitate → Filtre**, **Include sesizările Primăriei** is enabled by default. Public reports marked **Depusă** or **În lucru** from the last 30 days are refreshed every minute. Reports without coordinates appear in the list and each entry links to the municipal portal. Authors can mark their community reports **Raportată la Primărie** after submitting them there.

## What the demo does

- Live MapLibre/OpenFreeMap Liberty map of Timișoara. Desktop opens on the community list. On mobile, one bottom panel switches between tools and pin details and leaves map controls accessible.
- One active community filter (reports, activities or discussions) controls the community map and list. Optional marker labels, saved pins and explicit location selection before publication.
- Searchable directory of named places, buildings and transit stops from OpenStreetMap and SMTT. The unfiltered directory starts with well-known Timișoara landmarks. Results open docked details and can be shared via WhatsApp or a public map link.
- Static mobility overlays from OSM and the SMTT GTFS feed: cycling infrastructure, sidewalks, and tram, bus and trolleybus routes and stops. The map does not show live arrivals.
- Reports with compressed WebP photos, community confirmation, resolve/reopen and author editing.
- Independent activities, automatic organizer participation, capacity-safe joins and withdrawals, cancellation, expiry.
- A public conversation on every announcement in shared mode, shown beside the list on desktop and full screen on mobile. Demo messages persist locally and sync across tabs.
- Live FOSSGIS OSRM walking, cycling and driving routes from a start to a destination, with up to six optional intermediate stops in the selected order. The map shows each stop, distance and estimated duration. Cancel a calculation or clear the displayed route while retaining the selected points.
- The public transport planner uses the local SMTT GTFS network for ordered stops and route geometry. Refresh it with `python scripts/build-transit-network.py` (or pass the downloaded GTFS ZIP as the first argument). Waiting and vehicle travel times are estimates. The planner tries OSRM for walking connections and indicates straight-line estimates where needed.
- Local content reporting, explicitly without an active moderation service.

**Demo boundary:** records and photos persist in IndexedDB in the current browser and origin. The Radu/Ana/Mihai profiles are simulated test identities, not real authentication. Other devices and browsers do not share these records. Initial example records are marked DEMO; their images are local illustrations. An OSRM outage produces an error and preserves selected stops; no fabricated fallback route is drawn.

## Team development and data

The demo starts from bundled sample records and needs no Supabase account or environment variables. Edits, photos and messages stay in IndexedDB, scoped to the browser profile and site address. Tabs in the same browser profile and origin share changes. Each teammate's browser and any Netlify deployment have separate test data. Test records and photos created in the browser are not committed to Git.

Use a branch for each change and open a pull request into `main`. Both original reference documents are in `Documente_Initiale/`.

## Shared mode on Supabase

1. In the intended development project, apply [the Vecin migration](supabase/migrations/202611120001_vecin.sql) with Supabase CLI or SQL Editor. It creates private application tables, the public read/write RPCs, the photo bucket and the Realtime revision table.
2. Apply [the municipal reporting migration](supabase/migrations/202611140001_municipal_reporting.sql) to enable the report marker in shared mode.
3. Configure Google sign-in as described below and add the application's origin and intended pin redirect paths to the Auth redirect allow list. Existing confirmed accounts can still use the password option. When Google is disabled, the app also offers email links. These links must be opened in the same browser profile that requested them, and delivery to the public requires custom SMTP.
4. Set `VITE_APP_MODE=cloud`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in ignored `.env.local` or in the Netlify build environment. Netlify builds `dist` and serves direct SPA links using `netlify.toml`.
5. With two browser profiles or devices, sign in, publish a new pin with a photo, open its shared link and exchange messages. Have two users try to claim the last spot and verify one can claim it. Check that a different user cannot edit the pin or remove its photo.

In shared mode, published pins, photos and messages are public, saved pins are account-specific, and reports of inappropriate content are stored for review by the project operator. The hackathon UI shows the latest 100 messages per pin.

### Enable Google sign-in

1. In [Google Auth Platform](https://console.cloud.google.com/auth/overview), use an External audience and configure the basic identity scopes only: `openid`, `email`, and `profile`. Create a **Web application** OAuth client. Set the authorized JavaScript origin to `https://urban-conect.netlify.app`.
2. Set the client's **Authorized redirect URI** to the callback shown in [Supabase's Google provider configuration](https://supabase.com/dashboard/project/_/auth/providers), typically `https://<project-ref>.supabase.co/auth/v1/callback`. Google redirects to Supabase; Supabase redirects to the app.
3. Paste the Client ID and Client Secret in the **Google** provider settings in Supabase, enable the provider and save. Keep the secret in Supabase. Make sure account creation is allowed in Supabase and the app origin and its pin URLs are allowed in Auth → URL Configuration. The app detects the provider on opening the sign-in dialog; no Netlify rebuild is needed after enabling it.
4. Try the production site from a fresh browser profile. Sign in once with a new Google account, then sign out and sign back in. Check a direct pin link and a pre-existing account with the same verified email if available. The app does not publish the Google email as a public profile name.

See [Supabase's Google setup guide](https://supabase.com/docs/guides/auth/social-sign-in/auth-google) and [Google's app audience settings](https://support.google.com/cloud/answer/15549945).

### Jury dataset

The configured development project contains 8 examples with titles prefixed `DEMO · `, 3 reports, 3 activities and 2 discussions. The UI labels their illustrations and records as demo. Their locations are illustrative and their activities are synthetic.

To populate an empty project using two confirmed accounts, create a local, Git-ignored JSON file with two `{ "email": "...", "password": "..." }` objects in an array and run this command with Node.js 24:

```sh
node --experimental-strip-types scripts/seed-demo.mjs path/to/accounts.json
```

The script uses the public project configuration from `.env.local`, signs in as ordinary users and verifies the 8 pins through the second account. IDs are deterministic so rerunning preserves existing pins. Activity dates are set when the seed is first published. Check dates before the jury session and edit or replace any expired examples through their author accounts.

### Netlify setup

To show live vehicle positions, set `VITE_STPT_VEHICLES_URL` to an authorized JSON feed or a same-origin adapter for an authorized GTFS Realtime feed. The public URL must allow requests from the app origin. Its payload is `{ "vehicles": [{ "id": "unique-id", "type": "tram", "line": "1", "lat": 45.75, "lon": 21.22, "recordedAt": "ISO-8601 timestamp with time zone" }] }`. Supported types are `tram`, `bus` and `trolleybus`. Keep any provider credentials in the adapter. The map polls while STPT Live is enabled and shows the Live.STPT link even when no feed is configured.

The production Netlify project `urban-conect` in the `jupan-racing` team deploys this repository's `main` branch. Its build environment uses the existing Supabase project for accounts, pins, photos and messages. Use [urban-conect.netlify.app](https://urban-conect.netlify.app) for shared links and production checks.

Connect this repository and select `main` in Netlify. Leave the base directory empty. `netlify.toml` sets Node.js 24, the build command, `dist` and the SPA fallback. For the shared application, set `VITE_APP_MODE=cloud`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the Netlify build environment, then rebuild. For email sign-in, configure `https://urban-conect.netlify.app` as the Supabase Auth Site URL and allow `https://urban-conect.netlify.app/**` in Redirect URLs, since users can request a link while viewing a pin. The Git-ignored local environment is specific to this computer.

For routine changes, work on a branch and test with `npm run dev`. Before a release, run `npm test`, `npm run build`, and `npm run preview`. This local work uses no Netlify credits. To push to the production branch without a Netlify build, end the tip commit's message with `[skip netlify]`. Group changes and publish one tested release from the account Netlify recognizes for the private repo. Alternatively, choose **Lock to stop auto publishing** in Netlify's Deploys tab and publish a successful production build when ready. A manual upload to the live URL still counts as a production deploy. See [Netlify deploy management](https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/) and [credit usage](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/).

## Checks

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Tests cover domain permissions, invalid input, idempotent message/publication IDs, report confirmation, activity chronology and capacity, concurrent IndexedDB enrollment, persistence, coordinate order, per-mode routing endpoints, routing failure responses, real GeoJSON data integrity/classification, place search and ranking, and 2D building rendering. The pre-fix audit and its captures are in [docs/AUDIT_VECIN.md](docs/AUDIT_VECIN.md). Hosted sign-in, Storage, Realtime and Netlify require the shared environment above.

Static GIS refresh (network required): run `node scripts/fetch-infrastructure.mjs`, then `node scripts/expand-places.mjs`. The exporter targets Timișoara's `[45.68, 21.14, 45.82, 21.32]` bounding box, reads full OSM route-relation member geometry and imports SMTT producer GTFS shapes/stops for tram, bus and trolleybus. The second step includes named services and polygon-center POIs. No Overpass query is issued by the application during normal use. The PMT bicycle/trotinete open-data resource is statistical CSV, not a geospatial velo-network feed, so mapped velo geometry is attributed to OSM until PMT publishes a spatial dataset.

## Sources and attribution

Map data © OpenStreetMap contributors, © OpenMapTiles, hosted by OpenFreeMap. Map rendering MapLibre GL JS. Routing OSRM public demo service (best effort, no SLA). Icons Lucide. Fonts DM Sans / Manrope via Google Fonts, with local system fallbacks. Illustrations are project SVG assets. Initial project specifications are in `Documente_Initiale` and remain unchanged.
