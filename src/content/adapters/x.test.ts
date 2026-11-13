// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setPageUrl } from '../test-helpers';
import { MAX_IMAGES_PER_TWEET, pagePostId, xAdapter } from './x';

const byId = (id: string) => document.getElementById(id) as HTMLElement;
const extract = (id: string, includeImages = true) => xAdapter.extract(byId(id), { includeImages });
const coveredRows = (id: string) => extract(id)?.overlayRows?.().map((row) => row.id);

beforeAll(() => {
  document.documentElement.innerHTML = readFileSync(join(import.meta.dirname, '../fixtures/x.html'), 'utf8');
  document.body.style.backgroundColor = 'rgb(0, 0, 0)';
});

describe('xAdapter', () => {
  it('matches every post', () => {
    expect(document.querySelectorAll(xAdapter.itemSelector)).toHaveLength(7);
  });

  it('reads a plain post and its id from the status link around <time>', () => {
    expect(extract('plain')).toMatchObject({
      id: 'x:1001',
      kind: 'post',
      fields: { text: 'confirmed: Lucia does NOT survive the final heist 😭' },
    });
  });

  describe('overlay area', () => {
    it('covers only the content rows of the post column, not the header, reply line or action bar', () => {
      expect(extract('plain')?.overlayTarget).toBe(byId('plain-column'));
      expect(coveredRows('plain')).toEqual(['plain-text', 'plain-text']);
    });

    it('spans text through media, quoted posts and cards', () => {
      expect(coveredRows('photos')).toEqual(['photos-text', 'photos-media']);
      expect(coveredRows('quote')).toEqual(['quote-text', 'quote-box']);
      expect(coveredRows('card')).toEqual(['card-row', 'card-row']);
    });

    it("keeps a post page's header, timestamp and stats outside", () => {
      expect(extract('focal')?.overlayTarget).toBe(byId('focal-column'));
      expect(coveredRows('focal')).toEqual(['focal-text', 'focal-media']);
    });

    it('re-reads the rows each time, since X re-renders them', () => {
      const rows = extract('photos')!.overlayRows!;
      const media = byId('photos-media');
      media.remove();
      expect(rows().map((row) => row.id)).toEqual(['photos-text', 'photos-text']);
      byId('photos-text').after(media);
    });

    it('covers the whole post when there is no action bar to anchor to', () => {
      const bar = byId('plain-bar');
      bar.remove();
      const item = extract('plain');
      byId('plain-text').after(bar);
      expect(item?.overlayTarget).toBe(byId('plain'));
      expect(item?.overlayRows).toBeUndefined();
    });
  });

  it('separates the quoted post and includes its images', () => {
    const item = extract('quote');
    expect(item?.id).toBe('x:1002');
    expect(item?.fields).toEqual({
      text: 'so this is why Brian was acting weird lmao',
      quoted: 'datamined dialogue: Brian is the informant',
    });
    expect(item?.imageUrls).toEqual([
      'https://pbs.twimg.com/media/QQQ?format=jpg&name=120x120',
      'https://pbs.twimg.com/media/RRR?format=jpg&name=120x120',
    ]);
  });

  it('keeps real alt text, drops the generic "Image", and caps images per post', () => {
    const item = extract('photos');
    expect(item?.fields.alt).toEqual(["Jason's grave in a Vice City cemetery"]);
    expect(item?.imageUrls).toHaveLength(MAX_IMAGES_PER_TWEET);
    expect(item?.kind).toBe('post · 3 images');
  });

  it('reads link card text', () => {
    expect(extract('card')?.fields).toEqual({ card: 'gamewire.example Every character who dies in GTA 6' });
  });

  describe('replies', () => {
    const open = (path: string) => setPageUrl(`https://x.com${path}`);
    afterEach(() => open('/home'));

    it('reads the main post from the page address', () => {
      expect(pagePostId('/heistwatch/status/1005')).toBe('1005');
      // A photo can open over a timeline, whose posts aren't replies.
      expect(pagePostId('/heistwatch/status/1005/photo/1')).toBeNull();
      expect(pagePostId('/home')).toBeNull();
      expect(pagePostId('/search')).toBeNull();
    });

    it("adds the main post's text to a reply on a post page, under its own id", () => {
      open('/heistwatch/status/1005');
      expect(extract('reply')).toMatchObject({
        id: 'x:1006:re:1005',
        fields: { text: "can't believe he actually dies", replying_to: "the ending cutscene leaked, it's Jason" },
      });
    });

    it('leaves a reply alone away from its post page', () => {
      expect(extract('reply')).toMatchObject({ id: 'x:1006', fields: { text: "can't believe he actually dies" } });
      expect(extract('reply')?.fields).not.toHaveProperty('replying_to');
    });

    it('gives no context to the main post or to the older posts above it', () => {
      open('/heistwatch/status/1005');
      expect(extract('focal')?.id).toBe('x:1005');
      expect(extract('focal')?.fields).not.toHaveProperty('replying_to');
      expect(extract('plain')?.id).toBe('x:1001');
      expect(extract('plain')?.fields).not.toHaveProperty('replying_to');
    });

    it('still knows the main post after X removed it from the page', () => {
      open('/heistwatch/status/1005');
      const focal = byId('focal');
      const next = focal.nextElementSibling!;
      extract('focal');
      focal.remove();
      // Scrolling through more replies than are remembered must not push it out.
      const later = Array.from({ length: 60 }, (_, i) => {
        const clone = byId('reply').cloneNode(true) as HTMLElement;
        clone.querySelector('a[href*="/status/"]')!.setAttribute('href', `/sadgamer/status/${2000 + i}`);
        document.body.append(clone);
        const item = xAdapter.extract(clone, { includeImages: true });
        clone.remove();
        return item;
      });
      next.before(focal);
      expect(later.at(-1)).toMatchObject({ id: 'x:2059:re:1005', fields: { replying_to: "the ending cutscene leaked, it's Jason" } });
    });

    it('gives no context when the main post was never seen', () => {
      open('/leonidaleaks/status/999');
      expect(extract('reply')?.id).toBe('x:1006');
    });
  });

  it('skips posts without a status link (ads)', () => {
    expect(extract('ad')).toBeNull();
  });

  it('leaves out images when they are turned off', () => {
    expect(extract('quote', false)).not.toHaveProperty('imageUrls');
  });

  it('detects dark backgrounds', () => {
    expect(xAdapter.isDark(document)).toBe(true);
    document.body.style.backgroundColor = 'rgb(255, 255, 255)';
    expect(xAdapter.isDark(document)).toBe(false);
  });
});
