import { useEffect, useRef, useState } from 'react';
import type { FormEvent, PointerEvent } from 'react';
import { GripVertical, Maximize2, MessageCircle, Minimize2, Send, Trash2, X } from 'lucide-react';
import { dateLabel } from './domain';
import type { Action, Message, Person, Pin } from './domain';

type Props = {
  pin: Pin;
  messages: Message[];
  profiles: Person[];
  userId: string;
  busy: boolean;
  cloud: boolean;
  close: () => void;
  signIn: () => void;
  act: (action: Action) => Promise<unknown>;
};

export default function PinChat({ pin, messages, profiles, userId, busy, cloud, close, signIn, act }: Props) {
  const [draft, setDraft] = useState('');
  const [limit, setLimit] = useState(30);
  const [expanded, setExpanded] = useState(false);
  const [width, setWidth] = useState<number>();
  const [measured, setMeasured] = useState({ width: 0, min: 0, max: 0 });
  const panel = useRef<HTMLElement>(null);
  const drag = useRef<{ id: number; x: number; width: number } | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const history = useRef<HTMLDivElement>(null);
  const latestMessage = useRef<string | undefined>(undefined);
  const ordered = messages.filter(message => message.pinId === pin.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const lastId = ordered.at(-1)?.id;

  useEffect(() => { title.current?.focus(); }, []);
  useEffect(() => {
    const chat = panel.current;
    if (!chat) return;
    const observer = new ResizeObserver(() => setMeasured({
      width: chat.offsetWidth,
      min: parseInt(getComputedStyle(chat).getPropertyValue('--chat-min-width'), 10),
      max: Math.max(0, (chat.parentElement?.clientWidth ?? 0) - chat.offsetLeft - 140),
    }));
    observer.observe(chat);
    if (chat.parentElement) observer.observe(chat.parentElement);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const list = history.current;
    if (!list || lastId === latestMessage.current) return;
    const nearEnd = list.scrollHeight - list.scrollTop - list.clientHeight < 160;
    if (!latestMessage.current || nearEnd) list.scrollTop = list.scrollHeight;
    latestMessage.current = lastId;
  }, [lastId]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || busy) return;
    try {
      await act({ type: 'message', id: crypto.randomUUID(), pinId: pin.id, userId, body });
      setDraft(current => current.trim() === body ? '' : current);
      requestAnimationFrame(() => { if (history.current) history.current.scrollTop = history.current.scrollHeight; });
    } catch { /* The app shows the error and keeps the draft. */ }
  }

  function resize(next: number) {
    setWidth(Math.min(measured.max, Math.max(measured.min, next)));
  }

  function startResize(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || drag.current || !panel.current) return;
    drag.current = { id: event.pointerId, x: event.clientX, width: panel.current.offsetWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus();
    event.preventDefault();
  }

  return <aside ref={panel} id="pin-chat-panel" className={`pin-chat ${expanded ? 'expanded' : ''}`} aria-labelledby="pin-chat-title" style={width ? { flexBasis: expanded ? undefined : `clamp(var(--chat-min-width), ${width}px, var(--chat-max-width))` } : undefined}>
    <header className="pin-chat-header">
      <span className="pin-chat-symbol"><MessageCircle size={21} /></span>
      <div><h2 id="pin-chat-title" ref={title} tabIndex={-1}>{pin.title}</h2><p>{cloud ? 'Conversație publică' : 'Conversație în demo'}</p></div>
      <button className="icon-btn chat-expand" aria-label={expanded ? 'Micșorează chatul' : 'Extinde chatul'} aria-pressed={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>
      <button className="icon-btn" aria-label="Închide chatul" onClick={close}><X size={21} /></button>
    </header>
    <div className="pin-chat-history" ref={history}>
      {ordered.length > limit && <button className="secondary" onClick={() => setLimit(n => n + 30)}>Arată mesaje mai vechi</button>}
      <div className="messages" role="log" aria-label="Mesajele anunțului">
        {ordered.slice(-limit).map(message => {
          const person = profiles.find(p => p.id === message.authorId);
          return <div className="message" key={message.id}>
            <span className="avatar tiny" style={{ background: person?.color }}>{person?.initials || '?'}</span>
            <div><div className="message-author"><strong>{person?.name || 'Vecin'}</strong><time dateTime={message.createdAt}>{dateLabel(message.createdAt)}</time>
              {message.authorId === userId && <button aria-label="Șterge mesajul" disabled={busy} onClick={() => {
                if (confirm('Ștergi acest mesaj?')) void act({ type: 'deleteMessage', messageId: message.id, userId }).catch(() => {});
              }}><Trash2 size={15} /></button>}
            </div><p>{message.body}</p></div>
          </div>;
        })}
        {ordered.length === 0 && <p className="no-messages">Nu sunt mesaje încă.</p>}
      </div>
    </div>
    {userId ? <form className="message-composer" onSubmit={send}>
      <input aria-label="Mesaj pentru conversație" placeholder="Scrie un mesaj…" value={draft} onChange={event => setDraft(event.target.value)} maxLength={2000} />
      <button aria-label="Trimite mesajul" disabled={!draft.trim() || busy} type="submit"><Send size={18} /></button>
    </form> : <div className="pin-chat-sign-in"><button className="primary" onClick={signIn}>Conectează-te ca să scrii</button></div>}
    {!expanded && <div className="chat-resize" role="separator" tabIndex={0} aria-orientation="vertical" aria-label="Lățimea chatului" aria-controls="pin-chat-panel"
      aria-valuemin={measured.min} aria-valuemax={measured.max} aria-valuenow={measured.width} aria-valuetext={`${measured.width} pixeli`}
      title="Trage pentru a redimensiona chatul"
      onPointerDown={startResize} onPointerMove={event => {
        const start = drag.current;
        if (start?.id === event.pointerId) resize(start.width + event.clientX - start.x);
      }} onLostPointerCapture={() => { drag.current = null; }}
      onKeyDown={event => {
        const next = { ArrowLeft: measured.width - 24, ArrowRight: measured.width + 24, Home: measured.min, End: measured.max }[event.key];
        if (next !== undefined) { event.preventDefault(); resize(next); }
      }}><GripVertical size={15} aria-hidden="true" /></div>}
  </aside>;
}
