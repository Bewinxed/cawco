<script lang="ts">
  /**
   * Reports the canvas zoom to its owner (the tools' percentage, the hit
   * areas' scale), only when the zoom itself changes: the viewport is a new
   * object on every frame of a pan, and an effect that read it ran its
   * owner's write on each of them.
   */
  import { useStore } from "@xyflow/svelte";

  let { onZoomChange }: { onZoomChange: (zoom: number) => void } = $props();
  const store = useStore();
  const zoom = $derived(store.viewport.zoom);
  $effect(() => {
    onZoomChange(zoom);
  });
</script>
