/** Messages between content scripts and the background. Content scripts never call Clef; only the background does. */
import type { ClefErrorKind } from './clef';

/** One video or tweet as a content script sees it. Images are URLs; the background downloads them. */
export interface ContentItem {
  id: string;
  fields: Record<string, string | string[]>;
  imageUrls?: string[];
}

export interface ClassifyRequest {
  type: 'classify';
  items: ContentItem[];
}

export type ClassifyResponse =
  | { ok: true; scores: Record<string, number> }
  | { ok: false; error: ClefErrorKind; message: string };

export interface ClearCacheRequest {
  type: 'clear-cache';
}

export function isClearCacheRequest(message: unknown): message is ClearCacheRequest {
  return (message as Partial<ClearCacheRequest> | null)?.type === 'clear-cache';
}

export function isClassifyRequest(message: unknown): message is ClassifyRequest {
  const m = message as Partial<ClassifyRequest> | null;
  return m?.type === 'classify' && Array.isArray(m.items);
}
