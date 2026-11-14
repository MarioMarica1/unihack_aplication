import { z } from 'zod';

const place = z.string().trim().min(1).max(120);
const plan = z.object({
  origin: place.nullable(),
  stops: z.array(place).max(7),
  mode: z.enum(['walking', 'cycling', 'driving', 'transit']).nullable(),
  question: z.string().max(240).nullable(),
});
const input = z.object({ message: z.string().trim().min(1).max(600), context: z.string().max(900).optional() });

export async function routeChatResponse(request: Request, apiKey?: string) {
  const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
  if (request.method !== 'POST') return reply({ error: 'Metodă indisponibilă.' }, 405);
  if (!apiKey) return reply({ error: 'Chatul de trasee necesită configurarea Gemini.' }, 503);
  const raw = await request.text();
  if (raw.length > 2500) return reply({ error: 'Mesajul este prea lung.' }, 413);
  const parsed = input.safeParse(await Promise.resolve().then(() => JSON.parse(raw)).catch(() => null));
  if (!parsed.success) return reply({ error: 'Scrie un mesaj de maximum 600 de caractere.' }, 400);

  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json', 'Api-Revision': '2026-05-20' },
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(18_000)]),
      body: JSON.stringify({
        model: 'gemini-3.8-flash',
        store: false,
        generation_config: { thinking_level: 'low', max_output_tokens: 1024 },
        system_instruction: 'Extrage un traseu prin Timișoara. Păstrează ordinea opririlor și returnează traseul complet inclusiv după corecții. Origin este doar plecarea numită explicit, nu prima oprire. Lasă mode null când lipsește. Folosește numele cunoscute din Timișoara dacă sunt clare, de exemplu Catedrala Mitropolitană pentru catedrala și Piața 700. Dacă utilizatorul spune doar mall, întreabă dacă vrea Iulius Mall sau Shopping City. Pune întrebarea în română în question, inclusiv dacă lipsesc opririle ori sunt peste șapte. Dacă cererea este clară, question este null. Nu întoarce coordonate.',
        input: JSON.stringify(parsed.data),
        response_format: { type: 'text', mime_type: 'application/json', schema: z.toJSONSchema(plan) },
      }),
    });
    if (response.status === 429) return reply({ error: 'Gemini a atins limita de cereri. Încearcă mai târziu.' }, 429);
    if (!response.ok) return reply({ error: 'Gemini nu este disponibil. Verifică cheia și accesul la model.' }, 502);
    const data = await response.json();
    const output = data.steps?.findLast((step: { type: string }) => step.type === 'model_output');
    const content = output?.content?.filter((item: { type: string }) => item.type === 'text').map((item: { text: string }) => item.text).join('');
    return reply(plan.parse(JSON.parse(content ?? '')));
  } catch {
    return reply({ error: 'Chatul nu a putut interpreta traseul. Încearcă din nou.' }, 502);
  }
}
