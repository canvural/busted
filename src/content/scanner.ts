/**
 * Runs on a site page: finds items near the viewport, filters them by keyword,
 * asks the background to judge them, and covers spoilers with the overlay.
 *
 * Memory stays flat however long you scroll: elements are tracked in WeakMaps/
 * WeakSets, the near-viewport set only holds what's on or near screen, and verdicts
 * live in a fixed-size LRU.
 */
import { createKeywordMatcher, type KeywordMatcher } from '../lib/keywords';
import { LruCache } from '../lib/lru';
import type { ClassifyResponse, ContentItem } from '../lib/messages';
import { activeModel, type Settings } from '../lib/settings';
import { itemText, type ExtractedItem, type SiteAdapter } from './adapter';
import { Batcher } from './batcher';
import { mountOverlay, type OverlayController } from './overlay';

/** Watch from half a screen above to 1.5 screens below the viewport (top right bottom left). */
export const ZONE_MARGIN = '50% 0px 150% 0px';
/** Pause after network/server/rate-limit errors. Auth and quota errors pause until settings change. */
export const RETRY_AFTER_ERROR_MS = 15_000;
const SCAN_THROTTLE_MS = 200;
const ID_ATTR = 'data-busted-id';

export interface ScannerDeps {
  adapter: SiteAdapter;
  topicName: string;
  classify: (items: ContentItem[]) => Promise<ClassifyResponse>;
  /** False once the extension was reloaded or updated and this page's script is orphaned. */
  isExtensionAlive: () => boolean;
  getSettings: () => Promise<Settings>;
  watchSettings: (callback: (settings: Settings) => void) => () => void;
}

export interface Scanner {
  stop(): void;
  /** Runs a scan now instead of waiting for the next page change (used by tests). */
  scanNow(): void;
}

export async function startScanner(deps: ScannerDeps): Promise<Scanner> {
  const { adapter } = deps;
  let settings = await deps.getSettings();
  let matches: KeywordMatcher = createKeywordMatcher(settings.keywords);
  let pausedUntil = 0;
  let stopped = false;
  let scanTimer: ReturnType<typeof setTimeout> | null = null;

  const verdicts = new LruCache<string, number>(2000);
  const revealed = new Set<string>();
  const overlays = new WeakMap<HTMLElement, { id: string; target: HTMLElement; controller: OverlayController }>();
  const observed = new WeakSet<HTMLElement>();
  const inZone = new Set<HTMLElement>();

  const active = () => !stopped && settings.enabled && settings.sites[adapter.site];
  // Jev checks text only. Sending no image URLs also lets its batches fill up to the
  // text-item limit instead of the 4-image one.
  const includeImages = () => settings.authMode !== 'jev' && (adapter.site === 'youtube' || settings.tweetImages);
  const tagged = (id?: string) =>
    document.querySelectorAll<HTMLElement>(id === undefined ? `[${ID_ATTR}]` : `[${ID_ATTR}="${CSS.escape(id)}"]`);

  function removeOverlay(el: HTMLElement): void {
    overlays.get(el)?.controller.remove();
    overlays.delete(el);
  }

  function setRevealed(id: string, value: boolean): void {
    if (value) revealed.add(id);
    else revealed.delete(id);
    for (const el of tagged(id)) overlays.get(el)?.controller.setRevealed(value);
  }

  function apply(el: HTMLElement, item: ExtractedItem, score: number): void {
    const current = overlays.get(el);
    if (score < settings.sensitivity) {
      if (current) removeOverlay(el);
      return;
    }
    // Same item on the same element: just sync. A new target means the site re-rendered
    // the part we cover (or finished rendering it), so mount again.
    if (current?.id === item.id && current.target === item.overlayTarget) {
      current.controller.setRevealed(revealed.has(item.id));
      return;
    }
    if (current) removeOverlay(el);
    const controller = mountOverlay(item.overlayTarget, {
      topicName: deps.topicName,
      kind: item.kind,
      dark: adapter.isDark(document),
      revealed: revealed.has(item.id),
      ...(item.overlayRows && { rows: item.overlayRows }),
      onReveal: () => setRevealed(item.id, true),
      onHide: () => setRevealed(item.id, false),
    });
    overlays.set(el, { id: item.id, target: item.overlayTarget, controller });
  }

  function process(el: HTMLElement): void {
    if (!active() || !el.isConnected) return;
    const item = adapter.extract(el, { includeImages: includeImages() });
    if (!item) {
      // Recycled into something we don't judge (e.g. an ad): clear any old overlay.
      if (el.hasAttribute(ID_ATTR)) {
        removeOverlay(el);
        el.removeAttribute(ID_ATTR);
      }
      return;
    }
    if (el.getAttribute(ID_ATTR) !== item.id) {
      // New element, or one the site recycled for a different video/post.
      removeOverlay(el);
      el.setAttribute(ID_ATTR, item.id);
    }

    const score = verdicts.get(item.id);
    if (score !== undefined) return apply(el, item, score);
    if (!settings.strictMode && !matches(itemText(item))) return;
    if (Date.now() < pausedUntil) return;
    batcher.add({ id: item.id, fields: item.fields, ...(item.imageUrls && { imageUrls: item.imageUrls }) });
  }

  async function send(items: ContentItem[]): Promise<void> {
    let response: ClassifyResponse;
    try {
      response = await deps.classify(items);
    } catch (error) {
      if (!deps.isExtensionAlive()) {
        stop(); // the extension was reloaded or updated; this page's script is orphaned
        return;
      }
      // e.g. the background was restarting: treat like a network error
      response = { ok: false, error: 'network', message: error instanceof Error ? error.message : String(error) };
    }
    if (stopped) return;
    if (!response.ok) {
      const untilSettingsChange = response.error === 'auth' || response.error === 'quota';
      pausedUntil = untilSettingsChange ? Number.POSITIVE_INFINITY : Date.now() + RETRY_AFTER_ERROR_MS;
      if (!untilSettingsChange) setTimeout(scheduleScan, RETRY_AFTER_ERROR_MS + 50);
      return;
    }
    for (const [id, score] of Object.entries(response.scores)) {
      verdicts.set(id, score);
      for (const el of tagged(id)) process(el);
    }
  }

  const batcher = new Batcher({
    send,
    isWanted: (id) => [...inZone].some((el) => el.isConnected && el.getAttribute(ID_ATTR) === id),
  });

  const intersection = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const el = entry.target as HTMLElement;
        if (entry.isIntersecting) {
          inZone.add(el);
          process(el);
        } else {
          inZone.delete(el);
          // Removed from the page (common on X's long timelines): stop watching it.
          if (!el.isConnected) intersection.unobserve(el);
        }
      }
    },
    { rootMargin: ZONE_MARGIN },
  );

  function scan(): void {
    scanTimer = null;
    if (!active()) return;
    for (const el of document.querySelectorAll<HTMLElement>(adapter.itemSelector)) {
      if (observed.has(el) || el.parentElement?.closest(adapter.itemSelector)) continue;
      observed.add(el);
      intersection.observe(el);
    }
    // Items near the viewport may have finished rendering or been recycled since last time.
    for (const el of inZone) {
      if (el.isConnected) process(el);
      else inZone.delete(el);
    }
  }

  function scheduleScan(): void {
    scanTimer ??= setTimeout(scan, SCAN_THROTTLE_MS);
  }

  const mutations = new MutationObserver(scheduleScan);
  mutations.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['href', 'video-id'],
  });

  const unwatch = deps.watchSettings((next) => {
    const modelChanged = activeModel(next) !== activeModel(settings);
    settings = next;
    matches = createKeywordMatcher(settings.keywords);
    pausedUntil = 0;
    if (modelChanged) verdicts.clear();
    if (!active()) {
      batcher.clear();
      for (const el of tagged()) removeOverlay(el);
      return;
    }
    // Re-apply with the new sensitivity/keywords, including items away from the viewport.
    for (const el of tagged()) process(el);
    scan();
  });

  function stop(): void {
    if (stopped) return;
    stopped = true;
    if (scanTimer) clearTimeout(scanTimer);
    intersection.disconnect();
    mutations.disconnect();
    batcher.clear();
    unwatch();
    for (const el of tagged()) {
      removeOverlay(el);
      el.removeAttribute(ID_ATTR);
    }
    inZone.clear();
  }

  scan();
  return { stop, scanNow: scan };
}
