<script lang="ts">
  /**
   * A page's origin as a browser ask shows it (the transcript's card, the
   * Needs you row): whole, never cut, and broken only after a dot. Each
   * dot-separated label holds together (`whitespace-nowrap`), so a hyphen
   * inside a label is no break; the break comes after each dot (`<wbr>`).
   * A single label wider than the whole line still wraps, by the
   * container's `overflow-wrap: break-word`, the browser's last resort.
   */
  let { origin }: { origin: string } = $props();

  const labels = $derived(
    origin.split(".").map((label, at, all) => ({
      text: at < all.length - 1 ? `${label}.` : label,
      last: at === all.length - 1,
    }))
  );
</script>

{#each labels as label, at (at)}<span
    data-origin-label
    class="whitespace-nowrap">{label.text}</span
  >{#if !label.last}<wbr />{/if}{/each}
