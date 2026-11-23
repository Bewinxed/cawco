<script lang="ts">
  /**
   * The kit's Resizable parts in a frame of their own (their states
   * file's): two panes split by a handle, as the page and its side panel
   * compose them.
   */
  import * as Resizable from "./index.js";

  let {
    main,
    side,
    sideSize,
    grip = false,
  }: {
    /** The main pane's words. */
    main: string;
    /** The side pane's words. */
    side: string;
    /** The side pane's share, percent. */
    sideSize: number;
    /** The handle draws its grip. */
    grip?: boolean;
  } = $props();
</script>

<div class="h-40 w-full rounded-sm border border-border-hairline">
  <Resizable.PaneGroup direction="horizontal">
    <Resizable.Pane defaultSize={100 - sideSize} minSize={30}>
      <p class="p-space-4 type-label">{main}</p>
    </Resizable.Pane>
    <Resizable.Handle withHandle={grip} />
    <Resizable.Pane defaultSize={sideSize} minSize={20}>
      <p class="p-space-4 text-ink-muted type-label">{side}</p>
    </Resizable.Pane>
  </Resizable.PaneGroup>
</div>
