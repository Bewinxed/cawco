<script lang="ts">
  /**
   * The peek sheet as its drawer draws it (its surface inset in its box,
   * the pane in from that), filling the frame: at a desk's 400 the sheet
   * beside Home, at an iPad's width the sheet risen across the screen, its
   * tail and tray on one reading measure. The session stands in the client's
   * own store in the scene the story names (peek-fixtures.ts).
   */
  import { onMount } from "svelte";
  import PeekPane from "../PeekPane.svelte";
  import { type PeekScene, standPeek } from "./peek-fixtures";

  let {
    scene,
    stepsOpen = false,
    height = 790,
  }: {
    /** The situation the peek meets the session in. */
    scene: PeekScene;
    /** The plan's steps stand open. */
    stepsOpen?: boolean;
    /** The frame's height, px. */
    height?: number;
  } = $props();

  // Stood as the frame mounts, its own id beside any other frame's scene.
  const stood = standPeek(scene);
  onMount(() => stood.leave);

  /** The press flips the frame's own copy; a new arg resets it. */
  let opened = $state(false);
  $effect.pre(() => {
    opened = stepsOpen;
  });
</script>

<div
  class="flex h-(--frame-h) w-full bg-surface-recess p-space-2"
  style:--frame-h="{height}px"
>
  <div
    class="flex min-w-0 flex-1 flex-col rounded-lg border border-border bg-surface-raised p-space-2 text-ink-strong text-label"
  >
    <PeekPane
      bind:stepsOpen={opened}
      onclose={() => undefined}
      target={stood.target}
    />
  </div>
</div>
