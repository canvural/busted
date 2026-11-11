# Privacy policy

Last updated: 2026-11-11

Busted! is a browser extension that hides GTA VI spoilers on YouTube, X and Reddit. This
policy explains what data it handles.

## What leaves your browser

When a YouTube video, X post or Reddit post mentions one of your keywords (or every item, if you
turn on strict mode), Busted! sends this to the Cloudflare endpoint or TypeSafe
account **you** configure, so an AI model (Clef or Jev) can judge whether it's a
spoiler:

- On YouTube: the video's title, channel name, description snippet and chapter
  names shown on the page, and its thumbnail image.
- On X: the post's text, quoted post text, link preview text, image descriptions,
  and up to two of its images (images can be turned off).
- On Reddit: the post's title, subreddit name, flair and the text preview shown on
  the page. No images.

That endpoint is either your own Cloudflare account (Workers AI) or a proxy someone
you trust deployed on theirs. Cloudflare's handling of that data is covered by
[Cloudflare's privacy policy](https://www.cloudflare.com/privacypolicy/).

If you choose TypeSafe's Jev instead, only the text is sent (no images), to
TypeSafe's API with your own API key. TypeSafe's handling of that data is covered
by its [legal documents and privacy policy](https://docs.typesafe.ai/legal).

Nothing else leaves your browser. Busted! has no servers, no analytics, no
telemetry and no ads. The authors never receive any data.

## What stays on your device

- Your settings, including your Cloudflare account ID and API token or your
  TypeSafe API key, are stored in the browser's extension storage. If you use
  browser sync, the browser syncs them across your devices.
- Verdicts (a post or video ID and a spoiler score) are cached for up to 30 days.
  You can clear them in settings.
- Today's usage counts, shown in the popup.

## Permissions

- **youtube.com, x.com, reddit.com:** to find and cover spoilers on those sites.
- **api.cloudflare.com:** to ask Clef.
- **api.typesafe.ai:** to ask Jev, if you choose it.
- **i.ytimg.com, pbs.twimg.com:** to download thumbnails and post images for Clef.
- **storage:** to keep your settings and cached verdicts.
- **Other sites (optional):** only requested for the self-hosted endpoint you enter.

## Contact

Open an issue on the project's GitHub repository.
