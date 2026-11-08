/**
 * YouTube page structure (checked against live youtube.com on 2026-10-30):
 * - Search results: `ytd-video-renderer` (title in `a#video-title`, channel in `ytd-channel-name`,
 *   description snippet in `.metadata-snippet-text`, chapter names in
 *   `ytd-macro-markers-list-item-renderer h3[title]`).
 * - Sidebar, and the newer home feed: `yt-lockup-view-model` (title in `h3[title]`).
 * - Home feed wrapper when signed in: `ytd-rich-item-renderer`.
 * - Shorts: `ytm-shorts-lockup-view-model(-v2)`, linking to `/shorts/ID`.
 * - Watch page title: `ytd-watch-metadata[video-id] #title`.
 * Older renderers are kept as fallbacks; YouTube still serves them to some users.
 */
import { clean, compactFields, type ExtractedItem, type SiteAdapter } from '../adapter';

const TILE_SELECTORS = [
  'ytd-rich-item-renderer',
  'ytd-video-renderer',
  'ytd-compact-video-renderer',
  'ytd-grid-video-renderer',
  'ytd-playlist-video-renderer',
  'ytd-reel-item-renderer',
  'yt-lockup-view-model',
  'ytm-shorts-lockup-view-model-v2',
  'ytm-shorts-lockup-view-model',
];
const WATCH_TITLE_SELECTOR = 'ytd-watch-metadata #title';

const VIDEO_ID = /^[\w-]{11}$/;

export function videoIdFromHref(href: string | null): { id: string; short: boolean } | null {
  if (!href) return null;
  try {
    const url = new URL(href, 'https://www.youtube.com');
    const shorts = /^\/shorts\/([\w-]{11})/.exec(url.pathname);
    if (shorts?.[1]) return { id: shorts[1], short: true };
    const v = url.pathname === '/watch' ? url.searchParams.get('v') : null;
    return v && VIDEO_ID.test(v) ? { id: v, short: false } : null;
  } catch {
    return null;
  }
}

function thumbnailUrl(videoId: string): string {
  // 320×180: small enough to send to Clef without resizing.
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

function extractWatchTitle(element: HTMLElement): ExtractedItem | null {
  const metadata = element.closest('ytd-watch-metadata');
  const videoId = metadata?.getAttribute('video-id');
  const title = clean(element.querySelector('h1')?.textContent ?? element.textContent);
  if (!metadata || !videoId || !VIDEO_ID.test(videoId) || !title) return null;
  const channel = clean(metadata.querySelector('ytd-channel-name #text')?.textContent);
  // The player is out of scope; only the title is covered, and no thumbnail is sent.
  return { id: `yt:${videoId}`, kind: 'title', fields: compactFields({ title, channel }), overlayTarget: element };
}

export const youtubeAdapter: SiteAdapter = {
  site: 'youtube',
  itemSelector: [...TILE_SELECTORS, WATCH_TITLE_SELECTOR].join(','),

  extract(element, { includeImages }) {
    if (element.matches(WATCH_TITLE_SELECTOR)) return extractWatchTitle(element);

    const link = element.querySelector<HTMLAnchorElement>('a[href*="/watch?v="], a[href^="/shorts/"]');
    const video = videoIdFromHref(link?.getAttribute('href') ?? null);
    if (!video) return null; // ads, mixes and playlists

    const titleLink = element.querySelector('#video-title');
    const title = clean(
      titleLink?.getAttribute('title') ||
        titleLink?.textContent ||
        element.querySelector('h3[title]')?.getAttribute('title') ||
        element.querySelector('h3')?.textContent ||
        element.querySelector('a[title]')?.getAttribute('title'),
    );
    if (!title) return null; // tile still rendering; picked up on the next scan

    const channel = clean(
      element.querySelector('ytd-channel-name #text')?.textContent ??
        element.querySelector('.ytContentMetadataViewModelMetadataText')?.textContent,
    );

    // Search results also show a description snippet and chapter names: free extra context.
    const description = clean(element.querySelector('.metadata-snippet-text')?.textContent);
    const chapterNames = [
      ...new Set(
        [...element.querySelectorAll('ytd-macro-markers-list-item-renderer #details h3[title]')].map((h) =>
          clean(h.getAttribute('title')),
        ),
      ),
    ].filter(Boolean);
    const chapters = clean(chapterNames.join(' | '));

    return {
      id: `yt:${video.id}`,
      kind: video.short ? 'short' : 'video',
      fields: compactFields({ title, channel, description, chapters }),
      ...(includeImages && { imageUrls: [thumbnailUrl(video.id)] }),
      overlayTarget: element,
    };
  },

  isDark(document) {
    return document.documentElement.hasAttribute('dark');
  },
};
