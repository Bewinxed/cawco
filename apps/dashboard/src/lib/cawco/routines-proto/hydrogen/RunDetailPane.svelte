<script lang="ts">
  import MessageBody from "#lib/cawco/MessageBody.svelte";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import CommandOutputBlock from "./CommandOutputBlock.svelte";
  import PaneFrame from "./PaneFrame.svelte";
  import { runOutcomeMeta } from "./routine-format";
  import {
    formatExactClock,
    formatRelAge,
    MOCK_NOW,
    type Routine,
    type RoutineRun,
  } from "./routines-data";
  import type { RunTab } from "./routines-state";
  import SessionTranscript from "./SessionTranscript.svelte";
  import StatusGlyph from "./StatusGlyph.svelte";

  interface Props {
    now?: number;
    onback: () => void;
    onclose: () => void;
    ontab: (tab: RunTab) => void;
    phone?: boolean;
    routine: Routine;
    run: RoutineRun;
    tab: RunTab;
  }

  let {
    routine,
    run,
    now = MOCK_NOW,
    phone = false,
    tab,
    onback,
    onclose,
    ontab,
  }: Props = $props();

  const outcome = $derived(runOutcomeMeta(run.outcome));
  const age = $derived(formatRelAge(run.startedAt, now));
  const title = $derived(`Run from ${age}`);

  function chooseTab(next: string): void {
    if (next === "result" || next === "session") {
      ontab(next);
    }
  }
</script>

<PaneFrame
  backLabel="Back to {routine.name}"
  backTo={routine.name}
  label={title}
  {onback}
  {onclose}
  {phone}
  slotName="run"
  slotValue={run.id}
  {title}
>
  <header class="flex flex-col gap-space-2">
    <p
      class="mark-line m-0 inline-flex items-center gap-space-2 type-meta text-ink-muted tabular-nums"
    >
      <StatusGlyph glyph={outcome.glyph} size="sm" tone={outcome.tone} />
      <span class="font-medium text-ink-strong">{outcome.label}</span>
      <span>{formatExactClock(run.startedAt)}</span>
    </p>

    {#if run.session}
      <nav aria-label="This run" class="pt-space-1">
        <Tabs onValueChange={chooseTab} value={tab}>
          <TabsList aria-label="Result or session">
            <TabItem label="Result" value="result" />
            <TabItem label="Session" value="session" />
          </TabsList>
        </Tabs>
      </nav>
    {/if}
  </header>

  {#if tab === "session" && run.session}
    <SessionTranscript session={run.session} />
  {:else}
    <div class="flex flex-col gap-space-4" data-slot="run-result">
      <article
        class="flex flex-col gap-space-3 rounded-lg border border-border-well bg-surface-well p-space-4"
      >
        <MessageBody source={run.resultMarkdown} wrap="pretty" />
      </article>
      {#if run.commandStdout}
        <CommandOutputBlock
          ariaLabel="Copy the command's output"
          code={run.commandStdout}
          heading="What the command printed"
          preformatted
        />
      {/if}
    </div>
  {/if}
</PaneFrame>
