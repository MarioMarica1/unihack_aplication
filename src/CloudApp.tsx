import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { AuthError, SupabaseClient, User } from '@supabase/supabase-js';
import App from './App';
import type { Action, Person, Pin, State } from './domain';
import { demoTitlePrefix } from './domain';

const bucketName = 'vecin-photos';
const extensions: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };
const colors = ['#dcecc8', '#f6dfd4', '#e4ddf4', '#d8e9f5'];

function person(id: string, name: string): Person {
  const initials = name.split(/\s+/).slice(0, 2).map(word => word[0]?.toUpperCase()).join('');
  return { id, name, initials, color: colors[id.charCodeAt(0) % colors.length] };
}

function cloudStore(client: SupabaseClient) {
  const bucket = client.storage.from(bucketName);
  type Snapshot = Omit<State, 'pins' | 'people'> & { pins: (Pin & { imagePath?: string })[]; people: { id: string; name: string }[] };

  function toState(snapshot: Snapshot): State {
    return {
      ...snapshot,
      people: snapshot.people.map(p => person(p.id, p.name)),
      pins: snapshot.pins.map(({ imagePath, ...pin }) => ({
        ...pin, demo: pin.title.startsWith(demoTitlePrefix),
        image: imagePath ? bucket.getPublicUrl(imagePath).data.publicUrl : undefined,
      })),
    };
  }

  async function loadState() {
    const { data, error } = await client.rpc('vecin_snapshot');
    if (error) throw new Error('Nu am putut încărca datele comunității.');
    return toState(data);
  }

  async function dispatch(action: Action) {
    let payload: Record<string, unknown> = action;
    let uploaded: string | undefined;
    if (action.type === 'create' || action.type === 'edit') {
      const { image, ...input } = action.input;
      const pinId = action.type === 'create' ? action.id : action.pinId;
      let imagePath: string | undefined;
      if (image?.startsWith('data:')) {
        const blob = await fetch(image).then(response => response.blob());
        const extension = extensions[blob.type];
        if (!extension) throw new Error('Formatul fotografiei nu este acceptat.');
        const path = `${action.userId}/${pinId}/${crypto.randomUUID()}.${extension}`;
        const { error } = await bucket.upload(path, blob, { contentType: blob.type });
        if (error) throw new Error('Fotografia nu s-a încărcat. Reîncearcă.');
        uploaded = path;
        imagePath = path;
      } else if (image) {
        const base = bucket.getPublicUrl('').data.publicUrl;
        if (!image.startsWith(base)) throw new Error('Fotografia nu aparține acestei aplicații.');
        imagePath = image.slice(base.length);
      }
      payload = { ...action, input: { ...input, imagePath } };
    }
    const { data, error, status } = await client.rpc('vecin_apply', { action: payload });
    if (error) {
      // A lost response can arrive after a commit. The storage policy protects photos still in use.
      if (uploaded && status >= 400 && status < 500) void bucket.remove([uploaded]);
      throw new Error(error.code === 'P0001' ? error.message : 'Modificarea nu a putut fi confirmată. Verifică datele și reîncearcă.');
    }
    const unused = [uploaded, data.unusedPhoto as string | undefined].filter((path): path is string =>
      !!path && !(data.state as Snapshot).pins.some(pin => pin.imagePath === path));
    if (unused.length) void bucket.remove(unused);
    return toState(data.state);
  }

  function subscribe(refresh: () => void) {
    const channel = client.channel(`vecin-${crypto.randomUUID()}`)
      .on('postgres_changes', { schema: 'public', table: 'vecin_revision', event: 'UPDATE' }, refresh)
      .subscribe(status => { if (status === 'SUBSCRIBED') refresh(); });
    const timer = window.setInterval(refresh, 20000);
    window.addEventListener('online', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', refresh);
      void client.removeChannel(channel);
    };
  }
  return { loadState, dispatch, subscribe };
}

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
const client = url && key ? createClient(url, key) : undefined;
const store = client ? cloudStore(client) : undefined;

export default function CloudApp() {
  const [user, setUser] = useState<User | null>();
  useEffect(() => {
    if (!client) return;
    const { data } = client.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!client || !store) return <main className="fatal"><h1>Urban Connect nu este configurat</h1><p>Lipsesc datele de conectare la comunitate.</p></main>;
  if (user === undefined) return <main className="fatal"><p role="status">Se încarcă Urban Connect…</p></main>;
  const name = String(user?.user_metadata.display_name || '').trim().slice(0, 40);
  const profile = user ? person(user.id, name.length >= 2 ? name : `Vecin ${user.id.slice(0, 6)}`) : null;
  return <App cloud={{ store, user: profile, account: <Account client={client} user={user} /> }} />;
}

function signInError(error: AuthError) {
  switch (error.code) {
    case 'over_email_send_rate_limit':
      return 'Supabase a atins limita de e-mailuri. Așteaptă înainte să ceri un link nou. Poți folosi un link recent, dacă e încă valid și nu l-ai deschis.';
    case 'email_address_not_authorized':
      return 'Serviciul de e-mail Supabase acceptă doar adrese din echipa proiectului. Folosește adresa cu care ai acces la proiect.';
    case 'email_address_invalid':
      return 'Supabase nu acceptă această adresă de e-mail. Verifică adresa introdusă.';
    case 'invalid_credentials':
      return 'E-mailul sau parola nu sunt corecte.';
    case 'email_not_confirmed':
      return 'Adresa de e-mail trebuie confirmată înainte de conectare.';
    case 'otp_disabled':
    case 'email_provider_disabled':
    case 'signup_disabled':
      return 'Conectarea prin e-mail este restricționată în configurarea proiectului.';
    default:
      if (error.status === 429) return 'Supabase a primit prea multe cereri. Încearcă din nou peste câteva minute.';
      if (error.name === 'AuthRetryableFetchError') return 'Nu am putut contacta serviciul de conectare. Încearcă din nou în câteva momente.';
      return `Linkul nu s-a putut trimite.${error.code ? ` Cod Supabase: ${error.code}.` : ''}`;
  }
}

function Account({ client, user }: { client: SupabaseClient; user: User | null }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [method, setMethod] = useState<'link' | 'password'>('link');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function send(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const { error } = method === 'password'
        ? await client.auth.signInWithPassword({ email: email.trim(), password })
        : await client.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${location.origin}${location.pathname}`, data: { display_name: name.trim() } },
      });
      if (error) setError(signInError(error));
      else if (method === 'link') setSent(true);
      else setPassword('');
    } catch { setError('Nu am putut contacta serviciul de conectare.'); }
    finally { setBusy(false); }
  }

  if (user) return <div className="cloud-account">
    <p>{user.email}</p>
    <button className="secondary full" disabled={busy} onClick={async () => {
      setBusy(true);
      try {
        const result = await client.auth.signOut({ scope: 'local' });
        if (result.error) setError('Deconectarea a eșuat. Reîncearcă.');
      } catch { setError('Deconectarea a eșuat. Reîncearcă.'); }
      finally { setBusy(false); }
    }}>Deconectează-te</button>
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;

  if (sent) return <div className="cloud-account">
    <p role="status">Ți-am trimis un link de conectare la {email}. Deschide-l din e-mail.</p>
    <button className="secondary" onClick={() => setSent(false)}>Schimbă adresa</button>
  </div>;

  return <form className="cloud-account" onSubmit={event => void send(event)}>
    <label className="field">E-mail<input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /></label>
    {method === 'password'
      ? <label className="field">Parolă<input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></label>
      : <label className="field">Nume afișat <small>opțional</small><input autoComplete="nickname" maxLength={40} value={name} onChange={event => setName(event.target.value)} /></label>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <button type="submit" className="primary full" disabled={busy}>{busy ? 'Se conectează…' : method === 'password' ? 'Conectează-te' : 'Trimite linkul de conectare'}</button>
    <button type="button" className="secondary full" disabled={busy} onClick={() => {
      setMethod(method === 'link' ? 'password' : 'link');
      setPassword('');
      setError('');
    }}>{method === 'link' ? 'Folosește parola' : 'Primește un link pe e-mail'}</button>
  </form>;
}
