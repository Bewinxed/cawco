<script lang="ts">
  /**
   * A project's tasks (§5.2 of the Projects spec): every task file in the
   * project folder, as a board by stage or as a table, with the task itself
   * in a side sheet. The hub owns every change — each is a commit — so the
   * page shows what the hub answered and reads the list again after each of
   * its own writes, and again whenever the tab comes back into view (a
   * session may have moved tasks meanwhile).
   *
   * Needs you is a filter, not a stage: the tasks whose stage is of kind
   * `you`, worked out from the list the hub sends.
   */
  import { toast } from "svelte-sonner";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import type { HubRead } from "#lib/cawco/hub-read.js";
  import { crossIn, crossOut } from "#lib/cawco/motion/curves.svelte.js";
  import { depart } from "#lib/cawco/motion/share.svelte.js";
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
  import NewTaskForm from "#lib/cawco/tasks/NewTaskForm.svelte";
  import StagesControl from "#lib/cawco/tasks/StagesControl.svelte";
  import TaskBoard from "#lib/cawco/tasks/TaskBoard.svelte";
  import TaskSheet from "#lib/cawco/tasks/TaskSheet.svelte";
  import TaskTable from "#lib/cawco/tasks/TaskTable.svelte";
  import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Tabs from "#lib/components/ui/tabs/index.js";
  import { IconNeedsYou, IconPlus, IconToolTodo } from "#lib/icons.js";
  import { browser } from "$app/env";
  import { goto } from "$app/navigation";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const project = $derived(
    (data.project && cawco.project(data.project.id)) ?? data.project
  );
  const projectId = $derived(data.project?.id ?? "");

  /** A refused read, as a sentence with its status for support. */
  const refusal = (read: HubRead<unknown>): string | null =>
    read.ok ? null : `${read.detail} (${read.status}).`;
  const message = (error: unknown) =>
    error instanceof Error ? error.message : String(error);

  // What the hub answered, from the page's load and then from each re-read.
  let list = $derived<TaskList | null>(data.tasks.ok ? data.tasks.value : null);
  let listProblem = $derived(refusal(data.tasks));
  let stages = $derived<StagesView | null>(
    data.stages.ok ? data.stages.value : null
  );
  let stagesProblem = $derived(refusal(data.stages));

  let view = $derived<"board" | "table">(data.view);
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

  /** The view and the open task live in the URL, so a link opens the same. */
  function hrefOf(id: string | null, as: "board" | "table" = view): string {
    const query = new URLSearchParams();
    if (as === "table") {
      query.set("view", "table");
    }
    if (id) {
      query.set("task", id);
    }
    const search = query.toString();
    return `/project/${projectId}/tasks${search ? `?${search}` : ""}`;
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

  function openOne(id: string) {
    openTask = id;
    remember();
  }

  async function refresh() {
    const id = projectId;
    const [read, readStagesNow] = await Promise.allSettled([
      listTasks(id),
      readStages(id),
    ]);
    if (id !== projectId) {
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

  /** The error empty: what should be here, why it is not, and the retry beside it. */
  const unreadLine = $derived(
    `The tasks for ${project?.name ?? "this project"} could not be read: ${
      listProblem ?? "the hub did not answer."
    } Nothing was changed.`
  );
  /** stages.md is there and does not read: what is wrong, what still holds, the fix. */
  const unreadStages = $derived(
    `stages.md in the project folder does not read: ${(stages?.problems ?? []).join(" ")} Tasks keep their stages meanwhile; fix the file and the board takes its columns from it.`
  );
  /** The first-use empty: what the board does, naming this project's own stages. */
  const firstLine = $derived(
    `Each task moves through this project's stages (${stageList
      .filter((stage) => stage.kind !== "dropped")
      .map((stage) => stageLabel(stage.name).toLowerCase())
      .join(
        ", "
      )}), and one that waits on you shows in Needs you. Add the first to start the board.`
  );

  const stagesLine = $derived.by(() => {
    if (!stages || stages.problems.length > 0) {
      return null;
    }
    if (stages.source === "template") {
      return "code stages, standing in";
    }
    return stages.template ? `${stages.template} stages` : "its own stages";
  });
</script>

<svelte:head>
  <title>Tasks &middot; {project?.name ?? "Project"} &middot; CawCo</title>
</svelte:head>

{#if !project}
  <div class="flex flex-1 items-center justify-center p-6">
    <p class="text-body text-muted-foreground">
      No such project. It may have been removed; pick another from the rail.
    </p>
  </div>
{:else}
  <div class="tasks-page">
    <header class="page-head">
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <h1 class="text-title">Tasks</h1>
        <p class="line">
          <a class="project-link" href="/project/{project.id}"
            >{project.name}</a
          >
          {#if list}
            <span aria-hidden="true">&middot;</span>
            <span class="num"
              >{list.tasks.length}
              {list.tasks.length === 1 ? "task" : "tasks"}</span
            >
          {/if}
          {#if stagesLine}
            <span aria-hidden="true">&middot;</span>
            <span>{stagesLine}</span>
          {/if}
        </p>
      </div>
      <div class="actions">
        {#if stages?.source === "template"}
          <StagesControl onapplied={applied} {projectId} />
        {/if}
        {#if list && !empty}
          <Button
            class="pressable"
            onclick={() => {
              adding = true;
            }}
          >
            <IconPlus />
            New task
          </Button>
        {/if}
      </div>
    </header>

    {#if list && !empty}
      <div class="toolbar">
        <Tabs.Root
          onValueChange={(value) => {
            view = value === "table" ? "table" : "board";
            remember();
          }}
          value={view}
        >
          <Tabs.List aria-label="View">
            <Tabs.Trigger value="board">Board</Tabs.Trigger>
            <Tabs.Trigger value="table">Table</Tabs.Trigger>
          </Tabs.List>
        </Tabs.Root>
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
      </div>
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

    <div class="body" data-view={view}>
      {#if !list}
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
      {:else if empty}
        <div class="state">
          <EmptyState
            icon={IconToolTodo}
            line={firstLine}
            title="Plan {project.name}'s work as tasks"
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
      {:else if view === "board"}
        <TaskBoard
          {allowedFrom}
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
      {:else}
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
      {/if}
    </div>
  </div>

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
  .tasks-page {
    display: flex;
    flex: 1;
    flex-direction: column;
    block-size: 100%;
    min-block-size: 0;
    overflow: hidden;
  }
  .page-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-4);
    padding: var(--space-6) var(--space-6) var(--space-4) var(--space-7);
  }
  .actions {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--space-2);
  }
  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-1) var(--space-2);
    font: var(--type-label);
    color: var(--ink-muted);
  }
  .project-link {
    color: var(--link-ink);
    text-decoration: none;
  }
  @media (hover: hover) {
    .project-link:hover {
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
    padding: 0 var(--space-6) var(--space-4) var(--space-7);
  }
  /* Needs you, as the needs-you tile is: a real button, chosen in the
     needs-you tint, never coral (that is where you act). */
  .needs {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    block-size: var(--c-btn-h-sm);
    padding-inline: var(--space-3);
    border: 1px solid var(--border-control);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
    font: var(--type-label);
    color: var(--ink-strong);
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
    color: var(--ink-muted);
  }
  @media (hover: hover) and (pointer: fine) {
    .needs:hover {
      background: var(--surface-hover);
    }
  }
  .needs[aria-pressed="true"] {
    border-color: transparent;
    background: var(--status-attn-bg);
    color: var(--status-attn-ink);
  }
  .needs[aria-pressed="true"] :global(svg),
  .needs[aria-pressed="true"] .num {
    color: var(--status-attn-ink);
  }
  .tasks-page :global(.notice) {
    inline-size: auto;
    margin: 0 var(--space-6) var(--space-3) var(--space-7);
  }
  .body {
    flex: 1 1 auto;
    min-block-size: 0;
    padding: 0 var(--space-6) 0 var(--space-7);
  }
  .body[data-view="table"] {
    overflow-y: auto;
    padding-block-end: var(--space-6);
  }
  .state {
    max-inline-size: 72ch;
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
    .page-head {
      padding: var(--space-5) var(--space-5) var(--space-3);
    }
    .toolbar,
    .body {
      padding-inline: var(--space-5);
    }
    .tasks-page :global(.notice) {
      margin-inline: var(--space-5);
    }
  }
</style>
