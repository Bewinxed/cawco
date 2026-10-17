<script lang="ts">
  /**
   * A task, whole, in the page beside what it was opened from (DESIGN.md,
   * The Open Page Rule): on a desk the side card of a split (Split, through
   * the project page or a conversation's SideSplit), the board or the
   * transcript live beside it; on a phone its own page, with Back.
   *
   * Its head stands still: the facts line (its stage, Working or Queued,
   * its dates, its labels at the end), then its title; under it a Review ·
   * Details switch, while there is a review: the task waits on you, a
   * session handed in a result, it names outputs, or its newest session
   * failed or was stopped. Review is TaskReview's fixed bands, where only
   * the stage scrolls; it opens there. Details scroll: what else it needs
   * from you (TaskNeeds), its description, acceptance criteria, to-dos,
   * edges and the sessions that worked it, then what happened on it
   * (TaskActivity: comments, history). Every change is the hub's to make
   * (each is a commit in the project folder), so each waits for the hub's
   * answer and shows the task
   * as the hub wrote it back; a refusal is said beside what it refused, in
   * the hub's own words. The task is read again whenever the list says it
   * changed, so a move made anywhere shows here.
   *
   * The stage picker offers the moves the project's stages allow you from
   * where the task is; the rest are listed, disabled, so the stages read in
   * order. The hub checks the move again either way.
   */
  import { DECIDED_FIELD, decidedOf } from "@cawco/core/decisions";
  import type { Snippet } from "svelte";
  import { readDecision } from "#lib/cawco/decisions/decisions-api.js";
  import { failureWords as message } from "#lib/cawco/hub-read.js";
  import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
  import { Badge, type BadgeVariant } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Select from "#lib/components/ui/select/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import {
    IconChevronLeft,
    IconError,
    IconNeedsYou,
    IconWorking,
  } from "#lib/icons.js";
  import { formatDistanceToNow, formatTimestamp } from "#lib/utils/time.js";
  import { cawco } from "../client.svelte";
  import { rowHref } from "../links";
  import {
    addComment,
    addTodo,
    attemptWord,
    changeTodo,
    flagsOf,
    linkTask,
    readHistory,
    readTask,
    reviewOf,
    type StagesView,
    stageLabel,
    type TaskEdge,
    type TaskHistoryEvent,
    type TaskSummary,
    type TaskView,
    updateTask,
  } from "../project-tasks";
  import RowFault from "../RowFault.svelte";
  import SessionMark from "../SessionMark.svelte";
  import SideSurface from "../side/SideSurface.svelte";
  import type { MarkStatus } from "../TreeMark.svelte";
  import { openBeside } from "./beside.svelte";
  import { resultStamp } from "./review-stamp";
  import { sessionName } from "./session-name";
  import TaskActivity from "./TaskActivity.svelte";
  import TaskFields from "./TaskFields.svelte";
  import TaskLabels from "./TaskLabels.svelte";
  import TaskNeeds from "./TaskNeeds.svelte";
  import TaskRelations from "./TaskRelations.svelte";
  import TaskReview from "./TaskReview.svelte";
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
  /** Its file's commits, for the activity; null while they are read. */
  let history = $state<TaskHistoryEvent[] | null>(null);
  let historyProblem = $state<string | null>(null);
  let readProblem = $state<string | null>(null);
  let stageProblem = $state<string | null>(null);
  let edgeProblem = $state<string | null>(null);
  let titleDraft = $state<string | null>(null);
  let titleProblem = $state<string | null>(null);
  let moving = $state(false);

  const summary = $derived(tasks.find((each) => each.id === taskId) ?? null);
  /** What can be said before the file is read: the list's row. */
  const shown = $derived(task?.id === taskId ? task : null);
  const flags = $derived.by(() => {
    const known = shown ?? summary;
    return known
      ? flagsOf(known)
      : {
          live: false,
          failed: false,
          stopped: false,
          queued: false,
          startProblem: null,
          blockedBy: [] as string[],
        };
  });
  const allowed = $derived(
    shown ? allowedFrom(shown.stage) : new Set<string>()
  );
  /** Every label the project's tasks carry, offered when one is added. */
  const known = $derived(
    [...new Set(tasks.flatMap((each) => each.labels))].sort()
  );
  /** Its own fields; `decided` is said as its own line under the title. */
  const fields = $derived(
    Object.fromEntries(
      Object.entries(shown?.extra ?? {}).filter(
        ([key]) => key !== DECIDED_FIELD
      )
    )
  );
  /** Where a comment goes past the file (TaskActivity `reaches`). */
  const reaches = $derived.by(() => {
    const attempts = shown?.attempts ?? [];
    const live = attempts.find(
      (attempt) => attempt.state === "starting" || attempt.state === "running"
    );
    if (live) {
      return { kind: "live" as const, session: sessionName(live.instanceId) };
    }
    const open = shown?.kind !== "done" && shown?.kind !== "dropped";
    return attempts.length > 0 && open ? { kind: "resumes" as const } : null;
  });

  /**
   * It has a review to draw: it waits on you, it has a result or outputs,
   * or its newest session failed or was stopped (Try again is there).
   */
  const reviewable = $derived(
    !!shown &&
      (shown.kind === "you" ||
        reviewOf(shown) !== null ||
        ((flags.failed || flags.stopped) && !flags.live))
  );
  /** The switch's choice; null: Review while there is one, else Details. */
  let picked = $state<"review" | "details" | null>(null);
  const view = $derived(picked ?? (reviewable ? "review" : "details"));

  // A new task starts clean, and is read.
  let readFor = "";
  $effect(() => {
    const id = taskId;
    if (readFor === id) {
      return;
    }
    readFor = id;
    picked = null;
    history = null;
    titleDraft = null;
    stageProblem = null;
    edgeProblem = null;
    titleProblem = null;
    // biome-ignore lint/complexity/noVoid: fire-and-forget — the read sets its own state
    void read(id);
  });
  // The list says it changed (a move, a comment, an attempt or its result,
  // from anywhere): the file is read again.
  $effect(() => {
    const at = summary?.updatedAt;
    const stage = summary?.stage;
    if (
      shown &&
      summary &&
      at !== undefined &&
      (at > shown.updatedAt ||
        (stage !== undefined && stage !== shown.stage) ||
        resultStamp(summary) !== resultStamp(shown))
    ) {
      // biome-ignore lint/complexity/noVoid: the read sets its own state
      void read(shown.id);
    }
  });

  async function read(id: string) {
    readProblem = null;
    // biome-ignore lint/complexity/noVoid: the history reads beside the task and sets its own state
    void readActivity(id);
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

  /** Its file's history; a refusal is said over the activity, in the hub's words. */
  async function readActivity(id: string) {
    historyProblem = null;
    try {
      const answered = await readHistory(projectId, id);
      if (taskId === id) {
        history = answered.events;
      }
    } catch (error) {
      if (taskId === id) {
        historyProblem = message(error);
      }
    }
  }

  /** Every write answers with the task as the hub wrote it, and is a commit in its history. */
  function took(next: TaskView) {
    task = next;
    onchanged(next);
    // biome-ignore lint/complexity/noVoid: the history reads again and sets its own state
    void readActivity(next.id);
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
      // biome-ignore lint/complexity/noVoid: the move is a commit in its history
      void readActivity(moved.id);
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

  /** A session's status word takes its status tint; anything else has none. */
  const TINT: Record<string, BadgeVariant> = {
    Working: "live",
    "Needs you": "attn",
    Done: "done",
    Failed: "fail",
  };
  /** And its mark the same tone. */
  const TONE: Record<string, MarkStatus> = {
    Working: "live",
    "Needs you": "attn",
    Done: "done",
    Failed: "fail",
  };

  const when = (at: number) => new Date(at).toLocaleString();

  /**
   * The decision this task was made from (its `decided: <page>#<card>`
   * field, hub decisions.ts): the page's title and the card's question, as
   * its record has them, and the way to that card on the Decisions tab.
   */
  let decided = $state<{
    href: string;
    page: string;
    question: string | null;
  } | null>(null);
  $effect(() => {
    const field = shown?.extra[DECIDED_FIELD];
    const named = decidedOf(typeof field === "string" ? field : null);
    decided = null;
    if (!named) {
      return;
    }
    const href = `/project/${encodeURIComponent(projectId)}?view=decisions&page=${encodeURIComponent(named.page)}#${encodeURIComponent(named.card)}`;
    let live = true;
    readDecision(projectId, named.page)
      .then((found) => {
        if (live) {
          decided = {
            href,
            page: found.title,
            question:
              found.record?.cards.find((card) => card.id === named.card)
                ?.question ?? null,
          };
        }
      })
      .catch(() => {
        // The page is gone or did not read: the pane names no decision.
      });
    return () => {
      live = false;
    };
  });
</script>

{#snippet content()}
  <div class="task-frame" data-task-pane={taskId}>
    <header data-slot="head" class="head">
      <div data-slot="meta" class="meta">
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
          {#if flags.live}
            <Badge variant="live"><IconWorking /><span>Working</span></Badge>
          {:else if flags.queued}
            <Badge variant="secondary"><span>Queued</span></Badge>
          {/if}
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
          {#if shown.labels.length > 0}
            <!-- Its labels, as the board's card draws them: facts at the
                 line's end, never a row of their own. -->
            <span class="labels">
              {#each shown.labels as label (label)}
                <Badge variant="secondary"><span>{label}</span></Badge>
              {/each}
            </span>
          {/if}
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
        <h2 data-slot="title" class="title">
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
      {#if decided}
        <p data-slot="decided" class="decided">
          Decided on <a href={decided.href}
            >{decided.question
              ? `${decided.page} › ${decided.question}`
              : decided.page}</a
          >
        </p>
      {/if}
      <RowFault reason={stageProblem} />
      {#if reviewable}
        <Tabs
          onValueChange={(next) => {
            picked = next === "details" ? "details" : "review";
          }}
          size="compact"
          value={view}
        >
          <TabsList aria-label="Review or details">
            <TabItem label="Review" value="review" />
            <TabItem label="Details" value="details" />
          </TabsList>
        </Tabs>
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
            variant="outline">Retry</Button
          >
        </AlertDescription>
      </Alert>
    {:else if !shown}
      <div data-slot="task-pane-skeleton" aria-hidden="true" class="skeleton">
        <Skeleton class="h-24 w-full rounded-[var(--radius-md)]" />
        <Skeleton class="mt-2 h-4 w-1/3" />
        <Skeleton class="h-3.5 w-full" />
        <Skeleton class="h-3.5 w-11/12" />
        <Skeleton class="h-3.5 w-3/5" />
      </div>
    {:else if view === "review"}
      <TaskReview
        onchanged={took}
        onmove={moveTo}
        {projectId}
        {stages}
        task={shown}
      />
    {:else}
      <div data-slot="task-body" class="task-body">
        <TaskNeeds
          ended={false}
          onchanged={took}
          {onopen}
          {projectId}
          task={shown}
          {tasks}
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
          <h3 class="kit-section-head">Labels</h3>
          <TaskLabels
            {known}
            labels={shown.labels}
            onchange={async (labels) => {
              if (shown) {
                took(await updateTask(projectId, shown.id, { labels }));
              }
            }}
          />
        </section>

        <TaskFields
          {fields}
          onsave={async (change) => {
            if (shown) {
              took(await updateTask(projectId, shown.id, { fields: change }));
            }
          }}
        />

        <div class="part">
          <TaskRelations onlink={link} {onopen} task={shown} {tasks} />
          <RowFault reason={edgeProblem} />
        </div>

        {#if shown.attempts.length > 0 || flags.startProblem}
          <section class="part">
            <h3 class="kit-section-head">
              Sessions
              {#if shown.attempts.length > 0}
                <span data-num data-slot="count" class="count num"
                  >{shown.attempts.length}</span
                >
              {/if}
            </h3>
            <RowFault reason={flags.startProblem} />
            <ol data-slot="sessions" class="sessions">
              {#each shown.attempts as attempt (attempt.workItemId)}
                {@const word = attemptWord(attempt.state)}
                <li>
                  <a
                    data-slot="session"
                    class="session mark-line press-tint focus-inset"
                    href={rowHref(attempt.instanceId)}
                    onclick={(event) => {
                      event.preventDefault();
                      openBeside(attempt.instanceId, projectId, taskId);
                    }}
                  >
                    <SessionMark
                      id={attempt.instanceId}
                      place={cawco.instanceIndex.byId.get(attempt.instanceId)
                        ?.cwd ?? attempt.instanceId}
                      status={TONE[word] ?? "idle"}
                    />
                    <span class="session-name"
                      >{sessionName(attempt.instanceId)}</span
                    >
                    <Badge data-box variant={TINT[word] ?? "secondary"}>
                      {#if word === "Failed"}
                        <IconError />
                      {/if}
                      <span>{word}</span>
                    </Badge>
                    <time
                      class="session-when"
                      datetime={new Date(
                        attempt.endedAt ?? attempt.startedAt
                      ).toISOString()}
                      >{formatDistanceToNow(
                        new Date(attempt.endedAt ?? attempt.startedAt)
                      )}</time
                    >
                    {#if attempt.endedHow}
                      <span class="session-how">{attempt.endedHow}</span>
                    {/if}
                  </a>
                </li>
              {/each}
            </ol>
          </section>
        {/if}

        <TaskActivity
          comments={shown.comments}
          {history}
          {historyProblem}
          oncomment={async (text, id) => {
            if (shown) {
              took(await addComment(projectId, shown.id, text, id));
            }
          }}
          {reaches}
          rereadHistory={() => shown && readActivity(shown.id)}
        />
      </div>
    {/if}
  </div>
{/snippet}

{#if page}
  <section aria-label="Task {taskId}" class="task-page">
    <header data-slot="page-head" class="page-head">
      <Button onclick={onclose} size="sm" variant="ghost">
        <IconChevronLeft />
        <span>{backLabel}</span>
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
  /* The pane never scrolls as a whole: its head stands, and the review's
     stage or the details' body scrolls under it. `--pane-inline` is the
     pane's inline padding, which the review's bands (TaskReview) share. */
  .task-frame {
    --pane-inline: var(--space-3);
    /* The review's two columns ask its width (TaskReview). */
    container: task-frame / inline-size;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-block-size: 0;
    overflow: hidden;
  }
  .task-page .task-frame {
    --pane-inline: var(--space-5);
  }
  .task-body {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: var(--space-5);
    min-block-size: 0;
    padding: var(--space-3) var(--pane-inline) var(--space-6);
    border-block-start: 1px solid var(--border-hairline);
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .head {
    display: flex;
    flex: none;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2) var(--pane-inline) var(--space-3);
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  /* The decision it was made from: a meta line under the title, its card a link. */
  .decided {
    margin: 0;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .decided a {
    color: var(--link-ink);
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
  /* Its labels end the facts line, wrapping under the dates when tight. */
  .labels {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-inline-start: auto;
  }
  .skeleton {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .task-frame > :global(.alert),
  .task-frame > .skeleton {
    margin-inline: var(--pane-inline);
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
  /* One row per session that worked it, opening that session with this
     task beside it. */
  .sessions {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .session {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--surface-recess);
    color: var(--ink-strong);
    text-decoration: none;
  }
  .session-name {
    flex: 0 1 auto;
    min-inline-size: 0;
    overflow: clip;
    font: var(--type-label);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .session-when {
    margin-inline-start: auto;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  /* How it ended, on its own line under the session's name. */
  .session-how {
    flex-basis: 100%;
    font: var(--type-meta);
    color: var(--ink-muted);
    overflow-wrap: anywhere;
  }
  @media (hover: hover) and (pointer: fine) {
    .session:hover {
      background: var(--surface-hover);
    }
  }
</style>
