<script lang="ts">
  import { MediaQuery } from "svelte/reactivity";
  import { CawLead } from "#lib/cawco/project/caw-lead.svelte.js";
  import ProjectHead from "#lib/cawco/project/ProjectHead.svelte";
  import { PANE_INSET } from "#lib/cawco/project/pane-inset.js";
  import ViewBar from "#lib/cawco/project/ViewBar.svelte";
  import ViewTabs from "#lib/cawco/project/ViewTabs.svelte";
  import Split from "#lib/cawco/side/Split.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { NARROW_QUERY, PHONE_QUERY } from "#lib/hooks/is-mobile.svelte.js";
  import { IconPlus, IconRepeat } from "#lib/icons.js";
  import AskCawTray from "./AskCawTray.svelte";
  import RoutineDetailPane from "./RoutineDetailPane.svelte";
  import RoutineEditorPane from "./RoutineEditorPane.svelte";
  import RoutineList from "./RoutineList.svelte";
  import RoutinesNotices from "./RoutinesNotices.svelte";
  import RunDetailPane from "./RunDetailPane.svelte";
  import { MOCK_MACHINE, MOCK_NOW, type Routine } from "./routines-data";
  import {
    type ActionDecision,
    applyRoutineEdit,
    checkRoutineAgainState,
    createInitialBoardState,
    createRoutineRecord,
    createSuggestedRoutine,
    describeDraftSchedule,
    extendCheckDateState,
    keepRoutineState,
    MOCK_PROJECT,
    markRoutineDoneState,
    PROJECT_STARTERS,
    PROJECT_VIEWS,
    patchActionDecision,
    type RoutineDraftSubmit,
    removeRoutineFromBoard,
    runRoutineNowState,
    type SidePanel,
    toggleRoutinePauseState,
  } from "./routines-state";

  const PHONE_BAR_OFFSET =
    "calc(var(--spacing-c-composer-panel) + var(--spacing-space-4) + var(--safe-bottom) + var(--spacing-space-3))";

  interface Props {
    /** Simulates a disconnected hub reading where live ask counts and edits pause. */
    stale?: boolean;
  }

  let { stale = false }: Props = $props();

  const narrowMedia = new MediaQuery(NARROW_QUERY);
  const phoneMedia = new MediaQuery(PHONE_QUERY);
  const phoneLayout = $derived(narrowMedia.current);
  const compactBar = $derived(phoneMedia.current);

  const board = $state(createInitialBoardState());
  interface AskComposerState {
    draft: string;
    notice: string | null;
    open: boolean;
  }

  let side = $state<SidePanel>(null);
  let ask = $state<AskComposerState>({
    draft: "",
    notice: null,
    open: false,
  });
  let seq = 100;

  const lead = new CawLead({
    id: () => MOCK_PROJECT.id,
    machinesOnline: () => !stale,
    project: () => MOCK_PROJECT,
    reading: () => false,
    tasks: () => [],
  });

  $effect(() => {
    if (!lead.open) {
      return;
    }
    const prefill = lead.draft.text.trim();
    lead.open = false;
    openAskCaw(prefill || undefined);
  });

  const selectedRoutineId = $derived(
    side && side.view !== "create" ? side.routineId : null
  );
  const selectedRunId = $derived(side?.view === "run" ? side.runId : null);

  const openRoutine = $derived(
    selectedRoutineId
      ? (board.routines.find((one) => one.id === selectedRoutineId) ?? null)
      : null
  );
  const openRun = $derived(
    selectedRunId && openRoutine
      ? (openRoutine.runs.find((one) => one.id === selectedRunId) ?? null)
      : null
  );

  const sideOpen = $derived(
    side !== null &&
      (side.view === "create" ||
        ((side.view === "routine" || side.view === "edit") &&
          openRoutine !== null) ||
        (side.view === "run" && openRoutine !== null && openRun !== null))
  );
  const editorOwnsCoral = $derived(
    side?.view === "create" || side?.view === "edit"
  );

  function noop(): void {
    // Prototype navigation tabs and filter controls are non-routed here.
  }

  function viewHref(view: string): string {
    return `#${view}`;
  }

  function nextId(prefix: string): string {
    seq += 1;
    return `${prefix}-${seq}`;
  }

  function closeSide(): void {
    side = null;
  }

  function openAskCaw(prompt?: string): void {
    ask.open = true;
    ask.notice = null;
    if (prompt !== undefined) {
      ask.draft = prompt;
    }
  }

  function askCawBlank(): void {
    openAskCaw();
  }

  function updateRoutine(
    id: string,
    transform: (one: Routine) => Routine
  ): void {
    if (!stale) {
      board.routines = board.routines.map((one) =>
        one.id === id ? transform(one) : one
      );
    }
  }

  function runRoutineNow(id: string): void {
    const target = board.routines.find((one) => one.id === id);
    if (!target || target.status === "running") {
      return;
    }
    updateRoutine(id, (one) => runRoutineNowState(one, nextId("run-live")));
  }

  function deleteRoutine(id: string): void {
    if (stale) {
      return;
    }
    removeRoutineFromBoard(board, id);
    if (selectedRoutineId === id) {
      side = null;
    }
  }

  function saveRoutine(draft: RoutineDraftSubmit): void {
    if (stale) {
      return;
    }
    const { rhythm } = describeDraftSchedule(draft);
    const giveUpAt = draft.giveUpDate
      ? Date.parse(`${draft.giveUpDate}T23:59:59Z`)
      : null;

    if (side?.view === "edit") {
      const editId = side.routineId;
      updateRoutine(editId, (one) =>
        applyRoutineEdit(one, draft, rhythm, giveUpAt)
      );
      side = { routineId: editId, view: "routine" };
      return;
    }

    const newId = nextId("rtn-new");
    const created = createRoutineRecord({
      draft,
      giveUpAt,
      id: newId,
      rhythm,
      testRunId: nextId("run-test"),
    });
    board.routines = [created, ...board.routines];
    side = { routineId: newId, view: "routine" };
  }

  function handleAction(decision: ActionDecision, actionId: string): void {
    if (!stale) {
      board.actions = patchActionDecision(board.actions, decision, actionId);
    }
  }

  function toggleRule(ruleId: string): void {
    if (!stale) {
      board.rules = board.rules.map((one) =>
        one.id === ruleId ? { ...one, enabled: !one.enabled } : one
      );
    }
  }

  function turnOnSuggestion(): void {
    if (board.suggestion && !stale) {
      board.routines = [
        ...board.routines,
        createSuggestedRoutine(board.suggestion),
      ];
      board.suggestion = null;
    }
  }
</script>

{#snippet newRoutineButton()}
  <Button
    disabled={stale}
    icon={IconPlus}
    label="New routine"
    onclick={() => {
      side = { view: "create" };
    }}
    size="sm"
    variant={editorOwnsCoral ? "outline" : "default"}
  />
{/snippet}

{#snippet sideCard()}
  {#if side?.view === "run" && openRoutine && openRun}
    <RunDetailPane
      actions={board.actions}
      backToList={side.backToList}
      now={MOCK_NOW}
      onaction={handleAction}
      onaskcaw={openAskCaw}
      onback={() => {
        side = { routineId: openRoutine.id, view: "routine" };
      }}
      onclose={closeSide}
      onrunagain={runRoutineNow}
      phone={phoneLayout}
      routine={openRoutine}
      run={openRun}
      {stale}
    />
  {:else if side?.view === "create" || (side?.view === "edit" && openRoutine)}
    <RoutineEditorPane
      editing={side.view === "edit" ? openRoutine : null}
      onaskcaw={openAskCaw}
      onback={side.view === "edit" && openRoutine
        ? () => {
            side = { routineId: openRoutine.id, view: "routine" };
          }
        : undefined}
      onclose={closeSide}
      onsubmit={saveRoutine}
      phone={phoneLayout}
      {stale}
    />
  {:else if side?.view === "routine" && openRoutine}
    <RoutineDetailPane
      actions={board.actions}
      now={MOCK_NOW}
      onaction={handleAction}
      onaskcaw={openAskCaw}
      oncheckagain={(id) =>
        updateRoutine(id, (one) =>
          checkRoutineAgainState(one, nextId("run-check"))
        )}
      onclose={closeSide}
      ondelete={deleteRoutine}
      onedit={(id) => {
        side = { routineId: id, view: "edit" };
      }}
      onextenddate={(id, days) =>
        updateRoutine(id, (one) => extendCheckDateState(one, days))}
      onkeep={(id) => updateRoutine(id, keepRoutineState)}
      onmarkdone={(id) =>
        updateRoutine(id, (one) =>
          markRoutineDoneState(one, nextId("run-done"))
        )}
      onopenrun={(routineId, runId) => {
        side = { backToList: false, routineId, runId, view: "run" };
      }}
      onrunnow={runRoutineNow}
      ontogglepause={(id) => updateRoutine(id, toggleRoutinePauseState)}
      ontogglerule={toggleRule}
      phone={phoneLayout}
      routine={openRoutine}
      rules={board.rules}
      sources={board.sources}
      {stale}
    />
  {/if}
{/snippet}

{#snippet mainWorkspace()}
  <main
    class={[
      "flex min-h-0 flex-1 flex-col overflow-y-auto pt-0 pb-space-7 max-phone:overflow-visible",
      PANE_INSET,
    ]}
    data-slot="routines-workspace"
  >
    <div class="flex flex-col gap-space-4">
      <RoutinesNotices askOpen={ask.open} {stale} bind:notice={ask.notice} />

      {#if ask.open}
        <AskCawTray
          onclose={() => {
            ask.open = false;
          }}
          onsubmit={(words) => {
            ask.notice = `Sent to Caw in ${MOCK_PROJECT.name}: "${words}"`;
            ask.draft = "";
            ask.open = false;
          }}
          {stale}
          bind:draft={ask.draft}
        />
      {/if}

      {#if board.routines.length === 0}
        <EmptyState
          icon={IconRepeat}
          line="Tell Caw what should repeat or wait on an outside check, or set one up by hand."
          title="Nothing running on its own yet"
        >
          {#snippet action()}
            <div class="flex flex-col gap-space-3">
              <div class="flex flex-wrap items-center gap-space-2">
                {#each PROJECT_STARTERS as starter (starter)}
                  <Button
                    disabled={stale}
                    label={starter}
                    onclick={() => openAskCaw(starter)}
                    size="sm"
                    variant="outline"
                  />
                {/each}
              </div>
              <div>{@render newRoutineButton()}</div>
            </div>
          {/snippet}
        </EmptyState>
      {:else}
        <RoutineList
          actions={board.actions}
          headerAction={newRoutineButton}
          now={MOCK_NOW}
          onacknowledge={(id) => handleAction("acknowledge", id)}
          onapprove={(id) => handleAction("approve", id)}
          oncancelaction={(id) => handleAction("cancel", id)}
          ondeny={(id) => handleAction("deny", id)}
          ondismisssuggestion={() => {
            board.suggestion = null;
          }}
          onextenddate={(id, days) =>
            updateRoutine(id, (one) => extendCheckDateState(one, days))}
          onfixwithcaw={(prompt) => openAskCaw(prompt)}
          onkeep={(id) => updateRoutine(id, keepRoutineState)}
          onmarkdone={(id) =>
            updateRoutine(id, (one) =>
              markRoutineDoneState(one, nextId("run-done"))
            )}
          onopenroutine={(id) => {
            side = { routineId: id, view: "routine" };
          }}
          onopenrun={(routineId, runId) => {
            side = { backToList: true, routineId, runId, view: "run" };
          }}
          onresumerule={toggleRule}
          onrunnow={runRoutineNow}
          onturnonsuggestion={turnOnSuggestion}
          routines={board.routines}
          rules={board.rules}
          {selectedRoutineId}
          {selectedRunId}
          sources={board.sources}
          {stale}
          suggestion={board.suggestion}
        />
      {/if}
    </div>
  </main>
{/snippet}

<div
  class="relative flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-surface-page text-ink-strong"
  data-slot="routines-screen"
>
  {#if !(phoneLayout && sideOpen)}
    <div
      class="flex h-full min-h-0 flex-1 flex-col overflow-hidden max-phone:overflow-y-auto max-phone:pb-(--bar-reach)"
      data-safe-bottom
      style:--bar-reach={PHONE_BAR_OFFSET}
    >
      <ProjectHead
        {lead}
        machine={MOCK_MACHINE}
        onask={askCawBlank}
        onfilter={noop}
        onnewtask={null}
        project={MOCK_PROJECT}
        seated
        setup={null}
      />

      {#if !compactBar}
        <nav
          aria-label="Project sections"
          class="flex min-w-0 items-center gap-space-3 pt-0 pe-space-6 pb-space-4 ps-space-7 max-desk:px-space-5"
          data-slot="strip"
        >
          <ViewTabs
            current="routines"
            hrefOf={viewHref}
            onchoose={noop}
            views={PROJECT_VIEWS}
          />
        </nav>
      {/if}

      {#if phoneLayout}
        {@render mainWorkspace()}
      {:else}
        <Split
          backLabel="Back to routines"
          defaultWidth={46}
          keys={{
            expanded: "cawco.routines.hydrogen.expanded",
            width: "cawco.routines.hydrogen.width",
          }}
          main={mainWorkspace}
          open={sideOpen}
          side={sideCard}
        />
      {/if}
    </div>

    {#if compactBar}
      <ViewBar
        current="routines"
        needs={0}
        needsOn={false}
        onchoose={noop}
        onnewsession={askCawBlank}
        ontoggleneeds={noop}
        views={PROJECT_VIEWS}
      />
    {/if}
  {:else}
    <div
      class="flex h-full min-h-0 flex-1 flex-col overflow-hidden"
      data-safe-bottom
    >
      {@render sideCard()}
    </div>
  {/if}
</div>
