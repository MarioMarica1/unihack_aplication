# Urban Conect v2 — Arhitectură, Design System și Integrări de Date Urbane (Timișoara)

Acest document descrie reconstrucția completă a platformei **Urban Conect** pe ramura locală `redesign/urban-conect-v2`, păstrând **100% din funcționalitatea existentă** (compatibilitate Supabase RPC, mod demo IndexedDB, rutare OSRM, rutare GTFS SMTT, chat pe pin, salvări, autentificare Google/parolă) și extinzând-o într-o platformă urbană integrată pentru Timișoara.

---

## 1. Identitate Vizuală și Sistem de Culori (`#0F52BA`)

- **Logo-ul oficial Urban Conect este păstrat intact:**
  - Fișierele originale `/urban-connect-logo-v4.png`, `/urban-connect-logo-v4-dark.png` și `/urban-connect-icon.webp` sunt reutilizate fără nicio modificare de proporții, tipografie sau iconiță (`128×45px` pe desktop, `35×35px` pe mobil).
- **Paletă cromatică construită în jurul albastrului primar `#0F52BA`:**
  - `--brand-blue`: `#0F52BA` (acțiuni principale, stări active, rute, selecții)
  - `--brand-hover`: `#0B3F91`
  - `--brand-navy`: `#0A192F` (contrast înalt și temă dark `#0A1628`)
  - `--brand-soft`: `#EBF3FF` (fundaluri discrete, filtre active)
  - `--brand-border`: `#C5D9F8`
  - **Semantic:** Verde `#059669` (operațiuni reușite, vehicule live, sesizări finalizate), Portocaliu `#D97706` (alerte STPT, sesizări în lucru), Roșu `#DC2626` (incidente critice, erori).

---

## 2. Arhitectura Navigației și Modulele Principale

Aplicația funcționează ca **o singură platformă map-first**, în care harta MapLibre GL rămâne vie pe fundal și își păstrează poziția, nivelul de zoom și straturile active la comutarea între cele **6 module principale** și **2 vederi utilitare**:

1. **Explore (`Hartă`)**:
   - Experiența centrală a orașului: Hub de acces rapid către Transport Live, VeloTM, Sesizări Primărie și Planificator Traseu + fluxul complet de semnalări, activități și discuții din cartiere.
   - **Omni-Search global** în header: caută simultan în liniile STPT, catalogul de locuri (`places.geojson`), sesizările comunitare și sesizările oficiale ale Primăriei Timișoara.
   - **Chips-uri flotante pe hartă (`map-floating-pills`)**: comutare cu un singur tap pentru *STPT Live*, *Tramvaie*, *Autobuze*, *Troleibuze*, *Piste Velo*, *Sesizări PMT* și *Locuri*, plus popover complet de straturi.
2. **Transport (`src/TransportPanel.tsx` & `src/VehicleDetailPanel.tsx`)**:
   - **Vehicule Live**: monitorizare GPS în timp real a flotei STPT (tramvaie, autobuze, troleibuze) prin proxy-ul `/api/stpt-vehicles`, filtrare după mod și linie, și afișarea alertelor oficiale de deviere/întrerupere STPT.
   - **Inspector Vehicul Live (`VehicleDetailPanel`)**: selectarea unui vehicul direct pe hartă sau din listă afișează numărul liniei, direcția (`headsign`), stația curentă, viteza GPS, ID-ul de flotă, accesibilitatea PMR, prospețimea semnalului GPS și **următoarele opriri estimate** calculate pe geometria GTFS (`findNextVehicleStops`).
   - **Linii & Stații**: catalogul complet al celor 44 de linii SMTT/STPT cu comutare de sens, lista ordonată a stațiilor pe sens și trimitere directă a oricărei stații ca destinație în planificator.
   - **Planificator**: acces direct la motorul de rutare multimodal (STPT GTFS + mers pe jos / bicicletă / mașină).
3. **Velo & Micromobilitate (`src/VeloPanel.tsx`)**:
   - Control dedicat pentru **piste de biciclete** (`cycleways.geojson` — 143 segmente diferențiate între piste dedicate și trasee partajate), **trotuare & alei pietonale** (`sidewalks.geojson` — 5.792 segmente) și **stații VeloTM**.
   - **Directorul celor 50 de stații VeloTM** (`kind: 'bike_rental'` în `places.geojson`) cu căutare instantanee, localizare pe hartă și buton de rutare ciclo.
   - **Sesizări Velo**: filtrare automată a problemelor comunitare și municipale care afectează pistele de biciclete sau stațiile VeloTM.
4. **Sesizări Cetățenești & Integrare Primăria Timișoara (`reports` în `src/App.tsx`)**:
   - Interfață unificată care distinge clar **Sesizările Comunității Urban Conect** de **Sesizările Oficiale Primăria Timișoara (`sesizari.primariatm.ro`)**.
   - KPI-uri în timp real (Înregistrate & În lucru, Finalizate în 30 zile, Semnalări comunitare), filtrare după sursă (`Toate`, `Oficiale Primărie`, `Comunitate`), după toate cele **5 stări oficiale** (`Inregistrata`, `In lucru`, `Finalizata`, `Asteapta clarificari`, `Declinata competenta`) și după cele **19 categorii oficiale PMT**.
   - **Panou de detaliu pentru sesizările oficiale PMT**: afișează numărul de înregistrare (`SZN...`), fotografia oficială din CloudFront (`d6r4wmx5epyg3.cloudfront.net`), descrierea completă, adresa exactă (`strada` + `nrStrada`), **istoricul complet al tranzițiilor de status** încărcat din `/api/municipal-report-detail` și link direct către pagina oficială `sesizari.primariatm.ro`.
5. **Comunitate (`community` în `src/App.tsx`)**:
   - Postări comunitare, evenimente/activități cu dată și participanți, discuții de cartier, confirmări comunitare, comentarii și panou de chat redimensionabil (`pin-chat`), salvări și partajare.
6. **Oraș & Informații Publice (`src/PlacesPanel.tsx`)**:
   - **Catalog Locuri & Servicii**: 1.298 de puncte de interes din Timișoara (instituții publice, spitale/clinici, școli/universități, parcuri, cultură, sport, stații VeloTM, transport) cu filtre rapide și acțiuni pe hartă.
   - **Date Deschise & Portaluri Oficiale**: hub cu acces direct către `sesizari.primariatm.ro`, `data.primariatm.ro`, `decidem.primariatm.ro`, `live.stpt.ro`, `smtt.ro` și `primariatm.ro`.

---

## 3. Surse Reale de Date și Limite Tehnice Documentate Transparent

| Sursă | Endpoint / Dataset | Date Utilizate | Limitări / Reguli de Integritate |
| :--- | :--- | :--- | :--- |
| **Primăria Timișoara — Sesizări** | `https://sesizari.primariatm.ro/api/sesizari` & `/api/sesizari/{nr}` (prin `/api/municipal-reports` & `/api/municipal-report-detail`) | Coordonate GPS reale, 19 categorii, 5 statusuri, descriere, fotografii CloudFront, stradă + istoric statusuri | Doar citire publică (30 zile). Trimiterea oficială necesită cont pe `sesizari.primariatm.ro`; Urban Conect nu inventează niciodată numere de înregistrare sau statusuri. |
| **STPT Live — Flotă & Alerte** | `https://live.stpt.ro/gtfs-vehicles.php` & `proxy-alerts.php` (prin `/api/stpt-vehicles`) | Poziții GPS live (~75+ vehicule active), linie, sens (`headsign`), viteză, azimut, stație curentă, accesibilitate PMR, alerte devieri | Proxy server-side cu cache 8s pentru evitarea blocajelor CORS. Vehiculele cu semnal mai vechi de 15 minute sunt excluse automat. |
| **SMTT — Rețea GTFS** | `public/data/stpt-network.json` (generat din GTFS oficial SMTT) | 609 stații, 181 tipare de traseu, 44 linii (tramvai, autobuz, troleibuz) | Folosit pentru rutarea multimodală și calculul următoarelor stații ale vehiculelor live. |
| **VeloTM & Infrastructură Ciclo** | `public/data/places.geojson` (`kind: 'bike_rental'`) & `public/data/cycleways.geojson` | 50 stații VeloTM și 143 segmente de piste de biciclete din Timișoara | STPT/VeloTM nu expune un feed public GBFS pentru numărul de biciclete libere în timp real; aplicația afișează explicit această notă de transparență. |
| **OpenStreetMap & OSRM** | `routing.openstreetmap.de` (`routed-foot`, `routed-bike`, `routed-car`) + Nominatim | Geometrie rutare pietonală, ciclo și auto pe străzile din Timișoara + geocodare inversă | Nu se generează niciodată linii drepte false dacă serverul de rutare nu răspunde. |
