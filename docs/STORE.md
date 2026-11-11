# Store listing

Copy for the Chrome Web Store and Firefox Add-ons (AMO). Upload
`.output/busted-<version>-chrome.zip` and `.output/busted-<version>-firefox.zip`
(AMO also wants `.output/busted-<version>-sources.zip`).

## Name

Busted! — Spoiler Blocker for GTA VI

## Short description (≤132 characters)

Chrome shows the manifest `description` (set in `wxt.config.ts`) and has no
separate field. Paste the same text into AMO's Summary.

Hides GTA VI spoilers on YouTube, X and Reddit behind a click-to-reveal "BUSTED!" stamp. Uses your Cloudflare or TypeSafe account.

## Description

Busted! covers GTA VI spoilers on YouTube, X and Reddit before you see them. Spoilers get
a heavy blur and a "BUSTED!" stamp; click it when you're ready to look.

How it works:
• Videos and posts that mention GTA VI, its characters or places are checked by
  Cloudflare's Clef AI model on your own Cloudflare account.
• Story twists, endings, character deaths, mission details and leaks are hidden.
  Trailers, release news, reviews without spoilers and memes stay visible.
• Items are checked just before you scroll to them, and each video or post is only
  checked once.

Works on YouTube (home, search, up next, Shorts, video titles), X (posts, quoted
posts, link previews, images) and Reddit (posts in feeds and search results).

You need a free Cloudflare account and an API token with the Workers AI Read
permission. Setup takes about two minutes and the settings page walks you through
it. The free Workers AI allowance covers about 2,500 checks a day. You can use
TypeSafe's Jev model with your own TypeSafe API key instead (pay per use).

Privacy: no tracking, no analytics, no Busted! servers. Only the text and images of
GTA-related posts and videos are sent, to your own Cloudflare account (or only the
text, to your own TypeSafe account).

Open source (MIT). Not affiliated with Rockstar Games or Take-Two Interactive.

## Category

Chrome: pick the closest one the dashboard offers (social or entertainment). AMO:
Social & Communication.

## Single purpose (Chrome)

Hide GTA VI spoilers on YouTube, X and Reddit behind a click-to-reveal overlay.

## Permission justifications (Chrome)

- **storage:** saves the user's settings, cached spoiler verdicts and daily usage
  counts.
- **Host access to www.youtube.com, x.com and www.reddit.com:** finds videos and
  posts on these sites and covers the ones that are spoilers.
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
- Firefox 142+ (desktop). Untick Firefox for Android when uploading. The publish
  workflow keeps it that way with `FIREFOX_COMPATIBILITY=firefox`.
- Upload `busted-<version>-sources.zip` when AMO asks for source code, and paste
  this into "Notes to reviewer":

  > Built with WXT and Vite. To reproduce the package: install Node.js 24
  > (22.18+ works), then run `npm ci` and `npm run zip:firefox` in the source
  > folder. The result is `.output/busted-<version>-firefox.zip`. The extension
  > needs the user's own Cloudflare account (free) or TypeSafe API key to
  > classify anything; without one it shows a setup prompt and covers nothing.

## Images

In `docs/store/`, sized for both stores (1280×800, PNG without transparency):

1. `1-youtube.png`: a YouTube home feed with four videos covered.
2. `2-x.png`: an X timeline with two covered posts between normal ones.
3. `3-popup.png`: the popup over YouTube, showing today's count and the quota.
4. `4-settings.png`: the settings page.

Also `promo-small-440x280.png`, the Chrome Web Store small promo tile, and
`icon-128.png`, the Chrome Web Store icon: the extension icon at 96×96 with 16px
of transparent padding, as Chrome's image guidelines ask.

The YouTube and X pages are staged: made-up videos, posts and accounts, plain
placeholder thumbnails, and no site logos or game artwork. The extension running on
them is the real one, and the covers are Clef's actual verdicts. The settings page
shows placeholder credentials, and its "Token is active." line is a canned reply. The
popup shot darkens the page behind the popup.

## Privacy policy URL

https://github.com/canvural/busted/blob/main/PRIVACY.md (the repository must be
public).

## Releasing updates

Adding a site adds a host permission (`www.reddit.com` came after 0.1.0). Chrome
can disable the extension on that update until the user accepts the new permission,
and the Chrome dashboard asks for the updated permission justification above. In
Firefox, site access is optional: existing users see "Allow access to YouTube, X
and Reddit" on the settings page and Reddit stays uncovered until they click it.
Neither behaviour has been watched on a real update yet.

The first version goes up by hand on both stores; the APIs can't create a
listing. After that, every `v*` tag builds the zips, attaches them to a GitHub
Release and, once set up, submits them to both stores (the `publish` job in
`.github/workflows/ci.yml`).

To release: bump `version` in `package.json`, commit, then
`git tag v<version> && git push origin main v<version>`. The workflow fails if the
tag and `package.json` disagree. Neither store accepts the same version twice.

One-time setup, after both listings are live:

1. **Chrome.** In Google Cloud, create a project, enable the Chrome Web Store
   API, create a service account and download a JSON key for it. In the Chrome
   Web Store developer dashboard, add the service account's email under
   Account. Note your publisher ID (Account page) and the extension's item ID.
   Only Chrome Web Store API v2 is used; v1.1 (client ID, client secret,
   refresh token) was shut down in October 2026.
2. **Firefox.** On addons.mozilla.org, open Tools → Manage API Keys and generate
   a JWT issuer and secret.
3. **GitHub.** In the repository settings, create an environment named `stores`
   (optionally with yourself as a required reviewer, so each release waits for
   a click) and add these environment secrets:
   - `CHROME_PUBLISHER_ID`
   - `CHROME_EXTENSION_ID`
   - `CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL` (`client_email` from the JSON key)
   - `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY` (`private_key` from the JSON key)
   - `FIREFOX_JWT_ISSUER`
   - `FIREFOX_JWT_SECRET`
4. Add the repository variable `PUBLISH_TO_STORES` = `true` (Settings → Secrets
   and variables → Actions → Variables).

To test the credentials first, put the same values in a git-ignored
`.env.submit` (plus `CHROME_API_VERSION=v2` and
`FIREFOX_EXTENSION_ID=busted-gta6-spoilers@extension`) and run
`npx wxt submit --dry-run --chrome-zip .output/*-chrome.zip --firefox-zip .output/*-firefox.zip --firefox-sources-zip .output/*-sources.zip`.

If you change the listing's visibility or distribution settings in the Chrome
dashboard by hand, publish once by hand before the API can publish again.
