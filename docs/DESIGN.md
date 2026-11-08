# Busted! — Design

A browser extension that hides GTA VI spoilers on YouTube and X behind a blurred,
click-to-reveal overlay. It uses Cloudflare's Clef decision model to judge content.

Status: v0.1.0 built and tested on live YouTube and X in Chromium; store packages
in `.output/`. Last updated 2026-10-30.

## Goals

- Open source from day one: MIT, nothing tied to one person's setup, no telemetry.
- Desktop Chrome and Firefox (142+, needed for Firefox's data-collection
  declaration), latest versions, Manifest V3.
- Fast: decide before content scrolls into view, ignore what you scroll past.
- Light on memory: flat memory use however long you scroll.

## Non-goals (v1)

- Mobile browsers and mobile site layouts (m.youtube.com, mobile X).
- YouTube comments, community posts, and the video player itself.
- A "this wasn't a spoiler" feedback flow.
- Topics other than GTA VI in the UI (forks can retarget via one config file).
- Remote selector or config updates. Fixes ship as store updates.

## Name and branding

- Name: **Busted!** (store listing: "Busted! — Spoiler Blocker for GTA VI").
- GTA VI is mentioned only descriptively. No Rockstar artwork, logos or fonts.
- Original icon.

## Architecture

```
content script (per site)            background (service worker / event page)
┌───────────────────────────┐        ┌────────────────────────────────────────┐
│ site adapter (youtube/x)  │        │ queue + batcher (100 ms, ≤3 in flight)  │
│  - find items + IDs       │ items  │ cache (memory LRU + IndexedDB)          │
│  - extract text/img URLs  │ ─────► │ image fetch + downscale (≤384 px)       │
│ keyword pre-filter        │        │ Clef client (direct REST, proxy or Jev) │
│ IntersectionObserver zone │ ◄───── │ stats + error state → toolbar badge     │
│ overlay (Shadow DOM)      │verdicts│                                        │
└───────────────────────────┘        └────────────────────────────────────────┘
```

- Only the background calls Clef (or Jev). Content scripts read settings
  (including the token, in the extension's isolated world, never exposed to the
  page) but send items to the background instead of calling Clef themselves.
- Calls to `api.cloudflare.com` and `api.typesafe.ai` go from the background
  script, which, with host permissions, is not subject to the page's cross-origin
  rules.

## Sites

Each site has one adapter file that knows its DOM. Adapters are tested against saved
HTML snapshots, not live sites.

**YouTube** — home feed, search results, watch-page "up next", Shorts tiles,
channel grids, and the current video's title on the watch page.
Inputs: title, channel name, and on search results the description snippet and
chapter names; thumbnail (small `mqdefault` size, 320×180, ~60 tokens).
Key: video ID. Selectors and their sources are documented in
`src/content/adapters/youtube.ts`.

**X** (x.com) — post text, quoted post text, link card text, real image alt text
(X's generic "Image" is dropped), emoji (X draws them as `<img alt>`), and up to
2 images per post (a request holds 4, so this keeps batches useful). Key: post ID,
from the status link wrapping the post's `<time>`. See `src/content/adapters/x.ts`.

Both sites recycle DOM nodes. All state (verdicts, reveals) is keyed by item ID,
never by element.

## Decision pipeline

1. **Detect**: a MutationObserver finds new items; each gets an ID.
2. **Zone**: an IntersectionObserver watches from ~1.5 viewports below to ~0.5
   above. Only items in the zone continue.
3. **Pre-filter**: case-insensitive keyword match on the item's text. No match →
   the item is never sent anywhere. **Strict mode** (off by default) skips the
   pre-filter and sends everything.
4. **Cache lookup**: memory, then IndexedDB.
5. **Queue + batch**: collect for ~100 ms. Up to 4 image items or 16 text-only
   items per request (Clef accepts at most 4 images per request). At most 3
   requests in flight. Items that leave the zone before sending are dropped.
6. **Clef**: one question per item in a single request (see below).
7. **Apply**: probability ≥ sensitivity threshold → overlay.

While an item is being checked, nothing changes on the page (no "checking" state).
Because of the look-ahead zone, most verdicts arrive before the item is visible.

### Default keywords

English only, matched case-insensitively on whole words. "Whole word" means no Latin
letter or digit right next to it, so `Cal` doesn't match "California" but `GTA6`
still matches "GTA6の発売日" (Japanese has no spaces). Users edit the list in settings.

- Game names: `GTA 6`, `GTA VI`, `GTA6`, `Grand Theft Auto VI`, `Grand Theft Auto 6`.
- Places: `Vice City`, `Leonida`, `Port Gellhorn`, `Ambrosia`, `Grassrivers`,
  `Mount Kalaga`.
- Characters: `Lucia`, `Jason`, `Cal Hampton`, `Boobie`, `Dre'Quan`, `Real Dimez`,
  `Raul`, `Brian Heder`.

Character and place names are included even though they also match unrelated posts
("Lucia from accounting"). After launch, people discuss the story by naming
characters and stop writing "GTA 6": in the eval set, 12 of 60 spoilers mention
no game name, and every one of them names a character or place. Unrelated matches
cost a cheap Clef call that should answer "no".

## Clef

- Models: `@cf/cloudflare/clef` (default) and `@cf/cloudflare/clef-flash`
  (selectable). The original plan defaulted to `clef-flash`; the eval run changed
  that: `clef` scored 99% vs 91% at the same token count (see `eval/README.md`).
- REST: `POST https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{model}`
  with `Authorization: Bearer <token>`.
- Request: `model` (`"clef"` or `"clef-flash"`, required in the body too), `state` (the items as JSON), `images` (embedded PNG/JPEG/WebP; remote
  URLs not accepted; max 4, 4 MiB each), and `questions` (up to 64). Each item is
  one `noul` (yes/no) question with id `item_<n>`; the answer is P(spoiler).
- Images are downscaled to ≤384 px on the long side in the background (~150 tokens
  each; each 32×32 block is one token), then discarded after the request.
- Rate limit ~300 requests/min. Free tier is 10,000 neurons/day per account, reset
  00:00 UTC.

### Spoiler definition

One built-in definition, no levels. Spoilers: story, missions, endings, character
fates, late-game content, leaked or datamined footage. Not spoilers: trailers,
official marketing, release news, reviews without spoilers.

Clef has no knowledge of the real story, so it judges whether content *claims to
reveal* plot. That's also what makes it useful before launch, when leaks and rumors
spread.

Clef may also not know who Lucia or Cal Hampton are. So every request includes a
short **glossary** in `state.context`, next to the spoiler definition: the protagonists, main supporting
characters and places, each with a few words on what they are ("Lucia Caminos — GTA
VI protagonist"). Then "Lucia's FATE Will Shock You" can be judged without Clef
already knowing the game. Both go in once per request, shared by every
item in it; each item's question just points at them (`src/lib/clef.ts`). The eval set measures whether it works (e.g. yt-001).

The topic name, definition, glossary and default keywords live in one config file
(`src/topic.ts`) so forks can retarget the extension. The prompt carries a version
tag that is part of the cache key.

### Jev (TypeSafe) as an alternative

TypeSafe's Jev is a decision model with the same request shape as Clef: `state`,
and `questions` keyed by id with `noul` answers. `src/lib/jev.ts` reuses the request
`buildClefRequest` makes, with `model` set to `jev-1.14.0`, and `src/lib/classify.ts`
sends it to `POST https://api.typesafe.ai/v1/systemone` with
`Authorization: Bearer <key>`.

- The response has `answers` and `usage` at the top level, with no Cloudflare
  envelope. Errors are `{ detail: … }`; 401 is a bad key, 429 rate limiting, 529
  overload.
- Pinned to a version rather than the `jev-latest` alias, which moves with each
  release and would shift scores away from the eval results. The model id is part
  of the verdict cache key, so Clef and Jev verdicts never mix.
- **Text only.** Jev's image support is an opt-in preview (`TypeSafe-Danger-Zone-Images`
  header, images as `assets`), and it rejects images under 280 px on a side. Every
  YouTube `mqdefault` thumbnail (320×180) fails that, and one rejected image fails
  the whole request (confirmed 2026-11-08: `400 Invalid image dimensions`). So in
  Jev mode the background doesn't download images at all. Sending them would mean
  upscaling to a 280 px short side, which costs more tokens.
- No free allowance: billed per input token ($0.042 per million). The popup shows
  checks and spoilers but no wanted level.
- Eval (2026-11-08): 98% at 0.5, 99% at 0.6, 20,970 tokens for 150 items, 2.2 s
  (see `eval/README.md`). The default sensitivity stays 0.5 for both models.
- The proxy worker stays Clef-only.

### Sensitivity

A slider maps to the probability threshold. Default ~0.5, tuned with the eval set.

## Auth and backend

Three modes, picked in settings:

1. **Your own Cloudflare account (default)**: account ID + API token with Workers AI
   access. Settings has a "Create token" button that opens Cloudflare's dashboard
   with the permissions pre-filled (`dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=…&name=Busted`).
   The Workers AI key for that link is unconfirmed, and Cloudflare silently drops
   unknown keys. Until it's verified, the button opens the token page and the guide
   says to pick the built-in "Workers AI" token template.
2. **Custom endpoint**: URL + shared secret, for a self-hosted proxy worker.
   The manifest declares `optional_host_permissions` (`https://*/*`); saving an
   endpoint calls `permissions.request` for that origin, otherwise background
   fetches to it would fail.
3. **TypeSafe Jev**: a TypeSafe API key, stored like the Cloudflare token. No live
   key check; "Test connection" covers it. `api.typesafe.ai` is in
   `host_permissions`.

Token handling follows Refined GitHub:

- Stored in `storage.sync` with the other settings, so it is set up once per browser
  profile.
- Plain monospace text field, autocomplete and spellcheck off.
- Validated as you type (Cloudflare token verify endpoint), showing e.g.
  "✓ Active · Workers AI access OK" or the exact problem.

### Self-host proxy worker (`worker/`)

- A thin pass-through: accepts the same Clef request body, checks the model is
  `clef` or `clef-flash`, calls `env.AI.run`, returns the result. All logic stays in
  the extension so both modes behave the same.
- Requires `Authorization: Bearer <SHARED_SECRET>`.
- Standalone folder with its own `package.json`. No workspaces.
- README has a **Deploy to Cloudflare** button:
  `https://deploy.workers.cloudflare.com/?url=https://github.com/<owner>/<repo>/tree/main/worker`.
  It clones into the deployer's GitHub account and deploys. The subdirectory must
  be self-contained (its own dependencies), which is why `worker/` stands alone.
  The secret is declared in `worker/.dev.vars.example`; whether the deploy flow
  prompts for it is unconfirmed, so the README also covers setting it with
  `wrangler secret put`. A manual step-by-step guide sits next to the button.

## Failure handling

No key, network error, quota exhausted, rate limited, token rejected: the page is
left untouched. The toolbar icon shows a red "!" badge, and the popup explains the
problem, e.g. "Daily free quota used, resets 00:00 UTC". Retries use increasing
delays. Failures are never cached.

## Overlay

Chosen style: **"BUSTED!" stamp** (variant B of the overlay prototype, kept on the
`prototype/overlay` branch at `prototypes/overlay/index.html`).

- Plain TypeScript + CSS inside a closed Shadow DOM, mounted as a `<busted-overlay>`
  element. No framework on the sites.
- Covers the whole YouTube tile. On X it covers only the post's content (text, media,
  quoted post, card): the author, date, "Replying to" line, a post page's timestamp row
  and the action bar stay visible, so the timeline keeps its shape. The overlay spans
  from the first to the last content row of the post's column and re-measures when the
  column resizes (images loading, X re-rendering). If the layout isn't recognized, it
  covers the whole post. Heavy blur (`backdrop-filter: blur(36px)`) with a dark radial
  vignette, so the site's own elements are never restyled.
- Centered red "BUSTED!" rubber stamp, tilted −8°, with a short pop-in animation
  (skipped under `prefers-reduced-motion`). Original styling, no GTA font.
- Below it, a label on a dark pill backing: "GTA VI spoiler · <media type> · press to
  reveal". The backing keeps it readable on light thumbnails.
- Sizing follows the item via container queries:
  - The stamp scales with the item and reserves space below it (`margin-bottom:
    .55em`) so its tilted corner never touches the label.
  - Items under ~72 px tall hide the label; under ~48 px (e.g. the watch-page title)
    the stamp shrinks to a compact 15 px version, and under ~32 px (one line of post
    text) to 12 px.
  - Inner padding keeps the label off the edges on narrow Shorts tiles.
- Follows the site's light/dark theme.
- Click, Enter or Space reveals (the surface is a focusable `<button>` with a proper
  label). Fade ~150 ms.
- Clicks are blocked while the overlay is up (`preventDefault` + `stopPropagation`
  on click, pointer and hover events) so they don't open the video or post or start
  a hover preview. Verified on live YouTube and X: a real click reveals and the page
  doesn't navigate. On X, the uncovered header and action bar still work as usual.
- A reveal is remembered per item ID for as long as the tab is open (in memory).
  Sharing reveals across tabs for the whole browser session is a possible later
  improvement. A small "hide again" button stays in the top-right corner.
- One item can have several overlays. Reveal and hide update every overlay with that
  item ID, not just the one clicked.

## Caching and memory

- Key: `item ID + model + prompt version`.
- In-memory LRU of a few hundred entries.
- IndexedDB capped at ~20K entries, oldest evicted first, 30-day expiry.
- "Clear cache" button in settings.
- Image bytes are never kept after a request. Off-zone items hold no pending work.

## UI

Svelte 5 + plain CSS (custom properties). Slick, modern, follows the system theme.
These pages load only when opened, never on YouTube or X.

**Popup**: master on/off, toggle for the current site, today's stats (items checked,
items blurred, estimated neurons vs. the free 10K), last error.

**Settings**: auth mode, account ID, token (with live validation and a "Create
token" button), endpoint URL + secret, model, sensitivity, strict mode, per-site
toggles, tweet images toggle, keyword list, "Test connection", "Clear cache".

**First run**: settings opens automatically with a short "get your Cloudflare token"
guide. Firefox asks for site access here (MV3 host permissions are optional there).

## Tech stack

- WXT (cross-browser MV3 builds), TypeScript.
- Svelte 5 for popup and settings.
- Vitest with happy-dom for logic and content scripts. Content scripts are tested
  against synthetic copies of real pages in `src/content/fixtures/`.
- Type checking and linting in CI.

## Evaluation

About 150 made-up but realistic examples: fake story spoilers, leak-style posts,
trailer and news posts that aren't spoilers, unrelated GTA V content, and tricky
cases. Reviewed by the maintainer, then extended with real material after launch.
A dev-only script runs them against both models with a token from a local `.env`
and reports accuracy at different thresholds.

## CI and release

- GitHub Actions on every PR and push to main: type check, lint, Vitest, Firefox
  add-on lint (`web-ext lint`), and a Chrome build.
- On a version tag: build Chrome and Firefox zips and attach them to a GitHub
  Release.
- Store uploads (Chrome Web Store, Firefox Add-ons) are manual for v1.
- Privacy policy in the repo: no telemetry, data goes only to the endpoint the user
  configured.

## Repo layout

```
/                 WXT extension (package.json at root)
  src/
    topic.ts      topic name, spoiler definition, glossary, default keywords
    entrypoints/  background, content scripts, popup, settings page
    content/      scanner, batcher, overlay
      adapters/   youtube.ts, x.ts
      fixtures/   synthetic page markup for tests
    lib/          Clef and Jev clients (clef.ts, jev.ts, classify.ts sends),
                  settings, caches, keyword matcher
    ui/           shared Svelte components and theme
  docs/           DESIGN.md, STORE.md
worker/           self-host proxy (own package.json)
eval/             test set + scoring script
```

## Confirmed (2026-10-30)

- Request: `{"model": "clef-flash", "state": {...}, "questions": {"item_1": {"type":
  "noul", "instructions": "..."}}}`. `questions` is an object keyed by question id.
- Response: `result.answers.<id>.noul` is P(yes); `result.usage.input_tokens` gives
  the token count for stats.
- One request answered two items correctly on both models (a Lucia/Jason spoiler
  scored 0.90 flash / 0.97 clef; release news 0.02 / 0.07). 281 input tokens.
- The **Workers AI Read** permission (`a92d2450e05d4e7bb7d0a64968f83d11`) is enough to
  run models. It's the only permission the "Create token" link needs.

- Images go in a top-level `images` array as `data:image/jpeg;base64,…` URLs; plain
  base64 and objects are rejected. Each item lists its images by 1-based position
  (`attached_images: [1]`). A 320×180 thumbnail costs ~60 tokens.
- Live YouTube search "gta 6 ending explained" (headless Chromium, real Clef): 20
  videos found, 8 covered, all with spoiler-style titles. A real mouse click on a
  covered result revealed it without navigating.
- Maintainer's real Chromium 156 (signed in), extension loaded unpacked with the
  `clef` default: YouTube search covered 8 of 19 results and a real click revealed
  without navigating; an X search for "gta 6 leak" covered 3 of 6 posts, two with
  images (so the X image download/resize path works); fast scrolling through ~12
  screens judged every post near the viewport.
- Live signed-in YouTube home feed: 28 of 34 `ytd-rich-item-renderer` tiles read
  (16 videos, all with channel; 12 Shorts); the other 6 were YouTube Playables
  (mini-games), correctly skipped. No duplicate IDs.
- Settings page in Chromium: renders without console errors, "Test connection"
  works, changes save only the changed fields. Listing YouTube/X under
  `host_permissions` makes the site-access check accurate in Chrome.
- Live signed-in X timeline: the adapter read 9 of 9 posts, 3 of 3 quoted posts,
  1 of 1 link card and 5 of 5 posts with images; emoji kept. An overlay on a real
  post revealed on click without opening the post.
- Maintainer's real Firefox (2026-11-08), production build loaded as a temporary
  add-on: works on real YouTube and X pages.
- Jev mode (2026-11-08), development build with a TypeSafe key, headless Chromium:
  live YouTube search "gta 6 ending explained" sent 18 items to Jev (3,030 tokens,
  ~170 per item, no errors) and covered 6. "Test connection" on the settings page
  passed (sample spoiler 98%, sample news 1%). Not yet tried on X or in Firefox.
- In Jev mode the content script attaches no image URLs. Otherwise every YouTube
  item carries a thumbnail URL and the batcher's 4-image cap holds Jev requests to
  4 items: the first live run, before this fix, cost ~300 tokens per item.

- Self-host proxy (`worker/`): unit tests cover auth, model allow-list, error
  mapping and a round trip with the extension's real Clef client. A live run
  (`wrangler dev` or deploy) wasn't possible without changing the maintainer's
  Cloudflare account (remote dev needs a workers.dev subdomain), so it's untested
  against the real `env.AI` binding.

## To verify during implementation

- Packing many items into one Clef request stays accurate at 4–16 items. (2 items
  confirmed working on 2026-10-30; larger batches still to measure.)
- The `permissionGroupKeys` value for Workers AI in the pre-filled token link.
- The token verify endpoint for account-owned tokens, and whether it reports expiry.
- The Deploy button provisions the `ai` binding and prompts for the secret as
  expected.
- Background fetches to `api.cloudflare.com`, `i.ytimg.com` and `pbs.twimg.com`
  work without cross-origin issues in both browsers.
- Clef quality on non-English text.
- The exhausted-free-quota error really is Workers AI error code 4006 (the client
  also matches "neurons" in the message as a fallback).
- Keyword editing: settings store only fields the user changed, so the default
  keyword list keeps updating until the user edits it. Once they do, their copy
  freezes. Decide before building the settings page whether to store additions and
  removals separately so new defaults (more names after launch) still arrive.

## Measured

- 2026-10-30, extension request shape, 5 items: 1,083 input tokens per request
  (shared definition + glossary ≈ 800 of them), 430–590 ms. Both models scored all
  5 hand-picked cases correctly, including "Lucia's FATE Will Shock You" (0.93 /
  0.87) and "lucia from accounting" (0.02 / 0.03). The full eval run comes next.
