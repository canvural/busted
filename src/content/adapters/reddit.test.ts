// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { postIdFromHref, redditAdapter } from './reddit';

const byId = (id: string) => document.getElementById(id) as HTMLElement;
const extract = (id: string) => redditAdapter.extract(byId(id), { includeImages: true });

beforeAll(() => {
  document.documentElement.innerHTML = readFileSync(join(import.meta.dirname, '../fixtures/reddit.html'), 'utf8');
  document.documentElement.style.backgroundColor = 'rgb(255, 255, 255)';
});

describe('redditAdapter', () => {
  it('matches feed posts and search results, but not ads', () => {
    const matched = [...document.querySelectorAll(redditAdapter.itemSelector)].map((el) => el.id);
    expect(matched).toEqual(['t3_1aaa000', 't3_1aaa001', 't3_1aaa005', 't3_1aaa002', 't3_1aaa003', 'search-unit']);
  });

  it('reads a text post: title, subreddit, flair and body', () => {
    expect(extract('t3_1aaa001')).toMatchObject({
      id: 'reddit:1aaa001',
      kind: 'post',
      fields: {
        title: 'The ending is brutal (story spoilers)',
        subreddit: 'r/LeonidaLeaks',
        flair: 'Leak',
        text: 'Jason takes the fall so Lucia can get out of Vice City. Cal Hampton was right all along.',
      },
    });
  });

  it('names the media type and sends no images', () => {
    const image = extract('t3_1aaa002');
    expect(image).toMatchObject({
      id: 'reddit:1aaa002',
      kind: 'image post',
      fields: { title: "Lucia's last scene, screenshot from the leak", subreddit: 'r/gamingpics' },
    });
    expect(image?.fields).not.toHaveProperty('flair');
    expect(image).not.toHaveProperty('imageUrls');
    expect(extract('t3_1aaa003')?.kind).toBe('video post');
  });

  it('reads a highlighted post', () => {
    expect(extract('t3_1aaa000')).toMatchObject({
      id: 'reddit:1aaa000',
      kind: 'post',
      fields: { title: '[Countdown] GTA VI Release Begins', subreddit: 'r/LeonidaLeaks' },
    });
  });

  it('reads a search result, with the same id a feed post would get', () => {
    const item = extract('search-unit');
    expect(item).toMatchObject({
      id: 'reddit:1aaa004',
      kind: 'post',
      fields: { title: '20 hours into GTA 6, here is who dies', subreddit: 'r/LeonidaUnmoderated' },
    });
    expect(item?.overlayTarget).toBe(byId('search-unit'));
    expect(item?.overlayRows).toBeUndefined();
  });

  it('falls back to the permalink and the title link when the attributes are missing', () => {
    const post = byId('t3_1aaa003');
    post.removeAttribute('id');
    post.removeAttribute('post-title');
    const item = redditAdapter.extract(post, { includeImages: true });
    post.id = 't3_1aaa003';
    post.setAttribute('post-title', 'Trailer 3 reaction');
    expect(item).toMatchObject({ id: 'reddit:1aaa003', fields: { title: 'Trailer 3 reaction' } });
  });

  it('skips a post that has no id or title yet', () => {
    const post = document.createElement('shreddit-post');
    expect(redditAdapter.extract(post, { includeImages: true })).toBeNull();
    const unit = document.createElement('div');
    unit.setAttribute('data-testid', 'search-post-unit');
    expect(redditAdapter.extract(unit, { includeImages: true })).toBeNull();
  });

  describe('overlay area', () => {
    const rows = (id: string) => extract(id)?.overlayRows?.().map((row) => row.id);

    it('spans from the title to the last content part, leaving the credit bar outside', () => {
      expect(extract('t3_1aaa001')?.overlayTarget).toBe(byId('t3_1aaa001'));
      expect(rows('t3_1aaa001')).toEqual(['post-title-t3_1aaa001', 'text-body']);
      expect(rows('t3_1aaa002')).toEqual(['post-title-t3_1aaa002', 'image-media']);
    });

    it('covers just the title of a title-only post, skipping its empty flair element', () => {
      expect(rows('t3_1aaa005')).toEqual(['post-title-t3_1aaa005', 'post-title-t3_1aaa005']);
    });

    it('covers the whole post in views other than the card view', () => {
      const post = byId('t3_1aaa001');
      post.setAttribute('view-type', 'compactView');
      const item = extract('t3_1aaa001');
      post.setAttribute('view-type', 'cardView');
      expect(item?.overlayTarget).toBe(post);
      expect(item?.overlayRows).toBeUndefined();
    });

    it('re-reads the parts each time, since Reddit loads media late', () => {
      const read = extract('t3_1aaa002')!.overlayRows!;
      const media = byId('image-media');
      media.remove();
      expect(read().map((row) => row.id)).toEqual(['post-title-t3_1aaa002', 'post-title-t3_1aaa002']);
      byId('t3_1aaa002').append(media);
    });
  });

  it('reads post ids from links', () => {
    expect(postIdFromHref('/r/GTA6/comments/1xt2lkm/some_slug/')).toBe('1xt2lkm');
    expect(postIdFromHref('/r/GTA6/')).toBeNull();
    expect(postIdFromHref(null)).toBeNull();
  });

  it('detects the theme from the page background, which sits on <html> when <body> is transparent', () => {
    expect(redditAdapter.isDark(document)).toBe(false);
    document.documentElement.style.backgroundColor = 'rgb(14, 17, 19)';
    expect(redditAdapter.isDark(document)).toBe(true);
    document.body.style.backgroundColor = 'rgb(255, 255, 255)';
    expect(redditAdapter.isDark(document)).toBe(false);
    document.body.style.backgroundColor = '';
    document.documentElement.style.backgroundColor = 'rgb(255, 255, 255)';
  });
});
