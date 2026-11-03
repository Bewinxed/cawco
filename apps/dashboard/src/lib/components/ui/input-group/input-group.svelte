<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    look = "field",
    ...props
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
    /**
     * `field`: the field frame (DESIGN.md, Inputs and fields). `bar`: a
     * search field opened in a floating bar, a capsule of the panel's glass
     * as tall as the bar's groups (The Title Bars Follow Liquid Glass Rule;
     * HIG, Toolbars: "standard buttons, text fields … have corner radii that
     * are concentric with bar corners").
     */
    look?: "field" | "bar";
  } = $props();

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
    "relative flex w-full min-w-0 items-center",
    // A search field's Clear is the group's own button, in the house ink:
    // the engine's blue cancel glyph never draws.
    "[&_input::-webkit-search-cancel-button]:appearance-none",
    "border field-edge",
    look === "bar"
      ? "h-c-btn-h rounded-pill border-border-hairline bg-material-panel shadow-tile glass-backdrop contrast-more:border-border-contrast contrast-more:bg-surface-raised contrast-more:backdrop-filter-none reduced-transparency:border-border-contrast reduced-transparency:bg-surface-raised reduced-transparency:backdrop-filter-none"
      : "h-9 rounded-md border-border-control bg-surface-raised shadow-xs",
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
    className
  )}
  data-slot="input-group"
  onclick={focusField}
  role="group"
  bind:this={ref}
  {...props}
>
  {@render children?.()}
</div>
