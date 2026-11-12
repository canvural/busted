# Busted!

Open-source browser extension (Chrome and Firefox, built with WXT and Svelte 5) that hides GTA VI spoilers on YouTube, X and Reddit. Each user brings their own Cloudflare account, and Clef on Workers AI decides what's a spoiler. Users can pick TypeSafe's Jev instead, with their own TypeSafe API key; it gets the same request, text only. `worker/` is an optional proxy for sharing one account.

Commands are in `README.md` under Development. The reasons behind design choices are in `docs/DESIGN.md`.

## Checks

- Before calling work done, run `npm run check`: type check, lint, tests, and the Firefox add-on lint. It builds Firefox, so it's slow.
- While iterating, `npm run typecheck && npm run lint && npm test` is enough.

## Rules

- Anyone should be able to fork and run this. Keep credentials, account IDs and machine-specific paths out of the repo. `.env` and the `.output/*-dev` builds can hold real tokens and stay local.
- Build DOM with `createElement` and `textContent`. Firefox's add-on lint flags `innerHTML`. Its one remaining warning comes from Svelte's runtime and is accepted.
- Write TypeScript that Node can strip (no enums, no constructor parameter properties). `eval/run.ts` runs directly in Node and imports `src/lib/classify.ts`, `clef.ts` and `jev.ts`, so runtime imports between those files need `.ts` extensions.
- Keep the stack light. The maintainer chose Svelte with plain CSS over heavier frameworks, and a single package over workspaces.
- Use no Rockstar or Take-Two artwork or logos.

## Where things live

- `src/topic.ts` is the only GTA VI-specific file. Bump `promptVersion` whenever the spoiler definition, glossary or question wording changes. It's part of the verdict cache key, so old verdicts get dropped.
- `src/content/adapters/` reads each site's markup. The fixtures in `src/content/fixtures/` are synthetic copies of real pages, so update the fixture along with any adapter fix.
- `eval/` scores Clef or Jev against labeled cases (see `eval/README.md`). Running it spends Workers AI quota on the Cloudflare account in `.env` (or TypeSafe credit with `--model jev`), so ask before running it.

## Releasing

- A `v*` tag publishes. CI builds the zips, creates a GitHub Release and submits them to the Chrome Web Store and Firefox Add-ons. A store submission can't be taken back, so ask before pushing a tag.
- To release: bump `version` in `package.json`, commit, then `git tag v<version> && git push origin main v<version>`. CI fails if the tag and `package.json` disagree.
- Neither store accepts a version twice, so if a release fails partway, release the next patch version rather than re-tagging.
- Store credentials, listing copy and what changes for users when permissions are added: `docs/STORE.md`.
