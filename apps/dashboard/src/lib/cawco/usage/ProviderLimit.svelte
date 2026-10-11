<script lang="ts">
  /**
   * A session's provider limit in the session details' stats strip, read
   * as the usage popover reads it: the limit's name, a 4px bar filled with
   * what is left (LimitBar `reads="left"`, its pace tick where an even pace
   * would leave you now), and "62% left", its figure in the figure face.
   * Resting on the bar says the pace in plain words.
   */
  import type { Meter } from "../usage";
  import LimitBar from "./LimitBar.svelte";

  let { label, meter }: { label: string; meter: Meter } = $props();

  const left = $derived(
    Math.round(100 - Math.min(100, Math.max(0, meter.used)))
  );
  /** The pace, said: where an even pace would leave you by now. */
  const pace = $derived(
    meter.elapsed === null || meter.state === "reached"
      ? `${left}% left`
      : `${left}% left · an even pace would leave ${Math.round((1 - meter.elapsed) * 100)}% by now`
  );
</script>

<div class="limit" data-provider-limit>
  <span class="stat-label">{label}</span>
  <span class="stat-bar" title={pace}>
    <LimitBar
      elapsed={meter.elapsed}
      {label}
      reads="left"
      size={4}
      state={meter.state}
      used={meter.used}
    />
  </span>
  <span class="stat-figure" data-limit-left
    ><span class="mono-figure">{left}%</span>
    left</span
  >
</div>

<style>
  /* One unit of the strip, sized by its content: a word, the bar, the
     figure; the bar's pace gap shows the strip's own surface. */
  .limit {
    --row-paint: var(--surface-raised);
    display: flex;
    flex: none;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-2);
  }
  .stat-label,
  .stat-figure {
    flex: none;
    white-space: nowrap;
  }
  .stat-label {
    color: var(--ink-muted);
  }
  .stat-bar {
    flex: none;
    width: 64px;
  }
</style>
