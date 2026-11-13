import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { dispatch, loadState } from './storage';

describe('Persistență și tranzacții demo', () => {
  it('serializează două înscrieri concurente la ultimul loc', async () => {
    const id = 'concurrency-check';
    await dispatch({ type: 'create', id, userId: 'radu', input: {
      type: 'activity', title: 'Ultimul loc liber', description: 'Verificăm două înscrieri simultane.',
      category: 'Social', place: 'Test', location: { lon: 21.22, lat: 45.75 },
      startsAt: new Date(Date.now() + 3600000).toISOString(), endsAt: new Date(Date.now() + 7200000).toISOString(), capacity: 2,
    } });
    const results = await Promise.allSettled([
      dispatch({ type: 'join', pinId: id, userId: 'ana' }),
      dispatch({ type: 'join', pinId: id, userId: 'mihai' }),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
    const stored = await loadState();
    expect(stored.pins.find(p => p.id === id)?.participants).toHaveLength(2);
  });
  it('nu persistă o modificare neautorizată și păstrează datele existente', async () => {
    await expect(dispatch({ type: 'delete', pinId: 'concurrency-check', userId: 'ana' })).rejects.toThrow('autorul');
    expect((await loadState()).pins.find(p => p.id === 'concurrency-check')?.deleted).toBeUndefined();
  });
});
