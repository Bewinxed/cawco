<script lang="ts">
  /**
   * WAITING BENCH (dev only): a set-up project's page as it says what waits
   * on the person, drawn by the real parts (the view strip's tabs and Needs
   * you, the board, the task's sheet) from Private office's own records as
   * the hub served them (waiting.fixtures.ts), no hub.
   *
   * `?state=` walks what waits:
   * - `none`: nothing waits (the setup page sent, no task held);
   * - `one`: the setup page waits on one pick;
   * - `several`: it waits on five picks;
   * - `blocked` (default): five picks, and two tasks held on its cards, one
   *   of them in Your call;
   * - `settled`: the picks made, tsk-2 in Your call with what it waited on.
   * `?task=tsk-1|tsk-2` opens that task's sheet beside the board (alone on a
   * phone); `?needs` turns Needs you on; `?view=table|decisions` stands on
   * that view.
   *
   * The bench stands its own hub (client.svelte.ts `standHub`, bench-api.ts
   * `standApi`): the hub's reads answered from the same records, and a
   * setup card's open answered as the hub answers it (`board`), so Pick and
   * a card's chip go where the product sends them, this project's Decisions,
   * drawn here by its list (DecisionsList). The setup page itself is the
   * hub's page, served from the hub, and has no stand-in here.
   */
  import type { DecisionPageSummary } from "@cawco/core/decisions";
  import { needsYouOf } from "@cawco/core/task-views";
  import { onMount, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { noteArtifact } from "#lib/cawco/artifact-names.svelte.js";
  import { standApi } from "#lib/cawco/bench-api.js";
  import DecisionsList from "#lib/cawco/decisions/DecisionsList.svelte";
  import { pagesWaitingOf } from "#lib/cawco/decisions/decisions.svelte.js";
  import NeedsYouChip from "#lib/cawco/project/NeedsYouChip.svelte";
  import ViewTabs from "#lib/cawco/project/ViewTabs.svelte";
  import {
    PO_DETAILS,
    PO_ID,
    PO_NAME,
    PO_SETUP,
    PO_SETUP_PAGE,
    PO_STAGES,
    PO_TASKS,
    PO_TSK2,
  } from "#lib/cawco/project/waiting.fixtures.js";
  import {
    firstTodoStage,
    type TaskSummary,
    type TaskView,
  } from "#lib/cawco/project-tasks.js";
  import { setTaskProject, waitsOnYou } from "#lib/cawco/tasks/needs.svelte.js";
  import TaskBoard from "#lib/cawco/tasks/TaskBoard.svelte";
  import TaskPane from "#lib/cawco/tasks/TaskPane.svelte";
  import TaskTable from "#lib/cawco/tasks/TaskTable.svelte";
  import { browser } from "$app/env";
  import { beforeNavigate, goto } from "$app/navigation";
  import { page } from "$app/state";

  type Beat = "none" | "one" | "several" | "blocked" | "settled";
  const BEATS: Beat[] = ["none", "one", "several", "blocked", "settled"];
  const asked = page.url.searchParams.get("state");
  const beat: Beat = BEATS.find((one) => one === asked) ?? "blocked";
  /** The task whose sheet is open, from the address. */
  const openId = $derived(page.url.searchParams.get("task"));
  /** The view on show, from the address. */
  const current = $derived(page.url.searchParams.get("view") ?? "board");
  /** This bench's address with `changes` over what it stands on now. */
  const here = (changes: Record<string, string | null>): string => {
    const query = new URLSearchParams(page.url.searchParams.toString());
    query.set("state", beat);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) {
        query.delete(key);
      } else {
        query.set(key, value);
      }
    }
    return `?${query}`;
  };

  setTaskProject(() => PO_ID);
  // The setup page is a page the dashboard knows: its cards draw as chips.
  untrack(() =>
    noteArtifact(PO_SETUP, {
      instanceId: PO_SETUP_PAGE.writer?.instanceId ?? "",
      kind: "page",
      name: "setup",
      project: PO_ID,
      title: PO_SETUP_PAGE.title,
    })
  );

  /** How many of the setup page's eight cards are still open. */
  const OPEN: Record<Beat, number> = {
    none: 0,
    one: 1,
    several: 5,
    blocked: 5,
    settled: 0,
  };
  const setupPage: DecisionPageSummary = {
    ...PO_SETUP_PAGE,
    state: OPEN[beat] > 0 ? "picking" : "decided",
    picked: PO_SETUP_PAGE.cards - OPEN[beat],
  };
  const pages = [setupPage];

  // --- the bench's hub ----------------------------------------------------------
  const debug = (
    globalThis as unknown as {
      __cawcoDebug: {
        state: { projects: unknown[] };
        standHub: (answer: () => void) => void;
        leaveHub: () => void;
      };
    }
  ).__cawcoDebug;
  const row = {
    id: PO_ID,
    name: PO_NAME,
    cawHarness: "claude",
    cawModel: null,
    conversationInstanceId: null,
    createdAt: new Date(PO_SETUP_PAGE.updatedAt).toISOString(),
    eventsOn: true,
    lands: "main",
    lfsConnection: null,
    lfsUrl: null,
    links: [],
    places: [],
    primaryPlaceId: null,
    review: false,
  };
  const base = `/api/projects/${PO_ID}`;
  const restore = browser
    ? standApi((path, method, query) => {
        if (method === "POST" && path.endsWith(`/artifacts/${PO_SETUP}/show`)) {
          // A setup page opens in no panel: the hub names the project.
          return { board: PO_ID };
        }
        if (method !== "GET") {
          return;
        }
        const answers: Record<string, unknown> = {
          [`${base}/decisions`]: { graph: false, pages, problems: [] },
          [`${base}/tasks`]: {
            // Caw's Needs you reads the tasks the hub says wait on you.
            tasks: query.has("needsYou")
              ? tasks.filter((task) => task.needsYou)
              : tasks,
            problems: [],
            stagesProblems: [],
            tracker: "cawco",
          },
          [`${base}/stages`]: PO_STAGES,
          [`${base}/decides`]: PO_DETAILS.decides,
          [`${base}/gate`]: PO_DETAILS.gate,
          [`${base}/tracker`]: PO_DETAILS.tracker,
          ...Object.fromEntries(
            views.flatMap((view) => [
              [`${base}/tasks/${view.id}`, view],
              [
                `${base}/tasks/${view.id}/history`,
                { id: view.id, path: view.path, state: "live", events: [] },
              ],
            ])
          ),
        };
        return answers[path];
      })
    : () => undefined;
  if (browser) {
    debug.state.projects.push(row);
    debug.standHub(() => undefined);
  }
  onMount(() => () => {
    restore();
    debug.leaveHub();
    debug.state.projects.splice(debug.state.projects.indexOf(row), 1);
  });
  // Where the product sends a card's open (its project's Decisions, at the
  // card), the bench stands on its own Decisions.
  beforeNavigate((navigation) => {
    const to = navigation.to?.url;
    if (to?.pathname === `/project/${PO_ID}`) {
      navigation.cancel();
      goto(here({ view: "decisions", task: null, needs: null }));
    }
  });

  /** A task's waits as they stood: open before the picks, settled after; its stage as the beat puts it. */
  const heldOn = <T extends TaskSummary | TaskView>(
    task: T,
    stage: string
  ): T => {
    const open = beat === "blocked";
    const kind =
      PO_STAGES.stages.find((one) => one.name === stage)?.kind ?? null;
    const waits = task.waits.map((wait) => ({
      ...wait,
      settled: !open,
      state: open ? "not picked yet" : wait.state,
      value: open ? null : wait.value,
    }));
    // As the hub derives it on read (core task-views.ts `needsYouOf`).
    return { ...task, stage, kind, waits, needsYou: needsYouOf(kind, waits) };
  };
  const STAGE_OF: Record<Beat, Record<string, string>> = {
    none: { "tsk-1": "dropped", "tsk-2": "drafting" },
    one: { "tsk-1": "dropped", "tsk-2": "drafting" },
    several: { "tsk-1": "dropped", "tsk-2": "drafting" },
    blocked: { "tsk-1": "inbox", "tsk-2": "your-call" },
    settled: { "tsk-1": "dropped", "tsk-2": "your-call" },
  };
  const stageOf = (id: string, was: string) => STAGE_OF[beat][id] ?? was;
  const tasks: TaskSummary[] = PO_TASKS.map((task) =>
    heldOn(task, stageOf(task.id, task.stage))
  );
  /** Each task's sheet: tsk-2 as the hub read it whole; tsk-1 on its frame, its own words none. */
  const views: TaskView[] = PO_TASKS.map((task) => {
    const whole: TaskView =
      task.id === PO_TSK2.id
        ? PO_TSK2
        : {
            ...PO_TSK2,
            id: task.id,
            number: task.number,
            path: task.path,
            title: task.title,
            waits: task.waits,
            waitsOn: task.waitsOn,
            description: "",
          };
    return heldOn(whole, stageOf(task.id, task.stage));
  });

  const needsYou = $derived(tasks.filter((task) => waitsOnYou(PO_ID, task)));
  const pagesWaiting = $derived(pagesWaitingOf(pages, false));
  // Needs you as the project page counts it: what it narrows the view on
  // screen to, the pages on Decisions, the tasks on every other view.
  const onDecisions = $derived(current === "decisions");
  const waitingCount = $derived(
    onDecisions ? pagesWaiting.length : needsYou.length
  );
  let needsOnly = $state(page.url.searchParams.has("needs"));
  const filtering = $derived(needsOnly && waitingCount > 0);
  const narrowsTasks = $derived(filtering && !onDecisions);

  const stagesShown = $derived(
    narrowsTasks
      ? PO_STAGES.stages.filter((stage) =>
          needsYou.some((task) => task.stage === stage.name)
        )
      : PO_STAGES.stages
  );
  const tabs = $derived(
    ["board", "table", "decisions"].map((value) => ({
      value,
      label: value[0]?.toUpperCase() + value.slice(1),
      draft: false,
      count: value === "decisions" ? pagesWaiting.length : 0,
    }))
  );
  const open = $derived(views.find((one) => one.id === openId) ?? null);
  const phone = new MediaQuery("(max-width: 639px)");
  const none = async () => undefined as never;
</script>

<div
  class="flex h-dvh min-h-0 flex-col gap-space-4 px-space-7 pt-space-4 max-desk:px-space-5"
  data-slot="waiting-bench"
>
  <h1 class="m-0 type-title text-ink-strong">{PO_NAME}</h1>
  <div class="flex min-w-0 items-center gap-space-3" data-slot="strip">
    <ViewTabs
      {current}
      hrefOf={(view) => here({ view, task: null })}
      onchoose={(view) => goto(here({ view, task: null }))}
      views={tabs}
    />
    <span
      aria-hidden="true"
      class="h-c-btn-h-sm w-px flex-none bg-border-hairline"
    ></span>
    <div data-form="compact" class="flex flex-none items-center gap-space-2">
      {#if waitingCount > 0}
        <NeedsYouChip
          count={waitingCount}
          on={filtering}
          ontoggle={() => {
            needsOnly = !filtering;
          }}
        />
      {/if}
    </div>
  </div>
  <div
    class="grid min-h-0 flex-auto grid-cols-(--cols) gap-space-4"
    style:--cols={open && !phone.current
      ? "minmax(0, 3fr) minmax(0, 2fr)"
      : "minmax(0, 1fr)"}
  >
    {#if !(open && phone.current)}
      <div class="min-h-0 min-w-0">
        {#if current === "decisions"}
          <DecisionsList
            hrefOf={(name) => here({ view: "decisions", page: name })}
            now={Date.now()}
            onopen={() => undefined}
            pages={pages.filter((one) => !filtering || one.state === "picking")}
            projectId={PO_ID}
          />
        {:else if current === "table"}
          <TaskTable
            hrefOf={(id) => here({ task: id })}
            onopen={(id) => goto(here({ task: id }))}
            stages={PO_STAGES.stages}
            tasks={narrowsTasks ? needsYou : tasks}
          />
        {:else}
          <TaskBoard
            allowedFrom={() => new Set<string>()}
            current={openId}
            hrefOf={(id) => here({ task: id })}
            newIn={firstTodoStage(PO_STAGES.stages)?.name}
            oncreate={none}
            onmove={none}
            onopen={(id) => goto(here({ task: id }))}
            stages={stagesShown}
            tasks={narrowsTasks ? needsYou : tasks}
          />
        {/if}
      </div>
    {/if}
    {#if open}
      <!-- The task's own sheet, as the project page draws it beside the
           view (a phone: as its page, with Back). -->
      <div class="flex min-h-0 min-w-0 flex-col" data-slot="sheet">
        <TaskPane
          allowedFrom={() => new Set<string>()}
          backLabel={PO_NAME}
          onchanged={() => undefined}
          onclose={() => goto(here({ task: null }))}
          onmove={async () => open}
          onopen={(id) => goto(here({ task: id }))}
          page={phone.current}
          projectId={PO_ID}
          stages={PO_STAGES}
          taskId={open.id}
          {tasks}
        />
      </div>
    {/if}
  </div>
</div>
