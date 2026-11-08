import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { handleClassify } from './classify-handler';
import { IDBFactory } from 'fake-indexeddb';
import { LruCache } from './lru';
import { isClassifyRequest } from './messages';
import { updateSettings } from './settings';
import { getLastError, getTodayStats } from './stats';
import { openVerdictStore } from './verdict-store';

const items = [{ id: 'x:1', fields: { text: 'jason sold lucia out' } }];

function clefOk(answers: Record<string, number>): Response {
  const body = { success: true, result: { answers: Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, { noul: v }])) } };
  return new Response(JSON.stringify(body));
}

beforeEach(() => {
  fakeBrowser.reset();
});

describe('handleClassify', () => {
  it('uses stored credentials and model, and returns plain-object scores', async () => {
    await updateSettings({ accountId: 'acc', apiToken: 'tok', model: 'clef' });
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(clefOk({ item_1: 0.9 }));

    expect(await handleClassify(items, { fetch, memory: new LruCache(10), store: null })).toEqual({ ok: true, scores: { 'x:1': 0.9 } });
    expect(fetch.mock.calls[0]![0]).toContain('/accounts/acc/ai/run/@cf/cloudflare/clef');
  });

  it('answers repeated items from the cache without calling Clef', async () => {
    await updateSettings({ accountId: 'acc', apiToken: 'tok' });
    const cache = new LruCache<string, number>(10);
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(clefOk({ item_1: 0.9 }));
    await handleClassify(items, { fetch, memory: cache, store: null });
    fetch.mockClear();

    expect(await handleClassify(items, { fetch, memory: cache, store: null })).toEqual({ ok: true, scores: { 'x:1': 0.9 } });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('only sends cache misses to Clef', async () => {
    await updateSettings({ accountId: 'acc', apiToken: 'tok' });
    const cache = new LruCache<string, number>(10);
    await handleClassify(items, { fetch: vi.fn<typeof globalThis.fetch>().mockResolvedValue(clefOk({ item_1: 0.9 })), memory: cache, store: null });

    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(clefOk({ item_1: 0.1 }));
    const result = await handleClassify([...items, { id: 'x:2', fields: { text: 'new' } }], { fetch, memory: cache, store: null });
    expect(result).toEqual({ ok: true, scores: { 'x:1': 0.9, 'x:2': 0.1 } });
    const body = JSON.parse(fetch.mock.calls[0]![1]!.body as string);
    expect(Object.keys(body.questions)).toEqual(['item_1']);
    expect(body.state.items.item_1).toEqual({ text: 'new' });
  });

  it('downloads images and attaches them, skipping ones that fail', async () => {
    await updateSettings({ accountId: 'acc', apiToken: 'tok' });
    const fetch = vi.fn<typeof globalThis.fetch>(async (url) => {
      const u = String(url);
      if (u.includes('i.ytimg.com/vi/ok')) return new Response(new Blob([new Uint8Array([1, 2])], { type: 'image/jpeg' }));
      if (u.includes('i.ytimg.com')) return new Response('', { status: 404 });
      return clefOk({ item_1: 0.7 });
    });
    const result = await handleClassify(
      [{ id: 'yt:ok', fields: { title: 't' }, imageUrls: ['https://i.ytimg.com/vi/ok/mqdefault.jpg', 'https://i.ytimg.com/vi/gone/mqdefault.jpg'] }],
      { fetch, memory: new LruCache(10), store: null },
    );
    expect(result).toEqual({ ok: true, scores: { 'yt:ok': 0.7 } });
    const clefCall = fetch.mock.calls.find(([u]) => String(u).includes('api.cloudflare.com'))!;
    const body = JSON.parse(clefCall[1]!.body as string);
    expect(body.images).toEqual(['data:image/jpeg;base64,AQI=']);
    expect(body.state.items.item_1.attached_images).toEqual([1]);
  });

  it('answers from the on-disk store after the memory cache is gone (background restarted)', async () => {
    await updateSettings({ accountId: 'acc', apiToken: 'tok' });
    const store = openVerdictStore({ indexedDB: new IDBFactory() });
    await handleClassify(items, { fetch: vi.fn<typeof globalThis.fetch>().mockResolvedValue(clefOk({ item_1: 0.9 })), memory: new LruCache(10), store });

    const fetch = vi.fn<typeof globalThis.fetch>();
    expect(await handleClassify(items, { fetch, memory: new LruCache(10), store })).toEqual({ ok: true, scores: { 'x:1': 0.9 } });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('records usage stats and the last error when asked', async () => {
    await updateSettings({ accountId: 'acc', apiToken: 'tok', sensitivity: 0.5 });
    const ok = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ success: true, result: { answers: { item_1: { noul: 0.9 }, item_2: { noul: 0.1 } }, usage: { input_tokens: 1000 } } })),
    );
    await handleClassify([...items, { id: 'x:2', fields: { text: 'b' } }], { fetch: ok, memory: new LruCache(10), store: null, record: true });
    expect(await getTodayStats()).toMatchObject({ checked: 2, spoilers: 1, inputTokens: 1000 });

    const failing = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response('{"success":false}', { status: 500 }));
    await handleClassify([{ id: 'x:3', fields: { text: 'c' } }], { fetch: failing, memory: new LruCache(10), store: null, record: true });
    expect(await getLastError()).toMatchObject({ kind: 'server' });
  });

  it('sends text only to Jev, without downloading images', async () => {
    await updateSettings({ authMode: 'jev', jevApiKey: 'ts-key' });
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ model: 'jev-1.14.0', answers: { item_1: { noul: 0.8 } }, usage: { input_tokens: 500 } })),
    );
    const result = await handleClassify(
      [{ id: 'yt:ok', fields: { title: 't' }, imageUrls: ['https://i.ytimg.com/vi/ok/mqdefault.jpg'] }],
      { fetch, memory: new LruCache(10), store: null, record: true },
    );

    expect(result).toEqual({ ok: true, scores: { 'yt:ok': 0.8 } });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]![0]).toBe('https://api.typesafe.ai/v1/systemone');
    expect(await getTodayStats()).toMatchObject({ checked: 1, inputTokens: 500, neurons: 0 });
  });

  it('keeps Jev and Clef verdicts apart in the cache', async () => {
    const cache = new LruCache<string, number>(10);
    await updateSettings({ authMode: 'jev', jevApiKey: 'ts-key', accountId: 'acc', apiToken: 'tok' });
    const jevFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({ answers: { item_1: { noul: 0.2 } } })));
    await handleClassify(items, { fetch: jevFetch, memory: cache, store: null });

    await updateSettings({ authMode: 'cloudflare' });
    const clefFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(clefOk({ item_1: 0.9 }));
    expect(await handleClassify(items, { fetch: clefFetch, memory: cache, store: null })).toEqual({ ok: true, scores: { 'x:1': 0.9 } });
    expect(clefFetch).toHaveBeenCalledOnce();
  });

  it('does not cache failures', async () => {
    await updateSettings({ accountId: 'acc', apiToken: 'tok' });
    const cache = new LruCache<string, number>(10);
    const failing = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response('{"success":false}', { status: 500 }));
    expect(await handleClassify(items, { fetch: failing, memory: cache, store: null })).toMatchObject({ ok: false, error: 'server' });
    expect(cache.size).toBe(0);
  });

  it('reports missing credentials as an error instead of throwing', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    expect(await handleClassify(items, { fetch, memory: new LruCache(10), store: null })).toMatchObject({ ok: false, error: 'auth' });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('isClassifyRequest', () => {
  it('accepts only well-formed classify messages', () => {
    expect(isClassifyRequest({ type: 'classify', items: [] })).toBe(true);
    expect(isClassifyRequest({ type: 'classify' })).toBe(false);
    expect(isClassifyRequest({ type: 'other', items: [] })).toBe(false);
    expect(isClassifyRequest(null)).toBe(false);
  });
});

describe('isClearCacheRequest', () => {
  it('recognizes the message', async () => {
    const { isClearCacheRequest } = await import('./messages');
    expect(isClearCacheRequest({ type: 'clear-cache' })).toBe(true);
    expect(isClearCacheRequest({ type: 'classify' })).toBe(false);
  });
});
