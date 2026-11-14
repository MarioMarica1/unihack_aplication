# Demo acceptance and handoff

## Current jury preparation — 12 November 2026

The current production site is [urban-conect.netlify.app](https://urban-conect.netlify.app), deployed from GitHub `main` under the `jupan-racing` Netlify team. The [production verification](AUDIT_VECIN.md) records the domain change and the earlier full desktop and mobile audit. Use the current domain for the jury links. Supabase Auth URL settings for email links are documented in the [Netlify setup](../README.md#netlify-setup). Actual email delivery requires a working email service and a delivery test.

The local application uses the shared Supabase project. Password sign-in and session persistence were tested with two confirmed accounts, then report/photo publication, shared links, messages, Realtime, supports, author permissions and enrollment were tested against the hosted backend.

The project contains 8 clearly marked DEMO pins with illustrations and synthetic activities. Check the activity dates before presenting. The reusable seed command and Netlify configuration are in [README](../README.md). The local demo mode remains available for a separate browser session.

OSM layer verification covered 143 cycling segments (128 dedicated geometries and 15 street tags), 218 tram geometries, 3,063 sidewalk segments (1,640 separate geometries and 1,423 street tags) and 4,227 unique places. Each overlay was switched on and off and compared visually. Building footprints and place labels were checked at close zoom. A real OSM result was opened and added to a circuit with a community pin. Walking, cycling and driving each returned HTTP 200 with numbered stops, a return to start and distinct distance/time estimates. The active legend explains continuous and dashed geometries.

Netlify uses Node.js 24 and the three public build environment values documented in README. Prepare separate confirmed password accounts for testers and the jury; the default Supabase email service is not ready for unrestricted registration. Never distribute the owner's administrator credentials. Actual phone camera/GPS, Safari/iOS and email delivery on the final hosted origin remain to be verified. With a simulated slow connection and 4× CPU slowdown, the map loading indicator cleared in about 21 seconds; use a stable connection for the presentation.

Before presenting, open the online app, sign in via “Folosește parola”, check that the 13–15 November DEMO activity dates are still in the future, and run through one report, one activity and one circuit. Show layers individually to keep the map readable. There are 8 DEMO pins, 8 messages and 5 public illustrations. Build/typecheck and all 33 existing tests passed; the production dependency audit reported no known vulnerabilities.

## Historical checks

The following sections record earlier local-only revisions. The current status above and [the updated audit](AUDIT_VECIN.md) describe the shared version in the workspace.

## Recorded checks

- [x] Open map and browse real streets in desktop browser.
- [x] Report support changes 1 -> 2 and remains after refresh.
- [x] Persistent message remains after refresh and direct pin URL load.
- [x] Independent discussion creation and map picking preserve the form draft.
- [x] Join activity updates count and shows withdrawal action.
- [x] A second tab with a different demo profile reads the shared local state.
- [x] Message sent from second tab appears in first without refresh.
- [x] Live round trip computed in UI: 4.2 km / 8 min for seed park and seed books.
- [x] PNG uploaded through real file input, decoded, re-encoded to WebP at 1400px (~67 KB), saved and read after refresh.
- [x] Production build map/worker smoke check; no console errors from port 5174.
- [x] Responsive check: desktop 1440px and mobile 390px; no horizontal overflow, dialog fits within viewport.
- [x] Bookmark and Saved view in mobile layout, production activity participation.

Automated checks: 18 tests in 3 files, including concurrent enrollment in IndexedDB. Typecheck and production build pass. npm audit reported zero vulnerabilities after updating MapLibre. Build has a map-engine bundle-size warning; load splitting/performance tuning remains for the next iteration. GPS permissions on a real phone and external-provider outage behavior are not claimed as browser-verified; routing failure responses are covered by unit tests.

User preview: http://127.0.0.1:5174/ . Development origin http://127.0.0.1:5173/ has separate local test records. Origins do not share IndexedDB.

## Try it

1. Open the demo. Select a report and confirm it as Radu.
2. Open profile picker and switch to Ana; explore the distinction between the author and another user.
3. Create an activity with capacity 2 (organizer included). In another same-origin tab choose another profile and join.
4. Send a message between tabs. Reload to verify persistence.
5. Use the bookmark and Saved view; search/filter pins.
6. Open Circuits, add two places and generate a live driving route.

## Pending production gates

Real Supabase accounts, schema/RLS/Storage/Realtime, cross-device persistence, hosted HTTPS geolocation, actual phone/camera and slow-network behavior, active moderation, email delivery and account recovery, public-deployment routing cache/aggregate rate limiting. Local user identity is not a security boundary.

No Supabase records were written during connectivity verification. No GitHub push or Netlify deployment has occurred. The local preview is left running for the user; stop its terminal with Ctrl+C when finished.

## Map completeness revision / 9 November 2026

- [x] One successful bounded Overpass GET extraction, after unavailable POST endpoints; real data stored in public/data, source and counts recorded in metadata.json.
- [x] 143 cycling segments, 218 tram tracks, 3,063 mapped sidewalks, 176 OSM places. GeoJSON integrity and classification covered by tests.
- [x] Independent infrastructure toggles, explicit solid-vs-dashed semantics, source/coverage notice, clickable OSM objects.
- [x] Community marker labels show type, category, title and DEMO. Toggling names off yields zero visible labels; restoring names works.
- [x] Clicked Muzeul UPT on map, inspected real OSM link, added it to a circuit with a community pin.
- [x] Browser live results for identical Muzeul UPT + seed park stops: walking ~3.0km/40min, cycling ~3.9km/18min, driving ~4.4km/9min. Separate provider profiles and road geometries; numbered visits displayed on map.
- [x] Manual map-click stop added to planner without a community pin.
- [x] Mobile layer sheet checked at 390px, 366px panel width, no horizontal overflow. Screenshot: docs/screenshots/map-layers-mobile.png.
- [x] Desktop layered map screenshot: docs/screenshots/map-layers-desktop.png.
- [x] 27 automated tests pass; production build/typecheck pass; no console errors observed in current production tab.

The OSM extraction represents the demo bounding box, not guaranteed full-city coverage. A tagged sidewalk/cycle lane projected on a road centerline is explicitly dashed. POI centers may not be entrances. Infrastructure overlays do not automatically change routing costs, and cycling is not guaranteed to stay exclusively on cycleways.

## Map-first UI replacement

- Docked sidebar replaces marketing rail, floating layer panel, floating legend and permanent map cards. Header owns search/create/profile; GPS/fit/zoom stay at the bottom-right edge.
- Independent community layers verified in browser: report OFF yields 0 report marker buttons, 3 activity marker buttons and 2 discussion marker buttons; restoring reports works.
- Sidebar/map boundary measured at x340 on desktop; selected-pin details also end at x340. No popups cover the map; utility SVG centers have zero horizontal/vertical offset from their buttons.
- Search `carturesti` returns 3 real OSM results without diacritics. Selecting the Paulescu Street result shows the correct name/address/OSM object in the sidebar and focuses the map.
- Real-place -> add route stop -> add seed park -> walking route verified: ~2.1km/29min in revised UI.
- Full-screen mobile map at 390x844, no horizontal overflow, tool panel hidden initially. Mobile bottom drawer and cycling-layer toggle verified; profile and create controls remain available.
- Fixed original Liberty building fill maxzoom=14; footprints now remain visible at closer zooms with 3D disabled. Three new regression tests cover the range and independent building/place toggles.
- Latest checks: 33 tests pass in 6 files; build/typecheck pass; no console errors in tested current production preview.
- Final screenshots: docs/screenshots/map-redesign-desktop.png and docs/screenshots/map-redesign-mobile-layers.png.
- Full source-document review is in docs/REQUIREMENTS_AUDIT.md. It explicitly marks cloud/PWA/deployment/RLS requirements as pending rather than inferring them from local demo success.
