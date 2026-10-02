<script lang="ts">
  /**
   * A workflow run's steps, hung under the run on the nesting rails (app.css
   * `.kit-nest`, measured off the parent's glyph by `nestFrom`): each a
   * delegate's line — its status glyph, what it is, how long it took —
   * arriving as it starts (`reflow`).
   *
   * Where the reader can act on them (`interactive`: the run's tab, its block
   * in the chat), a step with a result or a failure folds it under itself,
   * the count of what is folded at the row's trailing edge and its time just
   * before it, opening and folding as every tree in the app does
   * (motion/branch); a step that ran as a session, or as a run of its own,
   * opens that tab. On the rail's hover card they are only read.
   */
  import type { WorkflowStep } from "@cawco/core";
  import { onMount, type Snippet } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import { duration } from "$lib/components/features/workflows/workflow-ui";
  import { IconExternal } from "$lib/icons";
  import { cawco } from "./client.svelte";
  import { conversationHref } from "./links";
  import { type BranchOptions, branch, nestFrom } from "./motion/branch.svelte";
  import { reflow } from "./motion/rows.svelte";
  import TreeCount from "./TreeCount.svelte";
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
    const title = run
      ? stepTitle(
          run,
          step,
          step.instanceId
            ? cawco.instanceIndex.byId.get(step.instanceId)?.title
            : null
        )
      : step.nodeId;
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
   * with none, the actions under it.
   */
  const folded = (result: string | null): { count: number; noun: string } =>
    result === null
      ? { count: 1, noun: "action" }
      : { count: result.split("\n").length, noun: "line" };

  const opened = new SvelteSet<string>();
  const toggle = (id: string) => {
    if (opened.has(id)) {
      opened.delete(id);
    } else {
      opened.add(id);
    }
  };

  // A running step's time counts up; once nothing runs the clock stops.
  let now = $state(Date.now());
  const ticking = $derived(steps.some((step) => step.status === "running"));
  onMount(() => {
    const tick = setInterval(() => {
      if (ticking) {
        now = Date.now();
      }
    }, 1000);
    return () => clearInterval(tick);
  });
</script>

{#snippet line(step: WorkflowStep)}
  <SessionStatus compact step={step.status} />
  <span class="title">{titleOf(step)}</span>
{/snippet}

{#if steps.length > 0}
  <ul
    class="kit-nest run-steps"
    {@attach nestFrom(glyph, STEP_GLYPH)}
    {@attach reflow()}
  >
    {#each steps as step (step.id)}
      {@const result = interactive ? returned(step) : null}
      {@const tab = interactive ? tabOf(step) : null}
      {@const foldable = interactive && (result !== null || !!more)}
      <!-- The step's box (`data-flip="box"`): its result takes its room at
           once and the edge travels to it, the steps under it sliding with
           that edge. -->
      <li data-flip="box">
        <!-- Its words, the way into its own tab, its time, and last, at the
             trailing edge, the count of what it folds. -->
        <div class="step">
          {#if foldable}
            <button
              aria-expanded={opened.has(step.id)}
              class="line press-tint focus-inset"
              onclick={() => toggle(step.id)}
              type="button"
              class:err={step.status === 'failed'}
            >
              {@render line(step)}
            </button>
          {:else}
            <div class="line" class:err={step.status === 'failed'}>
              {@render line(step)}
            </div>
          {/if}
          {#if tab}
            <a
              aria-label="Open {titleOf(step)}"
              class="jump touch-hit focus-inset"
              href={tab}
              title="Open {titleOf(step)}"
            >
              <IconExternal aria-hidden="true" />
            </a>
          {/if}
          <span class="num time"
            >{duration(step.startedAt, step.endedAt, now)}</span
          >
          {#if foldable}
            <TreeCount
              {...folded(result)}
              ontoggle={() => toggle(step.id)}
              open={opened.has(step.id)}
            />
          {/if}
        </div>
        {#if foldable && opened.has(step.id)}
          <div
            class="opened"
            data-flip-anchor
            in:branch={RESULT}
            out:branch={RESULT}
          >
            {#if result}
              <pre
                class="result"
                data-branch-item
                class:err={!!step.failure}
              >{result}</pre>
            {/if}
            {#if more}
              <div class="more" data-branch-item>{@render more(step)}</div>
            {/if}
          </div>
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
  /* The rail under the parent's glyph; each curved arm runs over its line's
     inset to the step's status glyph, level with it (both measured,
     `nestFrom`). */
  .run-steps {
    --nest-gap: var(--space-row);
    list-style: none;
    margin: var(--space-1) 0 0;
    padding: 0 0 0 var(--nest-pad);
    display: flex;
    flex-direction: column;
    gap: var(--nest-gap);
    min-inline-size: 0;
  }
  .step {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-inline-size: 0;
  }
  .line {
    flex: 1 1 auto;
    min-inline-size: 0;
    min-block-size: 26px;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 0 var(--space-1);
    border: 0;
    border-radius: var(--radius-xs);
    background: none;
    color: var(--ink-strong);
    font: inherit;
    font-size: var(--text-body);
    font-weight: var(--weight-body);
    text-align: start;
  }
  button.line {
    cursor: pointer;
  }
  .title {
    flex: 1 1 auto;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .time {
    flex: none;
    color: var(--ink-muted);
    font-size: var(--text-meta);
  }
  .line.err .title {
    color: var(--status-fail-ink);
  }
  /* The way into the step's own tab: a glyph beside the line, muted until
     pointed at, as the delegate card's is. */
  .jump {
    flex: none;
    inline-size: 26px;
    block-size: 26px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-xs);
    color: var(--ink-muted);
    transition:
      color var(--dur-control) var(--ease-out),
      background var(--dur-control) var(--ease-out);

    & :global(svg) {
      inline-size: 12px;
      block-size: 12px;
    }
  }
  @media (hover: hover) and (pointer: fine) {
    .jump:hover {
      color: var(--brand-ink);
      background: var(--surface-hover);
    }
  }
  .opened {
    display: flex;
    flex-direction: column;
    align-items: start;
    gap: var(--space-2);
    padding-block: var(--space-1) var(--space-2);
  }
  .result {
    align-self: stretch;
    margin: 0;
    padding: var(--space-2) var(--space-3);
    max-block-size: 240px;
    overflow: auto;
    border-radius: var(--radius-xs);
    background: var(--surface-recess);
    color: var(--ink-strong);
    font-family: var(--font-mono);
    font-size: var(--text-meta);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .result.err {
    color: var(--status-fail-ink);
  }
  @media (pointer: coarse) {
    .line,
    .jump {
      min-block-size: 44px;
    }
  }
</style>
