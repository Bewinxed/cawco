<script lang="ts">
  import { cawco } from "#lib/cawco/client.svelte.js";
  import { confirm } from "#lib/cawco/confirm.svelte.js";
  import { message } from "#lib/cawco/delegate-types.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import RunSteps from "#lib/cawco/RunSteps.svelte";
  import { runHref, runTabId } from "#lib/cawco/workflow-runs.js";
  import {
    refreshWorkflowLog,
    refreshWorkflowRun,
    workflowState,
  } from "#lib/cawco/workflow-state.svelte.js";
  import {
    answerWorkflow,
    cancelWorkflowRun,
    rerunWorkflow,
  } from "#lib/cawco/workflows.js";
  import SessionStatus from "#lib/cawco/workspace/SessionStatus.svelte";
  import PendingContent, {
    whileIdle,
  } from "#lib/components/ui/button/pending-content.svelte";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  /**
   * A workflow run's tab: what a session's tab is for a session. The run's
   * name, where it stands, when it started and what it was given; its steps
   * hung under it on the nesting rails (RunSteps), each opening its result
   * and its own session's tab; the question it waits on, and its log.
   * There is no graph here: a graph is for editing (/workflows/[id]).
   */
  import { goto } from "$app/navigation";
  import { followTail } from "./follow-tail";
  import { journalCheckpoints, journalLog } from "./journal-graph";
  import { duration } from "./workflow-ui";
  import "./workflows.css";

  let { runId }: { runId: string } = $props();

  let errorMessage = $state("");
  /** The action whose request is out ("rerun", "rerun-step", "answer:<label>", "cancel"). */
  let acting = $state<string | null>(null);
  const busy = $derived(acting !== null);
  let now = $state(Date.now());
  let other = $state("");
  let note = $state("");
  /** A typed answer, as JSON, for a question that declared an answer schema. */
  let valueText = $state("");
  let logOpen = $state(false);

  const run = $derived(workflowState.details[runId]);
  const workflow = $derived(
    workflowState.workflows.find((entry) => entry.id === run?.workflowId)
  );
  const effects = $derived(workflowState.logs[runId] ?? []);
  /** The program's log lines and its checkpoints, in the order they happened. */
  const logLines = $derived(
    [
      ...journalLog(effects).map((line) => ({
        seq: line.seq,
        at: line.at,
        text: line.text,
      })),
      ...journalCheckpoints(effects).map((mark) => ({
        seq: mark.seq,
        at: mark.at,
        text: `Checkpoint · ${mark.label}`,
      })),
    ].sort((a, b) => a.seq - b.seq)
  );
  const going = $derived(
    run?.status === "running" || run?.status === "waiting"
  );
  const live = $derived(cawco.hub === "connected");
  const inputs = $derived(Object.entries(run?.inputs ?? {}));
  /** When it started, to the minute, with the day when it was not today. */
  const startedAt = $derived.by(() => {
    if (!run) {
      return "";
    }
    const at = new Date(run.startedAt);
    const today = at.toDateString() === new Date().toDateString();
    return at.toLocaleString(
      undefined,
      today
        ? { hour: "numeric", minute: "2-digit" }
        : { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
    );
  });

  $effect(() => {
    const id = runId;
    refreshWorkflowRun(id).catch((caught) => {
      errorMessage = message(caught);
    });
  });
  // The log is re-read whenever the run moves: a checkpoint, a log line or a
  // new call arrives as a frame without a step row of its own.
  $effect(() => {
    const moved = run;
    if (moved) {
      refreshWorkflowLog(runId).catch((caught) => {
        errorMessage = message(caught);
      });
    }
  });
  // The clock runs while the run does.
  $effect(() => {
    if (!going) {
      return;
    }
    const timer = setInterval(() => {
      now = Date.now();
    }, 1000);
    return () => clearInterval(timer);
  });

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
    const names = (run?.steps ?? [])
      .filter((entry) => entry.status === "running" && entry.instanceId)
      .map(
        (entry) =>
          cawco.instanceIndex.byId.get(entry.instanceId as string)?.title ??
          entry.nodeId
      );
    await confirm({
      title: "Cancel workflow run?",
      body: `Stops these live sessions and any child runs: ${names.length ? names.join(", ") : "No live step sessions reported"}. Pending steps will be skipped.`,
      confirmLabel: "Cancel run",
      destructive: true,
      pendingLabel: "Cancelling…",
      // Not through `act`: a failure is the dialog's to show, under its body.
      run: async () => {
        acting = "cancel";
        try {
          await cancelWorkflowRun(runId);
          await refreshWorkflowRun(runId);
        } finally {
          acting = null;
        }
      },
    });
  }
  /** Runs the workflow again, from the start or from one step, and opens the new run's tab. */
  async function rerun(fromStepId?: string) {
    await act(fromStepId ? "rerun-step" : "rerun", async () => {
      const result = await rerunWorkflow(runId, fromStepId);
      await goto(runHref(result.runId));
    });
  }
  /** The typed answer's JSON, parsed; undefined when the field is empty. */
  function typedValue(): unknown {
    return valueText.trim() ? JSON.parse(valueText) : undefined;
  }
  /** An input's value in a line: text as itself, anything else as JSON. */
  const shown = (value: unknown): string =>
    typeof value === "string" ? value : JSON.stringify(value);
</script>

{#snippet rerunFrom(step: { id: string })}
  <!-- Everything this run did before the step is kept: the new run is
       handed those results and goes live from here. -->
  <button
    aria-busy={acting === 'rerun-step' || undefined}
    aria-disabled={acting === 'rerun-step' || undefined}
    class="wf-btn"
    disabled={(busy && acting !== 'rerun-step') || !live || going}
    onclick={whileIdle(() => acting === 'rerun-step', () => rerun(step.id))}
    title={live ? 'Run the workflow again from this step, keeping what came before it' : "Can't re-run while the hub is unreachable"}
    type="button"
  >
    <PendingContent
      failed={errorMessage !== ''}
      label="Re-run from this step"
      pending={acting === 'rerun-step'}
      pendingLabel="Re-running…"
    />
  </button>
{/snippet}

<div class="wf run-view">
  {#if errorMessage}
    <p class="wf-error" role="alert">{errorMessage}</p>
  {/if}
  <!-- The name waits for the workflow list, so it never paints as
       "Workflow" and then widens into the real one. -->
  {#if !(run && (workflow || workflowState.loaded))}
    <div aria-label="Loading workflow run" class="loading" role="status">
      <Skeleton class="h-6 w-56" />
      <Skeleton class="h-4 w-40" />
      <Skeleton class="h-24 w-full" />
    </div>
  {:else}
    <!-- Its height moves with its steps as one opens or folds its result
         (`morph` on the rows' clock), so what is under it never jumps. -->
    <section class="run" data-nest-host {@attach morph({ rows: true })}>
      <header class="head">
        <h1>
          <span class="run-mark"
            ><SessionStatus sessionId={runTabId(runId)} /></span
          >
          <span class="name">{workflow?.name ?? 'Workflow'}</span>
        </h1>
        <p class="meta">
          <span>Started {startedAt}</span>
          <span class="num">{duration(run.startedAt, run.endedAt, now)}</span>
        </p>
        {#if inputs.length}
          <dl class="inputs">
            {#each inputs as [key, value] (key)}
              <div>
                <dt>{key}</dt>
                <dd>{shown(value)}</dd>
              </div>
            {/each}
          </dl>
        {/if}
        <div class="wf-row actions">
          {#if going}
            <button
              class="wf-btn"
              disabled={busy || !live}
              onclick={cancel}
              title={live ? undefined : "Can't cancel while the hub is unreachable"}
              type="button"
            >
              Cancel run
            </button>
          {:else}
            <button
              aria-busy={acting === 'rerun' || undefined}
              aria-disabled={acting === 'rerun' || undefined}
              class="wf-btn"
              disabled={(busy && acting !== 'rerun') || !live}
              onclick={whileIdle(() => acting === 'rerun', () => rerun())}
              title={live ? 'Start this workflow again with the same inputs' : "Can't re-run while the hub is unreachable"}
              type="button"
            >
              <PendingContent
                failed={errorMessage !== ''}
                label="Re-run"
                pending={acting === 'rerun'}
                pendingLabel="Re-running…"
              />
            </button>
          {/if}
          <a class="wf-btn" href="/workflows/{run.workflowId}?tab=program"
            >Edit workflow</a
          >
        </div>
      </header>
      {#if run.failure}
        <p class="wf-error failure">{run.failure}</p>
      {/if}
      <RunSteps glyph=".run-mark .glyph" more={rerunFrom} {runId} />
    </section>

    {#if run.status === 'waiting' && run.ask}
      {@const ask = run.ask}
      <!-- The question folds open; answered, the picked option pends until
           the hub moves the run on, and then the block folds away. -->
      <section class="answer wf-stack" in:unfold out:unfold>
        <h2>Answer · {ask.question}</h2>
        <div class="options">
          {#each ask.options as option (option.label)}
            {@const key = `answer:${option.label}`}
            <button
              aria-busy={acting === key || undefined}
              aria-disabled={acting === key || undefined}
              class="wf-btn"
              disabled={(busy && acting !== key) || !live}
              onclick={whileIdle(() => acting === key, () => act(key, () => answerWorkflow(runId, ask.stepId, { choice: option.label, note, value: typedValue() })))}
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
        {#if ask.answerSchema}
          <!-- A typed answer: its JSON is checked by the hub against the
               schema the program declared, shown here as the placeholder. -->
          <div class="wf-row">
            <label class="typed"
              >Answer value (JSON)<textarea
                placeholder={JSON.stringify(ask.answerSchema)}
                rows="3"
                bind:value={valueText}
              ></textarea></label
            >
            {#if !ask.options.length}
              <button
                aria-busy={acting === 'value' || undefined}
                aria-disabled={acting === 'value' || undefined}
                class="wf-btn"
                disabled={!valueText.trim() || (busy && acting !== 'value') || !live}
                onclick={whileIdle(() => acting === 'value', () => act('value', () => answerWorkflow(runId, ask.stepId, { note, value: typedValue() })))}
                title={live ? undefined : "Can't answer while the hub is unreachable"}
                type="button"
              >
                <PendingContent
                  failed={errorMessage !== ''}
                  label="Send answer"
                  pending={acting === 'value'}
                  pendingLabel="Sending…"
                />
              </button>
            {/if}
          </div>
        {/if}
        {#if ask.allowOther}
          <div class="wf-row">
            <label>Other answer<input bind:value={other}></label
            ><button
              aria-busy={acting === 'answer' || undefined}
              aria-disabled={acting === 'answer' || undefined}
              class="wf-btn"
              disabled={!other || (busy && acting !== 'answer') || !live}
              onclick={whileIdle(() => acting === 'answer', () => act('answer', () => answerWorkflow(runId, ask.stepId, { choice: other, note, value: typedValue() })))}
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

    {#if logLines.length}
      <details class="log" bind:open={logOpen} in:unfold out:unfold>
        <summary>Log · {logLines.length}</summary>
        <!-- A line arrives the house way (motion/rows), and the log keeps
             the newest in view only while the reader is at its end. -->
        <ol {@attach reflow()} {@attach followTail()}>
          {#each logLines as line (line.seq)}
            <li data-flip>
              <time>{new Date(line.at).toLocaleTimeString()}</time
              ><span>{line.text}</span>
            </li>
          {/each}
        </ol>
      </details>
    {/if}
  {/if}
</div>

<style>
  /* The tab's column: the transcript's own ledger padding, so a run reads
     in the place a conversation would. */
  .run-view {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    flex: 1 1 auto;
    min-inline-size: 0;
    min-block-size: 0;
    overflow-y: auto;
    padding: var(--space-6) var(--space-6) var(--space-7) var(--space-7);
    background: var(--surface-recess);
  }
  .loading {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .run {
    max-inline-size: 760px;
  }
  .head {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  h1 {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
    min-inline-size: 0;
  }
  /* The status's glyph leads the name and its word follows it: the status
     is laid out in the heading's own row. */
  .run-mark,
  .run-mark :global(.session-status) {
    display: contents;
  }
  .run-mark :global(.session-status > :not(.glyph)) {
    order: 2;
  }
  .name {
    order: 1;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-3);
    margin: 0;
    color: var(--ink-muted);
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
  }
  .inputs {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--space-1) var(--space-3);
    margin: 0;
    font-size: var(--text-meta);

    & > div {
      display: contents;
    }
    & dt {
      color: var(--ink-muted);
      font-weight: var(--weight-body);
    }
    & dd {
      margin: 0;
      color: var(--ink-strong);
      font-family: var(--font-mono);
      overflow-wrap: anywhere;
    }
  }
  .actions {
    margin-block-start: var(--space-1);
  }
  .failure {
    margin-block-start: var(--space-3);
  }
  .log {
    max-inline-size: 760px;
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
  /* Open, the log is one fixed height: lines arriving fill and scroll it,
     and never push the run below it down. */
  .log ol {
    display: grid;
    align-content: start;
    gap: var(--space-2);
    padding-top: var(--space-2);
    height: 30dvh;
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
  .answer {
    max-inline-size: 760px;
    padding: var(--space-4);
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
  }
  /* The options are peers the workflow author wrote, not one recommended
     action, so none of them takes the never-flat graphite. On a waiting run
     the needs-you glyph is the only thing that should be loud. */
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
  .answer .typed {
    flex: 1;
    min-width: 0;
  }
  .answer .typed textarea {
    width: 100%;
    resize: vertical;
  }
  .answer .options small {
    color: var(--ink-muted);
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    line-height: 1.4;
    overflow-wrap: anywhere;
  }
  /* DESIGN.md: every affordance reaches 44px under a coarse pointer. */
  @media (pointer: coarse) {
    .log summary {
      padding-block: var(--space-4);
    }
  }
  @media (max-width: 640px) {
    .run-view {
      padding-inline: var(--space-4);
    }
  }
</style>
