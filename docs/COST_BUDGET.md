# Bugetul demo-ului

Țintă: 0 EUR suplimentar, condiționat de planurile și cotele efective. Netlify și Supabase sunt conturi ale utilizatorului; abonamentul Netlify existent nu este inclus în acest calcul.

- Demo-ul local nu introduce un serviciu plătit.
- OpenFreeMap: hartă publică cu atribuire; serviciu extern fără garanție contractuală.
- Datele Overpass: o extragere statică bounded, servită cu aplicația. Nu există query la fiecare pan/zoom.
- Rutare: instanțe publice FOSSGIS, max 1 cerere/1,1 secunde per sesiune; fără SLA. Înainte de trafic public semnificativ trebuie un proxy cu cache și limitare agregată sau un furnizor dedicat.
- Fotografii: comprimate în browser, țintă sub 500KB; în demo sunt în IndexedDB. Cotele Storage și egress vor fi monitorizate după activarea Supabase.
- Costul total pentru aplicația publică nu este garantat până la verificarea conturilor și a consumului real. Nu se activează upgrade-uri plătite implicit.
