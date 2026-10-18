<script lang="ts">
  /**
   * Files, the item the bar's glass group (BarGroup) leads with: the folder
   * as the group's `.bar-symbol`, its tip and its name, and its count in
   * one of two takes (`count`), neither ever on the folder's ink:
   * - `beside`: the house's item with its number (BarGroup's recipe, the
   *   machines' "2"): the number in the label role, beside the folder;
   * - `mark`: the count in vermillion, the work tab's count (a solid fill,
   *   its numeral's ink, `radius-xs`, tabular figures) in the chosen chip's
   *   vermillion and white, at the caps role, standing at the item's top
   *   beside the folder, clear of its ink.
   */
  import { mergeProps } from "bits-ui";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconToolFiles } from "#lib/icons.js";
  import type { Count } from "./fixtures";

  let {
    count,
    take,
    open = false,
    onfiles,
  }: {
    count: number;
    take: Count;
    /** Files' card or sheet is asked open. */
    open?: boolean;
    /** Files pressed. */
    onfiles?: () => void;
  } = $props();

  const label = $derived(count > 0 ? `Files, ${count}` : "Files");
</script>

<Tip {label}>
  {#snippet children(tip)}
    <button
      data-bar-item
      {...mergeProps(tip, { onclick: () => onfiles?.() })}
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-label={label}
      class="bar-item files mark-line touch-hit press-tint"
      data-files-control
      data-take={take}
      type="button"
    >
      <IconToolFiles aria-hidden="true" class="bar-symbol" />
      {#if count > 0}
        <span
          data-slot="num"
          class={["num", take === "mark" && "count-mark"]}
          data-box={take === "mark" || undefined}
          data-count-mark={take === "mark" || undefined}>{count}</span
        >
      {/if}
    </button>
  {/snippet}
</Tip>

<style>
  /* The vermillion take: the mark a --space-1 past the folder rather than
     the number's --space-2, as a count rides what it counts, at the item's
     top. Named past BarGroup's item-with-a-number recipe, which it
     narrows. */
  :global(.tools) .files[data-files-control][data-take="mark"] {
    gap: var(--space-1);
  }
  :global(.tools) .count-mark[data-slot="num"] {
    align-self: flex-start;
    min-inline-size: calc(1lh + var(--space-1));
    padding: calc(var(--space-1) / 2);
    border-radius: var(--radius-xs);
    background: var(--chip-chosen-bg);
    color: var(--chip-chosen-ink);
    font: var(--type-caps);
    font-variant-numeric: tabular-nums;
    text-align: center;
  }
</style>
