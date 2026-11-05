<script lang="ts" module>
  export type TaskView = "board" | "table";
  export type TaskFilter = "all" | "needs" | "working" | "stuck";
</script>

<script lang="ts">
  /**
   * Tasks (TOM tasks 3, 10, 11, 12, 14), reached from Home and returning
   * to it. Its first line is the view switch (Board, Table, Calendar,
   * Dependencies: the last two said muted until a task carries a date or
   * waits on another); then the saved filters as chips with their counts,
   * and the search with its narrowing chips, all carried in the link. The
   * board's columns are the project's stages, Archive the last with its
   * count; the first stage opens with the inline composer (title, stage,
   * Enter files it and stays open), the hub's refusal under it in its own
   * words. On a phone, one stage a screen under the stages as a strip.
   */
  import { homeFirstWords as words } from "@cawco/core/words/proto-home-first";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import Skeleton from "#lib/components/ui/skeleton/skeleton.svelte";
  import * as Table from "#lib/components/ui/table/index.js";
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
  import {
    IconAdd,
    IconCalendar,
    IconColumns,
    IconListRows,
    IconStructure,
  } from "#lib/icons.js";
  import type { Stage, Task } from "./model";
  import ProjectFrame from "./ProjectFrame.svelte";
  import StagesList from "./StagesList.svelte";
  import TaskCard from "./TaskCard.svelte";
  import TaskPaneBody from "./TaskPaneBody.svelte";

  let {
    project,
    stages,
    tasks,
    archive,
    view = "board",
    filter = "all",
    read = "live",
    staleAt,
    failedStage,
    composer = "",
    refusal,
    phoneStage,
    openTask,
    moreOpen = false,
    onopen,
  }: {
    project: string;
    stages: Stage[];
    tasks: Task[];
    archive: number;
    view?: TaskView;
    filter?: TaskFilter;
    read?: "live" | "loading" | "stale";
    staleAt?: string;
    /** One stage's read failed: which, and the hub's reason. */
    failedStage?: { id: string; why: string };
    /** What is typed in the composer. */
    composer?: string;
    /** The hub refused the last task filed, in its words. */
    refusal?: string;
    /** On a phone, the stage on screen; the first by default. */
    phoneStage?: string;
    /** The task open in its pane, by title. */
    openTask?: string;
    moreOpen?: boolean;
    onopen?: (task: Task | null) => void;
  } = $props();

  const stale = $derived(read === "stale");
  const matches = (task: Task, by: TaskFilter): boolean => {
    if (by === "needs") {
      return task.needsYou === true;
    }
    if (by === "working") {
      return task.state === "working" || task.state === "asks";
    }
    if (by === "stuck") {
      return task.state === "stuck" || task.state === "failed";
    }
    return true;
  };
  const total = $derived(stages.reduce((sum, stage) => sum + stage.count, 0));
  const FILTERS: TaskFilter[] = ["all", "needs", "working", "stuck"];
  const countOf = (by: TaskFilter) =>
    by === "all" ? total : tasks.filter((task) => matches(task, by)).length;
  const shown = $derived(tasks.filter((task) => matches(task, filter)));
  const inStage = (id: string) => shown.filter((task) => task.stage === id);
  const onPhone = $derived(phoneStage ?? stages[0]?.id);
  const hasDates = $derived(tasks.some((task) => task.due));
  const stageName = (id: string) =>
    stages.find((stage) => stage.id === id)?.name ?? id;
</script>

{#snippet composerBox()}
  <div
    class="flex flex-col gap-space-2 rounded-md bg-surface-raised p-space-2 shadow-tile"
  >
    <Input
      aria-label={words.tasks.composer}
      disabled={stale}
      placeholder={words.tasks.composer}
      value={composer}
    />
    <div class="mark-line flex items-center gap-space-2 px-space-1">
      <span class="type-meta text-ink-muted">{words.tasks.composerStage}</span>
      <button
        class={chipVariants({ variant: "setting" })}
        data-box
        disabled={stale}
        type="button"
      >
        <span data-slot="chip-label">{stages[0]?.name}</span>
      </button>
      <span class="ms-auto type-meta text-ink-muted"
        >{words.tasks.composerHint}</span
      >
    </div>
    {#if refusal}
      <p
        class="m-0 px-space-1 type-meta text-status-fail-ink text-pretty"
        role="alert"
      >
        {refusal}
      </p>
    {/if}
  </div>
{/snippet}

{#snippet column(stage: Stage, first: boolean)}
  <section
    class="flex w-full min-w-0 flex-col gap-space-2 @min-desk/shell:w-c-board-col-min @min-desk/shell:flex-none"
    aria-label={stage.name}
  >
    <h2
      class="mark-line m-0 flex min-h-c-section-head-h items-center gap-space-2 px-space-1 type-label text-ink-strong"
    >
      {#if stage.kind === "you" && stage.count > 0}
        <span
          aria-hidden="true"
          class="size-(--status-dot-size) flex-none rounded-pill bg-status-attn-glyph"
          data-box
        ></span>
      {/if}
      <span>{stage.name}</span>
      {#if stage.count > 0}
        <span class="type-meta font-normal text-ink-muted tabular-nums"
          >{stage.count}</span
        >
      {/if}
    </h2>
    {#if first && read !== "loading"}
      {@render composerBox()}
    {/if}
    {#if read === "loading"}
      {#each [0, 1, 2] as i (i)}
        <Skeleton height="card" radius="tile" />
      {/each}
    {:else if failedStage?.id === stage.id}
      <p
        class="m-0 rounded-md bg-surface-raised p-space-3 type-meta text-ink-strong text-pretty shadow-tile"
      >
        {words.tasks.stageFailed(failedStage.why)}
        <button
          class="text-link-ink underline-offset-2 hover:underline"
          type="button">{words.retry}</button
        >
      </p>
    {:else}
      <ul
        class="m-0 flex list-none flex-col gap-space-2 p-0"
        {@attach reflow()}
      >
        {#each inStage(stage.id) as task (task.id)}
          <TaskCard onopen={(t) => onopen?.(t)} {stale} {task} />
        {/each}
      </ul>
      {#if stage.count > inStage(stage.id).length && filter === "all"}
        <p class="m-0 px-space-1 type-meta text-ink-muted tabular-nums">
          + {stage.count - inStage(stage.id).length}
        </p>
      {/if}
    {/if}
  </section>
{/snippet}

<ProjectFrame
  action={{ label: words.bar.addTask, icon: IconAdd, compact: true }}
  more={[
    words.more.select,
    words.more.askView,
    words.more.configure,
    words.more.wiring,
  ]}
  {moreOpen}
  onclosepane={() => onopen?.(null)}
  pane={openTask ? taskPane : undefined}
  paneClose={words.taskPane.close}
  paneForm="over"
  paneTitle={openTask}
  {project}
  title={words.places.tasks}
>
  <div class="flex min-w-0 flex-col gap-space-4">
    <!-- The first line: the view switch, then the saved filters. -->
    <div
      class="flex flex-col gap-space-3 @min-wide/shell:flex-row @min-wide/shell:items-center"
    >
      <div
        class="-mx-space-4 overflow-x-auto px-space-4 @min-desk/shell:mx-0 @min-desk/shell:px-0"
      >
        <ToggleGroup.Root type="single" value={view}>
          <ToggleGroup.Item aria-label={words.tasks.views.board} value="board">
            <IconColumns aria-hidden="true" />
            <span>{words.tasks.views.board}</span>
          </ToggleGroup.Item>
          <ToggleGroup.Item aria-label={words.tasks.views.table} value="table">
            <IconListRows aria-hidden="true" />
            <span>{words.tasks.views.table}</span>
          </ToggleGroup.Item>
          <ToggleGroup.Item
            aria-label={hasDates
              ? words.tasks.views.calendar
              : `${words.tasks.views.calendar}: ${words.tasks.viewIdle.calendar}`}
            title={hasDates ? undefined : words.tasks.viewIdle.calendar}
            value="calendar"
          >
            <IconCalendar aria-hidden="true" />
            <span class={hasDates ? undefined : "text-ink-subtle"}
              >{words.tasks.views.calendar}</span
            >
          </ToggleGroup.Item>
          <ToggleGroup.Item
            aria-label={`${words.tasks.views.dependencies}: ${words.tasks.viewIdle.dependencies}`}
            title={words.tasks.viewIdle.dependencies}
            value="dependencies"
          >
            <IconStructure aria-hidden="true" />
            <span class="text-ink-subtle">{words.tasks.views.dependencies}</span
            >
          </ToggleGroup.Item>
        </ToggleGroup.Root>
      </div>
      <ul
        class="m-0 flex list-none gap-space-2 overflow-x-auto p-0 @min-wide/shell:ms-space-2"
      >
        {#each FILTERS as by (by)}
          <li class="flex-none">
            <button
              aria-pressed={filter === by}
              class={chipVariants({ variant: "option" })}
              type="button"
            >
              <span>{words.tasks.filters[by]}</span>
              {#if countOf(by) > 0}
                <span class="type-meta text-ink-muted tabular-nums"
                  >{countOf(by)}</span
                >
              {/if}
            </button>
          </li>
        {/each}
        <li class="flex-none">
          <button class={chipVariants({ variant: "option" })} type="button">
            <IconAdd aria-hidden="true" class="size-icon-sm" />
            <span>{words.tasks.filters.save}</span>
          </button>
        </li>
      </ul>
    </div>

    <!-- The search and its narrowing chips, kept in the link. -->
    <div class="flex flex-wrap items-center gap-space-2">
      <div class="w-full @min-desk/shell:w-c-pop-w">
        <Input
          aria-label={words.tasks.search}
          placeholder={words.tasks.search}
          type="search"
        />
      </div>
      {#each [words.tasks.chips.label, words.tasks.chips.stage, words.tasks.chips.type] as chip (chip)}
        <button class={chipVariants({ variant: "setting" })} type="button">
          <span data-slot="chip-label">{chip}</span>
        </button>
      {/each}
    </div>

    {#if stale}
      <p class="m-0 type-meta text-ink-muted">
        {words.staleSince(staleAt ?? "")}. {words.tasks.movesOff}
      </p>
    {/if}

    {#if view === "table"}
      <div
        class="@container/table overflow-x-auto rounded-lg bg-surface-raised shadow-tile"
      >
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>{words.tasks.columns.task}</Table.Head>
              <Table.Head>{words.tasks.columns.stage}</Table.Head>
              <Table.Head>{words.tasks.columns.type}</Table.Head>
              <Table.Head>{words.tasks.columns.todos}</Table.Head>
              <Table.Head>{words.tasks.columns.changed}</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each shown as task (task.id)}
              <Table.Row>
                <Table.Cell>
                  <span class="type-label text-ink-row">{task.title}</span>
                </Table.Cell>
                <Table.Cell>{stageName(task.stage)}</Table.Cell>
                <Table.Cell>{task.type ?? ""}</Table.Cell>
                <Table.Cell>
                  {#if task.todos}{words.work.todos(
                      task.todos[0],
                      task.todos[1]
                    )}{/if}
                </Table.Cell>
                <Table.Cell>{task.changed}</Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </div>
    {:else}
      <!-- On a phone: the stages as the pager's index, one stage a screen. -->
      <div class="flex flex-col gap-space-3 @min-desk/shell:hidden">
        <StagesList {archive} form="chips" {stages} {stale} />
        {#each stages.filter((stage) => stage.id === onPhone) as stage (stage.id)}
          <!-- The stage handed along the strip comes a nudge from its side. -->
          <div
            class="transition-[opacity,translate] duration-(--dur-panel) ease-drawer starting:translate-x-(--swap-nudge) starting:opacity-0"
          >
            {@render column(stage, stage.id === stages[0]?.id)}
          </div>
        {/each}
      </div>
      <div
        class="hidden gap-space-3 overflow-x-auto pb-space-4 @min-desk/shell:flex"
      >
        {#each stages as stage, i (stage.id)}
          {@render column(stage, i === 0)}
        {/each}
        <section
          class="flex w-c-board-col-min flex-none flex-col gap-space-2"
          aria-label={words.tasks.archive}
        >
          <h2
            class="m-0 flex min-h-c-section-head-h items-center gap-space-2 px-space-1 type-label text-ink-muted"
          >
            <span>{words.tasks.archive}</span>
            {#if archive > 0}
              <span class="type-meta font-normal tabular-nums">{archive}</span>
            {/if}
          </h2>
        </section>
      </div>
    {/if}
  </div>
</ProjectFrame>

{#snippet taskPane()}
  <TaskPaneBody title={openTask ?? ""} />
{/snippet}
