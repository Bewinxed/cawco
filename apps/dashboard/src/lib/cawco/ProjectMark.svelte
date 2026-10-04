<script lang="ts">
  /**
   * A project's mark: the tree mark (TreeMark) with the folder as its face,
   * on the project's hue. Its count is the sessions running in it: a status
   * of the project, not the rows listed under it, so it stays on the tile
   * while the project is open. The project's row is the switch, so the mark
   * draws the morph and the row takes the press.
   */
  import { IconFolder } from "#lib/icons.js";
  import type { MarkHue } from "./mark";
  import TreeMark from "./TreeMark.svelte";

  let {
    hue,
    count = 0,
    open = false,
  }: {
    hue: MarkHue;
    /** The sessions running in it. */
    count?: number;
    /** Its rows are out. */
    open?: boolean;
  } = $props();
</script>

<TreeMark {count} countIsStatus fill="var(--mark-{hue})" {open} rowToggles>
  {#snippet face()}
    <IconFolder aria-hidden="true" class="project-mark-glyph" />
  {/snippet}
</TreeMark>

<style>
  /* The 12px glyph on the 18px tile: 3px of inset, a mark rather than a
     glyph in a box. */
  :global(.project-mark-glyph) {
    inline-size: 12px;
    block-size: 12px;
  }
</style>
