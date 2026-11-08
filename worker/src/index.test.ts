import { describe, expect, it, vi } from 'vitest';
import worker, { type Env } from './index';

const clefBody = { model: 'clef', state: { items: {} }, questions: { item_1: { type: 'noul', instructions: 'x' } } };
const answer = { model: 'clef', answers: { item_1: { type: 'noul', noul: 0.9 } }, usage: { input_tokens: 10 } };

function env(overrides: Partial<Env> = {}): Env {
  return { AI: { run: vi.fn().mockResolvedValue(answer) }, SHARED_SECRET: 's3cret', ...overrides };
}

function post(body: unknown, secret = 's3cret', method = 'POST'): Request {
  return new Request('https://proxy.example/', {
    method,
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    ...(method === 'POST' && { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
}

describe('proxy worker', () => {
  it('forwards a Clef request and wraps the answer like the REST API', async () => {
    const e = env();
    const res = await worker.fetch(post(clefBody), e);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, errors: [], result: answer });
    expect(e.AI.run).toHaveBeenCalledWith('@cf/cloudflare/clef', clefBody);
  });

  it('rejects a wrong or missing secret', async () => {
    expect((await worker.fetch(post(clefBody, 'nope'), env())).status).toBe(401);
    const noAuth = new Request('https://proxy.example/', { method: 'POST', body: JSON.stringify(clefBody) });
    expect((await worker.fetch(noAuth, env())).status).toBe(401);
  });

  it('refuses to run without a configured secret', async () => {
    const res = await worker.fetch(post(clefBody), env({ SHARED_SECRET: '' }));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).toContain('wrangler secret put SHARED_SECRET');
  });

  it('only allows Clef models', async () => {
    const e = env();
    const res = await worker.fetch(post({ ...clefBody, model: '@cf/meta/llama' }), e);
    expect(res.status).toBe(400);
    expect(e.AI.run).not.toHaveBeenCalled();
  });

  it('rejects non-POST and non-JSON requests', async () => {
    expect((await worker.fetch(post(null, 's3cret', 'GET'), env())).status).toBe(405);
    expect((await worker.fetch(post('{not json'), env())).status).toBe(400);
  });

  it('reports an exhausted free quota with code 4006 so the extension says so', async () => {
    const e = env({ AI: { run: vi.fn().mockRejectedValue(new Error('AiError: daily free allocation of 10,000 neurons used')) } });
    const res = await worker.fetch(post(clefBody), e);
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ success: false, errors: [{ code: 4006 }] });
  });

  it('reports other Workers AI failures as 502', async () => {
    const e = env({ AI: { run: vi.fn().mockRejectedValue(new Error('boom')) } });
    expect((await worker.fetch(post(clefBody), e)).status).toBe(502);
  });
});

describe('extension ↔ proxy', () => {
  it("the extension's Clef client works against the proxy in endpoint mode", async () => {
    const { classify } = await import('../../src/lib/classify');
    const { topic } = await import('../../src/topic');
    const e = env({
      AI: { run: vi.fn().mockResolvedValue({ model: 'clef', answers: { item_1: { noul: 0.97 } }, usage: { input_tokens: 900 } }) },
    });
    const fetch = (url: RequestInfo | URL, init?: RequestInit) => worker.fetch(new Request(url, init), e);
    const result = await classify([{ id: 'x:1', fields: { text: 'jason sold lucia out' } }], {
      auth: { mode: 'endpoint', url: 'https://proxy.example/', secret: 's3cret' },
      model: 'clef',
      topic,
      fetch,
    });
    expect(result.scores.get('x:1')).toBe(0.97);
    expect(result.inputTokens).toBe(900);
  });

  it('a wrong secret surfaces as an auth error in the extension', async () => {
    const { classify } = await import('../../src/lib/classify');
    const { topic } = await import('../../src/topic');
    const e = env();
    const fetch = (url: RequestInfo | URL, init?: RequestInit) => worker.fetch(new Request(url, init), e);
    await expect(
      classify([{ id: 'x:1', fields: { text: 't' } }], { auth: { mode: 'endpoint', url: 'https://proxy.example/', secret: 'wrong' }, model: 'clef', topic, fetch }),
    ).rejects.toMatchObject({ kind: 'auth' });
  });
});
