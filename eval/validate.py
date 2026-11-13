"""Validates eval/cases.jsonl and prints counts."""
import json
import re
import sys
from collections import Counter

# Mirrors topic.defaultKeywords in src/topic.ts. Matched case-insensitively on whole words.
KEYWORDS = ["gta 6", "gta vi", "gta6", "grand theft auto vi", "grand theft auto 6", "vice city", "leonida",
            "lucia", "jason", "cal hampton", "boobie", "dre'quan", "real dimez", "raul", "brian heder",
            "port gellhorn", "ambrosia", "grassrivers", "mount kalaga"]
# "Whole word" = no Latin letter or digit right before/after, so "GTA6の" (Japanese) still matches
# but "Cal" doesn't match "California".
KEYWORD_RE = re.compile(r"(?<![a-z0-9])(?:" + "|".join(re.escape(k) for k in KEYWORDS) + r")(?![a-z0-9])")
SPOILER_CATS = {"ending", "character-death", "betrayal", "plot-detail", "mission-detail", "late-game", "leak", "datamine"}
SAFE_CATS = {"trailer", "release-news", "review-no-spoilers", "meme", "gta5", "classic-gta", "other-game",
             "unrelated", "community", "vague-teaser", "rumor"}

errors = []
cases = []
path = sys.argv[1]
with open(path, encoding="utf-8") as f:
    for n, line in enumerate(f, 1):
        try:
            cases.append((n, json.loads(line)))
        except Exception as e:
            errors.append(f"line {n}: bad JSON: {e}")


def err(n, msg):
    errors.append(f"line {n}: {msg}")


ids = Counter()
for n, c in cases:
    if set(c) != {"id", "site", "item", "label", "category", "note"}:
        err(n, f"keys {sorted(c)}")
        continue
    ids[c["id"]] += 1
    site, item = c["site"], c["item"]
    prefix = {"youtube": "yt", "x": "x"}.get(site)
    if prefix is None:
        err(n, f"bad site {site!r}")
        continue
    if not re.fullmatch(rf"{prefix}-\d{{3}}", c["id"]):
        err(n, f"id {c['id']!r} doesn't match site")
    if not isinstance(c["label"], bool):
        err(n, "label not bool")
    if not isinstance(c["note"], str) or not c["note"].strip():
        err(n, "empty note")
    cat = c["category"]
    if not isinstance(cat, str) or not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", cat):
        err(n, f"bad category {cat!r}")
    elif cat in SPOILER_CATS and c["label"] is not True:
        err(n, f"spoiler category {cat} labeled false")
    elif cat in SAFE_CATS and c["label"] is not False:
        err(n, f"non-spoiler category {cat} labeled true")
    elif cat not in SPOILER_CATS | SAFE_CATS:
        err(n, f"unknown category {cat}")
    if site == "youtube":
        if set(item) != {"title", "channel"} or not all(isinstance(item[k], str) and item[k] for k in item):
            err(n, f"bad youtube item {item}")
    else:
        # replying_to is only present on replies: the post they answer, given as context.
        reply = item.get("replying_to", "-")
        ok = (set(item) - {"replying_to"} == {"text", "quoted", "card", "alt"} and isinstance(reply, str) and reply
              and isinstance(item["text"], str) and item["text"]
              and all(item[k] is None or (isinstance(item[k], str) and item[k]) for k in ("quoted", "card"))
              and isinstance(item["alt"], list) and all(isinstance(a, str) and a for a in item["alt"]))
        if not ok:
            err(n, f"bad x item {item}")
for i, k in ids.items():
    if k > 1:
        errors.append(f"duplicate id {i}")

if errors:
    print("ERRORS:")
    print("\n".join(errors))
    sys.exit(1)


def text_of(c):
    it = c["item"]
    if c["site"] == "youtube":
        return f"{it['title']} {it['channel']}"
    return " ".join([it["text"], it["quoted"] or "", it["card"] or "", *it["alt"], it.get("replying_to", "")])


def passes(c):
    t = text_of(c).lower()
    return KEYWORD_RE.search(t) is not None


cs = [c for _, c in cases]
print(f"OK: {len(cs)} cases, all valid\n")
print("site × label:")
for site in ("youtube", "x"):
    s = [c for c in cs if c["site"] == site]
    t = sum(c["label"] for c in s)
    print(f"  {site:8} total {len(s):3}  spoiler {t:3}  not {len(s) - t:3}  ({t / len(s):.0%} spoiler)")
t = sum(c["label"] for c in cs)
print(f"  {'all':8} total {len(cs):3}  spoiler {t:3}  not {len(cs) - t:3}  ({t / len(cs):.0%} spoiler)\n")

print("category (label, yt, x):")
for cat in [*sorted(SPOILER_CATS), *sorted(SAFE_CATS)]:
    s = [c for c in cs if c["category"] == cat]
    print(f"  {cat:20} {str(s[0]['label']).lower() if s else '-':5} {sum(c['site'] == 'youtube' for c in s):3} "
          f"{sum(c['site'] == 'x' for c in s):3}  = {len(s)}")

print("\ndefault keyword pre-filter pass:")
for lab in (True, False):
    s = [c for c in cs if c["label"] is lab]
    p = sum(passes(c) for c in s)
    print(f"  label={str(lab).lower():5} {p}/{len(s)} pass, {len(s) - p} need strict mode")
print("  keyword-free cases:", ", ".join(c["id"] for c in cs if not passes(c)))

amb = [c for c in cs if c["note"].startswith("BORDERLINE:")]
print(f"\nborderline, labels confirmed by maintainer ({len(amb)}):")
for c in amb:
    print(f"  {c['id']:7} label={str(c['label']).lower():5} {c['category']}")
