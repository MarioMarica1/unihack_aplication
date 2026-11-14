# Vecin / UniHack Connected Communities

Status: local interactive demo. Original references remain in Documente_Initiale.

React + TypeScript + Vite, MapLibre/OpenFreeMap, Lucide icons. A single map stays mounted while responsive panels open. Domain validation and mutations are isolated from React. Demo records and compressed photos persist in IndexedDB; BroadcastChannel informs other tabs in the same browser. Demo identities are explicitly simulated and do not constitute authentication. No claim of cloud synchronization or production security is made for demo storage.

Supabase is the intended shared backend. Its public connection settings are kept in ignored .env.local. Before cloud enablement: migrate database with grants and RLS, configure Auth and Storage, implement repository adapter, and verify with independent accounts. Never place secret/admin keys in Vite.

Routing: live FOSSGIS OSRM servers with distinct routed-foot, routed-bike and routed-car graphs, max 7 stops. Walking is the default. Requests are serialized to at most one per 1.1 seconds in a client session. Routing failures preserve selections and never generate fictitious road geometry. Public routing has no availability guarantee. Results include the actual visit order and snapped waypoints; map numbers match visit order. Selected public/manual points are transmitted to the provider only on calculation. Backend caching/aggregate rate limits are a deployment gate before substantial public traffic.

Infrastructure: bounded static Overpass exports for [45.72,21.18,45.79,21.28]. 143 cycling segments, 218 tram track segments, 3,063 sidewalk segments, and an expanded directory of 4,227 named places/buildings. Categories include food, shops, education, health, services, culture, transport, parks, sports and named buildings. Separate line geometries and road-centerline tags are classified independently; UI renders the latter dashed. Place points derived from polygon centers may not be entrances. Source metadata and ODbL attribution accompany the export; pipeline scripts are scripts/fetch-infrastructure.mjs and scripts/expand-places.mjs. No Overpass queries are made by the running application.

Map interaction: community markers are compact by default; names appear on hover/focus or via explicit labels option. A docked sidebar owns layers, places/search, community and routes. OSM clicks open docked React details instead of floating popups. On mobile, the map opens full-screen and the dock becomes an opt-in bottom drawer. Each community type is an independent layer, separate from the list filters. Place selection can start an activity or become a route stop. Rendering an infrastructure layer does not change routing costs.

Base style: OpenFreeMap Liberty. Its original building fill has maxzoom=14 and yields to extrusions. Since this application is a 2D map, applyBaseStyle extends the fill range to 24 and disables extrusion. Building and POI visibility are independently configurable. Style JSON readiness is tracked separately from tile/worker load; overlays must not be skipped just because a viewport's tiles are still loading. Base tiles provide worldwide context; local searchable data cover the demonstration bounding box.

Demo time: initial example activities are generated relative to first initialization and marked DEMO. User-generated records are real local records. All timestamps stored as ISO instants, rendered in Europe/Bucharest. No coordinates of the visitor are persisted until explicitly selected for a published pin.

Quality gates: typecheck, production build, domain tests, browser workflows, responsive review. Cloud/RLS, device GPS and hosted HTTPS acceptance are separate pending gates.
