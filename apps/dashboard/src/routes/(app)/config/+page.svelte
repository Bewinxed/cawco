<script lang="ts">
  import ConfigRail from "#lib/cawco/config/ConfigRail.svelte";
</script>

<svelte:head><title>Configure · CawCo</title></svelte:head>

<div data-slot="list" class="min-h-0 flex-auto overflow-y-auto">
  <ConfigRail variant="list" />
</div>
