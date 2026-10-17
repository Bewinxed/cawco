<script lang="ts">
  /**
   * One notice as a row of Caw's panel (NeedsCaw): its leading mark in the
   * panel's one lead column, what it says in its one text column, and its ✕
   * in the first line's trailing cell, where lists put a row's dismiss
   * (Windows, Slack, Linear, GitHub). Only that cell is the ✕'s: every line
   * under the first, a footer's buttons too, runs to the row's trailing
   * edge, the panel's one trailing edge. The first line keeps the ✕'s room
   * clear (`--x-room`, which each caller's first line pads by).
   *
   * The ✕ is the one way it leaves: acknowledging is global
   * (`notices.acknowledge`), so there is no swipe and no light dismiss of a
   * single notice. It always shows, to a mouse as to a finger, so leaving is
   * never something to find; under the pointer it takes the kit's hover
   * fill and strong ink. A finger gets a 44px area (`touch-hit`).
   *
   * `nested`: an entry of a group of notices (MovedLogins), the same columns
   * with less air above and below.
   */
  import type { Snippet } from "svelte";
  import { IconClose } from "#lib/icons.js";

  let {
    label,
    dismissLabel,
    ondismiss,
    nested = false,
    lead,
    children,
  }: {
    label: string;
    dismissLabel: string;
    /** Absent while the row says its goodbye: nothing is left to dismiss. */
    ondismiss?: () => void;
    nested?: boolean;
    lead: Snippet;
    children: Snippet;
  } = $props();
</script>

<!-- `--x-ink`: how far inside its 24px box the ✕'s ink stops, the box's
     padding round the 12px glyph plus the glyph's own side bearing (Close:
     its stroke ends at 18.75 of 24). The ✕ hangs past the trailing edge by
     that much, so its ink ends on the panel's one trailing edge, where a
     wait's figures and Approve's fill end; its box keeps its size. An entry of
     a group (`nested`): the same columns, less air between entries. -->
<!-- literal: 28px, 44px, 12px, 24px, 5.25 -->
<article
  data-slot="notice"
  aria-label={label}
  class="group relative grid min-h-(--row-min) grid-cols-(--columns) items-start gap-x-space-3 px-space-3 py-(--pad-block)"
  data-flip="box"
  data-nested={nested || undefined}
  style:--columns="var(--lead) minmax(0, 1fr)"
  style:--lead="28px"
  style:--pad-block={nested ? "var(--space-1)" : "var(--space-3)"}
  style:--row-min={nested ? "0px" : "44px"}
  style:--x-ink="calc((24px - 12px) / 2 + 12px * 5.25 / 24)"
>
  <span data-slot="lead" class="grid size-(--lead) place-items-center"
    >{@render lead()}</span
  >
  <!-- The first line pads by `--x-room` so its words stop `space-2` short of
       the ✕'s box. -->
  <div
    data-slot="body"
    class="flex min-w-0 flex-col gap-space-row"
    style:--x-room="calc(24px - var(--x-ink) + var(--space-2))"
  >
    {@render children()}
  </div>
  {#if ondismiss}
    <!-- The first line's trailing cell: the label line's middle, its ink on
         the row's trailing edge. An entry's first line is in body type: the ✕
         centres on that. -->
    <span
      data-slot="end"
      class="absolute end-(--end-edge) top-(--end-top) flex type-label group-data-nested:type-body"
      style:--end-edge="calc(var(--space-3) - var(--x-ink))"
      style:--end-top="calc(var(--pad-block) + (1lh - 24px) / 2)"
    >
      <button
        data-slot="x"
        aria-label={dismissLabel}
        class="touch-hit pointer-hit grid size-(--box) cursor-pointer place-items-center rounded-xs border-none border-current bg-transparent p-0 text-ink-muted motion-safe:active:transform-(--tpress) hover:bg-surface-hover hover:text-ink-strong"
        onclick={ondismiss}
        style:--box="24px"
        style:--tpress="scale(var(--press-scale))"
        style:--hit-edge="0px"
        style:--hit-shift="calc((24px - 44px) / 2)"
        type="button"
      >
        <IconClose aria-hidden="true" class="size-icon-sm" />
      </button>
    </span>
  {/if}
</article>

<style>
  /* residual: unmapped */
  [data-slot="x"] {
    transition:
      background-color var(--dur-control) var(--ease-out),
      color var(--dur-control) var(--ease-out),
      transform var(--dur-toggle) var(--ease-out);
  }
  /* A finger's 44px area (`touch-hit`) stays whole and centred where the box
     stood before it hung: moved back inboard by `--x-ink`, it ends inside the
     list as it did, so the list never grows a sideways scroll for it. */
  @media (pointer: coarse) {
    /* residual: pseudo */
    [data-slot="x"]::after {
      inset-inline-start: calc(var(--hit-shift) - var(--x-ink));
      inset-inline-end: calc(var(--hit-shift) + var(--x-ink));
    }
  }
</style>
