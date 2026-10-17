<script lang="ts">
  /**
   * A workflow run in the chat of the session that started it, once, in the
   * place its `workflow_run` call was made, and live: the run's line — where
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
    /** The `workflow_run` call, or the run's first notice; absent in the run's own tab. */
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
  /**
   * How far along: the steps passed of those it has, and how long it has run.
   * Apart, because the time is a clock (a timer, read where it is reached)
   * and the steps are news (read when they change).
   */
  const progress = $derived.by((): { steps: string; took: string } => {
    if (!run) {
      return { steps: refused ? "" : "starting", took: "" };
    }
    const end = run.endedAt ? new Date(run.endedAt).getTime() : clock.now;
    const took = formatDuration(
      Math.max(0, end - new Date(run.startedAt).getTime())
    );
    const steps = detail?.steps ?? [];
    const passed = steps.filter((step) => step.status === "passed").length;
    return {
      steps: steps.length ? `${passed}/${steps.length} steps` : "",
      took,
    };
  });
  const failure = $derived(
    refused ? String(meta.toolResult ?? "The run did not start.") : run?.failure
  );
</script>

<!-- Its height moves with its steps as one opens or folds its result
     (`morph` on the rows' clock), so the chat under it never jumps. -->
<div
  data-slot="rail-row"
  class="rail-row"
  data-nest-host
  {@attach morph({ rows: true })}
>
  {#snippet words()}
    <span
      data-slot="name"
      class="flex-initial min-w-0 overflow-clip text-ellipsis whitespace-nowrap text-ink-strong transition-[color] dur-control ease-out group-hover/words:text-brand-ink"
      >{name}</span>
    <span
      data-slot="num"
      class="num flex-none ms-auto text-ink-muted text-size-meta font-normal"
      {@attach clock.watch}
      >{progress.steps}{#if progress.took}<span role="timer"
          >{progress.steps ? " · " : ""}{progress.took}</span
        >{/if}</span
    >
  {/snippet}
  <!-- The glyph stands before the link, in its own cell: the steps' line
       leaves its foot outside any control. -->
  <!-- literal: 26px, 44px -->
  <div
    data-slot="head"
    class="rail-line min-h-(--head-min) coarse:min-h-(--head-min-coarse) text-size-label font-medium"
    style:--head-min="26px"
    style:--head-min-coarse="44px"
  >
    <span data-rail-cell data-slot="mark" class="rail-cell"
      >{#if runId}
        <SessionStatus compact sessionId={runTabId(runId)} />
      {/if}</span
    >
    {#if runId && !here}
      <a
        data-slot="words"
        class="group/words mark-line press-tint flex-auto min-w-0 min-h-(--head-min) coarse:min-h-(--head-min-coarse) flex items-center gap-space-2 m-0 rounded-xs text-inherit no-underline"
        data-box
        href={runHref(runId)}
        style:--head-min="26px"
        style:--head-min-coarse="44px">{@render words()}</a
      >
    {:else}
      <p
        data-slot="words"
        class="mark-line flex-auto min-w-0 min-h-(--head-min) coarse:min-h-(--head-min-coarse) flex items-center gap-space-2 m-0 rounded-xs text-inherit no-underline"
        data-box
        style:--head-min="26px"
        style:--head-min-coarse="44px"
      >
        {@render words()}
      </p>
    {/if}
  </div>
  {#if failure}
    <!-- literal: 68ch -->
    <p data-slot="failure" class="rail-hang mt-space-1 mb-0 max-w-(--measure) text-status-fail-ink text-size-meta font-normal leading-body wrap-anywhere" style:--measure="68ch">{failure}</p>
  {/if}
  <!-- The steps come from the run's detail, read once if it isn't yet
       (RunSteps), whether or not the run's row is still on the board. -->
  {#if runId}
    <RunSteps glyph={`[data-slot="mark"]`} {more} {runId} />
  {/if}
</div>
