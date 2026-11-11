/**
 * Reddit page structure (www.reddit.com, signed out, light theme; read from the maintainer's
 * browser on 2026-11-11: home feed, r/GTA6 and search results):
 * - Feed posts are `shreddit-post` custom elements. The post's data is in attributes:
 *   `id="t3_<id>"`, `post-title`, `post-type` (text, image, gallery, video, link,
 *   customPost…), `subreddit-prefixed-name`, `permalink`.
 * - A post's parts are light-DOM children placed by `slot`: `credit-bar` (subreddit or
 *   author, age), `title`, `post-flair`, `text-body` (text posts; the text itself is
 *   `#t3_<id>-post-rtjson-content`) and `post-media-container`. The action bar (votes,
 *   comments, share) is drawn inside the post's shadow root.
 * - A subreddit's pinned "highlights" are `shreddit-post` too, with a `highlighted` attribute.
 * - Ads are `shreddit-ad-post` and are left alone.
 * - Every post seen was `view-type="cardView"`. The shadow root also has a `thumbnail`
 *   slot, presumably for the compact view, which wasn't seen.
 * - Search results aren't `shreddit-post`. Each is `[data-testid="search-post-unit"]`, with
 *   the title in `a[data-testid="post-title-text"]`, whose id is `search-post-title-t3_<id>`
 *   and whose href is `/r/<subreddit>/comments/<id>/<slug>/`. The rest of a
 *   result's markup hasn't been read in full.
 * - In the light theme `<body>` is transparent and `<html>` carries the background colour.
 *
 * Not checked yet: the post page, comments, the dark theme and old.reddit.com.
 */
import { clean, compactFields, type ExtractedItem, type SiteAdapter } from '../adapter';

const POST_SELECTOR = 'shreddit-post';
const SEARCH_RESULT_SELECTOR = '[data-testid="search-post-unit"]';
/** The slots that hold what a post says or shows, in the order they're drawn. */
const CONTENT_SLOTS = ['title', 'post-flair', 'text-body', 'post-media-container'];

const KINDS: Record<string, string> = {
  image: 'image post',
  gallery: 'gallery post',
  video: 'video post',
  link: 'link post',
};

export function postIdFromHref(href: string | null | undefined): string | null {
  return /\/comments\/([a-z0-9]+)/i.exec(href ?? '')?.[1] ?? null;
}

function subredditFromHref(href: string | null | undefined): string {
  const name = /\/r\/([^/]+)\/comments\//.exec(href ?? '')?.[1];
  return name ? `r/${name}` : '';
}

/** The post's own parts, not those of anything nested deeper. */
function slotted(post: HTMLElement, slot: string): HTMLElement | null {
  return [...post.children].find((child) => child.getAttribute('slot') === slot) as HTMLElement | null ?? null;
}

/** Text with a space between blocks, so paragraphs don't run together. */
function blockText(root: Element | null): string {
  if (!root) return '';
  const parts: string[] = [];
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) parts.push(node.textContent ?? '');
  return parts.join(' ');
}

/**
 * First and last content parts, so the subreddit line and the action bar stay visible.
 * Posts without flair still carry an empty flair element, which is skipped.
 */
export function contentParts(post: HTMLElement): Element[] {
  const parts = CONTENT_SLOTS.map((slot) => slotted(post, slot)).filter(
    (el) => el !== null && (el.childElementCount > 0 || el.textContent.trim() !== ''),
  ) as HTMLElement[];
  const first = parts[0];
  const last = parts[parts.length - 1];
  return first && last ? [first, last] : [];
}

function extractPost(post: HTMLElement): ExtractedItem | null {
  const id = /^t3_([a-z0-9]+)$/i.exec(post.id)?.[1] ?? postIdFromHref(post.getAttribute('permalink'));
  const title = clean(post.getAttribute('post-title') || slotted(post, 'title')?.textContent);
  if (!id || !title) return null; // still loading

  const item: ExtractedItem = {
    id: `reddit:${id}`,
    kind: KINDS[post.getAttribute('post-type') ?? ''] ?? 'post',
    fields: compactFields({
      title,
      subreddit: clean(post.getAttribute('subreddit-prefixed-name')),
      flair: clean(slotted(post, 'post-flair')?.textContent),
      text: clean(blockText(slotted(post, 'text-body'))),
    }),
    overlayTarget: post,
  };
  // Only the card view's layout is known. In other views (which have a thumbnail slot)
  // cover the whole post rather than risk leaving part of it showing.
  if (post.getAttribute('view-type') === 'cardView') item.overlayRows = () => contentParts(post);
  return item;
}

function extractSearchResult(unit: HTMLElement): ExtractedItem | null {
  const link = unit.querySelector<HTMLAnchorElement>('a[data-testid="post-title-text"]');
  const href = link?.getAttribute('href');
  const id = /^search-post-title-t3_([a-z0-9]+)$/i.exec(link?.id ?? '')?.[1] ?? postIdFromHref(href);
  const title = clean(link?.textContent);
  if (!id || !title) return null;

  return {
    id: `reddit:${id}`,
    kind: 'post',
    fields: compactFields({ title, subreddit: subredditFromHref(href) }),
    overlayTarget: unit,
  };
}

function luminance(color: string): number | null {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(color);
  if (!m || m[4] === '0') return null; // transparent
  const [r, g, b] = [m[1], m[2], m[3]].map(Number) as [number, number, number];
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export const redditAdapter: SiteAdapter = {
  site: 'reddit',
  itemSelector: `${POST_SELECTOR}, ${SEARCH_RESULT_SELECTOR}`,

  extract(element) {
    return element.matches(POST_SELECTOR) ? extractPost(element) : extractSearchResult(element);
  },

  isDark(document) {
    const lum =
      luminance(getComputedStyle(document.body).backgroundColor) ??
      luminance(getComputedStyle(document.documentElement).backgroundColor);
    return lum !== null && lum < 0.5;
  },
};
