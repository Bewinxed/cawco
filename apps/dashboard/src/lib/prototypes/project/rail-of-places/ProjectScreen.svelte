<script lang="ts">
  /**
   * A project in CawCo as "Places down the side, and the rail is the
   * glance": the whole screen at any width. From the desk line up the rail
   * (the shell rail's width) holds the project's places, each with its live
   * fact, Caw's row and Configure at its foot; the page beside it under its
   * bar. Under the desk line the rail is the places sheet behind the bar's
   * leading symbol. A task, routine or decision opens as a pane over the
   * page's trailing third (a drawer under the desk line); Caw docks beside
   * the page from 1024 up and is a sheet below; Configure is a sheet from
   * More.
   *
   * Every state is a prop. What the person does while it is mounted (a
   * place chosen, a pane opened, a wait answered) moves the live instance
   * from there and follows the props again when they change
   * (house/follows-props).
   */
  import { railOfPlacesWords as w } from "@cawco/core/words/rail-of-places";
  import { MediaQuery } from "svelte/reactivity";
  import { TooltipProvider } from "#lib/components/ui/tooltip/index.js";
  import {
    IconAdd,
    IconAgent,
    IconArrowLeft,
    IconSearch,
    IconSessionAdd,
  } from "#lib/icons.js";
  import CawPanel from "./CawPanel.svelte";
  import ConfigureBody from "./ConfigureBody.svelte";
  import DecisionStandIn from "./DecisionStandIn.svelte";
  import DecisionsPage from "./DecisionsPage.svelte";
  import HomePage from "./HomePage.svelte";
  import type {
    Need,
    Pane as PaneOpen,
    PlaceKey,
    Project,
    Read,
    Sheet as SheetOpen,
    Work,
  } from "./model";
  import OutputsPage from "./OutputsPage.svelte";
  import Pane from "./Pane.svelte";
  import PlaceBar from "./PlaceBar.svelte";
  import PlacesNav from "./PlacesNav.svelte";
  import RoutineDetail from "./RoutineDetail.svelte";
  import RoutinesPage from "./RoutinesPage.svelte";
  import SessionsPage from "./SessionsPage.svelte";
  import Sheet from "./Sheet.svelte";
  import SpendPage from "./SpendPage.svelte";
  import TaskStandIn from "./TaskStandIn.svelte";
  import TasksPage, { type TasksView } from "./TasksPage.svelte";

  let {
    project,
    read,
    place = "home",
    pane = null,
    caw = false,
    sheet = null,
    view = "board",
    stage = null,
    composing = false,
    spinning = false,
    kind = "all",
    group = "task",
    more = false,
  }: {
    project: Project;
    read: Read;
    place?: PlaceKey;
    pane?: PaneOpen;
    /** Caw's pane is open. */
    caw?: boolean;
    sheet?: SheetOpen;
    /** Tasks' view. */
    view?: TasksView;
    /** Tasks opened at a stage (a phone's pager stands on it). */
    stage?: string | null;
    /** Tasks' inline composer is open. */
    composing?: boolean;
    /** Sessions' Spin off a session is open. */
    spinning?: boolean;
    /** Outputs' kind chip and grouping. */
    kind?: string;
    group?: "task" | "newest";
    /** The bar's More menu stands open. */
    more?: boolean;
  } = $props();

  // The live instance's own moves, from the story's state (follows-props).
  let placeNow = $derived(place);
  let paneNow = $derived(pane);
  let cawNow = $derived(caw);
  let sheetNow = $derived(sheet);
  let stageNow = $derived(stage);
  let composingNow = $derived(composing);
  let spinningNow = $derived(spinning);
  let needs = $derived(project.needs);

  const wide = new MediaQuery("(min-width: 1025px)");
  const stale = $derived(read.stale !== null);
  const task = $derived(
    paneNow?.kind === "task"
      ? project.tasks.find((one) => one.id === paneNow?.id)
      : undefined
  );
  const routine = $derived(
    paneNow?.kind === "routine"
      ? project.routines.find((one) => one.id === paneNow?.id)
      : undefined
  );
  const decision = $derived(
    paneNow?.kind === "decision"
      ? project.decisions.find((one) => one.id === paneNow?.id)
      : undefined
  );

  function go(next: PlaceKey) {
    placeNow = next;
    paneNow = null;
    sheetNow = null;
  }

  function answer(need: Need) {
    needs = needs.filter((one) => one.id !== need.id);
  }

  function later(need: Need) {
    needs = [...needs.filter((one) => one.id !== need.id), need];
  }

  function openNeed(need: Need) {
    if (need.decision) {
      paneNow = { kind: "decision", id: need.decision };
    } else if (need.task) {
      paneNow = { kind: "task", id: need.task };
    }
  }

  function openWork(work: Work) {
    if (work.kind === "caw") {
      cawNow = true;
    } else if (work.task) {
      paneNow = { kind: "task", id: work.task };
    }
  }

  function openStage(key: string) {
    placeNow = "tasks";
    stageNow = key;
    paneNow = null;
  }

  function openTask(id: string) {
    paneNow = { kind: "task", id };
  }

  function openRoutine(id: string) {
    paneNow = { kind: "routine", id };
  }

  function openDecision(id: string) {
    paneNow = { kind: "decision", id };
  }

  function toggleCaw() {
    cawNow = !cawNow;
    sheetNow = null;
  }
</script>

<TooltipProvider>
  <div
    class="@container/shell relative flex h-dvh w-full overflow-hidden bg-surface-recess text-ink-strong contain-layout"
    data-place={placeNow}
  >
    <aside
      class="hidden w-c-sidebar-w flex-none flex-col gap-space-3 border-e border-border-hairline bg-(--sidebar) px-space-2 pt-space-1 pb-space-3 desk:flex"
    >
      <div
        class="mark-line flex h-c-top-bar-h flex-none items-center gap-space-2 ps-space-1"
      >
        <a
          href="/"
          class="press-tint focus-inset touch-hit grid size-c-btn-h-sm flex-none place-items-center rounded-sm text-ink-muted hover:bg-surface-hover"
          aria-label={w.backToFleet}
        >
          <IconArrowLeft class="size-icon-md" aria-hidden="true" />
          <span class="sr-only">{w.backToFleet}</span>
        </a>
        <span class="min-w-0 truncate type-label text-ink-strong"
          >{project.name}</span
        >
      </div>
      <PlacesNav
        {project}
        {read}
        place={placeNow}
        cawOpen={cawNow}
        onplace={go}
        oncaw={toggleCaw}
        onconfigure={() => {
          sheetNow = "configure";
        }}
      />
    </aside>

    <div class="relative flex min-w-0 flex-1 flex-col">
      {#if placeNow === "home"}
        <PlaceBar
          title={w.places.home}
          action={{ label: w.askCaw, icon: IconAgent, onclick: toggleCaw }}
          moreOpen={more}
          onplaces={() => {
            sheetNow = "places";
          }}
          onconfigure={() => {
            sheetNow = "configure";
          }}
        />
      {:else if placeNow === "tasks"}
        <PlaceBar
          title={w.places.tasks}
          action={{
            label: w.addTask,
            icon: IconAdd,
            onclick: () => {
              composingNow = true;
            },
          }}
          more={[{ label: w.selectTasks, onclick: () => undefined }]}
          onplaces={() => {
            sheetNow = "places";
          }}
          onconfigure={() => {
            sheetNow = "configure";
          }}
        />
      {:else if placeNow === "routines"}
        <PlaceBar
          title={w.places.routines}
          action={{ label: w.newRoutine, icon: IconAdd, onclick: toggleCaw }}
          onplaces={() => {
            sheetNow = "places";
          }}
          onconfigure={() => {
            sheetNow = "configure";
          }}
        />
      {:else if placeNow === "decisions"}
        <PlaceBar
          title={w.places.decisions}
          onplaces={() => {
            sheetNow = "places";
          }}
          onconfigure={() => {
            sheetNow = "configure";
          }}
        >
          {#snippet symbols()}
            <button
              data-bar-item
              type="button"
              class="select-none touch-hit press-tint"
              aria-label={w.searchChosen}
            >
              <IconSearch data-slot="bar-symbol" aria-hidden="true" />
            </button>
          {/snippet}
        </PlaceBar>
      {:else if placeNow === "sessions"}
        <PlaceBar
          title={w.places.sessions}
          action={{
            label: w.spinOff,
            icon: IconSessionAdd,
            onclick: () => {
              spinningNow = true;
            },
          }}
          onplaces={() => {
            sheetNow = "places";
          }}
          onconfigure={() => {
            sheetNow = "configure";
          }}
        />
      {:else}
        <PlaceBar
          title={w.places[placeNow]}
          onplaces={() => {
            sheetNow = "places";
          }}
          onconfigure={() => {
            sheetNow = "configure";
          }}
        />
      {/if}

      <main
        class="min-h-0 flex-1 overflow-y-auto ps-space-7 pe-space-6 pt-space-2 pb-space-8 max-desk:ps-c-screen-margin max-desk:pe-c-screen-margin"
      >
        {#if placeNow === "home"}
          <HomePage
            {project}
            {read}
            {needs}
            onanswer={answer}
            onopen={openNeed}
            onlater={later}
            onwork={openWork}
            onstage={openStage}
            onaskcaw={toggleCaw}
          />
        {:else if placeNow === "tasks"}
          <TasksPage
            {project}
            {read}
            {view}
            stage={stageNow}
            composing={composingNow}
            onopen={openTask}
            onaskcaw={toggleCaw}
          />
        {:else if placeNow === "routines"}
          <RoutinesPage
            {project}
            {read}
            chosen={paneNow?.kind === "routine" ? paneNow.id : null}
            onopen={openRoutine}
            onaskcaw={toggleCaw}
          />
        {:else if placeNow === "decisions"}
          <DecisionsPage
            {project}
            {read}
            onopen={openDecision}
            onaskcaw={toggleCaw}
          />
        {:else if placeNow === "outputs"}
          <OutputsPage
            {project}
            {read}
            {kind}
            {group}
            onopen={openTask}
            onaskcaw={toggleCaw}
          />
        {:else if placeNow === "sessions"}
          <SessionsPage
            {project}
            {read}
            spinning={spinningNow}
            onclose={() => {
              spinningNow = false;
            }}
            onopen={openTask}
          />
        {:else}
          <SpendPage
            {project}
            {read}
            onconfigure={() => {
              sheetNow = "configure";
            }}
          />
        {/if}
      </main>

      {#if task}
        <Pane
          title={task.title}
          closeLabel={w.closeTask}
          onclose={() => {
            paneNow = null;
          }}
        >
          <TaskStandIn {task} {project} />
        </Pane>
      {:else if routine}
        <Pane
          title={routine.name}
          closeLabel={w.closeRoutine}
          onclose={() => {
            paneNow = null;
          }}
        >
          <RoutineDetail {routine} {stale} />
        </Pane>
      {:else if decision}
        <Pane
          title={decision.title}
          closeLabel={w.closeDecision}
          onclose={() => {
            paneNow = null;
          }}
        >
          <DecisionStandIn {decision} />
        </Pane>
      {/if}
    </div>

    {#if cawNow && wide.current}
      <aside
        class="flex w-c-panel-w flex-none flex-col border-s border-border-hairline bg-surface-raised"
        aria-label={w.caw}
      >
        <CawPanel
          {project}
          {read}
          onclose={() => {
            cawNow = false;
          }}
          docked
        />
      </aside>
    {:else if cawNow}
      <Sheet
        title={w.caw}
        closeLabel={w.closeCaw}
        drops
        onclose={() => {
          cawNow = false;
        }}
      >
        <CawPanel
          {project}
          {read}
          onclose={() => {
            cawNow = false;
          }}
        />
      </Sheet>
    {/if}

    {#if sheetNow === "places"}
      <Sheet
        title={project.name}
        closeLabel={w.closePlaces}
        side="start"
        size="rail"
        onclose={() => {
          sheetNow = null;
        }}
      >
        <div class="flex min-h-0 flex-1 flex-col px-space-2 pb-space-3">
          <PlacesNav
            {project}
            {read}
            place={placeNow}
            cawOpen={cawNow}
            onplace={go}
            oncaw={toggleCaw}
            onconfigure={() => {
              sheetNow = "configure";
            }}
          />
        </div>
      </Sheet>
    {:else if sheetNow === "configure"}
      <Sheet
        title={w.configure}
        closeLabel={w.closeConfigure}
        drops
        onclose={() => {
          sheetNow = null;
        }}
      >
        <ConfigureBody {project} />
      </Sheet>
    {/if}
  </div>
</TooltipProvider>
