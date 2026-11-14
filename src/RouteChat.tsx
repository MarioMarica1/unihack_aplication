import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { MessageCircle, Send } from 'lucide-react';
import { toMapPlace } from './infrastructure';
import type { Infrastructure, MapPlace } from './infrastructure';
import { filterPlaces, normalizeSearch } from './place-catalog';
import type { TravelMode } from './routing';

type Mode = TravelMode | 'transit';
type Catalog = Infrastructure['places']['features'];
type Plan = { origin: string | null; stops: string[]; mode: Mode | null; question: string | null };

function findPlace(catalog: Catalog, name: string): MapPlace | undefined {
  const matches = filterPlaces(catalog, name, 'all');
  const exact = matches.filter(feature => normalizeSearch(feature.properties?.name ?? '') === normalizeSearch(name));
  const candidates = exact.length ? exact : matches.filter(feature => normalizeSearch(feature.properties?.name ?? '').includes(normalizeSearch(name)));
  const place = candidates[0];
  if (!place) return;
  const [lon, lat] = place.geometry.coordinates;
  if (candidates.some(other => Math.hypot(other.geometry.coordinates[0] - lon, other.geometry.coordinates[1] - lat) > 0.002)) return;
  return toMapPlace(place);
}

export default function RouteChat({ catalog, onPlan }: {
  catalog: Catalog;
  onPlan: (origin: MapPlace | undefined, stops: MapPlace[], mode: Mode | null) => void;
}) {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setDraft('');
    setBusy(true);
    setMessages(history => [...history, { role: 'user', text: message }]);
    function say(text: string) { setMessages(history => [...history, { role: 'assistant', text }]); }
    try {
      const response = await fetch('/api/route-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, context: messages.slice(-6).map(turn => `${turn.role}: ${turn.text}`).join('\n').slice(-900) }),
        signal: controller.signal,
      });
      const result: Plan & { error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error || 'Chatul este indisponibil.');
      if (result.question) { say(result.question); return; }
      const locations: MapPlace[] = [];
      for (const name of [result.origin, ...result.stops]) {
        if (name === null) continue;
        const place = findPlace(catalog, name);
        if (!place) { say(`Nu am găsit un loc unic pentru „${name}”. Poți preciza numele complet?`); return; }
        locations.push(place);
      }
      const origin = result.origin ? locations.shift() : undefined;
      const stops = locations;
      if (!stops.length) { say('Unde vrei să mergi?'); return; }
      if (new Set(stops.map(stop => stop.id)).size !== stops.length) { say('Ai inclus aceeași oprire de mai multe ori. Scrie fiecare oprire o singură dată.'); return; }
      onPlan(origin, stops, result.mode);
      say(`Calculez traseul: ${[origin?.title ?? 'Punctul de pornire ales', ...stops.map(stop => stop.title)].join(' → ')}.`);
    } catch (error) {
      if (!controller.signal.aborted) say(error instanceof Error ? error.message : 'Chatul este indisponibil.');
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return <details className="route-chat">
    <summary><MessageCircle size={17} />Chat de trasee</summary>
    <div className="route-chat-log" role="log" aria-label="Conversație despre traseu">
      {messages.map((message, index) => <p key={index} className={`message ${message.role}`}><strong>{message.role === 'user' ? 'Tu' : 'Urban Conect'}</strong> {message.text}</p>)}
    </div>
    <form className="message-composer" onSubmit={submit}>
      <input aria-label="Mesaj pentru chatul de trasee" placeholder="Catedrala, apoi Iulius Mall, apoi Piața 700" value={draft} onChange={event => setDraft(event.target.value)} maxLength={600} />
      <button type="submit" aria-label="Trimite mesajul" disabled={busy || !draft.trim() || !catalog.length}><Send size={17} /></button>
    </form>
    {!catalog.length && <p className="layer-status" role="status">Catalogul de locuri trebuie să fie încărcat pentru a folosi chatul.</p>}
    {busy && <p className="layer-status" role="status">Se interpretează traseul…</p>}
  </details>;
}
