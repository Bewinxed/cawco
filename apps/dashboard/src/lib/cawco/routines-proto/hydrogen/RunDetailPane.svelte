<script lang="ts">
  import MessageBody from "#lib/cawco/MessageBody.svelte";
  import PageSurface from "#lib/cawco/side/PageSurface.svelte";
  import SideSurface from "#lib/cawco/side/SideSurface.svelte";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { BarGlass, BarItem } from "#lib/components/ui/bar-glass/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import CopyButton from "#lib/components/ui/copy-button/copy-button.svelte";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import {
    IconChevronLeft,
    IconPlay,
    IconSparkles,
    IconTerminal,
  } from "#lib/icons.js";
  import {
    actionStateMeta,
    attributionLabel,
    exitCodeReading,
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
  import ServiceMark from "./ServiceMark.svelte";
  import StatusGlyph from "./StatusGlyph.svelte";

  let {
    routine,
    run,
    actions,
    stale = false,
    now = MOCK_NOW,
    phone = false,
    onback,
    onclose,
    onrunagain,
    onaskcaw,
    onviewactions,
  }: {
    routine: Routine;
    run: RoutineRun;
    actions: ApprovedAction[];
    stale?: boolean;
    now?: number;
    phone?: boolean;
    onback: () => void;
    onclose: () => void;
    onrunagain: (routineId: string) => void;
    onaskcaw: (prompt: string) => void;
    onviewactions: () => void;
  } = $props();

  let tab = $state<"result" | "session">("result");

  // Reset back to Result tab when switching runs.
  let seenRunId = "";
  $effect(() => {
    const { id } = run;
    if (seenRunId && seenRunId !== id) {
      tab = "result";
    }
    seenRunId = id;
  });

  function entryFrameClass(kind: "prompt" | "tool" | "reply"): string {
    switch (kind) {
      case "tool":
        return "border border-border-well bg-code-bg";
      case "prompt":
        return "border border-border-hairline bg-surface-recess";
      case "reply":
        return "border border-border-hairline bg-surface-raised";
    }
  }

  const outcome = $derived(runOutcomeMeta(run.outcome));
  const linkedActions = $derived(
    run.proposedActionIds
      ? actions.filter((action) => run.proposedActionIds?.includes(action.id))
      : []
  );
  const hasSession = $derived(Boolean(run.session));
  const isRunning = $derived(
    routine.status === "running" ||
      run.outcome === "running" ||
      run.outcome === "queued"
  );
</script>

{#snippet backLeading()}
  <BarGlass form="group">
    <BarItem
      icon={IconChevronLeft}
      label="Back to {routine.name}"
      onclick={onback}
    />
  </BarGlass>
{/snippet}

{#snippet body()}
  <div
    class="flex flex-auto flex-col min-h-0 overflow-y-auto overscroll-contain pt-(--side-room) scroll-timeline-transcript-head"
    data-run-detail={run.id}
  >
    <div
      class="flex flex-col gap-space-4 px-space-5 pt-space-2 pb-space-7 max-phone:px-space-4"
    >
      <!-- Run facts header -->
      <header class="flex flex-col gap-space-2">
        <div class="flex flex-wrap items-center gap-space-2">
          <Badge variant={outcome.badge}>
            <StatusGlyph glyph={outcome.glyph} size="sm" tone={outcome.tone} />
            <span>{outcome.label}</span>
          </Badge>
          <Badge variant="secondary">
            <span>{triggerLabel(run.trigger)}</span>
          </Badge>
          {#if run.retriedOnce}
            <Badge variant="attn"><span>Retried once automatically</span></Badge
            >
          {/if}
        </div>

        <h2 class="m-0 type-title text-ink-strong wrap-anywhere">
          {routine.name}
        </h2>

        <div
          class="flex flex-wrap items-center gap-x-space-2 gap-y-space-1 type-meta text-ink-muted tabular-nums"
        >
          <span>
            Started {formatExactClock(run.startedAt)} ({formatRelAge(
              run.startedAt,
              now
            )})
          </span>
          <span aria-hidden="true">·</span>
          <span>Took {formatShortDuration(run.durationMs)}</span>
          {#if run.turns !== undefined}
            <span aria-hidden="true">·</span>
            <span>
              {run.turns}
              {run.turns === 1 ? "turn" : "turns"}
            </span>
          {/if}
          {#if run.costDollars !== undefined}
            <span aria-hidden="true">·</span>
            <span>${run.costDollars.toFixed(2)}</span>
          {/if}
        </div>

        {#if run.triggerDetail}
          <p class="m-0 type-meta text-ink-muted">
            Triggered by: <span class="text-ink-strong"
              >{run.triggerDetail}</span
            >
          </p>
        {/if}

        <!-- Task-style Result | Session switch -->
        {#if hasSession}
          <div class="pt-space-1">
            <Tabs
              onValueChange={(next) => {
                if (next === "result" || next === "session") {
                  tab = next;
                }
              }}
              value={tab}
            >
              <TabsList aria-label="Run views">
                <TabItem label="Result" value="result" />
                <TabItem label="Session" value="session" />
              </TabsList>
            </Tabs>
          </div>
        {:else}
          <p class="m-0 type-meta text-ink-subtle">
            {run.attribution === "command"
              ? "Ran as a shell command — no model session."
              : "No delegate session recorded for this run."}
          </p>
        {/if}
      </header>

      <!-- Result tab: full markdown output + raw stdout + linked outside actions -->
      {#if tab === "result" || !run.session}
        <div class="flex flex-col gap-space-4" data-slot="run-result">
          <div
            class="flex flex-col gap-space-3 rounded-lg border border-border-well bg-surface-well p-space-4"
          >
            <div
              class="flex flex-wrap items-center justify-between gap-space-2"
            >
              <span class="type-meta font-medium text-ink-muted">
                {attributionLabel(run)}
              </span>
              {#if run.exitCode !== undefined && run.exitCode !== null}
                <span class="font-mono type-meta text-ink-subtle">
                  {exitCodeReading(run.exitCode)}
                </span>
              {/if}
            </div>

            <MessageBody source={run.resultMarkdown} wrap="pretty" />
          </div>

          {#if run.commandStdout}
            <div class="flex flex-col gap-space-2">
              <div class="flex items-center justify-between gap-space-2">
                <div
                  class="mark-line flex items-center gap-space-2 type-label text-ink-strong"
                >
                  <IconTerminal class="size-icon-sm flex-none text-ink-muted" />
                  <span>Command output</span>
                </div>
                <CopyButton
                  aria-label="Copy command output"
                  size="xs"
                  text={run.commandStdout}
                  variant="ghost"
                >
                  Copy
                </CopyButton>
              </div>
              <pre
                class="m-0 overflow-x-auto rounded-well border border-border-well bg-code-bg p-space-3 font-mono type-code text-ink-strong whitespace-pre-wrap wrap-anywhere">{run.commandStdout}</pre>
            </div>
          {/if}

          {#if linkedActions.length > 0}
            <div class="flex flex-col gap-space-2">
              <div class="flex items-center justify-between gap-space-2">
                <h3 class="m-0 type-label text-ink-strong">
                  Outside actions proposed in this run
                </h3>
                <Button
                  label="View in Approved actions"
                  onclick={onviewactions}
                  size="xs"
                  variant="ghost"
                />
              </div>
              <ul class="m-0 flex list-none flex-col gap-space-2 p-0">
                {#each linkedActions as item (item.id)}
                  {@const actMeta = actionStateMeta(item.state, item.needsLook)}
                  <li
                    class="flex flex-col gap-space-2 rounded-well border border-border-hairline bg-surface-raised p-space-3"
                  >
                    <div
                      class="flex flex-wrap items-center justify-between gap-space-2"
                    >
                      <span
                        class="mark-line inline-flex items-center gap-space-2"
                      >
                        <ServiceMark service={item.service} size="sm" />
                        <span class="type-label text-ink-strong">
                          {serviceName(item.service)}
                        </span>
                        <span class="font-mono type-meta text-ink-muted">
                          {item.account}
                        </span>
                      </span>
                      <Badge variant={actMeta.badge}>
                        <StatusGlyph
                          glyph={actMeta.glyph}
                          size="sm"
                          tone={actMeta.tone}
                        />
                        <span>{actMeta.label}</span>
                      </Badge>
                    </div>
                    <p class="m-0 type-meta text-ink-strong">{item.sentence}</p>
                    <code
                      class="rounded-xs bg-surface-well px-space-2 py-space-1 font-mono type-code text-ink-muted wrap-anywhere"
                    >
                      {item.exactCall}
                    </code>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
        </div>
      {:else if run.session}
        <!-- Session tab: full readable delegate transcript -->
        <div class="flex flex-col gap-space-4" data-slot="run-session">
          <div
            class="flex flex-col gap-space-1 rounded-well border border-border-well bg-surface-well p-space-3"
          >
            <span class="type-label text-ink-strong">{run.session.title}</span>
            <div
              class="flex flex-wrap items-center gap-x-space-2 gap-y-space-row type-meta text-ink-muted"
            >
              <span>{run.session.harness}</span>
              <span aria-hidden="true">·</span>
              <span class="font-mono">{run.session.model}</span>
              <span aria-hidden="true">·</span>
              <span class="font-mono">{run.session.id}</span>
            </div>
            <span class="font-mono type-meta text-ink-subtle wrap-anywhere">
              {run.session.place}
            </span>
          </div>

          <ol class="m-0 flex list-none flex-col gap-space-3 p-0">
            {#each run.session.entries as entry (entry.id)}
              <li
                class={[
                  "flex flex-col gap-space-1 rounded-well p-space-3",
                  entryFrameClass(entry.kind),
                ]}
              >
                <div class="flex items-center justify-between gap-space-2">
                  <span
                    class={[
                      "mark-line inline-flex min-w-0 items-center gap-space-2 type-meta",
                      entry.kind === "tool"
                        ? "font-mono text-ink-strong"
                        : "font-medium text-ink-muted",
                    ]}
                  >
                    {#if entry.kind === "tool"}
                      <IconTerminal
                        class="size-icon-sm flex-none text-ink-muted"
                      />
                    {/if}
                    <span class="min-w-0 wrap-anywhere">{entry.label}</span>
                  </span>
                  <span
                    class="flex-none font-mono type-meta text-ink-subtle tabular-nums"
                  >
                    +{entry.timeOffset}
                  </span>
                </div>
                <p
                  class={[
                    "m-0 whitespace-pre-wrap wrap-anywhere",
                    entry.kind === "tool"
                      ? "font-mono type-code text-ink-muted"
                      : "type-body text-ink-strong",
                  ]}
                >
                  {entry.text}
                </p>
              </li>
            {/each}
          </ol>
        </div>
      {/if}

      <!-- Follow-up actions -->
      <div
        class="flex flex-wrap items-center gap-space-2 border-t border-t-border-hairline pt-space-4"
      >
        <Button
          disabled={stale || isRunning}
          icon={IconPlay}
          label={routine.kind === "check" ? "Check again now" : "Run again now"}
          onclick={() => onrunagain(routine.id)}
          size="sm"
          variant="outline"
        />
        <Button
          disabled={stale}
          icon={IconSparkles}
          label="Ask Caw about this run"
          onclick={() =>
            onaskcaw(
              `Look at run ${run.id} of "${routine.name}" (${outcome.label}: ${run.oneLine}) and tell me what to fix.`
            )}
          size="sm"
          variant="ghost"
        />
      </div>
    </div>
  </div>
{/snippet}

{#if phone}
  <PageSurface
    backTo={routine.name}
    label="Run result · {routine.name}"
    onclose={onback}
    title="Run · {formatRelAge(run.startedAt, now)}"
  >
    {@render body()}
  </PageSurface>
{:else}
  <SideSurface
    label="Run result · {routine.name}"
    leading={backLeading}
    of="task"
    {onclose}
    recessed={false}
    title="Run · {formatRelAge(run.startedAt, now)}"
  >
    {@render body()}
  </SideSurface>
{/if}
