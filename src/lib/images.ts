/**
 * Turns image URLs from YouTube and X into the `data:` URLs Clef accepts.
 * Runs in the background, which has host access to the image servers.
 */

/** Only these hosts are fetched, so a page can't make us download arbitrary URLs. */
const ALLOWED_HOSTS = new Set(['i.ytimg.com', 'pbs.twimg.com']);

/** Long side in pixels. Clef bills one token per 32×32 block, so smaller is cheaper. */
export const MAX_IMAGE_SIDE = 384;

export function isAllowedImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && ALLOWED_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

/** Ask X's image server for a small rendition instead of downloading a large one. */
export function smallImageUrl(url: string): string {
  const u = new URL(url);
  if (u.hostname === 'pbs.twimg.com' && u.searchParams.has('name')) {
    u.searchParams.set('name', 'small');
  }
  return u.toString();
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function downscale(blob: Blob, maxSide: number): Promise<Blob> {
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return blob;
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && blob.type === 'image/jpeg') return blob;
    const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return blob;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
  } finally {
    bitmap.close();
  }
}

/** Returns a `data:` URL, or null if the URL isn't allowed or the download fails. */
export async function imageToDataUrl(
  url: string,
  fetch: typeof globalThis.fetch = globalThis.fetch.bind(globalThis),
): Promise<string | null> {
  if (!isAllowedImageUrl(url)) return null;
  try {
    const response = await fetch(smallImageUrl(url));
    if (!response.ok) return null;
    let blob = await response.blob();
    if (!/^image\/(jpeg|png|webp)$/.test(blob.type)) return null;
    // YouTube's mqdefault thumbnails are already 320×180; only resize larger images.
    if (new URL(url).hostname !== 'i.ytimg.com') blob = await downscale(blob, MAX_IMAGE_SIDE);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return `data:${blob.type};base64,${bytesToBase64(bytes)}`;
  } catch {
    return null;
  }
}
