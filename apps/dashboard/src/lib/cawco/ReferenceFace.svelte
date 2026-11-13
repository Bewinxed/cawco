<script lang="ts" module>
  import { chipVariants } from "#lib/components/ui/chip/index.js";

  /**
   * The inline chip (ui/chip `inline`) a reference's face stands on: its
   * start pad is a mark's, so a face with no mark takes a word's pad there.
   */
  export const referenceChipClass = (marked: boolean): string =>
    chipVariants({
      variant: "inline",
      class: marked ? undefined : "ps-space-2",
    });
</script>

<script lang="ts">
  /**
   * What every reference chip shows (`[label](cawco:<kind>/<id>)`, core
   * references.ts), inside the chip it stands on ({@link referenceChipClass}):
   * its mark in the row mark's box, its words, and its state after them.
   * It reads no fleet: the dashboard's chips hand it what they read of the
   * store, and a page of another origin (a decision page's words) what its
   * host said of the reference (core reference-faces.ts), so a reference
   * looks one way wherever it is drawn.
   *
   * The mark is `glyph` tinted by `tone`, or on a session's hue (`hue`, the
   * glyph in the mark's own ink), or `mark` drawn whole in that box.
   */
  import type { Component, Snippet } from "svelte";
  import { cn } from "#lib/utils.js";
  import type { MarkHue } from "./mark";

  let {
    words,
    state = null,
    stateClass = "text-ink-muted",
    glyph: Glyph,
    tone = "text-ink-muted",
    hue,
    mark,
  }: {
    words: string;
    /** Its state after its words (a task's stage); none: nothing. */
    state?: string | null;
    /** The classes its state takes. */
    stateClass?: string;
    glyph?: Component<{ class?: string }>;
    /** The glyph's colour, a text utility, off a hue. */
    tone?: string;
    /** A session's hue (mark.ts `markHue`): the box is its tile. */
    hue?: MarkHue;
    mark?: Snippet;
  } = $props();
</script>

{#if mark || Glyph}
  <span
    data-slot="mark"
    aria-hidden="true"
    class={cn(
      "grid size-c-row-mark flex-none place-items-center",
      hue ? "rounded-xs bg-(--mark-bg) bg-mark-overlay" : tone
    )}
    style:--mark-bg={hue ? `var(--color-mark-${hue})` : undefined}
    data-box
  >
    {#if mark}
      {@render mark()}
    {:else if Glyph}
      <Glyph class={cn("block size-icon-sm", hue && "text-mark-glyph")} />
    {/if}
  </span>
{/if}
<span data-slot="label">{words}</span>
{#if state}
  <span data-slot="state" class={cn("flex-none", stateClass)}>{state}</span>
{/if}
