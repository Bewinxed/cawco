<script lang="ts">
  /**
   * The card beside a conversation (SideSplit), its pane stopped on a render
   * error: the switch, the name and Close outlive the pane that threw, round
   * the fault's face (RegionBoundary's `chrome`), on the desk's split and in
   * the phone's sheet alike. Close puts away what was on show as the pane's
   * own Close does (its caller's `onclose`), pending while it goes and
   * marked failed if it did not.
   */
  import { sideWords } from "@cawco/core/words/side";
  import type { Snippet } from "svelte";
  import SideSurface from "./SideSurface.svelte";

  let {
    what,
    title,
    switcher,
    onclose,
    children,
  }: {
    /** What stood in the card. */
    what: "preview" | "task";
    /** What the pane's head named: the artifact, or the task's id where no switch says Task. */
    title?: string;
    /** The switch, while more than one has something to show. */
    switcher?: Snippet;
    onclose: () => void | Promise<void>;
    /** The fault's face. */
    children: Snippet;
  } = $props();

  let closing = $state(false);
  let closeFailed = $state(false);
  async function close() {
    closing = true;
    closeFailed = false;
    try {
      await onclose();
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
