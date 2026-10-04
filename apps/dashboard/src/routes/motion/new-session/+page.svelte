<script lang="ts">
  import { onMount } from "svelte";
  import { newSession } from "#lib/cawco/spawn/new-session.svelte.js";
  import { page } from "$app/state";

  /** The bench opens the Shell's one dialog, on `?projectId=` when given. */
  function open() {
    const projectId = page.url.searchParams.get("projectId");
    newSession(projectId ? { projectId } : undefined);
  }
  onMount(open);
</script>

<svelte:head><title>New session | CawCo</title></svelte:head>
<main>
  <h1>New session</h1>
  <button onclick={open} type="button">New session</button>
</main>

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
