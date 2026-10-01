<script lang="ts">
  import type { Workflow } from "@whiffle/core";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import WorkflowLaunch from "$lib/components/features/workflows/WorkflowLaunch.svelte";
  import WorkflowStatus from "$lib/components/features/workflows/WorkflowStatus.svelte";
  import {
    newNode,
    STARTER_PROGRAM,
  } from "$lib/components/features/workflows/workflow-ui";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component group
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { EmptyState } from "$lib/components/ui/empty";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { IconWorkflow } from "$lib/icons";
  import { formatDistanceToNow } from "$lib/utils/time";
  import { whiffle } from "$lib/whiffle/client.svelte";
  import { message } from "$lib/whiffle/delegate-types";
  import { crossIn, crossOut } from "$lib/whiffle/motion/curves.svelte";
  import {
    refreshWorkflows,
    workflowState,
  } from "$lib/whiffle/workflow-state.svelte";
  import { createWorkflow } from "$lib/whiffle/workflows";
  import "$lib/components/features/workflows/workflows.css";

  let busy = $state(false);
  let errorMessage = $state("");
  /** The workflow being launched, and the Run button its dialog grows from. */
  let launch = $state<{ workflow: Workflow; from: HTMLElement }>();
  /** Until the first read is in, rows standing where the list will be. */
  const loading = $derived(!workflowState.loaded);
  const live = $derived(whiffle.hub === "connected");
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
<svelte:head><title>Workflows · Whiffle</title></svelte:head>
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
    <DropdownMenu.Content align={inEmptyState ? 'start' : 'end'} class="w-64">
      <DropdownMenu.PendingItem
        class="new-item"
        label="New graph"
        pendingLabel="Creating…"
        run={() => create(GRAPH)}
      >
        <small>Draw the steps; the hub compiles them.</small>
      </DropdownMenu.PendingItem>
      <DropdownMenu.PendingItem
        class="new-item"
        label="New program"
        pendingLabel="Creating…"
        run={() => create(PROGRAM)}
      >
        <small>Write the steps as TypeScript.</small>
      </DropdownMenu.PendingItem>
    </DropdownMenu.Content>
  </DropdownMenu.Root>
{/snippet}

<div class="wf list-page">
  <header class="wf-row wf-spread">
    <div>
      <h1>Workflows</h1>
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
      class="table"
      role="status"
      out:crossOut
    >
      <thead>
        <tr class="heading">
          <th scope="col">Name</th>
          <th scope="col">Last run</th>
          <th scope="col">Started</th>
          <th scope="col">Runs</th>
          <th scope="col">Actions</th>
        </tr>
      </thead>
      <tbody aria-hidden="true">
        {#each [0, 1, 2] as index (index)}
          <tr class="workflow-row">
            <td class="name"><Skeleton class="h-4 w-40" /></td>
            <td><Skeleton class="h-5 w-16" /></td>
            <td class="age"><Skeleton class="h-4 w-20" /></td>
            <td class="count"><Skeleton class="h-4 w-6" /></td>
            <td><Skeleton class="h-8 w-14" /></td>
          </tr>
        {/each}
      </tbody>
    </table>
  {:else if !rows.length}
    {#if !workflowState.error}
      <div in:crossIn>
        <EmptyState
          class="mx-auto w-full max-w-[420px]"
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
    <table aria-label="Workflows" class="table" in:crossIn>
      <thead>
        <tr class="heading">
          <th scope="col">Name</th>
          <th scope="col">Last run</th>
          <th scope="col">Started</th>
          <th scope="col">Runs</th>
          <th scope="col">Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as { workflow, runs, last } (workflow.id)}
          <tr class="workflow-row">
            <td>
              <a class="name" href="/workflows/{workflow.id}"
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
            <td class="age wf-muted">
              {last ? formatDistanceToNow(new Date(last.startedAt)) : '—'}
              <span class="mobile"
                >{` · ${runs.length} ${runs.length === 1 ? 'run' : 'runs'}`}</span
              >
            </td>
            <td class="count">{runs.length}</td>
            <td>
              <button
                class="wf-btn desktop"
                disabled={!live}
                onclick={(event) => { launch = { workflow, from: event.currentTarget }; }}
                title={live ? undefined : "Can't run while the hub is unreachable"}
                type="button"
              >
                Run
              </button>
              <details class="mobile">
                <summary
                  aria-label="Actions for {workflow.name}"
                  class="pressable"
                >
                  Actions
                </summary>
                <button
                  class="wf-btn"
                  disabled={!live}
                  onclick={(event) => { launch = { workflow, from: event.currentTarget }; }}
                  title={live ? undefined : "Can't run while the hub is unreachable"}
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
    onclose={() => { launch = undefined; }}
    workflow={launch.workflow}
  />
{/if}
<style>
  .list-page {
    position: relative;
    padding: var(--space-7) var(--space-6);
    overflow-y: auto;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }
  header h1 {
    margin-bottom: var(--space-1);
  }
  .table {
    display: block;
    width: 100%;
    background: var(--surface-raised);
    border-radius: var(--radius-lg);
    padding: var(--space-3);
    box-shadow: var(--shadow-tile);
  }
  .heading,
  .workflow-row {
    display: grid;
    grid-template-columns: minmax(180px, 1fr) 110px 110px 60px 70px;
    gap: var(--space-3);
    align-items: center;
    padding: var(--space-3);
  }
  .heading {
    text-align: left;
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    color: var(--ink-muted);
  }
  .workflow-row {
    border-top: 1px solid var(--border-hairline);
    min-height: 64px;
  }
  th {
    font-weight: var(--weight-strong);
  }
  .name {
    min-height: 24px;
    display: grid;
    color: var(--ink-strong);
    font-weight: var(--weight-strong);
    overflow-wrap: anywhere;
  }
  .count {
    font-variant-numeric: tabular-nums;
  }
  /* The title (the pending content: slot and label) on one line, what it
     makes on the next. */
  :global(.new-item) {
    flex-wrap: wrap;
    row-gap: var(--space-1);
    min-height: 44px;
    color: var(--ink-strong);
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
  }
  :global(.new-item) small {
    flex-basis: 100%;
    color: var(--ink-muted);
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    line-height: var(--leading-body);
  }
  .mobile {
    display: none;
  }
  /* DESIGN.md: 44px under a coarse pointer at any width. The row is 64px but
     the link was 24, so a thumb landed on the row and not on the target. */
  @media (pointer: coarse) {
    .name {
      min-height: 44px;
      align-content: center;
    }
  }
  @media (max-width: 760px) {
    .heading,
    .desktop {
      display: none !important;
    }
    span.mobile {
      display: inline;
    }
    details.mobile {
      display: block;
    }
    .count {
      display: none;
    }
    thead,
    tbody {
      display: block;
      width: 100%;
    }
    .workflow-row {
      grid-template-columns: 1fr auto;
    }
    .name {
      grid-column: 1;
    }
    .age {
      grid-column: 1;
    }
    .workflow-row > :last-child {
      grid-column: 2;
      grid-row: 2;
    }
    summary {
      min-height: 44px;
      display: flex;
      align-items: center;
    }
    .list-page {
      padding: var(--space-4);
    }
  }
</style>
