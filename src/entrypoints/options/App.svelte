<script lang="ts">
  import { browser } from '#imports';
  import { classify } from '../../lib/classify';
  import { ClefError, type ClefModel } from '../../lib/clef';
  import { checkToken, type TokenCheck } from '../../lib/cloudflare-token';
  import { describeError } from '../../lib/errors';
  import type { ClearCacheRequest } from '../../lib/messages';
  import {
    authFromSettings,
    getSettings,
    isConnected,
    judgeName,
    resetKeywords,
    type Settings,
    updateSettings,
  } from '../../lib/settings';
  import { topic } from '../../topic';
  import Switch from '../../ui/Switch.svelte';

  const SITE_ORIGINS = ['https://www.youtube.com/*', 'https://x.com/*'];
  const MODELS: { id: ClefModel; name: string; detail: string }[] = [
    { id: 'clef', name: 'Clef', detail: 'Most accurate: 99% on our spoiler tests. Covers about 2,500 checks a day on the free plan.' },
    { id: 'clef-flash', name: 'Clef Flash', detail: '6× cheaper, less accurate: 91% on the same tests. About 16,000 checks a day free.' },
  ];

  let settings = $state<Settings | null>(null);
  let keywordsText = $state('');
  let siteAccess = $state<boolean | null>(null);
  let tokenCheck = $state<TokenCheck | null>(null);
  let checkingToken = $state(false);
  let testResult = $state<{ ok: boolean; text: string } | null>(null);
  let testing = $state(false);
  let cacheCleared = $state(false);
  let savedAt = $state(0);

  const connected = $derived(settings !== null && isConnected(settings));
  const jev = $derived(settings?.authMode === 'jev');
  const judge = $derived(settings ? judgeName(settings) : 'Clef');

  async function load(): Promise<void> {
    settings = await getSettings();
    keywordsText = settings.keywords.join('\n');
    siteAccess = await browser.permissions.contains({ origins: SITE_ORIGINS });
    if (settings.apiToken) void verifyToken();
  }
  void load();

  async function save(patch: Partial<Settings>): Promise<void> {
    settings = await updateSettings(patch);
    savedAt = Date.now();
    testResult = null;
  }

  let tokenTimer: ReturnType<typeof setTimeout> | undefined;
  async function verifyToken(): Promise<void> {
    if (!settings?.apiToken.trim()) {
      tokenCheck = null;
      return;
    }
    checkingToken = true;
    tokenCheck = await checkToken(settings.apiToken, settings.accountId);
    checkingToken = false;
  }
  function onTokenInput(value: string): void {
    void save({ apiToken: value.trim() });
    clearTimeout(tokenTimer);
    tokenTimer = setTimeout(verifyToken, 600);
  }

  async function grantSiteAccess(): Promise<void> {
    siteAccess = await browser.permissions.request({ origins: SITE_ORIGINS });
  }

  async function saveEndpoint(url: string): Promise<void> {
    await save({ endpointUrl: url });
    try {
      // Custom endpoints are on user-chosen hosts, so access is asked for when saved.
      await browser.permissions.request({ origins: [`${new URL(url).origin}/*`] });
    } catch {
      // Not a valid URL yet; the connection test explains.
    }
  }

  async function testConnection(): Promise<void> {
    if (!settings) return;
    testing = true;
    testResult = null;
    try {
      const result = await classify(
        [
          { id: 'spoiler', fields: { text: 'jason really sold lucia out to the feds in chapter 5' } },
          { id: 'safe', fields: { text: 'GTA VI preloads open November 17' } },
        ],
        { auth: authFromSettings(settings), model: settings.model, topic },
      );
      const spoiler = Math.round(result.scores.get('spoiler')! * 100);
      const safe = Math.round(result.scores.get('safe')! * 100);
      testResult = { ok: true, text: `Connected. A sample spoiler scored ${spoiler}%, sample news scored ${safe}%.` };
    } catch (error) {
      testResult = { ok: false, text: error instanceof ClefError ? describeError(error.kind, settings.authMode) : String(error) };
    } finally {
      testing = false;
    }
  }

  function saveKeywords(): void {
    const keywords = keywordsText
      .split('\n')
      .map((k) => k.trim())
      .filter(Boolean);
    void save({ keywords });
  }

  async function restoreDefaultKeywords(): Promise<void> {
    settings = await resetKeywords();
    keywordsText = settings.keywords.join('\n');
  }

  async function clearCache(): Promise<void> {
    await browser.runtime.sendMessage({ type: 'clear-cache' } satisfies ClearCacheRequest);
    cacheCleared = true;
  }

  function tokenMessage(check: TokenCheck): string {
    switch (check.status) {
      case 'active':
        return check.expiresOn ? `Token is active. Expires ${new Date(check.expiresOn).toLocaleDateString()}.` : 'Token is active.';
      case 'inactive':
        return `Cloudflare says this token is ${check.detail}. Create a new one.`;
      case 'invalid':
        return "Cloudflare didn't accept this token. Check that it was copied in full.";
      case 'unreachable':
        return "Couldn't reach Cloudflare to check the token.";
    }
  }
</script>

<div class="page">
  <header>
    <span class="stamp" aria-hidden="true">BUSTED!</span>
    <div>
      <h1>Settings</h1>
      <p class="muted">Hides {topic.name} spoilers on YouTube and X. Changes save as you go.</p>
    </div>
    {#if savedAt}<span class="saved" aria-live="polite">{#key savedAt}Saved{/key}</span>{/if}
  </header>

  {#if settings}
    {#if siteAccess === false}
      <section class="alert">
        <p>Busted! can't see YouTube or X yet, so it can't hide anything there.</p>
        <button class="btn primary" type="button" onclick={grantSiteAccess}>Allow access to YouTube and X</button>
      </section>
    {/if}

    {#if !connected && settings.authMode === 'cloudflare'}
      <section class="setup">
        <h2>Connect your Cloudflare account</h2>
        <p>Busted! asks Cloudflare's Clef model whether a post or video spoils {topic.name}. It runs on your own free Cloudflare account.</p>
        <ol>
          <li>
            <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noreferrer">Open API tokens</a>
            in the Cloudflare dashboard, choose <em>Create Token</em>, and use the <em>Workers AI</em> template. A custom token with only <em>Workers AI Read</em> works too.
          </li>
          <li>Copy your account ID. It's the long code in the dashboard address, <code>dash.cloudflare.com/&lt;account ID&gt;</code>.</li>
          <li>Paste both below, then test the connection.</li>
        </ol>
      </section>
    {:else if !connected && jev}
      <section class="setup">
        <h2>Connect your TypeSafe account</h2>
        <p>Busted! asks TypeSafe's Jev model whether a post or video spoils {topic.name}. TypeSafe charges per use; checking a busy day of browsing costs a fraction of a cent.</p>
        <ol>
          <li>
            <a href="https://console.typesafe.ai/keys" target="_blank" rel="noreferrer">Open API keys</a>
            in the TypeSafe console and create a key.
          </li>
          <li>Paste it below, then test the connection.</li>
        </ol>
      </section>
    {/if}

    <section>
      <h2>Connection</h2>
      <div class="segmented" role="radiogroup" aria-label="Which AI checks for spoilers">
        <label class:active={settings.authMode === 'cloudflare'}>
          <input type="radio" name="mode" checked={settings.authMode === 'cloudflare'} onchange={() => save({ authMode: 'cloudflare' })} />
          My Cloudflare account
        </label>
        <label class:active={settings.authMode === 'endpoint'}>
          <input type="radio" name="mode" checked={settings.authMode === 'endpoint'} onchange={() => save({ authMode: 'endpoint' })} />
          Self-hosted endpoint
        </label>
        <label class:active={jev}>
          <input type="radio" name="mode" checked={jev} onchange={() => save({ authMode: 'jev' })} />
          TypeSafe Jev
        </label>
      </div>

      {#if settings.authMode === 'cloudflare'}
        <label class="field">
          <span>Account ID</span>
          <input class="mono" autocomplete="off" spellcheck="false" placeholder="32-character ID from the dashboard address" value={settings.accountId} onchange={(e) => save({ accountId: e.currentTarget.value.trim() })} />
        </label>
        <label class="field">
          <span>API token</span>
          <input class="mono" autocomplete="off" spellcheck="false" placeholder="Needs only the Workers AI Read permission" value={settings.apiToken} oninput={(e) => onTokenInput(e.currentTarget.value)} />
        </label>
        {#if checkingToken}
          <p class="status muted">Checking token…</p>
        {:else if tokenCheck}
          <p class="status" class:good={tokenCheck.status === 'active'} class:bad={tokenCheck.status !== 'active'}>{tokenMessage(tokenCheck)}</p>
        {/if}
      {:else if jev}
        <label class="field">
          <span>TypeSafe API key</span>
          <input class="mono" autocomplete="off" spellcheck="false" placeholder="From console.typesafe.ai/keys" value={settings.jevApiKey} onchange={(e) => save({ jevApiKey: e.currentTarget.value.trim() })} />
        </label>
        <p class="muted">Jev scored 98% on our spoiler tests (Clef: 99%) and costs about $1 per 150,000 checks. It checks text only: titles, channel names, post text and image descriptions. It doesn't accept images as small as YouTube thumbnails.</p>
      {:else}
        <p class="muted">For a Busted! proxy Worker you or a friend deployed. See the <a href="https://github.com/canvural/busted#share-your-quota-with-friends-optional" target="_blank" rel="noreferrer">project's README</a> for the one-click deploy.</p>
        <label class="field">
          <span>Endpoint URL</span>
          <input class="mono" autocomplete="off" spellcheck="false" placeholder="https://busted-proxy.example.workers.dev" value={settings.endpointUrl} onchange={(e) => saveEndpoint(e.currentTarget.value.trim())} />
        </label>
        <label class="field">
          <span>Shared secret</span>
          <input class="mono" autocomplete="off" spellcheck="false" value={settings.endpointSecret} onchange={(e) => save({ endpointSecret: e.currentTarget.value.trim() })} />
        </label>
      {/if}

      <div class="actions">
        <button class="btn primary" type="button" onclick={testConnection} disabled={testing || !connected}>{testing ? 'Testing…' : 'Test connection'}</button>
        {#if testResult}<p class="status" class:good={testResult.ok} class:bad={!testResult.ok} role="status">{testResult.text}</p>{/if}
      </div>
    </section>

    {#if !jev}
      <section>
        <h2>Model</h2>
        <div class="models" role="radiogroup" aria-label="Clef model">
          {#each MODELS as model (model.id)}
            <label class="model" class:active={settings.model === model.id}>
              <input type="radio" name="model" checked={settings.model === model.id} onchange={() => save({ model: model.id })} />
              <strong>{model.name}</strong>
              <span class="muted">{model.detail}</span>
            </label>
          {/each}
        </div>
      </section>
    {/if}

    <section>
      <h2>Blocking</h2>
      <div class="toggles">
        <div class="toggle"><span>Spoiler blocking</span><Switch label="Spoiler blocking" checked={settings.enabled} onchange={(enabled) => save({ enabled })} /></div>
        <div class="toggle"><span>YouTube</span><Switch label="YouTube" checked={settings.sites.youtube} onchange={(youtube) => save({ sites: { ...settings!.sites, youtube } })} /></div>
        <div class="toggle"><span>X</span><Switch label="X" checked={settings.sites.x} onchange={(x) => save({ sites: { ...settings!.sites, x } })} /></div>
        <div class="toggle">
          <span>Check images in X posts<small class="muted">{jev ? 'Not used with Jev, which checks text only.' : 'Up to 2 images per post are sent along with the text.'}</small></span>
          <Switch label="Check images in X posts" checked={settings.tweetImages} onchange={(tweetImages) => save({ tweetImages })} />
        </div>
        <div class="toggle">
          <span>Strict mode<small class="muted">Checks every post and video, not just ones that mention a keyword. Uses far more quota.</small></span>
          <Switch label="Strict mode" checked={settings.strictMode} onchange={(strictMode) => save({ strictMode })} />
        </div>
      </div>

      <label class="field slider">
        <span>Blur when {judge} is at least <strong>{Math.round(settings.sensitivity * 100)}%</strong> sure it's a spoiler</span>
        <input type="range" min="0.2" max="0.9" step="0.05" value={settings.sensitivity} oninput={(e) => (settings!.sensitivity = Number(e.currentTarget.value))} onchange={(e) => save({ sensitivity: Number(e.currentTarget.value) })} />
        <span class="ends muted"><span>More blurs</span><span>Fewer blurs</span></span>
      </label>
    </section>

    <section>
      <h2>Keywords</h2>
      <p class="muted">Only posts and videos that mention one of these are sent to {judge}. One per line. Matching ignores case and accents.</p>
      <textarea class="mono" rows="9" spellcheck="false" bind:value={keywordsText} onchange={saveKeywords}></textarea>
      <div class="actions"><button class="btn" type="button" onclick={restoreDefaultKeywords}>Restore default keywords</button></div>
    </section>

    <section>
      <h2>Privacy and data</h2>
      {#if jev}
        <p>Busted! sends the text of keyword-matching posts and videos to TypeSafe, using the API key above. Nothing else leaves your browser, and there's no tracking.</p>
      {:else}
        <p>Busted! sends the text, and for YouTube the thumbnail, of keyword-matching posts and videos to the Cloudflare account above. Nothing else leaves your browser, and there's no tracking.</p>
      {/if}
      <p class="muted">Verdicts are kept on this device for up to 30 days so the same video isn't checked twice.</p>
      <div class="actions">
        <button class="btn" type="button" onclick={clearCache}>Clear saved verdicts</button>
        {#if cacheCleared}<p class="status good" role="status">Cleared. Pages you open from now on are checked again.</p>{/if}
      </div>
    </section>
  {:else}
    <p class="muted">Loading…</p>
  {/if}
</div>

<style>
  .page {
    max-width: 640px;
    margin: 0 auto;
    padding: 40px 20px 80px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 20px;
    margin-bottom: 28px;
  }
  header h1 {
    font-size: 34px;
  }
  header p {
    margin: 4px 0 0;
  }
  .stamp {
    flex: none;
    font: italic 900 30px/1 Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
    letter-spacing: 0.03em;
    color: var(--stamp);
    padding: 4px 10px;
    border: 3px solid currentColor;
    border-radius: 5px;
    transform: rotate(-6deg);
  }
  .saved {
    margin-left: auto;
    font-size: 12px;
    font-weight: 600;
    color: var(--teal);
    animation: fade 1.6s forwards;
  }
  @keyframes fade {
    0%,
    60% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }
  section {
    padding: 22px 0;
    border-top: 1px solid var(--line);
    display: grid;
    gap: 12px;
  }
  section > p {
    margin: 0;
    max-width: 62ch;
  }
  h2 {
    font-size: 21px;
  }
  .alert,
  .setup {
    border: 0;
    padding: 18px 20px;
    border-radius: var(--radius);
    margin-bottom: 18px;
  }
  .alert {
    background: var(--stamp-soft);
  }
  .setup {
    background: var(--surface);
    box-shadow: inset 4px 0 0 var(--stamp);
  }
  .setup ol {
    margin: 0;
    padding-left: 22px;
    display: grid;
    gap: 6px;
    max-width: 62ch;
  }
  code {
    font-size: 12.5px;
    padding: 1px 4px;
    border-radius: 4px;
    background: var(--paper);
  }
  .segmented {
    display: inline-flex;
    justify-self: start;
    padding: 3px;
    border-radius: var(--radius-sm);
    background: var(--surface);
    border: 1px solid var(--line);
  }
  .segmented label {
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
  }
  .segmented label.active {
    background: var(--ink);
    color: var(--paper);
  }
  .segmented input,
  .model input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .segmented label:has(input:focus-visible),
  .model:has(input:focus-visible) {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
  .field {
    display: grid;
    gap: 6px;
    font-weight: 600;
  }
  .field input:not([type='range']),
  textarea {
    width: 100%;
    padding: 9px 11px;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-weight: 400;
  }
  .mono {
    font-family: ui-monospace, 'Cascadia Mono', Menlo, monospace;
    font-size: 13px;
  }
  .status {
    margin: 0;
    font-weight: 600;
  }
  .good {
    color: var(--teal);
  }
  .bad {
    color: var(--stamp);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
  }
  .models {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .model {
    position: relative;
    display: grid;
    gap: 4px;
    align-content: start;
    padding: 14px;
    border: 1.5px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
    cursor: pointer;
  }
  .model strong {
    font-stretch: 72%;
    font-size: 17px;
  }
  .model .muted {
    font-size: 13px;
  }
  .model.active {
    border-color: var(--ink);
    box-shadow: inset 0 0 0 1px var(--ink);
  }
  .toggles {
    display: grid;
  }
  .toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    padding: 10px 0;
    font-weight: 600;
  }
  .toggle + .toggle {
    border-top: 1px dashed var(--line);
  }
  .toggle small {
    display: block;
    font-weight: 400;
    font-size: 13px;
  }
  .slider input {
    width: 100%;
    accent-color: var(--stamp);
  }
  .slider span:first-child {
    font-weight: 400;
  }
  .ends {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    font-weight: 400;
  }
  @media (max-width: 560px) {
    .models {
      grid-template-columns: 1fr;
    }
    header {
      flex-wrap: wrap;
    }
  }
</style>
