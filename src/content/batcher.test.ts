import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentItem } from '../lib/messages';
import { Batcher } from './batcher';

const text = (id: string): ContentItem => ({ id, fields: { text: id } });
const withImages = (id: string, n: number): ContentItem => ({
  id,
  fields: { text: id },
  imageUrls: Array.from({ length: n }, (_, i) => `https://i.ytimg.com/vi/${id}${i}/mqdefault.jpg`),
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(isWanted: (id: string) => boolean = () => true) {
  const resolvers: (() => void)[] = [];
  const send = vi.fn((_items: ContentItem[]) => new Promise<void>((resolve) => resolvers.push(resolve)));
  const batcher = new Batcher({ send, isWanted });
  const ids = (call: number) => send.mock.calls[call]![0].map((i) => i.id);
  const finish = async (n = 1) => {
    for (let i = 0; i < n; i++) resolvers.shift()?.();
    await vi.runAllTimersAsync();
  };
  return { batcher, send, ids, finish };
}

describe('Batcher', () => {
  it('waits briefly, then sends items that arrived together in one request', async () => {
    const { batcher, send, ids } = setup();
    batcher.add(text('a'));
    batcher.add(text('b'));
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(send).toHaveBeenCalledTimes(1);
    expect(ids(0)).toEqual(['a', 'b']);
  });

  it('ignores duplicates while queued or in flight', async () => {
    const { batcher, send } = setup();
    batcher.add(text('a'));
    batcher.add(text('a'));
    await vi.advanceTimersByTimeAsync(100);
    batcher.add(text('a'));
    await vi.advanceTimersByTimeAsync(100);
    expect(send).toHaveBeenCalledTimes(1);
    expect(batcher.has('a')).toBe(true);
  });

  it('splits at 16 items per request', async () => {
    const { batcher, ids } = setup();
    for (let i = 0; i < 20; i++) batcher.add(text(`t${i}`));
    await vi.advanceTimersByTimeAsync(100);
    expect(ids(0)).toHaveLength(16);
    expect(ids(1)).toHaveLength(4);
  });

  it('splits at 4 images per request', async () => {
    const { batcher, ids } = setup();
    batcher.add(withImages('a', 1));
    batcher.add(withImages('b', 2));
    batcher.add(withImages('c', 2));
    batcher.add(text('d'));
    await vi.advanceTimersByTimeAsync(100);
    expect(ids(0)).toEqual(['a', 'b']);
    expect(ids(1)).toEqual(['c', 'd']);
  });

  it('keeps at most 3 requests in flight and continues when one finishes', async () => {
    const { batcher, send, finish } = setup();
    for (let i = 0; i < 5; i++) batcher.add(withImages(`i${i}`, 4));
    await vi.advanceTimersByTimeAsync(100);
    expect(send).toHaveBeenCalledTimes(3);
    await finish();
    expect(send).toHaveBeenCalledTimes(4);
  });

  it('drops items that are no longer wanted when their turn comes', async () => {
    const wanted = new Set(['keep']);
    const { batcher, ids } = setup((id) => wanted.has(id));
    batcher.add(text('keep'));
    batcher.add(text('scrolled-past'));
    await vi.advanceTimersByTimeAsync(100);
    expect(ids(0)).toEqual(['keep']);
    expect(batcher.has('scrolled-past')).toBe(false);
  });

  it('frees ids after a failed send so they can be retried', async () => {
    const send = vi.fn().mockRejectedValue(new Error('boom'));
    const batcher = new Batcher({ send, isWanted: () => true });
    batcher.add(text('a'));
    await vi.advanceTimersByTimeAsync(100);
    await vi.runAllTimersAsync();
    expect(batcher.has('a')).toBe(false);
  });

  it('clear() drops queued items', async () => {
    const { batcher, send } = setup();
    batcher.add(text('a'));
    batcher.clear();
    await vi.advanceTimersByTimeAsync(200);
    expect(send).not.toHaveBeenCalled();
  });
});
