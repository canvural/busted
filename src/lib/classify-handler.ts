import { topic } from '../topic';
import { classify } from './classify';
import { ClefError, type ClefItem, errorMessage } from './clef';
import { imageToDataUrl } from './images';
import { LruCache } from './lru';
import type { ClassifyResponse, ContentItem } from './messages';
import { activeModel, authFromSettings, getSettings } from './settings';
import { recordUsage, setLastError } from './stats';
import { openVerdictStore, type VerdictStore } from './verdict-store';

/** Fast in-memory layer in front of the on-disk store. Shared by all tabs. */
const sharedMemory = new LruCache<string, number>(5000);
let sharedStore: VerdictStore | null = null;

export interface HandlerDeps {
  fetch?: typeof globalThis.fetch;
  memory?: LruCache<string, number>;
  /** Pass null to skip the on-disk cache (tests). */
  store?: VerdictStore | null;
  /** Usage stats and last error; off in tests unless provided. */
  record?: boolean;
}

/** Forget every verdict (settings page "Clear cache"). */
export async function clearVerdicts(): Promise<void> {
  sharedMemory.clear();
  await (sharedStore ??= openVerdictStore()).clear();
}

/** Background side of a `classify` message: caches, images, Clef, stats. Never throws. */
export async function handleClassify(items: ContentItem[], deps: HandlerDeps = {}): Promise<ClassifyResponse> {
  const memory = deps.memory ?? sharedMemory;
  const store = deps.store === undefined ? (sharedStore ??= openVerdictStore()) : deps.store;
  const record = deps.record ?? deps.memory === undefined;
  const settings = await getSettings();
  const model = activeModel(settings);
  const key = (id: string) => `${model}|v${topic.promptVersion}|${id}`;

  const scores: Record<string, number> = {};
  let misses: ContentItem[] = [];
  for (const item of items) {
    const cached = memory.get(key(item.id));
    if (cached === undefined) misses.push(item);
    else scores[item.id] = cached;
  }

  if (misses.length > 0 && store) {
    const onDisk = await store.getMany(misses.map((item) => key(item.id))).catch(() => new Map<string, number>());
    misses = misses.filter((item) => {
      const score = onDisk.get(key(item.id));
      if (score === undefined) return true;
      memory.set(key(item.id), score);
      scores[item.id] = score;
      return false;
    });
  }
  if (misses.length === 0) return { ok: true, scores };

  // Jev gets text only (see classify), so don't download images for it.
  const withImages = settings.authMode !== 'jev';
  const clefItems: ClefItem[] = await Promise.all(
    misses.map(async (item) => {
      const urls = withImages ? (item.imageUrls ?? []) : [];
      const images = (await Promise.all(urls.map((url) => imageToDataUrl(url, deps.fetch)))).filter((dataUrl) => dataUrl !== null);
      return { id: item.id, fields: item.fields, ...(images.length > 0 && { images }) };
    }),
  );

  try {
    const result = await classify(clefItems, { auth: authFromSettings(settings), model: settings.model, topic, fetch: deps.fetch });
    const fresh: [string, number][] = [];
    for (const [id, score] of result.scores) {
      memory.set(key(id), score);
      fresh.push([key(id), score]);
      scores[id] = score;
    }
    await store?.putMany(fresh).catch(() => undefined);
    if (record) {
      await recordUsage({
        checked: result.scores.size,
        spoilers: [...result.scores.values()].filter((s) => s >= settings.sensitivity).length,
        inputTokens: result.inputTokens,
        model,
      });
      await setLastError(null);
    }
    return { ok: true, scores };
  } catch (error) {
    const kind = error instanceof ClefError ? error.kind : 'bad-response';
    const message = errorMessage(error);
    if (record) await setLastError({ kind, message, at: Date.now() });
    return { ok: false, error: kind, message };
  }
}
