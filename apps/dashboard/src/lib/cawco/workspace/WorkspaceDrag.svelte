<script lang="ts">
  /**
   * The drag the rail and the workspace share (drag/DragProvider, with
   * dnd.svelte's `workspaceDrag`): a tab or a session's row carried from
   * one into the other. The Shell stands it around both; a bench drawing
   * the strip alone stands it around that.
   */
  import type { Snippet } from "svelte";
  import DragProvider from "../drag/DragProvider.svelte";
  import { workspaceDrag } from "./dnd.svelte";

  let { children }: { children: Snippet } = $props();
</script>

<DragProvider
  fliesHome={workspaceDrag.fliesHome}
  onDragEnd={workspaceDrag.end}
  onDragMove={workspaceDrag.move}
  onDragOver={workspaceDrag.over}
  onDragStart={workspaceDrag.start}
>
  {@render children()}
</DragProvider>
