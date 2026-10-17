<script lang="ts">
  /**
   * The project's views (design §2, PRD §5.2): the head with Caw as the
   * lead's face, then the view; the view strip stands in the shell's bar on
   * a wide screen and under the head on a narrow one. On a phone (under
   * 640px) the page is the one scroller: the head scrolls away with the
   * view, and the views, Needs you and New session stand in one bar docked
   * at the foot where a session's composer docks (ViewBar). Board, Table and
   * Pipeline always; Calendar when a task carries a date; then each view
   * kept in `views/`, then each Caw drafted, marked `draft`, with Keep and
   * Discard over it. The tasks are the hub's: every change is a commit, so
   * the page shows what the hub answered and reads the list again after
   * each of its own writes, whenever the hub says the project's tasks
   * changed (`tasks.changed`: Caw filed one, an attempt moved one), on a
   * reconnect, and when the tab comes back.
   *
   * The view and the open task live in the URL (`?view=`, `?task=`), so a
   * link opens the same. Needs you is a filter, not a stage: the tasks whose
   * stage is of kind `you`.
   *
   * A task opens in the page (DESIGN.md, The Open Page Rule): on a desk
   * beside the view it came from, in a resizable split (Split) whose width
   * and expansion the project keeps, the view live beside it, another card
   * swapping the task in place; under 900px it is its own page, with Back
   * (a history entry of its own, so the browser's back is Back too).
   */
  import {
    BLOCK_PAGES,
    type BlockPage as BlockPageId,
    type ProjectView,
    viewOfBlock,
  } from "@cawco/core";
  import { type Snippet, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import type { TransitionConfig } from "svelte/transition";
  import { barStrip } from "#lib/cawco/bar-strip.svelte.js";
  import {
    isBlockPage,
    ProjectBlocks,
  } from "#lib/cawco/blocks/arrangement.svelte.js";
  import BlockPage, {
    type BlockItem,
  } from "#lib/cawco/blocks/BlockPage.svelte";
  import { cawco, requestView, threadsOf } from "#lib/cawco/client.svelte.js";
  import DecisionsView from "#lib/cawco/decisions/DecisionsView.svelte";
  import {
    type DecisionsMode,
    ProjectDecisions,
  } from "#lib/cawco/decisions/decisions.svelte.js";
  import {
    type HubRead,
    failureWords as message,
    THREAD_SEND_UNREACHED,
    unreachable,
  } from "#lib/cawco/hub-read.js";
  import {
    crossIn,
    crossOut,
    dur,
    motionOk,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { ListSwap } from "#lib/cawco/motion/list-swap.svelte.js";
  import { depart } from "#lib/cawco/motion/share.svelte.js";
  import CawFloat from "#lib/cawco/project/CawFloat.svelte";
  import CawSeat from "#lib/cawco/project/CawSeat.svelte";
  import { CawLead } from "#lib/cawco/project/caw-lead.svelte.js";
  import NeedsYouChip from "#lib/cawco/project/NeedsYouChip.svelte";
  import ProjectHead from "#lib/cawco/project/ProjectHead.svelte";
  import StarterCards from "#lib/cawco/project/StarterCards.svelte";
  import ViewBar from "#lib/cawco/project/ViewBar.svelte";
  import {
    archiveTask,
    createTask,
    firstTodoStage,
    listArchived,
    listTasks,
    movesFrom,
    moveTask,
    readStages,
    type StageKind,
    type StagesView,
    stageLabel,
    type TaskList,
    type TaskSummary,
    type TaskView,
    updateTask,
  } from "#lib/cawco/project-tasks.js";
  import { checkoutOf } from "#lib/cawco/projects.js";
  import Split from "#lib/cawco/side/Split.svelte";
  import BulkBar, { type BulkRun } from "#lib/cawco/tasks/BulkBar.svelte";
  import NewTaskForm from "#lib/cawco/tasks/NewTaskForm.svelte";
  import { setTaskProject, waitsOnYou } from "#lib/cawco/tasks/needs.svelte.js";
  import StagesControl from "#lib/cawco/tasks/StagesControl.svelte";
  import TaskBoard from "#lib/cawco/tasks/TaskBoard.svelte";
  import TaskFilterPopover from "#lib/cawco/tasks/TaskFilterPopover.svelte";
  import TaskPane from "#lib/cawco/tasks/TaskPane.svelte";
  import TaskTable from "#lib/cawco/tasks/TaskTable.svelte";
  import {
    activeCount,
    applyFilter,
    filterOf,
    type TaskFilter,
    writeFilter,
  } from "#lib/cawco/tasks/task-filter.js";
  import { TaskFind, wordsOf } from "#lib/cawco/tasks/task-find.svelte.js";
  import {
    clearPicks,
    isPicked,
    pickAll,
    pickTask,
    selection,
  } from "#lib/cawco/tasks/task-select.svelte.js";
  import { toast } from "#lib/cawco/toasts.js";
  import Composer from "#lib/cawco/transcript/Composer.svelte";
  import { ComposerDraft } from "#lib/cawco/transcript/composer-draft.svelte.js";
  import type { ViewTaskRow } from "#lib/cawco/views/openui/context.js";
  import { taskEdges } from "#lib/cawco/views/task-graph.js";
  import ViewCalendar, {
    calendarField,
  } from "#lib/cawco/views/ViewCalendar.svelte";
  import ViewCanvas from "#lib/cawco/views/ViewCanvas.svelte";
  import ViewMade from "#lib/cawco/views/ViewMade.svelte";
  import ViewOpenUi from "#lib/cawco/views/ViewOpenUi.svelte";
  import ViewPipeline from "#lib/cawco/views/ViewPipeline.svelte";
  import ViewRoutines from "#lib/cawco/views/ViewRoutines.svelte";
  import {
    discardView,
    keepView,
    viewsOf,
    viewTool,
  } from "#lib/cawco/views-api.js";
  import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { NARROW_QUERY } from "#lib/hooks/is-mobile.svelte.js";
  import {
    IconArtifactSheet,
    IconColumns,
    IconFileTable,
    IconLayers,
    IconMore,
    IconPlus,
    IconSparkles,
    IconToolTodo,
    IconWorkflow,
  } from "#lib/icons.js";
  import { browser } from "$app/env";
  import { goto } from "$app/navigation";
  import { navigating, page } from "$app/state";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const project = $derived(
    (data.project && cawco.project(data.project.id)) ?? data.project
  );
  const machine = $derived.by(() => {
    const primary = project ? checkoutOf(project) : undefined;
    return primary
      ? (cawco.machines.find((row) => row.machineId === primary.machineId) ??
          data.machine)
      : null;
  });
  const projectId = $derived(data.project?.id ?? "");
  setTaskProject(() => projectId);

  /** A refused read, as a sentence with its status for support. */
  const refusal = (read: HubRead<unknown>): string | null =>
    read.ok ? null : `${read.detail} (${read.status}).`;

  // --- the tasks: what the hub answered, from the load and each re-read ------

  let list = $derived<TaskList | null>(data.tasks.ok ? data.tasks.value : null);
  let listProblem = $derived(refusal(data.tasks));
  let stages = $derived<StagesView | null>(
    data.stages.ok ? data.stages.value : null
  );
  let stagesProblem = $derived(refusal(data.stages));
  /** The project's starters, live: a new set the hub writes replaces the one its stages carried. */
  const starters = $derived(
    cawco.startersOf(projectId, "board", stages?.starters)
  );
  /** The empty Routines page's starters and the empty Decisions tab's, live as the board's. */
  const routineStarters = $derived(
    cawco.startersOf(projectId, "routines", stages?.routineStarters)
  );
  const decisionStarters = $derived(
    cawco.startersOf(projectId, "decisions", stages?.decisionStarters)
  );
  /** The task open beside the view, or as its own page on a phone: the URL's `?task=`. */
  const openTask = $derived(
    (page.shallow?.url ?? page.url).searchParams.get("task")
  );
  let needsOnly = $state(false);
  let adding = $state(false);
  /** Moves the hub has not answered yet: the card already stands in its new column. */
  let moving = $state<Record<string, string>>({});

  const stageList = $derived(stages?.stages ?? []);
  const kindByStage = $derived(
    new Map(stageList.map((stage) => [stage.name, stage.kind]))
  );
  /** The list with each pending move shown where it is going. */
  const tasks = $derived<TaskSummary[]>(
    (list?.tasks ?? []).map((task) => {
      const stage = moving[task.id];
      if (stage === undefined) {
        return task;
      }
      const kind = kindByStage.get(stage) ?? null;
      return {
        ...task,
        stage,
        kind,
        needsYou: kind === "you" || task.lastAttemptFailed,
      };
    })
  );
  const kindById = $derived(new Map(tasks.map((task) => [task.id, task.kind])));
  /** What waits on you: the hub's reasons, a session's ask, an action (needs.svelte.ts). */
  const needsYou = $derived(
    tasks.filter((task) => waitsOnYou(projectId, task))
  );
  /** The filter holds only while something needs you. */
  const filtering = $derived(needsOnly && needsYou.length > 0);
  /** What narrows every view of the tasks, kept in the URL (task-filter). */
  let filter = $state<TaskFilter>(filterOf(page.url.searchParams));
  const narrowed = $derived(activeCount(filter));
  /** What the hub found for the filter's words, first from the load (task-find). */
  const find = new TaskFind(
    () => projectId,
    untrack(() => data.find)
  );
  const shownTasks = $derived(
    applyFilter(filtering ? needsYou : tasks, filter, find.ids)
  );
  /** Needs you on, the columns those tasks stand in. */
  const shownStages = $derived(
    filtering
      ? stageList.filter((stage) =>
          needsYou.some((task) => task.stage === stage.name)
        )
      : stageList
  );
  const newIn = $derived(firstTodoStage(stageList)?.name);
  const empty = $derived(list !== null && list.tasks.length === 0);

  /** The archived tasks, for the board's Archived rail. */
  let archived = $state<TaskSummary[]>([]);
  async function readArchived() {
    const id = projectId;
    try {
      const read = await listArchived(id);
      if (id === projectId) {
        archived = read.tasks;
      }
    } catch {
      // The board stands without them.
    }
  }

  const allowedFrom = (stage: string): Set<string> =>
    stages ? movesFrom(stages, stage) : new Set();
  const kindOf = (id: string): StageKind | null | undefined => kindById.get(id);

  // --- Caw, the views and the data they bind to ------------------------------

  /**
   * On the way to another project (the page stays while its load runs): once
   * the wait outlasts --dur-wait-grace the board stands as its skeleton and
   * Caw reads it (design §2, Loading); a quick one shows nothing of its own.
   */
  const leavingFor = $derived(
    navigating.to?.route.id === page.route.id &&
      navigating.to?.params?.id !== projectId
  );
  let reading = $state(false);
  $effect(() => {
    if (!leavingFor) {
      reading = false;
      return;
    }
    const grace = setTimeout(() => {
      reading = true;
    }, dur("--dur-wait-grace"));
    return () => clearTimeout(grace);
  });

  const lead = new CawLead(
    () => projectId,
    () => tasks,
    () => reading
  );
  /** You can talk to Caw, on or off: only a reason he cannot start (no machine) stops it. */
  const canTalk = $derived(lead.view !== null && !lead.view.problem);

  /** The project's views, kept then drafted, once read. */
  let views = $state<ProjectView[]>([]);
  let viewsRead = $state(false);
  let viewsProblem = $state<string | null>(null);
  /** The tasks with their dates, as the `tasks` view tool answers them: what the Calendar places. */
  let dated = $state<ViewTaskRow[] | null>(null);

  /**
   * Pages are blocks (blocks/): each page's arrangement, as the hub keeps
   * it, and the kept views placed on a page as blocks there.
   */
  const blocks = new ProjectBlocks(
    () => projectId,
    () =>
      viewsRead
        ? views.filter((view) => !view.draft).map((view) => view.name)
        : null
  );

  async function readViews() {
    const id = projectId;
    try {
      const read = await viewsOf(id);
      if (id === projectId) {
        views = read;
        viewsProblem = null;
      }
    } catch (error) {
      viewsProblem = message(error);
    } finally {
      viewsRead = true;
    }
  }

  async function readDated() {
    const id = projectId;
    try {
      const read = (await viewTool(id, "tasks", {})) as {
        rows: ViewTaskRow[];
      };
      if (id === projectId) {
        dated = read.rows;
      }
    } catch {
      // The Calendar waits for the next read; the board stands.
    }
  }

  /** The date field the calendar places tasks by; null: no Calendar tab. */
  const dateField = $derived(
    calendarField(
      dated ?? [],
      stages?.views.find((each) => each.name === "calendar")?.by ?? null
    )
  );
  const dateById = $derived(
    new Map(
      (dated ?? []).flatMap((task) => {
        const at = dateField ? task.dates[dateField] : undefined;
        return at === undefined ? [] : [[task.id, at] as const];
      })
    )
  );
  const SHORT_DATE = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  /** A task set for a date says when, short, while it is still to come. */
  const dateOf = (id: string): string | null => {
    const at = dateById.get(id);
    const kind = kindById.get(id);
    return at !== undefined && kind !== "done" && kind !== "dropped"
      ? SHORT_DATE.format(at)
      : null;
  };

  // --- the strip ----------------------------------------------------------------

  /**
   * Where the strip stands: in the shell's bar on a wide screen, where the
   * crumb would only have said the name the head says (bar-strip); a
   * phone's bar is the burger's, so there it is the page's own row under
   * the head. The line the shell hosts a conversation's tabs by.
   */
  const narrowQuery = new MediaQuery(NARROW_QUERY);
  /** Under 900px a task is its own page, not the split beside the view (`phone`). */
  const sheetQuery = new MediaQuery("(max-width: 899px)");
  /** Under 640px the page is the one scroller, not the pane (the styles' own line). */
  const pageScrollsQuery = new MediaQuery("(max-width: 639px)", false);
  const hosted = $derived(
    !(browser ? narrowQuery.current : Boolean(page.data.narrow))
  );
  $effect(() => {
    if (!(hosted && project)) {
      return;
    }
    barStrip.strip = inBar;
    return () => {
      if (barStrip.strip === inBar) {
        barStrip.strip = null;
      }
    };
  });

  interface StripTab {
    draft: boolean;
    label: string;
    value: string;
  }
  const viewLabel = (name: string): string => stageLabel(name);
  const tabs = $derived<StripTab[]>([
    { value: "board", label: "Board", draft: false },
    { value: "table", label: "Table", draft: false },
    { value: "pipeline", label: "Pipeline", draft: false },
    // Routines, the fourth tab, always there.
    { value: "routines", label: "Routines", draft: false },
    // The project's decision pages, always: an empty one starts Caw on one.
    { value: "decisions", label: "Decisions", draft: false },
    // The task graph, while the tasks draw one (an edge between two).
    ...(taskEdges(tasks).length > 0
      ? [{ value: "canvas", label: "Canvas", draft: false }]
      : []),
    ...(dateField
      ? [{ value: "calendar", label: "Calendar", draft: false }]
      : []),
    // What the project's tasks made, while one has made something.
    ...(tasks.some((task) => task.outputs.length > 0)
      ? [{ value: "made", label: "Made", draft: false }]
      : []),
    // A view placed on a page stands there as a block, and is no tab.
    ...views
      .filter((view) => view.draft || blocks.pageOfView(view.name) === null)
      .map((view) => ({
        value: `view:${view.name}`,
        label: viewLabel(view.name),
        draft: view.draft,
      })),
  ]);
  /** The views as a phone's bar lists them: Decisions with the pages waiting on picks. */
  const barViews = $derived(
    tabs.map((each) => ({
      ...each,
      count: each.value === "decisions" ? decisions.waiting : 0,
    }))
  );
  /** The head: the views bar's "+" opens its New session popover. */
  let head = $state<ReturnType<typeof ProjectHead> | null>(null);
  let tab = $derived(data.view);
  /** The view on screen: the one asked for once it exists, the board meanwhile. */
  const current = $derived(
    tabs.some((each) => each.value === tab) ? tab : "board"
  );
  /** A view the URL names is still being read: its place holds a skeleton. */
  const awaiting = $derived(
    tab.startsWith("view:") && !viewsRead && current !== tab
  );

  // --- the Decisions tab ---------------------------------------------------------

  /** The project's decision pages (decisions.svelte.ts): the tab and its trail read them. */
  const decisions = new ProjectDecisions(() => projectId);
  /** The decision page open in the tab, and how the tab shows the rest. */
  let decisionPage = $derived<string | null>(data.decisionPage);
  let decisionMode = $derived<DecisionsMode>(data.decisionMode);
  /** The card a link names (`#<card>`): the page opens scrolled to it. */
  let decisionCard = $derived<string | null>(
    page.url.hash ? decodeURIComponent(page.url.hash.slice(1)) : null
  );
  interface DecisionsPlace {
    card?: string | null;
    mode?: DecisionsMode;
    page?: string | null;
  }

  /** The view and the open task in the URL, so a link opens the same. */
  function hrefOf(
    id: string | null,
    as: string = current,
    place: DecisionsPlace = {}
  ): string {
    const query = new URLSearchParams();
    if (as !== "board") {
      query.set("view", as);
    }
    const at = {
      page: "page" in place ? (place.page ?? null) : decisionPage,
      mode: place.mode ?? decisionMode,
      card: "card" in place ? (place.card ?? null) : decisionCard,
    };
    if (as === "decisions" && at.page) {
      query.set("page", at.page);
    } else if (as === "decisions" && at.mode === "graph") {
      query.set("mode", "graph");
    }
    if (id) {
      query.set("task", id);
    }
    writeFilter(query, filter);
    const search = query.toString();
    const hash =
      as === "decisions" && at.page && at.card
        ? `#${encodeURIComponent(at.card)}`
        : "";
    return `/project/${projectId}${search ? `?${search}` : ""}${hash}`;
  }

  /** Where the Decisions tab goes: a page (at a card), the list or the graph. */
  function decisionsGo(to: DecisionsPlace) {
    if ("page" in to) {
      decisionPage = to.page ?? null;
    }
    if (to.mode) {
      decisionMode = to.mode;
    }
    if ("card" in to) {
      decisionCard = to.card ?? null;
    }
    remember();
  }

  /** The time the tiles' ages read, moved each minute while the tab shows. */
  let decisionsNow = $state(Date.now());
  $effect(() => {
    if (current !== "decisions") {
      return;
    }
    decisionsNow = Date.now();
    const ticking = setInterval(() => {
      decisionsNow = Date.now();
    }, 60_000);
    return () => clearInterval(ticking);
  });

  const taskOf = (id: string) => {
    const task = tasks.find((each) => each.id === id);
    return task ? { kind: task.kind, title: task.title } : undefined;
  };

  function remember() {
    if (!browser) {
      return;
    }
    try {
      goto(hrefOf(openTask), {
        shallow: true,
        replace: true,
        state: page.state,
      });
    } catch {
      // Before the router is ready the URL is already right.
    }
  }

  /**
   * The panes swap as the New session dialog's lists do (motion/list-swap,
   * its keyframes and timings): the view on screen leaves over the pane's
   * top and the next comes in once it has gone. The pane is the viewport's
   * height whatever it shows, so there is no height to follow: its children
   * (a board that fills it, a calendar sized to it) take their size from
   * it, and a morph() here would have nothing of theirs to tween to. What
   * leaves is the view itself, held by its outro as
   * the hover panel holds its old content (HoverPanel `swapOut`): a view is
   * never mounted a second time to be animated out, so a board, a calendar
   * or a drawn view leaves as it stood and is torn down once, after.
   */
  const swap = new ListSwap<never>();
  function leave(node: HTMLElement): TransitionConfig {
    node.style.position = "absolute";
    node.style.inset = "0 0 auto";
    node.style.pointerEvents = "none";
    node.inert = true;
    node.setAttribute("aria-hidden", "true");
    node.style.animation = swap.leaveAnim(0);
    return { duration: motionOk.current ? ListSwap.leaveEnd(0) : 0 };
  }
  /** What the pane shows: a view, or the wait for one the URL names. */
  const shown = $derived(awaiting ? "awaiting" : current);
  function choose(next: string) {
    if (next === current) {
      return;
    }
    const order = tabs.map((each) => each.value);
    swap.swap([], order.indexOf(next) > order.indexOf(current) ? 1 : -1);
    tab = next;
    remember();
  }

  /**
   * Under 900px a task is its own page (the session split's line), read off
   * the screen.
   */
  const phone = $derived(browser ? sheetQuery.current : !hosted);

  /**
   * Opens a task: on a desk beside the view, swapping the one open in place;
   * on a phone as its own page, a history entry of its own.
   */
  function openOne(id: string) {
    if (id === openTask) {
      return;
    }
    if (phone) {
      goto(hrefOf(id), { shallow: true, state: { taskOpened: true } });
    } else {
      goto(hrefOf(id), { shallow: true, replace: true, state: page.state });
    }
  }

  /** Close on a desk, Back on a phone: the view, as it stood. */
  function closeTask() {
    if (phone && page.state.taskOpened) {
      history.back();
      return;
    }
    goto(hrefOf(null), { shallow: true, replace: true, state: {} });
  }

  /**
   * The task the split's side holds: the open one, kept while the side
   * closes, so it leaves as it stood.
   */
  let sideTask = $state<string | null>(null);
  $effect(() => {
    if (openTask) {
      sideTask = openTask;
    }
  });
  const viewWord = $derived(
    (
      tabs.find((each) => each.value === current)?.label ?? "Board"
    ).toLowerCase()
  );

  // --- the hub's writes ---------------------------------------------------------

  /** Reads of the tasks so far: only the newest one's answer is kept. */
  let reads = 0;
  async function refresh() {
    const id = projectId;
    reads += 1;
    const ticket = reads;
    const [read, readStagesNow] = await Promise.allSettled([
      listTasks(id),
      readStages(id),
    ]);
    if (id !== projectId || ticket !== reads) {
      return;
    }
    if (read.status === "fulfilled") {
      list = read.value;
      listProblem = null;
    } else {
      listProblem = message(read.reason);
    }
    if (readStagesNow.status === "fulfilled") {
      stages = readStagesNow.value;
      stagesProblem = null;
    } else {
      stagesProblem = message(readStagesNow.reason);
    }
    // biome-ignore lint/complexity/noVoid: the re-read sets its own state
    void readDated();
    // biome-ignore lint/complexity/noVoid: the re-read sets its own state
    void readArchived();
    // What the words find moves with the tasks (a description changed).
    // biome-ignore lint/complexity/noVoid: the re-read sets its own state
    void find.again();
  }

  /** A task the hub just wrote, put into the list until the list is read again. */
  function patch(task: TaskView) {
    if (!list) {
      return;
    }
    const row: TaskSummary = {
      ...(list.tasks.find((each) => each.id === task.id) ?? {
        problem: null,
        rank: task.rank,
        type: task.type,
      }),
      id: task.id,
      number: task.number,
      path: task.path,
      title: task.title,
      stage: task.stage,
      kind: task.kind,
      needsYou: task.needsYou,
      after: task.after,
      parent: task.parent,
      related: task.related,
      foundIn: task.foundIn,
      duplicateOf: task.duplicateOf,
      // The row's fields are the ones that hold one scalar (the hub's TaskSummary).
      fields: Object.fromEntries(
        Object.entries(task.extra).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string"
        )
      ),
      labels: task.labels,
      outputs: task.outputs,
      rank: task.rank,
      type: task.type,
      todos: {
        done: task.todos.filter((todo) => todo.done).length,
        total: task.todos.length,
      },
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      attempts: task.attempts,
      blockedBy: task.blockedBy,
      lastAttemptFailed: task.lastAttemptFailed,
      lastAttemptStopped: task.lastAttemptStopped,
      liveAttempt: task.liveAttempt,
      queuedStart: task.queuedStart,
      startProblem: task.startProblem,
    };
    const known = list.tasks.some((each) => each.id === task.id);
    list = {
      ...list,
      tasks: known
        ? list.tasks.map((each) => (each.id === task.id ? row : each))
        : [...list.tasks, row],
    };
  }

  function changed(task: TaskView) {
    patch(task);
    // biome-ignore lint/complexity/noVoid: the re-read sets its own state
    void refresh();
  }

  /** The card for `id` takes off from where it is drawn, to land in its new column. */
  function lift(id: string, source?: HTMLElement) {
    const card =
      source ??
      document.querySelector<HTMLElement>(`[data-share="task:${id}"]`);
    if (card) {
      depart(card);
    }
  }

  /**
   * A move, the card standing where it was put, saying it moves, until the
   * hub answers. A refusal puts the card back where it was, and the hub's
   * sentence (which names the moves that are open) is thrown to whoever
   * asked: the board says it under the card, the sheet beside its picker.
   */
  async function move(
    id: string,
    stage: string,
    source?: HTMLElement,
    reason?: string
  ): Promise<TaskView> {
    lift(id, source);
    moving = { ...moving, [id]: stage };
    try {
      const task = await moveTask(projectId, id, stage, reason);
      patch(task);
      return task;
    } catch (error) {
      lift(id);
      throw error;
    } finally {
      const { [id]: _, ...rest } = moving;
      moving = rest;
      // biome-ignore lint/complexity/noVoid: the re-read sets its own state
      void refresh();
    }
  }

  /**
   * Moves the hub refused from the board, by task: the card is back in its
   * column with the hub's sentence (which names the moves that are open)
   * under it, and Try again makes the same move.
   */
  let refusedMoves = $state<Record<string, { reason: string; stage: string }>>(
    {}
  );

  function drop(id: string, stage: string, source?: HTMLElement) {
    const { [id]: _, ...rest } = refusedMoves;
    refusedMoves = rest;
    move(id, stage, source).catch((error: unknown) => {
      refusedMoves = {
        ...refusedMoves,
        [id]: { reason: message(error), stage },
      };
    });
  }
  const refusedMove = (id: string) => {
    const refused = refusedMoves[id];
    return refused
      ? { reason: refused.reason, again: () => drop(id, refused.stage) }
      : null;
  };

  /**
   * The project has stages of its own now. Tasks the set lacks were named
   * before it was chosen (StagesControl); they stand in Other stages.
   */
  function applied(next: StagesView) {
    stages = next;
    // biome-ignore lint/complexity/noVoid: the re-read sets its own state
    void refresh();
  }

  async function create(title: string, stage: string) {
    const task = await createTask(projectId, { title, stage });
    changed(task);
  }

  // --- the filter and a bulk change ------------------------------------------

  function setFilter(next: TaskFilter) {
    filter = next;
    remember();
  }
  /** The phone's Filter, opened from the head's ⋯ (ProjectHead `onfilter`). */
  let filterOpen = $state(false);
  let filterAnchor = $state<HTMLElement | null>(null);

  /** The picked tasks the view shows: a bulk change acts on what you see. */
  const picked = $derived(shownTasks.filter((task) => isPicked(task.id)));
  /** A card's or a row's tick; held still while a bulk change runs. */
  function pick(id: string, on: boolean, range?: string[]) {
    if (!bulkRun) {
      pickTask(id, on, range);
    }
  }
  const dropTo = $derived(
    stageList.find((stage) => stage.kind === "dropped")?.name ?? null
  );
  /** The bulk change in flight, or where the hub stopped it. */
  let bulkRun = $state<BulkRun | null>(null);
  /** Goes on from where a refused bulk change stopped. */
  let bulkAgain: (() => void) | null = null;

  /**
   * A bulk change, one task at a time through each task's own route, in the
   * order picked. Each task the hub confirms leaves the selection; a
   * refusal stops the run there, says the task and the hub's words, and
   * the tasks not yet changed stay picked for Try again.
   */
  async function bulk(
    verb: string,
    ids: string[],
    act: (id: string) => Promise<unknown>,
    total = ids.length,
    before = 0
  ) {
    bulkRun = { verb, done: before, total, failed: null };
    for (const [at, id] of ids.entries()) {
      try {
        // biome-ignore lint/performance/noAwaitInLoops: one task at a time, so a refusal stops the rest
        await act(id);
      } catch (error) {
        bulkRun = {
          verb,
          done: before + at,
          total,
          failed: { id, text: message(error) },
        };
        bulkAgain = () => bulk(verb, ids.slice(at), act, total, before + at);
        // biome-ignore lint/complexity/noVoid: the re-read sets its own state
        void refresh();
        return;
      }
      selection.ids = selection.ids.filter((each) => each !== id);
      bulkRun = { verb, done: before + at + 1, total, failed: null };
    }
    bulkRun = null;
    bulkAgain = null;
    clearPicks();
    // biome-ignore lint/complexity/noVoid: the re-read sets its own state
    void refresh();
  }
  const pickedIds = () => picked.map((task) => task.id);
  const bulkMove = (stage: string) =>
    bulk("Moving", pickedIds(), (id) => move(id, stage));
  const bulkDrop = (reason: string) => {
    if (dropTo) {
      bulk("Dropping", pickedIds(), (id) =>
        move(id, dropTo, undefined, reason)
      );
    }
  };
  const bulkLabel = (label: string) =>
    bulk("Labelling", pickedIds(), async (id) => {
      const row = tasks.find((task) => task.id === id);
      patch(
        await updateTask(projectId, id, {
          labels: [...new Set([...(row?.labels ?? []), label])],
        })
      );
    });
  const bulkArchive = () =>
    bulk("Archiving", pickedIds(), async (id) => {
      await archiveTask(projectId, id);
      if (list) {
        list = { ...list, tasks: list.tasks.filter((task) => task.id !== id) };
      }
    });
  function endBulk() {
    clearPicks();
    bulkRun = null;
    bulkAgain = null;
  }

  // Another project, or another view: the picks go (a card picked on the
  // board is not a row picked in the table); the filter is the next
  // project's own, from its URL.
  let pickedFor = "";
  $effect(() => {
    const at = `${projectId}:${current}`;
    if (pickedFor && pickedFor !== at && !bulkRun) {
      untrack(endBulk);
    }
    pickedFor = at;
  });
  let filterFor = "";
  $effect(() => {
    const id = projectId;
    const seed = data.find;
    if (filterFor && filterFor !== id) {
      untrack(() => {
        filter = filterOf(page.url.searchParams);
        find.reset(seed);
        askedWords = wordsOf(filter.q);
      });
    }
    filterFor = id;
  });

  /**
   * The filter's words go to the hub once typing rests, each change of them
   * once: the field writes them at every key, and a read per key would only
   * be dropped for the next. Taken out, they unnarrow at once.
   */
  const FIND_REST_MS = 250;
  let askedWords = wordsOf(untrack(() => filter.q));
  $effect(() => {
    const words = wordsOf(filter.q);
    if (words === askedWords) {
      return;
    }
    if (!words) {
      askedWords = words;
      untrack(() => find.find(words));
      return;
    }
    const resting = setTimeout(() => {
      askedWords = words;
      find.find(words);
    }, FIND_REST_MS);
    return () => clearTimeout(resting);
  });

  // --- drafts --------------------------------------------------------------------

  let keeping = $state<string | null>(null);
  let discarding = $state<string | null>(null);

  /** Keep: the draft becomes a kept view where its tab stands. */
  async function keep(name: string) {
    keeping = name;
    try {
      const kept = await keepView(projectId, name);
      views = views.map((view) => (view.name === name ? kept : view));
    } catch (error) {
      toast.error(message(error));
    } finally {
      keeping = null;
    }
  }

  /** Discard: the draft goes, and the board comes back. */
  async function discard(name: string) {
    discarding = name;
    try {
      await discardView(projectId, name);
      choose("board");
      views = views.filter((view) => view.name !== name);
    } catch (error) {
      toast.error(message(error));
    } finally {
      discarding = null;
    }
  }

  // --- the pages' blocks ----------------------------------------------------------

  const PAGE_LABELS: Record<BlockPageId, string> = {
    board: "Board",
    table: "Table",
    pipeline: "Pipeline",
    routines: "Routines",
  };
  const TASK_GLYPHS = {
    board: IconColumns,
    table: IconFileTable,
    pipeline: IconWorkflow,
  } as const;

  /** The kept views placed on `on`, each a block there. */
  function viewItemsOf(on: BlockPageId): Record<string, BlockItem> {
    return Object.fromEntries(
      blocks.placesOf(on).flatMap((place): [string, BlockItem][] => {
        const name = viewOfBlock(place.block);
        const view = name
          ? views.find((each) => each.name === name && !each.draft)
          : undefined;
        return view
          ? [
              [
                place.block,
                {
                  title: viewLabel(view.name),
                  glyph: IconArtifactSheet,
                  content: viewBody,
                  measure: "--c-block-view",
                  hideable: true,
                  body: "natural",
                  card: false,
                  view: view.name,
                },
              ],
            ]
          : [];
      })
    );
  }

  /**
   * A task view's page: the view itself, drawn alone as it always was until
   * a view is placed beside it; then the view's block spans the row, and
   * the board fills the page's height.
   */
  function taskPageItems(
    view: "board" | "table" | "pipeline",
    content: Snippet<[string]>
  ): Record<string, BlockItem> {
    return {
      [view]: {
        title: PAGE_LABELS[view],
        glyph: TASK_GLYPHS[view],
        meta: taskCount,
        content,
        alone: true,
        wideOnly: true,
        hideable: false,
        body: view === "board" ? "fill" : "natural",
        card: false,
        measure: "--c-block-view",
      },
      ...viewItemsOf(view),
    };
  }

  /** A task view's page with blocks beside its view: the pane scrolls them. */
  const framed = $derived(
    isBlockPage(current) &&
      current !== "routines" &&
      blocks.placesOf(current).length > 1
  );

  /** A kept view placed on a page: it leaves the strip, and the page shows it. */
  async function placeView(name: string, on: BlockPageId) {
    if (await blocks.place(name, on)) {
      if (current !== on) {
        choose(on);
      }
      tab = on;
      remember();
    } else {
      // Refused, the view stays where it is: its tab, which says why.
      toast.error(blocks.refused[on] ?? "The hub did not place the view.");
    }
  }

  // --- Ask Caw for a view -------------------------------------------------------

  let stagesOpen = $state(false);
  let stagesAnchor = $state<HTMLElement | null>(null);
  let askOpen = $state(false);
  let askAnchor = $state<HTMLElement | null>(null);
  /** The ask's words, in the session Composer the popover holds. */
  const viewDraft = new ComposerDraft();
  let viewSending = $state(false);
  let viewRefused = $state("");
  /** The ask never reached the hub: its line offers Send again. */
  let viewAgain = $state(false);
  /** What the Composer stands over its foot: the popover holds that much room. */
  let viewFoot = $state(0);
  function ask(anchor: HTMLElement) {
    askAnchor = anchor;
    askOpen = true;
    viewDraft.focusWanted = true;
  }
  /**
   * The view is asked for, as a thread tab sends (ThreadPane): a refusal
   * puts the words back in the composer with the reason over them.
   */
  async function askView(text: string) {
    viewSending = true;
    viewRefused = "";
    viewAgain = false;
    try {
      await requestView(projectId, text);
      askOpen = false;
    } catch (error) {
      viewDraft.restore(text);
      viewAgain = unreachable(error);
      viewRefused = viewAgain ? THREAD_SEND_UNREACHED : message(error);
    } finally {
      viewSending = false;
    }
  }

  // --- what keeps the page live -------------------------------------------------

  // On arrival and on every reconnect: Caw, the views and their data, and the
  // tasks the hub may have moved while the socket was down.
  let readFor = "";
  $effect(() => {
    const live = cawco.status === "connected";
    const id = projectId;
    if (!(live && id)) {
      readFor = "";
      return;
    }
    if (readFor === id) {
      return;
    }
    readFor = id;
    untrack(() => {
      lead.read();
      readViews();
      blocks.read();
      readDated();
      readArchived();
      decisions.read();
      if (list) {
        refresh();
      }
    });
  });

  // Another hand flipped Caw (another dashboard, the app): the project row the
  // hub's `projects.changed` brings says where he stands, and his view is
  // read again, so every switch on him says the same.
  let cawSeen: boolean | undefined;
  $effect(() => {
    const on = project?.caw;
    if (cawSeen !== undefined && on !== undefined && on !== cawSeen) {
      untrack(() => {
        if (lead.view && lead.view.on !== on && !lead.moving) {
          lead.read();
        }
      });
    }
    cawSeen = on;
  });

  // Another hand changed the tasks (Caw filed one, an attempt moved one): the
  // hub says so, and the list is read again.
  let changesSeen = -1;
  $effect(() => {
    const changes = cawco.tasksChangedOf(projectId);
    if (changesSeen !== -1 && changes !== changesSeen && list) {
      untrack(() => refresh());
    }
    changesSeen = changes;
  });

  // A decision page was built, picked on or sent, or tasks it made moved:
  // its tiles and the tab's count are read again.
  let decisionsSeen = -1;
  $effect(() => {
    const changes =
      cawco.decisionsChangedOf(projectId) + cawco.tasksChangedOf(projectId);
    if (decisionsSeen !== -1 && changes !== decisionsSeen) {
      untrack(() => decisions.read());
    }
    decisionsSeen = changes;
  });

  // The arrangement changed (here, or on another screen): it is read again,
  // and the views with it, since a view placed or made a tab moves the strip.
  let blocksSeen = -1;
  $effect(() => {
    const changes = cawco.blocksChangedOf(projectId);
    if (blocksSeen !== -1 && changes !== blocksSeen) {
      untrack(() => {
        blocks.read();
        readViews();
      });
    }
    blocksSeen = changes;
  });

  // Another hand may have changed the tasks while the tab was away.
  $effect(() => {
    const back = () => {
      if (document.visibilityState === "visible") {
        // biome-ignore lint/complexity/noVoid: the re-read sets its own state
        void refresh();
        // biome-ignore lint/complexity/noVoid: the re-read sets its own state
        void decisions.read();
        // biome-ignore lint/complexity/noVoid: the re-read sets its own state
        void blocks.read();
      }
    };
    document.addEventListener("visibilitychange", back);
    return () => document.removeEventListener("visibilitychange", back);
  });

  // Caw drafts a view in a thread; when a thread of the project moves, the
  // views are read again, so a new draft arrives as a tab.
  const threadsMoved = $derived(
    Math.max(0, ...threadsOf(projectId).map((thread) => thread.lastAt))
  );
  let threadsSeen = 0;
  $effect(() => {
    const at = threadsMoved;
    if (threadsSeen === 0) {
      threadsSeen = at || 1;
      return;
    }
    if (at > threadsSeen) {
      threadsSeen = at;
      untrack(() => readViews());
    }
  });

  // A task that lands in a done stage: Caw says so for two breaths.
  let kindsSeen: Map<string, StageKind | null> | null = null;
  $effect(() => {
    const now = new Map(
      (list?.tasks ?? []).map((task) => [task.id, task.kind])
    );
    if (kindsSeen) {
      for (const [id, kind] of now) {
        const was = kindsSeen.get(id);
        if (kind === "done" && was !== undefined && was !== "done") {
          untrack(() => lead.land(id));
        }
      }
    }
    kindsSeen = now;
  });

  // --- what the page says --------------------------------------------------------

  const unreadLine = $derived(
    `The tasks for ${project?.name ?? "this project"} could not be read: ${
      listProblem ?? "the hub did not answer."
    } Nothing was changed.`
  );
  const unreadStages = $derived(
    `stages.md in the project folder does not read: ${(stages?.problems ?? []).join(" ")} Tasks keep their stages meanwhile; fix the file and the board takes its columns from it.`
  );
  /** The empty board with Caw: what Caw does, in this project's own stages, named as the board names them. */
  const cawLine = $derived.by(() => {
    const named = stageList
      .filter((stage) => stage.kind !== "dropped")
      .map((stage) => stageLabel(stage.name));
    const you = stageList.find((stage) => stage.kind === "you");
    const flow =
      named.length > 1
        ? `${named.slice(0, -1).join(", ")} and ${named.at(-1)}`
        : (named[0] ?? "");
    return `Tell Caw what to do: the tasks Caw files move through ${flow}.${
      you ? ` One waiting on you shows in ${stageLabel(you.name)}.` : ""
    }`;
  });
  /**
   * New task stands in the strip whenever there is no form for it on the
   * board: a board with tasks, and an empty one Caw's field stands over
   * (an empty board while Caw can't start holds the form itself).
   */
  const strippedNewTask = $derived(list !== null && (!empty || canTalk));
  /** The view on screen is one of the tasks, which the filter narrows. */
  const filterHere = $derived(
    list !== null &&
      !empty &&
      ["board", "table", "pipeline", "canvas", "calendar"].includes(current)
  );
  /** Something stands after the tabs: the hairline marks where it starts. */
  const trailing = $derived(
    needsYou.length > 0 ||
      strippedNewTask ||
      canTalk ||
      (filterHere && (hosted || narrowed > 0))
  );
  /**
   * Caw stands over the empty board while he can start; elsewhere he sits
   * in the head, and the board is drawn — its columns and the new task's
   * form — once a task is being added by hand.
   */
  const standing = $derived(
    current === "decisions"
      ? canTalk && !decisionPage && decisions.list?.pages.length === 0
      : empty &&
          canTalk &&
          !adding &&
          !current.startsWith("view:") &&
          current !== "routines"
  );
  /** What the pane holds, as its layout reads it: a decision page or the graph fills it. */
  const paneView = $derived.by(() => {
    if (current !== "decisions") {
      // A task view with views placed beside it is a page of blocks.
      return framed ? "blocks" : current;
    }
    if (decisionPage) {
      return "decisions-page";
    }
    return decisionMode === "graph" && decisions.list?.graph
      ? "decisions-graph"
      : "decisions";
  });
  /**
   * Which box wears the house edge fade: the one that scrolls the view. On a
   * phone that is the page (the board's columns included, which stand at
   * their height in it); elsewhere the pane, where the board scrolls its
   * columns sideways under its own. None while a view fills its pane (the
   * canvas, a decision page, the decisions' graph) or the next project is read.
   */
  const fadeOn = $derived.by((): "page" | "pane" | null => {
    if (
      reading ||
      current === "canvas" ||
      paneView === "decisions-page" ||
      paneView === "decisions-graph"
    ) {
      return null;
    }
    if (pageScrollsQuery.current) {
      return "page";
    }
    // The board alone scrolls its columns sideways; a board page with
    // blocks beside it scrolls in the pane.
    return paneView === "board" ? null : "pane";
  });

  /**
   * When he sits down (the first task landed, or the view moved off the
   * board), the Caw standing over the board departs as he goes, and the
   * head's seat lands him (CawSeat): one Caw, 80 into 48. His outro is the
   * one moment he is known to be leaving while still drawn, so it is where
   * he departs; it takes no time of its own.
   */
  function sitDown(node: HTMLElement): TransitionConfig {
    depart(node);
    return { duration: 0 };
  }
</script>

<svelte:head>
  <title>{project?.name ?? "Project"} &middot; CawCo</title>
</svelte:head>

<!-- The view strip: the views, then what acts on them. Drawn in the shell's
     bar on a wide screen (`inBar`, bar-strip), as the page's own row under
     the head on a phone. -->
{#snippet strip(inBar: boolean)}
  <div
    data-slot="strip"
    class={[
      "flex min-w-0 items-center gap-space-3 pt-0",
      inBar
        ? "grow shrink basis-0 self-stretch pr-space-3 pb-0 pl-space-7"
        : "pr-space-6 pb-space-4 pl-space-7 max-desk:px-space-5",
    ]}
  >
    <Tabs onValueChange={choose} value={current}>
      <TabsList aria-label="Views" scrollable>
        {#each tabs as each (each.value)}
          <TabItem
            href={hrefOf(null, each.value)}
            label={each.label}
            value={each.value}
          >
            {#snippet trail()}
              {#if each.draft}
                <!-- The tag stands after the view's name, never over it. -->
                <Badge class="ms-space-1" variant="secondary"
                  ><span>draft</span></Badge
                >
              {:else if each.value === "decisions" && decisions.waiting > 0}
                <!-- The Decisions tab's trail: the pages still waiting for
                     picks, as Needs you's number. -->
                <span
                  data-slot="tab-num"
                  class="ms-space-1 type-meta num text-ink-muted"
                  >{decisions.waiting}</span
                >
              {/if}
            {/snippet}
          </TabItem>
        {/each}
      </TabsList>
    </Tabs>
    {#if trailing}
      <!-- Under 640px New task and Ask Caw are in the head's ⋯: the rule
           stands only while Needs you follows it there. -->
      <span
        data-wide={needsYou.length === 0 || undefined}
        aria-hidden="true"
        class={[
          "h-c-btn-h-sm w-px flex-none bg-border-hairline",
          needsYou.length === 0 && "max-phone:hidden",
        ]}
      ></span>
    {/if}
    <div class="flex flex-none items-center gap-space-2">
      <!-- Filter, on the views of the tasks: whole in the bar; on a phone,
           where the row has no room for it, its glyph and count stand while
           a filter does, and the head's ⋯ opens it. -->
      {#if filterHere && (inBar || narrowed > 0)}
        <TaskFilterPopover
          compact={!inBar}
          {filter}
          {find}
          onchange={setFilter}
          tasks={[...tasks, ...archived]}
        />
      {/if}
      {#if needsYou.length > 0}
        <NeedsYouChip
          count={needsYou.length}
          on={filtering}
          ontoggle={() => {
            needsOnly = !filtering;
          }}
        />
      {/if}
      {#if strippedNewTask}
        <Button
          data-wide
          class="max-phone:hidden"
          press="pressable"
          onclick={() => {
            if (current !== "table") {
              choose("board");
            }
            adding = true;
          }}
          size="sm"
          variant="outline"
        >
          <IconPlus />
          <span>New task</span>
        </Button>
      {/if}
      {#if canTalk}
        <Button
          data-wide
          class="max-phone:hidden"
          press="pressable"
          onclick={(event) => ask(event.currentTarget as HTMLElement)}
          size="sm"
          variant="ghost"
        >
          <IconSparkles />
          <span>Ask Caw for a view</span>
        </Button>
      {/if}
    </div>
  </div>
{/snippet}

<!-- What acts on the picked tasks, the board's cards or the table's rows. -->
{#snippet bulkBar()}
  {#if picked.length > 0 || bulkRun}
    <BulkBar
      {allowedFrom}
      {dropTo}
      labels={[...new Set(tasks.flatMap((task) => task.labels))].sort()}
      onarchive={bulkArchive}
      onclear={endBulk}
      ondrop={bulkDrop}
      onlabel={bulkLabel}
      onmove={bulkMove}
      onretry={() => bulkAgain?.()}
      {picked}
      run={bulkRun}
      stages={stageList}
    />
  {/if}
{/snippet}

{#snippet inBar()}
  {@render strip(true)}
{/snippet}

<!-- The task views, each its page's own block (blocks/BlockPage). -->
{#snippet boardBody(_block: string)}
  <TaskBoard
    {allowedFrom}
    archived={applyFilter(archived, filter, find.ids)}
    {dateOf}
    hrefOf={(id) => hrefOf(id)}
    {kindOf}
    moving={(id) => id in moving}
    {newIn}
    oncreate={create}
    onmove={drop}
    onopen={openOne}
    onpick={pick}
    picked={isPicked}
    refused={refusedMove}
    stages={shownStages}
    tasks={shownTasks}
    bind:adding
  />
{/snippet}
{#snippet tableBody(_block: string)}
  <div class="flex flex-col gap-space-3">
    {#if adding}
      <!-- literal: 36rem -->
      <div
        class="max-w-(--new-max) rounded-lg bg-surface-raised p-space-3 shadow-tile"
        style:--new-max="36rem"
      >
        <NewTaskForm
          oncreate={create}
          stage={newIn ?? ""}
          stages={stageList}
          bind:open={adding}
        />
      </div>
    {/if}
    <TaskTable
      hrefOf={(id) => hrefOf(id)}
      onopen={openOne}
      onpick={pick}
      onpickall={(ids, on) => {
        if (!bulkRun) {
          pickAll(ids, on);
        }
      }}
      picked={isPicked}
      stages={stageList}
      tasks={shownTasks}
    />
  </div>
{/snippet}
{#snippet pipelineBody(_block: string)}
  <ViewPipeline stages={stageList} tasks={shownTasks} />
{/snippet}
<!-- A task view's block counts the tasks it shows. -->
{#snippet taskCount()}
  <span data-slot="num" class="type-meta num text-ink-subtle"
    >{shownTasks.length}</span
  >
{/snippet}
<!-- A kept view placed on a page, drawn as its tab draws it. -->
{#snippet viewBody(block: string)}
  {@const view = views.find((each) => `view:${each.name}` === block)}
  {#if view}
    <ViewOpenUi
      hrefOf={(id) => hrefOf(id)}
      onopen={openOne}
      {projectId}
      {view}
    />
  {/if}
{/snippet}

{#snippet pane(value: string)}
  {#if value.startsWith("view:")}
    {@const view = views.find((each) => `view:${each.name}` === value)}
    {#if view}
      <div class="flex flex-col gap-space-3">
        {#if view.draft}
          <!-- The tab already says `draft`; the bar says what it is and
               offers the two answers, kept together on one row. -->
          <!-- literal: 14rem -->
          <div
            class="flex flex-wrap items-center gap-x-space-3 gap-y-space-2 rounded-lg bg-surface-band px-space-3 py-space-2 shadow-(--hairline-ring)"
            style:--hairline-ring="inset 0 0 0 1px var(--border-hairline)"
            out:crossOut
          >
            <span
              class="type-label min-w-0 flex-(--draft-flex) text-ink-strong"
              style:--draft-flex="1 1 14rem"
              >Caw drafted the {viewLabel(view.name)} view</span
            >
            <div class="flex flex-none gap-space-2">
              <Button
                label="Keep"
                onclick={() => keep(view.name)}
                pending={keeping === view.name}
                pendingLabel="Keeping…"
                size="sm"
                variant="outline"
              />
              <Button
                label="Discard"
                onclick={() => discard(view.name)}
                pending={discarding === view.name}
                pendingLabel="Discarding…"
                size="sm"
                variant="ghost"
              />
            </div>
          </div>
        {:else}
          <!-- A kept view's head: its ⋯ places it on a page, as a block. -->
          <div
            data-slot="view-head"
            class="mark-line flex min-h-c-btn-h-sm items-center gap-space-2 px-space-1"
          >
            <span
              aria-hidden="true"
              class="grid flex-none place-items-center text-ink-muted"
              data-box><IconArtifactSheet class="size-icon-md" /></span
            >
            <h2
              class="type-label m-0 min-w-0 flex-auto overflow-clip text-ellipsis whitespace-nowrap text-ink-strong"
            >
              {viewLabel(view.name)}
            </h2>
            <span data-box>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger
                  aria-label="More for {viewLabel(view.name)}"
                  class="touch-hit"
                  size="icon-sm"
                  variant="ghost"
                >
                  <IconMore />
                </DropdownMenu.Trigger>
                <DropdownMenu.Content align="end" class="w-auto">
                  <DropdownMenu.Sub>
                    <DropdownMenu.SubTrigger>
                      <IconLayers />
                      <span>Place on a page</span>
                    </DropdownMenu.SubTrigger>
                    <DropdownMenu.SubContent class="w-auto" min="compact">
                      {#each BLOCK_PAGES as target (target)}
                        <DropdownMenu.Item
                          onSelect={() => placeView(view.name, target)}
                          >{PAGE_LABELS[target]}</DropdownMenu.Item
                        >
                      {/each}
                    </DropdownMenu.SubContent>
                  </DropdownMenu.Sub>
                </DropdownMenu.Content>
              </DropdownMenu.Root>
            </span>
          </div>
        {/if}
        <ViewOpenUi
          hrefOf={(id) => hrefOf(id)}
          onopen={openOne}
          {projectId}
          {view}
        />
      </div>
    {:else}
      <Skeleton class="w-full" height="board" radius="card" />
    {/if}
  {:else if value === "routines" && project}
    <!-- The routines, the strip's fourth tab: a page of blocks. -->
    <ViewRoutines
      {blocks}
      {canTalk}
      cawProblem={lead.view?.problem ?? null}
      project={{ id: project.id, name: project.name }}
      starters={routineStarters}
      viewItems={viewItemsOf("routines")}
    />
  {:else if value === "decisions"}
    <DecisionsView
      {canTalk}
      card={decisionCard}
      {decisions}
      go={decisionsGo}
      hrefOf={(to) => hrefOf(null, "decisions", to)}
      {lead}
      mode={decisionMode}
      now={decisionsNow}
      onopentask={openOne}
      page={decisionPage}
      {projectId}
      projectName={project?.name ?? ""}
      {sitDown}
      starters={decisionStarters}
      taskHref={(id) => hrefOf(id)}
      {taskOf}
    />
  {:else if !list}
    <div class="max-w-(--state-max)" style:--state-max="72ch">
      <EmptyState
        icon={IconToolTodo}
        line={unreadLine}
        title="Tasks are not available"
      >
        {#snippet action()}
          <Button onclick={refresh} variant="outline">Retry</Button>
        {/snippet}
      </EmptyState>
    </div>
  {:else if empty && !adding}
    {#if !lead.view}
      <Skeleton class="w-full" height="chart" radius="card" width="chart-cap" />
    {:else if canTalk}
      <div data-slot="caw-empty" class="mx-auto w-full max-w-(--c-starters-w)">
        <EmptyState line={cawLine} title="Nothing on the board yet">
          {#snippet mark()}
            <!-- He stands here instead of sitting in the head, and is the
                 same seat at 80: a press opens his panel over the page
                 (CawFloat). His switch is under the head's ⋯, empty board
                 or not. -->
            <div
              data-slot="caw-80"
              class="mb-space-3 grid place-items-center"
              data-share="caw:{projectId}"
              out:sitDown|global
            >
              <CawSeat
                {lead}
                {projectId}
                projectName={project?.name ?? ""}
                size={80}
              />
            </div>
          {/snippet}
          {#snippet action()}
            <!-- A starter opens his panel with its words in his composer;
                 a press on one is no press outside the panel (CawFloat,
                 data-caw-asks), so another starter replaces the words. -->
            {#if starters.length > 0}
              <div class="contents" data-caw-asks>
                <StarterCards
                  onpick={(text) => lead.ask(text, "board")}
                  {starters}
                />
              </div>
            {/if}
          {/snippet}
        </EmptyState>
      </div>
    {:else}
      <div class="max-w-(--state-max)" style:--state-max="72ch">
        <EmptyState
          icon={IconToolTodo}
          line="Add a task by hand while Caw can't start."
          title="Nothing on the board yet"
        >
          {#snippet action()}
            <div class="flex flex-wrap items-start gap-space-2">
              <NewTaskForm
                oncreate={create}
                primary
                stage={newIn ?? ""}
                stages={stageList}
                bind:open={adding}
              />
            </div>
          {/snippet}
        </EmptyState>
      </div>
    {/if}
  {:else if value === "board"}
    <BlockPage
      {blocks}
      items={taskPageItems("board", boardBody)}
      page="board"
    />
  {:else if value === "table"}
    <BlockPage
      {blocks}
      items={taskPageItems("table", tableBody)}
      page="table"
    />
  {:else if value === "pipeline"}
    <BlockPage
      {blocks}
      items={taskPageItems("pipeline", pipelineBody)}
      page="pipeline"
    />
  {:else if value === "canvas"}
    <ViewCanvas
      hrefOf={(id) => hrefOf(id)}
      {kindOf}
      onopen={openOne}
      tasks={shownTasks}
    />
  {:else if value === "calendar" && dateField && dated}
    <ViewCalendar field={dateField} onopen={openOne} tasks={dated} />
  {:else if value === "made"}
    <ViewMade
      hrefOf={(id) => hrefOf(id)}
      onopen={openOne}
      open={openTask}
      {projectId}
      tasks={shownTasks}
    />
  {:else}
    <Skeleton class="w-full" height="board" radius="card" />
  {/if}
{/snippet}

{#if !project}
  <div class="flex flex-1 items-center justify-center p-6">
    <p class="text-body text-ink-muted">
      No such project. It may have been removed; pick another from the rail.
    </p>
  </div>
{:else}
  {#if phone && openTask && stages}
    <!-- A phone: the task is its own page, with Back to the view. -->
    <div
      data-slot="project-page"
      class="flex h-full min-h-0 flex-1 flex-col overflow-hidden max-phone:@container-size max-phone:overflow-x-hidden max-phone:overflow-y-auto max-phone:overscroll-y-contain max-phone:pb-(--bar-reach) max-phone:fade-inset-end-(--bar-fade-inset)"
      style:--bar-reach={"calc(var(--c-composer-panel) + var(--space-4) + var(--safe-bottom) + var(--space-3))"}
      style:--bar-fade-inset="calc(var(--bar-reach) - var(--space-3))"
    >
      <TaskPane
        {allowedFrom}
        backLabel={project.name}
        onchanged={changed}
        onclose={closeTask}
        onmove={(id, stage) => move(id, stage)}
        onopen={openOne}
        page
        {projectId}
        {stages}
        taskId={openTask}
        {tasks}
      />
    </div>
  {:else}
    <!-- The frame the phone's views bar docks in, over the page's foot. -->
    <div class="relative flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <!-- A phone: the page is the one scroller, so iOS never chains two. The
           foot's edge fade ends at the bar's top edge, a step of air under
           the reach. -->
      <div
        data-slot="project-page"
        class={[
          "flex h-full min-h-0 flex-1 flex-col overflow-hidden max-phone:@container-size max-phone:overflow-x-hidden max-phone:overflow-y-auto max-phone:overscroll-y-contain max-phone:pb-(--bar-reach) max-phone:fade-inset-end-(--bar-fade-inset)",
          fadeOn === "page" && "kit-edge-fade-block",
        ]}
        style:--bar-reach={"calc(var(--c-composer-panel) + var(--space-4) + var(--safe-bottom) + var(--space-3))"}
        style:--bar-fade-inset="calc(var(--bar-reach) - var(--space-3))"
      >
        <ProjectHead
          bind:this={head}
          {lead}
          {machine}
          onask={canTalk ? ask : null}
          onfilter={(anchor) => {
            filterAnchor = anchor;
            filterOpen = true;
          }}
          onnewtask={() => {
            choose("board");
            adding = true;
          }}
          onstages={stages?.source === "template"
            ? (anchor) => {
                stagesAnchor = anchor;
                stagesOpen = true;
              }
            : null}
          {project}
          seated={!standing}
        />

        {#if lead.view?.problem}
          <Alert
            data-id-page-notice
            class="mr-space-6 mb-space-3 ml-space-7 w-auto max-desk:mx-space-5"
            variant="warning"
          >
            <AlertDescription>{lead.view.problem}</AlertDescription>
          </Alert>
        {/if}
        {#if stages && stages.problems.length > 0}
          <Alert
            data-id-page-notice
            class="mr-space-6 mb-space-3 ml-space-7 w-auto max-desk:mx-space-5"
            variant="warning"
          >
            <AlertDescription>{unreadStages}</AlertDescription>
          </Alert>
        {:else if stagesProblem}
          <Alert
            data-id-page-notice
            class="mr-space-6 mb-space-3 ml-space-7 w-auto max-desk:mx-space-5"
            variant="warning"
          >
            <AlertDescription>
              The project's stages could not be read: {stagesProblem}
            </AlertDescription>
          </Alert>
        {/if}
        {#if list && list.problems.length > 0}
          <Alert
            data-id-page-notice
            class="mr-space-6 mb-space-3 ml-space-7 w-auto max-desk:mx-space-5"
            variant="warning"
          >
            <AlertDescription>{list.problems.join(" ")}</AlertDescription>
          </Alert>
        {/if}
        {#if viewsProblem}
          <Alert
            data-id-page-notice
            class="mr-space-6 mb-space-3 ml-space-7 w-auto max-desk:mx-space-5"
            variant="warning"
          >
            <AlertDescription
              >The project's views could not be read:
              {viewsProblem}</AlertDescription
            >
          </Alert>
        {/if}

        {#if !hosted}
          <!-- Under the head from 640px; a phone's views are its bar's. -->
          <div class="contents max-phone:hidden">{@render strip(false)}</div>
        {/if}

        {#if phone}
          <!-- Under 900px a task is its own page: the view stands alone,
                 the page's one scroller on a phone. -->
          {@render viewPane()}
        {:else}
          <Split
            backLabel="Back to {viewWord}"
            defaultWidth={40}
            keys={{
              width: `cawco.task.width.${projectId}`,
              expanded: `cawco.task.expanded.${projectId}`,
            }}
            main={viewPane}
            open={!!openTask && !!stages}
            side={taskSide}
          />
        {/if}
      </div>
      {#if !hosted}
        <ViewBar
          {current}
          needs={needsYou.length}
          needsOn={filtering}
          onchoose={choose}
          onnewsession={(anchor) => head?.newSessionFrom(anchor)}
          ontoggleneeds={() => {
            needsOnly = !filtering;
          }}
          views={barViews}
        >
          {#snippet tools()}
            <!-- As the strip draws it on a narrow screen: its glyph and count
                 while a filter stands; the head's ⋯ opens it. -->
            {#if filterHere && narrowed > 0}
              <TaskFilterPopover
                compact
                {filter}
                {find}
                onchange={setFilter}
                tasks={[...tasks, ...archived]}
              />
            {/if}
          {/snippet}
        </ViewBar>
      {/if}
      <!-- Outside the scroller, whose edge fade would mask it where it
           floats: a fixed box is drawn under its ancestors' masks. -->
      {#if shown === "board" || shown === "table"}
        {@render bulkBar()}
      {/if}
    </div>
  {/if}

  <!-- Caw's panel floats over the page, from whichever seat stands. -->
  <CawFloat {lead} {projectId} projectName={project?.name ?? ""} />
{/if}

{#snippet taskSide()}
  {#if sideTask && stages}
    <TaskPane
      {allowedFrom}
      onchanged={changed}
      onclose={closeTask}
      onmove={(id, stage) => move(id, stage)}
      onopen={openOne}
      {projectId}
      {stages}
      taskId={sideTask}
      {tasks}
    />
  {/if}
{/snippet}

{#snippet viewPane()}
  <div
    data-slot="pane"
    aria-busy={cawco.hub === "unreachable" || awaiting || reading}
    class={[
      "group flex min-h-0 flex-auto flex-col overflow-y-auto pt-0 pr-space-6 pb-space-6 pl-space-7 max-desk:px-space-5 view-board:overflow-hidden view-board:pb-0 view-canvas:overflow-hidden view-canvas:pb-space-5 view-decisions-graph:overflow-hidden view-decisions-graph:pb-space-5 view-decisions-page:overflow-hidden view-decisions-page:pb-0 max-phone:shrink-0 max-phone:overflow-visible max-phone:view-board:overflow-visible max-phone:view-canvas:h-(--pane-h) max-phone:view-canvas:overflow-visible max-phone:view-decisions-graph:h-(--pane-h) max-phone:view-decisions-graph:overflow-visible max-phone:view-decisions-page:h-(--pane-h) max-phone:view-decisions-page:overflow-visible",
      fadeOn === "pane" && "kit-edge-fade-block",
    ]}
    data-view={reading ? "board" : paneView}
    style:--pane-h="100cqb"
  >
    {#if reading}
      <!-- The board at its real layout, its columns standing empty: the
             next project's read cross-fades in over it. -->
      <div
        aria-hidden="true"
        class="grid auto-cols-(--skeleton-col) grid-flow-col gap-space-3 overflow-hidden max-phone:auto-cols-(--skeleton-col-phone)"
        style:--skeleton-col="minmax(15rem, 22rem)"
        style:--skeleton-col-phone="calc(100% - var(--space-8))"
        out:crossOut
      >
        {#each stageList.filter((stage) => stage.kind !== "dropped") as stage (stage.name)}
          <!-- literal: 54px (a card's height) -->
          <div
            class="flex flex-col gap-space-2 rounded-lg bg-surface-band p-space-2 shadow-(--hairline-ring)"
            style:--hairline-ring="inset 0 0 0 1px var(--border-hairline)"
            style:--card-h="54px"
          >
            <Skeleton class="h-space-4 w-3/5" />
            <Skeleton class="h-(--card-h) w-full" radius="chip" />
            <Skeleton class="h-(--card-h) w-full" radius="chip" />
          </div>
        {/each}
      </div>
    {:else}
      <div
        data-slot="swap"
        class="relative flex min-h-0 flex-col group-view-board:flex-auto group-view-canvas:flex-auto group-view-decisions-graph:flex-auto group-view-decisions-page:flex-auto"
        in:crossIn
      >
        {#key shown}
          <div
            class="flex min-h-0 animate-(--swap-anim) flex-col group-view-board:flex-auto group-view-canvas:flex-auto group-view-decisions-graph:flex-auto group-view-decisions-page:flex-auto"
            style:--swap-anim={swap.rowAnim(0, ListSwap.leaveEnd(0))}
            out:leave
          >
            {#if shown === "awaiting"}
              <Skeleton class="w-full" height="board" radius="card" />
            {:else}
              {@render pane(shown)}
            {/if}
          </div>
        {/key}
      </div>
    {/if}
  </div>
{/snippet}

{#if project}
  <Popover.Root bind:open={askOpen}>
    <!-- The ask is the session Composer floating under the menu: the
         composer is the surface (its pill, edge and shadow), so the popover
         draws none of its own (`bare`), and its box is as tall as what the
         Composer stands (Composer's dock stands on its foot). -->
    <Popover.Content
      align="end"
      bare
      class="w-(--ask-w)"
      customAnchor={askAnchor}
      side="bottom"
      style="--ask-w: min(var(--c-panel-w), calc(100vw - 2 * var(--space-3)))"
    >
      <div
        class="relative h-(--ask-h) w-full"
        style:--ask-h="calc({viewFoot}px + var(--space-4))"
      >
        <Composer
          agentName="Caw"
          attach={false}
          draft={viewDraft}
          onfoot={(foot) => {
            viewFoot = foot.stack;
          }}
          onstop={() => undefined}
          onsubmit={(text) => {
            // biome-ignore lint/complexity/noVoid: the ask's own state is the composer's sending and its refusal
            void askView(text);
          }}
          placeholder="A view of what is scheduled this week…"
          sendAgain={viewAgain}
          sendError={viewRefused}
          sending={viewSending}
        />
      </div>
    </Popover.Content>
  </Popover.Root>

  {#if filterAnchor}
    <TaskFilterPopover
      anchor={filterAnchor}
      {filter}
      {find}
      onchange={setFilter}
      tasks={[...tasks, ...archived]}
      bind:open={filterOpen}
    />
  {/if}

  <StagesControl
    anchor={stagesAnchor}
    onapplied={applied}
    {projectId}
    tasks={list?.tasks ?? []}
    bind:open={stagesOpen}
  />
{/if}

<style>
  /* residual: foreign-dom */
  /* The tabs' own root, which takes no class. */
  [data-slot="strip"] > :global([data-slot="tabs"]) {
    display: flex;
    flex: 0 1 auto;
    min-inline-size: 0;
  }
  /* residual: foreign-dom */
  [data-slot="caw-empty"] :global(.kit-empty) {
    align-items: center;
    text-align: center;
  }
  [data-slot="caw-empty"] :global(.kit-empty-action) {
    align-self: stretch;
  }
  @media (max-width: 639px) {
    /* residual: foreign-dom */
    [data-slot="project-page"] > :global(*) {
      flex-shrink: 0;
    }
  }
</style>
