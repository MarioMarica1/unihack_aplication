# Verificarea specificației inițiale — 9 noiembrie 2026

Surse: Documente_Initiale/UniHack_Codex_Specificatie_REGENERATA.md (toate cele 19 secțiuni) și PDF-ul de arhitectură aferent, 14 pagini. Acestea sunt specificațiile de produs furnizate. Nu există un fișier separat de regulament al concursului în folder.

## Regula de evaluare

Un demo local nu dovedește conformitatea cloud. Un test de logică în browser nu dovedește RLS, autentificare sau concurență server-side. Statusul de mai jos descrie implementarea observată, nu funcții presupuse. Deciziile acceptate ulterior în conversație au prioritate: Community Hero a fost înlocuit cu Connected Communities; organizatorul ocupă un loc; confirmările nu creează un statut oficial; activitățile au început și sfârșit; autorul rezolvă/redeschide sesizarea.

## Toate secțiunile documentului

| Secțiune | Cerință și rezultat verificabil | Stare actuală |
|---|---|---|
| 1. Produs și decizii | React/Vite/TypeScript, MapLibre/OpenFreeMap, Netlify, Supabase; tipuri independente; hartă principală; fără plăți/microservicii/AI costisitor | Stack și fluxuri locale implementate. Backend Supabase este neimplementat, nu finalizat. |
| 2. Priorități | P0 hartă/cont/publicare foto/activități/discuții; P1 realtime/circuit/OSM/confirmări; P2 separat; P3 exclus | Demo interactiv pentru fluxuri. Persitența DB, conturile reale și realtime cloud sunt restante P0/P1. P2 trotuare/deep link/legătură sesizare-activitate sunt locale. P3 nu a fost adăugat. |
| 3. Fluxuri complete | Creare, validare, GPS/manual, participare, mesaje, circuit 2–7 opriri, refuzuri și reîncercare | Testate local. GPS pe telefon și erorile de upload/cloud sunt nevalidate. Local draft este păstrat la alegerea pe hartă și erori de salvare. |
| 4. Arhitectură | UI → Supabase Auth/DB/Storage/Realtime; adaptor de rutare; lon/lat consecvent | Adaptor rutare real pentru trei rețele, coordonate testate. Repository demo IndexedDB; arhitectura cloud cerută nu este activă. |
| 5. Ecrane și UX | Hartă dominantă, căutare, filtre, detalii laterale/bottom sheet, creare, rutare, login, profil, stări și accesibilitate | Reorganizare completă: header compact, panou lateral cu Straturi/Locuri/Comunitate/Circuit, markeri compacți și hartă Liberty. Pe telefon: hartă pe ecran și panou inferior închis inițial. Rutele login/profile și PWA install rămân restante. |
| 6. Structura surselor | Separare funcționalități, UI, servicii, migrații, teste, documentație; Router/Query/Zod | MapCanvas, MapLayersPanel, PlacesPanel, domain/storage/routing și teste separate; Zod activ. App încă include formulare și conversații; refactorizarea pe features, Router/Query și directorul migrațiilor nu sunt finalizate. |
| 7. Date și integritate | profiles/pins/details/messages/supports/participants; PostGIS/GIST, FK/CHECK, RPC atomică, bbox, paginare | Nu există încă schema Postgres a aplicației. Reguli echivalente doar în demo; nu pot substitui integritatea DB sau interogările spațiale. |
| 8. RLS și securitate | Scriere autentificată, author_id auth.uid, politici tabele/storage, limite, fără secrete publice, moderare | Cheia publică în .env.local ignorat; nicio cheie administrativă în client. Validare/escape React prezente. RLS, politici Storage, rate limit server și moderare reală restante. Identitățile demo nu sunt o limită de securitate. |
| 9. Fotografii | MIME/limită/resize/WebP, fără EXIF, upload + DB cu cleanup | JPG/PNG/WebP, max 15MB la intrare, re-encodare max 1400px, țintă sub 500KB/max 1MB, salvare locală testată. Upload Storage, validare server și curățare orfani cloud restante. |
| 10. OSM și straturi | Atribuire, export static, biciclete/tramvai/trotuare, semantică corectă, fără autocomplete Nominatim public | Exporturi reale bounded, fără cereri Overpass la navigare. Stil Liberty cu clădiri și POI, căutare locală a locurilor denumite. Geometriile dedicate vs etichete pe axul străzii explicate în legendă. Lipsa unui obiect în OSM nu dovedește absența lui. |
| 11. Rutare | Start GPS/manual, 2–7 opriri, rețea reală, ordine din provider, retur, distanță/durată, fallback onest | OSRM/FOSSGIS foot/bike/car verificate separat, opriri comunitate/OSM/manuale, numerotare și retur. Fără linii fictive sau trafic live. Plafon per sesiune 1 cerere/1,1s; protecție agregată/cache server restante înainte de trafic public semnificativ. |
| 12. Hosting și stocare | Netlify + Supabase cloud pentru aplicația publică; local doar dezvoltare/demo | Demo local la 127.0.0.1:5174. Nu este încă soluția publică multiutilizator din specificație. |
| 13. Cost | 0 EUR suplimentar condiționat de cote, compresie și trafic, verificare planuri | Niciun serviciu plătit introdus. Nu s-a demonstrat consum la scară, backup sau cote pentru aplicația publică. Bugetul este un obiectiv, nu garanție. |
| 14. Netlify/config | npm build/dist, SPA fallback, variabile publice vs secrete, HTTPS/auth redirects | netlify.toml și build local prezente; .env.example și .env.local. Nu există deployment Netlify sau redirect-uri Auth verificate. |
| 15. Etape/DoD | Documente, livrabile incrementale, build/types/teste/console/RLS, progres real | Build/types și teste automate locale. TASKS/ARCHITECTURE/DEMO_RUNBOOK actualizate. Nicio fază cloud nu trebuie declarată completă fără teste RLS și doi utilizatori reali. |
| 16. Acceptare | Lista completă de mai jos | Local demo nu reprezintă trecerea criteriilor cloud. |
| 17. Riscuri | Quota/pause/provider/OSM/participare/foto/deep links/GPS/scope | Erori de hartă/rutare și coordonate manuale prezente. Fallback pentru cloud offline/pause, backup și restaurare neimplementate. |
| 18. Instrucțiuni implementare | Incremental, integrare reală, documente, migrații, seed, verificări, fără chei inventate | Implementare locală incrementală și date OSM reale. Integrarea Supabase și migrațiile lipsesc; proiectul nu poate fi numit conform integral. |
| 19. Referințe | Documentații oficiale pentru verificare înainte de publicare | OpenFreeMap, FOSSGIS/OSRM și politicile lor consultate. Configurarea cloud/deploy va necesita verificarea serviciilor și a planurilor efective. |

## Lista de acceptare din secțiunea 16

| Criteriu | Stare |
|---|---|
| Vizitator pe Netlify vede harta/filtre/legendă/markeri publici | Funcționează local; publicarea Netlify și markerii DB restante. |
| Localizare explicită, refuzul nu blochează harta | Interfață și fallback implementate; telefon real nevalidat. |
| Utilizator autentificat creează sesizare foto | Numai profil demo și salvare locală; cont/Storage/DB restante. |
| Sesizare și fotografie după refresh | Verificat în același browser, nu în cloud. |
| Al doilea utilizator confirmă o singură dată | Verificat cu profiluri demo; garanția DB restantă. |
| Chat între doi utilizatori în timp real | Verificat între file ale aceluiași browser; realtime Supabase restant. |
| Activitate independentă, înscriere și retragere | Flux local implementat și verificat. |
| Capacitate la două înscrieri simultane | Tranzacție IndexedDB testată; RPC server restantă. |
| Discuție independentă | Verificat local. |
| Filtre, tipuri și straturi | Refăcute ca straturi independente, separate de lista comunității; date geografice reale. |
| Circuit 3–5 opriri cu retur și rezumat | Limita 2–7 implementată; servicii și ordinea providerului testate. UI verificată cu două opriri + start; scenariul complet 3–5 rămâne de rulat pe deployment. |
| Eroare de rutare fără căderea aplicației | Răspunsuri invalide testate; selecția este păstrată. |
| Cereri neautorizate nu modifică datele altuia | Reguli locale testate. RLS/backend real restant. |
| Deep links după refresh pe mobil | Local /pins/:id funcționează. Hosted HTTPS și cross-device restante. |
| Fără secrete în bundle/repository | Fără secrete administrative; publishable key este publică. Nu există push/deployment în această etapă. |

## Ce se schimbă în această revizie UI

Comenzile nu mai stau în mijlocul hărții. Straturile comunității și infrastructurii sunt în același panou lateral. Detaliile pinurilor și ale locurilor înlocuiesc conținutul lateral; pe telefon sunt panouri inferioare. Harta folosește Liberty, include clădiri, adrese la zoom apropiat și nume de locuri din tile-uri și din extragerea OSM. Căutarea funcționează fără diacritice și are categorii. Markerii comunității sunt compacți; numele lor apar la hover/focus sau prin opțiunea explicită de etichete.

Restanța majoră următoare este backendul comun, nu încă un strat vizual. Pentru activare sunt necesare schema SQL, politici RLS/Storage, adaptor Supabase, autentificare și verificare pe două conturi/dispozitive; cheia publică primită nu permite administrarea schemei.
