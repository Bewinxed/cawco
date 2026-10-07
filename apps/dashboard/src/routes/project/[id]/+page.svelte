<script lang="ts">
  /**
   * The project's views (design §2, PRD §5.2): the head with Caw as the
   * lead's face, then the view strip and the view. Board, Table and
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
   */
  import type { ProjectView, ViewData } from "@cawco/core";
  import { untrack } from "svelte";
  import type { TransitionConfig } from "svelte/transition";
  import { toast } from "svelte-sonner";
  import {
    cawco,
    discardView,
    keepView,
    requestView,
    startThread,
    threadsOf,
    viewData,
    viewsOf,
  } from "#lib/cawco/client.svelte.js";
  import Caw from "#lib/cawco/home/Caw.svelte";
  import type { HubRead } from "#lib/cawco/hub-read.js";
  import {
    crossIn,
    crossOut,
    dur,
    motionOk,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { ListSwap } from "#lib/cawco/motion/list-swap.svelte.js";
  import { depart } from "#lib/cawco/motion/share.svelte.js";
  import CawField from "#lib/cawco/project/CawField.svelte";
  import { CawLead } from "#lib/cawco/project/caw-lead.svelte.js";
  import ProjectHead from "#lib/cawco/project/ProjectHead.svelte";
  import {
    createTask,
    firstTodoStage,
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
  } from "#lib/cawco/project-tasks.js";
  import { checkoutOf } from "#lib/cawco/projects.js";
  import NewTaskForm from "#lib/cawco/tasks/NewTaskForm.svelte";
  import StagesControl from "#lib/cawco/tasks/StagesControl.svelte";
  import TaskBoard from "#lib/cawco/tasks/TaskBoard.svelte";
  import TaskSheet from "#lib/cawco/tasks/TaskSheet.svelte";
  import TaskTable from "#lib/cawco/tasks/TaskTable.svelte";
  import { threadHref } from "#lib/cawco/thread-tabs.js";
  import { taskEdges } from "#lib/cawco/views/task-graph.js";
  import ViewA2ui from "#lib/cawco/views/ViewA2ui.svelte";
  import ViewCalendar, {
    calendarField,
  } from "#lib/cawco/views/ViewCalendar.svelte";
  import ViewCanvas from "#lib/cawco/views/ViewCanvas.svelte";
  import ViewPipeline from "#lib/cawco/views/ViewPipeline.svelte";
  import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import {
    IconNeedsYou,
    IconPlus,
    IconSparkles,
    IconToolTodo,
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

  /** A refused read, as a sentence with its status for support. */
  const refusal = (read: HubRead<unknown>): string | null =>
    read.ok ? null : `${read.detail} (${read.status}).`;
  const message = (error: unknown) =>
    error instanceof Error ? error.message : String(error);

  // --- the tasks: what the hub answered, from the load and each re-read ------

  let list = $derived<TaskList | null>(data.tasks.ok ? data.tasks.value : null);
  let listProblem = $derived(refusal(data.tasks));
  let stages = $derived<StagesView | null>(
    data.stages.ok ? data.stages.value : null
  );
  let stagesProblem = $derived(refusal(data.stages));
  let openTask = $derived<string | null>(data.task);
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
      return { ...task, stage, kind, needsYou: kind === "you" };
    })
  );
  const kindById = $derived(new Map(tasks.map((task) => [task.id, task.kind])));
  const needsYou = $derived(tasks.filter((task) => task.kind === "you"));
  /** The filter holds only while something needs you. */
  const filtering = $derived(needsOnly && needsYou.length > 0);
  const shownTasks = $derived(filtering ? needsYou : tasks);
  const shownStages = $derived(
    filtering ? stageList.filter((stage) => stage.kind === "you") : stageList
  );
  const newIn = $derived(firstTodoStage(stageList)?.name);
  const empty = $derived(list !== null && list.tasks.length === 0);

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
  const leadOn = $derived(lead.view?.on === true);

  /** The project's views, kept then drafted, once read. */
  let views = $state<ProjectView[]>([]);
  let viewsRead = $state(false);
  let viewsProblem = $state<string | null>(null);
  /** What views bind to: the tasks with their dates, from the hub. */
  let bound = $state<ViewData | null>(null);

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

  async function readBound() {
    const id = projectId;
    try {
      const read = await viewData(id);
      if (id === projectId) {
        bound = read;
      }
    } catch {
      // Calendar and the views wait for the next read; the board stands.
    }
  }

  /** The date field the calendar places tasks by; null: no Calendar tab. */
  const dateField = $derived(
    calendarField(
      bound?.tasks ?? [],
      stages?.views.find((each) => each.name === "calendar")?.by ?? null
    )
  );
  const dateById = $derived(
    new Map(
      (bound?.tasks ?? []).flatMap((task) => {
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
    // The task graph, while the tasks draw one (an edge between two).
    ...(taskEdges(tasks).length > 0
      ? [{ value: "canvas", label: "Canvas", draft: false }]
      : []),
    ...(dateField
      ? [{ value: "calendar", label: "Calendar", draft: false }]
      : []),
    ...views.map((view) => ({
      value: `view:${view.name}`,
      label: viewLabel(view.name),
      draft: view.draft,
    })),
  ]);
  let tab = $derived(data.view);
  /** The view on screen: the one asked for once it exists, the board meanwhile. */
  const current = $derived(
    tabs.some((each) => each.value === tab) ? tab : "board"
  );
  /** A view the URL names is still being read: its place holds a skeleton. */
  const awaiting = $derived(
    tab.startsWith("view:") && !viewsRead && current !== tab
  );

  /** The view and the open task in the URL, so a link opens the same. */
  function hrefOf(id: string | null, as: string = current): string {
    const query = new URLSearchParams();
    if (as !== "board") {
      query.set("view", as);
    }
    if (id) {
      query.set("task", id);
    }
    const search = query.toString();
    return `/project/${projectId}${search ? `?${search}` : ""}`;
  }

  function remember() {
    if (!browser) {
      return;
    }
    try {
      goto(hrefOf(openTask), { shallow: true, replace: true });
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

  function openOne(id: string) {
    openTask = id;
    remember();
  }

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
    void readBound();
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
      labels: task.labels,
      rank: task.rank,
      type: task.type,
      todos: {
        done: task.todos.filter((todo) => todo.done).length,
        total: task.todos.length,
      },
      updatedAt: Date.now(),
      attempts: task.attempts,
      blockedBy: task.blockedBy,
      lastAttemptFailed: task.lastAttemptFailed,
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
   * A move, shown at once and asked of the hub. A refusal puts the card back
   * where it was, and the hub's sentence (which names the moves that are
   * open) is thrown to whoever asked.
   */
  async function move(
    id: string,
    stage: string,
    source?: HTMLElement
  ): Promise<TaskView> {
    lift(id, source);
    moving = { ...moving, [id]: stage };
    try {
      const task = await moveTask(projectId, id, stage);
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

  function drop(id: string, stage: string, source: HTMLElement) {
    move(id, stage, source).catch((error: unknown) => {
      toast.error(message(error));
    });
  }

  /** The project has stages of its own now; tasks the set lacks are named. */
  function applied(next: StagesView, stranded: string[]) {
    stages = next;
    if (stranded.length > 0) {
      const one = stranded.length === 1;
      toast(
        `${stranded.join(", ")} ${one ? "is in a stage" : "are in stages"} the new set lacks; ${one ? "it stands" : "they stand"} in Other stages until moved.`
      );
    }
    // biome-ignore lint/complexity/noVoid: the re-read sets its own state
    void refresh();
  }

  async function create(title: string, stage: string) {
    const task = await createTask(projectId, { title, stage });
    changed(task);
  }

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

  // --- Ask Caw for a view -------------------------------------------------------

  let stagesOpen = $state(false);
  let stagesAnchor = $state<HTMLElement | null>(null);
  let askOpen = $state(false);
  let askAnchor = $state<HTMLElement | null>(null);
  function ask(anchor: HTMLElement) {
    askAnchor = anchor;
    askOpen = true;
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
      readBound();
      if (list) {
        refresh();
      }
    });
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

  // Another hand may have changed the tasks while the tab was away.
  $effect(() => {
    const back = () => {
      if (document.visibilityState === "visible") {
        // biome-ignore lint/complexity/noVoid: the re-read sets its own state
        void refresh();
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
  /** The empty board with Caw: what he does, in this project's own stages. */
  const cawLine = $derived.by(() => {
    const named = stageList
      .filter((stage) => stage.kind !== "dropped")
      .map((stage) => stageLabel(stage.name).toLowerCase());
    const you = stageList.find((stage) => stage.kind === "you");
    return `Tell Caw what to do and he files the tasks: ${named.join(", ")}.${
      you ? ` One that waits on you shows in ${stageLabel(you.name)}.` : ""
    }`;
  });
  /**
   * New task stands in the strip whenever there is no form for it on the
   * board: a board with tasks, and an empty one Caw's field stands over
   * (an empty board with the lead off holds the form itself).
   */
  const strippedNewTask = $derived(list !== null && (!empty || leadOn));
  /** Something stands after the tabs: the hairline marks where it starts. */
  const trailing = $derived(needsYou.length > 0 || strippedNewTask || leadOn);
  /**
   * Caw stands over the empty board while the lead is on; elsewhere he sits
   * in the head, and the board is drawn — its columns and the new task's
   * form — once a task is being added by hand.
   */
  const standing = $derived(
    empty && leadOn && !adding && !current.startsWith("view:")
  );

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

  /**
   * The empty board's first words to Caw start a thread and open it: the
   * words fly into its first row, and the standing Caw into its composer's
   * seat (the navigation departs him).
   */
  async function firstWords(text: string, id: string) {
    const said = await startThread(projectId, text, id);
    await goto(threadHref(said.thread.id));
  }
</script>

<svelte:head>
  <title>{project?.name ?? "Project"} &middot; CawCo</title>
</svelte:head>

{#snippet pane(
  value: string
)}
  {#if value.startsWith("view:")}
    {@const view = views.find((each) => `view:${each.name}` === value)}
    {#if view && bound}
      <div class="view-pane">
        {#if view.draft}
          <!-- The tab already says `draft`; the bar says what it is and
               offers the two answers, kept together on one row. -->
          <div class="draft-bar" out:crossOut>
            <span class="draft-line"
              >Caw drafted the {viewLabel(view.name)} view</span
            >
            <div class="draft-acts">
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
        {/if}
        <ViewA2ui
          data={bound}
          hrefOf={(id) => hrefOf(id)}
          {kindOf}
          onopen={openOne}
          stages={stageList}
          {tasks}
          {view}
        />
      </div>
    {:else}
      <Skeleton class="h-64 w-full rounded-[var(--radius-lg)]" />
    {/if}
  {:else if !list}
    <div class="state">
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
      <Skeleton class="h-48 w-full max-w-xl rounded-[var(--radius-lg)]" />
    {:else if leadOn}
      <div class="state caw-empty">
        <EmptyState line={cawLine} title="Nothing on the board yet">
          {#snippet mark()}
            <div class="caw-80" data-share="caw:{projectId}" out:sitDown|global>
              <Caw size={80} status="ready" />
            </div>
          {/snippet}
          {#snippet action()}
            <CawField
              flies
              label="Message the project"
              onsend={firstWords}
              placeholder="Message the project…"
            />
          {/snippet}
        </EmptyState>
      </div>
    {:else}
      <div class="state">
        <EmptyState
          icon={IconToolTodo}
          line="Add a task, or turn Caw on to plan it with him."
          title="Nothing on the board yet"
        >
          {#snippet action()}
            <div class="first">
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
    <TaskBoard
      {allowedFrom}
      {dateOf}
      hrefOf={(id) => hrefOf(id)}
      {kindOf}
      {newIn}
      oncreate={create}
      onmove={drop}
      onopen={openOne}
      stages={shownStages}
      tasks={shownTasks}
      bind:adding
    />
  {:else if value === "table"}
    <div class="table-wrap">
      {#if adding}
        <div class="table-new">
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
        stages={stageList}
        tasks={shownTasks}
      />
    </div>
  {:else if value === "pipeline"}
    <ViewPipeline stages={stageList} tasks={shownTasks} />
  {:else if value === "canvas"}
    <ViewCanvas
      hrefOf={(id) => hrefOf(id)}
      {kindOf}
      onopen={openOne}
      tasks={shownTasks}
    />
  {:else if value === "calendar" && dateField && bound}
    <ViewCalendar field={dateField} onopen={openOne} tasks={bound.tasks} />
  {:else}
    <Skeleton class="h-64 w-full rounded-[var(--radius-lg)]" />
  {/if}
{/snippet}

{#if !project}
  <div class="flex flex-1 items-center justify-center p-6">
    <p class="text-body text-muted-foreground">
      No such project. It may have been removed; pick another from the rail.
    </p>
  </div>
{:else}
  <div class="project-page">
    <ProjectHead
      {lead}
      {machine}
      onask={leadOn ? ask : null}
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

    {#if leadOn && lead.view?.problem}
      <Alert class="notice" variant="warning">
        <AlertDescription>{lead.view.problem}</AlertDescription>
      </Alert>
    {/if}
    {#if stages && stages.problems.length > 0}
      <Alert class="notice" variant="warning">
        <AlertDescription>{unreadStages}</AlertDescription>
      </Alert>
    {:else if stagesProblem}
      <Alert class="notice" variant="warning">
        <AlertDescription>
          The project's stages could not be read: {stagesProblem}
        </AlertDescription>
      </Alert>
    {/if}
    {#if list && list.problems.length > 0}
      <Alert class="notice" variant="warning">
        <AlertDescription>{list.problems.join(" ")}</AlertDescription>
      </Alert>
    {/if}
    {#if viewsProblem}
      <Alert class="notice" variant="warning">
        <AlertDescription
          >The project's views could not be read:
          {viewsProblem}</AlertDescription
        >
      </Alert>
    {/if}

    <div class="strip">
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
                  <Badge class="draft-badge" variant="secondary">draft</Badge>
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
          aria-hidden="true"
          class="rule"
          class:wide={needsYou.length === 0}
        ></span>
      {/if}
      <div class="trail">
        {#if needsYou.length > 0}
          <button
            aria-pressed={filtering}
            class="needs pressable"
            onclick={() => {
              needsOnly = !filtering;
            }}
            type="button"
            in:crossIn
            out:crossOut
          >
            <IconNeedsYou aria-hidden="true" />
            Needs you
            <span class="num">{needsYou.length}</span>
          </button>
        {/if}
        {#if strippedNewTask}
          <Button
            class="wide pressable"
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
            New task
          </Button>
        {/if}
        {#if leadOn}
          <Button
            class="wide pressable"
            onclick={(event) => ask(event.currentTarget as HTMLElement)}
            size="sm"
            variant="ghost"
          >
            <IconSparkles />
            Ask Caw for a view
          </Button>
        {/if}
      </div>
    </div>

    <div
      aria-busy={cawco.hub === "unreachable" || awaiting || reading}
      class={[
        "pane",
        current !== "board" &&
          current !== "canvas" &&
          !reading &&
          "kit-edge-fade-block",
      ]}
      data-view={reading ? "board" : current}
    >
      {#if reading}
        <!-- The board at its real layout, its columns standing empty: the
             next project's read cross-fades in over it. -->
        <div aria-hidden="true" class="board-skeleton" out:crossOut>
          {#each stageList.filter(
            (stage) => stage.kind !== "dropped"
          ) as stage (stage.name)}
            <div class="skeleton-column">
              <Skeleton class="h-3.5 w-3/5" />
              <Skeleton class="h-[54px] w-full rounded-[var(--radius-sm)]" />
              <Skeleton class="h-[54px] w-full rounded-[var(--radius-sm)]" />
            </div>
          {/each}
        </div>
      {:else}
        <div class="swap" in:crossIn>
          {#key shown}
            <div
              class="current"
              style="animation:{swap.rowAnim(0, ListSwap.leaveEnd(0))}"
              out:leave
            >
              {#if shown === "awaiting"}
                <Skeleton class="h-64 w-full rounded-[var(--radius-lg)]" />
              {:else}
                {@render pane(shown)}
              {/if}
            </div>
          {/key}
        </div>
      {/if}
    </div>
  </div>

  <Popover.Root bind:open={askOpen}>
    <Popover.Content
      align="end"
      class="w-96"
      customAnchor={askAnchor}
      side="bottom"
    >
      <CawField
        autofocus
        label="Ask Caw for a view"
        onsend={async (text) => {
          await requestView(projectId, text);
          askOpen = false;
        }}
        placeholder="A view of what is scheduled this week…"
      />
    </Popover.Content>
  </Popover.Root>

  <StagesControl
    anchor={stagesAnchor}
    onapplied={applied}
    {projectId}
    bind:open={stagesOpen}
  />

  {#if stages}
    <TaskSheet
      {allowedFrom}
      onchanged={changed}
      onmove={(id, stage) => move(id, stage)}
      {projectId}
      {stages}
      {tasks}
      bind:taskId={
        () => openTask,
        (id) => {
    openTask = id;
    remember();
  }
      }
    />
  {/if}
{/if}

<style>
  .project-page {
    display: flex;
    flex: 1;
    flex-direction: column;
    block-size: 100%;
    min-block-size: 0;
    overflow: hidden;
  }
  .project-page :global(.notice) {
    inline-size: auto;
    margin: 0 var(--space-6) var(--space-3) var(--space-7);
  }
  .strip {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-inline-size: 0;
    padding: 0 var(--space-6) var(--space-4) var(--space-7);
  }
  .strip > :global([data-slot="tabs"]) {
    display: flex;
    flex: 0 1 auto;
    min-inline-size: 0;
  }
  /* The tag stands after the view's name, never over it. */
  .strip :global(.draft-badge) {
    margin-inline-start: var(--space-1);
  }
  .rule {
    flex: none;
    inline-size: 1px;
    block-size: var(--c-btn-h-sm);
    background: var(--border-hairline);
  }
  .trail {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--space-2);
  }
  /* Needs you, as the needs-you tile is: a real button in the needs-you
     tint, never coral (that is where you act). Chosen, the filter is on:
     its edge takes the attention glyph's ink. */
  .needs {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    block-size: var(--c-btn-h-sm);
    padding-inline: var(--space-3);
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    background: var(--status-attn-bg);
    font: var(--type-label);
    color: var(--status-attn-ink);
    transition:
      background-color var(--dur-control) var(--ease-out),
      color var(--dur-control) var(--ease-out),
      border-color var(--dur-control) var(--ease-out);
  }
  .needs :global(svg) {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
    color: var(--status-attn-glyph);
  }
  .needs .num {
    color: var(--status-attn-ink);
  }
  .needs[aria-pressed="true"] {
    border-color: var(--status-attn-glyph);
  }
  .pane {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-block-size: 0;
    padding: 0 var(--space-6) 0 var(--space-7);
    overflow-y: auto;
  }
  /* The board and the canvas fill the pane and scroll (or pan) inside. */
  .pane[data-view="board"],
  .pane[data-view="canvas"] {
    overflow: hidden;
  }
  .pane:not([data-view="board"], [data-view="canvas"]) {
    padding-block-end: var(--space-6);
  }
  .swap {
    position: relative;
    display: flex;
    flex-direction: column;
    min-block-size: 0;
  }
  /* The board while the next project's is read: its grid, empty columns. */
  .board-skeleton {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(15rem, 22rem);
    gap: var(--space-3);
    overflow: hidden;
  }
  .skeleton-column {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2);
    border-radius: var(--radius-lg);
    background: var(--surface-band);
    box-shadow: inset 0 0 0 1px var(--border-hairline);
  }
  @media (max-width: 639px) {
    .board-skeleton {
      grid-auto-columns: calc(100% - var(--space-8));
    }
  }
  .current {
    display: flex;
    flex-direction: column;
    min-block-size: 0;
  }
  .pane[data-view="board"] .swap,
  .pane[data-view="board"] .current,
  .pane[data-view="canvas"] .swap,
  .pane[data-view="canvas"] .current {
    flex: 1 1 auto;
  }
  .pane[data-view="canvas"] {
    padding-block-end: var(--space-5);
  }
  .view-pane {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .draft-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-lg);
    background: var(--surface-band);
    box-shadow: inset 0 0 0 1px var(--border-hairline);
  }
  .draft-line {
    flex: 1 1 14rem;
    min-inline-size: 0;
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .draft-acts {
    display: flex;
    flex: none;
    gap: var(--space-2);
  }
  .state {
    max-inline-size: 72ch;
  }
  .caw-empty {
    margin-inline: auto;
    max-inline-size: 36rem;
  }
  .caw-empty :global(.kit-empty) {
    align-items: center;
    text-align: center;
  }
  .caw-empty :global(.kit-empty-action) {
    align-self: stretch;
  }
  .caw-80 {
    display: grid;
    place-items: center;
    margin-block-end: var(--space-3);
  }
  .first {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--space-2);
  }
  .table-wrap {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .table-new {
    max-inline-size: 36rem;
    padding: var(--space-3);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
  }
  @media (max-width: 899px) {
    .strip,
    .pane {
      padding-inline: var(--space-5);
    }
    .project-page :global(.notice) {
      margin-inline: var(--space-5);
    }
  }
  /* New task and Ask Caw for a view move into the head's ⋯ on a phone. */
  @media (max-width: 639px) {
    .trail :global(.wide),
    .rule.wide {
      display: none;
    }
  }
</style>
