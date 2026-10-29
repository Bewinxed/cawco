<script lang="ts">
  /**
   * One floating group of a bar (DESIGN.md, The Title Bars Follow Liquid
   * Glass Rule): a capsule of the panel's glass holding bare symbols with no
   * border or fill of their own until hovered or pressed, concentric inside
   * it, the top bar's trailing group its recipe (bar-glass). Solid raised
   * with the contrast edge under Reduce Transparency or Increase Contrast.
   * The glass is a layer under the items, never the group itself, so a
   * backdrop filter makes no containing block for what the items open.
   */
  import type { Snippet } from "svelte";

  let {
    children,
    label,
    class: className = "",
  }: {
    children: Snippet;
    /** The group's name for a reader, where its items don't say it together. */
    label?: string;
    class?: string;
  } = $props();
</script>

<!-- biome-ignore lint/a11y/useSemanticElements: a bar's group of controls, not a form's fieldset. -->
<div
  aria-label={label}
  class="relative flex h-c-btn-h items-center gap-c-bar-group-pad rounded-pill p-c-bar-group-pad before:pointer-events-none before:absolute before:inset-0 before:rounded-inherit before:border before:border-border-hairline before:bg-material-panel before:shadow-tile before:glass-backdrop contrast-more:before:border-border-contrast contrast-more:before:bg-surface-raised contrast-more:before:backdrop-filter-none reduced-transparency:before:border-border-contrast reduced-transparency:before:bg-surface-raised reduced-transparency:before:backdrop-filter-none coarse:gap-space-3 {className}"
  data-glass
  role="group"
>
  {@render children()}
</div>
