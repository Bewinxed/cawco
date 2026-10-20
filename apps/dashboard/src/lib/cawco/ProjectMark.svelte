<script lang="ts">
  /**
   * A project's mark: the tree mark (TreeMark) with the folder as its face,
   * on the project's hue. Its count is the sessions running in it: a status
   * of the project, not the rows listed under it, so it stays on the tile
   * while the project is open. The project's row is the link to its page;
   * the mark is the switch that folds its sessions open and shut, as a
   * session's mark folds its delegates.
   */
  import { IconFolder } from "#lib/icons.js";
  import type { MarkHue } from "./mark";
  import TreeMark from "./TreeMark.svelte";

  let {
    name,
    hue,
    count = 0,
    open = false,
    ontoggle,
  }: {
    /** The project's name, for the switch's. */
    name: string;
    hue: MarkHue;
    /** The sessions running in it. */
    count?: number;
    /** Its rows are out. */
    open?: boolean;
    /** Opens and folds its sessions. */
    ontoggle: () => void;
  } = $props();
</script>

<TreeMark
  {count}
  countIsStatus
  fill="var(--mark-{hue})"
  {ontoggle}
  {open}
  switchLabel="{open ? 'Hide' : 'Show'} {name}'s sessions"
>
  {#snippet face()}
    <IconFolder aria-hidden="true" class="size-icon-sm" />
  {/snippet}
</TreeMark>
