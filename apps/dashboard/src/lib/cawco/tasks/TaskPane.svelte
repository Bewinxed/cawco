<script lang="ts">
  /**
   * A task, whole, in the page beside what it was opened from (DESIGN.md,
   * The Open Page Rule): on a desk the side card of a split (Split, through
   * the project page or a conversation's SideSplit), the board or the
   * transcript live beside it; on a phone its own page, with Back.
   *
   * First what it needs from you, with the way to act (TaskNeeds); then its
   * stage, title, description, acceptance criteria, to-dos, edges and
   * attempts; then what happened on it (TaskActivity: outputs, comments,
   * history). Every change is the hub's to make (each is a commit in the
   * project folder), so each waits for the hub's answer and shows the task
   * as the hub wrote it back; a refusal is said beside what it refused, in
   * the hub's own words. The task is read again whenever the list says it
   * changed, so a move made anywhere shows here.
   *
   * The stage picker offers the moves the project's stages allow you from
   * where the task is; the rest are listed, disabled, so the stages read in
   * order. The hub checks the move again either way.
   */
  import type { Snippet } from "svelte";
  import { failureWords as message } from "#lib/cawco/hub-read.js";
  import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
  import { Badge, type BadgeVariant } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Select from "#lib/components/ui/select/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import {
    IconChevronLeft,
    IconClose,
    IconError,
    IconNeedsYou,
    IconWorking,
  } from "#lib/icons.js";
  import { formatDistanceToNow, formatTimestamp } from "#lib/utils/time.js";
  import { rowHref } from "../links";
  import {
    addTodo,
    attemptWord,
    changeTodo,
    flagsOf,
    linkTask,
    readTask,
    type StagesView,
    stageLabel,
    type TaskEdge,
    type TaskSummary,
    type TaskView,
    updateTask,
  } from "../project-tasks";
  import RowFault from "../RowFault.svelte";
  import SideSurface from "../side/SideSurface.svelte";
  import TaskActivity from "./TaskActivity.svelte";
  import TaskNeeds from "./TaskNeeds.svelte";
  import TextSection from "./TextSection.svelte";
  import TodoList from "./TodoList.svelte";

  let {
    projectId,
    taskId,
    stages,
    tasks,
    allowedFrom,
    onmove,
    onchanged,
    onclose,
    onopen,
    page = false,
    backLabel = "Back",
    switcher,
  }: {
    projectId: string;
    /** The task on show. */
    taskId: string;
    stages: StagesView;
    /** Every task, for naming edges and picking them. */
    tasks: TaskSummary[];
    allowedFrom: (stage: string) => Set<string>;
    /** Moves the task, as the board does (it owns the card's flight); throws the hub's refusal. */
    onmove: (taskId: string, stage: string) => Promise<TaskView>;
    /** The hub wrote the task: the list is read again. */
    onchanged: (task: TaskView) => void;
    /** Close on a desk; Back on a phone. */
    onclose: () => void;
    /** Shows another task in this one's place (an edge, a blocker). */
    onopen: (id: string) => void;
    /** A phone: the task is its own page, with Back, not a card beside the board. */
    page?: boolean;
    /** What Back says on a phone's page. */
    backLabel?: string;
    /** The switch between what stands beside a conversation (SideSplit). */
    switcher?: Snippet;
  } = $props();

  let task = $state<TaskView | null>(null);
  /** Bumped on every write and read: outputs and history are read again. */
  let version = $state(0);
  let readProblem = $state<string | null>(null);
  let stageProblem = $state<string | null>(null);
  let edgeProblem = $state<string | null>(null);
  let titleDraft = $state<string | null>(null);
  let titleProblem = $state<string | null>(null);
  let moving = $state(false);

  const summary = $derived(tasks.find((each) => each.id === taskId) ?? null);
  const byId = $derived(new Map(tasks.map((each) => [each.id, each])));
  /** What can be said before the file is read: the list's row. */
  const shown = $derived(task?.id === taskId ? task : null);
  const flags = $derived.by(() => {
    const known = shown ?? summary;
    return known
      ? flagsOf(known)
      : {
          live: false,
          failed: false,
          queued: false,
          startProblem: null,
          blockedBy: [] as string[],
        };
  });
  const allowed = $derived(
    shown ? allowedFrom(shown.stage) : new Set<string>()
  );
  const others = $derived(
    tasks.filter(
      (each) =>
        each.id !== taskId &&
        !shown?.after.includes(each.id) &&
        each.id !== shown?.parent
    )
  );

  // A new task starts clean, and is read.
  let readFor = "";
  $effect(() => {
    const id = taskId;
    if (readFor === id) {
      return;
    }
    readFor = id;
    titleDraft = null;
    stageProblem = null;
    edgeProblem = null;
    titleProblem = null;
    // biome-ignore lint/complexity/noVoid: fire-and-forget — the read sets its own state
    void read(id);
  });
  // The list says it changed (a move, a comment, an attempt, from anywhere):
  // the file is read again.
  $effect(() => {
    const at = summary?.updatedAt;
    const stage = summary?.stage;
    if (
      shown &&
      at !== undefined &&
      (at > shown.updatedAt || (stage !== undefined && stage !== shown.stage))
    ) {
      // biome-ignore lint/complexity/noVoid: the read sets its own state
      void read(shown.id);
    }
  });

  async function read(id: string) {
    readProblem = null;
    try {
      const fresh = await readTask(projectId, id);
      if (taskId === id) {
        task = fresh;
        version += 1;
      }
    } catch (error) {
      if (taskId === id) {
        readProblem = message(error);
      }
    }
  }

  /** Every write answers with the task as the hub wrote it. */
  function took(next: TaskView) {
    task = next;
    version += 1;
    onchanged(next);
  }

  async function saveTitle() {
    if (!shown || titleDraft === null) {
      return;
    }
    const text = titleDraft.trim();
    if (!text || text === shown.title) {
      titleDraft = null;
      return;
    }
    titleProblem = null;
    try {
      took(await updateTask(projectId, shown.id, { title: text }));
      titleDraft = null;
    } catch (error) {
      titleProblem = message(error);
    }
  }

  /** A move, through the page that owns the card's flight; the moved task is shown. */
  async function moveTo(stage: string): Promise<TaskView> {
    if (!shown) {
      throw new Error("The task is still being read.");
    }
    const moved = await onmove(shown.id, stage);
    if (moved.id === taskId) {
      task = moved;
      version += 1;
    }
    return moved;
  }

  async function move(stage: string) {
    if (!shown || stage === shown.stage) {
      return;
    }
    moving = true;
    stageProblem = null;
    try {
      await moveTo(stage);
    } catch (error) {
      stageProblem = message(error);
    } finally {
      moving = false;
    }
  }

  async function link(edge: TaskEdge, to: string, remove = false) {
    if (!shown) {
      return;
    }
    edgeProblem = null;
    try {
      took(await linkTask(projectId, shown.id, { edge, to, remove }));
    } catch (error) {
      edgeProblem = message(error);
    }
  }

  /** An attempt's status word takes its status tint; anything else has none. */
  const TINT: Record<string, BadgeVariant> = {
    Working: "live",
    "Needs you": "attn",
    Done: "done",
    Failed: "fail",
  };

  const titleOf = (id: string) => byId.get(id)?.title;
  const when = (at: number) => new Date(at).toLocaleString();
</script>

{#snippet ref(
  id: string,
  remove?: () => void
)}
  <span class="ref">
    <button
      class="ref-open press-tint focus-inset"
      onclick={() => onopen(id)}
      title="Show {id}"
      type="button"
    >
      <span class="ref-id">{id}</span>
      {#if titleOf(id)}
        <span class="ref-title">{titleOf(id)}</span>
      {/if}
    </button>
    {#if remove}
      <Button
        aria-label="Remove {id}"
        class="ml-auto"
        onclick={remove}
        size="icon-xs"
        variant="ghost"
      >
        <IconClose />
      </Button>
    {/if}
  </span>
{/snippet}

{#snippet pick(
  label: string,
  edge: TaskEdge
)}
  {#if others.length > 0}
    <Select.Root
      onValueChange={(value) => {
        if (value) {
          link(edge, value);
        }
      }}
      type="single"
      value=""
    >
      <Select.Trigger
        aria-label={label}
        class="self-start text-muted-foreground"
        size="sm"
      >
        {label}
      </Select.Trigger>
      <Select.Content>
        {#each others as other (other.id)}
          <Select.Item label="{other.id} {other.title}" value={other.id}>
            <span class="font-mono text-muted-foreground">{other.id}</span>
            <span class="truncate">{other.title}</span>
          </Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
  {/if}
{/snippet}

{#snippet content()}
  <div class="task-body" data-task-pane={taskId}>
    <header class="head">
      <div class="meta">
        {#if shown}
          <Select.Root
            disabled={moving}
            onValueChange={move}
            type="single"
            value={shown.stage}
          >
            <Select.Trigger aria-label="Stage" press="tint" size="sm">
              {stageLabel(shown.stage)}
            </Select.Trigger>
            <Select.Content>
              {#each stages.stages as stage (stage.name)}
                <Select.Item
                  disabled={stage.name !== shown.stage &&
                    !allowed.has(stage.name)}
                  label={stageLabel(stage.name)}
                  value={stage.name}
                >
                  <span>{stageLabel(stage.name)}</span>
                  {#if stage.kind === "you"}
                    <IconNeedsYou class="text-[var(--status-attn-glyph)]" />
                  {/if}
                </Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
          <span class="dates">
            Created
            <time
              datetime={new Date(shown.createdAt).toISOString()}
              title={when(shown.createdAt)}
              >{formatTimestamp(new Date(shown.createdAt))}</time
            >
            · Updated
            <time
              datetime={new Date(shown.updatedAt).toISOString()}
              title={when(shown.updatedAt)}
              >{formatDistanceToNow(new Date(shown.updatedAt))}</time
            >
          </span>
        {:else}
          <Skeleton class="h-[var(--c-btn-h-sm)] w-24" />
        {/if}
      </div>
      {#if titleDraft !== null}
        <form
          onsubmit={(event) => {
            event.preventDefault();
            saveTitle();
          }}
        >
          <Input
            aria-label="Title"
            autocomplete="off"
            class="text-title"
            onblur={saveTitle}
            onkeydown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                titleDraft = null;
                titleProblem = null;
              }
            }}
            bind:value={titleDraft}
            {@attach (node) => node.focus()}
          />
        </form>
      {:else}
        <h2 class="title">
          <button
            class="title-button press-tint focus-inset"
            disabled={!shown}
            onclick={() => {
              titleDraft = shown?.title ?? "";
            }}
            title="Edit the title"
            type="button"
          >
            {shown?.title ?? summary?.title ?? ""}
          </button>
        </h2>
      {/if}
      <RowFault again={saveTitle} reason={titleProblem} />
      <RowFault reason={stageProblem} />
      {#if flags.live || flags.queued || (shown?.labels.length ?? 0) > 0}
        <div class="flags">
          {#if flags.live}
            <Badge variant="live"><IconWorking />Working</Badge>
          {:else if flags.queued}
            <Badge variant="secondary">Queued</Badge>
          {/if}
          {#each shown?.labels ?? [] as label (label)}
            <Badge variant="secondary">{label}</Badge>
          {/each}
        </div>
      {/if}
    </header>

    {#if readProblem}
      <Alert variant="destructive">
        <AlertDescription>
          {readProblem}
          <Button
            class="mt-2"
            onclick={() => read(taskId)}
            size="sm"
            variant="outline"
            >Retry</Button
          >
        </AlertDescription>
      </Alert>
    {:else if !shown}
      <div aria-hidden="true" class="skeleton">
        <Skeleton class="h-24 w-full rounded-[var(--radius-md)]" />
        <Skeleton class="mt-2 h-4 w-1/3" />
        <Skeleton class="h-3.5 w-full" />
        <Skeleton class="h-3.5 w-11/12" />
        <Skeleton class="h-3.5 w-3/5" />
      </div>
    {:else}
      <TaskNeeds
        onchanged={took}
        onmove={moveTo}
        {onopen}
        {projectId}
        {stages}
        task={shown}
        {tasks}
        {version}
      />

      {#if shown.problems.length > 0}
        <Alert variant="warning">
          <AlertDescription>{shown.problems.join(" ")}</AlertDescription>
        </Alert>
      {/if}

      <TextSection
        empty="Say what this task is for, so a session picking it up starts from it."
        heading="Description"
        onsave={async (description) => {
          if (shown) {
            took(await updateTask(projectId, shown.id, { description }));
          }
        }}
        text={shown.description}
      />

      <TextSection
        empty="List what has to be true for this task to count as done."
        heading="Acceptance criteria"
        onsave={async (acceptance) => {
          if (shown) {
            took(await updateTask(projectId, shown.id, { acceptance }));
          }
        }}
        text={shown.acceptance}
      />

      <TodoList
        onadd={async (text, under) => {
          if (shown) {
            took(await addTodo(projectId, shown.id, { text, under }));
          }
        }}
        onedit={async (todo, text) => {
          if (shown) {
            took(await changeTodo(projectId, shown.id, todo, { text }));
          }
        }}
        ontick={async (todo, done) => {
          if (shown) {
            took(await changeTodo(projectId, shown.id, todo, { done }));
          }
        }}
        todos={shown.todos}
      />

      <section class="part">
        <h3 class="kit-section-head">Edges</h3>
        <RowFault reason={edgeProblem} />
        <div class="edge">
          <span class="edge-name">After</span>
          <div class="edge-list">
            {#each shown.after as id (id)}
              {@render ref(id, () => link("after", id, true))}
            {/each}
            {@render pick(
              shown.after.length > 0 ? "Add another" : "Add a task it waits on",
              "after"
            )}
          </div>
        </div>
        <div class="edge">
          <span class="edge-name">Parent</span>
          <div class="edge-list">
            {#if shown.parent}
              {@render ref(shown.parent, () =>
                link("parent", shown?.parent ?? "", true)
              )}
            {:else}
              {@render pick("Set a parent", "parent")}
            {/if}
          </div>
        </div>
        {#if shown.related.length > 0}
          <div class="edge">
            <span class="edge-name">Related</span>
            <div class="edge-list">
              {#each shown.related as id (id)}
                {@render ref(id)}
              {/each}
            </div>
          </div>
        {/if}
      </section>

      {#if shown.attempts.length > 0 || flags.startProblem}
        <section class="part">
          <h3 class="kit-section-head">
            Attempts
            {#if shown.attempts.length > 0}
              <span class="count num">{shown.attempts.length}</span>
            {/if}
          </h3>
          <RowFault reason={flags.startProblem} />
          <ol class="attempts">
            {#each shown.attempts as attempt, index (attempt.workItemId)}
              {@const word = attemptWord(attempt.state)}
              <li class="attempt">
                <a
                  class="attempt-name focus-inset"
                  href={rowHref(attempt.instanceId)}
                  >Attempt {shown.attempts.length - index}</a
                >
                <Badge variant={TINT[word] ?? "secondary"}>
                  {#if word === "Failed"}
                    <IconError />
                  {/if}
                  {word}
                </Badge>
                <span class="attempt-when"
                  >{when(attempt.endedAt ?? attempt.startedAt)}</span
                >
              </li>
            {/each}
          </ol>
        </section>
      {/if}

      <TaskActivity
        onchanged={took}
        outputs={shown.kind !== "you"}
        {projectId}
        task={shown}
        {version}
      />

      <p class="path" title="The task's file in the project folder">
        {shown.path}
      </p>
    {/if}
  </div>
{/snippet}

{#if page}
  <section aria-label="Task {taskId}" class="task-page">
    <header class="page-head">
      <Button onclick={onclose} size="sm" variant="ghost">
        <IconChevronLeft />
        {backLabel}
      </Button>
      <span class="page-id">{taskId}</span>
    </header>
    {@render content()}
  </section>
{:else}
  <SideSurface
    class="task-card"
    label="Task {taskId}"
    {onclose}
    recessed={false}
    {switcher}
    title={switcher ? undefined : taskId}
  >
    {@render content()}
  </SideSurface>
{/if}

<style>
  .task-page {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-block-size: 0;
  }
  .page-head {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--space-2);
    padding: 0 var(--space-5) var(--space-2) var(--space-3);
  }
  .page-id {
    margin-inline-start: auto;
    font: var(--type-meta);
    font-family: var(--font-mono);
    font-variant-ligatures: none;
    color: var(--ink-subtle);
  }
  .task-body {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: var(--space-5);
    min-block-size: 0;
    padding: var(--space-2) var(--space-3) var(--space-6);
    overflow-y: auto;
  }
  .task-page .task-body {
    padding-inline: var(--space-5);
  }
  .head {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  .dates {
    font: var(--type-meta);
    color: var(--ink-muted);
    white-space: nowrap;
  }
  .title {
    margin: 0;
    font: var(--type-title);
    letter-spacing: var(--track-title);
  }
  .title-button {
    display: block;
    inline-size: 100%;
    margin-inline: calc(var(--space-1) * -1);
    padding: var(--space-1);
    border-radius: var(--radius-sm);
    font: inherit;
    color: var(--ink-strong);
    text-align: start;
    text-wrap: balance;
  }
  @media (hover: hover) and (pointer: fine) {
    .title-button:hover:not(:disabled) {
      background: var(--surface-hover);
    }
  }
  .flags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }
  .skeleton {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .part {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .part :global(.kit-section-head) {
    min-block-size: var(--c-btn-h-xs);
    margin: 0;
    padding-inline: 0;
  }
  .edge {
    display: grid;
    grid-template-columns: 4.5rem minmax(0, 1fr);
    align-items: start;
    gap: var(--space-2);
  }
  .edge-name {
    padding-block-start: var(--space-1);
    font: var(--type-label);
    color: var(--ink-muted);
  }
  .edge-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-inline-size: 0;
  }
  .ref {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-block-size: var(--c-btn-h-sm);
    min-inline-size: 0;
    padding-inline: 0 var(--space-1);
    border-radius: var(--radius-sm);
    background: var(--surface-recess);
  }
  .ref-open {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    gap: var(--space-2);
    min-inline-size: 0;
    min-block-size: var(--c-btn-h-sm);
    padding-inline: var(--space-2);
    border-radius: var(--radius-sm);
    text-align: start;
  }
  .ref-id {
    flex: none;
    font: var(--type-meta);
    font-family: var(--font-mono);
    font-variant-ligatures: none;
    color: var(--ink-muted);
  }
  .ref-title {
    min-inline-size: 0;
    overflow: hidden;
    font: var(--type-label);
    color: var(--ink-strong);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .attempts {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .attempt {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--surface-recess);
  }
  .attempt-name {
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .attempt-when {
    margin-inline-start: auto;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .path {
    margin-block-start: auto;
    margin-block-end: 0;
    font: var(--type-meta);
    font-family: var(--font-mono);
    font-variant-ligatures: none;
    color: var(--ink-subtle);
    overflow-wrap: anywhere;
  }
</style>
