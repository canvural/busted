import { describe, expect, it, vi } from 'vitest';
import { topic } from '../topic';
import { type Auth, classify } from './classify';
import { buildClefRequest, type ClefAuth, type ClefItem, clefUrl } from './clef';
import { JEV_MODEL, JEV_URL } from './jev';

const items: ClefItem[] = [
  { id: 'yt:abc', fields: { title: "Lucia's FATE Will Shock You", channel: 'LoreDrop' } },
  { id: 'x:123', fields: { text: 'GTA 6 preloads open November 17', alt: [] } },
];

const cloudflare: ClefAuth = { mode: 'cloudflare', accountId: 'acc123', apiToken: 'tok' };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const okBody = {
  success: true,
  errors: [],
  result: {
    model: 'clef-flash',
    answers: { item_1: { type: 'noul', noul: 0.9 }, item_2: { type: 'noul', noul: 0.02 } },
    usage: { input_tokens: 281, output_tokens: 0 },
  },
};

describe('classify', () => {
  it('sends a bearer-authenticated POST and returns scores', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(jsonResponse(okBody));
    const result = await classify(items, { auth: cloudflare, model: 'clef-flash', topic, fetch });

    expect(result.scores.get('yt:abc')).toBe(0.9);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(clefUrl(cloudflare, 'clef-flash'));
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(init?.body as string).model).toBe('clef-flash');
  });

  it('sends the shared secret to a custom endpoint', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(jsonResponse(okBody));
    const auth: Auth = { mode: 'endpoint', url: 'https://proxy.example.dev/', secret: 'shh' };
    await classify(items, { auth, model: 'clef', topic, fetch });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://proxy.example.dev/');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer shh');
  });

  it('fails with "auth" before calling the network when credentials are missing', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const auth: Auth = { mode: 'cloudflare', accountId: '', apiToken: 'tok' };
    await expect(classify(items, { auth, model: 'clef', topic, fetch })).rejects.toMatchObject({ kind: 'auth' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    [401, { success: false, errors: [{ code: 10000, message: 'Authentication error' }] }, 'auth'],
    [403, { success: false, errors: [{ message: 'Forbidden' }] }, 'auth'],
    [
      429,
      { success: false, errors: [{ code: 4006, message: 'you have used up your daily free allocation of 10,000 neurons' }] },
      'quota',
    ],
    [429, { success: false, errors: [{ message: 'Too many requests' }] }, 'rate-limited'],
    [500, { success: false, errors: [{ message: 'Internal error' }] }, 'server'],
    [400, { success: false, errors: [{ message: 'Bad input' }] }, 'bad-request'],
    [200, { success: true, result: {} }, 'bad-response'],
  ])('classifies HTTP %i as %s', async (status, body, kind) => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(jsonResponse(body, status));
    await expect(classify(items, { auth: cloudflare, model: 'clef', topic, fetch })).rejects.toMatchObject({
      kind,
    });
  });

  it('classifies a failed fetch as "network"', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(classify(items, { auth: cloudflare, model: 'clef', topic, fetch })).rejects.toMatchObject({
      kind: 'network',
    });
  });

  it('passes aborts through untouched', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new DOMException('Aborted', 'AbortError'));
    await expect(
      classify(items, { auth: cloudflare, model: 'clef', topic, fetch, signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('classify with Jev', () => {
  const jev: Auth = { mode: 'jev', apiKey: 'ts-key' };
  const jevOk = {
    model: JEV_MODEL,
    answers: { item_1: { type: 'noul', noul: 0.8 }, item_2: { type: 'noul', noul: 0.05 } },
    usage: { input_tokens: 1001, output_tokens: 76 },
  };

  it('sends the Clef question set to TypeSafe with the pinned Jev model', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(jsonResponse(jevOk));
    const result = await classify(items, { auth: jev, model: 'clef', topic, fetch });

    expect(result.scores).toEqual(new Map([['yt:abc', 0.8], ['x:123', 0.05]]));
    expect(result.inputTokens).toBe(1001);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(JEV_URL);
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer ts-key');
    const body = JSON.parse(init?.body as string);
    expect(body.model).toBe(JEV_MODEL);
    expect(body.state).toEqual(buildClefRequest(items, 'clef', topic).body.state);
  });

  it('fails with "auth" before calling the network when the key is missing', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    await expect(classify(items, { auth: { mode: 'jev', apiKey: ' ' }, model: 'clef', topic, fetch })).rejects.toMatchObject({
      kind: 'auth',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    [401, { detail: { error_type: 'authentication_error', message: 'Cannot authenticate' } }, 'auth', 'Cannot authenticate'],
    [429, { detail: 'Too many requests' }, 'rate-limited', 'Too many requests'],
    [529, null, 'server', 'HTTP 529'],
    [200, { model: JEV_MODEL, answers: {} }, 'bad-response', 'Missing or invalid answer for item_1'],
  ])('classifies HTTP %i as %s', async (status, body, kind, message) => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(jsonResponse(body, status));
    await expect(classify(items, { auth: jev, model: 'clef', topic, fetch })).rejects.toMatchObject({ kind, message });
  });
});
