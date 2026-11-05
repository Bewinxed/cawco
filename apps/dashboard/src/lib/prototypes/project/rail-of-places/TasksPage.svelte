<script lang="ts" module>
  export type TasksView = "board" | "table" | "calendar" | "dependencies";
</script>

<script lang="ts">
  /**
   * Tasks: its first line is the view switch and the narrowing (search and
   * the label, stage and delegate type chips), kept in the link and the
   * same for every view. Board is the stages as columns, the inline
   * composer at the top of the first, Archive last with its count; Table is
   * the same tasks as a ledger; Dependencies lists what waits on what.
   * Calendar and Dependencies stand muted, with the reason, until a task
   * carries a date or an edge. Under the desk line the board is one stage
   * per screen, swiped, under a strip of the stages that is its index.
   */
  import { railOfPlacesWords as w } from "@cawco/core/words/rail-of-places";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import * as InputGroup from "#lib/components/ui/input-group/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import * as Table from "#lib/components/ui/table/index.js";
  import * as Tabs from "#lib/components/ui/tabs/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import {
    IconAgent,
    IconArchive,
    IconChevronDown,
    IconSearch,
  } from "#lib/icons.js";
  import type { Project, Read, Task } from "./model";
  import StaleNote from "./StaleNote.svelte";
  import TaskCard from "./TaskCard.svelte";

  let {
    project,
    read,
    view = "board",
    stage = null,
    composing = false,
    onopen,
    onaskcaw,
  }: {
    project: Project;
    read: Read;
    view?: TasksView;
    /** The stage the phone's pager stands on. */
    stage?: string | null;
    composing?: boolean;
    onopen: (id: string) => void;
    onaskcaw: () => void;
  } = $props();

  let viewNow = $derived<string>(view);
  let filed = $derived<Task[]>([]);
  let draft = $state("");
  let pager = $state<HTMLElement | null>(null);

  const reading = $derived(read.status === "loading");
  const stale = $derived(read.stale !== null);
  const empty = $derived(project.tasks.length + filed.length === 0);
  const showComposer = $derived((composing || empty) && !stale);
  const first = $derived(project.stages[0]);
  const tasks = $derived([...filed, ...project.tasks]);
  const byStage = $derived(
    Object.fromEntries(
      project.stages.map((one) => [
        one.key,
        tasks.filter((task) => task.stage === one.key),
      ])
    )
  );
  const chains = $derived(
    Object.entries(
      Object.groupBy(
        tasks.filter((task) => task.waitsOn),
        (task) => task.waitsOn ?? ""
      )
    )
  );

  function file(event: SubmitEvent) {
    event.preventDefault();
    const title = draft.trim();
    if (!(title && first)) {
      return;
    }
    filed = [
      {
        id: `tsk-${project.tasks.length + filed.length + 1}`,
        title,
        stage: first.key,
        changed: "just now",
      },
      ...filed,
    ];
    draft = "";
  }

  function toStage(key: string) {
    const index = project.stages.findIndex((one) => one.key === key);
    if (pager && index >= 0) {
      pager.scrollTo({ left: index * pager.clientWidth, behavior: "smooth" });
    }
  }

  $effect(() => {
    if (stage) {
      toStage(stage);
    }
  });
</script>

<div class="flex flex-col gap-space-group">
  {#if stale && read.stale}
    <StaleNote since={read.stale} />
  {/if}
  <div class="flex flex-wrap items-center gap-space-3">
    <div
      class="max-desk:-mx-space-1 max-desk:w-full max-desk:overflow-x-auto max-desk:no-scrollbar"
    >
      <Tabs.Root bind:value={viewNow}>
        <Tabs.List>
          <Tabs.Trigger value="board">{w.views.board}</Tabs.Trigger>
          <Tabs.Trigger value="table">{w.views.table}</Tabs.Trigger>
          <Tip label={w.noDates} disabled={project.hasDates}>
            {#snippet children(props)}
              <span {...props}>
                <Tabs.Trigger value="calendar" disabled={!project.hasDates}
                  >{w.views.calendar}</Tabs.Trigger
                >
              </span>
            {/snippet}
          </Tip>
          <Tip label={w.noEdges} disabled={project.hasEdges}>
            {#snippet children(props)}
              <span {...props}>
                <Tabs.Trigger value="dependencies" disabled={!project.hasEdges}
                  >{w.views.dependencies}</Tabs.Trigger
                >
              </span>
            {/snippet}
          </Tip>
        </Tabs.List>
      </Tabs.Root>
    </div>
    <div class="flex min-w-0 flex-1 flex-wrap items-center gap-space-2">
      <div class="min-w-0 flex-1 desk:max-w-c-page-column-w">
        <InputGroup.Root>
          <InputGroup.Addon>
            <IconSearch
              class="size-icon-md text-ink-muted"
              aria-hidden="true"
            />
          </InputGroup.Addon>
          <InputGroup.Input
            type="search"
            placeholder={w.searchTasks}
            aria-label={w.searchTasks}
          />
        </InputGroup.Root>
      </div>
      {#each [w.filters.label, w.filters.stage, w.filters.type] as chip (chip)}
        <Button variant="outline" size="sm" class="flex-none">
          {chip}<IconChevronDown
            class="size-icon-sm text-ink-muted"
            aria-hidden="true"
          />
        </Button>
      {/each}
    </div>
  </div>

  {#if viewNow === "table"}
    <div class="rounded-lg bg-surface-raised shadow-tile">
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>{w.columns.task}</Table.Head>
            <Table.Head>{w.columns.stage}</Table.Head>
            <Table.Head>{w.columns.type}</Table.Head>
            <Table.Head>{w.columns.todos}</Table.Head>
            <Table.Head>{w.columns.changed}</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each tasks as task (task.id)}
            <Table.Row>
              <Table.Cell>
                <button
                  type="button"
                  class="focus-inset flex min-w-0 items-baseline gap-space-2 text-start hover:underline"
                  onclick={() => onopen(task.id)}
                >
                  <span
                    class="w-c-task-col-id-w flex-none type-meta num text-ink-muted"
                    >{task.id}</span
                  >
                  <span class="type-label text-ink-row">{task.title}</span>
                </button>
              </Table.Cell>
              <Table.Cell>
                {project.stages.find((one) => one.key === task.stage)?.name}
              </Table.Cell>
              <Table.Cell>{task.type ?? ""}</Table.Cell>
              <Table.Cell>
                {task.todos ? `${task.todos[0]}/${task.todos[1]}` : ""}
              </Table.Cell>
              <Table.Cell>{task.changed ?? ""}</Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </div>
  {:else if viewNow === "dependencies"}
    <ul class="flex flex-col gap-space-group">
      {#each chains as [blocker, waiting] (blocker)}
        <li class="rounded-lg bg-surface-raised p-space-3 shadow-tile">
          <p class="px-space-2 pb-space-2 type-label text-ink-strong">
            {blocker}
          </p>
          <ul
            class="flex flex-col gap-space-1 border-s border-border-hairline ms-space-4 ps-space-3"
          >
            {#each waiting ?? [] as task (task.id)}
              <li>
                <button
                  type="button"
                  class="press-tint focus-inset flex w-full items-baseline gap-space-2 rounded-sm px-space-2 py-space-1 text-start hover:bg-surface-hover"
                  onclick={() => onopen(task.id)}
                >
                  <span
                    class="w-c-task-col-id-w flex-none type-meta num text-ink-muted"
                    >{task.id}</span
                  >
                  <span class="type-body text-ink-row">{task.title}</span>
                </button>
              </li>
            {/each}
          </ul>
        </li>
      {/each}
    </ul>
  {:else}
    <nav
      class="-mx-space-1 overflow-x-auto no-scrollbar desk:hidden"
      aria-label={w.stagesGroup}
    >
      <ul class="flex w-max gap-space-1">
        {#each project.stages as one (one.key)}
          {@const count = byStage[one.key]?.length ?? 0}
          <li>
            <button
              type="button"
              class="press-tint focus-inset touch-hit mark-line flex h-c-btn-h-sm items-center gap-space-2 rounded-sm px-space-2 hover:bg-surface-hover"
              onclick={() => toStage(one.key)}
            >
              <span class="type-label whitespace-nowrap text-ink-row"
                >{one.name}</span
              >
              {#if count > 0 && !reading}
                <span class="type-meta num text-ink-muted">{count}</span>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    </nav>
    <div
      bind:this={pager}
      class="-mx-space-1 flex snap-x snap-mandatory gap-space-4 overflow-x-auto px-space-1 pb-space-3 max-desk:gap-0"
    >
      {#each project.stages as one, index (one.key)}
        {@const cards = byStage[one.key] ?? []}
        {@const unread = read.unread.includes(`stage:${one.key}`)}
        <section
          class="flex w-c-board-col-min flex-none snap-start flex-col gap-space-2 max-desk:w-full max-desk:px-space-1"
          aria-label={one.name}
        >
          <h2
            class="mark-line flex h-c-section-head-h items-center gap-space-2 px-space-1"
          >
            <span class="type-label text-ink-strong">{one.name}</span>
            {#if one.kind === "you" && cards.length > 0 && !stale}
              <span
                class="size-(--status-dot-size) rounded-pill bg-status-attn-glyph"
                data-box
                aria-hidden="true"
              ></span>
            {/if}
            {#if cards.length > 0 && !reading && !unread}
              <span class="type-meta num text-ink-muted">{cards.length}</span>
            {/if}
          </h2>
          {#if index === 0 && showComposer}
            <form
              class="flex flex-col gap-space-2 rounded-md bg-surface-raised p-space-2 shadow-tile"
              onsubmit={file}
            >
              <Input
                aria-label={w.composerTitle}
                bind:value={draft}
                placeholder={w.composerTitle}
                autocomplete="off"
              />
              <div class="flex items-center justify-between gap-space-2">
                <span class="type-meta text-ink-muted"
                  >{w.filesInto(one.name)}</span
                >
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  disabled={draft.trim() === ""}>{w.fileTask}</Button
                >
              </div>
            </form>
          {/if}
          {#if index === 0 && empty && !reading}
            <Button
              variant="ghost"
              size="sm"
              icon={IconAgent}
              label={w.startStarter}
              align="row"
              onclick={onaskcaw}
            />
          {/if}
          {#if reading}
            {#each [0, 1, 2] as row (row)}
              <Skeleton height="row" radius="tile" />
            {/each}
          {:else if unread}
            <p
              class="rounded-md bg-surface-recess p-space-3 type-meta text-ink-muted"
            >
              {w.stageUnread(one.name)}
            </p>
          {:else}
            <ul class="flex flex-col gap-space-2" {@attach reflow()}>
              {#each cards as task (task.id)}
                <li><TaskCard {task} held={stale} {onopen} /></li>
              {/each}
            </ul>
          {/if}
        </section>
      {/each}
      <section
        class="flex w-c-board-col-min flex-none snap-start flex-col gap-space-2 max-desk:w-full max-desk:px-space-1"
        aria-label={w.archive}
      >
        <h2
          class="mark-line flex h-c-section-head-h items-center gap-space-2 px-space-1"
        >
          <IconArchive class="size-icon-md text-ink-muted" aria-hidden="true" />
          <span class="type-label text-ink-strong">{w.archive}</span>
          {#if project.archived > 0}
            <span class="type-meta num text-ink-muted">{project.archived}</span>
          {/if}
        </h2>
        <p class="px-space-1 type-meta text-ink-muted">{w.bringBack}</p>
      </section>
    </div>
  {/if}
</div>
