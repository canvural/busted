import { describe, expect, it, vi } from 'vitest';
import { bytesToBase64, imageToDataUrl, isAllowedImageUrl, smallImageUrl } from './images';

describe('isAllowedImageUrl', () => {
  it.each([
    ['https://i.ytimg.com/vi/abc/mqdefault.jpg', true],
    ['https://pbs.twimg.com/media/X.jpg?format=jpg&name=small', true],
    ['http://i.ytimg.com/vi/abc/mqdefault.jpg', false],
    ['https://evil.example/i.ytimg.com.jpg', false],
    ['https://i.ytimg.com.evil.example/x.jpg', false],
    ['not a url', false],
  ])('%s → %s', (url, allowed) => {
    expect(isAllowedImageUrl(url)).toBe(allowed);
  });
});

describe('smallImageUrl', () => {
  it('asks X for the small rendition', () => {
    expect(smallImageUrl('https://pbs.twimg.com/media/X?format=jpg&name=large')).toBe(
      'https://pbs.twimg.com/media/X?format=jpg&name=small',
    );
  });
  it('leaves YouTube URLs alone', () => {
    expect(smallImageUrl('https://i.ytimg.com/vi/a/mqdefault.jpg')).toBe('https://i.ytimg.com/vi/a/mqdefault.jpg');
  });
});

describe('bytesToBase64', () => {
  it('matches Node for large inputs', () => {
    const bytes = new Uint8Array(100_000).map((_, i) => (i * 31) % 256);
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });
});

describe('imageToDataUrl', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

  it('returns a data URL for an allowed YouTube thumbnail', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(new Blob([jpeg], { type: 'image/jpeg' })),
    );
    expect(await imageToDataUrl('https://i.ytimg.com/vi/a/mqdefault.jpg', fetch)).toBe(
      `data:image/jpeg;base64,${Buffer.from(jpeg).toString('base64')}`,
    );
  });

  it('never fetches disallowed URLs', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    expect(await imageToDataUrl('https://evil.example/x.jpg', fetch)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns null on HTTP errors, non-images and network failures', async () => {
    const url = 'https://i.ytimg.com/vi/a/mqdefault.jpg';
    expect(await imageToDataUrl(url, vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response('', { status: 404 })))).toBeNull();
    expect(
      await imageToDataUrl(url, vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(new Blob(['<html>'], { type: 'text/html' })))),
    ).toBeNull();
    expect(await imageToDataUrl(url, vi.fn<typeof globalThis.fetch>().mockRejectedValue(new TypeError('offline')))).toBeNull();
  });
});
