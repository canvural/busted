<h1 align="center"><img src="docs/logo.png" alt="Busted!" width="300"></h1>

A browser extension that hides GTA VI spoilers on YouTube, X and Reddit behind a blurred
"BUSTED!" stamp. Click the stamp to see what's underneath.

It asks [Cloudflare Clef](https://developers.cloudflare.com/workers-ai/models/clef/),
an AI model that answers yes/no questions, whether each video or post spoils the
game. Clef runs on **your own** Cloudflare account, which is free for normal use.
You can use [TypeSafe's Jev](https://docs.typesafe.ai/introduction) instead, on your
own TypeSafe account. There's no Busted! server and no tracking.

Works on the latest desktop Chrome, Chromium, Edge and Firefox (142+).

## Quick start

[Install the extension](#install), then connect it in one of three ways:

- **Just you:** paste a free Cloudflare API token and your account ID into Busted!'s
  settings. [Two-minute setup](#set-up).
- **You and your friends:** deploy the Busted! proxy to your Cloudflare account in
  one click. Friends don't need a Cloudflare account, just the proxy's URL and a
  secret you choose. [Details](#share-your-quota-with-friends-optional).

  [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/canvural/busted/tree/main/worker)

- **TypeSafe instead of Cloudflare:** paste a TypeSafe API key into Busted!'s
  settings. Pay per use, no free allowance. [Details](#use-typesafes-jev-instead).

## What it does

- **YouTube:** home feed, search results, the "up next" list, Shorts, channel pages,
  and the title of the video you're watching.
- **X:** posts, quoted posts, link previews and images. Replies on a post's page are
  judged with that post as context.
- **Reddit:** posts in feeds and search results on `www.reddit.com`. Text only:
  title, subreddit, flair and the text preview. Comments aren't covered.
- Only posts and videos that mention a GTA VI keyword (game name, characters,
  places) are checked, so normal browsing costs nothing. You can edit the list.
- Items are checked just before you scroll to them. Anything you scroll past
  quickly is skipped.
- Verdicts are saved on your device for 30 days, so nothing is checked twice.

On our 150-example test set, the default `clef` model judged 99% correctly and Jev
98% ([details](eval/README.md)).

## Install

- **Chrome / Chromium / Edge:** [Chrome Web Store](https://chromewebstore.google.com/detail/busted-%E2%80%94-spoiler-blocker/eggbgmgafnkeckpopfcmnnopcjgnbnfb)
- **Firefox:** [Firefox Add-ons](https://addons.mozilla.org/addon/busted-spoiler-blocker-gta-vi/)

## Install from source

Requires Node.js 22.18+.

```sh
npm install
npm run build          # Chrome/Chromium/Edge → .output/chrome-mv3
npm run build:firefox  # Firefox → .output/firefox-mv3
```

- **Chrome / Chromium / Edge:** open `chrome://extensions`, turn on Developer mode,
  click **Load unpacked**, and pick `.output/chrome-mv3`.
- **Firefox:** open `about:debugging#/runtime/this-firefox`, click
  **Load Temporary Add-on**, and pick `.output/firefox-mv3/manifest.json`.

## Set up

Settings open when you install. You need a Cloudflare account (free) and two things
from it:

1. **An API token.** In the dashboard, go to
   [My Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens), choose
   **Create Token**, and use the **Workers AI** template. A custom token with only the
   **Workers AI Read** permission also works and is the safest choice.
2. **Your account ID.** It's the 32-character code in the dashboard address:
   `dash.cloudflare.com/<account ID>`.

Paste both into Busted!'s settings and click **Test connection**.

### Cost

Cloudflare gives every account 10,000 Workers AI "neurons" a day for free, reset at
00:00 UTC. That covers about 2,500 checks a day with `clef`, or 16,000 with
`clef-flash`. Busted!'s popup shows today's usage as a wanted level: five stars
means the free allowance is used up. Past that, requests fail until the reset
unless you're on the Workers Paid plan.

## Use TypeSafe's Jev instead

[Jev](https://docs.typesafe.ai/introduction) is TypeSafe's yes/no decision model.
Busted! sends it the same questions it sends Clef.

1. Create an API key in the [TypeSafe console](https://console.typesafe.ai/keys).
2. In Busted!'s settings, choose **TypeSafe Jev**, paste the key and click
   **Test connection**.

TypeSafe charges per input token ($0.042 per million). Busted! uses about 140–170
tokens per check, so a dollar covers roughly 150,000 checks. There's no free
allowance, so the popup's wanted level isn't shown in this mode.

Jev checks text only. It rejects images smaller than 280 pixels on a side, which
includes YouTube thumbnails, so thumbnails and X images aren't sent.

## Share your quota with friends (optional)

If you'd rather not have friends create Cloudflare accounts, deploy the small proxy
in [`worker/`](worker/) to your account. It holds your Workers AI access and only
answers requests that carry a shared secret you choose. Friends then pick
**Self-hosted endpoint** in Busted!'s settings and paste the Worker's URL and the
secret. All usage is billed to your account.

### One click

Use the **Deploy to Cloudflare** button under [Quick start](#quick-start). It copies
the `worker/` folder into a new repository on your GitHub or GitLab account and
deploys it. When asked for `SHARED_SECRET`, enter a long random string. If the setup
screen doesn't ask, set it afterwards (see step 4 below).

### By hand

1. `cd worker && npm install`
2. `npx wrangler login`
3. `npx wrangler deploy`. Note the `https://busted-proxy.<you>.workers.dev` URL it
   prints.
4. `npx wrangler secret put SHARED_SECRET` and enter a long random string, for
   example from `openssl rand -base64 24`.

Give the URL and the secret only to people you trust with your quota. To cut
someone off, change the secret.

## Development

```sh
npm run dev            # Chrome with hot reload (needs Chrome or Chromium on PATH)
npm run dev:firefox
npm run check          # type check, lint, tests, Firefox add-on lint
npm run zip            # store packages in .output/
npm run zip:firefox
```

- To skip typing credentials while testing, build a development version with them
  pre-filled. Never share a build made this way:
  `WXT_DEV_CLOUDFLARE_ACCOUNT_ID=… WXT_DEV_CLOUDFLARE_API_TOKEN=… npx wxt build --mode development`
  (output in `.output/chrome-mv3-dev`; add `-b firefox` for Firefox). For Jev, set
  `WXT_DEV_JEV_API_KEY=…` instead; the build starts in TypeSafe mode. Production
  builds never read these variables.
- `src/topic.ts` holds everything GTA VI-specific: the spoiler definition, a
  who's-who glossary for Clef, and default keywords. Fork and edit this one file to
  block spoilers for something else.
- `src/content/adapters/` knows each site's page structure. When YouTube, X or
  Reddit change their pages, fixes go here.
- `eval/` has the labeled test set and a script that scores Clef against it:
  `node --env-file=.env eval/run.ts` with `CLOUDFLARE_ACCOUNT_ID` and
  `CLOUDFLARE_API_TOKEN` in a local `.env`. Add `--model jev` and `JEV_TOKEN` to
  score Jev.
- [docs/DESIGN.md](docs/DESIGN.md) explains how it all fits together.

## Privacy

See [PRIVACY.md](PRIVACY.md). In short: the text (and YouTube thumbnails or X
images; Reddit is text only) of keyword-matching posts and videos is sent to the Cloudflare account you
configure, or only the text to TypeSafe if you choose Jev, and nowhere else.
Nothing is collected by the authors.

## License

[MIT](LICENSE). Not affiliated with Rockstar Games or Take-Two Interactive.
