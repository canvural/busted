import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { openVerdictStore } from './verdict-store';

function store(options: Parameters<typeof openVerdictStore>[0] = {}) {
  return openVerdictStore({ indexedDB: new IDBFactory(), ...options });
}

describe('verdict store', () => {
  it('stores and reads back scores', async () => {
    const s = store();
    await s.putMany([
      ['a', 0.9],
      ['b', 0.1],
    ]);
    expect(await s.getMany(['a', 'b', 'missing'])).toEqual(
      new Map([
        ['a', 0.9],
        ['b', 0.1],
      ]),
    );
  });

  it('ignores and prunes entries older than the max age', async () => {
    let t = 1_000;
    const factory = new IDBFactory();
    const s = openVerdictStore({ indexedDB: factory, maxAgeMs: 100, now: () => t });
    await s.putMany([['old', 0.9]]);
    t = 1_200;
    expect(await s.getMany(['old'])).toEqual(new Map());
    await s.putMany([['new', 0.5]]); // triggers pruning
    const fresh = openVerdictStore({ indexedDB: factory, maxAgeMs: 10_000, now: () => t });
    expect(await fresh.getMany(['old', 'new'])).toEqual(new Map([['new', 0.5]]));
  });

  it('evicts the oldest entries above the cap', async () => {
    let t = 0;
    const s = store({ maxEntries: 3, now: () => ++t });
    for (const key of ['a', 'b', 'c', 'd', 'e']) await s.putMany([[key, 0.5]]);
    expect([...(await s.getMany(['a', 'b', 'c', 'd', 'e'])).keys()]).toEqual(['c', 'd', 'e']);
  });

  it('clears everything', async () => {
    const s = store();
    await s.putMany([['a', 0.9]]);
    await s.clear();
    expect(await s.getMany(['a'])).toEqual(new Map());
  });
});
