<script>
  /**
   * Caw on the pairing surface: the dashboard's own component, drawn by Rive
   * from his status's file. preview.js drives it through `caw`.
   */
  import Caw from "../../../apps/dashboard/src/lib/cawco/home/Caw.svelte";
  import { caw, cawEvents } from "./caw.svelte.js";

  /** Every status the page shows, fetched once he is on screen. */
  const NEXT = ["loading", "ready", "needs-you", "done", "sleeping", "reconnecting"];
</script>

{#if caw.present}
  {#key caw.key}
    <Caw
      next={NEXT}
      onentered={() => cawEvents.entered()}
      size={caw.size}
      status={caw.status}
      still={caw.still}
    />
  {/key}
{/if}
