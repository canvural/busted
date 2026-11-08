import { browser, defineBackground } from '#imports';
import { clearVerdicts, handleClassify } from '../lib/classify-handler';
import { describeError } from '../lib/errors';
import { type ClassifyResponse, isClassifyRequest, isClearCacheRequest } from '../lib/messages';
import { getSettings, updateSettings } from '../lib/settings';

async function updateBadge(response: ClassifyResponse): Promise<void> {
  if (response.ok) {
    await browser.action.setBadgeText({ text: '' });
    await browser.action.setTitle({ title: 'Busted!' });
  } else {
    await browser.action.setBadgeBackgroundColor({ color: '#d93025' });
    await browser.action.setBadgeText({ text: '!' });
    const { authMode } = await getSettings();
    await browser.action.setTitle({ title: `Busted! — ${describeError(response.error, authMode)}` });
  }
}

/**
 * Development builds only: pre-fill credentials from WXT_DEV_CLOUDFLARE_ACCOUNT_ID and
 * WXT_DEV_CLOUDFLARE_API_TOKEN, or WXT_DEV_JEV_API_KEY (which also switches to Jev),
 * set when building, so testing needs no typing. In production builds MODE is
 * "production" and this is removed; never set these variables for a build you share.
 */
async function seedDevCredentials(): Promise<void> {
  if (import.meta.env.MODE !== 'development') return;
  const accountId = import.meta.env.WXT_DEV_CLOUDFLARE_ACCOUNT_ID as string | undefined;
  const apiToken = import.meta.env.WXT_DEV_CLOUDFLARE_API_TOKEN as string | undefined;
  const jevApiKey = import.meta.env.WXT_DEV_JEV_API_KEY as string | undefined;
  const settings = await getSettings();
  if (accountId && apiToken && !settings.apiToken) await updateSettings({ accountId, apiToken });
  if (jevApiKey && !settings.jevApiKey) await updateSettings({ jevApiKey, authMode: 'jev' });
}

export default defineBackground(() => {
  // First run: open settings so the user can connect their Cloudflare account.
  browser.runtime.onInstalled.addListener(({ reason }) => {
    void seedDevCredentials();
    if (reason === 'install') void browser.runtime.openOptionsPage();
  });

  // Reply via sendResponse + `return true` rather than returning a Promise: older
  // Chrome versions drop Promise replies, this form works everywhere.
  browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (isClearCacheRequest(message)) {
      void clearVerdicts().then(() => sendResponse({ ok: true }));
      return true;
    }
    if (!isClassifyRequest(message)) return false;
    void handleClassify(message.items).then((response) => {
      sendResponse(response);
      void updateBadge(response);
    });
    return true;
  });
});
