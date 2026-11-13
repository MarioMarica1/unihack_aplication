import { readFile } from 'node:fs/promises';
const content = await readFile(new URL('../.env.local', import.meta.url), 'utf8');
const env = Object.fromEntries(content.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.includes('=')).map(line => { const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1)]; }));
const tests = [
  ['Supabase Auth settings', `${env.VITE_SUPABASE_URL}/auth/v1/settings`, { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY }],
  ['Supabase profiles table', `${env.VITE_SUPABASE_URL}/rest/v1/profiles?select=id&limit=1`, { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY }],
  ['OpenFreeMap style', 'https://tiles.openfreemap.org/styles/positron', {}],
  ['OSRM live circuit', 'https://router.project-osrm.org/trip/v1/driving/21.2257,45.7557;21.2184,45.7503;21.2288,45.758?roundtrip=true&source=first&geometries=geojson&overview=full', {}],
];
for (const [name, url, headers] of tests) {
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
    const data = await response.json();
    console.log(JSON.stringify({ name, status: response.status, code: data.code, message: data.message, trips: data.trips?.length, distanceMeters: data.trips?.[0]?.distance }));
  } catch (error) { console.log(JSON.stringify({ name, error: error.message })); }
}
