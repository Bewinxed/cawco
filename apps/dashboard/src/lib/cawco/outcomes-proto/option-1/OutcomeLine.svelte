<script lang="ts">
  /**
   * One line under "Done when:" (shared part S1): its sentence, which wraps
   * to two lines at most, its answer in the tile's answer column, so the
   * words line up down a tile, and its open control at the row's end, the
   * only way in (never the sentence). It stands in its tile's grid as a
   * subgrid row. While its card hangs from it, the row carries the
   * selected tint, so the card's anchor reads.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconMaximize } from "#lib/icons.js";
  import LineAnswer from "./LineAnswer.svelte";
  import type { Line } from "./outcomes";
  import { outcomesWords } from "./words";

  let {
    line,
    open,
    onopen,
  }: {
    line: Line;
    /** Its card hangs from it now. */
    open: boolean;
    /** The open control was pressed; the row is what the card hangs from. */
    onopen: (row: HTMLElement) => void;
  } = $props();

  let row = $state<HTMLElement | null>(null);
</script>

<li
  bind:this={row}
  data-line={line.id}
  data-open={open || undefined}
  class="relative col-span-3 grid grid-cols-subgrid items-start rounded-sm py-space-1 @max-phone/view:py-0.5 before:pointer-events-none before:absolute before:-inset-x-space-2 before:inset-y-0 before:rounded-sm before:bg-transparent before:transition-[background-color] before:duration-(--duration-control) before:ease-out data-open:before:bg-selected-bg"
>
  <span
    class="relative line-clamp-2 type-body text-pretty text-ink-strong @max-phone/view:type-label"
    >{line.sentence}</span
  >
  <span class="relative"><LineAnswer answer={line.answer} /></span>
  <Button
    class="relative -my-space-1"
    aria-expanded={open}
    aria-label={outcomesWords.open(line.sentence)}
    data-line-open
    icon={IconMaximize}
    onclick={() => {
      if (row) {
        onopen(row);
      }
    }}
    size="icon-xs"
    title={outcomesWords.open(line.sentence)}
    tone="quiet"
    variant="ghost"
  />
</li>
