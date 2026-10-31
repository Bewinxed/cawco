<script lang="ts">
  /**
   * The card beside a conversation (SideSplit), its pane stopped on a render
   * error: the switch, the name and Close outlive the pane that threw, round
   * the fault's face (RegionBoundary's `chrome`), on the desk's split and in
   * the phone's sheet alike. Close puts away what was on show, as the pane's
   * own Close does: the preview closes on the hub, a task goes from beside
   * the conversation.
   */
  import { sideWords } from "@cawco/core/words/side";
  import type { Snippet } from "svelte";
  import { cawco, closePreview } from "../client.svelte";
  import { besideOf, putAway } from "../tasks/beside.svelte";
  import SideSurface from "./SideSurface.svelte";

  let {
    what,
    viewId,
    switcher,
    children,
  }: {
    /** What stood in the card. */
    what: "preview" | "task";
    /** The conversation it stands beside. */
    viewId: string;
    /** The switch, while more than one has something to show. */
    switcher?: Snippet;
    /** The fault's face. */
    children: Snippet;
  } = $props();

  /** What the pane's head named: the artifact, or the task's id where no switch says Task. */
  const title = $derived.by(() => {
    if (what === "task") {
      return switcher ? undefined : besideOf(viewId)?.taskId;
    }
    const preview = cawco.previews[viewId];
    return preview?.artifact?.name ?? preview?.title;
  });

  let closing = $state(false);
  let closeFailed = $state(false);
  async function close() {
    if (what === "task") {
      putAway(viewId);
      return;
    }
    closing = true;
    closeFailed = false;
    try {
      await closePreview(viewId);
    } catch {
      closeFailed = true;
    } finally {
      closing = false;
    }
  }
</script>

<SideSurface
  {closeFailed}
  {closing}
  label={what === "task" ? sideWords.task : sideWords.preview}
  of={what}
  onclose={close}
  recessed={what === "preview"}
  {switcher}
  {title}
  titleCode={what === "task"}
>
  {@render children()}
</SideSurface>
