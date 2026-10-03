<script lang="ts">
  /**
   * A workflow run in the chat of the session that started it, once, in the
   * place its `run_workflow` call was made, and live: the run's line — where
   * it stands, its name, how far along — with its steps hung under it on the
   * nesting rails (RunSteps), the way the rail nests a session's delegates.
   * The run's receipts are told here, not as rows of their own (rows.ts).
   * The line opens the run's tab; a step opens its own session's.
   */
  import { formatDuration } from "#lib/utils/time.js";
  import { cawco } from "../client.svelte";
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
  }: {
    /** The `run_workflow` call, or the run's first notice. */
    message: Message;
    /** The run, when the block stands at its notice rather than at a call. */
    runId?: string | null;
  } = $props();

  const meta = $derived(message.metadata ?? {});
  /** A call names its run once it has returned; absent while it is started. */
  const runId = $derived(anchored ?? startedRunOf(message));
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
  // The clock runs while the run does, and stops at its end.
  let now = $state(Date.now());
  $effect(() => {
    if (!going) {
      return;
    }
    const tick = setInterval(() => {
      now = Date.now();
    }, 1000);
    return () => clearInterval(tick);
  });
  /** How far along: the steps passed of those it has, and how long it has run. */
  const progress = $derived.by(() => {
    if (!run) {
      return refused ? "" : "starting";
    }
    const end = run.endedAt ? new Date(run.endedAt).getTime() : now;
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
  {#if runId}
    <a class="head rail-line press-tint" href={runHref(runId)}>
      <span class="mark rail-cell"
        ><SessionStatus compact sessionId={runTabId(runId)} /></span
      >
      <span class="name">{name}</span>
      <span class="num progress">{progress}</span>
    </a>
  {:else}
    <p class="head rail-line">
      <span class="mark rail-cell"></span>
      <span class="name">{name}</span>
      <span class="num progress">{progress}</span>
    </p>
  {/if}
  {#if failure}
    <p class="failure rail-hang">{failure}</p>
  {/if}
  {#if runId && cawco.instanceIndex.byId.has(runTabId(runId))}
    <RunSteps glyph=".mark" {runId} />
  {/if}
</div>

<style>
  .head {
    min-block-size: 26px;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
    border-radius: var(--radius-xs);
    color: inherit;
    text-decoration: none;
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
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
    a.head:hover .name {
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
    .head {
      min-block-size: 44px;
    }
  }
</style>
