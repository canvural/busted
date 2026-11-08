// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { youtubeAdapter, videoIdFromHref } from './youtube';

const byId = (id: string) => document.getElementById(id) as HTMLElement;
const extract = (id: string, includeImages = true) => youtubeAdapter.extract(byId(id), { includeImages });

beforeAll(() => {
  document.documentElement.innerHTML = readFileSync(join(import.meta.dirname, '../fixtures/youtube.html'), 'utf8');
  document.documentElement.setAttribute('dark', '');
});

describe('youtubeAdapter', () => {
  it('finds every tile type once (outermost match only)', () => {
    const matches = [...document.querySelectorAll<HTMLElement>(youtubeAdapter.itemSelector)];
    const outermost = matches.filter((el) => !el.parentElement?.closest(youtubeAdapter.itemSelector));
    expect(outermost.map((el) => el.id || el.tagName.toLowerCase())).toEqual([
      'search-1',
      'home-1',
      'sidebar-1',
      'short-1',
      'ad-1',
      'loading-1',
      'title',
    ]);
  });

  it('reads a search result', () => {
    expect(extract('search-1')).toMatchObject({
      id: 'yt:AAAAAAAAAA1',
      kind: 'video',
      fields: {
        title: "GTA 6 ENDING EXPLAINED - Lucia's Last Heist",
        channel: 'LoreDrop',
        description: 'Everything about how the story ends...',
        chapters: "Intro | Cal's Message",
      },
      imageUrls: ['https://i.ytimg.com/vi/AAAAAAAAAA1/mqdefault.jpg'],
      overlayTarget: byId('search-1'),
    });
  });

  it('reads a signed-in home feed tile', () => {
    expect(extract('home-1')).toMatchObject({
      id: 'yt:AAAAAAAAAA2',
      fields: { title: 'GTA 6 Map Size Compared', channel: 'Atlas Gaming' },
    });
  });

  it('reads a sidebar lockup', () => {
    expect(extract('sidebar-1')?.fields).toEqual({ title: 'Vice City Radio Lofi Mix', channel: 'Chill Station' });
  });

  it('reads a Short', () => {
    expect(extract('short-1')).toMatchObject({
      id: 'yt:AAAAAAAAAA4',
      kind: 'short',
      fields: { title: 'the last scene of gta 6 😭 #shorts' },
    });
  });

  it('reads the watch-page title without a thumbnail', () => {
    const title = document.querySelector<HTMLElement>('ytd-watch-metadata #title')!;
    const item = youtubeAdapter.extract(title, { includeImages: true });
    expect(item).toEqual({
      id: 'yt:AAAAAAAAAA6',
      kind: 'title',
      fields: { title: 'GTA 6 - Final Mission (No Commentary)', channel: 'NoCommentaryRuns' },
      overlayTarget: title,
    });
  });

  it('skips ads and tiles that are still loading', () => {
    expect(extract('ad-1')).toBeNull();
    expect(extract('loading-1')).toBeNull();
  });

  it('leaves out thumbnails when images are off', () => {
    expect(extract('search-1', false)).not.toHaveProperty('imageUrls');
  });

  it('detects the dark theme', () => {
    expect(youtubeAdapter.isDark(document)).toBe(true);
  });
});

describe('videoIdFromHref', () => {
  it.each([
    ['/watch?v=AAAAAAAAAA1&pp=x', { id: 'AAAAAAAAAA1', short: false }],
    ['https://www.youtube.com/watch?v=abc_DEF-123', { id: 'abc_DEF-123', short: false }],
    ['/shorts/AAAAAAAAAA4', { id: 'AAAAAAAAAA4', short: true }],
    ['/watch?v=tooshort', null],
    ['/playlist?list=PL123', null],
    [null, null],
  ])('%s', (href, expected) => {
    expect(videoIdFromHref(href)).toEqual(expected);
  });
});
