import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { AuthError, SupabaseClient, User } from '@supabase/supabase-js';
import App from './App';
import type { Action, Person, Pin, State } from './domain';
import { demoTitlePrefix } from './domain';
import { authRedirectTo, isGoogleEnabled, readAuthReturn } from './cloud-auth';

const bucketName = 'vecin-photos';
const extensions: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };
const colors = ['#dcecc8', '#f6dfd4', '#e4ddf4', '#d8e9f5'];
const SUBCATEGORY_PREFIX_RE = /^\[Subcategorie:\s*([^\]]+)\]\s*\n?/;

function person(id: string, name: string): Person {
  const initials = name.split(/\s+/).slice(0, 2).map(word => word[0]?.toUpperCase()).join('');
  return { id, name, initials, color: colors[id.charCodeAt(0) % colors.length] };
}

function parseSubcategoryFromDescription(rawDescription: string, existingSubcategory?: string): { subcategory?: string; description: string } {
  if (existingSubcategory) {
    return { subcategory: existingSubcategory, description: rawDescription.replace(SUBCATEGORY_PREFIX_RE, '') };
  }
  const match = rawDescription.match(SUBCATEGORY_PREFIX_RE);
  if (!match) return { description: rawDescription };
  return {
    subcategory: match[1].trim(),
    description: rawDescription.slice(match[0].length),
  };
}

function cloudStore(client: SupabaseClient) {
  const bucket = client.storage.from(bucketName);
  type Snapshot = Omit<State, 'pins' | 'people'> & { pins: (Pin & { imagePath?: string })[]; people: { id: string; name: string }[] };

  function toState(snapshot: Snapshot): State {
    const validPins = snapshot.pins
      .filter(pin => !pin.title.startsWith(demoTitlePrefix))
      .map(({ imagePath, ...pin }) => {
        const parsed = parseSubcategoryFromDescription(pin.description, pin.subcategory);
        return {
          ...pin,
          subcategory: parsed.subcategory,
          description: parsed.description,
          demo: false,
          image: imagePath ? bucket.getPublicUrl(imagePath).data.publicUrl : undefined,
        };
      });
    const validPinIds = new Set(validPins.map(p => p.id));
    return {
      ...snapshot,
      people: snapshot.people.map(p => person(p.id, p.name)),
      pins: validPins,
      messages: snapshot.messages.filter(m => validPinIds.has(m.pinId)),
    };
  }

  async function loadState() {
    const { data, error } = await client.rpc('vecin_snapshot');
    if (error) throw new Error('Nu am putut încărca datele comunității.');
    return toState(data);
  }

  async function dispatch(action: Action) {
    if (action.type === 'setMunicipalReported') {
      const { data, error } = await client.rpc('vecin_set_municipal_reported', { target: action.pinId, reported: action.enabled });
      if (error) throw new Error(error.code === 'P0001' ? error.message : 'Marcajul nu a putut fi salvat.');
      return toState(data);
    }
    let payload: Record<string, unknown> = action;
    let uploaded: string | undefined;
    if (action.type === 'create' || action.type === 'edit') {
      const { image, subcategory, ...input } = action.input;
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
      const cleanDesc = input.description.replace(SUBCATEGORY_PREFIX_RE, '').trim();
      const encodedDescription = subcategory ? `[Subcategorie: ${subcategory}]\n${cleanDesc}` : cleanDesc;
      payload = { ...action, input: { ...input, description: encodedDescription, imagePath } };
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

const defaultSupabaseUrl = 'https://aqwwwrbqhuqdselhronk.supabase.co';
const defaultSupabaseKey = 'sb_publishable_UYv4zrNxzGx0PWuoiUElDg_zyw_g49q';
const url = import.meta.env.VITE_SUPABASE_URL?.trim() || defaultSupabaseUrl;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || defaultSupabaseKey;
const authReturn = readAuthReturn(new URL(location.href));
const client = url && key ? createClient(url, key, { auth: { flowType: 'pkce' } }) : undefined;
const store = client ? cloudStore(client) : undefined;

export default function CloudApp() {
  const [user, setUser] = useState<User | null>();
  const [returned, setReturned] = useState(!authReturn);
  const [callbackError, setCallbackError] = useState('');
  useEffect(() => {
    if (!client) return;
    const auth = client.auth;
    const { data } = auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    let active = true;
    if (authReturn) {
      const destination = authReturn;
      void (async () => {
        let failed = destination.hasError;
        try {
          const result = await auth.initialize();
          const { data } = await auth.getSession();
          failed ||= !!result.error || !data.session;
        } catch { failed = true; }
        if (!active) return;
        if (failed) {
          setCallbackError(destination.cancelled ? 'Conectarea a fost anulată. Poți încerca din nou.' : 'Conectarea nu s-a finalizat. Încearcă din nou din același browser în care ai început.');
        }
        history.replaceState(history.state, '', destination.clean.href);
        setReturned(true);
      })();
    }
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  if (!client || !store) return <main className="fatal"><h1>Urban Conect nu este configurat</h1><p>Lipsesc datele de conectare la comunitate.</p></main>;
  if (user === undefined || !returned) return <main className="fatal"><p role="status">Se încarcă Urban Conect…</p></main>;
  const rawName = String(
    user?.user_metadata?.display_name ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split('@')[0] ||
    '',
  ).trim().slice(0, 40);
  const profile = user ? person(user.id, rawName.length >= 2 ? rawName : `Cetățean ${user.id.slice(0, 6)}`) : null;
  return (
    <App
      cloud={{
        store,
        user: profile,
        reopenAccount: !!callbackError,
        account: (
          <Account
            client={client}
            user={user}
            callbackError={callbackError}
            dismissCallbackError={() => setCallbackError('')}
          />
        ),
      }}
    />
  );
}

function signInError(error: AuthError) {
  switch (error.code) {
    case 'over_email_send_rate_limit':
      return 'Supabase a atins limita de e-mailuri. Așteaptă înainte să ceri un link nou. Poți folosi un link recent, dacă e încă valid și nu l-ai deschis.';
    case 'email_address_not_authorized':
      return 'Serviciul de e-mail Supabase acceptă doar adrese din echipa proiectului. Folosește conectarea cu Google sau parola.';
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
      return `Conectarea nu s-a putut finaliza.${error.code ? ` Cod Supabase: ${error.code}.` : ''}`;
  }
}

function Account({
  client,
  user,
  callbackError,
  dismissCallbackError,
}: {
  client: SupabaseClient;
  user: User | null;
  callbackError: string;
  dismissCallbackError: () => void;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [method, setMethod] = useState<'link' | 'password'>('password');
  const [googleEnabled, setGoogleEnabled] = useState<boolean>(true);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(callbackError);

  useEffect(() => {
    dismissCallbackError();
    if (user || !url || !key) return;
    const controller = new AbortController();
    let active = true;
    const timer = window.setTimeout(() => controller.abort(), 4000);
    void isGoogleEnabled(url, key, controller.signal)
      .catch(() => true)
      .then(enabled => {
        if (active) setGoogleEnabled(enabled !== false);
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [user]);

  async function googleSignIn() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const { error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: authRedirectTo(new URL(location.href)),
          queryParams: { prompt: 'select_account' },
        },
      });
      if (!error) return;
      setError(error.message || 'Conectarea cu Google nu a pornit.');
    } catch {
      setError('Conectarea cu Google nu a pornit. Încearcă din nou sau folosește parola.');
    }
    setBusy(false);
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const { error } =
        method === 'password'
          ? await client.auth.signInWithPassword({ email: email.trim(), password })
          : await client.auth.signInWithOtp({
              email: email.trim(),
              options: {
                emailRedirectTo: authRedirectTo(new URL(location.href)),
                data: { display_name: name.trim() },
              },
            });
      if (error) setError(signInError(error));
      else if (method === 'link') setSent(true);
      else setPassword('');
    } catch {
      setError('Nu am putut contacta serviciul de conectare.');
    } finally {
      setBusy(false);
    }
  }

  if (user) {
    const displayName = String(
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.user_metadata?.display_name ||
      user.email ||
      'Utilizator autentificat',
    );
    const provider = user.app_metadata?.provider === 'google' ? 'Google OAuth' : 'Supabase Auth';
    return (
      <div className="cloud-account">
        <div className="authenticated-profile-card">
          <div>
            <strong>{displayName}</strong>
            <p>{user.email}</p>
            <small className="auth-provider-badge">Sesiune activă · {provider}</small>
          </div>
        </div>
        <button
          className="secondary full"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const result = await client.auth.signOut({ scope: 'local' });
              if (result.error) setError('Deconectarea a eșuat. Reîncearcă.');
            } catch {
              setError('Deconectarea a eșuat. Reîncearcă.');
            } finally {
              setBusy(false);
            }
          }}
        >
          Deconectează-te
        </button>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  if (sent) {
    return (
      <div className="cloud-account">
        <p role="status">
          Ți-am trimis un link de conectare la {email}. Deschide-l în browserul în care ai cerut linkul.
        </p>
        <button className="secondary" onClick={() => setSent(false)}>
          Schimbă adresa
        </button>
      </div>
    );
  }

  return (
    <div className="cloud-account">
      {googleEnabled !== false && (
        <button
          className="google-sign-in"
          type="button"
          disabled={busy}
          onClick={() => void googleSignIn()}
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M43.61 24.46c0-1.36-.12-2.65-.35-3.92H24v7.42h11a9.4 9.4 0 0 1-4.08 6.17v5.15h6.62c3.87-3.57 6.07-8.8 6.07-14.82Z"
            />
            <path
              fill="#34A853"
              d="M24 44c5.51 0 10.14-1.82 13.54-4.72l-6.62-5.15c-1.84 1.23-4.17 1.96-6.92 1.96-5.33 0-9.85-3.6-11.47-8.44H5.7v5.3A20 20 0 0 0 24 44Z"
            />
            <path
              fill="#FBBC05"
              d="M12.53 27.65a12.05 12.05 0 0 1 0-7.3v-5.3H5.7a20 20 0 0 0 0 17.9l6.83-5.3Z"
            />
            <path
              fill="#EA4335"
              d="M24 11.91c3 0 5.69 1.03 7.81 3.05l5.86-5.86C34.13 5.81 29.5 4 24 4A20 20 0 0 0 5.7 15.05l6.83 5.3c1.62-4.84 6.14-8.44 11.47-8.44Z"
            />
          </svg>
          Continuă cu Google
        </button>
      )}

      <div className="auth-divider">
        <span>sau autentificare cu e-mail</span>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <form className="account-fields" onSubmit={event => void send(event)}>
        <label className="field">
          E-mail
          <input
            type="email"
            autoComplete="email"
            required
            placeholder="nume@exemplu.ro"
            value={email}
            onChange={event => setEmail(event.target.value)}
          />
        </label>
        {method === 'password' ? (
          <label className="field">
            Parolă
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={event => setPassword(event.target.value)}
            />
          </label>
        ) : (
          <label className="field">
            Nume afișat <small>opțional</small>
            <input
              autoComplete="nickname"
              maxLength={40}
              value={name}
              onChange={event => setName(event.target.value)}
            />
          </label>
        )}
        <button type="submit" className="primary full" disabled={busy}>
          {busy
            ? 'Se conectează…'
            : method === 'password'
              ? 'Conectează-te cu parola'
              : 'Trimite linkul de conectare'}
        </button>
      </form>

      <button
        type="button"
        className="secondary full"
        disabled={busy}
        onClick={() => {
          setMethod(method === 'password' ? 'link' : 'password');
          setPassword('');
          setError('');
        }}
      >
        {method === 'password' ? 'Primește un link pe e-mail (Magic Link)' : 'Folosește parola'}
      </button>
    </div>
  );
}
