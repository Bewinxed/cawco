<script lang="ts">
  /**
   * A workflow run's steps, hung under the run on the nesting rails (app.css
   * `.kit-nest`, measured off the parent's glyph by `nestFrom`): each a
   * delegate's line — its status glyph, what it is, how long it took —
   * arriving as it starts (`reflow`).
   *
   * Where the reader can act on them (`interactive`: the run's tab, its block
   * in the chat), a step folds open under itself what it did — the
   * transcript of the session it ran as, in the well a delegate's card opens
   * onto (InlineTranscript), then its result or failure — the count of what
   * is folded at the row's trailing edge and its time just before it,
   * opening and folding as every tree in the app does (motion/branch). A
   * step that ran as a session, or as a run of its own, opens that tab; a
   * step that started a run hangs that run's steps under it on lines of
   * their own. On the rail's hover card they are only read.
   */
  import type { WorkflowStep } from "@cawco/core";
  import type { Snippet } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import { SvelteSet } from "svelte/reactivity";
  import { tickingClock } from "#lib/cawco/motion/clock.svelte.js";
  import { duration } from "#lib/components/features/workflows/workflow-ui.js";
  import { IconExternal } from "#lib/icons.js";
  import {
    cawco,
    readTranscript,
    unwatchDelegate,
    watchDelegate,
  } from "./client.svelte";
  import { conversationHref } from "./links";
  import { type BranchOptions, branch, nestFrom } from "./motion/branch.svelte";
  import { reflow } from "./motion/rows.svelte";
  import Self from "./RunSteps.svelte";
  import TreeCount from "./TreeCount.svelte";
  import InlineTranscript from "./transcript/InlineTranscript.svelte";
  import { runHref, stepTitle } from "./workflow-runs";
  import { refreshWorkflowRun, workflowState } from "./workflow-state.svelte";
  import SessionStatus from "./workspace/SessionStatus.svelte";

  let {
    runId,
    glyph,
    interactive = true,
    more,
  }: {
    runId: string;
    /** The parent's glyph, the rail hangs under its centre (`nestFrom`). */
    glyph: string;
    /** Steps open their result and their tab; off, they are only read. */
    interactive?: boolean;
    /** What an opened step offers under its result (the tab's re-run). */
    more?: Snippet<[WorkflowStep]>;
  } = $props();

  const run = $derived(workflowState.details[runId]);
  // A run that started after the first read has only its frame: its steps
  // are read once something shows them.
  $effect(() => {
    if (!workflowState.details[runId]) {
      refreshWorkflowRun(runId).catch(() => {
        // The steps stay unread; the run's own row still says where it stands.
      });
    }
  });

  /** In schedule order: started first, the ones not started yet last. */
  const steps = $derived(
    run
      ? [...run.steps].sort(
          (a, b) =>
            (a.startedAt ? +new Date(a.startedAt) : Number.MAX_SAFE_INTEGER) -
            (b.startedAt ? +new Date(b.startedAt) : Number.MAX_SAFE_INTEGER)
        )
      : []
  );

  const titleOf = (step: WorkflowStep): string => {
    const title = run ? stepTitle(run, step) : step.nodeId;
    return step.mapIndex === null ? title : `${title} [${step.mapIndex}]`;
  };

  /** What a step handed back, as the reader opens it; null with nothing to show. */
  const returned = (step: WorkflowStep): string | null => {
    if (step.failure) {
      return step.failure;
    }
    const value = step.kind === "end" ? run?.result : step.result;
    return value === null || value === undefined
      ? null
      : JSON.stringify(value, null, 2);
  };

  /** Where a step opens: the session it ran as, or the run it started. */
  const tabOf = (step: WorkflowStep): string | null => {
    if (step.instanceId) {
      return conversationHref(step.instanceId, cawco.instanceIndex);
    }
    return step.childRunId ? runHref(step.childRunId) : null;
  };

  /** A step's status glyph: where its rail ends, and what its result opens off. */
  const STEP_GLYPH = ".session-status .glyph";
  /** A result opens under its step as a tree's rows do (motion/branch). */
  const RESULT: BranchOptions = { glyph: STEP_GLYPH };

  /**
   * What a step folds, counted for its switch: the lines of its result, or
   * with none, its transcript, or the actions under it.
   */
  const folded = (
    step: WorkflowStep,
    result: string | null
  ): { count: number; noun: string } => {
    if (result !== null) {
      return { count: result.split("\n").length, noun: "line" };
    }
    return { count: 1, noun: step.instanceId ? "transcript" : "action" };
  };

  const opened = new SvelteSet<string>();
  /**
   * The steps whose transcript is drawn: a frame behind `opened` on the way
   * in, so the well mounts closed and is drawn a unit at a time
   * (CollapsibleLazy) rather than whole on the click; kept as a step folds,
   * so the well holds its rows while the fold carries it shut.
   */
  const drawing = new SvelteSet<string>();
  const toggle = (id: string) => {
    if (opened.has(id)) {
      opened.delete(id);
    } else {
      drawing.delete(id);
      opened.add(id);
    }
  };
  $effect(() => {
    for (const id of opened) {
      drawing.add(id);
    }
  });

  /**
   * A step's session, while its transcript is open: its frames are wanted,
   * and what was stored before this tab is read back.
   */
  const following =
    (id: string): Attachment =>
    () => {
      watchDelegate(id);
      // biome-ignore lint/complexity/noVoid: fire-and-forget by intent — nothing here awaits the backfill.
      void readTranscript(id);
      return () => unwatchDelegate(id);
    };

  // A running step's time counts up; once nothing runs the clock stops, and
  // while the steps are off screen it stands still (motion/clock).
  const ticking = $derived(steps.some((step) => step.status === "running"));
  const clock = tickingClock(() => ticking);
</script>

{#snippet line(step: WorkflowStep)}
  <span
    data-slot="title"
    class="min-w-0 flex-auto truncate group-data-err:text-status-fail-ink"
    >{titleOf(step)}</span
  >
{/snippet}

{#if steps.length > 0}
  <ul
    class="kit-nest m-0 mt-space-1 flex min-w-0 list-none flex-col gap-(--nest-gap) py-0 pr-0 pl-(--nest-pad)"
    style:--nest-gap="var(--space-row)"
    {@attach nestFrom(glyph, STEP_GLYPH)}
    {@attach reflow()}
    {@attach clock.watch}
  >
    {#each steps as step (step.id)}
      {@const result = interactive ? returned(step) : null}
      {@const tab = interactive ? tabOf(step) : null}
      {@const foldable =
        interactive && (result !== null || !!step.instanceId || !!more)}
      <!-- The step's box (`data-flip="box"`): its result takes its room at
           once and the edge travels to it, the steps under it sliding with
           that edge. -->
      <li data-flip="box">
        <!-- Its words, the way into its own tab, its time, and last, at the
             trailing edge, the count of what it folds. -->
        <div class="flex min-w-0 items-center gap-space-1">
          <!-- The glyph stands before the row's control, at the row's own
               edge: the line ends on it and a child's line leaves its foot,
               and neither ever runs inside a control. -->
          <SessionStatus compact step={step.status} />
          {#if foldable}
            <!-- literal: 26px, 44px -->
            <button
              aria-expanded={opened.has(step.id)}
              class="press-tint focus-inset cursor-pointer group flex min-h-(--step-h) min-w-0 flex-auto items-center rounded-xs border-none border-current bg-transparent py-0 pr-space-1 pl-(--line-pad-start) text-start text-size-body font-normal text-ink-strong coarse:min-h-(--step-h-coarse)"
              data-err={step.status === "failed" || undefined}
              onclick={() => toggle(step.id)}
              type="button"
              style:--step-h="26px"
              style:--step-h-coarse="44px"
              style:--line-pad-start="calc(var(--space-2) - var(--space-1))"
            >
              {@render line(step)}
            </button>
          {:else}
            <!-- literal: 26px, 44px -->
            <div
              class="group flex min-h-(--step-h) min-w-0 flex-auto items-center rounded-xs border-none border-current bg-transparent py-0 pr-space-1 pl-(--line-pad-start) text-start text-size-body font-normal text-ink-strong coarse:min-h-(--step-h-coarse)"
              data-err={step.status === "failed" || undefined}
              style:--step-h="26px"
              style:--step-h-coarse="44px"
              style:--line-pad-start="calc(var(--space-2) - var(--space-1))"
            >
              {@render line(step)}
            </div>
          {/if}
          {#if tab}
            <!-- literal: 26px, 44px -->
            <a
              aria-label="Open {titleOf(step)}"
              class="touch-hit focus-inset grid size-(--jump-size) flex-none place-items-center rounded-xs text-ink-muted transition-[color,background] dur-control ease-out coarse:min-h-(--jump-size-coarse) hover:bg-surface-hover hover:text-brand-ink"
              href={tab}
              style:--jump-size="26px"
              style:--jump-size-coarse="44px"
              title="Open {titleOf(step)}"
            >
              <IconExternal aria-hidden="true" class="size-icon-sm" />
              <span class="sr-only">Open {titleOf(step)}</span>
            </a>
          {/if}
          <span data-slot="time" data-num class="num flex-none text-size-meta text-ink-muted"
            >{duration(step.startedAt, step.endedAt, clock.now)}</span
          >
          {#if foldable}
            <TreeCount
              {...folded(step, result)}
              ontoggle={() => toggle(step.id)}
              open={opened.has(step.id)}
            />
          {/if}
        </div>
        <!-- A run the step started: its steps hang under this one's glyph,
             before anything the step folds open, so their line crosses
             nothing. -->
        {#if step.childRunId}
          <Self glyph={STEP_GLYPH} {interactive} runId={step.childRunId} />
        {/if}
        {#if foldable && opened.has(step.id)}
          <div
            class="flex flex-col items-start gap-space-2 ms-(--opened-inset) pt-space-1 pb-space-2"
            data-flip-anchor
            in:branch={RESULT}
            out:branch={RESULT}
            style:--opened-inset="calc(var(--w-glyph) + var(--space-2))"
            style:--well-at="calc(-1 * var(--space-1))"
          >
            {#if step.instanceId}
              {@const row = cawco.instanceIndex.byId.get(step.instanceId)}
              <div
                data-slot="well"
                class="min-w-0 self-stretch"
                data-branch-item
                {@attach following(step.instanceId)}
              >
                <InlineTranscript
                  agentName={row?.harness ?? "agent"}
                  id={step.instanceId}
                  open={drawing.has(step.id)}
                />
              </div>
            {/if}
            {#if result}
              <!-- literal: 240px -->
              <pre
                data-slot="result"
                class="m-0 max-h-(--result-max) self-stretch overflow-auto rounded-xs bg-surface-recess px-space-3 py-space-2 font-mono text-size-meta wrap-anywhere whitespace-pre-wrap text-ink-strong data-err:text-status-fail-ink"
                data-branch-item
                data-err={!!step.failure || undefined}
                style:--result-max="240px">{result}</pre>
            {/if}
            {#if more}
              <div data-slot="more" data-branch-item>
                {@render more(step)}
              </div>
            {/if}
          </div>
        {/if}
      </li>
    {/each}
  </ul>
{/if}
