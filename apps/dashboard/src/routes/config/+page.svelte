<script lang="ts">
  import ConfigRail from "#lib/cawco/config/ConfigRail.svelte";
</script>

<svelte:head><title>Configure · CawCo</title></svelte:head>

<div class="list"><ConfigRail variant="list" /></div>

<style>
  .list {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
  }
</style>
