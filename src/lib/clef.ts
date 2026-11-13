/**
 * Cloudflare's Clef decision model: request format, response parsing and errors.
 * `classify.ts` sends the requests.
 *
 * One request judges several items: the shared context (spoiler definition and
 * glossary) goes into `state` once, and each item gets its own yes/no question.
 */
import type { Topic } from '../topic';

export type ClefModel = 'clef-flash' | 'clef';
export const CLEF_MODELS: readonly ClefModel[] = ['clef-flash', 'clef'];

/** What an adapter extracted from one video or tweet. */
export interface ClefItem {
  id: string;
  /** Text, e.g. `{ title, channel }`. */
  fields: Record<string, string | string[]>;
  /** Images as `data:image/...;base64,` URLs. Clef rejects remote URLs. */
  images?: string[];
}

export type ClefAuth =
  | { mode: 'cloudflare'; accountId: string; apiToken: string }
  | { mode: 'endpoint'; url: string; secret: string };

/** Clef accepts up to 64 questions; we keep text batches smaller for accuracy. */
export const MAX_TEXT_ITEMS_PER_REQUEST = 16;
/** Clef's own limit. */
export const MAX_IMAGES_PER_REQUEST = 4;

/** Workers AI pricing (2026-10): neurons billed per million input tokens. */
export const NEURONS_PER_MILLION_TOKENS: Record<ClefModel, number> = { clef: 21_818, 'clef-flash': 3_455 };
/** Free Workers AI allocation per account per day, reset at 00:00 UTC. */
export const FREE_NEURONS_PER_DAY = 10_000;

/**
 * Field holding the post a reply was written under. It's there so a reply like "can't
 * believe he dies" can be understood; the reply is what gets judged.
 */
export const REPLY_CONTEXT_FIELD = 'replying_to';

type StateItem = Record<string, string | string[] | number[]>;

export interface ClefRequest {
  model: ClefModel;
  state: {
    context: { topic: string; spoiler_definition: string; glossary: Record<string, string> };
    items: Record<string, StateItem>;
  };
  images?: string[];
  questions: Record<string, { type: 'noul'; instructions: string }>;
}

export interface BuiltRequest {
  body: ClefRequest;
  /** Question id → item id. Question ids are positional because Clef restricts their characters. */
  questionToItem: Map<string, string>;
}

export function buildClefRequest(items: readonly ClefItem[], model: ClefModel, topic: Topic): BuiltRequest {
  if (items.length === 0) throw new RangeError('No items to classify');
  if (items.length > MAX_TEXT_ITEMS_PER_REQUEST) {
    throw new RangeError(`At most ${MAX_TEXT_ITEMS_PER_REQUEST} items per request, got ${items.length}`);
  }
  const imageCount = items.reduce((n, item) => n + (item.images?.length ?? 0), 0);
  if (imageCount > MAX_IMAGES_PER_REQUEST) {
    throw new RangeError(`At most ${MAX_IMAGES_PER_REQUEST} images per request, got ${imageCount}`);
  }

  const questionToItem = new Map<string, string>();
  const stateItems: ClefRequest['state']['items'] = {};
  const questions: ClefRequest['questions'] = {};
  const images: string[] = [];

  items.forEach((item, index) => {
    const qid = `item_${index + 1}`;
    questionToItem.set(qid, item.id);
    const stateItem: StateItem = { ...item.fields };
    if (item.images?.length) {
      // 1-based positions in the request's image list, matching "image 1", "image 2", …
      stateItem.attached_images = item.images.map((dataUrl) => images.push(dataUrl));
    }
    stateItems[qid] = stateItem;
    questions[qid] = {
      type: 'noul',
      instructions:
        `Is items.${qid} a ${topic.name} spoiler, as defined in context.spoiler_definition? ` +
        `Judge its text and any images listed in its attached_images. ` +
        (REPLY_CONTEXT_FIELD in item.fields
          ? `Its ${REPLY_CONTEXT_FIELD} is the post it was written under: read it to understand what the item refers to, ` +
            `but answer for what the item itself reveals. A reply that reveals nothing is not a spoiler, whatever it was written under. `
          : '') +
        `Use context.glossary to recognize ${topic.name} characters and places.`,
    };
  });

  return {
    body: {
      model,
      state: {
        context: { topic: topic.name, spoiler_definition: topic.spoilerDefinition, glossary: topic.glossary },
        items: stateItems,
      },
      ...(images.length > 0 && { images }),
      questions,
    },
    questionToItem,
  };
}

export type ClefErrorKind =
  | 'auth' // token missing, wrong or lacking permission
  | 'quota' // daily free allocation used up
  | 'rate-limited'
  | 'network'
  | 'server'
  | 'bad-request'
  | 'bad-response';

export class ClefError extends Error {
  readonly kind: ClefErrorKind;
  readonly status: number | undefined;

  constructor(kind: ClefErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'ClefError';
    this.kind = kind;
    this.status = status;
  }
}

/** The answers part of a response. Clef wraps it in a Cloudflare envelope; Jev doesn't. */
export interface Answers {
  answers?: Record<string, { noul?: unknown }>;
  usage?: { input_tokens?: unknown };
}

export interface CloudflareEnvelope {
  success?: boolean;
  errors?: { code?: number; message?: string }[];
  result?: Answers;
}

export interface ClefResult {
  /** Item id → probability (0–1) that it's a spoiler. */
  scores: Map<string, number>;
  inputTokens: number;
}

export function parseClefResponse(json: unknown, questionToItem: Map<string, string>): ClefResult {
  return parseAnswers((json as CloudflareEnvelope | null)?.result, questionToItem);
}

export function parseAnswers(body: Answers | null | undefined, questionToItem: Map<string, string>): ClefResult {
  const answers = body?.answers;
  if (!answers || typeof answers !== 'object') throw new ClefError('bad-response', 'Response has no answers');

  const scores = new Map<string, number>();
  for (const [qid, itemId] of questionToItem) {
    const p = answers[qid]?.noul;
    if (typeof p !== 'number' || !(p >= 0 && p <= 1)) {
      throw new ClefError('bad-response', `Missing or invalid answer for ${qid}`);
    }
    scores.set(itemId, p);
  }
  const tokens = body.usage?.input_tokens;
  return { scores, inputTokens: typeof tokens === 'number' ? tokens : 0 };
}

export function clefHttpError(status: number, body: CloudflareEnvelope | null): ClefError {
  const first = body?.errors?.[0];
  const message = first?.message ?? `HTTP ${status}`;
  // Workers AI reports the exhausted free allocation as error 4006 ("…daily free allocation of 10,000 neurons…").
  if (first?.code === 4006 || /neurons/i.test(message)) return new ClefError('quota', message, status);
  if (status === 401 || status === 403) return new ClefError('auth', message, status);
  if (status === 429) return new ClefError('rate-limited', message, status);
  if (status >= 500) return new ClefError('server', message, status);
  return new ClefError('bad-request', message, status);
}

export function clefUrl(auth: ClefAuth, model: ClefModel): string {
  if (auth.mode === 'endpoint') return auth.url;
  return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(auth.accountId)}/ai/run/@cf/cloudflare/${model}`;
}
