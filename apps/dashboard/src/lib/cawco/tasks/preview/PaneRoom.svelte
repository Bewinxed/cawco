<script lang="ts">
  /**
   * The room a task pane stands in on a sheet: the side card's height
   * beside the board on a desk, the phone's screen as its own page. It
   * answers the pane's own two reads from the tidewater fixtures
   * (hub-answers.ts) before the pane mounts.
   */
  import type { Snippet } from "svelte";
  import { answerTaskReads } from "./hub-answers";

  let {
    height = 820,
    children,
  }: {
    /** The room the page gives the pane, in px. */
    height?: number;
    children: Snippet;
  } = $props();

  answerTaskReads();
</script>

<!-- The page's room is the pane's cap: a short pane stands at its own height,
     a long one scrolls inside it. -->
<div
  class="flex max-h-(--room-h) w-full flex-col bg-surface-recess"
  style:--room-h="{height}px"
>
  {@render children()}
</div>
