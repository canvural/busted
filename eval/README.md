# Eval set

`cases.jsonl` holds 154 made-up but realistic YouTube and X items, each labeled
spoiler or not. A dev script runs them against `clef-flash`, `clef` or TypeSafe's Jev and reports
accuracy at different thresholds (see `docs/DESIGN.md` → Evaluation). There are no
real GTA VI story spoilers yet, so all the plot points are invented. Every case is
text-only. Image cases come after launch.

| | Total | Spoiler | Not spoiler |
|---|---|---|---|
| YouTube | 70 | 29 | 41 |
| X | 84 | 33 | 51 |
| **All** | **154** | **62 (40%)** | **92** |

## Schema

One JSON object per line:

```json
{"id":"yt-0NN","site":"youtube","item":{"title":"…","channel":"…"},"label":true,"category":"ending","note":"…"}
{"id":"x-0NN","site":"x","item":{"text":"…","quoted":null,"card":null,"alt":[]},"label":false,"category":"meme","note":"…"}
```

- `item` holds exactly what the site adapter extracts. On X, `quoted` is the
  quoted tweet's text, `card` is the link card's title (string or null), and `alt`
  lists image alt texts. Replies on a post page also have `replying_to`, the text of
  the post they answer (x-081 to x-084); other cases leave the key out.
- `label`: `true` means it's a spoiler.
- `note`: why it got that label. Notes starting with `BORDERLINE:` mark hard calls
  the maintainer has confirmed (see below).
- Cases are grouped by category, spoiler categories first, to make review easier.

## Categories

Each category is either all spoilers or all non-spoilers.

| Spoiler (`true`) | YT | X | | Not spoiler (`false`) | YT | X |
|---|---|---|---|---|---|---|
| `ending` | 8 | 9 | | `release-news` (date, price, preorder, platform, performance) | 8 | 9 |
| `character-death` | 3 | 6 | | `trailer` (official trailers, screenshots, marketing) | 5 | 6 |
| `betrayal` | 3 | 7 | | `meme` (hype, jokes) | 4 | 6 |
| `plot-detail` (twists, story events) | 7 | 3 | | `community` (speedruns, streams, "don't spoil me", spoiler PSAs) | 3 | 7 |
| `mission-detail` | 3 | 2 | | `unrelated` (Florida news, real people named Lucia/Jason, "Vice City" businesses) | 4 | 5 |
| `late-game` | 1 | 1 | | `gta5` (GTA V story and GTA Online) | 4 | 4 |
| `leak` (leaked footage/info, plot rumors) | 2 | 3 | | `review-no-spoilers` | 5 | 2 |
| `datamine` | 2 | 2 | | `classic-gta` (Vice City 2002, VCS) | 3 | 3 |
| | | | | `other-game` | 3 | 2 |
| | | | | `rumor` (rumors that aren't about the story) | 2 | 3 |
| | | | | `vague-teaser` (reactions with no content) | 0 | 4 |

Non-English cases (one spoiler and one non-spoiler per language):
- Spanish: yt-007, x-045
- Portuguese: x-009, yt-042
- Turkish: yt-008, x-046
- German: x-020, yt-047
- Japanese: yt-021, x-037

**Keyword pre-filter:** 33 cases contain none of the default keywords (`GTA 6`,
`GTA VI`, `GTA6`, `Grand Theft Auto VI/6`, `Vice City`, `Leonida`), checked across
title+channel or text+quoted+card+alt. Of those, 12 are spoilers and 21 are not. In
default mode these cases never reach Clef, so they only matter for strict mode.
Score them separately, or report results both with and without them.

## Labeling rules

The test, as in DESIGN.md: **does the item claim to reveal GTA VI story,
missions, endings, character fates, late-game content, or leaked/datamined
material?** Whether the claim is true doesn't matter.

- **Clickbait titles** ("Lucia's FATE Will Shock You (FULL ENDING EXPLAINED)") are
  spoilers even when the title states no fact. The video promises the reveal, and
  the thumbnail usually shows it.
- **Spoiler warnings** ("spoiler warning: …", "MAJOR SPOILERS below", blank-line
  padding) don't change anything. If the spoiler follows, it's a spoiler. A post
  that calls itself "spoiler-free" and then spoils is a spoiler (x-019).
- **Rumors**: a rumor that states a plot point is a spoiler, hedged or not ("take
  with salt", x-028), and goes in `leak`. Rumors about dates, price, platforms or
  map size are not spoilers (`rumor`).
- **"Just finished, no spoilers" posts** and **vague reactions** ("that ending
  though 😭") are not spoilers on X, because they reveal nothing. A YouTube *video*
  about the ending is a spoiler even if its title is vague (yt-006), because the
  content shows the ending.
- **Spoilers in quoted tweets, link cards or alt text** count. The model sees all
  the fields, so the item is a spoiler if any field is.
- **Replies** are the exception: `replying_to` is context, not content. A reply is
  labeled by what it reveals once you know what it answers. "can't believe he dies"
  under a post about Jason is a spoiler (x-081); "lol no way" under a spoiler is
  not (x-083).
- **Trailer-derived story talk** (breakdowns, "everything we know about the
  story") is not a spoiler. It only uses official marketing.
- **Other games' spoilers** (GTA V, Vice City 2002, RDR2) are not spoilers, even
  blunt ones.
- **Predictions confirmed after launch** ("the way this thread called it" quoting
  a prediction) are spoilers (x-023).

## Borderline cases (labels confirmed by the maintainer, 2026-10-30)

Rule: hinting that *something happens* to a named character counts as a spoiler;
pure reactions and warnings don't.

| id | label | why it was a hard call |
|---|---|---|
| yt-006 | true | "My Honest Reaction to the GTA 6 Ending": the title is vague, but the video shows the ending |
| yt-020 | true | "he really did that to Lucia 💀 #shorts": hints at a scene without saying what happens |
| x-007 | true | Ending told only in emoji (👩🚗💨💰 👨⚰️) |
| x-048 | false | "No spoilers, but the last 10 hours are the best… Prepare yourselves." |
| x-071 | false | "Retail copies out early, people streaming the final mission, mute words": warns, reveals nothing |
| x-075 | false | "that ending though 😭" |
| x-076 | false | "chapter 4 had me screaming… that's all I'll say": only hints that something big happens |

## Notes

- Some X posts are written as if the game is out, or from review copies. The set
  is meant for use after launch too.
- Channel names, handles and people are fictional. The "Florida man" and weather
  posts are generic, not real news.

## Checking the file

```
python3 eval/validate.py eval/cases.jsonl
```

Checks that every line parses, ids are unique, fields have the right types, and labels
match their category. Prints counts and which cases the default keyword pre-filter
would skip. Exits non-zero on any error.

## Running it

```
node --env-file=.env eval/run.ts --model clef --batch 16 --out eval/results/clef-b16.json
node --env-file=.env eval/run.ts --model jev --out eval/results/jev-b16.json
```

Clef runs need `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in `.env` and spend
Workers AI quota. Jev runs need `JEV_TOKEN` (a TypeSafe API key) and are billed to
that TypeSafe account: a full run is about 21,000 tokens, under a tenth of a cent.

Uses the extension's own request code (`src/lib/classify.ts`) and topic file, so it
measures exactly what ships. Prints accuracy, precision and recall per threshold and
lists every wrong answer at 0.5.

## Results (2026-10-30, prompt version 1)

These runs used the first 150 cases. The four reply cases (x-081 to x-084) and
prompt version 2, which adds the reply wording, haven't been scored yet.

| Model | Items per request | Accuracy at 0.5 | Missed spoilers | False alarms | Input tokens | Time |
|---|---|---|---|---|---|---|
| `clef` | 16 | **99%** | 1 | 1 | 27,136 | 6.4 s |
| `clef-flash` | 16 | 91% | 6 | 7 | 27,136 | 9.1 s |
| `clef-flash` | 1 | 96% | 1 | 5 | 83,822 | 135 s |

- `clef` is the default: it's far more accurate and handles 16 items per request
  without losing accuracy. Its best thresholds are 0.4–0.6, so the default
  sensitivity stays at 0.5.
- `clef-flash` loses accuracy when items are batched. It's ~6× cheaper per token.
- All 10 non-English cases were correct on every run.
- Cost: ~180 input tokens per text item when batched. With Workers AI's free 10,000
  neurons a day, that's roughly 2,500 judged items/day on `clef` and 16,000 on
  `clef-flash`. Only keyword matches are ever sent.

### Jev (2026-11-08, prompt version 1)

| Model | Items per request | Accuracy at 0.5 | Missed spoilers | False alarms | Input tokens | Time |
|---|---|---|---|---|---|---|
| `jev-1.14.0` | 16 | **98%** | 1 | 2 | 20,970 | 2.2 s |

- Same requests as Clef (same state and questions), minus images.
- Best threshold is 0.6 (99%, no false alarms, 2 missed). At the default 0.5 it
  missed yt-006 (vague "reaction to the ending" title, 0.11) and flagged yt-063 (a
  real wedding video for a Lucia and Jason, 0.57) and x-080 (map size rumor, 0.56).
- All 10 non-English cases were correct.
- Cost: ~140 input tokens per text item when batched. At $0.042 per million tokens
  that's roughly 170,000 judged items per US dollar.
- Jev is pinned to `jev-1.14.0` in `src/lib/jev.ts`. Rerun this when moving to a
  newer version.

Raw scores are in `results/`.
