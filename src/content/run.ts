import { browser } from '#imports';
import type { ClassifyRequest, ClassifyResponse } from '../lib/messages';
import { getSettings, watchSettings } from '../lib/settings';
import { topic } from '../topic';
import type { SiteAdapter } from './adapter';
import { startScanner } from './scanner';

/** Starts spoiler blocking on the current page and stops it when the extension reloads. */
export async function runOnPage(adapter: SiteAdapter, ctx: { onInvalidated(cb: () => void): void }): Promise<void> {
  const scanner = await startScanner({
    adapter,
    topicName: topic.name,
    classify: (items) => browser.runtime.sendMessage({ type: 'classify', items } satisfies ClassifyRequest) as Promise<ClassifyResponse>,
    isExtensionAlive: () => browser.runtime?.id !== undefined,
    getSettings,
    watchSettings,
  });
  ctx.onInvalidated(() => scanner.stop());
}
