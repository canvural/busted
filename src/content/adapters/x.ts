/**
 * X page structure (checked against a signed-in x.com timeline on 2026-10-30):
 * - Each post is `article[data-testid="tweet"]`.
 * - The post's own link is the `a[href*="/status/ID"]` that wraps its `<time>`. A quoted
 *   post also has a `<time>`, but not inside a status link.
 * - Text is `[data-testid="tweetText"]`. A quoted post sits in a nested `div[role="link"]`
 *   with its own tweetText.
 * - Images are `[data-testid="tweetPhoto"] img` from pbs.twimg.com. Their alt text is
 *   usually just "Image" unless the author wrote one.
 * - Link previews are `[data-testid="card.wrapper"]`; their text is the site and title.
 *
 * Layout (checked on x.com timelines and post pages on 2026-11-08), used to blur only the
 * post's content:
 * - The action bar (reply, repost, like…) is a `[role="group"]` nested inside the last
 *   row of a column. That column also holds the content rows: text, media, quoted post, card.
 * - Timeline: the avatar is in a sibling column. The content column's rows are the name
 *   header, an optional "Replying to" line, the content, then the action bar.
 * - A post page's main post has its header above the column, and a timestamp/views row
 *   between the content and the action bar.
 */
import { clean, compactFields, type ExtractedItem, type SiteAdapter } from '../adapter';

/** Images per post sent to Clef. A request holds at most 4, so this keeps batches useful. */
export const MAX_IMAGES_PER_TWEET = 2;

/**
 * Text as a reader sees it. X draws emoji as `<img alt="😭">`, so alt text is kept.
 * `separator` goes between text runs: '' for tweet text (spacing is already in the
 * text), ' ' for cards whose site and title sit in separate elements.
 */
export function readableText(root: Element | null | undefined, separator = ''): string {
  if (!root) return '';
  const parts: string[] = [];
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) parts.push(node.textContent ?? '');
    else if ((node as Element).tagName === 'IMG' && !(node as Element).closest('[data-testid="tweetPhoto"]')) {
      parts.push((node as HTMLImageElement).alt);
    }
  }
  return parts.join(separator);
}

function statusId(article: HTMLElement): string | null {
  for (const link of article.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]')) {
    if (!link.querySelector('time')) continue;
    const match = /\/status\/(\d+)/.exec(link.getAttribute('href') ?? '');
    if (match?.[1]) return match[1];
  }
  return null;
}

/** Rows that carry what the post says or shows. A quoted post is a `div[role="link"]`. */
const CONTENT = [
  '[data-testid="tweetText"]',
  '[data-testid="tweetPhoto"]',
  '[data-testid="videoPlayer"]',
  '[data-testid="card.wrapper"]',
  'div[role="link"]',
].join(', ');

const isContent = (el: Element) => el.matches(CONTENT) || el.querySelector(CONTENT) !== null;

/** The column holding the post's content and action bar, or null when the post doesn't look as expected. */
export function contentColumn(article: HTMLElement): HTMLElement | null {
  const bar = article.querySelector('[role="group"]');
  let column = article.querySelector(CONTENT)?.parentElement ?? null;
  if (!bar) return null;
  while (column && column !== article && !column.contains(bar)) column = column.parentElement;
  return column && column !== article ? column : null;
}

/** The first and last content rows in `column`. The header, timestamp and action bar stay outside. */
export function contentRows(column: Element): Element[] {
  const rows = [...column.children].filter(isContent);
  const first = rows[0];
  const last = rows[rows.length - 1];
  return first && last ? [first, last] : [];
}

function luminance(rgb: string): number | null {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb);
  if (!m) return null;
  const [r, g, b] = [m[1], m[2], m[3]].map(Number) as [number, number, number];
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export const xAdapter: SiteAdapter = {
  site: 'x',
  itemSelector: 'article[data-testid="tweet"]',

  extract(article, { includeImages }) {
    const id = statusId(article);
    if (!id) return null; // ads and placeholders have no status link

    const quoteBox = [...article.querySelectorAll<HTMLElement>('div[role="link"]')].find((el) =>
      el.querySelector('[data-testid="tweetText"]'),
    );
    const inQuote = (el: Element) => quoteBox?.contains(el) ?? false;

    const texts = [...article.querySelectorAll('[data-testid="tweetText"]')];
    const text = clean(readableText(texts.find((t) => !inQuote(t))));
    const quoted = clean(readableText(texts.find(inQuote)));
    const card = clean(readableText(article.querySelector('[data-testid="card.wrapper"]'), ' '));

    const photos = [...article.querySelectorAll<HTMLImageElement>('[data-testid="tweetPhoto"] img')];
    const alt = photos.map((img) => clean(img.alt)).filter((a) => a && a !== 'Image');
    const imageUrls = includeImages
      ? photos
          .map((img) => img.src)
          .filter((src) => src.startsWith('https://pbs.twimg.com/'))
          .slice(0, MAX_IMAGES_PER_TWEET)
      : [];

    const fields = compactFields({ text, quoted, card, alt });
    if (Object.keys(fields).length === 0 && imageUrls.length === 0) return null;

    const imageCount = photos.length;
    const column = contentColumn(article);
    const item: ExtractedItem = {
      id: `x:${id}`,
      kind: imageCount > 0 ? `post · ${imageCount} image${imageCount > 1 ? 's' : ''}` : 'post',
      fields,
      // Cover just the content so the author, date and stats stay visible. When the
      // layout isn't recognized, cover the whole post rather than risk showing a spoiler.
      overlayTarget: column ?? article,
    };
    if (column) item.overlayRows = () => contentRows(column);
    if (imageUrls.length > 0) item.imageUrls = imageUrls;
    return item;
  },

  isDark(document) {
    const lum = luminance(getComputedStyle(document.body).backgroundColor);
    return lum !== null && lum < 0.5;
  },
};
