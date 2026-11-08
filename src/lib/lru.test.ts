import { describe, expect, it } from 'vitest';
import { LruCache } from './lru';

describe('LruCache', () => {
  it('evicts the least recently used entry', () => {
    const lru = new LruCache<string, number>(2);
    lru.set('a', 1);
    lru.set('b', 2);
    expect(lru.get('a')).toBe(1); // a is now most recent
    lru.set('c', 3);
    expect(lru.has('b')).toBe(false);
    expect(lru.get('a')).toBe(1);
    expect(lru.get('c')).toBe(3);
    expect(lru.size).toBe(2);
  });

  it('updates existing keys without growing', () => {
    const lru = new LruCache<string, number>(2);
    lru.set('a', 1);
    lru.set('a', 2);
    expect(lru.size).toBe(1);
    expect(lru.get('a')).toBe(2);
  });

  it('rejects a zero size', () => {
    expect(() => new LruCache(0)).toThrow(RangeError);
  });
});
