/**
 * User settings, kept in `storage.sync` so they follow the user across browsers.
 * The API token is synced too, the same way Refined GitHub stores its token.
 */
import { storage } from '#imports';
import { topic } from '../topic';
import type { Auth } from './classify';
import type { ClefModel } from './clef';
import { JEV_MODEL, type JevModel } from './jev';

export interface Settings {
  enabled: boolean;
  sites: { youtube: boolean; x: boolean };
  /** Your Cloudflare account, a self-hosted proxy, or TypeSafe's Jev. */
  authMode: 'cloudflare' | 'endpoint' | 'jev';
  accountId: string;
  apiToken: string;
  endpointUrl: string;
  endpointSecret: string;
  /** TypeSafe API key, for the `jev` mode. */
  jevApiKey: string;
  /** The Clef model. Not used in the `jev` mode. */
  model: ClefModel;
  /** Minimum spoiler probability (0–1) that triggers the overlay. */
  sensitivity: number;
  /** Skip the keyword pre-filter and send everything to Clef. */
  strictMode: boolean;
  /** Send tweet images to Clef along with the text. */
  tweetImages: boolean;
  keywords: string[];
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  enabled: true,
  sites: { youtube: true, x: true },
  authMode: 'cloudflare',
  accountId: '',
  apiToken: '',
  endpointUrl: '',
  endpointSecret: '',
  jevApiKey: '',
  // clef scored 99% on the eval set vs 91% for clef-flash (eval/README.md).
  model: 'clef',
  sensitivity: 0.5,
  strictMode: false,
  tweetImages: true,
  keywords: [...topic.defaultKeywords],
});

const settingsItem = storage.defineItem<Partial<Settings>>('sync:settings', {
  fallback: {},
  version: 1,
});

/** Stored values over defaults, so fields added in later versions get their default. */
export function withDefaults(stored: Partial<Settings>): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    sites: { ...DEFAULT_SETTINGS.sites, ...stored.sites },
    keywords: [...(stored.keywords ?? DEFAULT_SETTINGS.keywords)],
  };
}

export async function getSettings(): Promise<Settings> {
  return withDefaults(await settingsItem.getValue());
}

/**
 * Stores only the fields the user has changed. Anything left unset keeps following
 * the defaults, so e.g. a new default keyword reaches users who never edited theirs.
 */
export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const stored = { ...(await settingsItem.getValue()), ...patch };
  await settingsItem.setValue(stored);
  return withDefaults(stored);
}

/** Forget the user's keyword edits so the list follows the defaults again. */
export async function resetKeywords(): Promise<Settings> {
  const { keywords: _dropped, ...rest } = await settingsItem.getValue();
  await settingsItem.setValue(rest);
  return withDefaults(rest);
}

export function watchSettings(callback: (settings: Settings) => void): () => void {
  return settingsItem.watch((stored) => callback(withDefaults(stored ?? {})));
}

export function authFromSettings(s: Settings): Auth {
  switch (s.authMode) {
    case 'endpoint':
      return { mode: 'endpoint', url: s.endpointUrl, secret: s.endpointSecret };
    case 'jev':
      return { mode: 'jev', apiKey: s.jevApiKey };
    default:
      return { mode: 'cloudflare', accountId: s.accountId, apiToken: s.apiToken };
  }
}

/** Whether the chosen mode has the credentials it needs. */
export function isConnected(s: Settings): boolean {
  switch (s.authMode) {
    case 'endpoint':
      return s.endpointUrl.trim() !== '';
    case 'jev':
      return s.jevApiKey.trim() !== '';
    default:
      return s.accountId.trim() !== '' && s.apiToken.trim() !== '';
  }
}

/** The model that judges items. Part of the verdict cache key, so Clef and Jev verdicts stay apart. */
export function activeModel(s: Settings): ClefModel | JevModel {
  return s.authMode === 'jev' ? JEV_MODEL : s.model;
}

/** The model's name as shown to the user. */
export function judgeName(s: Settings): 'Clef' | 'Jev' {
  return s.authMode === 'jev' ? 'Jev' : 'Clef';
}
