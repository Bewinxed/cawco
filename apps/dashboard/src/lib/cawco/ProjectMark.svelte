<script lang="ts">
  /**
   * A project's mark: the tree mark (TreeMark) with the folder as its face,
   * on the project's hue. Its count is the sessions running in it: a status
   * of the project, not the rows listed under it, so it stays on the tile.
   * On the sidebar's Projects a project is one row, the link to its page,
   * and its mark is the switch that unfolds the sessions it counts under
   * that row (`ontoggle`), as a session's mark unfolds its delegates; on
   * Recent grouped by project it is the group's parent, a link to the
   * project's page too, and its mark is the switch that folds the sessions
   * listed under it (`ontoggle`, `holds: "sessions"`). The group of
   * sessions in no project has no page: its row is the switch
   * (`rowToggles`).
   */
  import { sidebarWords } from "@cawco/core/words/sidebar";
  import { IconFolder } from "#lib/icons.js";
  import type { MarkHue } from "./mark";
  import TreeMark from "./TreeMark.svelte";

  let {
    name,
    hue,
    count = 0,
    open = false,
    rowToggles = false,
    ontoggle,
    holds = "running",
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
    /** Unfolds and folds the rows under it from the mark's own hit area. */
    ontoggle?: () => void;
    /** What its switch unfolds: its running sessions (Projects), or the sessions listed under it (Recent's group). */
    holds?: "running" | "sessions";
  } = $props();

  const switchLabel = $derived.by(() => {
    if (rowToggles) {
      return `${open ? "Hide" : "Show"} ${name}`;
    }
    if (ontoggle && holds === "sessions") {
      return open
        ? sidebarWords.hideSessions(name)
        : sidebarWords.showSessions(name);
    }
    if (ontoggle) {
      return open
        ? sidebarWords.hideRunning(name)
        : sidebarWords.showRunning(name);
    }
  });
</script>

<TreeMark
  {count}
  countIsStatus
  fill="var(--color-mark-{hue})"
  {ontoggle}
  {open}
  {rowToggles}
  {switchLabel}
>
  {#snippet face()}
    <IconFolder aria-hidden="true" class="size-icon-sm" />
  {/snippet}
</TreeMark>
