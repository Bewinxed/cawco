<script lang="ts">
  /**
   * Goes first inside a `<svelte:boundary>`: its teardown tells the client
   * `handleError` that the error it is about to answer was held by that
   * boundary, not the route's (region-held.ts). A pre-effect, so it is set
   * up as it is created, before anything after it can throw.
   */
  import { regionDropped } from "./region-held";

  $effect.pre(() => () => regionDropped());
</script>
