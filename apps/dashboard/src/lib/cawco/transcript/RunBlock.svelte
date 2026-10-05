<script lang="ts">
  /**
   * A workflow run in the chat of the session that started it, once, in the
   * place its `run_workflow` call was made, and live: the run's line — where
   * it stands, its name, how far along — with its steps hung under it on the
   * nesting rails (RunSteps), the way the rail nests a session's delegates.
   * The run's receipts are told here, not as rows of their own (rows.ts).
   * The line opens the run's tab; a step opens its own session's.
   *
   * The run's own tab draws the same block (`here`): its line is then where
   * the reader already is, so it opens nothing, and its steps offer what
   * the tab can do from them (`more`).
   */
  import type { WorkflowStep } from "@cawco/core";
  import type { Snippet } from "svelte";
  import { formatDuration } from "#lib/utils/time.js";
  import { cawco } from "../client.svelte";
  import { tickingClock } from "../motion/clock.svelte.js";
  import { morph } from "../motion/morph.svelte";
  import RunSteps from "../RunSteps.svelte";
  import type { Message } from "../types";
  import { runHref, runTabId } from "../workflow-runs";
  import { workflowState } from "../workflow-state.svelte";
  import SessionStatus from "../workspace/SessionStatus.svelte";
  import { startedRunOf } from "./rows";

  let {
    message,
    runId: anchored = null,
    here = false,
    more,
  }: {
    /** The `run_workflow` call, or the run's first notice; absent in the run's own tab. */
    message?: Message;
    /** The run, when the block stands at its notice rather than at a call. */
    runId?: string | null;
    /** Drawn in the run's own tab. */
    here?: boolean;
    /** What an opened step offers under its result (the tab's re-run). */
    more?: Snippet<[WorkflowStep]>;
  } = $props();

  const meta = $derived(message?.metadata ?? {});
  /** A call names its run once it has returned; absent while it is started. */
  const runId = $derived(anchored ?? (message ? startedRunOf(message) : null));
  const run = $derived(runId ? workflowState.runs[runId] : undefined);
  const detail = $derived(runId ? workflowState.details[runId] : undefined);
  const refused = $derived(!runId && meta.toolStatus === "error");

  /** What it is called: its workflow, else what the call asked for. */
  const name = $derived.by(() => {
    const named = run
      ? workflowState.workflows.find((each) => each.id === run.workflowId)?.name
      : undefined;
    if (named) {
      return named;
    }
    const input = meta.toolInput;
    const asked =
      input && typeof input === "object" && !Array.isArray(input)
        ? input.name
        : undefined;
    return typeof asked === "string" ? asked : "Workflow";
  });

  const going = $derived(
    run?.status === "running" || run?.status === "waiting"
  );
  // The clock runs while the run does, and stops at its end — and only while the
  // block is on show, or a transcript nobody is reading spends a second
  // re-writing its figures (motion/clock).
  const clock = tickingClock(() => going);
  /** How far along: the steps passed of those it has, and how long it has run. */
  const progress = $derived.by(() => {
    if (!run) {
      return refused ? "" : "starting";
    }
    const end = run.endedAt ? new Date(run.endedAt).getTime() : clock.now;
    const took = formatDuration(
      Math.max(0, end - new Date(run.startedAt).getTime())
    );
    const steps = detail?.steps ?? [];
    const passed = steps.filter((step) => step.status === "passed").length;
    return steps.length ? `${passed}/${steps.length} steps · ${took}` : took;
  });
  const failure = $derived(
    refused ? String(meta.toolResult ?? "The run did not start.") : run?.failure
  );
</script>

<!-- Its height moves with its steps as one opens or folds its result
     (`morph` on the rows' clock), so the chat under it never jumps. -->
<div class="run-block rail-row" data-nest-host {@attach morph({ rows: true })}>
  {#snippet words()}
    <span class="name">{name}</span>
    <span class="num progress" {@attach clock.watch}>{progress}</span>
  {/snippet}
  <!-- The glyph stands before the link, in its own cell: the steps' line
       leaves its foot outside any control. -->
  <div class="head rail-line">
    <span class="mark rail-cell"
      >{#if runId}
        <SessionStatus compact sessionId={runTabId(runId)} />
      {/if}</span
    >
    {#if runId && !here}
      <a class="words press-tint" href={runHref(runId)}>{@render words()}</a>
    {:else}
      <p class="words">{@render words()}</p>
    {/if}
  </div>
  {#if failure}
    <p class="failure rail-hang">{failure}</p>
  {/if}
  <!-- In a chat, steps are read for a run the board lists; the run's own tab
       has read them already. -->
  {#if runId && (here || cawco.instanceIndex.byId.has(runTabId(runId)))}
    <RunSteps glyph=".mark" {more} {runId} />
  {/if}
</div>

<style>
  .head {
    min-block-size: 26px;
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
  }
  .words {
    flex: 1 1 auto;
    min-inline-size: 0;
    min-block-size: 26px;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
    border-radius: var(--radius-xs);
    color: inherit;
    text-decoration: none;
  }
  .name {
    flex: 0 1 auto;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--ink-strong);
    transition: color var(--dur-control) var(--ease-out);
  }
  @media (hover: hover) and (pointer: fine) {
    a.words:hover .name {
      color: var(--brand-ink);
    }
  }
  .progress {
    flex: none;
    margin-inline-start: auto;
    color: var(--ink-muted);
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
  }
  .failure {
    margin-block: var(--space-1) 0;
    max-inline-size: 68ch;
    color: var(--status-fail-ink);
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    line-height: var(--leading-body);
    overflow-wrap: anywhere;
  }
  @media (pointer: coarse) {
    .head,
    .words {
      min-block-size: 44px;
    }
  }
</style>
