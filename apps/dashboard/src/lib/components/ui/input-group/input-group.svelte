<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

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
    /** A field, or a capsule on a bar's glass. */
    look?: "field" | "bar";
  } = $props();

  /**
   * A press on the frame's touch area beside its field: the field's own
   * focus. Under a finger the area stands under the frame's field and
   * controls (`hitbox`, under its content), so a tap on the field is the field's own (its
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
     steps up while its text has focus (theme.css `control-field`): its own field draws
     none. -->
<!-- biome-ignore lint/a11y/useSemanticElements: <fieldset> carries browser-default border/padding this design resets everywhere it's used; keeping the div avoids a visual regression -->
<!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: a press on the frame's touch area focuses its field; a keyboard reaches the field itself. -->
<!-- biome-ignore lint/a11y/useKeyWithClickEvents: a keyboard reaches the field itself; only a finger lands on the frame's area. -->
<div
  class={cn(
    "hitbox pointer-coarse:hitbox:touch-area [--hit-edge:1px]",
    "relative flex h-9 w-full min-w-0 items-center rounded-sm",
    // Its fill, edge and states are the control surface's (theme.css
    // `control-field`), drawn on the frame; its own input draws none.
    "control control-field",
    "has-[>[data-align=block-end]]:h-auto",
    "has-[>[data-align=block-start]]:h-auto",
    "has-[>textarea]:h-auto",
    "has-[>[data-align=block-end]]:flex-col",
    "has-[>[data-align=block-start]]:flex-col",
    "has-[textarea]:rounded-sm",
    "has-data-[align=block-end]:rounded-sm",
    "has-data-[align=block-start]:rounded-sm",
    // The field's own input steps clear of an addon beside it, asked of the
    // input by its siblings: asked of the frame (`has-[…]:[&>input]:`), the
    // `:has()` stood outside the rule's subject, where Blink's one shared
    // invalidation set restyles a whole subtree under every anchor on the
    // page (apps/dashboard/scripts/has-subject-check.ts).
    "[&>input:is([data-align=block-end]~*,:has(~[data-align=block-end]))]:pt-3",
    "[&>input:is([data-align=inline-end]~*,:has(~[data-align=inline-end]))]:pr-1.5",
    "[&>input:is([data-align=block-start]~*,:has(~[data-align=block-start]))]:pb-3",
    "[&>input:is([data-align=inline-start]~*,:has(~[data-align=inline-start]))]:pl-1.5",
    // A value's frame is dragged across: every part of it says so to the
    // pointer until its field holds the caret, a horizontal drag is the
    // frame's under a finger (a vertical one still scrolls), and its edge
    // steps up under the pointer and through a drag: the focus edge's ring
    // (`field-edge`), faded in on the compositor.
    share !== undefined &&
      "isolate cursor-ew-resize touch-pan-y not-focus-within:[&_*]:cursor-ew-resize can-hover:hover:not-has-[[data-slot][aria-invalid=true]]:before:opacity-100 data-dragging:not-has-[[data-slot][aria-invalid=true]]:before:opacity-100",
    look === "bar" &&
      "control-glass h-control-md rounded-pill glass-backdrop contrast-more:backdrop-filter-none reduced-transparency:backdrop-filter-none",
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
    <!-- The share's fill, clipped to the frame's inside by a box laid over
         the frame's border box with a clear border of the frame's width: its
         inside is the frame's, on the frame's inner radius. The frame clips
         nothing itself, or it would clip its focus edge (`field-edge`). -->
    <span
      aria-hidden="true"
      class="pointer-events-none absolute -inset-px -z-1 overflow-clip rounded-inherit border border-transparent"
    >
      <span
        class="absolute inset-y-0 start-0 w-(--share) bg-surface-fill transition-control"
        data-slot="input-group-share"
        style:--share="{Math.min(1, Math.max(0, share)) * 100}%"
      ></span>
    </span>
  {/if}
  {@render children?.()}
</div>
