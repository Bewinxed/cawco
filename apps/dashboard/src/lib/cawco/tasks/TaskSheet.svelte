<script lang="ts">
  import { rowHref } from "#lib/cawco/links.js";
  /**
   * A task, whole, in the side sheet: its title, stage, description,
   * acceptance criteria, to-dos, edges and attempts. Every change is the
   * hub's to make (each is a commit in the project folder), so each waits
   * for the hub's answer and shows the task as the hub wrote it back; a
   * refusal is said beside what it refused, in the hub's own words.
   *
   * The stage picker offers the moves the project's stages allow you from
   * where the task is; the rest are listed, disabled, so the stages read in
   * order. The hub checks the move again either way.
   */
  import {
    addTodo,
    attemptWord,
    changeTodo,
    flagsOf,
    linkTask,
    readTask,
    retryTask,
    type StagesView,
    stageLabel,
    type TaskEdge,
    type TaskSummary,
    type TaskView,
    updateTask,
  } from "#lib/cawco/project-tasks.js";
  import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
  import { Badge, type BadgeVariant } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Select from "#lib/components/ui/select/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Sheet from "#lib/components/ui/sheet/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import {
    IconClose,
    IconError,
    IconLock,
    IconNeedsYou,
    IconWorking,
  } from "#lib/icons.js";
  import TextSection from "./TextSection.svelte";
  import TodoList from "./TodoList.svelte";

  let {
    projectId,
    taskId = $bindable(null),
    stages,
    tasks,
    allowedFrom,
    onmove,
    onchanged,
  }: {
    projectId: string;
    /** The task the sheet shows; null closes it. */
    taskId?: string | null;
    stages: StagesView;
    /** Every task, for naming edges and picking them. */
    tasks: TaskSummary[];
    allowedFrom: (stage: string) => Set<string>;
    /** Moves the task, as the board does (it owns the card's flight); throws the hub's refusal. */
    onmove: (taskId: string, stage: string) => Promise<TaskView>;
    /** The hub wrote the task: the list is read again. */
    onchanged: (task: TaskView) => void;
  } = $props();

  let task = $state<TaskView | null>(null);
  let readProblem = $state<string | null>(null);
  let stageProblem = $state<string | null>(null);
  let edgeProblem = $state<string | null>(null);
  let titleDraft = $state<string | null>(null);
  let titleProblem = $state<string | null>(null);
  let moving = $state(false);
  let retrying = $state(false);
  let retryProblem = $state<string | null>(null);
  let sheet = $state<HTMLElement | null>(null);

  const summary = $derived(tasks.find((each) => each.id === taskId) ?? null);
  const byId = $derived(new Map(tasks.map((each) => [each.id, each])));
  /** What the sheet can say before the file is read: the list's row. */
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

  const message = (error: unknown) =>
    error instanceof Error ? error.message : String(error);

  let readFor = "";
  $effect(() => {
    const id = taskId;
    if (!id || readFor === id) {
      return;
    }
    readFor = id;
    // biome-ignore lint/complexity/noVoid: fire-and-forget — the read sets its own state
    void read(id);
  });
  $effect(() => {
    if (!taskId) {
      readFor = "";
      titleDraft = null;
      stageProblem = null;
      edgeProblem = null;
      titleProblem = null;
      retryProblem = null;
    }
  });

  async function read(id: string) {
    readProblem = null;
    try {
      const fresh = await readTask(projectId, id);
      if (taskId === id) {
        task = fresh;
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

  async function move(stage: string) {
    if (!shown || stage === shown.stage) {
      return;
    }
    moving = true;
    stageProblem = null;
    try {
      task = await onmove(shown.id, stage);
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

  /** A fresh attempt at a task whose last one failed; it reports to the project's lead. */
  async function retry() {
    if (!shown) {
      return;
    }
    const { id } = shown;
    retrying = true;
    retryProblem = null;
    try {
      await retryTask(projectId, id);
      const fresh = await readTask(projectId, id);
      if (taskId === id) {
        took(fresh);
      }
    } catch (error) {
      retryProblem = message(error);
    } finally {
      retrying = false;
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
    <span class="ref-id">{id}</span>
    {#if titleOf(id)}
      <span class="ref-title">{titleOf(id)}</span>
    {/if}
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

<Sheet.Root
  bind:open={
    () => taskId !== null,
    (open) => {
    if (!open) {
      taskId = null;
    }
  }
  }
>
  <!-- Focus goes to the sheet itself, not its first control: the close
       button would otherwise open ringed, as if the keyboard had put it
       there. Tab walks in from the top. -->
  <Sheet.Content
    class="task-sheet gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
    onOpenAutoFocus={(event) => {
      event.preventDefault();
      sheet?.focus({ preventScroll: true });
    }}
    side="right"
    bind:ref={sheet}
  >
    <Sheet.Header class="head">
      <div class="meta">
        <span class="id">{taskId}</span>
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
        <Sheet.Title class="title">
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
        </Sheet.Title>
      {/if}
      {#if titleProblem}
        <p class="problem" role="alert">{titleProblem}</p>
      {/if}
      {#if stageProblem}
        <p class="problem" role="alert">{stageProblem}</p>
      {/if}
      {#if shown?.needsYou ||
        flags.live ||
        flags.failed ||
        flags.queued ||
        flags.blockedBy.length > 0 ||
        (shown?.labels.length ?? 0) > 0}
        <div class="flags">
          {#if shown?.needsYou}
            <Badge variant="attn"><IconNeedsYou />Needs you</Badge>
          {/if}
          {#if flags.live}
            <Badge variant="live"><IconWorking />Working</Badge>
          {:else if flags.failed}
            <Badge variant="fail"><IconError />Last attempt failed</Badge>
          {:else if flags.queued}
            <Badge variant="secondary">Queued</Badge>
          {/if}
          {#if flags.blockedBy.length > 0}
            <Badge variant="secondary"
              ><IconLock />Waits on {flags.blockedBy.join(", ")}</Badge
            >
          {/if}
          {#each shown?.labels ?? [] as label (label)}
            <Badge variant="secondary">{label}</Badge>
          {/each}
        </div>
      {/if}
      <Sheet.Description class="sr-only">
        The task's description, acceptance criteria, to-dos, edges and attempts.
      </Sheet.Description>
    </Sheet.Header>

    <div class="body">
      {#if readProblem}
        <Alert variant="destructive">
          <AlertDescription>
            {readProblem}
            <Button
              class="mt-2"
              onclick={() => taskId && read(taskId)}
              size="sm"
              variant="outline"
              >Retry</Button
            >
          </AlertDescription>
        </Alert>
      {:else if !shown}
        <div aria-hidden="true" class="skeleton">
          <Skeleton class="h-4 w-1/3" />
          <Skeleton class="h-3.5 w-full" />
          <Skeleton class="h-3.5 w-11/12" />
          <Skeleton class="h-3.5 w-3/5" />
          <Skeleton class="mt-4 h-4 w-1/4" />
          <Skeleton class="h-[var(--c-btn-h-sm)] w-full" />
          <Skeleton class="h-[var(--c-btn-h-sm)] w-full" />
        </div>
      {:else}
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
          {#if edgeProblem}
            <p class="problem" role="alert">{edgeProblem}</p>
          {/if}
          <div class="edge">
            <span class="edge-name">After</span>
            <div class="edge-list">
              {#each shown.after as id (id)}
                {@render ref(id, () => link("after", id, true))}
              {/each}
              {@render pick(
                shown.after.length > 0
                  ? "Add another"
                  : "Add a task it waits on",
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
            {#if flags.startProblem}
              <p class="problem" role="alert">{flags.startProblem}</p>
            {/if}
            {#if flags.failed && !flags.live}
              <div class="retry">
                <Button
                  disabled={retrying}
                  onclick={retry}
                  size="sm"
                  variant="outline"
                  >Retry</Button
                >
                {#if retryProblem}
                  <p class="problem" role="alert">{retryProblem}</p>
                {/if}
              </div>
            {/if}
            <ol class="attempts">
              {#each shown.attempts as attempt, index (attempt.workItemId)}
                {@const word = attemptWord(attempt.state)}
                <li class="attempt">
                  <a
                    class="attempt-name focus-inset"
                    href={rowHref(attempt.instanceId)}
                    >Attempt {shown.attempts.length - index}</a
                  >
                  <Badge variant={TINT[word] ?? "secondary"}>{word}</Badge>
                  <span class="attempt-when"
                    >{when(attempt.endedAt ?? attempt.startedAt)}</span
                  >
                </li>
              {/each}
            </ol>
          </section>
        {/if}

        <p class="path" title="The task's file in the project folder">
          {shown.path}
        </p>
      {/if}
    </div>
  </Sheet.Content>
</Sheet.Root>

<style>
  /* The sheet takes focus as a container, not as a control: no ring. */
  :global(.task-sheet:focus-visible) {
    outline: none;
  }
  :global(.task-sheet) :global(.head) {
    gap: var(--space-2);
    padding: var(--space-5) var(--space-5) var(--space-3);
    border-block-end: 1px solid var(--border-hairline);
  }
  .meta {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding-inline-end: var(--space-8);
  }
  .id {
    font: var(--type-meta);
    font-family: var(--font-mono);
    font-variant-ligatures: none;
    color: var(--ink-subtle);
  }
  :global(.task-sheet) :global(.title) {
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
  .body {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: var(--space-5);
    min-block-size: 0;
    padding: var(--space-4) var(--space-5) var(--space-6);
    overflow-y: auto;
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
    padding-inline: var(--space-2) var(--space-1);
    border-radius: var(--radius-sm);
    background: var(--surface-recess);
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
  .retry {
    display: flex;
    flex-direction: column;
    align-items: start;
    gap: var(--space-1);
  }
  .path {
    margin-block-start: auto;
    font: var(--type-meta);
    font-family: var(--font-mono);
    font-variant-ligatures: none;
    color: var(--ink-subtle);
    overflow-wrap: anywhere;
  }
  .problem {
    font: var(--type-meta);
    color: var(--error-11);
  }
</style>
