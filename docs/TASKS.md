# Demo implementation

- [x] Domain, validation, test cases, persistent local repository
- [x] Responsive map/list/detail interface
- [x] Photo reports, support, resolve/reopen
- [x] Activities, joins, capacity, cancellation
- [x] Discussions and per-pin messages
- [x] Live round-trip routing for walking/cycling/driving, numbered stops and honest errors
- [x] Static OSM infrastructure: cycling, tramways, sidewalks, real places, legend and per-layer controls
- [x] Compact map markers with optional labels; docked place/line details; manual/OSM route stops
- [x] Supabase connectivity probe (read only; Auth 200, profiles table not yet created)
- [x] Build/typecheck, 33 tests and browser QA (desktop 1440px and mobile 390px)
- [x] UI rebuilt around a single docked sidebar: independent community/infrastructure/building/place layers, real-place search, full-screen mobile map
- [x] Expanded OSM directory: 4,227 named places/buildings; normalized search and category browsing
- [x] Liberty building-layer z14 gap fixed and regression-tested; all map controls kept at edges
- [x] Complete initial-spec audit: docs/REQUIREMENTS_AUDIT.md (cloud gaps explicitly pending)
- [ ] Cloud persistence/auth/RLS (next integration phase)
- [ ] GitHub/Netlify publication (after local demo review)

Demo preview: http://127.0.0.1:5174/ (production build). Original documentation unchanged. No cloud records written, no repository push performed. Package audit after MapLibre security update: 0 vulnerabilities.
