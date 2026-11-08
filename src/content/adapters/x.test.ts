// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { MAX_IMAGES_PER_TWEET, xAdapter } from './x';

const byId = (id: string) => document.getElementById(id) as HTMLElement;
const extract = (id: string, includeImages = true) => xAdapter.extract(byId(id), { includeImages });
const coveredRows = (id: string) => extract(id)?.overlayRows?.().map((row) => row.id);

beforeAll(() => {
  document.documentElement.innerHTML = readFileSync(join(import.meta.dirname, '../fixtures/x.html'), 'utf8');
  document.body.style.backgroundColor = 'rgb(0, 0, 0)';
});

describe('xAdapter', () => {
  it('matches every post', () => {
    expect(document.querySelectorAll(xAdapter.itemSelector)).toHaveLength(6);
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
