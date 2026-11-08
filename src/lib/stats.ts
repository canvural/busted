/** Today's usage and the last error, shown in the popup. Days follow UTC, like Cloudflare's free quota. */
import { storage } from '#imports';
import { type ClefErrorKind, type ClefModel, NEURONS_PER_MILLION_TOKENS } from './clef';
import type { JevModel } from './jev';

export interface DailyStats {
  /** UTC date, e.g. "2026-10-30". */
  day: string;
  /** Items sent to Clef (cache hits not counted). */
  checked: number;
  /** Of those, how many scored at or above the sensitivity. */
  spoilers: number;
  inputTokens: number;
  /** Estimated Workers AI neurons used. Jev requests add none. */
  neurons: number;
}

export interface LastError {
  kind: ClefErrorKind;
  message: string;
  at: number;
}

const statsItem = storage.defineItem<DailyStats | null>('local:stats', { fallback: null });
const lastErrorItem = storage.defineItem<LastError | null>('local:lastError', { fallback: null });

export const utcDay = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

const empty = (day: string): DailyStats => ({ day, checked: 0, spoilers: 0, inputTokens: 0, neurons: 0 });

export async function getTodayStats(now = Date.now()): Promise<DailyStats> {
  const stored = await statsItem.getValue();
  const day = utcDay(now);
  return stored?.day === day ? stored : empty(day);
}

const neuronRate = (model: ClefModel | JevModel) => (model in NEURONS_PER_MILLION_TOKENS ? NEURONS_PER_MILLION_TOKENS[model as ClefModel] : 0);

export async function recordUsage(
  usage: { checked: number; spoilers: number; inputTokens: number; model: ClefModel | JevModel },
  now = Date.now(),
): Promise<DailyStats> {
  const today = await getTodayStats(now);
  const next: DailyStats = {
    ...today,
    checked: today.checked + usage.checked,
    spoilers: today.spoilers + usage.spoilers,
    inputTokens: today.inputTokens + usage.inputTokens,
    neurons: today.neurons + (usage.inputTokens * neuronRate(usage.model)) / 1_000_000,
  };
  await statsItem.setValue(next);
  return next;
}

export const getLastError = () => lastErrorItem.getValue();
export const setLastError = (error: LastError | null) => lastErrorItem.setValue(error);
export const watchStats = (cb: (stats: DailyStats | null) => void) => statsItem.watch(cb);
export const watchLastError = (cb: (error: LastError | null) => void) => lastErrorItem.watch(cb);
