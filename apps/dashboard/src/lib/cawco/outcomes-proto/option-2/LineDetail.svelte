<script lang="ts">
  /**
   * "This line", for the line selected in the lead (option 2, decision 5):
   * the ask block when one concerns it; What checks it, with Start a run
   * now and the way into the routine, or Caw's suggested routine where
   * nothing checks it; The newest run; Work on this, which gives way to The
   * agents' plan where the lead is short of room (the option's own cut). The ask leads because
   * answering outranks reading (the TOM's ranking). Each group is a heading
   * and its rows, set apart by space alone.
   */
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import AskBlock, { type AnswerState } from "./AskBlock.svelte";
  import OpenControl from "./OpenControl.svelte";
  import type { OutcomeLine } from "./outcomes";
  import WorkList from "./WorkList.svelte";

  let {
    line,
    answer,
    offline,
    tight = false,
    onsend,
    onopen,
  }: {
    line: OutcomeLine;
    /** Where its ask's answer stands. */
    answer: AnswerState;
    /** Why no act can go now; null while the hub answers. */
    offline: string | null;
    /** Where the lead is short of room (the view under 1025): the run's evidence and Work on this give way, the first to the whole run, the second to The agents' plan. */
    tight?: boolean;
    onsend: (choice: string) => void;
    /** A thing under the line was opened: a routine, a run, a task. */
    onopen: (what: string) => void;
  } = $props();

  const checker = $derived(line.checker);
</script>

{#snippet head(words: string)}
  <h3 class="type-label text-ink-muted">{words}</h3>
{/snippet}

<div
  class={["flex min-w-0 flex-col", tight ? "gap-space-5" : "gap-space-6"]}
  data-slot="line-detail"
>
  {#if line.ask}
    <AskBlock
      about={null}
      {answer}
      ask={line.ask}
      evidence={!tight}
      {offline}
      onreadrun={() => onopen(`run:${line.id}`)}
      {onsend}
    />
  {/if}

  <section class="flex min-w-0 flex-col gap-space-2">
    {@render head("What checks it")}
    {#if checker.kind === "routine"}
      <div class="flex min-w-0 items-start gap-space-2">
        <div class="flex min-w-0 flex-1 flex-col gap-space-1">
          <p class="type-label text-ink-strong">{checker.name}</p>
          <p class="type-meta text-ink-muted">{checker.does}</p>
          <p class="type-meta text-ink-row">{checker.when}</p>
          {#if checker.state && answer.kind !== "answered"}
            <p class="type-meta text-ink-row">{checker.state}</p>
          {/if}
        </div>
        <OpenControl
          label="Open {checker.name}"
          onopen={() => onopen(`routine:${checker.name}`)}
        />
      </div>
      <div class="flex flex-wrap items-center gap-space-3">
        <Button
          disabled={offline !== null ||
            (checker.cannotStart !== null && answer.kind !== "answered")}
          label="Start a run now"
          onclick={() => onopen(`start:${line.id}`)}
          size="sm"
          variant="outline"
        />
        {#if offline === null && checker.cannotStart && answer.kind !== "answered"}
          <span class="type-meta text-ink-muted">{checker.cannotStart}</span>
        {/if}
      </div>
    {:else if checker.kind === "ended"}
      <div class="flex min-w-0 items-start gap-space-2">
        <div class="flex min-w-0 flex-1 flex-col gap-space-1">
          <p class="type-label text-ink-strong">{checker.name}</p>
          <p class="type-meta text-ink-muted">{checker.why}</p>
        </div>
        <OpenControl
          label="Open {checker.name}"
          onopen={() => onopen(`routine:${checker.name}`)}
        />
      </div>
    {:else if checker.kind === "suggested"}
      <p class="type-meta text-ink-muted">Nothing checks this.</p>
      <div class="flex min-w-0 flex-col gap-space-2">
        <span><Badge><span>Caw suggests</span></Badge></span>
        <p class="type-body text-ink-strong">{checker.text}</p>
        <div class="flex flex-wrap items-center gap-space-3">
          <Button
            disabled={offline !== null}
            label="Turn it on"
            onclick={() => onopen(`routine-take:${line.id}`)}
            size="sm"
            variant="outline"
          />
          <Button
            disabled={offline !== null}
            label="Don't suggest this"
            onclick={() => onopen(`routine-dismiss:${line.id}`)}
            size="sm"
            variant="ghost"
          />
        </div>
      </div>
    {:else}
      <p class="type-meta text-ink-muted">Nothing checks this.</p>
    {/if}
  </section>

  {#if line.run}
    <section class="flex min-w-0 flex-col gap-space-2">
      {@render head("The newest run")}
      <p class="type-meta text-ink-row">
        <span
          >{line.run.when} · started by {line.run.startedBy.toLowerCase()} ·
          {line.run.ended.toLowerCase()} · took {line.run.took}</span
        >
        <Button
          pad="none"
          label="Read the whole run"
          onclick={() => onopen(`run:${line.id}`)}
          size="xs"
          variant="link"
        />
      </p>
    </section>
  {/if}

  {#if line.work.length > 0 && !tight}
    <section class="flex min-w-0 flex-col gap-space-2">
      {@render head("Work on this")}
      <WorkList
        {onopen}
        rows={line.work.slice(0, 3).map((work) => ({
          kind: "task" as const,
          name: work.title,
          ref: work.ref,
          state: work.state,
          live: work.live,
        }))}
      />
    </section>
  {/if}
</div>
