import { describe, expect, it } from 'vitest';
import { topic } from '../topic';
import { buildClefRequest, ClefError, type ClefItem } from './clef';
import { buildJevRequest, JEV_MODEL, jevHttpError, parseJevResponse } from './jev';

const items: ClefItem[] = [
  { id: 'yt:abc', fields: { title: "Lucia's FATE Will Shock You", channel: 'LoreDrop' }, images: ['data:image/jpeg;base64,AAA'] },
  { id: 'x:123', fields: { text: 'GTA 6 preloads open November 17', alt: [] } },
];

describe('buildJevRequest', () => {
  it("asks Clef's questions with the pinned Jev model", () => {
    const { body, questionToItem } = buildJevRequest(items, topic);
    const clef = buildClefRequest(items, 'clef', topic).body;
    expect(body.model).toBe(JEV_MODEL);
    expect(body.questions).toEqual(clef.questions);
    expect(body.state.context).toEqual(clef.state.context);
    expect([...questionToItem.values()]).toEqual(['yt:abc', 'x:123']);
  });

  it('leaves images out, since Jev rejects thumbnail-sized ones', () => {
    const { body } = buildJevRequest(items, topic);
    expect(body).not.toHaveProperty('images');
    expect(body.state.items.item_1).toEqual(items[0]!.fields);
  });
});

describe('parseJevResponse', () => {
  const { questionToItem } = buildJevRequest(items, topic);

  it('reads answers and usage from the top level', () => {
    const result = parseJevResponse({ answers: { item_1: { noul: 0.4 }, item_2: { noul: 0.6 } }, usage: { input_tokens: 9 } }, questionToItem);
    expect(result).toEqual({ scores: new Map([['yt:abc', 0.4], ['x:123', 0.6]]), inputTokens: 9 });
  });

  it("doesn't accept a Cloudflare envelope", () => {
    expect(() => parseJevResponse({ success: true, result: { answers: { item_1: { noul: 0.4 }, item_2: { noul: 0.6 } } } }, questionToItem)).toThrow(
      ClefError,
    );
  });
});

describe('jevHttpError', () => {
  it.each([
    [401, { detail: { message: 'Cannot authenticate' } }, 'auth', 'Cannot authenticate'],
    [403, null, 'auth', 'HTTP 403'],
    [429, { detail: 'Too many requests' }, 'rate-limited', 'Too many requests'],
    [529, null, 'server', 'HTTP 529'],
    [500, null, 'server', 'HTTP 500'],
    [400, { detail: { error_type: 'api_usage_error', message: 'Invalid image dimensions.' } }, 'bad-request', 'Invalid image dimensions.'],
    [422, { detail: [{ loc: ['body', 'state'], msg: 'Field required' }] }, 'bad-request', 'HTTP 422'],
  ])('maps HTTP %i to %s', (status, body, kind, message) => {
    expect(jevHttpError(status, body)).toMatchObject({ kind, message, status });
  });
});
