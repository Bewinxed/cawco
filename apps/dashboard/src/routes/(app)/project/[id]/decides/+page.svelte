<script lang="ts">
  /** A project's Who decides: the fleet's table, and the kinds it hands over itself (WhoDecides). */
  import WhoDecides from "#lib/cawco/decides/WhoDecides.svelte";
  import { page } from "$app/state";
</script>

{#key page.params.id}
  <WhoDecides projectId={page.params.id ?? null} />
{/key}
