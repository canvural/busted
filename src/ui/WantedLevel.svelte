<script lang="ts">
  // Today's share of the free Workers AI quota as a five-star wanted level.
  let { used, limit }: { used: number; limit: number } = $props();
  const stars = 5;
  const share = $derived(Math.min(used / limit, 1));
  // How full each star is, 0–1.
  const fills = $derived(Array.from({ length: stars }, (_, i) => Math.max(0, Math.min(1, share * stars - i))));
</script>

<div class="wanted" role="meter" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.round(used)} aria-label="Free Clef quota used today">
  {#each fills as fill, i (i)}
    <svg viewBox="0 0 24 24" class="star" aria-hidden="true">
      <defs>
        <clipPath id="star-fill-{i}"><rect x="0" y="0" width={24 * fill} height="24" /></clipPath>
      </defs>
      <path class="empty" d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" />
      <path class="full" clip-path="url(#star-fill-{i})" d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" />
    </svg>
  {/each}
</div>

<style>
  .wanted {
    display: flex;
    gap: 4px;
  }
  .star {
    width: 26px;
    height: 26px;
  }
  .empty {
    fill: none;
    stroke: var(--line);
    stroke-width: 1.6;
    stroke-linejoin: round;
  }
  .full {
    fill: var(--stamp);
    stroke: var(--stamp);
    stroke-width: 1.6;
    stroke-linejoin: round;
  }
</style>
