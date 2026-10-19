<script lang="ts">
  /**
   * A fact file's last 14 days of briefs (report 2 §1): fourteen 2px bars
   * at a 1px pitch, one per day, the oldest first, each as tall as that
   * day's brief count against the busiest day; muted ink. A day no brief
   * used it stands as the baseline, so a file nothing used in 14 days is a
   * flat line: the archive's candidate, drawn. The last use and the count
   * are its hover.
   */
  import { memoryViewWords as words } from "@cawco/core";

  let {
    uses,
    last,
  }: {
    /** Briefs per day, the oldest of 14 first. */
    uses: number[];
    /** The last use, as the row says times; null when none in its days. */
    last: string | null;
  } = $props();

  const peak = $derived(Math.max(1, ...uses));
  const total = $derived(uses.reduce((sum, day) => sum + day, 0));
  const said = $derived(words.usedHover(total, total > 0 ? last : null));
</script>

<span
  data-slot="use-spark"
  class="spark"
  aria-label={said}
  role="img"
  title={said}
>
  {#each uses as day, index (index)}
    <span
      class="bar"
      data-used={day > 0 ? "" : undefined}
      style:--day={day / peak}
    ></span>
  {/each}
</span>

<style>
  .spark {
    display: inline-flex;
    flex: none;
    align-items: flex-end;
    gap: var(--c-memory-spark-gap);
    block-size: var(--c-memory-spark-h);
    vertical-align: middle;
  }
  .bar {
    flex: none;
    inline-size: var(--c-memory-spark-bar);
    block-size: var(--c-memory-spark-gap);
    border-radius: var(--radius-hair) var(--radius-hair) 0 0;
    background: var(--ink-subtle);
  }
  /* A day a brief used it: its share of the busiest day, never under the bar's width. */
  .bar[data-used] {
    block-size: max(
      var(--c-memory-spark-bar),
      calc(var(--c-memory-spark-h) * var(--day, 0))
    );
    background: var(--ink-muted);
  }
</style>
