import type { ContentItem } from '../lib/messages';

/** One video or tweet found on the page, ready to judge. */
export interface ExtractedItem extends ContentItem {
  /** Shown on the overlay, e.g. "video", "short", "tweet · 2 images". */
  kind: string;
  /** Element the overlay covers. */
  overlayTarget: HTMLElement;
  /**
   * Limits the overlay to part of `overlayTarget`: it spans from the first to the last of
   * the returned children. Called again whenever the target resizes, because sites
   * re-render. Returning none covers the whole target.
   */
  overlayRows?: () => readonly Element[];
}

export interface ExtractOptions {
  includeImages: boolean;
}

/** Everything a content script needs to know about one site's page structure. */
export interface SiteAdapter {
  site: 'youtube' | 'x';
  /** Item containers. When matches nest, only the outermost is used. */
  itemSelector: string;
  /** Returns null when the element isn't a judgeable item (yet), e.g. an ad or a tile still loading. */
  extract(element: HTMLElement, options: ExtractOptions): ExtractedItem | null;
  isDark(document: Document): boolean;
}

/** Fields sent to Clef are capped so one long post can't blow up a request. */
export const MAX_FIELD_LENGTH = 600;

export function clean(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_FIELD_LENGTH);
}

/** Drops empty fields so requests stay small. */
export function compactFields(fields: Record<string, string | string[] | undefined>): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value) ? value.length > 0 : value) out[key] = value as string | string[];
  }
  return out;
}

/** All text in an item, for the keyword pre-filter. */
export function itemText(item: ContentItem): string {
  return Object.values(item.fields).flat().join(' ');
}
