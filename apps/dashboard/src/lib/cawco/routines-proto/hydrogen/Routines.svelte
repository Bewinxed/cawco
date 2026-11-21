<script lang="ts">
  import { DAY_MS, HOUR_MS } from "@cawco/core/time";
  import { MediaQuery } from "svelte/reactivity";
  import { CawLead } from "#lib/cawco/project/caw-lead.svelte.js";
  import ProjectHead from "#lib/cawco/project/ProjectHead.svelte";
  import { PANE_INSET } from "#lib/cawco/project/pane-inset.js";
  import ViewBar from "#lib/cawco/project/ViewBar.svelte";
  import ViewTabs from "#lib/cawco/project/ViewTabs.svelte";
  import Split from "#lib/cawco/side/Split.svelte";
  import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import { NARROW_QUERY, PHONE_QUERY } from "#lib/hooks/is-mobile.svelte.js";
  import {
    IconClose,
    IconPlus,
    IconRepeat,
    IconSend,
    IconSparkles,
    IconTick,
  } from "#lib/icons.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import ActionsPanel from "./ActionsPanel.svelte";
  import EventsPanel from "./EventsPanel.svelte";
  import RoutineDetailPane from "./RoutineDetailPane.svelte";
  import RoutineEditorPane, {
    type RoutineDraftSubmit,
  } from "./RoutineEditorPane.svelte";
  import RoutineList from "./RoutineList.svelte";
  import RunDetailPane from "./RunDetailPane.svelte";
  import {
    type ApprovedAction,
    type CawSuggestion,
    describeDraftSchedule,
    type EventRule,
    type EventSource,
    INITIAL_ACTIONS,
    INITIAL_EVENTS,
    INITIAL_ROUTINES,
    INITIAL_RULES,
    INITIAL_SOURCES,
    INITIAL_SUGGESTION,
    LOCAL_ZONE,
    MOCK_MACHINE,
    MOCK_NOW,
    MOCK_PROJECT,
    PROJECT_STARTERS,
    PROJECT_VIEWS,
    type RecentEvent,
    type Routine,
    type RoutineRun,
  } from "./routines-data";

  let {
    stale = false,
  }: {
    /** Simulates a disconnected hub reading where live attention counts are withheld. */
    stale?: boolean;
  } = $props();

  const narrowDesk = new MediaQuery(NARROW_QUERY);
  const phoneBarQuery = new MediaQuery(PHONE_QUERY);
  const phonePage = $derived(narrowDesk.current);
  const phoneBar = $derived(phoneBarQuery.current);

  // Local reactive copies of product-shaped data so every interaction works live.
  let routines = $state<Routine[]>(structuredClone(INITIAL_ROUTINES));
  let actions = $state<ApprovedAction[]>(structuredClone(INITIAL_ACTIONS));
  let sources = $state<EventSource[]>(structuredClone(INITIAL_SOURCES));
  let rules = $state<EventRule[]>(structuredClone(INITIAL_RULES));
  let recentEvents = $state<RecentEvent[]>(structuredClone(INITIAL_EVENTS));
  let suggestion = $state<CawSuggestion | null>(
    structuredClone(INITIAL_SUGGESTION)
  );

  type WorkspaceTab = "routines" | "actions" | "events";
  let workspaceTab = $state<WorkspaceTab>("routines");

  type SideState =
    | { kind: "routine"; routineId: string }
    | { kind: "run"; routineId: string; runId: string }
    | { kind: "create" }
    | { kind: "edit"; routineId: string }
    | null;
  let side = $state<SideState>(null);

  // Inline editable Ask Caw composer (talk-first, without blocking the screen).
  let askOpen = $state(false);
  let askDraft = $state("");
  let askNotice = $state<string | null>(null);
  let runSeq = $state(100);

  // Real CawLead for ProjectHead so Caw's live seat and menu mount natively.
  const lead = new CawLead({
    id: () => MOCK_PROJECT.id,
    project: () => MOCK_PROJECT,
    machinesOnline: () => !stale,
    tasks: () => [],
    reading: () => false,
  });

  // Clicking Caw's seat or Ask Caw in ProjectHead opens our inline Ask Caw box.
  $effect(() => {
    if (lead.open) {
      const prefill = lead.draft.text.trim();
      lead.open = false;
      openAskCaw(prefill || undefined);
    }
  });

  const openRoutine = $derived.by(() => {
    const current = side;
    if (!current || current.kind === "create") {
      return null;
    }
    return routines.find((one) => one.id === current.routineId) ?? null;
  });

  const openRun = $derived.by(() => {
    const current = side;
    if (current?.kind !== "run" || !openRoutine) {
      return null;
    }
    return openRoutine.runs.find((one) => one.id === current.runId) ?? null;
  });

  const selectedRoutineId = $derived(
    side && side.kind !== "create" ? side.routineId : null
  );

  const actionsAttention = $derived(
    actions.filter(
      (action) =>
        action.state === "waiting" ||
        (action.needsLook &&
          (action.state === "unknown" || action.state === "failed"))
    ).length
  );

  const eventSourceFaults = $derived(
    sources.filter((source) => source.error !== null).length
  );

  const sideOpen = $derived(
    side !== null &&
      (side.kind === "create" ||
        (side.kind === "routine" && openRoutine !== null) ||
        (side.kind === "edit" && openRoutine !== null) ||
        (side.kind === "run" && openRoutine !== null && openRun !== null))
  );

  /** Only one coral prominent button at a time: editor Submit owns coral while open. */
  const editorOwnsCoral = $derived(
    side !== null && (side.kind === "create" || side.kind === "edit")
  );

  function openAskCaw(prompt?: string): void {
    askOpen = true;
    askNotice = null;
    if (prompt !== undefined) {
      askDraft = prompt;
    }
  }

  function submitAskCaw(event: SubmitEvent): void {
    event.preventDefault();
    const words = askDraft.trim();
    if (!words || stale) {
      return;
    }
    askNotice = `Sent to Caw in ${MOCK_PROJECT.name}: "${words}"`;
    askDraft = "";
    askOpen = false;
  }

  function nextRunId(prefix: string): string {
    runSeq += 1;
    return `${prefix}-${runSeq}`;
  }

  function closeSide(): void {
    side = null;
  }

  function handleOpenRoutine(id: string): void {
    side = { kind: "routine", routineId: id };
  }

  function handleOpenRun(routineId: string, runId: string): void {
    side = { kind: "run", routineId, runId };
  }

  function makeLiveRun(
    prefix: string,
    trigger: RoutineRun["trigger"],
    attribution: RoutineRun["attribution"],
    oneLine: string,
    resultMarkdown: string
  ): RoutineRun {
    return {
      id: nextRunId(prefix),
      startedAt: MOCK_NOW,
      durationMs: 1000,
      trigger,
      outcome: "running",
      attribution,
      oneLine,
      resultMarkdown,
    };
  }

  function buildExecutor(draft: RoutineDraftSubmit): Routine["executor"] {
    if (draft.kind === "check" && draft.checkMethod === "command") {
      return {
        mode: "command",
        label: `Shell command on ${MOCK_MACHINE.hostname}`,
      };
    }
    const prefix =
      draft.executorMode === "orchestrator"
        ? "Orchestrating session"
        : "Fresh delegate";
    return {
      mode: draft.executorMode,
      delegateType:
        draft.delegateType === "CawCo's pick" ? undefined : draft.delegateType,
      label: `${prefix} · ${draft.delegateType}`,
    };
  }

  function buildSchedule(
    draft: RoutineDraftSubmit,
    rhythm: string,
    nextAt: number | null,
    existing?: Routine["schedule"]
  ): Routine["schedule"] {
    return {
      ...existing,
      cadence: draft.cadence,
      cron: draft.cadence === "custom" ? draft.cron : undefined,
      rhythm,
      time: draft.time,
      weekday: draft.weekday,
      timezone: draft.timezone,
      nextAt,
    };
  }

  function buildCheck(
    draft: RoutineDraftSubmit,
    giveUpAt: number | null,
    existing?: Routine["check"]
  ): Routine["check"] {
    if (draft.kind !== "check") {
      return undefined;
    }
    return {
      statement: draft.checkStatement,
      method: draft.checkMethod,
      command: draft.checkMethod === "command" ? draft.checkCommand : undefined,
      machineName: existing?.machineName ?? MOCK_MACHINE.hostname,
      standing: existing?.standing ?? "pending",
      lastWords: existing?.lastWords ?? null,
      lastWordsBy: existing?.lastWordsBy ?? null,
      lastExitCode: existing?.lastExitCode ?? null,
      checkedAt: existing?.checkedAt ?? null,
      metAt: existing?.metAt ?? null,
      giveUpAt,
      heldTasks: existing?.heldTasks ?? [],
      heldSteps: existing?.heldSteps ?? 0,
    };
  }

  function draftSummary(draft: RoutineDraftSubmit): string {
    if (draft.kind === "check") {
      return `Looks for: ${draft.checkStatement}`;
    }
    const [firstLine] = draft.instructions.split("\n");
    return firstLine ?? draft.instructions;
  }

  function applyEditToRoutine(
    one: Routine,
    draft: RoutineDraftSubmit,
    rhythm: string,
    giveUpAt: number | null
  ): Routine {
    const inactive =
      one.status === "paused" ||
      one.status === "stopped" ||
      one.status === "finished" ||
      draft.cadence === "events";
    const nextAt = inactive ? null : MOCK_NOW + HOUR_MS;
    const schedule = buildSchedule(draft, rhythm, nextAt, one.schedule);
    if (one.builtIn) {
      return { ...one, schedule };
    }
    return {
      ...one,
      name: draft.name,
      kind: draft.kind,
      summary: draftSummary(draft),
      instructions: draft.instructions,
      executor: buildExecutor(draft),
      schedule,
      check: buildCheck(draft, giveUpAt, one.check),
    };
  }

  function handleRunNow(id: string): void {
    if (stale) {
      return;
    }
    const target = routines.find((one) => one.id === id);
    if (!target || target.status === "running") {
      return;
    }
    const freshRun = makeLiveRun(
      "run-live",
      "manual",
      target.check?.method === "command" ? "command" : "model",
      target.kind === "check"
        ? "Checking now on obelisk…"
        : "Running now on obelisk…",
      target.kind === "check"
        ? "Check is running right now on `obelisk`."
        : "Run started by you and is currently running on `obelisk`."
    );
    routines = routines.map((one) =>
      one.id === id
        ? {
            ...one,
            status: "running",
            statusReason: null,
            runningStartedAt: MOCK_NOW,
            runningStep:
              one.kind === "check"
                ? "Running check now"
                : "Running manual trigger",
            runs: [freshRun, ...one.runs],
          }
        : one
    );
  }

  function handleTogglePause(id: string): void {
    if (stale) {
      return;
    }
    routines = routines.map((one) => {
      if (one.id !== id || one.status === "finished") {
        return one;
      }
      const resuming = one.status === "paused" || one.status === "stopped";
      return {
        ...one,
        status: resuming ? "active" : "paused",
        statusReason: resuming ? null : "Paused by you",
        schedule: {
          ...one.schedule,
          nextAt: resuming
            ? (one.schedule.nextAt ?? MOCK_NOW + 2 * HOUR_MS)
            : null,
        },
        check: one.check
          ? {
              ...one.check,
              standing: resuming ? "not-yet" : "paused",
            }
          : undefined,
      };
    });
  }

  function handleKeep(id: string): void {
    if (stale) {
      return;
    }
    routines = routines.map((one) => {
      if (one.id !== id) {
        return one;
      }
      const latestFailed =
        one.runs[0]?.outcome === "failed" ||
        one.runs[0]?.outcome === "could-not-check";
      return {
        ...one,
        statusReason: latestFailed ? "Last run failed" : null,
        origin: {
          ...one.origin,
          kept: true,
          expiresAt: null,
        },
      };
    });
  }

  function handleMarkMet(id: string): void {
    if (stale) {
      return;
    }
    routines = routines.map((one) => {
      if (one.id !== id || !one.check) {
        return one;
      }
      const releasedNames = one.check.heldTasks.map((task) => task.id);
      const releaseLine =
        releasedNames.length > 0
          ? `Released ${releasedNames.join(", ")} and stopped checking.`
          : "Marked met by you and stopped checking.";
      const metRun: RoutineRun = {
        id: nextRunId("run-met"),
        startedAt: MOCK_NOW,
        durationMs: 0,
        trigger: "manual",
        outcome: "met",
        attribution: "system",
        oneLine: `Marked met by you · ${releaseLine}`,
        resultMarkdown: `### Marked met by you\n\nStatement: *${one.check.statement}*\n\n${releaseLine}`,
      };
      return {
        ...one,
        status: "finished",
        statusReason: "Met by you · won't run again",
        schedule: {
          ...one.schedule,
          nextAt: null,
        },
        check: {
          ...one.check,
          standing: "met",
          markedMetByOwner: true,
          metAt: MOCK_NOW,
          checkedAt: MOCK_NOW,
          lastWords: "Marked met by you.",
          lastWordsBy: "owner",
          heldTasks: [],
          heldSteps: 0,
        },
        runs: [metRun, ...one.runs],
      };
    });
  }

  function handleLookAgain(id: string): void {
    if (stale) {
      return;
    }
    const target = routines.find((one) => one.id === id);
    if (!target?.check) {
      return;
    }
    const freshRun = makeLiveRun(
      "run-check",
      "manual",
      target.check.method === "command" ? "command" : "model",
      "Checking again on obelisk…",
      "A fresh check is running now on `obelisk`."
    );
    routines = routines.map((one) =>
      one.id === id && one.check
        ? {
            ...one,
            status: "running",
            statusReason: null,
            runningStartedAt: MOCK_NOW,
            runningStep: "Running fresh check",
            schedule: {
              ...one.schedule,
              nextAt: MOCK_NOW + HOUR_MS,
            },
            check: {
              ...one.check,
              standing: "not-yet",
              markedMetByOwner: false,
              metAt: null,
            },
            runs: [freshRun, ...one.runs],
          }
        : one
    );
  }

  function handleExtendDate(id: string, days: number | null): void {
    if (stale) {
      return;
    }
    routines = routines.map((one) =>
      one.id === id && one.check
        ? {
            ...one,
            status: "active",
            statusReason: null,
            schedule: {
              ...one.schedule,
              nextAt: MOCK_NOW + HOUR_MS,
            },
            check: {
              ...one.check,
              standing: "not-yet",
              giveUpAt: days === null ? null : MOCK_NOW + days * DAY_MS,
            },
          }
        : one
    );
  }

  function handleDelete(id: string): void {
    if (stale) {
      return;
    }
    routines = routines.filter((one) => one.id !== id);
    rules = rules.filter((rule) => rule.routineId !== id);
    if (side && side.kind !== "create" && side.routineId === id) {
      side = null;
    }
  }

  function handleSaveRoutine(draft: RoutineDraftSubmit): void {
    if (stale) {
      return;
    }
    const { rhythm } = describeDraftSchedule({
      cadence: draft.cadence,
      time: draft.time,
      weekday: draft.weekday,
      cron: draft.cron,
      timezone: draft.timezone,
    });
    const giveUpAt = draft.giveUpDate
      ? Date.parse(`${draft.giveUpDate}T23:59:59Z`)
      : null;

    if (side?.kind === "edit") {
      const editId = side.routineId;
      routines = routines.map((one) =>
        one.id === editId
          ? applyEditToRoutine(one, draft, rhythm, giveUpAt)
          : one
      );
      side = { kind: "routine", routineId: editId };
      return;
    }

    // Create new routine and immediately kick off creation-test run (T10, T11).
    const newId = nextRunId("rtn-new");
    const isCmd = draft.kind === "check" && draft.checkMethod === "command";
    const testRun = makeLiveRun(
      "run-test",
      "creation-test",
      isCmd ? "command" : "model",
      "Running creation test on obelisk…",
      "Creation test is running now on `obelisk`. Results will appear here once it finishes."
    );
    const nextAt = draft.cadence === "events" ? null : MOCK_NOW + HOUR_MS;
    const created: Routine = {
      id: newId,
      name: draft.name,
      kind: draft.kind,
      status: "running",
      statusReason: null,
      runningStartedAt: MOCK_NOW,
      runningStep: "Running creation test",
      summary: draftSummary(draft),
      instructions: draft.instructions,
      check: buildCheck(draft, giveUpAt),
      schedule: buildSchedule(draft, rhythm, nextAt),
      eventTriggers: [],
      executor: buildExecutor(draft),
      origin: {
        by: "owner",
        kept: true,
      },
      limits: {
        maxMinutes: isCmd ? 1 : 5,
        maxTurns: isCmd ? undefined : 12,
        maxDollars: isCmd ? undefined : 0.75,
        runsWeek: 1,
      },
      runs: [testRun],
    };
    routines = [created, ...routines];
    workspaceTab = "routines";
    side = { kind: "routine", routineId: newId };
  }

  function handleTurnOnSuggestion(): void {
    if (!suggestion || stale) {
      return;
    }
    const added: Routine = {
      id: "rtn-unused-skills",
      name: suggestion.title,
      summary:
        "Counts skills and MCP servers called in the past 30 days and proposes unlisting unused ones.",
      kind: "work",
      status: "active",
      statusReason: null,
      builtIn: true,
      instructions: suggestion.detail,
      schedule: {
        cadence: "weekly",
        rhythm: "Every Mon at 09:00",
        time: "09:00",
        weekday: "Mon",
        timezone: LOCAL_ZONE,
        nextAt: MOCK_NOW + 35 * HOUR_MS,
      },
      eventTriggers: [],
      executor: {
        mode: "builtin",
        label: "CawCo built-in",
      },
      origin: {
        by: "cawco",
        kept: true,
      },
      limits: {
        maxMinutes: 3,
        runsWeek: 0,
      },
      runs: [],
    };
    routines = [...routines, added];
    suggestion = null;
  }

  function handleApproveAction(id: string): void {
    if (stale) {
      return;
    }
    actions = actions.map((one) =>
      one.id === id
        ? {
            ...one,
            state: "ran",
            stateAt: MOCK_NOW,
            whenLabel: "Ran just now",
            serviceResponse: "200 OK — accepted by service",
          }
        : one
    );
  }

  function handleDenyAction(id: string): void {
    if (stale) {
      return;
    }
    actions = actions.map((one) =>
      one.id === id ? { ...one, state: "denied", stateAt: MOCK_NOW } : one
    );
  }

  function handleCancelAction(id: string): void {
    if (stale) {
      return;
    }
    actions = actions.map((one) =>
      one.id === id ? { ...one, state: "cancelled", stateAt: MOCK_NOW } : one
    );
  }

  function handleAcknowledgeAction(id: string): void {
    if (stale) {
      return;
    }
    actions = actions.map((one) =>
      one.id === id ? { ...one, needsLook: false } : one
    );
  }

  function handleToggleRule(ruleId: string): void {
    if (stale) {
      return;
    }
    rules = rules.map((one) =>
      one.id === ruleId ? { ...one, enabled: !one.enabled } : one
    );
  }
</script>

{#snippet starterChips(
  size: "xs" | "sm",
  variant: "secondary" | "outline",
  onpick: (starter: string) => void
)}
  <div class="flex flex-wrap items-center gap-space-2">
    {#each PROJECT_STARTERS as starter (starter)}
      <Button
        disabled={stale}
        label={starter}
        onclick={() => onpick(starter)}
        {size}
        {variant}
      />
    {/each}
  </div>
{/snippet}

{#snippet sideCard()}
  {#if side?.kind === "run" && openRoutine && openRun}
    <RunDetailPane
      {actions}
      now={MOCK_NOW}
      onaskcaw={openAskCaw}
      onback={() => handleOpenRoutine(openRoutine.id)}
      onclose={closeSide}
      onrunagain={handleRunNow}
      onviewactions={() => {
        workspaceTab = "actions";
      }}
      phone={phonePage}
      routine={openRoutine}
      run={openRun}
      {stale}
    />
  {:else if side?.kind === "create" || (side?.kind === "edit" && openRoutine)}
    <RoutineEditorPane
      editing={side.kind === "edit" ? openRoutine : null}
      onaskcaw={openAskCaw}
      onback={side.kind === "edit" && openRoutine
        ? () => handleOpenRoutine(openRoutine.id)
        : undefined}
      onclose={closeSide}
      onsubmit={handleSaveRoutine}
      phone={phonePage}
      {stale}
    />
  {:else if side?.kind === "routine" && openRoutine}
    <RoutineDetailPane
      now={MOCK_NOW}
      onaskcaw={openAskCaw}
      onclose={closeSide}
      ondelete={handleDelete}
      onedit={(id) => {
        side = { kind: "edit", routineId: id };
      }}
      onextenddate={handleExtendDate}
      onkeep={handleKeep}
      onlookagain={handleLookAgain}
      onmarkmet={handleMarkMet}
      onopenrun={handleOpenRun}
      onrunnow={handleRunNow}
      ontogglepause={handleTogglePause}
      phone={phonePage}
      routine={openRoutine}
      {rules}
      {stale}
    />
  {/if}
{/snippet}

{#snippet mainWorkspace()}
  <div
    class={[
      "flex min-h-0 flex-1 flex-col overflow-y-auto pt-0 pb-space-7 max-phone:overflow-visible",
      PANE_INSET,
    ]}
    data-slot="routines-workspace"
  >
    <div class="flex flex-col gap-space-5">
      {#if stale}
        <Alert variant="warning">
          <AlertDescription>
            Showing the last reading from the hub. Live attention counts and
            changes wait until the hub reconnects.
          </AlertDescription>
        </Alert>
      {/if}

      <!-- Workspace toolbar: top-level tabs (Routines · Approved actions · Events) + primary act -->
      <div class="flex flex-wrap items-center justify-between gap-space-3">
        <Tabs
          onValueChange={(next) => {
            if (
              next === "routines" ||
              next === "actions" ||
              next === "events"
            ) {
              workspaceTab = next;
            }
          }}
          value={workspaceTab}
        >
          <TabsList aria-label="Routines workspace">
            <TabItem label="Routines" value="routines" />
            <TabItem label="Approved actions" value="actions">
              {#snippet trail()}
                {#if !stale && actionsAttention > 0}
                  <Badge
                    class="ms-space-1"
                    data-box
                    size="count"
                    variant="attn"
                  >
                    <span>{actionsAttention}</span>
                  </Badge>
                {/if}
              {/snippet}
            </TabItem>
            <TabItem label="Events" value="events">
              {#snippet trail()}
                {#if !stale && eventSourceFaults > 0}
                  <Badge
                    class="ms-space-1"
                    data-box
                    size="count"
                    variant="fail"
                  >
                    <span>{eventSourceFaults}</span>
                  </Badge>
                {/if}
              {/snippet}
            </TabItem>
          </TabsList>
        </Tabs>

        <div class="flex flex-none items-center gap-space-2">
          <Button
            disabled={stale}
            icon={IconSparkles}
            label="Ask Caw"
            onclick={() => openAskCaw()}
            size="sm"
            variant="outline"
          />
          <Button
            disabled={stale}
            icon={IconPlus}
            label="New routine"
            onclick={() => {
              side = { kind: "create" };
            }}
            size="sm"
            variant={editorOwnsCoral ? "outline" : "default"}
          />
        </div>
      </div>

      <!-- Confirmation notice when a prompt was handed to Caw -->
      {#if askNotice && !askOpen}
        <Alert layout="row" surface="card" variant="default">
          <IconTick class="text-status-done-glyph" />
          <AlertDescription>{askNotice}</AlertDescription>
          <Button
            aria-label="Dismiss notice"
            icon={IconClose}
            onclick={() => {
              askNotice = null;
            }}
            size="icon-xs"
            tone="quiet"
            variant="ghost"
          />
        </Alert>
      {/if}

      <!-- Editable inline Ask Caw composer (talk-first, T10/T12/T16) -->
      {#if askOpen}
        <form
          class="flex flex-col gap-space-3 rounded-lg border border-border-control bg-surface-raised p-space-4 shadow-tile"
          data-slot="ask-caw-tray"
          onsubmit={submitAskCaw}
          transition:unfold
        >
          <div class="flex items-center justify-between gap-space-2">
            <span
              class="mark-line inline-flex items-center gap-space-2 type-label text-ink-strong"
            >
              <IconSparkles class="size-icon-md flex-none text-brand-ink" />
              <span>Tell Caw what to set up or change</span>
            </span>
            <Button
              aria-label="Close Ask Caw"
              icon={IconClose}
              onclick={() => {
                askOpen = false;
              }}
              size="icon-xs"
              tone="quiet"
              variant="ghost"
            />
          </div>

          <Textarea
            aria-label="Message to Caw"
            placeholder="Describe a routine, a fact to watch for, or an event rule in plain words…"
            bind:value={askDraft}
          />

          {@render starterChips("xs", "secondary", (starter) => {
            askDraft = starter;
          })}

          <div class="flex flex-wrap items-center justify-between gap-space-2">
            <span class="type-meta text-ink-muted">
              Editable before sending · Caw asks before running shell commands
              if your session mode requires it.
            </span>
            <div class="flex items-center gap-space-2">
              <Button
                label="Create by hand"
                onclick={() => {
                  askOpen = false;
                  side = { kind: "create" };
                }}
                size="sm"
                variant="ghost"
              />
              <Button
                disabled={stale || !askDraft.trim()}
                icon={IconSend}
                label="Send to Caw"
                size="sm"
                type="submit"
                variant="outline"
              />
            </div>
          </div>
        </form>
      {/if}

      <!-- One-time Caw suggestion per project (T13) -->
      {#if workspaceTab === "routines" && suggestion}
        <aside
          aria-label="Caw suggestion"
          class="flex flex-wrap items-center justify-between gap-space-3 rounded-lg border border-border-hairline bg-surface-raised px-space-4 py-space-3 shadow-tile"
          data-slot="caw-suggestion"
          transition:unfold
        >
          <div class="flex min-w-0 flex-1 flex-col gap-space-row">
            <div class="mark-line flex flex-wrap items-center gap-space-2">
              <IconSparkles class="size-icon-sm flex-none text-ink-muted" />
              <span class="type-label text-ink-strong">{suggestion.title}</span>
              <Badge data-box kind="meta" variant="secondary">
                <span>Suggested by Caw</span>
              </Badge>
            </div>
            <p class="m-0 max-w-c-measure type-meta text-ink-muted">
              {suggestion.detail}
            </p>
          </div>
          <div class="flex flex-none items-center gap-space-2">
            <Button
              disabled={stale}
              label="Not now"
              onclick={() => {
                suggestion = null;
              }}
              size="sm"
              variant="ghost"
            />
            <Button
              disabled={stale}
              label="Turn on"
              onclick={handleTurnOnSuggestion}
              size="sm"
              variant="outline"
            />
          </div>
        </aside>
      {/if}

      <!-- Active workspace tab content -->
      {#if workspaceTab === "routines"}
        {#if routines.length === 0}
          <EmptyState
            icon={IconRepeat}
            line="Tell Caw what should repeat or wait on an outside fact, or set one up by hand."
            title="Nothing running on its own yet"
          >
            {#snippet action()}
              <div class="flex flex-col gap-space-3">
                {@render starterChips("sm", "outline", (starter) =>
                  openAskCaw(starter)
                )}
                <div>
                  <Button
                    disabled={stale}
                    icon={IconPlus}
                    label="Create by hand"
                    onclick={() => {
                      side = { kind: "create" };
                    }}
                    size="sm"
                    variant="ghost"
                  />
                </div>
              </div>
            {/snippet}
          </EmptyState>
        {:else}
          <RoutineList
            now={MOCK_NOW}
            onkeep={handleKeep}
            onopen={handleOpenRoutine}
            {routines}
            selectedId={selectedRoutineId}
            {stale}
          />
        {/if}
      {:else if workspaceTab === "actions"}
        <ActionsPanel
          {actions}
          now={MOCK_NOW}
          onacknowledge={handleAcknowledgeAction}
          onapprove={handleApproveAction}
          oncancel={handleCancelAction}
          ondeny={handleDenyAction}
          onopenroutine={handleOpenRoutine}
          onopenrun={handleOpenRun}
          {stale}
        />
      {:else}
        <EventsPanel
          events={recentEvents}
          now={MOCK_NOW}
          onaskcaw={(prompt) => openAskCaw(prompt)}
          onopenroutine={handleOpenRoutine}
          ontogglerule={handleToggleRule}
          {rules}
          {sources}
          {stale}
        />
      {/if}
    </div>
  </div>
{/snippet}

<!-- Full project page frame: real ProjectHead, ViewTabs, phone ViewBar, and resizable Split -->
<div
  class="relative flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-surface-page text-ink-strong"
  data-slot="routines-screen"
>
  {#if phonePage && sideOpen}
    <div
      class="flex h-full min-h-0 flex-1 flex-col overflow-hidden"
      data-safe-bottom
    >
      {@render sideCard()}
    </div>
  {:else}
    <div
      class="flex h-full min-h-0 flex-1 flex-col overflow-hidden max-phone:overflow-y-auto max-phone:pb-(--bar-reach)"
      data-safe-bottom
      style:--bar-reach={"calc(var(--spacing-c-composer-panel) + var(--spacing-space-4) + var(--safe-bottom) + var(--spacing-space-3))"}
    >
      <ProjectHead
        {lead}
        machine={MOCK_MACHINE}
        onask={() => openAskCaw()}
        onfilter={() => undefined}
        onnewtask={null}
        project={MOCK_PROJECT}
        seated={true}
        setup={null}
      />

      <!-- Project view strip under head from 640px; phone uses docked ViewBar -->
      <div class="contents max-phone:hidden">
        <div
          class="flex min-w-0 items-center gap-space-3 pt-0 pe-space-6 pb-space-4 ps-space-7 max-desk:px-space-5"
          data-slot="strip"
        >
          <ViewTabs
            current="routines"
            hrefOf={(view) => `#${view}`}
            onchoose={() => undefined}
            views={PROJECT_VIEWS}
          />
        </div>
      </div>

      {#if phonePage}
        {@render mainWorkspace()}
      {:else}
        <Split
          backLabel="Back to routines"
          defaultWidth={46}
          keys={{
            width: "cawco.routines.hydrogen.width",
            expanded: "cawco.routines.hydrogen.expanded",
          }}
          main={mainWorkspace}
          open={sideOpen}
          side={sideCard}
        />
      {/if}
    </div>

    {#if phoneBar}
      <ViewBar
        current="routines"
        needs={0}
        needsOn={false}
        onchoose={() => undefined}
        onnewsession={() => openAskCaw()}
        ontoggleneeds={() => undefined}
        views={PROJECT_VIEWS}
      />
    {/if}
  {/if}
</div>
