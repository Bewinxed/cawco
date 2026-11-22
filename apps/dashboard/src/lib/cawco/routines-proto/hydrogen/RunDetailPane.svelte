<script lang="ts">
  import MessageBody from "#lib/cawco/MessageBody.svelte";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { IconPlay, IconSparkles, IconTick } from "#lib/icons.js";
  import CommandOutputBlock from "./CommandOutputBlock.svelte";
  import ExactCallDisclosure from "./ExactCallDisclosure.svelte";
  import PaneFrame from "./PaneFrame.svelte";
  import PeerAnswerRow from "./PeerAnswerRow.svelte";
  import {
    actionStateMeta,
    commandFailureLabel,
    runOutcomeMeta,
    serviceName,
    triggerLabel,
  } from "./routine-format";
  import {
    type ApprovedAction,
    formatExactClock,
    formatRelAge,
    formatShortDuration,
    MOCK_NOW,
    type Routine,
    type RoutineRun,
  } from "./routines-data";
  import type { ActionDecision } from "./routines-state";
  import ServiceMark from "./ServiceMark.svelte";
  import SessionTranscript from "./SessionTranscript.svelte";
  import StatusBadge from "./StatusBadge.svelte";

  interface Props {
    actions: ApprovedAction[];
    backToList?: boolean;
    now?: number;
    onaction: (decision: ActionDecision, actionId: string) => void;
    onaskcaw: (prompt: string) => void;
    onback: () => void;
    onclose: () => void;
    onrunagain: (routineId: string) => void;
    phone?: boolean;
    routine: Routine;
    run: RoutineRun;
    stale?: boolean;
  }

  let {
    routine,
    run,
    actions,
    backToList = false,
    stale = false,
    now = MOCK_NOW,
    phone = false,
    onback,
    onclose,
    onrunagain,
    onaskcaw,
    onaction,
  }: Props = $props();

  let activeTab = $state<"result" | "session">("result");
  let seenRunId = "";

  $effect(() => {
    if (seenRunId && seenRunId !== run.id) {
      activeTab = "result";
    }
    seenRunId = run.id;
  });

  const outcome = $derived(runOutcomeMeta(run.outcome));
  const triggeredBy = $derived(run.triggerDetail ?? triggerLabel(run.trigger));
  const cmdFail = $derived(commandFailureLabel(run));
  const linkedActions = $derived(
    run.proposedActionIds
      ? actions.filter((one) => run.proposedActionIds?.includes(one.id))
      : []
  );

  const metaParts = $derived.by(() => {
    const parts = [
      `${formatRelAge(run.startedAt, now)} (${formatExactClock(run.startedAt)})`,
      formatShortDuration(run.durationMs),
    ];
    if (run.turns !== undefined) {
      parts.push(`${run.turns} ${run.turns === 1 ? "turn" : "turns"}`);
    }
    if (run.costDollars !== undefined) {
      parts.push(`$${run.costDollars.toFixed(2)}`);
    }
    return parts;
  });

  function switchRunTab(next: string): void {
    if (next === "result" || next === "session") {
      activeTab = next;
    }
  }

  function cawRunPrompt(): string {
    return `Look at run ${run.id} of "${routine.name}" (${outcome.label}: ${run.oneLine}) and tell me what to fix.`;
  }
</script>

<PaneFrame
  backLabel={phone && backToList ? "Routines" : "Back to routine"}
  backTo={phone && backToList ? "Routines" : routine.name}
  label="Run · {formatRelAge(run.startedAt, now)}"
  onback={phone && backToList ? onclose : onback}
  {onclose}
  {phone}
  slotName="run"
  slotValue={run.id}
  title="Run · {formatRelAge(run.startedAt, now)}"
>
  <header class="flex flex-col gap-space-2">
    <h2 class="m-0 type-title text-ink-strong wrap-anywhere">{routine.name}</h2>

    <div class="flex flex-wrap items-center gap-space-2">
      <StatusBadge
        glyph={outcome.glyph}
        label={outcome.label}
        tone={outcome.tone}
        variant={outcome.badge}
      />
      <Badge variant="secondary"><span>{triggeredBy}</span></Badge>
      {#if run.retriedOnce}
        <Badge variant="attn"><span>Retried once</span></Badge>
      {/if}
    </div>

    <div
      class="flex flex-wrap items-center gap-x-space-2 gap-y-space-1 type-meta text-ink-muted tabular-nums"
    >
      {#each metaParts as part, idx (part)}
        {#if idx > 0}
          <span aria-hidden="true">·</span>
        {/if}
        <span>{part}</span>
      {/each}
    </div>

    {#if run.session}
      <nav aria-label="Run details" class="pt-space-1">
        <Tabs onValueChange={switchRunTab} value={activeTab}>
          <TabsList aria-label="Result or session">
            <TabItem label="Result" value="result" />
            <TabItem label="Session" value="session" />
          </TabsList>
        </Tabs>
      </nav>
    {/if}
  </header>

  {#if activeTab === "result" || !run.session}
    <div class="flex flex-col gap-space-4" data-slot="run-result">
      <article
        class="flex flex-col gap-space-3 rounded-lg border border-border-well bg-surface-well p-space-4"
      >
        {#if cmdFail}
          <p class="m-0 type-label text-status-fail-ink">{cmdFail}</p>
        {/if}
        <MessageBody source={run.resultMarkdown} wrap="pretty" />
      </article>

      {#if run.commandStdout}
        <CommandOutputBlock
          ariaLabel="Copy command output"
          code={run.commandStdout}
          heading="Command output"
          preformatted
        />
      {/if}

      {#if linkedActions.length > 0}
        <section class="flex flex-col gap-space-2">
          <h3 class="m-0 type-label text-ink-strong">
            Outside actions from this run
          </h3>
          <ul class="m-0 flex list-none flex-col gap-space-2 p-0">
            {#each linkedActions as item (item.id)}
              {@const actMeta = actionStateMeta(item.state, item.needsLook)}
              <li
                class="flex flex-col gap-space-2 rounded-well border border-border-hairline bg-surface-raised p-space-3"
                data-run-action={item.id}
              >
                <p class="m-0 type-label text-ink-strong wrap-anywhere">
                  {item.sentence}
                </p>

                <div
                  class="flex flex-wrap items-center justify-between gap-space-2"
                >
                  <span
                    class="mark-line inline-flex items-center gap-space-2 type-meta"
                  >
                    <ServiceMark service={item.service} size="sm" />
                    <span class="font-medium text-ink-strong">
                      {serviceName(item.service)}
                    </span>
                    <span class="text-ink-muted">{item.whenLabel}</span>
                  </span>
                  <StatusBadge
                    glyph={actMeta.glyph}
                    label={actMeta.label}
                    tone={actMeta.tone}
                    variant={actMeta.badge}
                  />
                </div>

                <ExactCallDisclosure action={item} showResponse={true} />

                {#if item.state === "waiting"}
                  <PeerAnswerRow
                    disabled={stale}
                    onapprove={() => onaction("approve", item.id)}
                    ondeny={() => onaction("deny", item.id)}
                  />
                {:else if item.state === "approved"}
                  <div class="flex justify-end pt-space-1">
                    <Button
                      disabled={stale}
                      label="Cancel"
                      onclick={() => onaction("cancel", item.id)}
                      size="xs"
                      variant="outline"
                    />
                  </div>
                {:else if item.needsLook && (item.state === "unknown" || item.state === "failed")}
                  <div class="flex justify-end pt-space-1">
                    <Button
                      disabled={stale}
                      icon={IconTick}
                      label="I've checked"
                      onclick={() => onaction("acknowledge", item.id)}
                      size="xs"
                      variant="outline"
                    />
                  </div>
                {/if}
              </li>
            {/each}
          </ul>
        </section>
      {/if}
    </div>
  {:else if run.session}
    <SessionTranscript session={run.session} />
  {/if}

  <footer
    class="flex flex-wrap items-center gap-space-2 border-t border-t-border-hairline pt-space-4"
  >
    <Button
      disabled={stale || routine.status === "running"}
      icon={IconPlay}
      label="Run again"
      onclick={() => onrunagain(routine.id)}
      size="sm"
      variant="outline"
    />
    <Button
      disabled={stale}
      icon={IconSparkles}
      label="Ask Caw about this run"
      onclick={() => onaskcaw(cawRunPrompt())}
      size="sm"
      variant="ghost"
    />
  </footer>
</PaneFrame>
