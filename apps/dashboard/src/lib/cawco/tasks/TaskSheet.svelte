<script lang="ts">
  import { DECIDED_FIELD, decidedOf } from "@cawco/core/decisions";
  import { readDecision } from "#lib/cawco/decisions/decisions-api.js";
  import { failureWords as message } from "#lib/cawco/hub-read.js";
  /**
   * A task, whole, in the side sheet, read to review it: what its attempts
   * handed in (its result, each output drawn as the thing it is), its
   * attempts and their transcripts, then its title, stage, description,
   * acceptance criteria, to-dos and edges. Every part says what it is: the
   * header's facts are labelled, its labels are labels (badges, which take
   * no press) and its actions are buttons with a verb.
   *
   * Every change is the hub's to make (each is a commit in the project
   * folder), so each waits for the hub's answer and shows the task as the
   * hub wrote it back; a refusal is said beside what it refused, in the
   * hub's own words.
   *
   * The stage picker offers the moves the project's stages allow you from
   * where the task is; the rest are listed, disabled, so the stages read in
   * order. The hub checks the move again either way.
   *
   * An attempt's transcript opens under it; expanded, it takes a pane of its
   * own beside the task at the sheet's full height (over it on a narrow
   * screen), and the sheet widens to hold both.
   */
  import {
    addComment,
    addTodo,
    changeTodo,
    flagsOf,
    linkTask,
    readHistory,
    readTask,
    type StagesView,
    stageLabel,
    type TaskEdge,
    type TaskHistoryEvent,
    type TaskSummary,
    type TaskView,
    updateTask,
  } from "#lib/cawco/project-tasks.js";
  import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Select from "#lib/components/ui/select/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Sheet from "#lib/components/ui/sheet/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import {
    IconClock,
    IconError,
    IconLock,
    IconNeedsYou,
    IconReport,
    IconStop,
    IconWorking,
  } from "#lib/icons.js";
  import { formatDistanceToNow, formatTimestamp } from "#lib/utils/time.js";
  import MessageBody from "../MessageBody.svelte";
  import RowFault from "../RowFault.svelte";
  import AttemptTranscript from "./AttemptTranscript.svelte";
  import ResultCard from "./ResultCard.svelte";
  import ResultView from "./ResultView.svelte";
  import TaskActivity from "./TaskActivity.svelte";
  import TaskAttempts from "./TaskAttempts.svelte";
  import TaskFields from "./TaskFields.svelte";
  import TaskLabels from "./TaskLabels.svelte";
  import TaskRelations from "./TaskRelations.svelte";
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
  let sheet = $state<HTMLElement | null>(null);
  /** The attempt shown, by work item; null: the newest. */
  let chosenAttempt = $state<string | null>(null);
  /** The shown attempt's transcript is in its own pane at the sheet's height. */
  let expanded = $state(false);

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
  /** Its file's commits, for the activity; null while they are read. */
  let history = $state<TaskHistoryEvent[] | null>(null);
  let historyProblem = $state<string | null>(null);
  /** Where a comment goes past the file (TaskActivity `reaches`). */
  const reaches = $derived.by(() => {
    const attempts = shown?.attempts ?? [];
    const live = attempts.findIndex(
      (attempt) => attempt.state === "starting" || attempt.state === "running"
    );
    if (live >= 0) {
      return {
        kind: "live" as const,
        attempt: `Attempt ${attempts.length - live}`,
      };
    }
    const open = shown?.kind !== "done" && shown?.kind !== "dropped";
    return attempts.length > 0 && open ? { kind: "resumes" as const } : null;
  });

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
      chosenAttempt = null;
      expanded = false;
      history = null;
      historyProblem = null;
    }
  });

  /** The attempt whose transcript the pane holds, and what it is called. */
  const paneAttempt = $derived.by(() => {
    const attempts = shown?.attempts ?? [];
    const index = Math.max(
      0,
      attempts.findIndex((each) => each.workItemId === chosenAttempt)
    );
    const attempt = attempts[index];
    return attempt
      ? { attempt, name: `Attempt ${attempts.length - index}` }
      : null;
  });
  const open = $derived(expanded && paneAttempt !== null);
  /** An attempt has finished, so its outputs are in the project's folder. */
  const handedIn = $derived(
    shown?.attempts.some((attempt) => attempt.state === "done") ?? false
  );
  /** What the Result section is: which attempt reported it and when, or what will be there. */
  const resultLine = $derived.by(() => {
    const result = shown?.result;
    const attempts = shown?.attempts ?? [];
    if (result) {
      const at = attempts.findIndex(
        (each) => each.workItemId === result.workItemId
      );
      const who = at < 0 ? "The attempt" : `Attempt ${attempts.length - at}`;
      return `${who} finished ${formatDistanceToNow(new Date(result.at))} and handed this in.`;
    }
    return handedIn
      ? "What the finished attempt handed in."
      : "What an attempt hands in shows here once one finishes.";
  });

  async function read(id: string) {
    readProblem = null;
    history = null;
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

  const titleOf = (id: string) => byId.get(id)?.title;
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
        // The page is gone or did not read: the sheet names no decision.
      });
    return () => {
      live = false;
    };
  });
</script>

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
    class="task-sheet gap-0 p-0 data-[side=right]:w-full max-sm:data-[side=right]:border-l-0 {open
      ? 'data-[side=right]:sm:max-w-none'
      : 'data-[side=right]:sm:max-w-2xl'}"
    data-transcript-open={open}
    onOpenAutoFocus={(event) => {
      event.preventDefault();
      sheet?.focus({ preventScroll: true });
    }}
    side="right"
    bind:ref={sheet}
  >
    <div class="frame" class:split={open}>
      {#if open && paneAttempt}
        <div class="side">
          <AttemptTranscript
            attempt={paneAttempt.name}
            expanded
            instanceId={paneAttempt.attempt.instanceId}
            ontoggle={() => {
              expanded = false;
            }}
          />
        </div>
      {/if}
      <div class="review">
        <Sheet.Header class="task-head">
          <div class="meta">
            <span class="id" title={taskId ?? undefined}
              >Task {shown?.number ?? summary?.number ?? ""}</span
            >
            {#if shown}
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
          <RowFault again={saveTitle} reason={titleProblem} />
          {#if decided}
            <p class="decided">
              Decided on <a href={decided.href}
                >{decided.question
                  ? `${decided.page} › ${decided.question}`
                  : decided.page}</a
              >
            </p>
          {/if}
          <!-- The task's facts, each under its name: the stage is a picker (a
           control), the rest are labels (badges, which take no press). -->
          <dl class="facts">
            <div class="fact">
              <dt>Stage</dt>
              <dd>
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
                            <IconNeedsYou
                              class="text-[var(--status-attn-glyph)]"
                            />
                          {/if}
                        </Select.Item>
                      {/each}
                    </Select.Content>
                  </Select.Root>
                {:else}
                  <Skeleton class="h-[var(--c-btn-h-sm)] w-24" />
                {/if}
              </dd>
            </div>
            {#if shown?.needsYou || flags.live || flags.failed || flags.stopped || flags.queued}
              <div class="fact">
                <dt>Status</dt>
                <dd class="badges">
                  {#if shown?.needsYou}
                    <Badge data-label variant="attn"
                      ><IconNeedsYou /><span>Needs you</span></Badge
                    >
                  {/if}
                  {#if flags.live}
                    <Badge data-label variant="live"
                      ><IconWorking /><span>An attempt is working</span></Badge
                    >
                  {:else if flags.failed}
                    <Badge data-label variant="fail"
                      ><IconError /><span>Last attempt failed</span></Badge
                    >
                  {:else if flags.stopped}
                    <Badge data-label variant="secondary"
                      ><IconStop /><span>Last attempt stopped</span></Badge
                    >
                  {:else if flags.queued}
                    <Badge data-label variant="secondary"
                      ><IconClock /><span>Waiting for a free slot</span></Badge
                    >
                  {/if}
                </dd>
              </div>
            {/if}
            {#if flags.blockedBy.length > 0}
              <div class="fact">
                <dt>Waits on</dt>
                <dd class="badges">
                  {#each flags.blockedBy as id (id)}
                    <Badge data-label title={titleOf(id)} variant="secondary"
                      ><IconLock /><span>{id}</span></Badge
                    >
                  {/each}
                </dd>
              </div>
            {/if}
            {#if shown}
              <div class="fact">
                <dt>Labels</dt>
                <dd>
                  <TaskLabels
                    {known}
                    labels={shown.labels}
                    onchange={async (labels) => {
                      if (shown) {
                        took(await updateTask(projectId, shown.id, { labels }));
                      }
                    }}
                  />
                </dd>
              </div>
            {/if}
          </dl>
          <RowFault reason={stageProblem} />
          <Sheet.Description class="sr-only">
            What the task's attempts handed in, its attempts and their
            transcripts, its description, acceptance criteria, to-dos, fields,
            relations, and what was said and done about it.
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
                  variant="outline">Retry</Button
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

            {#if shown.result || shown.outputs.length > 0}
              <section class="part" data-task-result>
                <div class="part-head">
                  <h3 class="kit-section-head">Result</h3>
                  <p class="hint">{resultLine}</p>
                </div>
                {#if shown.result || handedIn}
                  <div class="results">
                    {#if shown.result}
                      <!-- mark-line: the card draws its glyph and kind on its own mark line -->
                      <ResultCard
                        data-task-report=""
                        glyph={IconReport}
                        kind="Report"
                      >
                        {#if shown.result.headline}
                          <p class="lead">{shown.result.headline}</p>
                        {/if}
                        <MessageBody source={shown.result.report} />
                      </ResultCard>
                    {/if}
                    {#if handedIn}
                      {#each shown.outputs as output (output)}
                        <ResultView
                          name={output}
                          {projectId}
                          taskId={shown.id}
                        />
                      {/each}
                    {/if}
                  </div>
                {/if}
              </section>
            {/if}

            {#if shown.attempts.length > 0}
              <TaskAttempts
                onchanged={(fresh) => {
                  if (taskId === fresh.id) {
                    took(fresh);
                  }
                }}
                {projectId}
                task={shown}
                bind:chosen={chosenAttempt}
              >
                {#snippet transcript(attempt, name)}
                  {#if open}
                    <p class="hint">
                      {name}'s transcript is open in its own pane.
                    </p>
                  {:else}
                    <AttemptTranscript
                      attempt={name}
                      expanded={false}
                      instanceId={attempt.instanceId}
                      ontoggle={() => {
                        expanded = true;
                      }}
                    />
                  {/if}
                {/snippet}
              </TaskAttempts>
            {:else if flags.startProblem}
              <RowFault reason={flags.startProblem} />
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

            <div class="part">
              <TaskRelations
                onlink={link}
                onopen={(id) => {
                  taskId = id;
                }}
                task={shown}
                {tasks}
              />
              <RowFault reason={edgeProblem} />
            </div>

            <TaskActivity
              comments={shown.comments}
              {history}
              {historyProblem}
              oncomment={async (text) => {
                if (shown) {
                  took(await addComment(projectId, shown.id, text));
                }
              }}
              {reaches}
              rereadHistory={() => shown && readActivity(shown.id)}
            />
          {/if}
        </div>
      </div>
    </div>
  </Sheet.Content>
</Sheet.Root>

<style>
  /* The sheet takes focus as a container, not as a control: no ring. */
  :global(.task-sheet:focus-visible) {
    outline: none;
  }
  /* The sheet's own head, by a name no part inside it uses (a result
     card's and the transcript pane's heads are `.head` too). */
  :global(.task-sheet) :global(.task-head) {
    gap: var(--space-2);
    padding: var(--space-5) var(--space-5) var(--space-3);
    border-block-end: 1px solid var(--border-hairline);
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    padding-inline-end: var(--space-8);
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
  }
  .id {
    font: var(--type-meta);
    font-variant-numeric: tabular-nums;
    color: var(--ink-muted);
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
  /* The task's facts: each name in the label role over a fixed column, its
     value beside it. */
  .facts {
    display: grid;
    grid-template-columns: 4.5rem minmax(0, 1fr);
    align-items: center;
    gap: var(--space-2);
    margin: 0;
  }
  .fact {
    display: contents;
  }
  .fact dt {
    font: var(--type-label);
    color: var(--ink-muted);
  }
  .fact dd {
    min-inline-size: 0;
    margin: 0;
  }
  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  /* The sheet's frame: the review alone, or — the transcript expanded — the
     transcript's pane and the review side by side, the review where it
     stood at the sheet's right edge. A narrow sheet holds the pane alone. */
  .frame {
    display: grid;
    flex: 1 1 auto;
    grid-template-columns: minmax(0, 1fr);
    min-block-size: 0;
  }
  .review,
  .side {
    display: flex;
    flex-direction: column;
    min-block-size: 0;
    min-inline-size: 0;
  }
  .frame.split .review {
    display: none;
  }
  @media (width >= 64rem) {
    .frame.split {
      /* The review takes 40% of the sheet, between the narrow sheet's
         26rem and its own 42rem, so the transcript keeps the larger share
         on a tablet as on a desk. */
      grid-template-columns: minmax(0, 1fr) clamp(26rem, 40%, 42rem);
    }
    .frame.split .review {
      display: flex;
      border-inline-start: 1px solid var(--border-hairline);
    }
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
  .part-head {
    min-inline-size: 0;
  }
  .hint {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  /* A report's headline: its outcome, read first. */
  .lead {
    font: var(--type-body);
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
    text-wrap: pretty;
  }
  .results {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-inline-size: 0;
  }
</style>
