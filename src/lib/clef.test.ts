import { describe, expect, it } from 'vitest';
import { topic } from '../topic';
import {
  buildClefRequest,
  ClefError,
  type ClefAuth,
  type ClefItem,
  clefUrl,
  MAX_TEXT_ITEMS_PER_REQUEST,
  parseClefResponse,
} from './clef';

const items: ClefItem[] = [
  { id: 'yt:abc', fields: { title: "Lucia's FATE Will Shock You", channel: 'LoreDrop' } },
  { id: 'x:123', fields: { text: 'GTA 6 preloads open November 17', alt: [] } },
];

const cloudflare: ClefAuth = { mode: 'cloudflare', accountId: 'acc123', apiToken: 'tok' };

const okBody = {
  success: true,
  errors: [],
  result: {
    model: 'clef-flash',
    answers: { item_1: { type: 'noul', noul: 0.9 }, item_2: { type: 'noul', noul: 0.02 } },
    usage: { input_tokens: 281, output_tokens: 0 },
  },
};

describe('buildClefRequest', () => {
  it('puts shared context in state once and asks one yes/no question per item', () => {
    const { body, questionToItem } = buildClefRequest(items, 'clef-flash', topic);

    expect(body.model).toBe('clef-flash');
    expect(body.state.context.spoiler_definition).toBe(topic.spoilerDefinition);
    expect(body.state.context.glossary['Lucia Caminos']).toBeDefined();
    expect(body.state.items).toEqual({ item_1: items[0]!.fields, item_2: items[1]!.fields });
    expect(Object.keys(body.questions)).toEqual(['item_1', 'item_2']);
    expect(body.questions.item_1).toMatchObject({ type: 'noul' });
    expect(body.questions.item_1!.instructions).toContain('items.item_1');
    expect([...questionToItem]).toEqual([
      ['item_1', 'yt:abc'],
      ['item_2', 'x:123'],
    ]);
  });

  it('tells Clef to treat the post a reply answers as context only', () => {
    const reply: ClefItem = { id: 'x:2:re:1', fields: { text: 'he dies??', replying_to: 'GTA 6 ending leaked' } };
    const { body } = buildClefRequest([reply, items[1]!], 'clef', topic);
    expect(body.state.items.item_1).toEqual(reply.fields);
    expect(body.questions.item_1!.instructions).toContain('replying_to');
    expect(body.questions.item_2!.instructions).not.toContain('replying_to');
  });

  it('uses question ids made only of characters Clef allows', () => {
    const { body } = buildClefRequest(items, 'clef', topic);
    for (const qid of Object.keys(body.questions)) expect(qid).toMatch(/^[A-Za-z0-9_.-]{1,100}$/);
  });

  it('attaches images once and points each item at its own image numbers', () => {
    const withImages: ClefItem[] = [
      { id: 'a', fields: { title: 'one' }, images: ['data:image/jpeg;base64,AAA'] },
      { id: 'b', fields: { text: 'no image' } },
      { id: 'c', fields: { text: 'two' }, images: ['data:image/jpeg;base64,BBB', 'data:image/jpeg;base64,CCC'] },
    ];
    const { body } = buildClefRequest(withImages, 'clef-flash', topic);
    expect(body.images).toEqual(['data:image/jpeg;base64,AAA', 'data:image/jpeg;base64,BBB', 'data:image/jpeg;base64,CCC']);
    expect(body.state.items.item_1).toEqual({ title: 'one', attached_images: [1] });
    expect(body.state.items.item_2).toEqual({ text: 'no image' });
    expect(body.state.items.item_3).toEqual({ text: 'two', attached_images: [2, 3] });
  });

  it('omits the images list when no item has images', () => {
    expect(buildClefRequest(items, 'clef', topic).body).not.toHaveProperty('images');
  });

  it('rejects more than 4 images per request', () => {
    const five = Array.from({ length: 5 }, (_, i) => ({ id: `${i}`, fields: {}, images: ['data:image/jpeg;base64,A'] }));
    expect(() => buildClefRequest(five, 'clef', topic)).toThrow(RangeError);
  });

  it('rejects empty and oversized batches', () => {
    expect(() => buildClefRequest([], 'clef', topic)).toThrow(RangeError);
    const many = Array.from({ length: MAX_TEXT_ITEMS_PER_REQUEST + 1 }, (_, i) => ({ id: `${i}`, fields: {} }));
    expect(() => buildClefRequest(many, 'clef', topic)).toThrow(RangeError);
  });
});

describe('parseClefResponse', () => {
  const { questionToItem } = buildClefRequest(items, 'clef-flash', topic);

  it('maps answers back to item ids', () => {
    const result = parseClefResponse(okBody, questionToItem);
    expect(result.scores.get('yt:abc')).toBe(0.9);
    expect(result.scores.get('x:123')).toBe(0.02);
    expect(result.inputTokens).toBe(281);
  });

  it.each([
    ['no result', { success: true }],
    ['missing answer', { result: { answers: { item_1: { noul: 0.5 } } } }],
    ['non-number', { result: { answers: { item_1: { noul: '0.5' }, item_2: { noul: 0.1 } } } }],
    ['out of range', { result: { answers: { item_1: { noul: 1.5 }, item_2: { noul: 0.1 } } } }],
    ['null', null],
  ])('rejects %s', (_, body) => {
    expect(() => parseClefResponse(body, questionToItem)).toThrow(ClefError);
  });
});

describe('clefUrl', () => {
  it('builds the Workers AI REST URL for your own account', () => {
    expect(clefUrl(cloudflare, 'clef-flash')).toBe(
      'https://api.cloudflare.com/client/v4/accounts/acc123/ai/run/@cf/cloudflare/clef-flash',
    );
  });

  it('uses the custom endpoint as-is', () => {
    expect(clefUrl({ mode: 'endpoint', url: 'https://proxy.example.dev/', secret: 's' }, 'clef')).toBe(
      'https://proxy.example.dev/',
    );
  });
});
