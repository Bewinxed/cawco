<script lang="ts">
  /**
   * A project's mark: the tree mark (TreeMark) with the folder as its face,
   * on the project's hue. Its count is the sessions running in it: a status
   * of the project, not the rows listed under it, so it stays on the tile.
   * On the sidebar's Projects a project is one row, the link to its page,
   * and its mark only says the count; on Recent grouped by project it is
   * the group's parent, and the row is the switch that folds the sessions
   * under it (`rowToggles`).
   */
  import { IconFolder } from "#lib/icons.js";
  import type { MarkHue } from "./mark";
  import TreeMark from "./TreeMark.svelte";

  let {
    name,
    hue,
    count = 0,
    open = false,
    rowToggles = false,
  }: {
    /** The project's name. */
    name: string;
    hue: MarkHue;
    /** The sessions running in it. */
    count?: number;
    /** Rows hang under it and are out. */
    open?: boolean;
    /** The row is the switch that folds the rows under it: the mark draws the morph. */
    rowToggles?: boolean;
  } = $props();
</script>

<TreeMark
  {count}
  countIsStatus
  fill="var(--mark-{hue})"
  {open}
  {rowToggles}
  switchLabel={rowToggles ? `${open ? "Hide" : "Show"} ${name}` : undefined}
>
  {#snippet face()}
    <IconFolder aria-hidden="true" class="size-icon-sm" />
  {/snippet}
</TreeMark>
