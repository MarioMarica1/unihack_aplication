const coordinates = '21.2257,45.7557;21.2184,45.7503;21.2288,45.758';
for (const profile of ['car','foot','bike']) {
  const url = `https://routing.openstreetmap.de/routed-${profile}/trip/v1/driving/${coordinates}?roundtrip=true&source=first&geometries=geojson&overview=full`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'Vecin-UniHack-demo/0.2' } });
    const result = await response.json();
    console.log(JSON.stringify({ profile, status: response.status, code: result.code, trips: result.trips?.length, distance: result.trips?.[0]?.distance, duration: result.trips?.[0]?.duration, points: result.trips?.[0]?.geometry?.coordinates?.length }));
  } catch (error) { console.log(JSON.stringify({ profile, error: error.message })); }
  await new Promise(resolve => setTimeout(resolve, 1100));
}
