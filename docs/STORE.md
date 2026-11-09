# Store listing

Copy for the Chrome Web Store and Firefox Add-ons (AMO). Upload
`.output/busted-<version>-chrome.zip` and `.output/busted-<version>-firefox.zip`
(AMO also wants `.output/busted-<version>-sources.zip`).

## Name

Busted! — Spoiler Blocker for GTA VI

## Short description (≤132 characters)

Hides GTA VI spoilers on YouTube and X behind a click-to-reveal "BUSTED!" stamp. Runs on your own Cloudflare or TypeSafe account.

## Description

Busted! covers GTA VI spoilers on YouTube and X before you see them. Spoilers get
a heavy blur and a "BUSTED!" stamp; click it when you're ready to look.

How it works:
• Videos and posts that mention GTA VI, its characters or places are checked by
  Cloudflare's Clef AI model on your own Cloudflare account.
• Story twists, endings, character deaths, mission details and leaks are hidden.
  Trailers, release news, reviews without spoilers and memes stay visible.
• Items are checked just before you scroll to them, and each video or post is only
  checked once.

Works on YouTube (home, search, up next, Shorts, video titles) and X (posts, quoted
posts, link previews, images).

You need a free Cloudflare account and an API token with the Workers AI Read
permission. Setup takes about two minutes and the settings page walks you through
it. The free Workers AI allowance covers about 2,500 checks a day. You can use
TypeSafe's Jev model with your own TypeSafe API key instead (pay per use).

Privacy: no tracking, no analytics, no Busted! servers. Only the text and images of
GTA-related posts and videos are sent, to your own Cloudflare account (or only the
text, to your own TypeSafe account).

Open source (MIT). Not affiliated with Rockstar Games or Take-Two Interactive.

## Category

Chrome: Productivity (or Social & Communication). AMO: Social & Communication.

## Single purpose (Chrome)

Hide GTA VI spoilers on YouTube and X behind a click-to-reveal overlay.

## Permission justifications (Chrome)

- **storage:** saves the user's settings, cached spoiler verdicts and daily usage
  counts.
- **Host access to www.youtube.com and x.com:** finds videos and posts on these
  sites and covers the ones that are spoilers.
- **Host access to api.cloudflare.com:** sends GTA-related text and images to the
  user's own Cloudflare Workers AI account to judge whether they are spoilers.
- **Host access to api.typesafe.ai:** sends GTA-related text to the user's own
  TypeSafe account, if they choose TypeSafe's Jev model instead of Cloudflare.
- **Host access to i.ytimg.com and pbs.twimg.com:** downloads video thumbnails and
  post images so they can be judged along with the text.
- **Optional host access (https://*/*):** requested only for the self-hosted proxy
  URL the user enters, if they choose that option.
- **Remote code:** none. All code ships in the package.

## Data usage disclosures (Chrome)

- Collects **website content** (text and images of keyword-matching posts and
  videos), sent only to the Cloudflare endpoint or TypeSafe account the user
  configures, to provide the extension's single purpose.
- Stores **authentication information** (the user's Cloudflare API token or
  TypeSafe API key) locally in browser storage; each is sent only to its own
  service.
- Not sold, not used for anything else, not used for creditworthiness or lending.

## Firefox

- `data_collection_permissions` declares `websiteContent` (already in the manifest).
- Reviewers will see one linter warning: Svelte's runtime assigns `innerHTML` for
  static templates in the popup and settings pages. No page content is ever
  inserted as HTML.
- Firefox 142+ (desktop). Mark Android as unsupported in the listing.

## Images

In `docs/store/`, sized for both stores (1280×800, PNG without transparency):

1. `1-youtube.png`: a YouTube home feed with four videos covered.
2. `2-x.png`: an X timeline with two covered posts between normal ones.
3. `3-popup.png`: the popup over YouTube, showing today's count and the quota.
4. `4-settings.png`: the settings page.

Also `promo-small-440x280.png`, the Chrome Web Store small promo tile.

The YouTube and X pages are staged: made-up videos, posts and accounts, plain
placeholder thumbnails, and no site logos or game artwork. The extension running on
them is the real one, and the covers are Clef's actual verdicts. The settings page
shows placeholder credentials, and its "Token is active." line is a canned reply. The
popup shot darkens the page behind the popup.

## Privacy policy URL

Link to `PRIVACY.md` in the public repository.
