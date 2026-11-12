<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";
  import { type GroupLook, provideLook } from "./look.js";

  let {
    ref = $bindable(null),
    class: className,
    share,
    look = "field",
    children,
    ...props
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
    /**
     * A value's place in its range, 0 to 1, drawn as a fill from the
     * frame's leading edge under its words (the design graph's number dial,
     * the Effort chip's fill): the frame is the value's
     * control, a drag across it the caller's, its edge stepping up while
     * the caller marks it `data-dragging`.
     */
    share?: number;
    /**
     * A form's field (`field`), or a search field standing in a bar's row
     * (`bar`, HIG Search fields: in a toolbar it is the bar's own capsule):
     * a capsule as tall as the glass beside it, on the glass's material
     * and hairline, so it reads as one of the bar's capsules.
     */
    look?: GroupLook;
  } = $props();
  provideLook(() => look);

  /**
   * A press on the frame's touch area beside its field: the field's own
   * focus. Under a finger the area stands under the frame's field and
   * controls (`hit-under`), so a tap on the field is the field's own (its
   * caret, its words' selection) and only one beside it lands here. The
   * field is found by
   * `data-group-control`, which its kit part writes after the props it is
   * given: a field named by a `data-slot` of its own (the Comments rail's
   * `search`) is found all the same.
   */
  function focusField(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      ref?.querySelector<HTMLElement>("[data-group-control]")?.focus();
    }
  }
</script>

<!-- The frame is the field (DESIGN.md, Inputs and fields, Field frame), so
     it carries the field's touch area (The 44 Touch Rule), and its edge
     steps up while its text has focus (`field-edge`): its own field draws
     none. -->
<!-- biome-ignore lint/a11y/useSemanticElements: <fieldset> carries browser-default border/padding this design resets everywhere it's used; keeping the div avoids a visual regression -->
<!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: a press on the frame's touch area focuses its field; a keyboard reaches the field itself. -->
<!-- biome-ignore lint/a11y/useKeyWithClickEvents: a keyboard reaches the field itself; only a finger lands on the frame's area. -->
<div
  class={cn(
    "touch-hit hit-under [--hit-edge:1px]",
    "relative flex h-9 w-full min-w-0 items-center rounded-md",
    "border",
    "field-edge bg-surface-raised shadow-xs",
    "[transition:var(--transition-control)]",
    "has-[>[data-align=block-end]]:h-auto",
    "has-[>[data-align=block-start]]:h-auto",
    "has-[>textarea]:h-auto",
    "has-[>[data-align=block-end]]:flex-col",
    "has-[>[data-align=block-start]]:flex-col",
    "has-[textarea]:rounded-md",
    "has-data-[align=block-end]:rounded-md",
    "has-data-[align=block-start]:rounded-md",
    "has-[[data-slot][aria-invalid=true]]:border-error-9",
    "has-[>[data-align=block-end]]:[&>input]:pt-3",
    "has-[>[data-align=inline-end]]:[&>input]:pr-1.5",
    "has-[>[data-align=block-start]]:[&>input]:pb-3",
    "has-[>[data-align=inline-start]]:[&>input]:pl-1.5",
    // A value's frame is dragged across: every part of it says so to the
    // pointer until its field holds the caret, a horizontal drag is the
    // frame's under a finger (a vertical one still scrolls), and its edge
    // steps up under the pointer and through a drag.
    share !== undefined &&
      "isolate cursor-ew-resize touch-pan-y overflow-clip not-focus-within:[&_*]:cursor-ew-resize can-hover:hover:not-has-[[data-slot][aria-invalid=true]]:border-border-row-outline data-dragging:not-has-[[data-slot][aria-invalid=true]]:border-border-row-outline",
    look === "bar" &&
      "h-c-btn-h rounded-pill border-border-hairline bg-material-panel shadow-tile glass-backdrop contrast-more:border-border-contrast contrast-more:bg-surface-raised contrast-more:backdrop-filter-none reduced-transparency:border-border-contrast reduced-transparency:bg-surface-raised reduced-transparency:backdrop-filter-none",
    // The group's own Clear stands for the engine's: its search cancel glyph is not drawn.
    "[&>input::-webkit-search-cancel-button]:appearance-none",
    className
  )}
  data-look={look}
  data-slot="input-group"
  onclick={focusField}
  role="group"
  bind:this={ref}
  {...props}
>
  {#if share !== undefined}
    <span
      aria-hidden="true"
      class="pointer-events-none absolute inset-y-0 start-0 -z-1 w-(--share) bg-surface-fill transition-control"
      data-slot="input-group-share"
      style:--share="{Math.min(1, Math.max(0, share)) * 100}%"
    ></span>
  {/if}
  {@render children?.()}
</div>
