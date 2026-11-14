# Vecin — predare pentru audit vizual și funcțional

Vecin este demo-ul pentru UniHack 2026 / The Bloom / Connected Communities. Aplicația folosește harta Timișoarei pentru a găsi locuri și pentru a crea sesizări, activități, discuții și circuite. Ultima revizie din repo a mutat comenzile în bara de sus și în panoul lateral, a separat straturile comunității și a adăugat căutare în datele OpenStreetMap. Pe mobil, harta ocupă ecranul, iar instrumentele se deschid într-un panou inferior.

## Unde se află proiectul și ce versiune verifici

- **Folder pe PC:** `C:\Users\racrenicean\OneDrive - eltrex.ro\Desktop\UnihackProiect`. Comenzile se rulează din acest folder, unde se află `package.json`.
- **Git:** repo privat `Crenicean-Radu/unihack_connected_comunities`, remote `origin`, ramura `main`. Pentru clonare ai nevoie de un cont GitHub cu acces la repo. [GitHub](https://github.com/Crenicean-Radu/unihack_connected_comunities/tree/main)
- **Versiunea de referință:** `5e25c614a2018a3238b7c4bddc5efb4111fe919b`, commitul cu demo-ul și documentele proiectului. Notează SHA-ul efectiv testat dacă proiectul a evoluat între timp. [Commitul de referință](https://github.com/Crenicean-Radu/unihack_connected_comunities/commit/5e25c614a2018a3238b7c4bddc5efb4111fe919b)
- Pe același PC poți deschide direct folderul. Pe alt PC poți folosi `git clone https://github.com/Crenicean-Radu/unihack_connected_comunities.git`, apoi deschizi folderul clonat `unihack_connected_comunities`.

## Ce fișiere să deschizi

Toate căile de mai jos sunt relative la rădăcina proiectului.

| Cale | Ce găsești acolo |
| --- | --- |
| `Documente_Initiale/UniHack_Codex_Specificatie_REGENERATA.md` | Specificația inițială. Secțiunea 16 conține criteriile de acceptare. |
| `Documente_Initiale/UniHack_Community_Map_Arhitectura_Codex.pdf` | Al doilea document original, cu arhitectura și fluxurile propuse. |
| `README.md`, `docs/REQUIREMENTS_AUDIT.md` | Pornire, funcții implementate și comparația cu cerințele. Folosește starea Git de mai sus pentru informațiile despre publicarea în repo, deoarece auditul inițial a fost scris înainte de push. |
| `docs/DEMO_RUNBOOK.md`, `docs/screenshots/` | Verificări istorice și capturi pentru comparație. Capturile ultimei revizii sunt `map-redesign-desktop.png` și `map-redesign-mobile-layers.png`. |
| `src/App.tsx`, `src/shell.css`, `src/styles.css` | Interfața principală, navigarea, formularele, detaliile și stilurile desktop/mobil. |
| `src/MapCanvas.tsx`, `src/MapLayersPanel.tsx`, `src/PlacesPanel.tsx`, `src/map-style.ts` | Harta MapLibre, markerii, straturile, căutarea locurilor și stilul OpenFreeMap Liberty. |
| `src/domain.ts`, `src/storage.ts`, `src/routing.ts`, `src/infrastructure.ts` | Reguli, validare, date demo, persistență în browser, rutare și prelucrarea datelor OSM. |
| `src/*.test.ts`, `public/data/`, `scripts/` | Testele Vitest, exporturile GeoJSON și scripturile de verificare sau actualizare a datelor și serviciilor. `public/data/metadata.json` documentează extragerea OSM. |
| `netlify.toml`, `.env.example` | Configurația pregătită pentru build și publicare pe Netlify, respectiv variabilele planificate pentru integrarea cloud. |

## Cum pornești și verifici versiunea

Folosește Node.js 22.12+ sau 24 LTS. Pentru un checkout nou, rulează în PowerShell:

```powershell
git status --short --branch
git remote -v
git rev-parse HEAD
npm.cmd ci
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run dev
```

Deschide [demo-ul local](http://127.0.0.1:5173/). Pentru verificarea buildului din `dist`, pornește `npm.cmd run preview -- --port 5174` și deschide [previzualizarea buildului](http://127.0.0.1:5174/). Pe macOS și Linux, folosește `npm` în loc de `npm.cmd`. Versiunea de referință are 33 de teste automate în șase fișiere. Testele Vitest acoperă logica, persistența, datele geografice și rutarea, iar aspectul și traseele din interfață trebuie verificate în browser.

Dacă Vitest se oprește înainte să ruleze testele cu `EPERM ... rename` în directorul temporar al mediului Codex pe Windows, setează `TEMP` și `TMP` pentru sesiunea PowerShell la un director cu acces de scriere, de exemplu `node_modules/.cache/vecin-audit-temp`, creat în prealabil. În această verificare, rerularea cu acel director a trecut toate cele 33 de teste.

## Ce să testezi în browser

| Zonă | Pași și rezultat așteptat |
| --- | --- |
| Aspect desktop și mobil | Verifică la 1440×900, 390×844 și 320 px lățime. Harta rămâne lizibilă, comenzile sunt aliniate la margini, panoul lateral sau inferior rămâne utilizabil și nu apare scroll orizontal. Încearcă zoom, deplasarea hărții, deschiderea panourilor, navigarea cu Tab și închiderea dialogurilor cu Escape. Verifică indicatorul de focus și dacă legenda ori detaliile acoperă comenzi importante. |
| Hartă și straturi | Activează și dezactivează separat Sesizări, Activități și Discuții. Verifică dacă dispar doar markerii stratului ales. Repetă pentru etichete, clădiri și straturile de biciclete, tramvai, trotuare și locuri. Apropie harta și verifică forma clădirilor și numele. Selectează un obiect și verifică dacă detaliile explică ce reprezintă și de unde vin datele. |
| Căutare și salvare | Caută `carturesti`, alege un rezultat OSM, verifică poziționarea și detaliile. Caută și un termen fără rezultate. Salvează un pin, verifică secțiunea cu elemente salvate, reîncarcă pagina și verifică dacă apare în continuare. |
| Sesizări | Creează o sesizare, alege punctul pe hartă și verifică dacă formularul păstrează datele deja introduse. Încearcă o imagine PNG/JPG și un tip invalid. Reîncarcă și verifică fotografia. Schimbă profilul demo și testează confirmarea o singură dată. Revino la autor pentru editare, rezolvare și redeschidere. |
| Activități și discuții | Creează o activitate cu două locuri, inclusiv organizatorul. Înscrie un al doilea profil, verifică blocarea când activitatea e plină, apoi retrage-l. Verifică anularea din profilul organizatorului. Creează separat o discuție și verifică apariția mesajelor în două file cu aceeași adresă, apoi după refresh. |
| Circuite și GPS | Combină un pin, un loc OSM și un punct ales manual. Testează pe jos, cu bicicleta și auto. Verifică ordinea numerotată, întoarcerea, distanța și durata. Încearcă o singură oprire, limita de șapte și o încercare de a adăuga a opta. Blochează temporar cererile OSRM din DevTools și verifică mesajul de eroare, păstrarea opririlor și reîncercarea. Verifică și refuzul permisiunii GPS. Notează separat dacă GPS-ul a fost verificat pe telefon fizic. |
| Linkuri și erori | Deschide direct URL-ul unui pin demo și reîncarcă-l în previzualizarea buildului. Urmărește consola și cererile de rețea. Salvează capturi ale problemelor vizuale și notează dacă eroarea vine din aplicație, serviciul de hartă sau serviciul de rutare. |

## Date și limitele auditului

Demo-ul pornește cu date de exemplu și profiluri simulate. Sesizările, fotografiile, activitățile și mesajele sunt salvate în IndexedDB, în profilul de browser și la adresa unde rulează aplicația. Filele aceleiași adrese pot primi actualizări prin BroadcastChannel. Porturile 5173 și 5174 au stocare separată. Pentru o sesiune curată folosește un profil separat de browser, ca să păstrezi datele locale existente.

Supabase este planificat pentru conturi reale, acces controlat și sincronizare între dispozitive. Demo-ul rulează fără configurare Supabase. `netlify.toml` pregătește buildul pentru Netlify, iar verificarea de aici vizează aplicația locală. Harta OpenFreeMap și rutele publice OSRM necesită internet. Straturile GeoJSON incluse au acoperire limitată la zona extrasă, iar poziția unui loc poate fi centrul clădirii în locul intrării.

## Rezultatul cerut de la AI-ul care face auditul

Verifică aplicația prin interfața ei obișnuită și compară fluxurile cu cele două documente originale. Pentru fiecare problemă consemnează prioritatea, browserul și dimensiunea ferestrei, pașii de reproducere, comportamentul așteptat și observat, o captură pentru problemele vizuale și fișierul probabil implicat. Atașează rezultatele comenzilor de verificare și marchează ce ai testat efectiv, ce a eșuat, ce nu ai putut verifica și ce rămâne de implementat. Livrează întâi raportul de audit.
