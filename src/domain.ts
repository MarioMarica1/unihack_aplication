import { z } from 'zod';

export type PinType = 'report' | 'activity' | 'discussion';
export const demoTitlePrefix = 'DEMO · ';
export type Point = { lon: number; lat: number };
export type Person = { id: string; name: string; initials: string; color: string };
export const people: Person[] = [
  { id: 'radu', name: 'Radu', initials: 'RA', color: '#dcecc8' },
  { id: 'ana', name: 'Ana', initials: 'AN', color: '#f6dfd4' },
  { id: 'mihai', name: 'Mihai', initials: 'MI', color: '#e4ddf4' },
];
export type Pin = {
  id: string; type: PinType; title: string; description: string; category: string;
  location: Point; place: string; authorId: string; createdAt: string;
  image?: string; demo?: boolean; deleted?: boolean;
  status: 'open' | 'resolved' | 'active' | 'cancelled';
  startsAt?: string; endsAt?: string; capacity?: number;
  participants: string[]; supports: string[]; relatedId?: string;
  changedAt?: string;
};
export type Message = { id: string; pinId: string; authorId: string; body: string; createdAt: string };
export type State = { version: 1; pins: Pin[]; messages: Message[]; saved: Record<string, string[]>; flags: { pinId: string; userId: string; reason: string }[]; people?: Person[] };
export const center: Point = { lon: 21.2257, lat: 45.7557 };
export const meta = {
  report: { label: 'Sesizare', plural: 'Sesizări', color: '#d47a42', categories: ['Infrastructură', 'Curățenie', 'Spații verzi', 'Iluminat', 'Accesibilitate'] },
  activity: { label: 'Activitate', plural: 'Activități', color: '#26765c', categories: ['Voluntariat', 'Sport', 'Social', 'Cultură'] },
  discussion: { label: 'Discuție', plural: 'Discuții', color: '#8d76b8', categories: ['Idei pentru cartier', 'Întrebare', 'Recomandări'] },
};

export const pointSchema = z.object({
  lon: z.number().min(-180).max(180), lat: z.number().min(-90).max(90),
});
export const formSchema = z.object({
  type: z.enum(['report', 'activity', 'discussion']),
  title: z.string().trim().min(5, 'Titlul trebuie să aibă cel puțin 5 caractere.').max(100, 'Titlul poate avea maximum 100 de caractere.'),
  description: z.string().trim().min(10, 'Adaugă o descriere de cel puțin 10 caractere.').max(2000),
  category: z.string().min(1), place: z.string().trim().max(100),
  location: pointSchema,
  image: z.string().optional(), startsAt: z.string().optional(), endsAt: z.string().optional(),
  capacity: z.number().int().min(1).max(500).optional(), relatedId: z.string().optional(),
}).superRefine((value, ctx) => {
  if (!meta[value.type].categories.includes(value.category)) ctx.addIssue({ code: 'custom', path: ['category'], message: 'Alege o categorie validă.' });
  if (value.type === 'report' && !value.image) ctx.addIssue({ code: 'custom', path: ['image'], message: 'Adaugă o fotografie pentru sesizare.' });
  if (value.type === 'activity') {
    const start = Date.parse(value.startsAt || ''); const end = Date.parse(value.endsAt || '');
    if (!Number.isFinite(start) || start <= Date.now()) ctx.addIssue({ code: 'custom', path: ['startsAt'], message: 'Începutul activității trebuie să fie în viitor.' });
    if (!Number.isFinite(end) || end <= start) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'Sfârșitul trebuie să fie după început.' });
  }
});
export type FormInput = z.infer<typeof formSchema>;
export type Action =
  | { type: 'create'; input: FormInput; userId: string; id: string }
  | { type: 'edit'; pinId: string; input: FormInput; userId: string }
  | { type: 'support' | 'join' | 'resolve' | 'cancel' | 'delete' | 'save'; pinId: string; userId: string; enabled?: boolean }
  | { type: 'message'; pinId: string; userId: string; body: string; id: string }
  | { type: 'deleteMessage'; messageId: string; userId: string }
  | { type: 'flag'; pinId: string; userId: string; reason: string };

export function mutate(original: State, action: Action): State {
  const state = structuredClone(original);
  if (!people.some(p => p.id === action.userId)) throw new Error('Alege un profil demo înainte de a continua.');
  const now = new Date().toISOString();
  if (action.type === 'create') {
    if (state.pins.some(p => p.id === action.id)) return state;
    const input = formSchema.parse(action.input);
    if (input.relatedId && !state.pins.some(p => p.id === input.relatedId && p.type === 'report' && !p.deleted)) throw new Error('Sesizarea asociată nu mai este disponibilă.');
    state.pins.unshift({ ...input, id: action.id, authorId: action.userId, createdAt: now,
      status: input.type === 'activity' ? 'active' : 'open', participants: input.type === 'activity' ? [action.userId] : [], supports: [] });
    return state;
  }
  if (action.type === 'deleteMessage') {
    const msg = state.messages.find(m => m.id === action.messageId);
    if (!msg || msg.authorId !== action.userId) throw new Error('Poți șterge doar mesajele tale.');
    state.messages = state.messages.filter(m => m.id !== msg.id); return state;
  }
  const pin = state.pins.find(p => p.id === action.pinId && !p.deleted);
  if (!pin) throw new Error('Acest pin a fost retras sau nu mai este disponibil.');
  if (['edit', 'resolve', 'cancel', 'delete'].includes(action.type) && pin.authorId !== action.userId) throw new Error('Doar autorul poate face această modificare.');
  switch (action.type) {
    case 'edit': {
      const input = formSchema.parse(action.input);
      if (input.type !== pin.type) throw new Error('Tipul pinului nu poate fi schimbat.');
      if (pin.type === 'activity' && new Date(pin.startsAt!).getTime() <= Date.now()) throw new Error('O activitate începută nu mai poate fi editată.');
      if (input.capacity && input.capacity < pin.participants.length) throw new Error('Capacitatea nu poate fi mai mică decât numărul participanților.');
      Object.assign(pin, input, { changedAt: now }); break;
    }
    case 'support':
      if (pin.type !== 'report' || pin.status === 'resolved') throw new Error('Poți confirma doar sesizări deschise.');
      if (pin.authorId === action.userId) throw new Error('Nu poți confirma propria sesizare.');
      if (action.enabled ?? !pin.supports.includes(action.userId)) pin.supports = [...new Set([...pin.supports, action.userId])];
      else pin.supports = pin.supports.filter(x => x !== action.userId);
      break;
    case 'join':
      if (pin.type !== 'activity' || pin.status === 'cancelled' || Date.parse(pin.startsAt!) <= Date.now()) throw new Error('Înscrierile pentru această activitate sunt închise.');
      if (pin.authorId === action.userId) throw new Error('Organizatorul este deja înscris. Poți anula activitatea.');
      if (!(action.enabled ?? !pin.participants.includes(action.userId))) pin.participants = pin.participants.filter(x => x !== action.userId);
      else if (!pin.participants.includes(action.userId)) {
        if (pin.capacity && pin.participants.length >= pin.capacity) throw new Error('Ultimul loc a fost ocupat. Activitatea este completă.');
        pin.participants.push(action.userId);
      }
      break;
    case 'resolve':
      if (pin.type !== 'report') throw new Error('Acțiunea este disponibilă doar pentru sesizări.');
      pin.status = pin.status === 'resolved' ? 'open' : 'resolved'; pin.changedAt = now; break;
    case 'cancel':
      if (pin.type !== 'activity') throw new Error('Acțiunea este disponibilă doar pentru activități.');
      pin.status = 'cancelled'; pin.changedAt = now; break;
    case 'delete': pin.deleted = true; pin.image = undefined; state.messages = state.messages.filter(m => m.pinId !== pin.id); break;
    case 'save': {
      const saved = state.saved[action.userId] || [];
      state.saved[action.userId] = (action.enabled ?? !saved.includes(pin.id)) ? [...new Set([...saved, pin.id])] : saved.filter(id => id !== pin.id);
      break;
    }
    case 'message': {
      const body = action.body.trim();
      if (!body || body.length > 2000) throw new Error('Mesajul trebuie să aibă între 1 și 2000 de caractere.');
      if (!state.messages.some(m => m.id === action.id)) state.messages.push({ id: action.id, pinId: pin.id, authorId: action.userId, body, createdAt: now });
      break;
    }
    case 'flag':
      if (!action.reason.trim()) throw new Error('Adaugă motivul raportării.');
      if (!state.flags.some(f => f.pinId === pin.id && f.userId === action.userId)) state.flags.push({ pinId: pin.id, userId: action.userId, reason: action.reason.trim().slice(0, 500) }); break;
  }
  return state;
}

export function distance(a: Point, b: Point): number {
  const rad = Math.PI / 180; const dlat = (b.lat - a.lat) * rad; const dlon = (b.lon - a.lon) * rad;
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dlon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
export function activityState(pin: Pin): string {
  if (pin.status === 'cancelled') return 'Anulată';
  if (Date.parse(pin.endsAt || '') <= Date.now()) return 'Încheiată';
  if (Date.parse(pin.startsAt || '') <= Date.now()) return 'În desfășurare';
  if (pin.capacity && pin.participants.length >= pin.capacity) return 'Completă';
  return 'Urmează';
}
export const dateLabel = (iso: string, options?: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', ...options }).format(new Date(iso));

export function createSeed(): State {
  const nextDay = (offset: number, hour: number) => { const d = new Date(); d.setDate(d.getDate() + offset); d.setHours(hour, 0, 0, 0); return d.toISOString(); };
  const base = { createdAt: new Date().toISOString(), demo: true, supports: [], participants: [], status: 'open' as const };
  const pins: Pin[] = [
    { ...base, id: 'seed-clean', type: 'activity', title: 'Un parc mai verde, împreună', description: 'Ne întâlnim la intrarea în Parcul Central pentru o oră de curățenie și o cafea după. Adu o pereche de mănuși și voie bună. Sacii îi aducem noi. Exemplu demonstrativ, nu este un eveniment real.', category: 'Voluntariat', place: 'Parcul Central Anton Scudier', location: { lon: 21.2184, lat: 45.7503 }, authorId: 'ana', status: 'active', startsAt: nextDay(1, 10), endsAt: nextDay(1, 12), capacity: 12, participants: ['ana', 'mihai'], image: '/illustrations/park.svg' },
    { ...base, id: 'seed-road', type: 'report', title: 'Pavaj deteriorat lângă parc', description: 'Câteva dale sunt desprinse pe aleea de acces. Ar fi util să verificăm zona, în special pentru persoanele cu mobilitate redusă. Aceasta este o sesizare DEMO, nu o constatare din teren.', category: 'Accesibilitate', place: 'Bulevardul Republicii', location: { lon: 21.2182, lat: 45.7545 }, authorId: 'mihai', supports: ['ana'], image: '/illustrations/street.svg' },
    { ...base, id: 'seed-football', type: 'activity', title: 'Cine vine la un meci de baschet?', description: 'Un meci relaxat, pentru orice nivel. Ne încălzim și facem echipe la fața locului. Participarea este gratuită. Exemplu demonstrativ; locația nu reprezintă o rezervare reală de teren.', category: 'Sport', place: 'Zona Complexului Studențesc', location: { lon: 21.241, lat: 45.7458 }, authorId: 'mihai', status: 'active', startsAt: nextDay(2, 17), endsAt: nextDay(2, 19), capacity: 8, participants: ['mihai'], image: '/illustrations/court.svg' },
    { ...base, id: 'seed-bike', type: 'discussion', title: 'Pe unde mergem cu bicicleta?', description: 'Ce trasee liniștite recomandați pentru o plimbare de seară pe lângă Bega? Strângem idei de la vecini. Discuție demonstrativă.', category: 'Recomandări', place: 'Malul Begăi', location: { lon: 21.2318, lat: 45.7478 }, authorId: 'ana' },
    { ...base, id: 'seed-light', type: 'report', title: 'Iluminat de verificat pe alee', description: 'Exemplu de sesizare despre iluminatul public. Date demonstrative; nu indică o defecțiune verificată în această locație.', category: 'Iluminat', place: 'Parcul Civic', location: { lon: 21.2342, lat: 45.7545 }, authorId: 'ana', supports: ['radu'] },
    { ...base, id: 'seed-book', type: 'discussion', title: 'Un colț de schimb de cărți?', description: 'Cum ar fi să avem o mică bibliotecă de cartier? Ce loc ar fi potrivit și cine ar dori să ajute? Idee demonstrativă pentru testarea aplicației.', category: 'Idei pentru cartier', place: 'Piața Unirii', location: { lon: 21.2288, lat: 45.758 }, authorId: 'mihai' },
    { ...base, id: 'seed-walk', type: 'activity', title: 'La pas prin cartier', description: 'O plimbare și o conversație despre locurile preferate din oraș. Exemplu demonstrativ, nu este un tur organizat real.', category: 'Social', place: 'Piața Maria', location: { lon: 21.2201, lat: 45.7455 }, authorId: 'radu', status: 'active', startsAt: nextDay(3, 16), endsAt: nextDay(3, 18), participants: ['radu'] },
    { ...base, id: 'seed-green', type: 'report', title: 'Coș de gunoi pentru spațiul verde', description: 'Exemplu demonstrativ de propunere pentru curățenia din cartier. Poziția este orientativă și nu descrie o problemă verificată.', category: 'Curățenie', place: 'Zona Cetate', location: { lon: 21.2235, lat: 45.7601 }, authorId: 'mihai' },
  ];
  return { version: 1, pins, messages: [{ id: 'seed-msg-1', pinId: 'seed-clean', authorId: 'ana', body: 'Salut! Acesta este chatul demo. Poți schimba profilul și testa conversația.', createdAt: new Date().toISOString() }], saved: {}, flags: [] };
}
