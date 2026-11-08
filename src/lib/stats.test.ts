import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { getLastError, getTodayStats, recordUsage, setLastError, utcDay } from './stats';

const DAY1 = Date.UTC(2026, 10, 19, 23, 0);
const DAY2 = Date.UTC(2026, 10, 20, 0, 30);

beforeEach(() => fakeBrowser.reset());

describe('stats', () => {
  it('starts at zero', async () => {
    expect(await getTodayStats(DAY1)).toEqual({ day: '2026-11-19', checked: 0, spoilers: 0, inputTokens: 0, neurons: 0 });
  });

  it('adds up usage and estimates neurons per model', async () => {
    await recordUsage({ checked: 16, spoilers: 3, inputTokens: 1_000_000, model: 'clef' }, DAY1);
    const s = await recordUsage({ checked: 4, spoilers: 1, inputTokens: 1_000_000, model: 'clef-flash' }, DAY1);
    expect(s).toEqual({ day: '2026-11-19', checked: 20, spoilers: 4, inputTokens: 2_000_000, neurons: 21_818 + 3_455 });
  });

  it('counts no Workers AI neurons for Jev', async () => {
    const s = await recordUsage({ checked: 16, spoilers: 3, inputTokens: 1_000_000, model: 'jev-1.14.0' }, DAY1);
    expect(s).toMatchObject({ inputTokens: 1_000_000, neurons: 0 });
  });

  it('starts a new day at 00:00 UTC', async () => {
    await recordUsage({ checked: 5, spoilers: 1, inputTokens: 100, model: 'clef' }, DAY1);
    expect((await getTodayStats(DAY2)).checked).toBe(0);
    expect(utcDay(DAY2)).toBe('2026-11-20');
  });

  it('remembers and clears the last error', async () => {
    await setLastError({ kind: 'quota', message: 'used up', at: DAY1 });
    expect(await getLastError()).toMatchObject({ kind: 'quota' });
    await setLastError(null);
    expect(await getLastError()).toBeNull();
  });
});
