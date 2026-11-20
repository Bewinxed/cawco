<script lang="ts">
  /**
   * The live story's fixture (GovernedCanvas.stories.ts): Option 1's project
   * page in the app's shell, as the Shell lays out its rail and main, with
   * the shipped sidebar in the rail (its stores seeded through their own
   * state with hyucksfield and the fleet's other projects) and the shipped
   * task board, table, routines and Decisions views as the page's body. Its
   * own state is what the stand-in hub holds: the record, the board's tasks,
   * the changes it has not answered and those it refused. A change is
   * answered after `ANSWER_MS` the way the `answer` dial says.
   */
  import type { TaskSummary } from "@cawco/core/task-views";
  import { DAY_MS } from "@cawco/core/time";
  import { ProjectBlocks } from "#lib/cawco/blocks/arrangement.svelte.js";
  import DecisionsView from "#lib/cawco/decisions/DecisionsView.svelte";
  import type { ProjectDecisions } from "#lib/cawco/decisions/decisions.svelte.js";
  import {
    RESTING_LEAD,
    sitDownNowhere,
  } from "#lib/cawco/project/caw-lead.fixture.js";
  import Sidebar from "#lib/cawco/Sidebar.svelte";
  import { boardState } from "#lib/cawco/stores/board.svelte.js";
  import { projectsState } from "#lib/cawco/stores/projects.svelte.js";
  import TaskBoard from "#lib/cawco/tasks/TaskBoard.svelte";
  import TaskTable from "#lib/cawco/tasks/TaskTable.svelte";
  import { PROJECT as ROUTINES_PROJECT } from "#lib/cawco/views/routines-fixture.js";
  import ViewRoutines from "#lib/cawco/views/ViewRoutines.svelte";
  import { setSidebar } from "#lib/components/ui/sidebar/context.svelte.js";
  import {
    HYUCKSFIELD,
    NOW,
    OTHER_PROJECTS,
    type Situation,
    STAGES,
    situated,
    TASKS,
  } from "./fixtures";
  import GovernedProjectPage from "./GovernedProjectPage.svelte";
  import {
    ANSWER_MS,
    type Answer,
    applied,
    changeId,
    moved,
    refusalOf,
    reread,
    syncing,
  } from "./mock-hub";
  import type {
    Change,
    ChangeId,
    Changes,
    GovernedRecord,
    ProjectView,
  } from "./records";

  let {
    situation = "As it stands",
    answer = "Takes it",
    view: opening = "board",
    again = 0,
  }: {
    /** What the hub says of the project as the frame opens. */
    situation?: Situation;
    /** How the hub answers a change the person sends. */
    answer?: Answer;
    /** The view the page opens on. */
    view?: ProjectView;
    /** Starts the frame over (the `action` dial's count). */
    again?: number;
  } = $props();

  // The shell's sidebar context, as the Shell gives it.
  let sidebarOpen = $state(true);
  setSidebar({
    open: () => sidebarOpen,
    setOpen: (open: boolean) => {
      sidebarOpen = open;
    },
  });

  /** The frame as it opens: a new one at each press of Start again, or a new situation. */
  const opened = $derived({ again, situation, opening });
  /** What the stand-in hub holds: the project as the situation sets it, until a change lands. */
  let record = $derived<GovernedRecord>(
    situated(HYUCKSFIELD, opened.situation)
  );
  let tasks = $derived<TaskSummary[]>(opened && TASKS);
  let view = $derived<ProjectView>(opened.opening);
  let changes = $derived<Changes>(opened && { pending: [], refused: {} });
  let needsOn = $state(false);

  // The sidebar reads the fleet's stores: seeded as the hub's first answers seed them.
  $effect.pre(() => {
    projectsState.projects = [record.project, ...OTHER_PROJECTS];
    projectsState.projectsRead = true;
    boardState.machines = record.machines.map((machine) => ({
      auth: "unknown",
      hostname: machine.name,
      joinedAt: NOW - 90 * DAY_MS,
      machineId: machine.id,
      os: machine.os,
      pausedUntil: null,
      pauseStopped: null,
      status: machine.online ? "online" : "offline",
      home: machine.home,
    }));
    boardState.fleetRead = true;
    boardState.liveRead = true;
  });

  const without = (ids: ChangeId[], id: ChangeId) =>
    ids.filter((i) => i !== id);

  function send(change: Change) {
    const id = changeId(change);
    const { [id]: _was, ...refused } = changes.refused;
    changes = { pending: [...without(changes.pending, id), id], refused };
    if (answer === "Never answers") {
      return;
    }
    setTimeout(() => {
      if (answer === "Takes it") {
        record = applied(record, change);
        changes = { ...changes, pending: without(changes.pending, id) };
        return;
      }
      changes = {
        pending: without(changes.pending, id),
        refused: { ...changes.refused, [id]: refusalOf(change) },
      };
    }, ANSWER_MS);
  }

  function syncNow() {
    record = syncing(record, "syncing");
    setTimeout(() => {
      record = syncing(record, "synced");
    }, ANSWER_MS * 3);
  }

  function readAgain(what: "decides" | "tracker" | "connections") {
    record = reread(record, what, false);
    setTimeout(() => {
      record = reread(record, what, true);
    }, ANSWER_MS);
  }

  const decisions: Pick<ProjectDecisions, "list" | "problem" | "read"> = {
    list: { graph: false, pages: [], problems: [] },
    problem: null,
    read: async () => undefined,
  };

  const blocks = new ProjectBlocks(
    () => ROUTINES_PROJECT.id,
    () => []
  );
  // Routines alone on its page: its sources and acts stand hidden.
  $effect.pre(() => {
    const routines = (["routines", "sources", "actions"] as const).map(
      (block, at) => ({
        block,
        width: at === 0 ? ("wide" as const) : ("narrow" as const),
        hidden: at > 0,
      })
    );
    blocks.arrangement = { pages: { routines }, proposed: [] };
  });

  const stageNames = new Set(STAGES.map((stage) => stage.name));
  const shown = $derived(
    needsOn ? tasks.filter((task) => task.needsYou) : tasks
  );
  const hrefOf = (id: string) => `#${id}`;
</script>

<div
  data-slot="shell"
  class="@container/shell relative flex h-dvh w-full overflow-hidden bg-surface-recess"
>
  <aside
    data-slot="rail"
    class="relative hidden w-(--sidebar-width) min-w-0 shrink-0 grow-0 basis-(--sidebar-width) border-e border-e-border-hairline bg-(--sidebar) desk:flex"
    style="--sidebar-width: var(--spacing-c-sidebar-w)"
  >
    <Sidebar narrow={false} toggleRoom />
  </aside>
  <div
    data-slot="shell-main"
    class="relative flex min-w-0 flex-auto flex-col overflow-hidden"
  >
    <GovernedProjectPage
      {changes}
      lead={RESTING_LEAD}
      {needsOn}
      now={NOW}
      onask={() => undefined}
      onchange={send}
      onfilter={() => undefined}
      onmore={() => undefined}
      onnewtask={() => undefined}
      onplace={() => undefined}
      onreread={readAgain}
      onspinoff={() => undefined}
      onsyncnow={syncNow}
      ontoggleneeds={() => {
        needsOn = !needsOn;
      }}
      onview={(next) => {
        view = next;
      }}
      {record}
      {view}
    >
      {#snippet body()}
        {#if view === "board"}
          <TaskBoard
            allowedFrom={() => stageNames}
            {hrefOf}
            newIn="Backlog"
            oncreate={(title, stage) => {
              const id = `tsk-${70 + tasks.length}`;
              tasks = [
                ...tasks,
                {
                  ...TASKS[0],
                  id,
                  number: 70 + tasks.length,
                  title,
                  stage,
                  labels: [],
                },
              ];
              return Promise.resolve(id);
            }}
            onmove={(id, stage) => {
              tasks = moved(tasks, id, stage);
            }}
            onopen={() => undefined}
            stages={STAGES}
            tasks={shown}
          />
        {:else if view === "table"}
          <TaskTable
            {hrefOf}
            onopen={() => undefined}
            stages={STAGES}
            tasks={shown}
          />
        {:else if view === "routines"}
          <ViewRoutines
            {blocks}
            canTalk
            lead={RESTING_LEAD}
            project={{ id: ROUTINES_PROJECT.id, name: record.project.name }}
            sitDown={sitDownNowhere}
            starters={[]}
            viewItems={{}}
          />
        {:else}
          <DecisionsView
            canTalk
            card={null}
            {decisions}
            go={() => undefined}
            hrefOf={() => "#"}
            lead={RESTING_LEAD}
            now={NOW}
            onopentask={() => undefined}
            page={null}
            projectId={record.project.id}
            projectName={record.project.name}
            sitDown={sitDownNowhere}
            starters={[]}
            taskHref={() => "#"}
            taskOf={() => undefined}
          />
        {/if}
      {/snippet}
    </GovernedProjectPage>
  </div>
</div>
