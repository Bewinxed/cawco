<script lang="ts">
  /**
   * A session's provider limit in the session details' stats strip, read
   * as the usage popover reads it: the limit's name, a 4px bar filled with
   * what is left (LimitBar `reads="left"`, its pace tick where an even pace
   * would leave you now), and "62% left", its figure in the figure face.
   * Resting on the bar says the pace in plain words; on an out-of-date
   * reading, how old it is instead.
   */
  import type { Meter } from "../usage";
  import LimitBar from "./LimitBar.svelte";
  import { fmt } from "./rings";

  /**
   * What resting on the bar says: the pace, or an out-of-date reading's age
   * in the dial tooltip's words (rings.ts `estimateOf`).
   */
  const PACE_WORDS = {
    left: (share: number) => `${share}% left`,
    even: (share: number, even: number) =>
      `${share}% left · an even pace would leave ${even}% by now`,
    lastReading: (share: number, age: number) =>
      `${share}% left · last reading ${fmt(age)} ago`,
  };

  let {
    label,
    meter,
    now,
    seenAt,
  }: {
    label: string;
    meter: Meter;
    /** The clock the meter was read against. */
    now: number;
    /** When the reading was last known to stand. */
    seenAt: number;
  } = $props();

  const left = $derived(
    Math.round(100 - Math.min(100, Math.max(0, meter.used)))
  );
  /** The pace, said: where an even pace would leave you by now. */
  const pace = $derived.by(() => {
    if (meter.state === "stale") {
      return PACE_WORDS.lastReading(left, now - seenAt);
    }
    return meter.elapsed === null || meter.state === "reached"
      ? PACE_WORDS.left(left)
      : PACE_WORDS.even(left, Math.round((1 - meter.elapsed) * 100));
  });
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
