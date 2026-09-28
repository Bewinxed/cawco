<script lang="ts">
  /** Reports the canvas zoom to its owner (the tools' percentage, the hit areas' scale). */
  import { useStore } from "@xyflow/svelte";

  let { onZoomChange }: { onZoomChange: (zoom: number) => void } = $props();
  const store = useStore();
  $effect(() => {
    onZoomChange(store.viewport.zoom);
  });
</script>
