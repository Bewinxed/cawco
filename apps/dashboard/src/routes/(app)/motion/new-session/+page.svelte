<script lang="ts">
  import { commonWords } from "@cawco/core";
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

<svelte:head><title>{commonWords.newSession} | CawCo</title></svelte:head>
<main class="p-space-8 text-ink-strong">
  <h1 class="text-size-title font-medium text-ink-strong">
    {commonWords.newSession}
  </h1>
  <button class="select-none" onclick={open} type="button"
    >{commonWords.newSession}</button
  >
</main>
