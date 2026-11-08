/**
 * Sends a batch of items to the model the user picked: Clef (on their Cloudflare
 * account or through a proxy) or TypeSafe's Jev.
 *
 * Imports use `.ts` extensions because eval/run.ts loads this file directly in Node.
 */
import type { Topic } from '../topic';
import {
  buildClefRequest,
  type ClefAuth,
  ClefError,
  clefHttpError,
  type ClefItem,
  type ClefModel,
  type ClefResult,
  clefUrl,
  type CloudflareEnvelope,
  parseClefResponse,
} from './clef.ts';
import { buildJevRequest, JEV_URL, type JevAuth, jevHttpError, parseJevResponse } from './jev.ts';

export type Auth = ClefAuth | JevAuth;

export interface ClassifyOptions {
  auth: Auth;
  /** The Clef model. Ignored for Jev. */
  model: ClefModel;
  topic: Topic;
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
}

export async function classify(items: readonly ClefItem[], options: ClassifyOptions): Promise<ClefResult> {
  const { auth, model, topic, signal } = options;
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);

  const credential = auth.mode === 'cloudflare' ? auth.apiToken : auth.mode === 'jev' ? auth.apiKey : auth.secret;
  if (!credential.trim() || (auth.mode === 'cloudflare' && !auth.accountId.trim())) {
    throw new ClefError('auth', 'No credentials configured');
  }

  const { body, questionToItem } = auth.mode === 'jev' ? buildJevRequest(items, topic) : buildClefRequest(items, model, topic);

  let response: Response;
  try {
    response = await doFetch(auth.mode === 'jev' ? JEV_URL : clefUrl(auth, model), {
      method: 'POST',
      headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ClefError('network', error instanceof Error ? error.message : String(error));
  }

  const json: unknown = await response.json().catch(() => null);
  if (auth.mode === 'jev') {
    if (!response.ok) throw jevHttpError(response.status, json);
    return parseJevResponse(json, questionToItem);
  }
  const envelope = json as CloudflareEnvelope | null;
  if (!response.ok || envelope?.success === false) throw clefHttpError(response.status, envelope);
  return parseClefResponse(json, questionToItem);
}
