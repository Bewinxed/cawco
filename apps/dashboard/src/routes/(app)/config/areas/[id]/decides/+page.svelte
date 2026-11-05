<script lang="ts">
  /**
   * An area's Who decides: its own decides.md over the fleet's, the table
   * every project in it takes for a kind its own file leaves out
   * (WhoDecides, as a project's page lays it out).
   */
  import { configStore } from "#lib/cawco/config/store.svelte.js";
  import WhoDecides from "#lib/cawco/decides/WhoDecides.svelte";
  import { page } from "$app/state";

  const store = configStore();
  const id = $derived(page.params.id ?? "");
  const area = $derived(store.areas.value?.find((one) => one.id === id));
</script>

{#key id}
  <WhoDecides area={{ id, name: area?.name ?? "" }} projectId={null} />
{/key}
