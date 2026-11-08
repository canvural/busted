/**
 * Local pre-filter: decides which items are worth sending to Clef.
 *
 * Matching is case- and accent-insensitive on whole words. "Whole word" means no
 * Latin letter or digit right next to the match, so `Cal` doesn't match
 * "California", but `GTA6` still matches "GTA6の発売日" (Japanese has no spaces).
 */

const WORD_CHAR = String.raw`[\p{Script=Latin}\p{Nd}]`;

/** Lowercase, strip accents, and unify apostrophes so "Lúcia" and "Dre’Quan" match. */
export function normalize(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[‘’ʼ`´]/g, "'")
    .toLowerCase();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A keyword's spaces also match runs of spaces or hyphens: "GTA 6" ≈ "gta-6" ≈ "GTA  6". */
function keywordPattern(keyword: string): string {
  return normalize(keyword).trim().split(/[\s-]+/).map(escapeRegExp).join(String.raw`[\s-]+`);
}

export type KeywordMatcher = (text: string) => boolean;

export function createKeywordMatcher(keywords: readonly string[]): KeywordMatcher {
  const patterns = [...new Set(keywords.map((k) => k.trim()).filter(Boolean).map(keywordPattern))];
  if (patterns.length === 0) return () => false;

  const regex = new RegExp(`(?<!${WORD_CHAR})(?:${patterns.join('|')})(?!${WORD_CHAR})`, 'u');
  return (text) => regex.test(normalize(text));
}
