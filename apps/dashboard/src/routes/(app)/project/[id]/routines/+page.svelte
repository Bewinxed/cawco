<script lang="ts">
  /**
   * PREVIEW (S1 b): the project's routines on a page of their own, reached
   * from the project head's Routines button. Its head is a page head: back
   * to the project, then the title. The view under it is the tab's own.
   */
  import { untrack } from "svelte";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import { CawLead } from "#lib/cawco/project/caw-lead.svelte.js";
  import PreviewSwitches from "#lib/cawco/routines/PreviewSwitches.svelte";
  import { picks } from "#lib/cawco/routines/preview.svelte.js";
  import ViewRoutines from "#lib/cawco/views/ViewRoutines.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconChevronLeft } from "#lib/icons.js";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const projectId = $derived(data.project?.id ?? "");
  const lead = new CawLead(
    () => projectId,
    () => [],
    () => false
  );
  let readFor = "";
  $effect(() => {
    const id = projectId;
    if (cawco.status !== "connected" || !id || readFor === id) {
      return;
    }
    readFor = id;
    untrack(() => lead.read());
  });
  const canTalk = $derived(lead.view !== null && !lead.view.problem);
</script>

<svelte:head>
  <title>Routines · {data.project?.name ?? "Project"} · CawCo</title>
</svelte:head>

{#if data.project}
  <div class="page">
    <header class="head">
      <Button
        class="back pressable"
        href="/project/{projectId}"
        size="sm"
        variant="ghost"
      >
        <IconChevronLeft />
        {data.project.name}
      </Button>
      <h1 class="title">Routines</h1>
    </header>
    <div class="body">
      {#if lead.view}
        {#key picks.layout}
          <ViewRoutines
            {canTalk}
            cawProblem={lead.view.problem ?? null}
            layout={picks.layout}
            project={{
              id: data.project.id,
              name: data.project.name,
              template: data.template,
            }}
          />
        {/key}
      {/if}
    </div>
  </div>
  <PreviewSwitches {projectId} />
{:else}
  <div class="flex flex-1 items-center justify-center p-6">
    <p class="text-body text-muted-foreground">
      No such project. It may have been removed; pick another from the rail.
    </p>
  </div>
{/if}

<style>
  .page {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-block-size: 0;
    overflow-y: auto;
  }
  .head {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-1);
    padding: var(--space-6) var(--space-6) var(--space-4) var(--space-7);
  }
  .head :global(.back) {
    margin-inline-start: calc(var(--space-3) * -1);
  }
  .title {
    font: var(--type-title);
    color: var(--ink-strong);
  }
  .body {
    padding: 0 var(--space-6) var(--space-6) var(--space-7);
  }
  @media (max-width: 899px) {
    .head {
      padding: var(--space-5) var(--space-5) var(--space-3);
    }
    .body {
      padding-inline: var(--space-5);
    }
  }
</style>
