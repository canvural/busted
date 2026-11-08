import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { topic } from '../topic';
import { JEV_MODEL } from './jev';
import {
  activeModel,
  authFromSettings,
  DEFAULT_SETTINGS,
  getSettings,
  isConnected,
  judgeName,
  resetKeywords,
  updateSettings,
  watchSettings,
  withDefaults,
} from './settings';

beforeEach(() => {
  fakeBrowser.reset();
});

describe('settings', () => {
  it('returns defaults when nothing is stored', async () => {
    const s = await getSettings();
    expect(s).toEqual(DEFAULT_SETTINGS);
    expect(s.model).toBe('clef');
    expect(s.keywords).toEqual(topic.defaultKeywords);
  });

  it('persists updates in sync storage and keeps other fields', async () => {
    await updateSettings({ apiToken: 'tok', sites: { youtube: false, x: true } });
    await updateSettings({ sensitivity: 0.7 });

    const s = await getSettings();
    expect(s).toMatchObject({ apiToken: 'tok', sensitivity: 0.7, sites: { youtube: false, x: true } });
    expect(await fakeBrowser.storage.sync.get('settings')).toHaveProperty('settings.apiToken', 'tok');
  });

  it('stores only changed fields, so untouched ones keep following the defaults', async () => {
    await updateSettings({ apiToken: 'tok' });
    const { settings: stored } = (await fakeBrowser.storage.sync.get('settings')) as { settings: object };
    expect(stored).toEqual({ apiToken: 'tok' });
    expect((await getSettings()).keywords).toEqual(topic.defaultKeywords);
  });

  it('resetKeywords() makes the list follow the defaults again', async () => {
    await updateSettings({ keywords: ['only this'], apiToken: 'tok' });
    const s = await resetKeywords();
    expect(s.keywords).toEqual(topic.defaultKeywords);
    expect(s.apiToken).toBe('tok');
  });

  it('fills in fields that older stored settings lack', () => {
    const s = withDefaults({ apiToken: 'tok', sites: { youtube: false } as never });
    expect(s.sites).toEqual({ youtube: false, x: true });
    expect(s.tweetImages).toBe(true);
  });

  it('does not share the default keyword array between results', () => {
    const a = withDefaults({});
    a.keywords.push('mutated');
    expect(withDefaults({}).keywords).not.toContain('mutated');
  });

  it('notifies watchers with merged settings', async () => {
    const cb = vi.fn();
    const unwatch = watchSettings(cb);
    await updateSettings({ enabled: false });
    expect(cb).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false, model: 'clef' }));
    unwatch();
  });

  it('builds Clef auth for either mode', () => {
    expect(authFromSettings(withDefaults({ accountId: 'a', apiToken: 't' }))).toEqual({
      mode: 'cloudflare',
      accountId: 'a',
      apiToken: 't',
    });
    expect(
      authFromSettings(withDefaults({ authMode: 'endpoint', endpointUrl: 'https://p.dev', endpointSecret: 's' })),
    ).toEqual({ mode: 'endpoint', url: 'https://p.dev', secret: 's' });
    expect(authFromSettings(withDefaults({ authMode: 'jev', jevApiKey: 'k', apiToken: 't' }))).toEqual({ mode: 'jev', apiKey: 'k' });
  });

  it('checks the credentials of the chosen mode only', () => {
    expect(isConnected(withDefaults({ accountId: 'a', apiToken: 't' }))).toBe(true);
    expect(isConnected(withDefaults({ accountId: 'a' }))).toBe(false);
    expect(isConnected(withDefaults({ authMode: 'endpoint', endpointUrl: 'https://p.dev' }))).toBe(true);
    expect(isConnected(withDefaults({ authMode: 'jev', accountId: 'a', apiToken: 't' }))).toBe(false);
    expect(isConnected(withDefaults({ authMode: 'jev', jevApiKey: 'k' }))).toBe(true);
  });

  it('uses Jev as the model in Jev mode, whatever Clef model is chosen', () => {
    expect(activeModel(withDefaults({ model: 'clef-flash' }))).toBe('clef-flash');
    expect(activeModel(withDefaults({ authMode: 'jev', model: 'clef-flash' }))).toBe(JEV_MODEL);
    expect(judgeName(withDefaults({ authMode: 'jev' }))).toBe('Jev');
    expect(judgeName(withDefaults({ authMode: 'endpoint' }))).toBe('Clef');
  });
});
