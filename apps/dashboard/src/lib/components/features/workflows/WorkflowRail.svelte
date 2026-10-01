<script lang="ts">
  import type { WorkflowRun } from "@whiffle/core";
  import { IconWorkflow } from "$lib/icons";
  import { formatAgeShort } from "$lib/utils/time";
  import { whiffle } from "$lib/whiffle/client.svelte";
  import { workflowState } from "$lib/whiffle/workflow-state.svelte";
  import WorkflowRail from "./WorkflowRail.svelte";
  import WorkflowStatus from "./WorkflowStatus.svelte";

  let {
    run,
    activeSession,
  }: { run: WorkflowRun; activeSession: string | null } = $props();
</script>
<li data-flip>
  <a
    class="run focus-inset press-tint"
    href="/workflows/{run.workflowId}/runs/{run.id}"
    ><IconWorkflow class="size-4 shrink-0" />
    <span
      >{workflowState.workflows.find((entry) => entry.id === run.workflowId)?.name ?? 'Workflow'}
      <span class="age"
        >{formatAgeShort(new Date(run.startedAt).getTime(), Date.now())}</span
      ></span
    ><WorkflowStatus status={run.status} /></a
  >
  <ul>
    {#each whiffle.instances.filter((entry) => entry.workflowRunId === run.id) as instance (instance.id)}
      <li data-flip>
        <a
          aria-current={instance.id === activeSession ? 'page' : undefined}
          class="session focus-inset press-tint"
          href="/session/{instance.id}"
          >{instance.title ?? 'Untitled session'}</a
        >
      </li>
    {/each}
    {#each Object.values(workflowState.runs).filter((entry) => entry.parentRunId === run.id) as child (child.id)}
      <WorkflowRail {activeSession} run={child} />
    {/each}
  </ul>
</li>
<style>
  .run {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
    padding: var(--space-2) var(--space-3);
    min-height: 44px;
    font: var(--type-label);
  }
  .run span {
    flex: 1;
    min-width: 80px;
    overflow-wrap: anywhere;
  }
  .age {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  ul {
    margin-left: var(--space-4);
    border-left: 1px solid var(--border-hairline);
  }
  .session {
    display: block;
    min-height: 28px;
    padding: var(--space-1) var(--space-3);
    font: var(--type-label);
    overflow-wrap: anywhere;
  }
  a {
    border-radius: var(--radius-sm);
  }
  a:hover,
  a[aria-current="page"] {
    background: var(--surface-hover);
  }
  @media (pointer: coarse) {
    .session {
      min-height: 44px;
    }
  }
</style>
