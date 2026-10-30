<script lang="ts">
  /**
   * Caw over the top edge of a fault's sheet: `peek`, then `climb` once it has
   * stopped again. The slot is the part of his box above the ledge line, so the
   * line stands on the slot's foot, which the sheet's top edge meets; his wing
   * tips hang in front of it. He comes up by the file's own drawn enter. With
   * less motion he is that file's still, so the drawing is the same one either
   * way, where `Caw` on its own would put a status file behind the edge.
   */
  import TrayCaw from "../address/TrayCaw.svelte";
  import { LEDGE_LINE } from "../home/Caw.svelte";
  import CawFace from "../home/CawFace.svelte";
  import { motionOk } from "../motion/curves.svelte";

  let { again = false, size }: { again?: boolean; size: number } = $props();
</script>

<div class="relative z-1 flex-none" data-slot="ledge-caw">
  {#if motionOk.current}
    <TrayCaw ledge pose={again ? ["climb"] : ["ready"]} {size} />
  {:else}
    <div
      class="relative h-(--height) w-(--side)"
      style:--height="{size * LEDGE_LINE}px"
      style:--side="{size}px"
    >
      {#key again}
        <span class="absolute start-0 top-0">
          <CawFace status={again ? "climb" : "peek"} {size} />
        </span>
      {/key}
    </div>
  {/if}
</div>
