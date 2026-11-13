import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createSeed, demoTitlePrefix } from '../src/domain.ts';

if (process.argv.length !== 3) {
  throw new Error('Run node --experimental-strip-types scripts/seed-demo.mjs <accounts.json>');
}
try { process.loadEnvFile('.env.local'); } catch (error) { if (error.code !== 'ENOENT') throw error; }

const accounts = JSON.parse(await readFile(process.argv[2], 'utf8'));
if (!Array.isArray(accounts) || accounts.length < 2) throw new Error('Two demo accounts are required.');
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('Supabase URL and publishable key are required.');
const clients = accounts.slice(0, 2).map(() => createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
}));
const sessions = [];
const seed = createSeed();
const uuid = value => {
  const hash = createHash('sha256').update('vecin-community-demo-v1:' + value).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
};
const demoIds = new Set(seed.pins.map(pin => uuid(pin.id)));
const titleFor = pin => demoTitlePrefix + pin.title;
const unwrap = result => {
  if (result.error) throw Object.assign(new Error('Supabase request failed'), { code: result.error.code || result.error.statusCode });
  return result.data;
};
const apply = async (client, action) => unwrap(await client.rpc('vecin_apply', { action }));
const snapshot = async client => unwrap(await client.rpc('vecin_snapshot'));

try {
  for (const [index, client] of clients.entries()) {
    const result = unwrap(await client.auth.signInWithPassword(accounts[index]));
    sessions.push(result.session);
  }
  const existing = (await snapshot(clients[0])).pins;
  let created = 0;
  for (const [index, pin] of seed.pins.entries()) {
    const id = uuid(pin.id);
    if (existing.some(pin => pin.id === id)) continue;
    const client = clients[index % 2];
    const user = sessions[index % 2].user;
    let imagePath;
    if (pin.type === 'report' || pin.image) {
      const illustration = pin.type === 'report' ? 'street' : pin.id === 'seed-football' ? 'court' : 'park';
      const bytes = await readFile(new URL(`../public/illustrations/${illustration}.webp`, import.meta.url));
      imagePath = `${user.id}/${id}/${randomUUID()}.webp`;
      unwrap(await client.storage.from('vecin-photos').upload(imagePath, bytes, { contentType: 'image/webp' }));
    }
    const { type, category, place, location, startsAt, endsAt, capacity } = pin;
    const input = {
      type, category, place, location, startsAt, endsAt, capacity, imagePath,
      title: titleFor(pin),
      description: `Exemplu demonstrativ. Pin pregătit pentru prezentarea Vecin la concurs. Locația este orientativă. ${pin.description}`,
    };
    try { await apply(client, { type: 'create', id, input }); }
    catch (error) {
      // Removal is permitted only when the uploaded photo is unused.
      if (imagePath) await client.storage.from('vecin-photos').remove([imagePath]);
      throw error;
    }
    const other = clients[(index + 1) % 2];
    if (type === 'report') await apply(other, { type: 'support', pinId: id, enabled: true });
    if (type === 'activity') await apply(other, { type: 'join', pinId: id, enabled: true });
    await apply(other, {
      type: 'message', pinId: id, id: uuid(pin.id + ':message'),
      body: 'Mesaj demonstrativ. Aici vecinii pot discuta despre acest loc.',
    });
    created++;
  }
  const final = (await snapshot(clients[1])).pins.filter(pin => demoIds.has(pin.id));
  if (final.length !== seed.pins.length || final.some(pin => !pin.title.startsWith(demoTitlePrefix))) {
    throw new Error('Demo verification failed.');
  }
  console.log(JSON.stringify({ demoPins: final.length, created, reports: final.filter(p => p.type === 'report').length,
    activities: final.filter(p => p.type === 'activity').length, discussions: final.filter(p => p.type === 'discussion').length }));
} catch (error) {
  console.error(JSON.stringify({ error: error.code || error.name, message: error.code ? 'Supabase request failed' : error.message }));
  process.exitCode = 1;
} finally {
  for (const [index] of sessions.entries()) await clients[index].auth.signOut({ scope: 'local' });
}
