import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { topic } from '../topic';
import { createKeywordMatcher, normalize } from './keywords';

const matches = createKeywordMatcher(topic.defaultKeywords);

describe('default keyword matcher', () => {
  it.each([
    'GTA 6 ending explained',
    'gta vi leaks',
    '#GTA6 hype',
    'Grand Theft Auto VI review',
    'GTA-6 news',
    'GTA  6 news',
    "Lucia's FATE Will Shock You",
    'jason really sold lucia out',
    'Cal Hampton was the informant',
    'RIP Raul Bautista',
    "Dre’Quan's label",
    'the Mount Kalaga mission',
    'LÚCIA morre no final',
    'GTA6の発売日まであと20日',
  ])('matches %j', (text) => {
    expect(matches(text)).toBe(true);
  });

  it.each([
    'California dreaming',
    'Lucianna is my cousin',
    'Jasonville, Indiana',
    'GTA 5 ending explained',
    'GTA V and GTA Online',
    'Red Dead Redemption 2',
    'calendar update',
    '',
  ])('does not match %j', (text) => {
    expect(matches(text)).toBe(false);
  });
});

describe('createKeywordMatcher', () => {
  it('matches nothing when the list is empty or blank', () => {
    expect(createKeywordMatcher([])('GTA 6')).toBe(false);
    expect(createKeywordMatcher(['', '  '])('GTA 6')).toBe(false);
  });

  it('treats regex characters in user keywords literally', () => {
    const m = createKeywordMatcher(['c++', 'a.b']);
    expect(m('I love c++ so much')).toBe(true);
    expect(m('axb')).toBe(false);
    expect(m('a.b')).toBe(true);
  });

  it('is case- and accent-insensitive for user keywords too', () => {
    expect(createKeywordMatcher(['Café'])('CAFE open')).toBe(true);
  });
});

describe('normalize', () => {
  it('lowercases, strips accents and unifies apostrophes', () => {
    expect(normalize('Lúcia’S')).toBe("lucia's");
  });
});

describe('default keywords against the eval set', () => {
  interface EvalCase {
    id: string;
    label: boolean;
    item: Record<string, string | string[] | null>;
  }
  const cases: EvalCase[] = readFileSync(new URL('../../eval/cases.jsonl', import.meta.url), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as EvalCase);
  const textOf = (c: EvalCase) => Object.values(c.item).flat().filter(Boolean).join(' ');

  it('loads the eval set', () => {
    expect(cases.length).toBeGreaterThanOrEqual(150);
  });

  it('sends every labeled spoiler to Clef', () => {
    const missed = cases.filter((c) => c.label && !matches(textOf(c))).map((c) => c.id);
    expect(missed).toEqual([]);
  });
});
