<script lang="ts">
  import { browser } from '#imports';
  import { FREE_NEURONS_PER_DAY } from '../../lib/clef';
  import { describeError } from '../../lib/errors';
  import { getSettings, isConnected, judgeName, type Settings, updateSettings, watchSettings } from '../../lib/settings';
  import { type DailyStats, getLastError, getTodayStats, type LastError, watchLastError, watchStats } from '../../lib/stats';
  import Switch from '../../ui/Switch.svelte';
  import WantedLevel from '../../ui/WantedLevel.svelte';
  import { topic } from '../../topic';

  type Site = keyof Settings['sites'];
  const SITE_NAMES: Record<Site, string> = { youtube: 'YouTube', x: 'X' };

  let settings = $state<Settings | null>(null);
  let stats = $state<DailyStats | null>(null);
  let lastError = $state<LastError | null>(null);
  let site = $state<Site | null>(null);

  function siteOf(url: string | undefined): Site | null {
    if (!url) return null;
    const host = new URL(url).hostname;
    if (host === 'www.youtube.com') return 'youtube';
    if (host === 'x.com') return 'x';
    return null;
  }

  async function load(): Promise<void> {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    site = siteOf(tab?.url);
    [settings, stats, lastError] = await Promise.all([getSettings(), getTodayStats(), getLastError()]);
  }
  void load();
  watchSettings((s) => (settings = s));
  watchStats(() => void getTodayStats().then((s) => (stats = s)));
  watchLastError((e) => (lastError = e));

  const connected = $derived(settings !== null && isConnected(settings));
  const freeQuota = $derived(settings?.authMode === 'cloudflare');

  function openSettings(): void {
    void browser.runtime.openOptionsPage();
    window.close();
  }

  const number = (n: number) => Math.round(n).toLocaleString();
</script>

<main>
  <header>
    <span class="stamp" aria-hidden="true">BUSTED!</span>
    <h1 class="sr-only">Busted!</h1>
    {#if settings}
      <Switch label="Spoiler blocking" checked={settings.enabled} onchange={(enabled) => updateSettings({ enabled })} />
    {/if}
  </header>

  {#if settings}
    {#if !connected}
      <section class="notice">
        <p>Connect Busted! to Cloudflare or TypeSafe so it can check posts and videos for {topic.name} spoilers.</p>
        <button class="btn primary" type="button" onclick={openSettings}>Finish setup</button>
      </section>
    {:else if lastError}
      <section class="notice error" role="alert">
        <p>{describeError(lastError.kind, settings.authMode)}</p>
        {#if lastError.kind === 'auth'}
          <button class="btn" type="button" onclick={openSettings}>Open settings</button>
        {/if}
      </section>
    {/if}

    <section class="row" class:off={!settings.enabled}>
      {#if site}
        <span>Hide spoilers on {SITE_NAMES[site]}</span>
        <Switch
          label="Hide spoilers on {SITE_NAMES[site]}"
          checked={settings.sites[site]}
          disabled={!settings.enabled}
          onchange={(on) => updateSettings({ sites: { ...settings!.sites, [site!]: on } })}
        />
      {:else}
        <span class="muted">Busted! works on YouTube and X.</span>
      {/if}
    </section>

    {#if stats}
      <section class="today" class:off={!settings.enabled}>
        <p class="count"><span class="big">{number(stats.spoilers)}</span> spoiler{stats.spoilers === 1 ? '' : 's'} busted today</p>
        <p class="muted">{number(stats.checked)} posts and videos checked by {judgeName(settings)}</p>

        {#if freeQuota}
          <div class="quota">
            <WantedLevel used={stats.neurons} limit={FREE_NEURONS_PER_DAY} />
            <p class="muted small">
              {number(stats.neurons)} of {number(FREE_NEURONS_PER_DAY)} free Workers AI neurons used today. Resets at 00:00 UTC.
            </p>
          </div>
        {/if}
      </section>
    {/if}
  {/if}

  <footer>
    <button class="link" type="button" onclick={openSettings}>Settings</button>
    <span class="muted small">v{browser.runtime.getManifest().version}</span>
  </footer>
</main>

<style>
  main {
    width: 340px;
    padding: 16px;
    display: grid;
    gap: 14px;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .stamp {
    font: italic 900 26px/1 Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
    letter-spacing: 0.03em;
    color: var(--stamp);
    padding: 2px 8px;
    border: 2.5px solid currentColor;
    border-radius: 4px;
    transform: rotate(-5deg);
  }
  .notice {
    display: grid;
    gap: 10px;
    justify-items: start;
    padding: 12px;
    border-radius: var(--radius-sm);
    background: var(--surface);
    border: 1px solid var(--line);
  }
  .notice.error {
    border-color: var(--stamp);
    background: var(--stamp-soft);
  }
  .notice p {
    margin: 0;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-weight: 600;
  }
  .today {
    display: grid;
    gap: 2px;
  }
  .today p {
    margin: 0;
  }
  .count {
    font-stretch: 72%;
    font-weight: 700;
    font-size: 17px;
  }
  .big {
    font-size: 44px;
    font-weight: 800;
    line-height: 1;
    margin-right: 4px;
  }
  .quota {
    margin-top: 12px;
    display: grid;
    gap: 6px;
  }
  .small {
    font-size: 12px;
  }
  .off {
    opacity: 0.5;
  }
  footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 10px;
    border-top: 1px solid var(--line);
  }
  .link {
    background: none;
    border: 0;
    padding: 0;
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
    color: inherit;
  }
</style>
