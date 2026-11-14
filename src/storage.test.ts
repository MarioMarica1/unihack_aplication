import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { dispatch, loadCitizenReports, loadCommunityPosts, loadState } from './storage';

describe('Persistență, tranzacții și decuplarea Sesizărilor de Comunitate', () => {
  it('pornește fără date demo sau mock-uri și separă Sesizările de Comunitate', async () => {
    const initial = await loadState();
    expect(initial.pins.some(p => p.demo)).toBe(false);

    await dispatch({
      type: 'create',
      id: 'real-report-1',
      userId: 'radu',
      input: {
        type: 'report',
        title: 'Groapă pe carosabil',
        description: 'Sesizare reală pe banda întâi de circulație.',
        category: 'Infrastructură',
        place: 'Bulevardul Revoluției',
        location: { lon: 21.228, lat: 45.756 },
        image: 'data:image/jpeg;base64,realphoto',
      },
    });

    const reports = await loadCitizenReports();
    const community = await loadCommunityPosts();
    expect(reports.map(r => r.id)).toContain('real-report-1');
    expect(community.map(c => c.id)).not.toContain('real-report-1');
  });

  it('serializează două înscrieri concurente la ultimul loc', async () => {
    const id = 'concurrency-check';
    await dispatch({
      type: 'create',
      id,
      userId: 'radu',
      input: {
        type: 'activity',
        title: 'Ultimul loc liber',
        description: 'Verificăm două înscrieri simultane.',
        category: 'Social',
        place: 'Test',
        location: { lon: 21.22, lat: 45.75 },
        startsAt: new Date(Date.now() + 3600000).toISOString(),
        endsAt: new Date(Date.now() + 7200000).toISOString(),
        capacity: 2,
      },
    });
    const results = await Promise.allSettled([
      dispatch({ type: 'join', pinId: id, userId: 'ana' }),
      dispatch({ type: 'join', pinId: id, userId: 'mihai' }),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
    const stored = await loadState();
    expect(stored.pins.find(p => p.id === id)?.participants).toHaveLength(2);
    const community = await loadCommunityPosts();
    expect(community.map(c => c.id)).toContain(id);
  });

  it('nu persistă o modificare neautorizată și păstrează datele existente', async () => {
    await expect(dispatch({ type: 'delete', pinId: 'concurrency-check', userId: 'ana' })).rejects.toThrow('autorul');
    expect((await loadState()).pins.find(p => p.id === 'concurrency-check')?.deleted).toBeUndefined();
  });
});
