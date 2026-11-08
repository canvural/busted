/**
 * Busted! proxy: lets people use Clef without their own Cloudflare token.
 * Whoever deploys it pays for the Workers AI usage, so every request must carry
 * the shared secret they hand out. It only forwards Clef requests; all spoiler
 * logic stays in the extension.
 */

export interface Env {
  AI: { run(model: string, input: unknown): Promise<unknown> };
  SHARED_SECRET?: string;
}

const MODELS = new Set(['clef', 'clef-flash']);
/** Clef's own request limit. */
const MAX_BODY_BYTES = 13 * 1024 * 1024;

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Same envelope as Cloudflare's REST API, so the extension handles both the same way. */
function fail(status: number, message: string, code = status): Response {
  return reply(status, { success: false, errors: [{ code, message }], result: null });
}

/** Compares secrets without leaking their length or content through timing. */
async function sameSecret(given: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(given)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i]! ^ y[i]!;
  return diff === 0;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') return fail(405, 'Send Clef requests with POST.');
    if (!env.SHARED_SECRET) {
      return fail(500, 'SHARED_SECRET is not set. Set it with: npx wrangler secret put SHARED_SECRET');
    }
    const auth = request.headers.get('Authorization') ?? '';
    const given = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!(await sameSecret(given, env.SHARED_SECRET))) return fail(401, 'Wrong or missing shared secret.');

    if (Number(request.headers.get('Content-Length') ?? 0) > MAX_BODY_BYTES) return fail(413, 'Request too large.');
    let body: { model?: unknown } | null;
    try {
      body = (await request.json()) as { model?: unknown } | null;
    } catch {
      return fail(400, 'Request body must be JSON.');
    }
    const model = body?.model;
    if (typeof model !== 'string' || !MODELS.has(model)) return fail(400, 'model must be "clef" or "clef-flash".');

    try {
      const result = await env.AI.run(`@cf/cloudflare/${model}`, body);
      return reply(200, { success: true, errors: [], result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // The free daily allocation running out (Workers AI error 4006).
      if (/4006|neurons/i.test(message)) return fail(429, message, 4006);
      return fail(502, message);
    }
  },
};
