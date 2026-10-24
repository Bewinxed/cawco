<script lang="ts">
  /**
   * A task, whole, in the page beside what it was opened from (DESIGN.md,
   * The Open Page Rule): on a desk the side card of a split (Split, through
   * the project page or a conversation's SideSplit), the board or the
   * transcript live beside it; on a phone its own page, with Back.
   *
   * One unit (the owner's pin: "this panel needs to be completely
   * rethought as a single unit"). Its head stands still: its title; one
   * group of setting chips, its stage said once (its glyph, its name, the
   * moves the project's stages allow you from where it is, the rest
   * listed, disabled, so the stages read in order) and its labels; one
   * session row (its newest session's mark, name and age, and its state
   * word only when the stage can't carry it); and why the hub could not
   * start one, in its words. Then four tabs, each led by its glyph: Review
   * (while there is one: the task waits on you, a session handed in a
   * result, it names outputs, or its newest session failed or was
   * stopped), Session (the session read in place, TaskSession), Details
   * (what else it needs from you, its description, acceptance criteria,
   * to-dos, fields and edges) and Activity (comments and history). Only
   * the chosen tab scrolls, under the kit's edge fade, never between
   * hairlines. The decision is the pane's foot (TaskDecide), right under
   * what it decides on, only while there is one.
   *
   * Every change is the hub's to make (each is a commit in the project
   * folder), so each waits for the hub's answer and shows the task as the
   * hub wrote it back; a refusal is said beside what it refused, in the
   * hub's own words. The task is read again whenever the list says it
   * changed, so a move made anywhere shows here.
   *
   * A task one record with a GitHub or Linear issue (the hub's tracker.ts)
   * names it under the title, its mark and its ref a link to it; when its
   * last sync stopped short, the tracker's words under it, with Sync now.
   */
  import { commonWords, projectWords, TRACKER_NAMES } from "@cawco/core";
  import { DECIDED_FIELD, decidedOf } from "@cawco/core/decisions";
  import { type Snippet, untrack } from "svelte";
  import { readDecision } from "#lib/cawco/decisions/decisions-api.js";
  import { failureWords as message } from "#lib/cawco/hub-read.js";
  import ProviderLogo from "#lib/components/features/ProviderLogo.svelte";
  import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import {
    IconBlocked,
    IconChevronDown,
    IconChevronLeft,
    IconDocument,
    IconDot,
    IconEye,
    IconFailed,
    IconHistory,
    IconHourglass,
    IconInfo,
    IconListCheck,
    IconMinusCircle,
    IconNeedsYou,
    IconPost,
    IconSuccess,
    IconTranscript,
    IconWorking,
  } from "#lib/icons.js";
  import { formatDistanceToNow } from "#lib/utils/time.js";
  import { cawco } from "../client.svelte";
  import Caw from "../home/Caw.svelte";
  import {
    addComment,
    addTodo,
    approveTarget,
    changeTodo,
    flagsOf,
    linkTask,
    readHistory,
    readTask,
    reviewOf,
    type StagesView,
    sendBackTarget,
    stageLabel,
    syncTracker,
    type TaskEdge,
    type TaskHistoryEvent,
    type TaskSummary,
    type TaskView,
    updateTask,
  } from "../project-tasks";
  import RowFault from "../RowFault.svelte";
  import SessionMark from "../SessionMark.svelte";
  import { sessionPlace, sessionTitle } from "../session-names.svelte";
  import SideSurface from "../side/SideSurface.svelte";
  import type { MarkStatus } from "../TreeMark.svelte";
  import { resultStamp } from "./review-stamp";
  import { isPresented } from "./stage/Presented.svelte";
  import TaskActivity from "./TaskActivity.svelte";
  import TaskDecide from "./TaskDecide.svelte";
  import TaskFields from "./TaskFields.svelte";
  import TaskLabels from "./TaskLabels.svelte";
  import TaskNeeds from "./TaskNeeds.svelte";
  import TaskRelations from "./TaskRelations.svelte";
  import TaskReview from "./TaskReview.svelte";
  import TaskSession from "./TaskSession.svelte";
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
      return {
        kind: "live" as const,
        session: sessionTitle(live.instanceId) ?? commonWords.itsSession,
      };
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
  type Tab = "review" | "session" | "details" | "activity";
  /**
   * The tab it opens on: Review while there is one; else Session while a
   * session works it, it failed, or the hub could not start one; else
   * Details.
   */
  const fallback = $derived.by<Tab>(() => {
    if (reviewable) {
      return "review";
    }
    return flags.live || flags.failed || flags.startProblem
      ? "session"
      : "details";
  });
  /** The tab chosen; null: the one its state opens on. */
  let picked = $state<Tab | null>(null);
  const view = $derived<Tab>(
    picked === "review" && !reviewable ? fallback : (picked ?? fallback)
  );

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
  // The hub says this task changed, or the project's tasks naming none (its
  // folder written by hand): the file is read again. Its times are whole
  // seconds, so a change in the second of the last one (a tracker's sync
  // beside you) shows the list no newer time; the frame still says it.
  let heard = { id: "", changes: 0 };
  $effect(() => {
    const id = taskId;
    const changes = cawco.taskChangedOf(projectId, id);
    if (heard.id === id && heard.changes !== changes) {
      // biome-ignore lint/complexity/noVoid: the read sets its own state
      untrack(() => void read(id));
    }
    heard = { id, changes };
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

  /**
   * Reads of the task, and of its history, so far: only each newest one's
   * answer is kept. A write's answer counts as the newest read of the task,
   * and the hub's `tasks.changed` after it reads the task again.
   */
  let taskReads = 0;
  let historyReads = 0;
  async function read(id: string) {
    readProblem = null;
    taskReads += 1;
    const ticket = taskReads;
    // biome-ignore lint/complexity/noVoid: the history reads beside the task and sets its own state
    void readActivity(id);
    try {
      const fresh = await readTask(projectId, id);
      if (taskId === id && ticket === taskReads) {
        task = fresh;
      }
    } catch (error) {
      if (taskId === id && ticket === taskReads) {
        readProblem = message(error);
      }
    }
  }

  /** Its file's history; a refusal is said over the activity, in the hub's words. */
  async function readActivity(id: string) {
    historyProblem = null;
    historyReads += 1;
    const ticket = historyReads;
    try {
      const answered = await readHistory(projectId, id);
      if (taskId === id && ticket === historyReads) {
        history = answered.events;
      }
    } catch (error) {
      if (taskId === id && ticket === historyReads) {
        historyProblem = message(error);
      }
    }
  }

  /** Every write answers with the task as the hub wrote it, and is a commit in its history. */
  function took(next: TaskView) {
    taskReads += 1;
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
      taskReads += 1;
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

  /** Where the task's stage stands: its chip's glyph and its ink. */
  const STAGE_GLYPH = {
    todo: IconDot,
    active: IconWorking,
    waiting: IconHourglass,
    you: IconNeedsYou,
    done: IconSuccess,
    dropped: IconMinusCircle,
  } as const;
  const kind = $derived(shown?.kind ?? summary?.kind ?? "todo");
  const StageGlyph = $derived(STAGE_GLYPH[kind]);

  /**
   * Its newest session, in the head's one session row: its mark and name,
   * its age, and its state word only when the stage can't carry it (it
   * failed or was stopped): Working and Done are what the stage already
   * says, so the pane says one status (the owner's pin: "why are you
   * mentioning working twice here?").
   */
  const newest = $derived(shown?.attempts[0] ?? null);
  const sessionState = $derived.by<{
    status: MarkStatus;
    word: string | null;
  } | null>(() => {
    if (!newest) {
      return null;
    }
    if (flags.live) {
      return { status: "live", word: null };
    }
    if (newest.state === "failed") {
      return { status: "fail", word: projectWords.failed };
    }
    if (newest.state === "cancelled") {
      return { status: "idle", word: projectWords.stopped };
    }
    return { status: "done", word: null };
  });
  /** The hub could not start a session on it: its words whole, under the stage. */
  const cantStart = $derived(
    flags.startProblem && !flags.live ? flags.startProblem : null
  );
  /** A decision stands at the pane's foot (TaskDecide draws it). */
  const hasFoot = $derived(
    !!shown &&
      ((shown.kind === "you" &&
        (approveTarget(stages, shown.stage) !== null ||
          sendBackTarget(stages, shown.stage) !== null)) ||
        ((flags.failed || flags.stopped) && !flags.live) ||
        !!cantStart)
  );
  /** The review presents something: it fills the tab's room. */
  const filled = $derived.by(() => {
    if (!shown) {
      return false;
    }
    const ended = (flags.failed || flags.stopped) && !flags.live;
    const result = ended
      ? (shown.attempts[0]?.result ?? null)
      : (reviewOf(shown)?.result ?? null);
    return (result?.artifacts ?? []).some(isPresented);
  });

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
  <div
    class="@container/task-frame flex flex-auto flex-col min-h-0 overflow-hidden"
    data-task-pane={taskId}
    data-tab={view}
    style:--pane-inline={page ? "var(--space-5)" : "var(--space-3)"}
  >
    <!-- The head stands still: its title, one group of setting chips (its
         stage, its labels), one session row, and why the hub could not
         start it; then the tabs. One hierarchy, nothing said twice, the
         controls apart from the facts (the owner's pin: "this panel needs
         to be completely rethought as a single unit"). -->
    <header
      data-slot="head"
      class="flex flex-none flex-col gap-space-2 pt-space-2 px-(--pane-inline) pb-space-2"
    >
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
            onblur={saveTitle}
            text="title"
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
        <h2 data-slot="title" class="m-0 type-title tracking-title">
          <button
            class="select-none block w-(--title-w) -mx-space-1 p-space-1 rounded-sm type-title text-ink-strong text-start text-balance wrap-anywhere hover:enabled:bg-surface-hover press-tint focus-inset"
            disabled={!shown}
            onclick={() => {
              titleDraft = shown?.title ?? "";
            }}
            style:--title-w="calc(100% + var(--space-1) * 2)"
            title="Edit the title"
            type="button"
          >
            {shown?.title ?? summary?.title ?? ""}
          </button>
        </h2>
      {/if}
      <RowFault again={saveTitle} reason={titleProblem} />

      <!-- One group of equal setting chips: its stage, said once, and its
           labels, beside each other (New-session dialog's chips). -->
      <div
        data-slot="chips"
        class="flex min-w-0 flex-wrap items-center gap-space-1"
      >
        {#if shown}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger disabled={moving}>
              {#snippet child({ props })}
                <button
                  {...props}
                  aria-label="Stage: {stageLabel(shown.stage)}"
                  class={chipVariants({ variant: "setting" })}
                  data-kind={kind}
                  data-stage-chip
                  type="button"
                >
                  <StageGlyph
                    aria-hidden="true"
                    class={[
                      "text-ink-muted",
                      kind === "you" && "text-status-attn-glyph",
                      kind === "active" && "text-status-live-glyph",
                      kind === "done" && "text-status-done-glyph",
                      kind === "active" &&
                        flags.live &&
                        "motion-safe:animate-breath",
                    ]}
                  />
                  <span data-slot="chip-label">{stageLabel(shown.stage)}</span>
                  <IconChevronDown aria-hidden="true" data-slot="chevron" />
                </button>
              {/snippet}
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="start" width="regular">
              {#each stages.stages as stage (stage.name)}
                {@const Glyph = STAGE_GLYPH[stage.kind]}
                <DropdownMenu.Item
                  disabled={stage.name === shown.stage ||
                    !allowed.has(stage.name)}
                  onSelect={() => move(stage.name)}
                >
                  <Glyph />
                  <span>{stageLabel(stage.name)}</span>
                </DropdownMenu.Item>
              {/each}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
          <Popover.Root>
            <Popover.Trigger>
              {#snippet child({ props })}
                <button
                  {...props}
                  aria-label="Labels"
                  class={chipVariants({
                    variant: "setting",
                    tone: shown.labels.length > 0 ? undefined : "muted",
                  })}
                  data-labels-chip
                  type="button"
                >
                  <IconPost aria-hidden="true" class="text-ink-muted" />
                  <span data-slot="chip-label"
                    >{shown.labels.length > 0
                      ? shown.labels.join(" · ")
                      : "Add label"}</span
                  >
                  <IconChevronDown aria-hidden="true" data-slot="chevron" />
                </button>
              {/snippet}
            </Popover.Trigger>
            <Popover.Content align="start" pad="inset" width="wide">
              <TaskLabels
                {known}
                labels={shown.labels}
                onchange={async (labels) => {
                  if (shown) {
                    took(await updateTask(projectId, shown.id, { labels }));
                  }
                }}
              />
            </Popover.Content>
          </Popover.Root>
        {:else}
          <Skeleton class="w-c-task-stage-skeleton-w" height="control-sm" />
        {/if}
      </div>
      <RowFault reason={stageProblem} />

      {#if newest && sessionState}
        <!-- One session row: its mark (echoing while it works), its name,
             its word only when the stage can't say it, its age at the end. -->
        <div
          data-slot="session-row"
          class="group/row mark-line flex min-h-c-btn-h-xs min-w-0 items-center gap-space-2"
          data-session={newest.instanceId}
          data-status={sessionState.status}
        >
          <SessionMark
            id={newest.instanceId}
            place={sessionPlace(newest.instanceId)}
            status={sessionState.status}
          />
          <span
            class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-label text-ink-strong"
            >{sessionTitle(newest.instanceId) ?? commonWords.itsSession}</span
          >
          {#if sessionState.word}
            <span
              data-slot="session-word"
              class="mark-line inline-flex flex-none items-center gap-space-1 type-label text-ink-muted group-data-[status=fail]/row:text-status-fail-ink"
              data-box
            >
              {#if sessionState.status === "fail"}
                <IconFailed
                  aria-hidden="true"
                  class="size-icon-md text-status-fail-glyph"
                />
              {/if}
              <span>{sessionState.word}</span>
            </span>
          {/if}
          <time
            data-slot="num"
            class="num ms-auto flex-none type-meta text-ink-muted"
            datetime={new Date(
              newest.endedAt ?? newest.startedAt
            ).toISOString()}
            >{formatDistanceToNow(
              new Date(newest.endedAt ?? newest.startedAt)
            )}</time
          >
        </div>
        {#if newest.state === "failed" && !flags.live && newest.endedHow}
          <p
            data-slot="ended"
            style:--ended-in="calc(var(--c-row-mark) + var(--space-2))"
            class="m-0 ps-(--ended-in) type-body text-status-fail-ink wrap-anywhere"
          >
            {newest.endedHow}
          </p>
        {/if}
      {:else if flags.queued}
        <p
          data-slot="queued"
          class="mark-line m-0 flex items-center gap-space-2 type-label text-ink-muted"
        >
          <IconHourglass aria-hidden="true" class="size-icon-md flex-none" />
          <span>Queued for a session</span>
        </p>
      {/if}
      {#if cantStart}
        <p
          data-slot="refusal"
          class="mark-line m-0 flex items-start gap-space-2 type-body text-ink-strong wrap-anywhere"
        >
          <span data-box
            ><IconBlocked
              aria-hidden="true"
              class="size-icon-md text-status-attn-glyph"
            /></span
          >
          <span
            ><span class="font-medium text-status-attn-ink"
              >{projectWords.cantStart}</span
            >
            · {cantStart}</span
          >
        </p>
      {/if}

      {#if shown?.issue}
        {@const issue = shown.issue}
        <div
          data-slot="issue"
          class="flex min-w-0 flex-col gap-space-1"
          data-failed={issue.problem ? "" : undefined}
          data-provider={issue.provider}
        >
          <p
            class="mark-line m-0 flex min-w-0 items-start gap-space-2 type-meta text-ink-muted"
          >
            <span class="mark-cell"
              ><ProviderLogo provider={issue.provider} size="meta" /></span
            >
            {#if issue.url}
              <span data-slot="issue-words" class="min-w-0 wrap-anywhere"
                ><a
                  class="text-link-ink"
                  href={issue.url}
                  rel="noreferrer"
                  target="_blank">{issue.ref}</a
                >
                on {TRACKER_NAMES[issue.provider]}</span
              >
            {:else}
              <span data-slot="issue-words" class="min-w-0 wrap-anywhere"
                >Not on {TRACKER_NAMES[issue.provider]} yet</span
              >
            {/if}
          </p>
          <RowFault
            again={async () => {
              await syncTracker(projectId);
              await read(taskId);
            }}
            againLabel="Sync now"
            againPending="Syncing…"
            data-issue-fault
            reason={issue.problem}
          />
        </div>
      {/if}
      {#if decided}
        <p data-slot="decided" class="m-0 type-meta text-ink-muted">
          Decided on <a class="text-link-ink" href={decided.href}
            >{decided.question
              ? `${decided.page} › ${decided.question}`
              : decided.page}</a
          >
        </p>
      {/if}

      <Tabs
        onValueChange={(next) => {
          picked = next as Tab;
        }}
        size="compact"
        value={view}
      >
        <!-- Each tab leads with its glyph (the owner's pin: "ICONS IN
             SECTIONS"); a narrow pane scrolls the track under its edge
             fade, never cutting a name. -->
        <TabsList aria-label="Task" scrollable>
          {#if reviewable}
            <TabItem icon={IconEye} label="Review" value="review" />
          {/if}
          <TabItem icon={IconTranscript} label="Session" value="session" />
          <TabItem icon={IconInfo} label="Details" value="details" />
          <TabItem icon={IconHistory} label="Activity" value="activity" />
        </TabsList>
      </Tabs>
    </header>

    {#if readProblem}
      <!-- A read the hub refused takes the pane's centre, with Caw: what
           happened, the way out, and its words under Show details. -->
      <div
        data-slot="read-fault"
        class="grid flex-auto place-items-center px-(--pane-inline) pb-space-6"
      >
        <EmptyState
          line="Its file couldn't be read, so nothing of it is shown. Nothing was changed."
          title="This task didn't open"
        >
          {#snippet mark()}
            <div class="mb-space-3 grid justify-items-start">
              <Caw size={48} status="ready" />
            </div>
          {/snippet}
          {#snippet action()}
            <RowFault
              again={() => read(taskId)}
              details={readProblem}
              reason="The hub didn't send it."
            />
          {/snippet}
        </EmptyState>
      </div>
    {:else if !shown}
      <div
        data-slot="task-pane-skeleton"
        aria-hidden="true"
        class="flex flex-col gap-space-2 mx-(--pane-inline)"
      >
        <Skeleton class="w-full" height="plot" radius="tile" />
        <Skeleton class="mt-space-2 w-1/3" line="label" />
        <Skeleton class="w-full" line="body" />
        <Skeleton class="w-11/12" line="body" />
        <Skeleton class="w-3/5" line="body" />
      </div>
    {:else}
      <!-- Only the chosen tab scrolls, under the kit's edge fade: no
           hairlines. As tall as what it holds, so the decision follows it;
           past the pane's room it gives way and scrolls, the decision then
           pinned under it. What a session presented fills the room. -->
      <div
        data-slot="content"
        class="kit-edge-fade-block flex min-h-0 flex-initial flex-col overflow-y-auto overscroll-contain px-(--pane-inline) pt-space-2 pb-space-5 data-fill:flex-auto"
        data-content={view}
        data-fill={(view === "review" && filled) || undefined}
      >
        {#if view === "review"}
          <TaskReview
            onchanged={took}
            onmove={moveTo}
            {projectId}
            {stages}
            task={shown}
          />
        {:else if view === "session"}
          <TaskSession onchanged={took} {projectId} task={shown} />
        {:else if view === "details"}
          <div data-slot="task-body" class="flex flex-col gap-space-5">
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
              icon={IconDocument}
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
              icon={IconListCheck}
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

            <TaskFields
              {fields}
              onsave={async (change) => {
                if (shown) {
                  took(
                    await updateTask(projectId, shown.id, { fields: change })
                  );
                }
              }}
            />

            <div class="flex flex-col gap-space-2">
              <TaskRelations onlink={link} {onopen} task={shown} {tasks} />
              <RowFault reason={edgeProblem} />
            </div>
          </div>
        {:else}
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
        {/if}
      </div>

      {#if hasFoot}
        <!-- The decision, right under what it decides on, clear of the safe
             area; only while there is one. -->
        <div
          data-slot="foot"
          class="flex-none px-(--pane-inline) pt-space-3 pb-(--decide-end)"
          style:--decide-end="max(var(--space-3), env(safe-area-inset-bottom))"
        >
          <TaskDecide
            onchanged={took}
            onmove={moveTo}
            {projectId}
            {stages}
            task={shown}
          />
        </div>
      {/if}
    {/if}
  </div>
{/snippet}

{#if page}
  <section aria-label="Task {taskId}" class="flex flex-1 flex-col min-h-0">
    <header
      data-slot="page-head"
      class="flex flex-none items-center gap-space-2 pt-space-2 pe-space-5 pb-space-2 ps-space-3"
    >
      <Button onclick={onclose} size="sm" variant="ghost">
        <IconChevronLeft />
        <span>{backLabel}</span>
      </Button>
      <span class="ms-auto type-meta font-mono liga-none text-ink-subtle"
        >{taskId}</span
      >
    </header>
    {@render content()}
  </section>
{:else}
  <SideSurface
    of="task"
    label="Task {taskId}"
    {onclose}
    recessed={false}
    {switcher}
    title={switcher ? undefined : taskId}
    titleCode
  >
    {@render content()}
  </SideSurface>
{/if}
