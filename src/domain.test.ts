import { describe, expect, it } from 'vitest';
import { activityState, createSeed, distance, formSchema, mutate } from './domain';
import type { FormInput, State } from './domain';

const report = (): FormInput => ({ type: 'report', title: 'O problemă în parc', description: 'Descriere suficient de detaliată.', category: 'Curățenie', place: 'Parc', location: { lon: 21.22, lat: 45.75 }, image: 'data:image/webp;base64,demo' });
const activity = (): FormInput => ({ type: 'activity', title: 'Activitate de test', description: 'O activitate pentru vecinii noștri.', category: 'Social', place: 'Parc', location: { lon: 21.22, lat: 45.75 }, startsAt: new Date(Date.now() + 3600000).toISOString(), endsAt: new Date(Date.now() + 7200000).toISOString(), capacity: 2 });
const make = (input = report()) => mutate(createSeed(), { type: 'create', id: 'new', input, userId: 'radu' });

describe('Publicare și validare', () => {
  it('nu publică o sesizare fără fotografie sau coordonate valide', () => {
    expect(formSchema.safeParse({ ...report(), image: undefined }).success).toBe(false);
    expect(formSchema.safeParse({ ...report(), location: { lat: 181, lon: 400 } }).success).toBe(false);
  });
  it('o discuție este independentă de fotografie și activități', () => {
    expect(formSchema.safeParse({ ...report(), type: 'discussion', category: 'Întrebare', image: undefined }).success).toBe(true);
  });
  it('validează cronologia activității și capacitatea', () => {
    expect(formSchema.safeParse({ ...activity(), endsAt: new Date().toISOString() }).success).toBe(false);
    expect(formSchema.safeParse({ ...activity(), capacity: 0 }).success).toBe(false);
    expect(formSchema.safeParse({ ...activity(), capacity: 1.2 }).success).toBe(false);
  });
  it('reluarea aceleiași publicări nu dublează pinul și nu modifică originalul', () => {
    const original = createSeed(); const state = mutate(original, { type: 'create', id: 'new', input: report(), userId: 'radu' });
    expect(original.pins.some(p => p.id === 'new')).toBe(false);
    expect(mutate(state, { type: 'create', id: 'new', input: report(), userId: 'radu' }).pins.filter(p => p.id === 'new')).toHaveLength(1);
  });
});
describe('Reguli de autor și confirmări', () => {
  it('alt utilizator nu poate edita, șterge sau rezolva pinul', () => {
    const state = make();
    expect(() => mutate(state, { type: 'edit', pinId: 'new', input: report(), userId: 'ana' })).toThrow('autorul');
    for (const type of ['delete', 'resolve'] as const) expect(() => mutate(state, { type, pinId: 'new', userId: 'ana' })).toThrow('autorul');
  });
  it('confirmarea este unică, retractabilă și indisponibilă autorului', () => {
    let state = make(); expect(() => mutate(state, { type: 'support', pinId: 'new', userId: 'radu' })).toThrow();
    state = mutate(state, { type: 'support', pinId: 'new', userId: 'ana' }); expect(state.pins[0].supports).toEqual(['ana']);
    state = mutate(state, { type: 'support', pinId: 'new', userId: 'ana' }); expect(state.pins[0].supports).toEqual([]);
  });
  it('rezolvarea oprește confirmările; autorul poate redeschide', () => {
    let state = mutate(make(), { type: 'resolve', pinId: 'new', userId: 'radu' });
    expect(() => mutate(state, { type: 'support', pinId: 'new', userId: 'ana' })).toThrow('deschise');
    state = mutate(state, { type: 'resolve', pinId: 'new', userId: 'radu' }); expect(state.pins[0].status).toBe('open');
  });
});
describe('Participare', () => {
  it('include organizatorul, protejează ultimul loc și permite retragerea', () => {
    let state = make(activity()); expect(state.pins[0].participants).toEqual(['radu']);
    state = mutate(state, { type: 'join', pinId: 'new', userId: 'ana' });
    expect(() => mutate(state, { type: 'join', pinId: 'new', userId: 'mihai' })).toThrow('ocupat');
    expect(activityState(state.pins[0])).toBe('Completă');
    state = mutate(state, { type: 'join', pinId: 'new', userId: 'ana' });
    expect(state.pins[0].participants).toEqual(['radu']);
  });
  it('nu permite reducerea capacității sub participanții existenți', () => {
    const state = mutate(make(activity()), { type: 'join', pinId: 'new', userId: 'ana' });
    expect(() => mutate(state, { type: 'edit', pinId: 'new', input: { ...activity(), capacity: 1 }, userId: 'radu' })).toThrow('capacitatea'.replace('c', 'C'));
  });
  it('nu permite participare la activitate anulată sau începută', () => {
    let state = mutate(make(activity()), { type: 'cancel', pinId: 'new', userId: 'radu' });
    expect(() => mutate(state, { type: 'join', pinId: 'new', userId: 'ana' })).toThrow('închise');
    state = make(activity()); state.pins[0].startsAt = new Date(Date.now() - 1000).toISOString();
    expect(() => mutate(state, { type: 'join', pinId: 'new', userId: 'ana' })).toThrow('închise');
  });
});
describe('Conversații și retragere', () => {
  it('trimite o singură dată și refuză golul ori ștergerea mesajelor altuia', () => {
    let state = make(); const action = { type: 'message' as const, pinId: 'new', userId: 'ana', body: ' Salut! ', id: 'm1' };
    state = mutate(state, action); state = mutate(state, action);
    expect(state.messages.filter(m => m.id === 'm1')).toHaveLength(1);
    expect(state.messages.find(m => m.id === 'm1')?.body).toBe('Salut!');
    expect(() => mutate(state, { ...action, body: '  ' })).toThrow();
    expect(() => mutate(state, { type: 'deleteMessage', messageId: 'm1', userId: 'radu' })).toThrow('tale');
  });
  it('retrage pinul, curăță fotografia și oprește mesajele noi', () => {
    let state: State = make(); state = mutate(state, { type: 'delete', pinId: 'new', userId: 'radu' });
    expect(state.pins[0].deleted).toBe(true); expect(state.pins[0].image).toBeUndefined();
    expect(() => mutate(state, { type: 'message', pinId: 'new', userId: 'ana', body: 'Salut', id: 'x' })).toThrow('retras');
  });
  it('calculează distanțe în metri fără inversarea coordonatelor', () => {
    expect(distance({ lon: 21.22, lat: 45.75 }, { lon: 21.22, lat: 45.75 })).toBe(0);
    expect(distance({ lon: 21.22, lat: 45.75 }, { lon: 21.22, lat: 45.76 })).toBeCloseTo(1111.95, 0);
  });
});
