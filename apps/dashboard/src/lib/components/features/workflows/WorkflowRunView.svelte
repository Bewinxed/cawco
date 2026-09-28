<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { goto } from "$app/navigation";
  import PendingContent, {
    whileIdle,
  } from "$lib/components/ui/button/pending-content.svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component group
  import * as Dialog from "$lib/components/ui/dialog";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { whiffle } from "$lib/whiffle/client.svelte";
  import { confirm } from "$lib/whiffle/confirm.svelte";
  import { message } from "$lib/whiffle/delegate-types";
  import type { UsageSummary } from "$lib/whiffle/usage";
  import {
    refreshWorkflowEffects,
    refreshWorkflowRun,
    workflowState,
  } from "$lib/whiffle/workflow-state.svelte";
  import {
    answerWorkflow,
    cancelWorkflowRun,
    rerunWorkflow,
  } from "$lib/whiffle/workflows";
  import {
    type JournalCheckpoint,
    journalCheckpoints,
    journalGraph,
    journalLog,
    journalStateTouches,
  } from "./journal-graph";
  import WorkflowCanvas from "./WorkflowCanvas.svelte";
  import WorkflowStatus from "./WorkflowStatus.svelte";
  import { duration } from "./workflow-ui";

  let { runId, onprogram }: { onprogram?: () => void; runId: string } =
    $props();
  const narrow = new MediaQuery("(max-width: 1023px)");
  let selected = $state<string>();
  let selectedEnd = $state(false);
  let stepsOpen = $state(true);
  let tab = $state("steps");
  let errorMessage = $state("");
  /** The action whose request is out ("rerun", "answer:<label>", "cancel"). */
  let acting = $state<string | null>(null);
  const busy = $derived(acting !== null);
  let now = $state(Date.now());
  let other = $state("");
  let note = $state("");
  let sessionCosts = $state<Record<string, number>>({});
  const costs = $derived(
    Object.fromEntries(
      whiffle.instances
        .filter(
          (entry) =>
            entry.sessionId && sessionCosts[entry.sessionId] !== undefined
        )
        .map((entry) => [entry.id, sessionCosts[entry.sessionId as string]])
    )
  );
  let scope = $state("root");
  let logOpen = $state(false);
  const run = $derived(workflowState.details[runId]);
  const workflow = $derived(
    workflowState.workflows.find((entry) => entry.id === run?.workflowId)
  );
  const origin = $derived(workflow?.origin ?? "editor");
  const effects = $derived(workflowState.effects[runId] ?? []);
  // A code-origin run has no graph to paint: the shape comes from the journal.
  const journal = $derived(
    origin === "code" ? journalGraph(effects) : undefined
  );
  const journalNodes = $derived(
    new Map((journal?.nodes ?? []).map((entry) => [entry.id, entry]))
  );
  const checkpoints = $derived(journalCheckpoints(effects));
  const pinned = $derived.by(() => {
    const byNode: Record<string, JournalCheckpoint[]> = {};
    for (const mark of checkpoints) {
      if (mark.nodeId) {
        byNode[mark.nodeId] ??= [];
        byNode[mark.nodeId].push(mark);
      }
    }
    return byNode;
  });
  const logLines = $derived(journalLog(effects));
  const stateTouches = $derived(journalStateTouches(effects));
  const slots = $derived(
    Object.entries((run?.state.slots ?? {}) as Record<string, unknown>)
  );
  const sorted = $derived(
    run
      ? [...run.steps].sort(
          (a, b) =>
            +(a.startedAt ? new Date(a.startedAt) : Number.MAX_SAFE_INTEGER) -
            +(b.startedAt ? new Date(b.startedAt) : Number.MAX_SAFE_INTEGER)
        )
      : []
  );
  const step = $derived(run?.steps.find((entry) => entry.id === selected));
  const node = $derived(
    run?.graph?.nodes.find((entry) => entry.id === step?.nodeId) ??
      (step ? journalNodes.get(step.nodeId)?.node : undefined)
  );
  const titleOf = (nodeId: string) =>
    run?.graph?.nodes.find((entry) => entry.id === nodeId)?.title ??
    journalNodes.get(nodeId)?.title ??
    nodeId;
  /** Steps and checkpoint markers in one schedule order. */
  const timeline = $derived.by(() => {
    const at = (value: Date | string | null) =>
      value ? +new Date(value) : Number.MAX_SAFE_INTEGER;
    return [
      ...sorted.map((entry) => ({
        key: entry.id,
        at: at(entry.startedAt),
        step: entry,
        mark: undefined as JournalCheckpoint | undefined,
      })),
      ...checkpoints.map((mark) => ({
        key: `checkpoint-${mark.seq}`,
        at: at(mark.at),
        step: undefined,
        mark,
      })),
    ].sort((a, b) => a.at - b.at);
  });
  const attempts = $derived(
    run?.attempts
      .filter((entry) => entry.stepId === step?.id)
      .sort((a, b) => a.number - b.number) ?? []
  );
  const live = $derived(whiffle.hub === "connected");
  const graph = $derived.by(() => {
    if (!run || scope === "root") {
      return run?.graph;
    }
    const id = scope.slice(0, scope.lastIndexOf("["));
    const map = run.graph?.nodes.find((entry) => entry.id === id);
    return map?.kind === "map" ? map.body : run.graph;
  });
  const scopedSteps = $derived(
    scope === "root"
      ? sorted.filter((entry) => entry.mapIndex === null)
      : sorted.filter(
          (entry) =>
            entry.mapIndex ===
              Number(scope.slice(scope.lastIndexOf("[") + 1, -1)) &&
            graph?.nodes.some((item) => item.id === entry.nodeId)
        )
  );
  $effect(() => {
    const id = runId;
    refreshWorkflowRun(id).catch((caught) => {
      errorMessage = message(caught);
    });
  });
  // The journal is re-read whenever the run moves: a checkpoint, a log line or
  // a new call arrives as a frame without a step row of its own.
  $effect(() => {
    const moved = run;
    if (moved) {
      refreshWorkflowEffects(runId).catch((caught) => {
        errorMessage = message(caught);
      });
    }
  });
  $effect(() => {
    // Narrow shows the drawer as a modal sheet; opening one unasked on arrival
    // would bury the run behind a dialog the operator never opened.
    if (run?.status === "done" && !(selectedEnd || narrow.current)) {
      selectedEnd = true;
      selected = run.steps.find(
        (entry) => entry.kind === "end" && entry.status === "passed"
      )?.id;
    }
  });
  onMount(() => {
    const timer = setInterval(() => {
      now = Date.now();
    }, 1000);
    return () => clearInterval(timer);
  });
  $effect(() => {
    const current = run;
    if (current) {
      untrack(refreshCosts);
    }
  });
  function refreshCosts() {
    fetch("/api/usage/summary?groupBy=session")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const summary = (await response.json()) as UsageSummary;
        sessionCosts = Object.fromEntries(
          summary.rows.map((row) => [String(row.key), row.costUsd])
        );
      })
      .catch((caught) => {
        errorMessage = message(caught);
      });
  }
  async function act(key: string, action: () => Promise<unknown>) {
    acting = key;
    errorMessage = "";
    try {
      await action();
      await refreshWorkflowRun(runId);
    } catch (caught) {
      errorMessage = message(caught);
    } finally {
      acting = null;
    }
  }
  async function cancel() {
    const names = sorted
      .filter((entry) => entry.status === "running" && entry.instanceId)
      .map((entry) => `${titleOf(entry.nodeId)} (${entry.instanceId})`);
    await confirm({
      title: "Cancel workflow run?",
      body: `Stops these live sessions and any child runs: ${names.length ? names.join(", ") : "No live step sessions reported"}. Pending steps will be skipped.`,
      confirmLabel: "Cancel run",
      destructive: true,
      pendingLabel: "Cancelling…",
      run: () => act("cancel", () => cancelWorkflowRun(runId)),
    });
  }
  async function rerun() {
    if (!(step && run)) {
      return;
    }
    const selectedNode = step.nodeId;
    const { workflowId } = run;
    await act("rerun", async () => {
      const result = await rerunWorkflow(runId, selectedNode);
      await goto(`/workflows/${workflowId}/runs/${result.runId}`);
    });
  }
</script>
{#snippet drawer()}
  {#if step && run}
    <div class="wf wf-stack drawer">
      <div class="wf-row wf-spread">
        <h2>{node?.title ?? step.nodeId}</h2>
        <WorkflowStatus status={step.status} />
      </div>
      <p class="wf-muted">
        {#if node?.kind === 'step'}
          Attempt
          {attempts.at(-1)?.number ?? 0}/{(node.retries ?? 2) + 1}
          ·
          {duration(step.startedAt, step.endedAt, now)}
          ·
          {step.instanceId && costs[step.instanceId] !== undefined ? `$${costs[step.instanceId].toFixed(4)}` : 'Cost unreported'}
        {:else}
          {duration(step.startedAt, step.endedAt, now)}
        {/if}
      </p>
      {#if attempts.at(-1)?.renderedPrompt}
        <section class="wf-stack">
          <h3>Told</h3>
          <pre class="wf-well">{attempts.at(-1)?.renderedPrompt}</pre>
        </section>
      {/if}
      <section class="wf-stack">
        <h3>Returned</h3>
        {#if step.failure}
          <p class="wf-error">Step failed: {step.failure}</p>
        {:else}
          <pre
            class="wf-well"
          >{JSON.stringify(step.kind === 'end' ? run.result : step.result, null, 2) ?? 'No result reported.'}</pre>
        {/if}
      </section>
      {#if pinned[step.nodeId]?.length}
        <section class="wf-stack">
          <h3>Checkpoints</h3>
          {#each pinned[step.nodeId] as mark (mark.seq)}
            <div class="wf-well">
              <div class="wf-row wf-spread">
                <strong>{mark.label}</strong
                ><span class="wf-muted"
                  >{new Date(mark.at).toLocaleTimeString()}</span
                >
              </div>
              {#if mark.data !== null}
                <pre>{JSON.stringify(mark.data, null, 2)}</pre>
              {/if}
            </div>
          {/each}
        </section>
      {/if}
      {#if stateTouches[step.nodeId]}
        {@const touch = stateTouches[step.nodeId]}
        <section class="wf-stack">
          <h3>State</h3>
          <p class="wf-muted">
            {touch.reads}
            {touch.reads === 1 ? 'read' : 'reads'}
            ·
            {touch.writes}
            {touch.writes === 1 ? 'write' : 'writes'}
            of {touch.names.join(', ')}
            while this step was the program's latest call.
          </p>
          {#each slots as [slot, value] (slot)}
            <div class="wf-well">
              <strong>{slot}</strong>
              <pre>{JSON.stringify(value, null, 2)}</pre>
            </div>
          {/each}
        </section>
      {/if}
      {#if step.instanceId}
        <a class="wf-btn" href="/session/{step.instanceId}">Open session</a>
      {/if}
      {#if step.childRunId && workflowState.runs[step.childRunId]}
        {@const child = workflowState.runs[step.childRunId]}
        <div class="wf-row">
          <WorkflowStatus status={child.status} />
          <a class="wf-btn" href="/workflows/{child.workflowId}/runs/{child.id}"
            >Open child run</a
          >
        </div>
      {/if}
      {#if attempts.length}
        <h3>Attempts</h3>
      {/if}
      {#each attempts as attempt (attempt.id)}
        <details class="wf-well">
          <summary>
            Attempt {attempt.number} ·
            {duration(attempt.startedAt, attempt.endedAt, now)}
          </summary>
          <h3>Told</h3>
          <pre>{attempt.renderedPrompt}</pre>
          <h3>Returned</h3>
          <pre
          >{attempt.failure ?? JSON.stringify(attempt.result, null, 2)}</pre>
        </details>
      {/each}
      {#if step.kind !== 'start'}
        <button
          aria-busy={acting === 'rerun' || undefined}
          aria-disabled={acting === 'rerun' || undefined}
          class="wf-btn"
          disabled={(busy && acting !== 'rerun') || !live}
          onclick={whileIdle(() => acting === 'rerun', rerun)}
          title={live ? undefined : "Can't re-run while the hub is unreachable"}
          type="button"
        >
          <PendingContent
            failed={errorMessage !== ''}
            label="Re-run from step"
            pending={acting === 'rerun'}
            pendingLabel="Re-running…"
          />
        </button>
      {/if}
      <button
        class="wf-btn"
        onclick={() => { selected = undefined; }}
        type="button"
      >
        Close step
      </button>
    </div>
  {/if}
{/snippet}
<div class="wf run-view">
  {#if errorMessage}
    <p class="wf-error" role="alert">{errorMessage}</p>
  {/if}
  <!-- The header names the run's workflow and its origin, and the canvas
       takes its shape from the origin: both wait for the workflow list, so
       the name never paints as "Workflow" and then widens into the real one. -->
  {#if !(run && (workflow || workflowState.loaded))}
    <div
      aria-label="Loading workflow run"
      class="wf-stack loading"
      role="status"
    >
      <Skeleton class="h-20 w-full" />
      <Skeleton class="h-20 w-full" />
      <p>Loading workflow run…</p>
    </div>
  {:else}
    <header class="wf-stack">
      <div class="wf-row wf-spread">
        <div>
          <p class="wf-muted origin">
            <a href="/workflows/{run.workflowId}"
              >{workflow?.name ?? 'Workflow'}</a
            ><span class="origin-word"
              >{origin === 'code' ? 'program' : 'editor'}</span
            >
          </p>
          <h1>Workflow run {run.id.slice(0, 8)}</h1>
        </div>
        <WorkflowStatus status={run.status} />
      </div>
      <div class="wf-row wf-spread">
        <div class="wf-row">
          {#if run.status === 'running' || run.status === 'waiting'}
            <button
              class="wf-btn"
              disabled={busy || !live}
              onclick={cancel}
              title={live ? undefined : "Can't cancel while the hub is unreachable"}
              type="button"
            >
              Cancel run
            </button>
          {/if}
          {#if onprogram}
            <button class="wf-btn" onclick={onprogram} type="button">
              View program
            </button>
          {:else}
            <a class="wf-btn" href="/workflows/{run.workflowId}?tab=program"
              >View program</a
            >
          {/if}
          <span class="wf-muted"
            >{run.steps.filter((entry) => entry.status === 'passed').length}/{run.steps.length}
            steps passed · {duration(run.startedAt, run.endedAt, now)}</span
          >
        </div>
        {#if run.supervisorInstanceId}
          <a class="wf-btn" href="/session/{run.supervisorInstanceId}"
            >Supervisor</a
          >
        {/if}
      </div>
    </header>
    {#if logLines.length}
      <details class="log" bind:open={logOpen}>
        <summary>Log · {logLines.length}</summary>
        <ol>
          {#each logLines as line (line.seq)}
            <li>
              <time>{new Date(line.at).toLocaleTimeString()}</time
              ><span>{line.text}</span>
            </li>
          {/each}
        </ol>
      </details>
    {/if}
    {#if run.failure}
      <p class="wf-error">Workflow run failed: {run.failure}</p>
    {/if}
    {#if run.status === 'waiting' && run.ask}
      {@const ask = run.ask}
      <section class="answer wf-stack">
        <h2>Answer · {ask.question}</h2>
        <div class="options">
          {#each ask.options as option (option.label)}
            {@const key = `answer:${option.label}`}
            <button
              aria-busy={acting === key || undefined}
              aria-disabled={acting === key || undefined}
              class="wf-btn"
              disabled={(busy && acting !== key) || !live}
              onclick={whileIdle(() => acting === key, () => act(key, () => answerWorkflow(runId, ask.stepId, option.label, note)))}
              title={live ? undefined : "Can't answer while the hub is unreachable"}
              type="button"
            >
              <span class="option-label"
                ><PendingContent
                  failed={errorMessage !== ''}
                  label={option.label}
                  pending={acting === key}
                  pendingLabel="Answering…"
                /></span
              >
              {#if option.description}
                <small>{option.description}</small>
              {/if}
            </button>
          {/each}
        </div>
        <label>Note (optional)<input bind:value={note}></label>
        {#if ask.allowOther}
          <div class="wf-row">
            <label>Other answer<input bind:value={other}></label
            ><button
              aria-busy={acting === 'answer' || undefined}
              aria-disabled={acting === 'answer' || undefined}
              class="wf-btn"
              disabled={!other || (busy && acting !== 'answer') || !live}
              onclick={whileIdle(() => acting === 'answer', () => act('answer', () => answerWorkflow(runId, ask.stepId, other, note)))}
              title={live ? undefined : "Can't answer while the hub is unreachable"}
              type="button"
            >
              <PendingContent
                failed={errorMessage !== ''}
                label="Send answer"
                pending={acting === 'answer'}
                pendingLabel="Sending…"
              />
            </button>
          </div>
        {/if}
      </section>
    {/if}
    {#if narrow.current}
      <div class="wf-row tabs">
        <button
          aria-pressed={tab === 'steps'}
          class="wf-btn"
          onclick={() => { tab = 'steps'; }}
          type="button"
        >
          Steps
        </button><button
          aria-pressed={tab === 'canvas'}
          class="wf-btn"
          onclick={() => { tab = 'canvas'; }}
          type="button"
        >
          Canvas
        </button>
      </div>
    {/if}
    <div class="run-body">
      {#if !narrow.current || tab === 'steps'}
        <aside class="steps" class:collapsed={!(stepsOpen || narrow.current)}>
          {#if !narrow.current}
            <button
              aria-expanded={stepsOpen}
              class="wf-btn"
              onclick={() => { stepsOpen = !stepsOpen; }}
              type="button"
            >
              Steps
            </button>
          {/if}
          {#if stepsOpen || narrow.current}
            {#each timeline as row (row.key)}
              {#if row.step}
                {@const entry = row.step}
                <button
                  class="step-row pressable"
                  onclick={() => { selected = entry.id; }}
                  type="button"
                  class:chosen={entry.id === selected}
                >
                  <span
                    >{titleOf(entry.nodeId)}
                    {entry.mapIndex === null ? '' : ` [${entry.mapIndex}]`}</span
                  ><WorkflowStatus status={entry.status} />
                  <small>{duration(entry.startedAt, entry.endedAt, now)}</small>
                </button>
              {:else if row.mark}
                <p class="checkpoint-row">
                  <span aria-hidden="true" class="mark"></span
                  ><span>{row.mark.label}</span
                  ><small>{new Date(row.mark.at).toLocaleTimeString()}</small>
                </p>
              {/if}
            {/each}
          {/if}
        </aside>
      {/if}
      {#if (graph || journal) && (!narrow.current || tab === 'canvas')}
        <div class="graph">
          {#if Object.keys(run.edges).length > 1}
            <label class="scope"
              >Scope<select bind:value={scope}>
                {#each Object.keys(run.edges) as key (key)}
                  <option>{key}</option>
                {/each}
              </select></label
            >
          {/if}
          <WorkflowCanvas
            checkpoints={pinned}
            {costs}
            executionScope={scope}
            graph={graph ?? { nodes: [], edges: [] }}
            {journal}
            {now}
            onselect={(id) => { selected = scopedSteps.find((entry) => entry.nodeId === id)?.id; }}
            readonly
            {run}
            selection={step?.nodeId}
            steps={scopedSteps}
          />
        </div>
      {/if}
      {#if step && !narrow.current}
        <aside class="detail">{@render drawer()}</aside>
      {/if}
    </div>
  {/if}
</div>
{#if narrow.current && step}
  <Dialog.Root
    onOpenChange={(open) => { if (!open) { selected = undefined; } }}
    open
    ><Dialog.Content class="max-h-[90dvh] overflow-y-auto"
      ><Dialog.Title>Step details</Dialog.Title
      ><Dialog.Description
        >The prompt, result and attempts recorded by the
        hub.</Dialog.Description
      >{@render drawer()}</Dialog.Content
    ></Dialog.Root
  >
{/if}
<style>
  .run-view {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
    overflow-y: auto;
  }
  header {
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--border-hairline);
  }
  header a {
    display: inline-flex;
    min-height: 24px;
    align-items: center;
  }
  .run-body {
    display: flex;
    flex: 1;
    min-height: 350px;
  }
  .steps {
    width: 232px;
    flex-shrink: 0;
    padding: var(--space-3);
    overflow-y: auto;
    border-right: 1px solid var(--border-hairline);
  }
  .steps h2 {
    padding: var(--space-2);
  }
  .steps.collapsed {
    width: 86px;
  }
  .step-row {
    width: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    text-align: left;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-2);
    min-height: 60px;
    border-radius: var(--radius-sm);
  }
  .step-row span {
    overflow-wrap: anywhere;
  }
  .step-row small,
  .checkpoint-row small {
    color: var(--ink-muted);
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    font-variant-numeric: tabular-nums;
  }
  .step-row:hover,
  .chosen {
    background: var(--surface-hover);
  }
  /* A checkpoint is a marker in the schedule, not a step: no chip, no target. */
  .checkpoint-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2);
    color: var(--ink-muted);
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
  }
  .checkpoint-row .mark {
    width: 6px;
    height: 6px;
    border-radius: var(--radius-pill);
    border: 1px solid var(--neutral-8);
  }
  .checkpoint-row small {
    color: var(--ink-muted);
    font-variant-numeric: tabular-nums;
  }
  .origin {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .origin a {
    color: inherit;
  }
  /* Every workflow in the fleet is named with a middle dot, so a bare word
     after one more dot reads as part of the name. The origin gets an edge. */
  .origin-word {
    padding: 1px var(--space-2);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-pill);
    background: var(--surface-recess);
  }
  .log {
    padding: var(--space-3) var(--space-5);
    border-bottom: 1px solid var(--border-hairline);
  }
  /* Left as a list-item so the native disclosure marker survives: a flex
     summary silently loses the triangle, and then nothing says it opens. */
  .log summary {
    padding-block: var(--space-2);
    cursor: pointer;
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    color: var(--ink-muted);
  }
  .log ol {
    display: grid;
    gap: var(--space-2);
    padding-top: var(--space-2);
    max-height: 30dvh;
    overflow-y: auto;
  }
  .log li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--space-3);
    font-size: var(--text-body);
    font-weight: var(--weight-body);
    overflow-wrap: anywhere;
  }
  .log time {
    color: var(--ink-muted);
    font-variant-numeric: tabular-nums;
  }
  .graph {
    position: relative;
    flex: 1;
    min-width: 0;
  }
  .scope {
    position: absolute;
    top: var(--space-2);
    left: var(--space-2);
    z-index: 5;
    max-width: 180px;
  }
  .detail {
    width: 340px;
    flex-shrink: 0;
    overflow-y: auto;
    border-left: 1px solid var(--border-hairline);
  }
  .drawer {
    padding: var(--space-4);
  }
  .answer {
    padding: var(--space-4) var(--space-5);
    background: var(--surface-raised);
    border-bottom: 1px solid var(--border-hairline);
  }
  /* The options are peers the workflow author wrote, not one recommended
     action, so none of them takes the never-flat graphite. On a waiting run
     the needs-you chip is the only thing that should be loud. */
  .options {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }
  .answer .options button {
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: var(--space-1);
    min-height: 44px;
    padding: var(--space-3);
    max-width: 320px;
    text-align: left;
  }
  .answer .options .option-label {
    display: inline-flex;
    align-items: center;
    gap: var(--btn-gap);
  }
  .answer .options small {
    color: var(--ink-muted);
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    line-height: 1.4;
    overflow-wrap: anywhere;
  }
  .tabs,
  .loading {
    padding: var(--space-4);
  }
  /* DESIGN.md: every affordance reaches 44px under a coarse pointer, at any
     width. The summary grows by padding so it keeps its disclosure marker. */
  @media (pointer: coarse) {
    .log summary {
      padding-block: var(--space-4);
    }
    .origin a {
      min-height: 44px;
      display: inline-flex;
      align-items: center;
    }
  }
  @media (max-width: 1023px) {
    .steps {
      width: 100%;
      border: 0;
    }
    .graph {
      min-height: 450px;
    }
    .run-body {
      min-height: 0;
    }
  }
</style>
