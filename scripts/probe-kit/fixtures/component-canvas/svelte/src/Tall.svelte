<script lang="ts">
  let { rows = 30 }: { rows?: number } = $props();
</script>

<ol class="tall">
  {#each { length: rows } as _, at}
    <li>Row {at + 1}</li>
  {/each}
</ol>

<style>
  .tall { margin: 0; padding: 0 0 0 24px; inline-size: 320px; }
  .tall li { block-size: 60px; border-block-end: 1px solid light-dark(#e4e4ea, #2e2e36); }
</style>
