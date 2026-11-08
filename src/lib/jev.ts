/**
 * TypeSafe's Jev decision model. It takes the same request as Clef (shared context in
 * `state`, one yes/no question per item), so the request is built by Clef's builder.
 * `classify.ts` sends the requests.
 *
 * Imports use `.ts` extensions because eval/run.ts loads this file directly in Node.
 */
import type { Topic } from '../topic';
import { type BuiltRequest, buildClefRequest, type ClefItem, ClefError, type ClefResult, parseAnswers, type Answers } from './clef.ts';

/**
 * Pinned to one version: the alias `jev-latest` moves with each release, which would
 * shift scores away from the eval results and the default sensitivity.
 */
export const JEV_MODEL = 'jev-1.14.0';
export type JevModel = typeof JEV_MODEL;
export const JEV_URL = 'https://api.typesafe.ai/v1/systemone';

export interface JevAuth {
  mode: 'jev';
  apiKey: string;
}

export type JevRequest = Omit<BuiltRequest['body'], 'model' | 'images'> & { model: JevModel };

/** Jev answers at the top level and reports errors as `{ detail: { message } }` or `{ detail: "…" }`. */
interface JevBody extends Answers {
  detail?: string | { message?: string };
}

/**
 * Jev rejects images under 280 px on a side, which includes every YouTube thumbnail,
 * and one rejected image fails the whole request. So Jev gets text only.
 */
export function buildJevRequest(items: readonly ClefItem[], topic: Topic): { body: JevRequest; questionToItem: Map<string, string> } {
  const textOnly = items.map(({ images: _dropped, ...item }) => item);
  const { body, questionToItem } = buildClefRequest(textOnly, 'clef', topic);
  const { model: _clefModel, ...rest } = body;
  return { body: { ...rest, model: JEV_MODEL }, questionToItem };
}

export function parseJevResponse(json: unknown, questionToItem: Map<string, string>): ClefResult {
  return parseAnswers(json as JevBody | null, questionToItem);
}

export function jevHttpError(status: number, body: unknown): ClefError {
  const detail = (body as JevBody | null)?.detail;
  const message = (typeof detail === 'string' ? detail : detail?.message) ?? `HTTP ${status}`;
  if (status === 401 || status === 403) return new ClefError('auth', message, status);
  if (status === 429) return new ClefError('rate-limited', message, status);
  // 529 means TypeSafe is overloaded.
  if (status >= 500) return new ClefError('server', message, status);
  return new ClefError('bad-request', message, status);
}
