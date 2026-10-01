<script lang="ts">
  import { page } from "$app/state";
  import NewSessionDialog from "$lib/cawco/spawn/NewSessionDialog.svelte";

  let dialogOpen = $state(true);
</script>

<svelte:head><title>New session | CawCo</title></svelte:head>
<main>
  <h1>New session</h1>
  <button onclick={() => { dialogOpen = true; }} type="button">
    New session
  </button>
</main>
<NewSessionDialog
  onclose={() => { dialogOpen = false; }}
  open={dialogOpen}
  prefill={page.url.searchParams.has("projectId") ? { projectId: page.url.searchParams.get("projectId") ?? undefined } : undefined}
/>

<style>
  main {
    padding: var(--space-8);
    color: var(--ink-strong);
  }
  h1 {
    font-size: var(--text-title);
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
  }
</style>
