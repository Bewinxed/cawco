<script lang="ts">
  import type { WorkflowListing } from "@cawco/core";
  import { onMount } from "svelte";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import { failureWords as message } from "#lib/cawco/hub-read.js";
  import { crossIn, crossOut } from "#lib/cawco/motion/curves.svelte.js";
  import {
    refreshWorkflows,
    workflowState,
  } from "#lib/cawco/workflow-state.svelte.js";
  import { createWorkflow } from "#lib/cawco/workflows.js";
  import WorkflowLaunch from "#lib/components/features/workflows/WorkflowLaunch.svelte";
  import WorkflowStatus from "#lib/components/features/workflows/WorkflowStatus.svelte";
  import {
    newNode,
    STARTER_PROGRAM,
  } from "#lib/components/features/workflows/workflow-ui.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component group
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { IconWorkflow } from "#lib/icons.js";
  import { formatDistanceToNow } from "#lib/utils/time.js";
  import { goto } from "$app/navigation";

  let busy = $state(false);
  let errorMessage = $state("");
  /** The workflow being launched, and the Run button its dialog grows from. */
  let launch = $state<{ workflow: WorkflowListing; from: HTMLElement }>();
  /** Until the first read is in, rows standing where the list will be. */
  const loading = $derived(!workflowState.loaded);
  const live = $derived(cawco.hub === "connected");
  const rows = $derived(
    workflowState.workflows.map((workflow) => {
      const runs = Object.values(workflowState.runs)
        .filter((run) => run.workflowId === workflow.id)
        .sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt));
      return { workflow, runs, last: runs[0] };
    })
  );
  onMount(() => {
    refreshWorkflows();
  });
  const GRAPH = { graph: { nodes: [newNode("start")], edges: [] } };
  const PROGRAM = { program: STARTER_PROGRAM };
  /**
   * The two ways a workflow is authored (§13.4): a graph the editor compiles,
   * or a program written by hand. The origin is fixed at creation because
   * there is no decompiler back the other way.
   */
  async function create(source: typeof GRAPH | typeof PROGRAM) {
    busy = true;
    errorMessage = "";
    try {
      const workflow = await createWorkflow({
        name: "program" in source ? "Untitled program" : "Untitled workflow",
        ...source,
      });
      await goto(`/workflows/${workflow.id}`);
    } catch (caught) {
      errorMessage = message(caught);
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Workflows · CawCo</title></svelte:head>
{#snippet newMenu(inEmptyState: boolean)}
  <DropdownMenu.Root>
    <DropdownMenu.Trigger disabled={!live || busy}>
      {#snippet child({ props })}
        <button
          {...props}
          class="wf-btn wf-primary"
          title={live
            ? undefined
            : "Can't create a workflow while the hub is unreachable"}
          type="button"
        >
          New workflow
        </button>
      {/snippet}
    </DropdownMenu.Trigger>
    <DropdownMenu.Content align={inEmptyState ? "start" : "end"} width="wide">
      <!-- The title (the pending content: slot and label) on one line, what it
           makes on the next. The 44px is the top bar's own height. -->
      <DropdownMenu.PendingItem
        class="min-h-c-top-bar-h flex-wrap"
        label="New graph"
        look="titled"
        pendingLabel="Creating…"
        run={() => create(GRAPH)}
      >
        <small
          class="basis-full text-size-meta leading-body font-normal text-ink-muted"
          >Draw the steps; the hub compiles them.</small
        >
      </DropdownMenu.PendingItem>
      <DropdownMenu.PendingItem
        class="min-h-c-top-bar-h flex-wrap"
        label="New program"
        look="titled"
        pendingLabel="Creating…"
        run={() => create(PROGRAM)}
      >
        <small
          class="basis-full text-size-meta leading-body font-normal text-ink-muted"
          >Write the steps as TypeScript.</small
        >
      </DropdownMenu.PendingItem>
    </DropdownMenu.Content>
  </DropdownMenu.Root>
{/snippet}

<!-- literal: 24px, 44px, 64px, minmax(180px, 1fr) 110px 110px 60px 70px -->
<!-- At 760px and under (`workflow-cards:`) the table becomes cards: each row
     its name over its age, its actions at the end of the second line. -->
<div
  class="wf flex flex-1 flex-col gap-space-6 overflow-y-auto px-space-6 py-space-7 workflow-cards:px-space-4 workflow-cards:py-space-4"
  data-slot="list-page"
>
  <header class="wf-row wf-spread">
    <div>
      <h1 class="mb-space-1">Workflows</h1>
      <p class="wf-muted">Reusable steps across your fleet.</p>
    </div>
    <div class="wf-row">{@render newMenu(false)}</div>
  </header>
  <!-- An outage is said once, by the reconnect banner over the page: a read
       that failed for it adds no line while there are rows to keep showing,
       and a list that was never read says why it is empty. -->
  {#if errorMessage || (workflowState.error && (live || !rows.length))}
    <p class="wf-error" role="alert">{errorMessage || workflowState.error}</p>
  {/if}
  <!-- Until the first read is in, rows at the height the list's rows take
       stand where it will be; then the two cross-fade (the skeleton leaves
       the flow as it goes), so nothing below them moves. -->
  {#if loading}
    <table
      aria-label="Loading workflows"
      class="block w-full rounded-lg bg-surface-raised p-space-3 shadow-tile"
      role="status"
      style:--cols="minmax(180px, 1fr) 110px 110px 60px 70px"
      style:--cols-cards="1fr auto"
      style:--name-min="24px"
      style:--name-min-coarse="44px"
      style:--row-min="64px"
      out:crossOut
    >
      <thead class="workflow-cards:block workflow-cards:w-full">
        <tr
          class="grid grid-cols-(--cols) items-center gap-space-3 p-space-3 text-left text-size-label font-medium text-ink-muted workflow-cards:hidden!"
          data-slot="heading"
        >
          <th class="font-medium" scope="col">Name</th>
          <th class="font-medium" scope="col">Last run</th>
          <th class="font-medium" scope="col">Started</th>
          <th class="font-medium" scope="col">Runs</th>
          <th class="font-medium" scope="col">Actions</th>
        </tr>
      </thead>
      <tbody
        aria-hidden="true"
        class="workflow-cards:block workflow-cards:w-full"
      >
        {#each [0, 1, 2] as index (index)}
          <tr
            class="grid min-h-(--row-min) grid-cols-(--cols) items-center gap-space-3 border-t border-t-border-hairline p-space-3 workflow-cards:grid-cols-(--cols-cards)"
            data-slot="workflow-row"
          >
            <td
              data-slot="name"
              class="grid min-h-(--name-min) coarse:min-h-(--name-min-coarse) coarse:content-center wrap-anywhere font-medium text-ink-strong workflow-cards:col-1"
              ><Skeleton class="h-icon-md" width="title" /></td
            >
            <td><Skeleton class="h-icon-lg" width="short" /></td>
            <td data-slot="age" class="workflow-cards:col-1"
              ><Skeleton class="h-icon-md" width="label" /></td
            >
            <td data-slot="count" class="num workflow-cards:hidden"
              ><Skeleton class="h-icon-md" width="glyph" /></td
            >
            <td class="workflow-cards:col-2 workflow-cards:row-2"
              ><Skeleton class="h-space-8" width="word" /></td
            >
          </tr>
        {/each}
      </tbody>
    </table>
  {:else if !rows.length}
    {#if !workflowState.error}
      <!-- literal: 420px -->
      <div in:crossIn style:--empty-max="420px">
        <EmptyState
          class="mx-auto w-full max-w-(--empty-max)"
          icon={IconWorkflow}
          line="A workflow is a graph of steps that run one after another across your fleet."
          title="No workflows yet"
        >
          {#snippet action()}
            {@render newMenu(true)}
          {/snippet}
        </EmptyState>
      </div>
    {/if}
  {:else}
    <table
      aria-label="Workflows"
      class="block w-full rounded-lg bg-surface-raised p-space-3 shadow-tile"
      style:--cols="minmax(180px, 1fr) 110px 110px 60px 70px"
      style:--cols-cards="1fr auto"
      style:--name-min="24px"
      style:--name-min-coarse="44px"
      style:--row-min="64px"
      in:crossIn
    >
      <thead class="workflow-cards:block workflow-cards:w-full">
        <tr
          class="grid grid-cols-(--cols) items-center gap-space-3 p-space-3 text-left text-size-label font-medium text-ink-muted workflow-cards:hidden!"
          data-slot="heading"
        >
          <th class="font-medium" scope="col">Name</th>
          <th class="font-medium" scope="col">Last run</th>
          <th class="font-medium" scope="col">Started</th>
          <th class="font-medium" scope="col">Runs</th>
          <th class="font-medium" scope="col">Actions</th>
        </tr>
      </thead>
      <tbody class="workflow-cards:block workflow-cards:w-full">
        {#each rows as { workflow, runs, last } (workflow.id)}
          <tr
            class="grid min-h-(--row-min) grid-cols-(--cols) items-center gap-space-3 border-t border-t-border-hairline p-space-3 workflow-cards:grid-cols-(--cols-cards)"
            data-slot="workflow-row"
          >
            <td>
              <a
                data-slot="name"
                class="grid min-h-(--name-min) coarse:min-h-(--name-min-coarse) coarse:content-center wrap-anywhere font-medium text-ink-strong workflow-cards:col-1"
                href="/workflows/{workflow.id}"
                >{workflow.name}
                <span class="wf-muted">{workflow.description}</span></a
              >
            </td>
            <td>
              {#if last}
                <WorkflowStatus status={last.status} />
              {:else}
                <span class="wf-muted">No runs</span>
              {/if}
            </td>
            <td data-slot="age" class="wf-muted workflow-cards:col-1">
              {last ? formatDistanceToNow(new Date(last.startedAt)) : "—"}
              <span class="hidden workflow-cards:inline" data-slot="mobile"
                >{` · ${runs.length} ${runs.length === 1 ? "run" : "runs"}`}</span
              >
            </td>
            <td data-slot="count" class="num workflow-cards:hidden"
              >{runs.length}</td
            >
            <td class="workflow-cards:col-2 workflow-cards:row-2">
              <button
                class="wf-btn workflow-cards:hidden!"
                data-slot="desktop"
                disabled={!live}
                onclick={(event) => {
                  launch = { workflow, from: event.currentTarget };
                }}
                title={live
                  ? undefined
                  : "Can't run while the hub is unreachable"}
                type="button"
              >
                Run
              </button>
              <details class="hidden workflow-cards:block" data-slot="mobile">
                <summary
                  aria-label="Actions for {workflow.name}"
                  class="pressable workflow-cards:flex workflow-cards:min-h-(--summary-min) workflow-cards:items-center"
                  style:--summary-min="44px"
                >
                  Actions
                </summary>
                <button
                  class="wf-btn"
                  disabled={!live}
                  onclick={(event) => {
                    launch = { workflow, from: event.currentTarget };
                  }}
                  title={live
                    ? undefined
                    : "Can't run while the hub is unreachable"}
                  type="button"
                >
                  Run
                </button>
              </details>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>
{#if launch}
  <WorkflowLaunch
    from={launch.from}
    onclose={() => {
      launch = undefined;
    }}
    workflow={launch.workflow}
  />
{/if}
