<script lang="ts">
  /**
   * The field's camera, inside Svelte Flow's context: Walk glides it to the
   * kept card, Fit pulls back to the whole field (Svelte Flow's own
   * setCenter and fitView), on the panel's clock.
   */
  import { useSvelteFlow } from "@xyflow/svelte";
  import { dur } from "#lib/cawco/motion/curves.svelte.js";
  import type { Box } from "./layout";

  const flow = useSvelteFlow();

  export function walkTo(box: Box, zoom = 1, room = { top: 0, foot: 0 }): void {
    flow.setCenter(
      box.x + box.w / 2,
      box.y + box.h / 2 + (room.foot - room.top) / (2 * zoom),
      { zoom, duration: dur("--dur-panel") }
    );
  }

  export function fit(): void {
    flow.fitView({ padding: 0.08, duration: dur("--dur-panel"), maxZoom: 1 });
  }

  export function zoomIn(): void {
    flow.zoomIn({ duration: dur("--dur-control") });
  }

  export function zoomOut(): void {
    flow.zoomOut({ duration: dur("--dur-control") });
  }
</script>
