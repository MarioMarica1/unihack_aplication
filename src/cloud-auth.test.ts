import { describe, expect, it } from 'vitest';
import { authRedirectTo, readAuthReturn } from './cloud-auth';

describe('Revenirea în aplicație după conectare', () => {
  it('păstrează pinul și elimină parametrii unei autentificări anterioare', () => {
    const current = new URL('https://urban-conect.netlify.app/?pin=123&code=expired#access_token=old');
    expect(authRedirectTo(current)).toBe('https://urban-conect.netlify.app/?pin=123');
    expect(readAuthReturn(current)?.clean.search).toBe('?pin=123');
  });

  it('nu interpretează o cale cu două slashuri drept alt domeniu', () => {
    const current = new URL('https://urban-conect.netlify.app//other.example/pins/123');
    expect(new URL(authRedirectTo(current)).origin).toBe(current.origin);
  });

  it('recunoaște anularea și curăță erorile din fragment fără să piardă linkul către pin', () => {
    const current = new URL('https://urban-conect.netlify.app/pins/123#error=access_denied&error_description=Cancelled');
    const result = readAuthReturn(current);
    expect(result?.cancelled).toBe(true);
    expect(result?.clean.href).toBe('https://urban-conect.netlify.app/pins/123');
    expect(readAuthReturn(result!.clean)).toBeUndefined();
  });
});
