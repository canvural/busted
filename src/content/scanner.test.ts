// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassifyResponse, ContentItem } from '../lib/messages';
import { DEFAULT_SETTINGS, type Settings, withDefaults } from '../lib/settings';
import type { SiteAdapter } from './adapter';
import { xAdapter } from './adapters/x';
import { youtubeAdapter } from './adapters/youtube';
import { RETRY_AFTER_ERROR_MS, startScanner, type Scanner } from './scanner';
import { FakeIntersectionObserver, hideButtonOf, openShadowRoots, surfaceOf } from './test-helpers';

const fixture = readFileSync(join(import.meta.dirname, 'fixtures/youtube.html'), 'utf8');
const SPOILER = 'yt:AAAAAAAAAA1'; // "GTA 6 ENDING EXPLAINED - Lucia's Last Heist"

let scanner: Scanner | undefined;
let settingsListener: ((s: Settings) => void) | undefined;
let extensionAlive = true;

beforeEach(() => {
  vi.useFakeTimers();
  openShadowRoots();
  FakeIntersectionObserver.instances = [];
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  document.documentElement.innerHTML = fixture;
  extensionAlive = true;
});

afterEach(() => {
  scanner?.stop();
  scanner = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function start(
  scores: Record<string, number> | ClassifyResponse,
  settings: Partial<Settings> = {},
  adapter: SiteAdapter = youtubeAdapter,
) {
  const classify = vi.fn(async (items: ContentItem[]): Promise<ClassifyResponse> => {
    if ('ok' in scores) return scores as ClassifyResponse;
    return { ok: true, scores: Object.fromEntries(items.map((i) => [i.id, (scores as Record<string, number>)[i.id] ?? 0.01])) };
  });
  scanner = await startScanner({
    adapter,
    topicName: 'GTA VI',
    classify,
    isExtensionAlive: () => extensionAlive,
    getSettings: async () => withDefaults(settings),
    watchSettings: (cb) => {
      settingsListener = cb;
      return () => (settingsListener = undefined);
    },
  });
  await vi.advanceTimersByTimeAsync(150); // batch delay
  return classify;
}

const el = (id: string) => document.getElementById(id) as HTMLElement;
const sentIds = (classify: ReturnType<typeof vi.fn>) => classify.mock.calls.flatMap(([items]) => (items as ContentItem[]).map((i) => i.id));

describe('scanner', () => {
  it('sends only keyword matches, batched into one request', async () => {
    const classify = await start({ [SPOILER]: 0.95 });
    expect(classify).toHaveBeenCalledTimes(1);
    // "Vice City Radio Lofi Mix" matches "Vice City"; the rest match "GTA 6".
    expect(sentIds(classify).sort()).toEqual(['yt:AAAAAAAAAA1', 'yt:AAAAAAAAAA2', 'yt:AAAAAAAAAA3', 'yt:AAAAAAAAAA4', 'yt:AAAAAAAAAA6']);
  });

  it('covers spoilers and leaves everything else alone', async () => {
    await start({ [SPOILER]: 0.95, 'yt:AAAAAAAAAA6': 0.9 });
    expect(surfaceOf(el('search-1'))).not.toBeNull();
    expect(surfaceOf(document.querySelector('ytd-watch-metadata #title')!)).not.toBeNull();
    expect(document.querySelectorAll('busted-overlay')).toHaveLength(2);
  });

  it('respects the sensitivity setting, and re-applies when it changes', async () => {
    await start({ [SPOILER]: 0.6 }, { sensitivity: 0.7 });
    expect(surfaceOf(el('search-1'))).toBeNull();
    settingsListener!(withDefaults({ sensitivity: 0.5 }));
    expect(surfaceOf(el('search-1'))).not.toBeNull();
  });

  it('sends everything in strict mode', async () => {
    document.querySelector('#sidebar-1 h3')!.setAttribute('title', 'Cooking pasta at home');
    const classify = await start({}, { strictMode: true });
    expect(sentIds(classify)).toContain('yt:AAAAAAAAAA3');
  });

  it('remembers a reveal per video across re-renders', async () => {
    await start({ [SPOILER]: 0.95 });
    surfaceOf(el('search-1'))!.click();
    await vi.advanceTimersByTimeAsync(200);
    expect(hideButtonOf(el('search-1'))).not.toBeNull();

    // The site re-renders the same video in a fresh element.
    const copy = el('search-1').cloneNode(true) as HTMLElement;
    copy.id = 'search-1-copy';
    copy.querySelector('busted-overlay')?.remove();
    copy.removeAttribute('data-busted-id');
    document.body.appendChild(copy);
    scanner!.scanNow();
    expect(hideButtonOf(copy)).not.toBeNull();
  });

  it('clears the overlay when the site recycles a tile for another video', async () => {
    await start({ [SPOILER]: 0.95 });
    const tile = el('search-1');
    for (const a of tile.querySelectorAll('a')) a.setAttribute('href', '/watch?v=BBBBBBBBBB1');
    tile.querySelector('#video-title')!.setAttribute('title', 'Cat videos compilation');
    scanner!.scanNow();
    expect(tile.querySelector('busted-overlay')).toBeNull();
    expect(tile.getAttribute('data-busted-id')).toBe('yt:BBBBBBBBBB1');
  });

  it('sends no image URLs in Jev mode, which checks text only', async () => {
    const withImages = await start({});
    expect(withImages.mock.calls.flatMap(([items]) => items).some((i) => i.imageUrls)).toBe(true);
    scanner!.stop();

    const classify = await start({}, { authMode: 'jev', jevApiKey: 'k' });
    const items = classify.mock.calls.flatMap(([batch]) => batch);
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((i) => i.imageUrls)).toBe(false);
  });

  it('asks again when switching between Clef and Jev', async () => {
    const classify = await start({ [SPOILER]: 0.95 });
    const before = classify.mock.calls.length;
    settingsListener!(withDefaults({ authMode: 'jev', jevApiKey: 'k' }));
    await vi.advanceTimersByTimeAsync(150);
    expect(classify.mock.calls.length).toBeGreaterThan(before);
    expect(sentIds(classify)).toContain(SPOILER);
  });

  it('does not send items that left the zone before their batch went out', async () => {
    el('search-1').setAttribute('data-test-offscreen', '');
    const classify = await start({});
    expect(sentIds(classify)).not.toContain(SPOILER);
  });

  it('pauses after an auth error until settings change', async () => {
    const classify = await start({ ok: false, error: 'auth', message: 'No credentials configured' });
    expect(classify).toHaveBeenCalledTimes(1);
    document.body.insertAdjacentHTML('beforeend', fixture.match(/<ytd-video-renderer id="search-1"[\s\S]*?<\/ytd-video-renderer>/)![0].replace('search-1', 'search-2').replaceAll('AAAAAAAAAA1', 'CCCCCCCCCC1'));
    scanner!.scanNow();
    await vi.advanceTimersByTimeAsync(RETRY_AFTER_ERROR_MS * 2);
    expect(classify).toHaveBeenCalledTimes(1);

    settingsListener!(withDefaults({ apiToken: 'new' }));
    await vi.advanceTimersByTimeAsync(150);
    // Resumed: everything is re-sent (in two requests, since a request holds at most 4 thumbnails).
    expect(classify.mock.calls.length).toBeGreaterThan(1);
    expect(sentIds(classify)).toContain('yt:CCCCCCCCCC1');
  });

  it('removes everything when turned off for the site', async () => {
    await start({ [SPOILER]: 0.95 });
    settingsListener!(withDefaults({ sites: { ...DEFAULT_SETTINGS.sites, youtube: false } }));
    expect(document.querySelectorAll('busted-overlay')).toHaveLength(0);
  });

  it('retries after a failed message while the extension is alive, and stops once it is gone', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('Could not establish connection'));
    scanner = await startScanner({
      adapter: youtubeAdapter,
      topicName: 'GTA VI',
      classify: failing,
      isExtensionAlive: () => extensionAlive,
      getSettings: async () => withDefaults({}),
      watchSettings: () => () => undefined,
    });
    await vi.advanceTimersByTimeAsync(150);
    const callsAfterFirstTry = failing.mock.calls.length;
    expect(callsAfterFirstTry).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(RETRY_AFTER_ERROR_MS + 500);
    expect(failing.mock.calls.length).toBeGreaterThan(callsAfterFirstTry);

    extensionAlive = false;
    await vi.advanceTimersByTimeAsync(RETRY_AFTER_ERROR_MS + 500);
    expect(document.querySelectorAll('[data-busted-id]')).toHaveLength(0);
  });

  it('stop() removes overlays and markers', async () => {
    await start({ [SPOILER]: 0.95 });
    scanner!.stop();
    expect(document.querySelectorAll('busted-overlay, [data-busted-id]')).toHaveLength(0);
  });

  it("covers an X post's content, and follows it when X re-renders the column", async () => {
    document.documentElement.innerHTML = readFileSync(join(import.meta.dirname, 'fixtures/x.html'), 'utf8');
    await start({ 'x:1001': 0.95 }, { strictMode: true }, xAdapter);
    expect(surfaceOf(el('plain-column'))).not.toBeNull();
    expect(el('plain-header').querySelector('busted-overlay')).toBeNull();

    const fresh = el('plain-column').cloneNode(true) as HTMLElement;
    fresh.querySelector('busted-overlay')?.remove();
    el('plain-column').replaceWith(fresh);
    await vi.advanceTimersByTimeAsync(1000);

    expect(surfaceOf(fresh)).not.toBeNull();
    expect(el('plain').querySelectorAll('busted-overlay')).toHaveLength(1);
  });
});
