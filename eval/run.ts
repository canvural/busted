/**
 * Scores Clef (or Jev) against eval/cases.jsonl using the extension's own request builder.
 *
 *   node --env-file=.env eval/run.ts [--model clef-flash|clef|jev] [--batch 16] [--out eval/results/x.json]
 *
 * Clef needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (Workers AI Read).
 * Jev needs JEV_TOKEN, a TypeSafe API key.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { type Auth, classify } from '../src/lib/classify.ts';
import { type ClefItem, type ClefModel, MAX_TEXT_ITEMS_PER_REQUEST } from '../src/lib/clef.ts';
import { JEV_MODEL } from '../src/lib/jev.ts';
import { createKeywordMatcher } from '../src/lib/keywords.ts';
import { topic } from '../src/topic.ts';

interface EvalCase {
  id: string;
  site: 'youtube' | 'x';
  item: Record<string, string | string[] | null>;
  label: boolean;
  category: string;
  note: string;
}

const { values } = parseArgs({
  options: {
    model: { type: 'string', default: 'clef-flash' },
    batch: { type: 'string', default: String(MAX_TEXT_ITEMS_PER_REQUEST) },
    out: { type: 'string' },
  },
});
const jev = values.model === 'jev';
const clefModel: ClefModel = jev ? 'clef' : (values.model as ClefModel);
const model = jev ? JEV_MODEL : clefModel;
const batchSize = Number(values.batch);

let auth: Auth;
if (jev) {
  auth = { mode: 'jev', apiKey: process.env.JEV_TOKEN ?? '' };
  if (!auth.apiKey) {
    console.error('Set JEV_TOKEN (e.g. node --env-file=.env eval/run.ts --model jev)');
    process.exit(1);
  }
} else {
  auth = { mode: 'cloudflare', accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? '', apiToken: process.env.CLOUDFLARE_API_TOKEN ?? '' };
  if (!auth.accountId || !auth.apiToken) {
    console.error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (e.g. node --env-file=.env eval/run.ts)');
    process.exit(1);
  }
}

const here = import.meta.dirname;
const cases: EvalCase[] = readFileSync(join(here, 'cases.jsonl'), 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line) as EvalCase);

/** Same field shape the site adapters produce. */
function toItem(c: EvalCase): ClefItem {
  const fields: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(c.item)) {
    if (Array.isArray(value) ? value.length > 0 : value) fields[key] = value as string | string[];
  }
  return { id: c.id, fields };
}

const scores = new Map<string, number>();
let inputTokens = 0;
const started = performance.now();
for (let i = 0; i < cases.length; i += batchSize) {
  const batch = cases.slice(i, i + batchSize).map(toItem);
  const result = await classify(batch, { auth, model: clefModel, topic });
  for (const [id, p] of result.scores) scores.set(id, p);
  inputTokens += result.inputTokens;
  process.stderr.write(`\r${Math.min(i + batchSize, cases.length)}/${cases.length}`);
}
process.stderr.write('\n');
const seconds = (performance.now() - started) / 1000;

const matches = createKeywordMatcher(topic.defaultKeywords);
const textOf = (c: EvalCase) => Object.values(c.item).flat().filter(Boolean).join(' ');

function metrics(threshold: number, subset: EvalCase[] = cases) {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (const c of subset) {
    const predicted = (scores.get(c.id) ?? 0) >= threshold;
    if (predicted && c.label) tp++;
    else if (predicted) fp++;
    else if (c.label) fn++;
    else tn++;
  }
  const precision = tp / Math.max(tp + fp, 1);
  const recall = tp / Math.max(tp + fn, 1);
  return {
    threshold,
    accuracy: (tp + tn) / subset.length,
    precision,
    recall,
    f1: (2 * precision * recall) / Math.max(precision + recall, 1e-9),
    tp, fp, tn, fn,
  };
}

const thresholds = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
const table = thresholds.map((t) => metrics(t));
// What users actually see: only keyword matches reach Clef; the rest are never covered.
const reachable = cases.filter((c) => matches(textOf(c)));

const pct = (x: number) => `${(x * 100).toFixed(0)}%`.padStart(5);
console.log(`\n${model}, batch ${batchSize}: ${cases.length} cases, ${inputTokens} input tokens, ${seconds.toFixed(1)} s`);
console.log('threshold  accuracy  precision  recall   f1     fp  fn');
for (const m of table) {
  console.log(
    `   ${m.threshold.toFixed(1)}     ${pct(m.accuracy)}     ${pct(m.precision)}    ${pct(m.recall)}  ${pct(m.f1)}  ${String(m.fp).padStart(3)} ${String(m.fn).padStart(3)}`,
  );
}
const best = table.reduce((a, b) => (b.f1 > a.f1 ? b : a));
console.log(`best F1 at ${best.threshold}`);

const at = 0.5;
const wrong = cases
  .filter((c) => (scores.get(c.id) ?? 0) >= at !== c.label)
  .map((c) => `  ${c.label ? 'MISSED ' : 'FALSE+ '} ${scores.get(c.id)!.toFixed(2)}  ${c.id.padEnd(7)} ${textOf(c).slice(0, 90)}`);
console.log(`\nwrong at ${at} (${wrong.length}):\n${wrong.join('\n')}`);

const byLanguage = cases.filter((c) => /^(Spanish|Portuguese|Turkish|German|Japanese)/.test(c.note));
console.log(`\nnon-English accuracy at ${at}: ${pct(metrics(at, byLanguage).accuracy)} (${byLanguage.length} cases)`);
console.log(`keyword-reachable cases: ${reachable.length}; accuracy among them at ${at}: ${pct(metrics(at, reachable).accuracy)}`);

if (values.out) {
  mkdirSync(dirname(values.out), { recursive: true });
  writeFileSync(
    values.out,
    JSON.stringify({ model, batchSize, inputTokens, seconds, promptVersion: topic.promptVersion, table, scores: Object.fromEntries(scores) }, null, 2) + '\n',
  );
}
