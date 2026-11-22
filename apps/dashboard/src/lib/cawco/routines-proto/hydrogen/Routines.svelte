<script lang="ts">
  import { MediaQuery } from "svelte/reactivity";
  import { CawLead } from "#lib/cawco/project/caw-lead.svelte.js";
  import ProjectHead from "#lib/cawco/project/ProjectHead.svelte";
  import { PANE_INSET } from "#lib/cawco/project/pane-inset.js";
  import ViewBar from "#lib/cawco/project/ViewBar.svelte";
  import ViewTabs from "#lib/cawco/project/ViewTabs.svelte";
  import Split from "#lib/cawco/side/Split.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { NARROW_QUERY, PHONE_QUERY } from "#lib/hooks/is-mobile.svelte.js";
  import { IconPlus } from "#lib/icons.js";
  import AskCawTray from "./AskCawTray.svelte";
  import RoutineDetailPane from "./RoutineDetailPane.svelte";
  import RoutineEditorPane from "./RoutineEditorPane.svelte";
  import RoutinesNotices from "./RoutinesNotices.svelte";
  import RoutineTable from "./RoutineTable.svelte";
  import RunDetailPane from "./RunDetailPane.svelte";
  import { MOCK_MACHINE, MOCK_NOW } from "./routines-data";
  import {
    applyEdit,
    createRoutine,
    initialRoutines,
    MOCK_PROJECT,
    PROJECT_VIEWS,
    type RoutineDraft,
    type SidePanel,
  } from "./routines-state";

  const PHONE_BAR_OFFSET =
    "calc(var(--spacing-c-composer-panel) + var(--spacing-space-4) + var(--safe-bottom) + var(--spacing-space-3))";

  interface Props {
    /** The hub is not live: the last reading stays, and changes wait. */
    stale?: boolean;
  }

  let { stale = false }: Props = $props();

  const narrowMedia = new MediaQuery(NARROW_QUERY);
  const phoneMedia = new MediaQuery(PHONE_QUERY);
  const phoneLayout = $derived(narrowMedia.current);
  const compactBar = $derived(phoneMedia.current);

  /** What the mock hub holds: the project's routines. */
  let routines = $state(initialRoutines());
  let side = $state<SidePanel>(null);
  interface AskTray {
    draft: string;
    notice: string | null;
    open: boolean;
  }
  let ask = $state<AskTray>({ draft: "", notice: null, open: false });
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
  const openRoutine = $derived(
    selectedRoutineId
      ? (routines.find((one) => one.id === selectedRoutineId) ?? null)
      : null
  );
  const openRun = $derived.by(() => {
    if (side?.view !== "run" || !openRoutine) {
      return null;
    }
    const { runId } = side;
    return openRoutine.runs.find((one) => one.id === runId) ?? null;
  });
  const sideOpen = $derived(
    side !== null &&
      (side.view === "create" ||
        (side.view !== "run" && openRoutine !== null) ||
        openRun !== null)
  );

  function noop(): void {
    // Navigation between project views is not part of this prototype.
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
    // On a phone the opened routine covers the list, where Caw's tray opens.
    if (phoneLayout) {
      side = null;
    }
    ask.open = true;
    ask.notice = null;
    if (prompt !== undefined) {
      ask.draft = prompt;
    }
  }

  function saveRoutine(draft: RoutineDraft): void {
    if (stale) {
      return;
    }
    if (side?.view === "edit") {
      const id = side.routineId;
      routines = routines.map((one) =>
        one.id === id ? applyEdit(one, draft) : one
      );
      side = { routineId: id, view: "routine" };
      return;
    }
    const id = nextId("rtn-new");
    routines = [...routines, createRoutine(draft, id, nextId("run-test"))];
    side = { routineId: id, view: "routine" };
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
    variant={side?.view === "create" || side?.view === "edit"
      ? "outline"
      : "default"}
  />
{/snippet}

{#snippet sideCard()}
  {#if side?.view === "run" && openRoutine && openRun}
    {@const routineId = openRoutine.id}
    {@const runId = openRun.id}
    <RunDetailPane
      now={MOCK_NOW}
      onback={() => {
        side = { routineId, view: "routine" };
      }}
      onclose={closeSide}
      ontab={(tab) => {
        side = { routineId, runId, tab, view: "run" };
      }}
      phone={phoneLayout}
      routine={openRoutine}
      run={openRun}
      tab={side.tab}
    />
  {:else if side?.view === "create" || (side?.view === "edit" && openRoutine)}
    {@const editing = side.view === "edit" ? openRoutine : null}
    <RoutineEditorPane
      {editing}
      onback={editing
        ? () => {
            side = { routineId: editing.id, view: "routine" };
          }
        : undefined}
      onclose={closeSide}
      onsubmit={saveRoutine}
      phone={phoneLayout}
      {stale}
    />
  {:else if side?.view === "routine" && openRoutine}
    <RoutineDetailPane
      now={MOCK_NOW}
      onaskcaw={openAskCaw}
      onclose={closeSide}
      onedit={(id) => {
        side = { routineId: id, view: "edit" };
      }}
      onopenrun={(routineId, runId, tab) => {
        side = { routineId, runId, tab, view: "run" };
      }}
      phone={phoneLayout}
      routine={openRoutine}
      {stale}
    />
  {/if}
{/snippet}

{#snippet mainWorkspace()}
  <main
    class={[
      "flex min-h-0 flex-1 flex-col overflow-y-auto pt-0 pb-space-3 max-phone:overflow-visible",
      PANE_INSET,
    ]}
    data-slot="routines-workspace"
  >
    <div class="flex flex-col gap-space-3">
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

      <RoutineTable
        headerAction={newRoutineButton}
        now={MOCK_NOW}
        onfix={openAskCaw}
        onopen={(id) => {
          side = { routineId: id, view: "routine" };
        }}
        {routines}
        {selectedRoutineId}
        {stale}
      />
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
        onask={() => openAskCaw()}
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
        onnewsession={() => openAskCaw()}
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
