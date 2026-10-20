<script lang="ts">
  /**
   * An empty state's one action under The Empty Starts Work Rule (DESIGN.md):
   * while the work can start, the kit's outline button that asks for it
   * (`onask` puts the words where they go, unsent: empty-asks.ts); while it
   * can't, CantStart: why, and the way to do it by hand (`byHand`) when the
   * surface doesn't already stand it beside the empty state. One start edge
   * with the block's title and line (EmptyState's action slot), and words
   * alone: the block's mark is its one glyph (DESIGN.md, Empty).
   */
  import type { Snippet } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import CantStart from "./CantStart.svelte";

  let {
    label,
    onask,
    canStart = true,
    reason = "",
    byHand,
    size,
  }: {
    /** "Ask <agent> for <the thing>". */
    label: string;
    /** The press, with the button it came from (a popover hangs from it). */
    onask: (anchor: HTMLElement) => void;
    canStart?: boolean;
    /** Why it can't start, in a sentence. */
    reason?: string;
    /** The way by hand, while it can't start. */
    byHand?: Snippet;
    /** `sm` in a block's own room (an empty Event sources), as its neighbours stand. */
    size?: "sm";
  } = $props();
</script>

{#if canStart}
  <Button
    data-empty-ask
    {label}
    {size}
    onclick={(event: MouseEvent) => onask(event.currentTarget as HTMLElement)}
    variant="outline"
  />
{:else}
  <CantStart {byHand} {reason} />
{/if}
