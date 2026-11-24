// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { byId, loadFixture, setPageUrl } from '../test-helpers';
import { MAX_IMAGES_PER_TWEET, pagePostId, xAdapter } from './x';

const extract = (id: string, includeImages = true) => xAdapter.extract(byId(id), { includeImages });
const coveredRows = (id: string) => extract(id)?.overlayRows?.().map((row) => row.id);

/** Put back an element a test took out, where it was. */
function removed(el: Element): () => void {
  const parent = el.parentElement!;
  const next = el.nextSibling;
  el.remove();
  return () => parent.insertBefore(el, next);
}

// X serves two markups. The fixtures hold the same posts under the same ids.
const markups = [
  {
    fixture: 'x',
    posts: 9,
    card: 'Every character who dies in GTA 6 gamewire.example',
    quotedImages: ['https://pbs.twimg.com/media/QQQ?format=jpg&name=small', 'https://pbs.twimg.com/media/RRR?format=jpg&name=small'],
  },
  {
    fixture: 'x-legacy',
    posts: 7,
    card: 'gamewire.example Every character who dies in GTA 6',
    quotedImages: ['https://pbs.twimg.com/media/QQQ?format=jpg&name=120x120', 'https://pbs.twimg.com/media/RRR?format=jpg&name=120x120'],
  },
] as const;

describe.each(markups)('xAdapter on $fixture', ({ fixture, posts, card, quotedImages }) => {
  beforeAll(() => {
    loadFixture(fixture);
    document.body.style.backgroundColor = 'rgb(0, 0, 0)';
  });

  it('matches every post', () => {
    const outermost = [...document.querySelectorAll(xAdapter.itemSelector)].filter(
      (el) => !el.parentElement?.closest(xAdapter.itemSelector),
    );
    expect(outermost).toHaveLength(posts);
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
      const putBack = removed(byId('photos-media'));
      expect(rows().map((row) => row.id)).toEqual(['photos-text', 'photos-text']);
      putBack();
    });

    it('covers the whole post when there is no action bar to anchor to', () => {
      const putBack = removed(byId('plain-bar'));
      const item = extract('plain');
      putBack();
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
    expect(item?.imageUrls).toEqual(quotedImages);
  });

  it('keeps real alt text, drops the generic "Image", and caps images per post', () => {
    const item = extract('photos');
    expect(item?.fields.alt).toEqual(["Jason's grave in a Vice City cemetery"]);
    expect(item?.imageUrls).toHaveLength(MAX_IMAGES_PER_TWEET);
    expect(item?.kind).toBe('post · 3 images');
  });

  it('reads link card text', () => {
    expect(extract('card')?.fields).toEqual({ card });
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
      extract('focal');
      const putBack = removed(byId('focal'));
      // Scrolling through more replies than are remembered must not push it out.
      const later = Array.from({ length: 60 }, (_, i) => {
        const clone = byId('reply').cloneNode(true) as HTMLElement;
        clone.querySelector('a[href*="/status/"]')!.setAttribute('href', `/sadgamer/status/${2000 + i}`);
        document.body.append(clone);
        const item = xAdapter.extract(clone, { includeImages: true });
        clone.remove();
        return item;
      });
      putBack();
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

describe('xAdapter on the current markup only', () => {
  beforeAll(() => loadFixture('x'));

  it("reads a repost through the article around the post's own", () => {
    const item = extract('repost');
    expect(item).toMatchObject({ id: 'x:1007', fields: { text: 'the map leak was real' } });
    expect(item?.overlayTarget).toBe(byId('repost-column'));
    expect(coveredRows('repost')).toEqual(['repost-text', 'repost-text']);
  });

  it('reads translated text, and skips a post link the author wrote when looking for the id', () => {
    expect(extract('translated')).toMatchObject({
      id: 'x:1008',
      fields: { text: 'the final mission is set in the Keys, see x.com/leonidaleaks/status/1001' },
    });
    expect(coveredRows('translated')).toEqual(['translated-text', 'translated-text']);
  });

  it("keeps the quoted post's own link from being taken for the post's", () => {
    byId('quote').querySelector('a[href="/vicecityvibes/status/1002"]')!.setAttribute('href', '/vicecityvibes');
    expect(extract('quote')).toBeNull();
  });
});
