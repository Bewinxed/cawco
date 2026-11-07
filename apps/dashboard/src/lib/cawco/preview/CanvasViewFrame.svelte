<script lang="ts">
  /**
   * CanvasView in a frame of its own (CanvasView.stories.ts): its item stands
   * in a head's floating group (BarGlass `form="group"`), as SideSurface
   * holds it in the panel's head, so its menu (BarMenu) has the glass it
   * hangs from.
   */
  import { BarGlass } from "#lib/components/ui/bar-glass/index.js";
  import CanvasView from "./CanvasView.svelte";
  import type { CanvasViewState } from "./canvas-view.svelte";

  let {
    view,
    onverify,
  }: {
    view: CanvasViewState;
    onverify: () => void;
  } = $props();
</script>

<BarGlass form="group">
  <CanvasView {onverify} {view} />
</BarGlass>
