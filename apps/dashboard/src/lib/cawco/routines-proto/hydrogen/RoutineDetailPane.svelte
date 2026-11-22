<script lang="ts">
  import MessageBody from "#lib/cawco/MessageBody.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { IconMaximize, IconPen, IconSparkles } from "#lib/icons.js";
  import CommandOutputBlock from "./CommandOutputBlock.svelte";
  import PaneFrame from "./PaneFrame.svelte";
  import RunHistoryRow from "./RunHistoryRow.svelte";
  import {
    checkWords,
    nextRunWords,
    readRoutine,
    rhythmWords,
    runOutcomeMeta,
  } from "./routine-format";
  import {
    formatExactClock,
    formatRelAge,
    MOCK_NOW,
    type Routine,
  } from "./routines-data";
  import type { RunTab } from "./routines-state";
  import StatusGlyph from "./StatusGlyph.svelte";

  interface Props {
    now?: number;
    onaskcaw: (prompt: string) => void;
    onclose: () => void;
    onedit: (id: string) => void;
    onopenrun: (routineId: string, runId: string, tab: RunTab) => void;
    phone?: boolean;
    routine: Routine;
    stale?: boolean;
  }

  let {
    routine,
    stale = false,
    now = MOCK_NOW,
    phone = false,
    onclose,
    onedit,
    onaskcaw,
    onopenrun,
  }: Props = $props();

  const reading = $derived(readRoutine(routine, now));
  const latest = $derived(routine.runs[0] ?? null);
  const latestMeta = $derived(latest ? runOutcomeMeta(latest.outcome) : null);
  const earlier = $derived(routine.runs.slice(1));
  const check = $derived(routine.check ?? null);
</script>

<PaneFrame
  label={routine.name}
  {onclose}
  {phone}
  slotName="routine"
  slotValue={routine.id}
  title={routine.name}
>
  <header class="flex flex-col gap-space-3">
    <p
      class={[
        "mark-line m-0 flex max-w-c-measure items-start gap-space-2 type-body text-pretty",
        reading.needsYou ? "text-ink-strong" : "text-ink-muted",
      ]}
      data-slot="routine-sentence"
    >
      {#if reading.needsYou}
        <span
          aria-label="Needs you"
          class="inline-flex h-lh flex-none items-center"
          data-box
          role="img"
          title="Needs you"
        >
          <StatusGlyph glyph="needs-you" tone="attn" />
        </span>
      {:else if reading.running}
        <span class="inline-flex h-lh flex-none items-center" data-box>
          <LiveDot size="row" tone="live" />
        </span>
      {/if}
      <span>{reading.sentence}</span>
    </p>
    <div class="flex flex-wrap items-center gap-space-2">
      <Button
        disabled={stale}
        icon={IconPen}
        label={routine.builtIn ? "Change when it runs" : "Edit"}
        onclick={() => onedit(routine.id)}
        size="sm"
        variant="outline"
      />
      <Button
        disabled={stale}
        icon={IconSparkles}
        label="Change with Caw"
        onclick={() =>
          onaskcaw(
            reading.fixPrompt ?? `Change the routine "${routine.name}": `
          )}
        size="sm"
        variant="outline"
      />
    </div>
  </header>

  {#if latest && latestMeta}
    <section
      aria-labelledby="latest-run-h"
      class="flex flex-col gap-space-3 border-t border-t-border-hairline pt-space-4"
      data-slot="latest-run"
    >
      <header class="flex items-center justify-between gap-space-2">
        <h3
          class="mark-line m-0 inline-flex min-w-0 items-center gap-space-2 type-label text-ink-strong"
          id="latest-run-h"
        >
          <StatusGlyph
            glyph={latestMeta.glyph}
            size="sm"
            tone={latestMeta.tone}
          />
          <span>Latest run: {latestMeta.label.toLowerCase()}</span>
          <span
            class="font-normal text-ink-subtle tabular-nums"
            title={formatExactClock(latest.startedAt)}
          >
            {formatRelAge(latest.startedAt, now)}
          </span>
        </h3>
        {#if latest.session}
          <Button
            data-open-run={latest.id}
            icon={IconMaximize}
            label="Open session"
            onclick={() => onopenrun(routine.id, latest.id, "session")}
            size="xs"
            variant="ghost"
          />
        {/if}
      </header>
      <article
        class="flex flex-col gap-space-3 rounded-lg border border-border-well bg-surface-well p-space-4"
      >
        <MessageBody source={latest.resultMarkdown} wrap="pretty" />
      </article>
      {#if latest.commandStdout}
        <CommandOutputBlock
          ariaLabel="Copy the command's output"
          code={latest.commandStdout}
          heading="What the command printed"
          preformatted
        />
      {/if}
    </section>
  {/if}

  <section
    aria-labelledby="routine-does-h"
    class="flex flex-col gap-space-3 border-t border-t-border-hairline pt-space-4"
  >
    <h3 class="m-0 type-label text-ink-strong" id="routine-does-h">
      What it does
    </h3>
    <p class="m-0 max-w-c-measure type-body text-ink-strong text-pretty">
      {routine.instructions}
    </p>
    {#if routine.guardrail}
      <p class="m-0 max-w-c-measure type-meta text-ink-muted text-pretty">
        Only runs when: {routine.guardrail}
      </p>
    {/if}
    <p class="m-0 type-meta text-ink-muted tabular-nums">
      {rhythmWords(routine)}. {nextRunWords(routine, now)}
    </p>
  </section>

  {#if check}
    <section
      aria-labelledby="routine-waits-h"
      class="flex flex-col gap-space-3 border-t border-t-border-hairline pt-space-4"
      data-slot="routine-waits-for"
    >
      <h3 class="m-0 type-label text-ink-strong" id="routine-waits-h">
        What it waits for
      </h3>
      <p class="m-0 max-w-c-measure type-body text-ink-strong text-pretty">
        {check.statement}
      </p>
      <p class="m-0 max-w-c-measure type-meta text-ink-muted text-pretty">
        {checkWords(routine)}
      </p>
      {#if check.method === "command" && check.command}
        <CommandOutputBlock ariaLabel="Copy the command" code={check.command} />
      {/if}
      {#if check.heldTasks.length > 0}
        <div class="flex flex-col gap-space-1">
          <span class="type-meta text-ink-muted">Waiting on it</span>
          <ul class="m-0 flex list-none flex-col gap-space-1 p-0">
            {#each check.heldTasks as task (task)}
              <li class="type-meta text-ink-strong">{task}</li>
            {/each}
          </ul>
        </div>
      {/if}
    </section>
  {/if}

  {#if earlier.length > 0}
    <section
      aria-labelledby="earlier-runs-h"
      class="flex flex-col gap-space-2 border-t border-t-border-hairline pt-space-4"
    >
      <h3 class="m-0 type-label text-ink-strong" id="earlier-runs-h">
        Earlier runs
      </h3>
      <ul
        class="m-0 list-none overflow-hidden rounded-lg border border-border-hairline bg-surface-raised p-0"
      >
        {#each earlier as run (run.id)}
          <RunHistoryRow
            {now}
            onopen={() => onopenrun(routine.id, run.id, "result")}
            {run}
          />
        {/each}
      </ul>
    </section>
  {/if}
</PaneFrame>
