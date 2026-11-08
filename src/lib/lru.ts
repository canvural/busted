/** Small least-recently-used map with a fixed size, so caches can't grow without bound. */
export class LruCache<K, V> {
  readonly #max: number;
  readonly #map = new Map<K, V>();

  constructor(max: number) {
    if (max < 1) throw new RangeError('LRU size must be at least 1');
    this.#max = max;
  }

  get size(): number {
    return this.#map.size;
  }

  get(key: K): V | undefined {
    const value = this.#map.get(key);
    if (value !== undefined) {
      // Re-insert to mark as most recently used.
      this.#map.delete(key);
      this.#map.set(key, value);
    }
    return value;
  }

  has(key: K): boolean {
    return this.#map.has(key);
  }

  set(key: K, value: V): void {
    this.#map.delete(key);
    this.#map.set(key, value);
    if (this.#map.size > this.#max) {
      const oldest = this.#map.keys().next();
      if (!oldest.done) this.#map.delete(oldest.value);
    }
  }

  clear(): void {
    this.#map.clear();
  }
}
