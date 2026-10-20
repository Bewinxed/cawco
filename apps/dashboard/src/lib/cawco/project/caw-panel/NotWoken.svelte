<script lang="ts">
  /**
   * Your message didn't wake Caw (advisor report §2, non-blocking): a row
   * under your message, at the place it happened, as the house's fault line
   * does (RowFault): why, Try again, and the hub's words under Show details.
   */
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { NOT_WOKEN, NOT_WOKEN_RAW } from "./fixtures";

  const again = () =>
    new Promise<void>((done) => {
      setTimeout(done, 900);
    });
</script>

<RowFault {again} data-not-woken details={NOT_WOKEN_RAW} reason={NOT_WOKEN} />
