export const authRedirectTo = (current: URL) => {
  const destination = new URL(current.origin);
  destination.pathname = current.pathname;
  const pin = current.searchParams.get('pin');
  if (pin) destination.searchParams.set('pin', pin);
  return destination.href;
};

const callbackKeys = ['code', 'sb_flow_id', 'error', 'error_code', 'error_description', 'error_uri'];

export function readAuthReturn(current: URL) {
  const fragment = new URLSearchParams(current.hash.slice(1));
  const hasError = ['error', 'error_code', 'error_description']
    .some(key => current.searchParams.has(key) || fragment.has(key));
  if (!hasError && !current.searchParams.has('code')) return;
  const clean = new URL(current);
  for (const key of callbackKeys) clean.searchParams.delete(key);
  if (callbackKeys.some(key => fragment.has(key))) clean.hash = '';
  return { clean, hasError, cancelled: (current.searchParams.get('error') ?? fragment.get('error')) === 'access_denied' };
}

export async function isGoogleEnabled(url: string, key: string, signal: AbortSignal) {
  const response = await fetch(new URL('/auth/v1/settings', url), { headers: { apikey: key }, cache: 'no-store', signal });
  if (!response.ok) return false;
  const settings = await response.json();
  return settings.external?.google === true;
}
