<script lang="ts">
  import MessageBody from "#lib/cawco/MessageBody.svelte";
  import { HEAD_PRIORITY, type HeadItem } from "#lib/cawco/side/head.js";
  import SideSurface from "#lib/cawco/side/SideSurface.svelte";
  /**
   * A run's own page, beside the view (the house's Open Page rule, as a
   * task opens): where its whole result lives. Its bar: Earlier run and
   * Later run of the same routine, and Open session as its one prominent
   * act where a session did it. Then the head (its routine, which opens
   * the routine; how it ended; when; what started it; how long; whether it
   * was the retry), the whole result as the run left it, the delegate's
   * report, for a look what it looks for and what the model or the command
   * said, the actions it asked to do outside, and what it cost, closed.
   */
  import { BarItem } from "#lib/components/ui/bar-glass/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Collapsible from "#lib/components/ui/collapsible/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import {
    IconArrowUpRight,
    IconChevronDown,
    IconChevronUp,
    IconMaximize,
  } from "#lib/icons.js";
  import {
    ENDING_WORD,
    isFail,
    NOW,
    nearTime,
    neighbours,
    type Run,
    routineOf,
    startWords,
  } from "./day";
  import RunGlyph from "./RunGlyph.svelte";

  let {
    run,
    now = NOW,
    looked = [],
    onopenrun,
    onopenroutine,
    onopensession,
    onlooked,
    onclose,
  }: {
    run: Run;
    now?: number;
    looked?: string[];
    onopenrun: (id: string) => void;
    onopenroutine: (id: string) => void;
    onopensession: (id: string) => void;
    onlooked: (actionId: string) => void;
    onclose: () => void;
  } = $props();

  let costOpen = $state(false);

  const routine = $derived(routineOf(run.routineId));
  const near = $derived(neighbours(run));
  const sessionId = $derived(run.doer.kind === "session" ? run.doer.id : null);

  const items = $derived<HeadItem[]>([
    {
      key: "later",
      priority: HEAD_PRIORITY.reload,
      bar: laterBar,
      menu: laterMenu,
    },
    {
      key: "earlier",
      priority: HEAD_PRIORITY.reload,
      bar: earlierBar,
      menu: earlierMenu,
    },
    ...(sessionId
      ? [
          {
            key: "session",
            priority: HEAD_PRIORITY.control,
            bar: sessionBar,
            menu: sessionMenu,
            place: "prominent" as const,
          },
        ]
      : []),
  ]);

  const doneWords = $derived(
    run.ending === "running"
      ? `Running since ${nearTime(run.at, now)}`
      : `${ENDING_WORD[run.ending]} ${nearTime(run.at, now)}${run.minutes ? `, in ${run.minutes} min` : ""}`
  );
  const WHO: Record<Run["doer"]["kind"], string | null> = {
    command: "A shell command, no session",
    none: "Skipped: nothing ran",
    session: null,
  };
  const who = $derived(WHO[run.doer.kind] ?? routine.doer);
  const resultHeading = $derived.by(() => {
    if (run.ending === "running") {
      return "So far";
    }
    return isFail(run.ending) ? "Why it failed" : "What it left";
  });
</script>

{#snippet laterBar()}
  <BarItem
    aria-disabled={!near.later || undefined}
    icon={IconChevronUp}
    label="Later run"
    onclick={() => near.later && onopenrun(near.later.id)}
  />
{/snippet}
{#snippet laterMenu()}
  <DropdownMenu.Item
    disabled={!near.later}
    onSelect={() => near.later && onopenrun(near.later.id)}
  >
    <IconChevronUp /><span>Later run</span>
  </DropdownMenu.Item>
{/snippet}
{#snippet earlierBar()}
  <BarItem
    aria-disabled={!near.earlier || undefined}
    icon={IconChevronDown}
    label="Earlier run"
    onclick={() => near.earlier && onopenrun(near.earlier.id)}
  />
{/snippet}
{#snippet earlierMenu()}
  <DropdownMenu.Item
    disabled={!near.earlier}
    onSelect={() => near.earlier && onopenrun(near.earlier.id)}
  >
    <IconChevronDown /><span>Earlier run</span>
  </DropdownMenu.Item>
{/snippet}
{#snippet sessionBar()}
  <Button
    onclick={() => sessionId && onopensession(sessionId)}
    shape="capsule"
    size="sm"
  >
    <span>Open session</span>
    <IconArrowUpRight aria-hidden="true" data-icon="inline-end" />
  </Button>
{/snippet}
{#snippet sessionMenu()}
  <DropdownMenu.Item onSelect={() => sessionId && onopensession(sessionId)}>
    <IconArrowUpRight /><span>Open session</span>
  </DropdownMenu.Item>
{/snippet}

<SideSurface
  {items}
  label="Run of {routine.name}"
  {onclose}
  recessed={false}
  title="Run, {nearTime(run.at, now)}"
>
  <div
    class="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain pt-(--side-room) scroll-timeline-transcript-head"
  >
    <article
      data-slot="run-page"
      class="flex flex-col gap-space-6 px-space-6 pt-space-3 pb-space-8"
    >
      <!-- Its head: the routine (opens it), how it ended, when, what started it. -->
      <header class="flex flex-col gap-space-2">
        <div class="flex items-center gap-space-2">
          <h2 class="m-0 min-w-0 type-title text-ink-strong">{routine.name}</h2>
          <Tip label="Open routine">
            {#snippet children(tip)}
              <Button
                {...tip}
                aria-label="Open {routine.name}"
                onclick={() => onopenroutine(routine.id)}
                press="scale"
                size="icon-xs"
                tone="quiet"
                variant="ghost"
              >
                <IconMaximize aria-hidden="true" />
              </Button>
            {/snippet}
          </Tip>
        </div>
        <p
          class={[
            "mark-line m-0 flex items-center gap-space-2 type-label font-medium",
            isFail(run.ending) ? "text-status-fail-ink" : "text-ink-strong",
          ]}
        >
          <RunGlyph mark={run.ending} />
          <span>{doneWords}{run.retry ? " · its retry" : ""}</span>
        </p>
        <p class="m-0 type-meta text-ink-muted">
          {startWords(run.start)} · {who}
        </p>
      </header>

      {#if routine.looksFor}
        <!-- A look: what it looks for, and what the model or the command said. -->
        <section
          aria-label="What it looks for"
          class="flex flex-col gap-space-2"
        >
          <h3 class="m-0 type-label font-medium text-ink-muted">
            It is looking for
          </h3>
          <p class="m-0 type-body text-ink-strong">
            {routine.looksFor.statement}
          </p>
          <blockquote
            class="m-0 flex flex-col gap-space-1 border-s-2 border-border-control ps-space-4"
          >
            <p class="m-0 type-body text-ink-row">{run.words}</p>
            <footer class="type-meta text-ink-muted">
              {run.doer.kind === "command"
                ? `said by ${run.doer.command}`
                : "said by the model that looked"}
            </footer>
          </blockquote>
          {#if run.output}
            <pre
              class="m-0 overflow-x-auto rounded-md bg-surface-recess p-space-4 type-code text-ink-row">{run.output}</pre>
          {/if}
        </section>
      {:else}
        <!-- The whole result, as the run left it. -->
        <section aria-label="Result" class="flex flex-col gap-space-2">
          <h3 class="m-0 type-label font-medium text-ink-muted">
            {resultHeading}
          </h3>
          <div class="type-body text-ink-strong">
            <MessageBody source={run.words} wrap="pretty" />
          </div>
        </section>
      {/if}

      {#if run.report}
        <section
          aria-label="The delegate's report"
          class="flex flex-col gap-space-2"
        >
          <h3 class="m-0 type-label font-medium text-ink-muted">
            The delegate's report
          </h3>
          <div class="type-body text-ink-strong">
            <MessageBody source={run.report} wrap="pretty" />
          </div>
        </section>
      {/if}

      {#if run.actions && run.actions.length > 0}
        <section
          aria-label="Asked to do outside"
          class="flex flex-col gap-space-2"
        >
          <h3 class="m-0 type-label font-medium text-ink-muted">
            Asked to do outside
          </h3>
          {#each run.actions as action (action.id)}
            {@const done = looked.includes(action.id)}
            <div class="flex flex-col gap-space-1">
              <p class="m-0 type-body text-ink-strong">{action.sentence}</p>
              <p
                class={[
                  "m-0 type-meta",
                  action.stands === "failed"
                    ? "text-status-fail-ink"
                    : "text-ink-muted",
                ]}
              >
                {action.service} · {action.stands === "waiting"
                  ? "waits on you"
                  : action.stands}{action.answer ? `: ${action.answer}` : ""}
              </p>
              {#if action.stands === "failed" && !done}
                <Button
                  class="self-start"
                  onclick={() => onlooked(action.id)}
                  size="sm"
                  variant="outline">Mark as looked at</Button
                >
              {/if}
            </div>
          {/each}
        </section>
      {/if}

      {#if run.cost}
        <Collapsible.Root bind:open={costOpen}>
          <Button
            aria-expanded={costOpen}
            class="-ms-space-3 self-start"
            onclick={() => {
              costOpen = !costOpen;
            }}
            size="sm"
            tone="quiet"
            variant="ghost"
          >
            <span>What it cost</span>
            <IconChevronDown
              aria-hidden="true"
              class={["transition-transform", costOpen && "rotate-180"]}
              data-icon="inline-end"
            />
          </Button>
          <Collapsible.Content reveal>
            <p class="m-0 pt-space-1 type-body text-ink-row">{run.cost}</p>
          </Collapsible.Content>
        </Collapsible.Root>
      {/if}
    </article>
  </div>
</SideSurface>
