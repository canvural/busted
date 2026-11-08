/**
 * Groups items into Clef requests: waits briefly so items arriving together share a
 * request, respects Clef's per-request limits, caps requests in flight, and drops
 * items the user has already scrolled past.
 */
import { MAX_IMAGES_PER_REQUEST, MAX_TEXT_ITEMS_PER_REQUEST } from '../lib/clef';
import type { ContentItem } from '../lib/messages';

export const BATCH_DELAY_MS = 100;
export const MAX_IN_FLIGHT = 3;

export interface BatcherOptions {
  send: (items: ContentItem[]) => Promise<void>;
  /** Checked right before sending; items no longer near the viewport are dropped. */
  isWanted: (id: string) => boolean;
  delayMs?: number;
  maxInFlight?: number;
}

export class Batcher {
  readonly #queue = new Map<string, ContentItem>();
  readonly #inFlightIds = new Set<string>();
  readonly #options: Required<BatcherOptions>;
  #inFlight = 0;
  #timer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: BatcherOptions) {
    this.#options = { delayMs: BATCH_DELAY_MS, maxInFlight: MAX_IN_FLIGHT, ...options };
  }

  /** True while the item is queued or being judged. */
  has(id: string): boolean {
    return this.#queue.has(id) || this.#inFlightIds.has(id);
  }

  add(item: ContentItem): void {
    if (this.has(item.id)) return;
    this.#queue.set(item.id, item);
    this.#timer ??= setTimeout(() => {
      this.#timer = null;
      this.#flush();
    }, this.#options.delayMs);
  }

  clear(): void {
    this.#queue.clear();
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
  }

  #flush(): void {
    while (this.#inFlight < this.#options.maxInFlight) {
      const batch = this.#takeBatch();
      if (batch.length === 0) return;
      this.#inFlight++;
      for (const item of batch) this.#inFlightIds.add(item.id);
      void this.#options
        .send(batch)
        .catch(() => undefined)
        .finally(() => {
          this.#inFlight--;
          for (const item of batch) this.#inFlightIds.delete(item.id);
          if (this.#queue.size > 0) this.#flush();
        });
    }
  }

  #takeBatch(): ContentItem[] {
    const batch: ContentItem[] = [];
    let images = 0;
    for (const [id, item] of this.#queue) {
      if (!this.#options.isWanted(id)) {
        this.#queue.delete(id);
        continue;
      }
      const itemImages = Math.min(item.imageUrls?.length ?? 0, MAX_IMAGES_PER_REQUEST);
      if (batch.length >= MAX_TEXT_ITEMS_PER_REQUEST || images + itemImages > MAX_IMAGES_PER_REQUEST) break;
      batch.push(itemImages === (item.imageUrls?.length ?? 0) ? item : { ...item, imageUrls: item.imageUrls?.slice(0, itemImages) });
      images += itemImages;
      this.#queue.delete(id);
    }
    return batch;
  }
}
