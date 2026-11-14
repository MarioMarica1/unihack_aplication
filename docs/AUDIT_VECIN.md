# Vecin — audit final online

**Adresa oficială curentă** · [urban-conect.netlify.app](https://urban-conect.netlify.app), proiectul `urban-conect` din echipa `jupan-racing`, conectat la GitHub `main`.

La mutare, buildul de pe adresa nouă a folosit același proiect Supabase. Pagina publică, linkul direct către un pin, 8 pinuri DEMO, 8 mesaje, 5 fotografii și cele patru seturi GeoJSON au fost verificate. Două sesiuni de browser au trecut conectarea cu parolă, reîncărcarea, publicarea cu fotografie, partajarea, mesajele, salvarea și participarea la activități. Datele temporare au fost retrase. Insigna Netlify acoperea butonul de deconectare pe mobil. După dezactivarea insignei, deconectarea a trecut pe desktop și la 390 px. Utilizatorul a confirmat salvarea noii adrese în Site URL și Redirect URLs din Supabase. Livrarea e-mailurilor de autentificare rămâne de testat separat.

**Auditul inițial · 12 noiembrie 2026** · [adresa testată atunci](https://vecin-unihack-2026.netlify.app) · commit `a1885190f3a7057158aef6b3e71ea34cf106cae4`. Capturile și rezultatele de mai jos consemnează acel audit.

**Verdict: pregătită pentru demonstrația de concurs cu conturi dedicate.** Nu au fost găsite blocaje în scenariile online verificate mai jos. Autentificarea cu parolă funcționează pentru cele două conturi confirmate. Înregistrarea liberă prin e-mail depinde încă de configurarea unui serviciu SMTP adecvat; serviciul implicit Supabase a atins anterior limita și restricționează destinatarii. Această limită rămâne relevantă când aplicația este distribuită prietenilor sau juriului fără conturi pregătite.

Auditul a folosit site-ul HTTPS de producție și proiectul Supabase real. Chrome 157.0.8103.39 și Edge 157.0.4341.46 au fost verificate pe Windows la 1440×900 și 1280×800. Emularea tactilă Chrome a acoperit 390×844, 320×844 și 844×390. Cele două conturi au rulat în sesiuni izolate. Datele temporare și fotografiile auditului au fost eliminate; verificarea publică finală a găsit cele 8 pinuri DEMO și niciun pin temporar rămas.

| Domeniu | Verificare online și rezultat |
| --- | --- |
| Desktop și mobil | Fără derulare orizontală la dimensiunile testate. Comenzile hărții au rămas accesibile cu panoul deschis; în orientare portret au 44×44 px. Participarea este vizibilă înaintea descrierii la 320 și 390 px. În landscape, panoul lateral se derulează. |
| Tastatură și navigare | Focus pe titlul detaliului, fără lista ascunsă dedesubt; Escape revine, iar dialogul păstrează Tab/Shift+Tab. Linkurile directe supraviețuiesc refreshului; un pin retras sau inexistent are o stare explicită. |
| Autentificare | Conectare prin interfață cu ambele conturi, sesiune păstrată după refresh, deconectare. Acțiunile vizitatorului cer autentificare; citirea pinurilor și fotografiilor este publică. |
| Sesizări și fotografie | Publicare desktop, fotografie accesibilă celuilalt cont pe mobil după refresh, editare sincronizată, confirmare/retragere, rezolvare/redeschidere. Fotografia obligatorie și fișierul cu tip invalid au fost verificate în formular. |
| Formulare mobile | Discuție publicată la 320 px. Publicarea fără locație și coordonatele goale sunt respinse; coordonatele cu virgulă sunt acceptate. Alegerea pe hartă păstrează titlul și descrierea. GPS-ul folosit la publicarea desktop a fost simulat. |
| Activități | Organizator inclus în capacitate, înscriere și retragere sincronizate între conturi, activitate pornită dintr-o sesizare și link înapoi la aceasta. Anularea închide înscrierile; activitatea rămâne în salvate și reapare în comunitate cu filtrul de istoric. |
| Conversații, salvate și raportare | Mesaj vizibil în cealaltă sesiune și după refresh, ștergere de către autor. Salvare, persistență și eliminare pe mobil. Raportare de conținut și retragerea pinului prin interfață. Meniul altui autor nu oferă editare/retragere. |
| Autorizare în Supabase | Scrierile vizitatorului, modificarea/retragerea pinului altuia, ștergerea mesajului altuia și eliminarea fotografiei folosite de alt autor au fost respinse. Salvatele sunt private. Cererile repetate pentru confirmare/înscriere nu produc duplicate. Actualizarea Realtime a ajuns în cealaltă sesiune. |
| Filtre și căutare | Cele trei tipuri controlează lista și markerii. Căutarea fără diacritice găsește pinurile; căutarea OSM găsește Cărturești și deschide sursa OSM reală. Starea fără rezultate este distinctă de eroarea de încărcare. |
| Straturi | Activare/dezactivare și comparație vizuală pentru biciclete, tramvai, trotuare, clădiri și locuri. Datele online au 143 / 218 / 3.063 / 4.227 obiecte, fiecare cu identificator unic în stratul său. Legenda și diferența dintre geometrie dedicată și etichetă pe axul străzii sunt explicate. |
| Circuite | Oprire OSM plus pin comunitar, întoarcere la start și marcaje numerotate. Pe jos: 3,9 km / 52 min; bicicletă: 4,3 km / 23 min; auto: 5,3 km / 13 min pentru exemplul verificat. Minimum două și maximum șapte opriri; a opta este respinsă. |
| Erori de servicii | Întreruperile OSM, OpenFreeMap și OSRM au fost simulate în browser. Eroarea este afișată, datele comunității rămân accesibile, iar circuitul păstrează opririle și elimină rezultatul vechi. Reîncercarea încărcării OSM și a hărții a trecut. |
| Publicare | Netlify publică automat GitHub `main`; commitul publicat a corespuns versiunii testate. Pagina principală, linkurile directe și cele patru GeoJSON funcționează prin HTTPS. |

Validare locală pentru aceeași sursă: **33/33 teste în 6 fișiere**, TypeScript și build de producție trecute. Auditul npm al dependențelor de producție a raportat **0 vulnerabilități cunoscute**. Buildul păstrează avertizarea de dimensiune pentru MapLibre: aproximativ 1,09 MB minificat / 299 kB gzip, cu worker separat de aproximativ 518 kB.

### Date pentru prezentare

Sunt disponibile **3 sesizări, 3 activități, 2 discuții, 8 mesaje și 5 ilustrații WebP**, toate marcate ca demonstrative. Cele cinci fotografii/ilustrații au răspuns HTTP 200. Activitățile sunt programate pentru **13–15 noiembrie 2026**; datele trebuie actualizate dacă prezentarea are loc ulterior. Straturile OSM au fost extrase pe 9 noiembrie și au acoperire limitată la dreptunghiul documentat în `public/data/metadata.json`, nu la întregul oraș. Nu reprezintă trafic, orare sau accesibilitate în timp real.

### Limite și verificări rămase

- **Acces public prin e-mail:** SMTP și livrarea efectivă a linkurilor trebuie finalizate pentru utilizatori fără cont pregătit. Utilizatorul a confirmat salvarea Site URL și Redirect URLs pentru Netlify; livrarea și recuperarea contului nu au fost declarate validate prin acest audit.
- **Telefon fizic și Safari/iOS:** camera, precizia GPS, tastatura virtuală și partajarea nativă mai necesită verificare pe dispozitiv real. Emularea Chrome nu le înlocuiește.
- **Rețea lentă:** cu cache gol, latență simulată 150 ms, descărcare 200.000 B/s și CPU încetinit de 4 ori, primul conținut a apărut în 3,9 s, comenzile în 6,7 s și indicatorul de încărcare a hărții a dispărut în 21,2 s. Fără erori JavaScript sau overflow; straturile GeoJSON opționale nu au fost descărcate la pornire. Măsurare orientativă pe Windows cu randare software, nu benchmark de telefon. Pentru prezentare este necesară o conexiune stabilă la furnizorii de hartă și rutare.
- **Ultimul loc:** două cereri simultane ale aceluiași cont au rămas unice în Supabase. Concurența simultană între doi utilizatori distincți pentru ultimul loc rămâne netestată pe serverul real; limita de capacitate a fost verificată separat în PostgreSQL local.

### Dovezi

[Rezultate UI: 12 scenarii trecute, fără erori JavaScript](audit-online-final/ui-results.json) · [Fluxuri autentificate și autorizare](audit-online-final/workflow-results.json) · [Date și fotografii online](audit-online-final/data-results.json) · [Măsurare cu rețea limitată](audit-online-final/performance.json)

Capturi: [desktop](audit-online-final/chrome-desktop.png), [mobil 320 px — acțiune principală](audit-online-final/mobil-320-844-activitate.png), [mobil — straturi](audit-online-final/mobil-390-844-straturi.png), [formular mobil](audit-online-final/mobil-formular.png), [circuit randat](audit-online-final/layers/desktop-final.png). Directorul `audit-online-final/layers` include comparațiile pornit/oprit pentru fiecare strat.

---

## Istoric — auditul local inițial și remedierile

Secțiunile de mai jos păstrează constatările istorice. Starea online curentă și limitele încă deschise sunt cele din auditul final de mai sus.

**12 noiembrie 2026 · build local `5e25c614a2018a3238b7c4bddc5efb4111fe919b`**

Auditul de mai jos descrie versiunea de referință. În versiunea actualizată din workspace, Comunitatea este ecranul inițial pe desktop, filtrele controlează lista și harta, iar pe mobil un singur panou lasă comenzile hărții accesibile. Publicarea cere o poziție confirmată, straturile OSM se încarcă separat, iar recalcularea circuitului elimină rezultatul anterior.

Pe 12 noiembrie 2026, migrarea și corecția contorului de sincronizare au fost aplicate în proiectul Supabase. Două conturi dedicate s-au autentificat cu parolă. Testele pe serviciul real au verificat publicarea unei discuții, mesajele și ștergerea lor de către autor, salvatele private, organizatorul inclus în capacitate, înscrierea repetată fără duplicate, retragerea și anularea activității. Fotografia sesizării a fost încărcată în Storage, citită public și a rămas accesibilă după o încercare de ștergere din contul celuilalt utilizator. Editarea și retragerea pinului altui autor au fost respinse. Confirmările repetate au rămas unice, rezolvarea și redeschiderea au trecut, iar notificarea Realtime a fost primită de celălalt cont. Datele temporare au fost retrase și fotografiile de test au fost eliminate.

Testarea pe proiectul găzduit a găsit eroarea SQL `UPDATE requires a WHERE clause`, pe care testul PostgreSQL local inițial nu o reproducea. [Corecția](../supabase/repair_revision.sql) adaugă filtrul pentru unicul rând al contorului. Migrarea inițială include acum aceeași corecție. Verificările directe au trecut după aplicare. [Configurarea Supabase](../README.md#shared-mode-on-supabase)

## Starea remedierilor în workspace

| Constatarea inițială | Rezultatul verificării după modificări |
| --- | --- |
| Datele utilizatorilor sunt izolate | Modul cloud este activ local. Două conturi reale au văzut aceleași pinuri și mesaje. Storage și Realtime au fost verificate pe proiectul găzduit. |
| Publicare într-un punct implicit | Publicarea fără locație este blocată. Alegerea pe hartă și GPS-ul păstrează formularul. |
| Panou mobil suprapus și navigare repetată | Un singur panou. Zoomul și localizarea au zone de 44×44 px și au rămas accesibile la 390 și 320 px. |
| Acțiunea principală ascunsă | Data, capacitatea și participarea apar înaintea descrierii și fotografiei. Verificate în emulare mobilă. |
| Focus în spatele detaliilor | Detaliile înlocuiesc lista. Focusul se mută la titlu, Escape revine și modalul păstrează navigarea cu Tab. |
| Contrast și ținte tactile | Confirmarea are o stare cu contrast crescut. Textele secundare sunt mai închise și comenzile mobile frecvente au zone mai mari. Evaluarea vizuală pe telefon fizic rămâne deschisă. |
| Eroare OSM mascată | Locurile și straturile se încarcă separat. Blocarea trotuarelor păstrează căutarea, iar eroarea locurilor oferă reîncercare. |
| Confirmare retrasă fără explicație | Butonul arată „Retrage confirmarea” și expune starea apăsată. Cererile repetate pentru aceeași stare nu adaugă duplicate. Verificat și în Supabase. |
| Rezultat de circuit vechi după eroare | Recalcularea elimină traseul anterior. Opririle rămân, eroarea devine vizibilă, reîncercarea a trecut. |
| Straturi tehnice dominante la pornire | Desktopul pornește în Comunitate. Opțiunile tehnice sunt în Straturi. Aspect verificat la 1440×900 și 1280×800. |
| Filtre și salvate inconsistente | Filtrele tipurilor sunt comune listei și hărții. Salvatele includ activitățile anulate. Căutarea comunitară ignoră diacriticele, iar bara globală resetează categoria locurilor. |
| Încărcare mare pentru straturi ascunse | Datele sunt cerute la nevoie și harta are chunk separat. MapLibre rămâne un chunk de aproximativ 1,09 MB minificat, 299 kB gzip. Performanța pe rețea mobilă lentă rămâne de măsurat. |

Conectarea cu parolă, persistența sesiunii după refresh și deconectarea au fost verificate în interfață pentru ambele conturi dedicate. Trimiterea de linkuri prin serviciul standard de e-mail rămâne limitată de configurația Supabase. Distribuirea pe desktop copiază linkul, iar pe dispozitive tactile folosește partajarea nativă.

Testul Chrome cu două sesiuni izolate a trecut pe Supabase real. Primul cont a publicat sesizarea și fotografia prin interfața desktop, a copiat linkul, iar al doilea cont l-a deschis la 390 px și a văzut aceeași fotografie. Confirmarea s-a salvat, mesajul trimis de al doilea cont a apărut în celălalt browser și a rămas după refresh. Pinul de test și fotografia au fost retrase după verificare. Partajarea nativă pe un telefon fizic rămâne de verificat. Buildul final și verificarea TypeScript au trecut. Suita existentă are 33 de teste trecute.

Două înscrieri concurente pentru același cont au păstrat o singură participare pe serverul real. Capacitatea și blocarea unui al treilea utilizator au fost verificate în PostgreSQL local, cu cereri succesive. Scenariul cu doi utilizatori distincți care concurează simultan pentru ultimul loc rămâne de verificat. Camera, GPS-ul fizic, Safari/iOS și publicarea pe Netlify rămân de verificat.

## Verdictul versiunii inițiale

Actualizarea pentru concurs include 8 pinuri DEMO în Supabase și verificarea separată a celor 4 straturi OSM. Toate obiectele GeoJSON au identificatori unici în stratul lor. Capturile comparative au confirmat apariția și dispariția liniilor de bicicletă, tramvai și trotuar, precum și comutarea clădirilor și denumirilor de locuri la zoom apropiat. Legenda activă și explicația pentru `sidewalk=separate` au fost clarificate. Circuitele între un loc OSM și un pin comunitar au reușit pentru toate cele trei profiluri. [Scenariul actual de demonstrație](DEMO_RUNBOOK.md)

Capturi ale verificării curente pentru [biciclete](audit-vecin/14-biciclete-verificat.png), [tramvai](audit-vecin/15-tramvai-verificat.png), [trotuare](audit-vecin/16-trotuare-verificat.png), [clădiri](audit-vecin/17-cladiri-verificat.png) și [circuit în modul cloud cu date DEMO](audit-vecin/18-circuit-demo-cloud.png).

Vecin funcționează ca demo local. Se pot publica cele trei tipuri de pin, păstra fotografia după refresh, gestiona participarea și calcula un circuit real. Harta domină ecranul, butonul de adăugare se găsește repede, iar pictogramele diferențiază pinurile. Pe telefon, interfața devine mai greu de folosit când utilizatorul trece de la hartă la o acțiune. Panourile acoperă comenzile hărții, repetă navigarea, iar detaliile unei activități pun ilustrația înaintea datei, locurilor și înscrierii.

Cele mai urgente corecții pentru demo sunt alegerea explicită a poziției la publicare, accesul la acțiunea principală în detalii și gestionarea unui singur panou pe mobil. Pentru o lansare comunitară, lipsa unui backend comun blochează criteriile de autentificare, vizibilitate între dispozitive și autorizare.

## Ce am verificat

- Buildul de producție din `dist`, servit local, cu sesiuni de browser temporare. Chrome 157.0.8103.39 pe Windows, la 1440×900 și cu emulare mobilă la 390×844 și 320×844. Edge 157.0.4341.46 pentru deschiderea și reîncărcarea unui link și izolarea datelor între browsere.
- Interacțiuni în browser, inspecția codului și comparație cu [specificația produsului, în special §3, §5 și §16](../Documente_Initiale/UniHack_Codex_Specificatie_REGENERATA.md) și [PDF-ul original de arhitectură, în special pag. 3–5 și 12–13](../Documente_Initiale/UniHack_Community_Map_Arhitectura_Codex.pdf). [Documentul de predare](../HANDOFF_AUDIT_VECIN.md) a ghidat scenariile de verificare.
- Priorități: **P0** blochează lansarea comunitară, **P1** afectează un flux principal sau accesibilitatea, **P2** reduce claritatea sau robustețea. Capturile sunt din sesiuni cu date demo sau date temporare de audit.

## Probleme și remedii

### P0 · Datele utilizatorilor nu sunt comune

**Reproducere.** În Chrome 1440×900, publică o sesizare, copiază adresa și deschide-o în Edge 1440×900, la aceeași origine. Pinul demo `/pins/seed-road` se deschide în ambele browsere. Sesizarea nouă afișează „Pin indisponibil” în Edge.

**Impact și așteptare.** Pentru o comunitate, un alt utilizator autorizat trebuie să poată deschide linkul și vedea pinul, poza și conversația. Profilurile demo pot fi schimbate de oricine în browser, iar IndexedDB și BroadcastChannel oferă persistență și actualizări numai între filele compatibile ale aceleiași origini. Autentificarea, baza de date comună, Storage, Realtime și politicile RLS lipsesc din implementarea activă.

**Remediu.** Integrează Supabase Auth, PostGIS, Storage și Realtime. Verifică politicile cu două conturi reale și două browsere, inclusiv scrieri neautorizate și înscrieri simultane pe ultimul loc. În demo, spune înainte de distribuire că un pin creat local rămâne accesibil în acel browser. [Stocare locală](../src/storage.ts) · [Profiluri, salvare și distribuire](../src/App.tsx)

### P1 · Poți publica într-un loc pe care nu l-ai ales

**Reproducere.** Chrome 1440×900 → Adaugă → Discuție → completează titlul și descrierea → Publică. Înainte de alegerea unei poziții, formularul afișează „Punctul ales” și coordonatele centrului Timișoarei. Pinul se publică acolo. Aceeași inițializare este folosită pentru sesizări și activități pornite din butonul Adaugă.

**Așteptare și remediu.** Formularul începe cu „Alege locația”. Poziția devine validă după alegere pe hartă, GPS, coordonate confirmate sau pornire dintr-un loc deja selectat. Separă poziția confirmată de centrul camerei. Pune harta sau numele locului înaintea coordonatelor numerice. [Formular la 320 px](audit-vecin/12-mobil-320-formular.png) · [Inițializare și formular](../src/App.tsx) · [Validare](../src/domain.ts)

### P1 · Panoul de pe mobil acoperă comenzile hărții și dublează navigarea

**Reproducere.** Chrome 390×844 și 320×844 → Straturi. Bara de jos și partea de sus a panoului repetă Straturi, Locuri, Comunitate și Circuit. Panoul acoperă complet ambele comenzi de zoom, localizarea, încadrarea pinurilor și zona atribuirii. Comenzile sunt accesibile din nou după închiderea panoului.

**Așteptare și remediu.** Folosește o singură navigare pe mobil, cu titlu și închidere în panoul activ. Când utilizatorul modifică straturile, lasă vizibilă o zonă a hărții unde poate vedea efectul și mută comenzile hărții și atribuirea deasupra panoului. Permite reducerea panoului fără pierderea setărilor. [390 px](audit-vecin/10-mobil-390-straturi.png) · [320 px](audit-vecin/10-mobil-320-straturi.png) · [CSS](../src/shell.css)

### P1 · Detaliile ascund acțiunea principală sub conținut secundar

**Reproducere.** Chrome 390×844 → Comunitate → „Un parc mai verde, împreună”. Primul ecran al panoului conține o bară cu două butoane de închidere, o ilustrație de 160 px, titlul, autorul și descrierea. Data, locurile rămase și „Particip și eu” apar după derulare. Pe desktop, ilustrația ocupă 175 px înaintea acțiunilor unei sesizări.

**Așteptare și remediu.** Arată în primul ecran titlul, locul, starea și acțiunea următoare. La activitate, afișează data, locurile și participarea împreună. La sesizare, afișează starea și acțiunea disponibilă profilului. La discuție, apropie conversația de titlu. Mută fotografia după rezumat sau afișeaz-o ca miniatură și păstrează o singură comandă de revenire. [Detaliu mobil](audit-vecin/11-mobil-390-detaliu.png) · [Detaliu desktop](audit-vecin/05-desktop-confirmare.png) · [Componenta de detalii](../src/App.tsx)

### P1 · Focalizarea poate ajunge în spatele detaliilor

**Reproducere.** Chrome 390×844 sau 320×844 → Comunitate → deschide primul pin. Un buton din panoul de dedesubt poate primi focus, deși detaliul îl acoperă. Testul a confirmat focus pe primul tab al panoului și că acel punct de pe ecran aparține detaliului. Escape nu închide panoul de straturi. În dialogul de creare, Tab, Shift+Tab, Escape și întoarcerea focusului la Adaugă au trecut.

**Așteptare și remediu.** Păstrează un singur panou activ pentru tastatură și cititor de ecran, mută focusul la deschiderea detaliului și întoarce-l la elementul care l-a deschis. Închide panoul activ cu Escape. Expune programatic starea selectată la navigare și filtre. [Panoul acoperit de detaliu](audit-vecin/11-mobil-390-detaliu.png) · [Structura panourilor și dialogul](../src/App.tsx)

### P1 · Contrast mic și ținte tactile înguste

**Reproducere.** Chrome 1440×900 → confirmă o sesizare și păstrează cursorul pe „Confirmat de tine”. Raportul de contrast măsurat din stilurile afișate este 1,56:1 la hover, 3,60:1 pentru taburile inactive și 2,93:1 pentru descrierile straturilor pe alb. În emularea mobilă, zoomul măsoară 36×36 px, localizarea 38×38 px, iar markerii 32×32 px.

**Așteptare și remediu.** Verifică raportul de contrast pe toate stările, inclusiv selectat, hover și focus, și folosește zone tactile de aproximativ 44×44 px pentru acțiunile frecvente, conform specificației. Markerul poate rămâne compact în interiorul zonei tactile. Tradu și numele comenzilor de zoom pentru tastatură și cititoare de ecran. [Confirmare](audit-vecin/05-desktop-confirmare.png) · [Hartă mobilă](audit-vecin/09-mobil-320-start.png) · [Stiluri](../src/styles.css) · [Suprascrieri responsive](../src/shell.css)

### P1 · Erorile de date OSM sunt mascate în căutare

**Reproducere.** Chrome 1440×900 → blochează `/data/sidewalks.geojson` → reîncarcă → Locuri. Panoul afișează „Se încarcă locurile orașului…”, „0 rezultate” și „Niciun loc găsit” în același timp. Recuperarea funcționează după deblocare din Straturi → Reîncearcă încărcarea. Blocarea separată a stilului OpenFreeMap afișează o eroare a hărții și butonul de retry a funcționat după deblocare.

**Așteptare și remediu.** Arată stări distincte de încărcare, rezultate goale și eroare cu reîncercare în Locuri. Încarcă locurile și fiecare strat tematic independent, astfel încât un eșec la trotuare să nu scoată căutarea din funcțiune. [Eroarea datelor](audit-vecin/08-desktop-date-osm-eroare.png) · [Eroarea hărții de bază](audit-vecin/13-desktop-harta-eroare.png) · [Încărcarea datelor](../src/infrastructure.ts) · [Locuri](../src/PlacesPanel.tsx)

### P2 · Confirmarea se retrage printr-un buton etichetat ca stare

**Reproducere.** Chrome 1440×900 → ca Ana, pe o sesizare nouă a lui Radu, apasă „Confirm și eu” → „Confirmat de tine” → „Confirm și eu”. Numărul urmează 0 → 1 → 0 → 1. Nu apar duplicate, însă apăsarea butonului „Confirmat de tine” retrage confirmarea fără să spună ce urmează să facă.

**Așteptare și remediu.** Expune starea apăsată și etichetează explicit retragerea sau oferă o comandă separată de anulare. [Captură](audit-vecin/05-desktop-confirmare.png) · [Acțiune și etichetă](../src/App.tsx) · [Regula de confirmare](../src/domain.ts)

### P2 · Rezultatul circuitului și eroarea ajung sub acțiune

**Reproducere.** Chrome 1440×900 → generează un circuit. Traseul se vede pe hartă, iar kilometrii și durata sunt sub buton, în zona de scroll a panoului. Blochează cererea de rutare și apasă din nou fără să schimbi opririle. Apare eroarea, iar traseul și rezumatul anterior rămân afișate cu eticheta „Circuit calculat”.

**Așteptare și remediu.** Adu rezultatul sau eroarea în zona vizibilă după apăsare. Marchează explicit rezultatul anterior când reîncercarea eșuează. Folosește o secțiune compactă pentru distanță, durată și retur, apoi lista ordonată. Pune „Adaugă oprire” într-un singur loc din care poți alege comunitatea, un loc OSM sau harta. [Circuit calculat](audit-vecin/06-desktop-circuit.png) · [Starea de eroare](audit-vecin/07-desktop-circuit-eroare.png) · [Planificator](../src/App.tsx)

### P2 · Straturile tehnice domină pornirea pe desktop

**Reproducere.** Chrome 1440×900 → deschide aplicația. Panoul implicit prezintă configurarea straturilor, cu explicații și numărători. Legenda și opțiunea etichetelor sunt sub zona vizibilă. Activând simultan mobilitatea și toate etichetele, liniile de infrastructură se suprapun peste străzi, iar etichetele pinurilor ocupă zone din hartă. Pe 320 px, câmpul de căutare taie textul exemplului, iar unele valori ale formularului sunt trunchiate.

**Așteptare și remediu.** La intrare, pune la îndemână cele trei tipuri de pin și acțiunile de explorare. Grupează clădirile, etichetele și mobilitatea sub „Straturi hartă”, cu legendă compactă lângă straturile active. Simplifică textele la „Caută locuri” și „Adaugă în comunitate”. La 320 px, stivuiește câmpurile care pierd text în două coloane. [Pornire desktop](audit-vecin/01-desktop-start.png) · [Suprapuneri](audit-vecin/02-desktop-straturi.png) · [Formular îngust](audit-vecin/12-mobil-320-formular.png)

### P2 · Filtrele, salvatele și căutarea au reguli greu de dedus

**Reproducere.** Chrome 1440×900 → Comunitate → caută `langa parc`, apoi `lângă parc`. Prima căutare dă zero rezultate, a doua găsește sesizarea. Locuri → Sănătate → scrie `carturesti` în bara de sus. Rezultatele rămân filtrate la Sănătate și apar când revii la Toate.

**Inspecție de cod.** Filtrul din Comunitate afectează lista, iar comutatorul cu același tip din Straturi afectează harta. Filtrul de tip se păstrează când intri în Salvate. O activitate salvată poate fi ascunsă după încheiere sau anulare, iar opțiunea de afișare apare doar cu filtrul Activități.

**Remediu.** Folosește aceleași reguli de căutare și afișează în apropierea rezultatelor filtrele active. Sincronizează filtrul comunitar între hartă și listă sau denumește clar scopul fiecărei comenzi. La intrarea în Salvate, arată toate pinurile salvate și starea activităților. [Rezultat zero cu filtrul Sănătate](audit-vecin/04-desktop-cautare-filtru.png) · [Filtre și salvate](../src/App.tsx) · [Căutare OSM](../src/PlacesPanel.tsx)

### P2 · Încărcare inițială mare pentru opțiuni ascunse

**Dovadă.** Chrome 1440×900 a solicitat de la pornire toate cele cinci fișiere de date. Dimensiunea decodată totală este aproximativ 2,29 MB, inclusiv ~1 MB de trotuare, cu stratul oprit. Buildul produce ~1,47 MB JS principal minificat, 418 kB gzip, și ~518 kB worker. Timpul pe telefon real și pe o conexiune mobilă limitată rămâne de măsurat.

**Remediu.** Încarcă separat datele straturilor la activare, măsoară costul hărții și mută inițializarea funcțiilor secundare după primul ecran utilizabil. [Încărcare OSM](../src/infrastructure.ts) · [Pornirea datelor în aplicație](../src/App.tsx)

## Verificarea criteriilor de acceptare

| Criteriul din §16 | Rezultat în această revizie |
| --- | --- |
| Vizitator pe Netlify vede hartă, markeri, filtre și legendă | **Local verificat.** Hartă OpenFreeMap, 8 markeri inițiali în DOM, filtre, legendă prin derulare. Publicarea efectivă și markerii din DB rămân neverificați. |
| GPS explicit, refuzul permite continuarea | **Verificat în Chrome.** Refuzul a dat mesaj și Comunitate a rămas utilizabilă. Permisiunea acordată cu poziție simulată a creat markerul GPS. |
| Sesizare cu fotografie și punct ales | **Verificat local.** PNG de 1600 px a devenit WebP de 1400 px. Un TXT a fost respins. Titlul și fotografia au rămas la revenirea din alegerea pe hartă. La 390 px, un JPEG a fost publicat cu poziția GPS simulată și a rămas după refresh. Autentificarea reală lipsește. |
| Sesizarea și fotografia persistă după refresh | **Verificat** la aceeași origine și în același browser. |
| Al doilea profil confirmă fără dubluri | **Verificat** cu Ana și Radu. Repetarea retrage confirmarea. |
| Doi utilizatori scriu în timp real în chat | **Parțial.** Mesaje bidirecționale într-o discuție independentă, în două file cu profiluri diferite, vizibile fără refresh și persistente după refresh. Chatul între dispozitive nu este disponibil. |
| Activitate independentă, înscriere și retragere | **Verificat local.** Organizator inclus, Ana ocupă ultimul loc, Mihai este blocat, Ana se retrage, Radu anulează activitatea. |
| Capacitate la înscriere simultană | **Verificat automat pentru IndexedDB.** Concurența între utilizatori reali rămâne de testat după implementarea backendului. |
| Discuție independentă | **Verificat local** fără imagine, dată sau sesizare asociată. |
| Filtre și straturi distincte | **Verificat.** Au fost comutate independent cele trei tipuri (3 sesizări, 3 activități, 2 discuții), clădirile, locurile, etichetele și straturile de mobilitate. A fost selectată o linie de tramvai și afișată proveniența. |
| Circuit real cu 3–5 opriri și retur | **Verificat cu 3 opriri**, din pin comunitar, Cărturești și punct manual. HTTP 200 pentru fiecare profil live, markeri S/1/2/3 și rezumat cu retur. Exemplul a dat 5,3 km / 69 min pe jos, 5,4 km / 24 min cu bicicleta și 6,0 km / 13 min auto. O oprire ține generarea dezactivată, iar a opta oprire este respinsă. |
| Mesaj util la eroare de rutare | **Verificat cu blocarea cererii.** Opririle și rezultatul anterior rămân vizibile. După deblocare, reîncercarea a primit HTTP 200. |
| Datele altui utilizator sunt protejate | **Restant.** Reguli locale există. Politici RLS, autentificare și protecția fotografiilor pe server lipsesc. |
| Deep link după refresh pe mobil | **Verificat local.** Pinul demo s-a deschis direct și după refresh în Chrome la ambele lățimi mobile și în Edge desktop. Linkul unui pin creat local a afișat „Pin indisponibil” în Edge. |
| Fără secrete în bundle și repo | **Verificare limitată.** Căutare după câteva semnături uzuale în surse, fișiere publice și build, fără potriviri. Git listează doar `.env.example` dintre fișierele `.env*`. Istoricul complet și configurația găzduită nu au fost auditate. |

Am mai verificat salvarea unui pin după refresh, editarea, rezolvarea și redeschiderea unei sesizări, căutarea `carturesti` și un termen fără rezultat, zoom, deplasarea hărții și încadrarea pinurilor. La 390 și 320 px, lățimea paginii și a dialogului a rămas în limitele viewportului. Capturile de pornire [390 px](audit-vecin/09-mobil-390-start.png) și [320 px](audit-vecin/09-mobil-320-start.png) arată că în cadrul inițial îngust se vede un singur pin demo. [Cărturești selectat](audit-vecin/03-desktop-loc-osm.png) · [Detalii la 320 px](audit-vecin/11-mobil-320-detaliu.png) · [Formular la 390 px](audit-vecin/12-mobil-390-formular.png)

## Ordinea propusă pentru demo

1. **Publicare și detalii.** Cere o poziție confirmată. Deschide detaliile cu titlu, stare și o singură acțiune principală. La 390 px trebuie să poți vedea data, locurile și înscrierea fără scroll.
2. **Navigare mobilă.** Păstrează bara de jos, un singur panou activ, o singură închidere și acces la comenzile hărții. Verifică Tab, Escape, focus și zonele tactile pe cele două lățimi.
3. **Explorare și circuit.** Arată filtrele active, pune opțiunile tehnice în Straturi, scurtează formularele și adu rezultatul circuitului în zona vizibilă. Repetă testele cu datele OSM și rutarea blocate.

Pentru lansarea comunitară, criteriul de trecere este ca două persoane pe dispozitive diferite să poată deschide același pin nou, vedea fotografia, conversa și ocupa corect ultimul loc, cu accesul de scriere controlat pe server.

## Comenzi și limite

| Verificare | Rezultat |
| --- | --- |
| `npm.cmd run typecheck` | Cod de ieșire 0. |
| `npm.cmd test` | 33/33 teste, 6/6 fișiere. Director temporar de lucru setat în cache-ul proiectului pentru Vitest. |
| `npm.cmd run build` | Cod de ieșire 0. Vite a semnalat dimensiunea chunkurilor și două adnotări Rollup din Zod. |
| Consolă și rețea | Nicio excepție JavaScript necontrolată observată în scenariile rulate. Cererile anulate în timpul navigării pe hartă și blocările simulate au fost înregistrate separat de răspunsurile live reușite. |

Auditul a folosit emulare de mobil și geolocație simulată. Camera telefonului, Safari/iOS, un dispozitiv fizic, distribuirea nativă, deploymentul Netlify și criteriile Supabase nu au fost validate. Unele scenarii din automatizarea de audit au necesitat reluare din cauza selectorilor ambigui când lista și detaliul afișau același titlu. Tabelul folosește rezultatele reluate. Livrabilul este raportul și capturile din această sesiune.
