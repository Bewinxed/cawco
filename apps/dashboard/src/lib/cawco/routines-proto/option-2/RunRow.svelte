<script lang="ts">
  import { Button } from "#lib/components/ui/button/index.js";
  /**
   * One line of What ran: a run, or runs alike folded into one. It reads
   * down the list's fixed columns: the time (tabular, its own width), how
   * it ended as a glyph, then the routine's name and what it said, the only
   * text that wraps, and at the trailing edge the run's two ways out, its
   * session and its page. A fold says how many looks it holds and the
   * newest one's words, and opens in place to each, every one with its own
   * Open. An action the run asked to do outside stands under its words,
   * where it stands; a failed one keeps Mark as looked at.
   */
  import * as Collapsible from "#lib/components/ui/collapsible/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import {
    IconArrowUpRight,
    IconChevronDown,
    IconMaximize,
  } from "#lib/icons.js";
  import {
    clockOf,
    ENDING_WORD,
    isFail,
    type OutsideAction,
    type RanLine,
    type Run,
    routineOf,
    startWords,
  } from "./day";
  import RunGlyph, { type Mark } from "./RunGlyph.svelte";

  let {
    line,
    current = null,
    looked = [],
    onopenrun,
    onopensession,
    onlooked,
  }: {
    line: RanLine;
    /** The run open beside the list. */
    current?: string | null;
    /** Outside actions the person has marked as looked at. */
    looked?: string[];
    onopenrun: (id: string) => void;
    onopensession: (id: string) => void;
    onlooked: (actionId: string) => void;
  } = $props();

  let open = $state(false);

  const lead = $derived(line.kind === "run" ? line.run : line.runs[0]);
  const routine = $derived(routineOf(lead.routineId));
  const oldest = $derived(line.kind === "fold" ? line.runs.at(-1) : undefined);

  /** How an outside action stands, as a mark. */
  const ACTION_MARK: Record<OutsideAction["stands"], Mark> = {
    waiting: "coming",
    ran: "delivered",
    failed: "failed",
    unknown: "couldNotCheck",
    denied: "skipped",
  };

  const STANDS: Record<OutsideAction["stands"], string> = {
    waiting: "waits on you",
    ran: "ran",
    failed: "failed",
    unknown: "outcome unknown",
    denied: "denied",
  };

  function facts(run: Run): string {
    const how =
      run.ending === "running"
        ? "Running now"
        : `${ENDING_WORD[run.ending]}${run.minutes ? ` in ${run.minutes} min` : ""}`;
    const retry = run.retry ? " · its retry" : "";
    return `${how}${retry} · ${startWords(run.start)}`;
  }
</script>

{#snippet openRun(run: Run, name: string)}
  <Tip label="Open run">
    {#snippet children(tip)}
      <Button
        {...tip}
        aria-label="Open the run of {name} at {clockOf(run.at)}"
        aria-pressed={current === run.id}
        onclick={() => onopenrun(run.id)}
        press="scale"
        size="icon-xs"
        tone="quiet"
        variant="ghost"
      >
        <IconMaximize aria-hidden="true" />
      </Button>
    {/snippet}
  </Tip>
{/snippet}

{#snippet session(run: Run)}
  {#if run.doer.kind === "session"}
    <Button
      aria-label="Open the session that did {routine.name} at {clockOf(run.at)}"
      onclick={() => run.doer.kind === "session" && onopensession(run.doer.id)}
      press="scale"
      size="xs"
      tone="quiet"
      variant="ghost"
    >
      <span>Session</span>
      <IconArrowUpRight aria-hidden="true" data-icon="inline-end" />
    </Button>
  {/if}
{/snippet}

<li
  data-slot="ran-row"
  data-current={current !== null && line.kind === "run" && current === lead.id
    ? ""
    : undefined}
  class="group/ran mark-line grid grid-cols-(--ran-cols) items-start gap-x-space-3 rounded-md px-space-2 py-space-2 data-current:bg-selected-bg"
  style:--ran-cols={"calc(5 * var(--spacing-space-2)) var(--spacing-icon-md) minmax(0, 1fr) auto"}
>
  <span class="num type-label text-ink-muted">{clockOf(lead.at)}</span>
  <span class="mark-cell type-label">
    <RunGlyph mark={lead.ending} />
  </span>

  <div data-box class="flex min-w-0 flex-col gap-space-1">
    <p class="m-0 type-label font-medium text-ink-strong">{routine.name}</p>
    {#if line.kind === "run"}
      <p
        class={[
          "m-0 type-meta",
          isFail(lead.ending) ? "text-status-fail-ink" : "text-ink-muted",
        ]}
      >
        {facts(lead)}
      </p>
      <p class="m-0 line-clamp-2 type-body text-ink-row">{lead.words}</p>
      {#each lead.actions ?? [] as action (action.id)}
        {@const done = looked.includes(action.id)}
        <div
          class="mark-line mt-space-1 flex flex-wrap items-center gap-x-space-2 gap-y-space-1 type-meta"
        >
          <RunGlyph mark={ACTION_MARK[action.stands]} size="sm" />
          <span class="text-ink-strong">{action.sentence}</span>
          <span
            class={action.stands === "failed"
              ? "text-status-fail-ink"
              : "text-ink-muted"}
            >{action.service} · {STANDS[action.stands]}{action.answer
              ? `: ${action.answer}`
              : ""}</span
          >
          {#if (action.stands === "failed" || action.stands === "unknown") && !done}
            <Button
              data-box
              onclick={() => onlooked(action.id)}
              size="xs"
              variant="outline">Mark as looked at</Button
            >
          {:else if done}
            <span class="text-ink-subtle">Looked at</span>
          {/if}
        </div>
      {/each}
    {:else}
      <p
        class={[
          "m-0 type-meta",
          isFail(lead.ending) ? "text-status-fail-ink" : "text-ink-muted",
        ]}
      >
        {ENDING_WORD[lead.ending]}
        {line.runs.length} times, {clockOf(oldest?.at ?? lead.at)} to {clockOf(
          lead.at
        )}{lead.ending === "couldNotCheck" ? " · it stopped looking" : ""}
      </p>
      <p class="m-0 line-clamp-1 type-body text-ink-row">
        <span class="text-ink-muted">Latest:</span>
        {lead.words}
      </p>
      <Collapsible.Root bind:open>
        <Collapsible.Content reveal>
          <ol class="m-0 flex list-none flex-col p-0">
            {#each line.runs as run (run.id)}
              <li
                class="grid grid-cols-(--fold-cols) items-center gap-x-space-3 py-space-1"
                style:--fold-cols={"calc(5 * var(--spacing-space-2)) minmax(0, 1fr) auto auto"}
              >
                <span class="num type-meta text-ink-muted"
                  >{clockOf(run.at)}</span
                >
                <span class="truncate type-meta text-ink-row">{run.words}</span>
                {@render session(run)}
                {@render openRun(run, routine.name)}
              </li>
            {/each}
          </ol>
        </Collapsible.Content>
      </Collapsible.Root>
    {/if}
  </div>

  {#if line.kind === "run"}
    <div data-box class="flex items-center gap-space-1">
      {@render session(lead)}
      {@render openRun(lead, routine.name)}
    </div>
  {:else}
    <Button
      data-box
      aria-expanded={open}
      aria-label="{open ? 'Hide' : 'Show'} all {line.runs
        .length} runs of {routine.name}"
      onclick={() => {
        open = !open;
      }}
      size="xs"
      tone="quiet"
      variant="ghost"
    >
      <span>All {line.runs.length}</span>
      <IconChevronDown
        aria-hidden="true"
        class={["transition-transform", open && "rotate-180"]}
        data-icon="inline-end"
      />
    </Button>
  {/if}
</li>
