<script lang="ts">
  /**
   * PROPOSED: the task pane as one unit (taskpane advisor §1). The head
   * stands still: the title, one group of setting chips (the stage, the
   * labels), one session row, and the hub's refusal when it could not
   * start. Then four tabs, Review · Session · Details · Activity (Review
   * only while there is one); only the chosen tab scrolls, under the kit's
   * edge fade, never between hairlines. The decision is the pane's foot,
   * pinned, only while there is one: Approve and Send back with More, or
   * Try again with More. The stage is said once, on its chip; the session
   * row says the session's own state.
   */
  import { untrack } from "svelte";
  import {
    approveTarget,
    attemptWord,
    reviewOf,
    type StagesView,
    sendBackTarget,
    stageLabel,
    type TaskHistoryEvent,
    type TaskView,
  } from "#lib/cawco/project-tasks.js";
  import SessionMark from "#lib/cawco/SessionMark.svelte";
  import SideSurface from "#lib/cawco/side/SideSurface.svelte";
  import TaskRing from "#lib/cawco/TaskRing.svelte";
  import type { MarkStatus } from "#lib/cawco/TreeMark.svelte";
  import TaskActivity from "#lib/cawco/tasks/TaskActivity.svelte";
  import Composer from "#lib/cawco/transcript/Composer.svelte";
  import { ComposerDraft } from "#lib/cawco/transcript/composer-draft.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: the kit's compound menu, as every menu of the app imports it
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import {
    IconArrowRight,
    IconArrowUpRight,
    IconChevronDown,
    IconChevronLeft,
    IconColumns,
    IconDocument,
    IconDot,
    IconError,
    IconLink,
    IconMinusCircle,
    IconMore,
    IconNeedsYou,
    IconSuccess,
    IconTaskList,
    IconToolTodo,
    IconWarningTriangle,
    IconWorking,
  } from "#lib/icons.js";
  import { formatDistanceToNow } from "#lib/utils/time.js";
  import { sessionName } from "./session-name";
  import { type NameOf, placeOf } from "./task-state-line";

  type Tab = "review" | "session" | "details" | "activity";

  let {
    task,
    stages,
    history,
    page = false,
    tab: startTab = null,
    tail = [],
    tool = null,
    nameOf = sessionName,
  }: {
    task: TaskView;
    stages: StagesView;
    history: TaskHistoryEvent[];
    /** The session's last turns, flat: the Session tab's tail. */
    tail?: string[];
    /** The tool its session is running, while it runs. */
    tool?: string | null;
    /** A session's name; the fleet's when left out. */
    nameOf?: NameOf;
    /** A phone: the task is its own page, with Back. */
    page?: boolean;
    /** The tab it opens on; null: the default for its state. */
    tab?: Tab | null;
  } = $props();

  const newest = $derived(task.attempts[0] ?? null);
  const live = $derived(task.liveAttempt);
  const failed = $derived(task.lastAttemptFailed && !live);
  const review = $derived(reviewOf(task));
  const reviewable = $derived(task.kind === "you" || review !== null || failed);
  const cantStart = $derived(
    task.startProblem && !live ? task.startProblem : null
  );
  const deciding = $derived(task.kind === "you");

  /** Review while there is one; else Session while one is live or failed or refused; else Details. */
  const fallback = $derived.by<Tab>(() => {
    if (task.kind === "you" || (review && !failed && !live)) {
      return "review";
    }
    return live || failed || cantStart ? "session" : "details";
  });
  /** A session's status word's mark tone, as TaskPane's session rows take it. */
  const TONE: Record<string, MarkStatus> = {
    Working: "live",
    Done: "done",
    Failed: "fail",
  };
  let picked = $state<Tab | null>(untrack(() => startTab));
  const view = $derived<Tab>(picked ?? fallback);

  const STAGE_GLYPH = {
    todo: IconDot,
    active: IconWorking,
    waiting: IconDot,
    you: IconNeedsYou,
    done: IconSuccess,
    dropped: IconMinusCircle,
  } as const;
  const kind = $derived(task.kind ?? "todo");
  const StageGlyph = $derived(STAGE_GLYPH[kind]);

  /** The session row: its mark's tone and its state word. */
  const sessionState = $derived.by(() => {
    if (!newest) {
      return null;
    }
    if (live) {
      return { status: "live" as const, word: "Working" };
    }
    if (newest.state === "failed") {
      return { status: "fail" as const, word: "Failed" };
    }
    if (newest.state === "cancelled") {
      return { status: "idle" as const, word: "Stopped" };
    }
    return { status: "done" as const, word: "Done" };
  });
  /** The Session tab's composer: its draft, and the room its foot stands in. */
  const sayDraft = new ComposerDraft();
  let sayFoot = $state(0);
  /**
   * The session's state word, unless it is the stage's own name (a live
   * session in Working, a finished one in Done): the pane says its stage
   * once, on its chip.
   */
  const rowWord = $derived(
    sessionState &&
      sessionState.word.toLowerCase() !== stageLabel(task.stage).toLowerCase()
      ? sessionState.word
      : null
  );
  const shownName = $derived(newest ? nameOf(newest.instanceId) : "");
  const age = $derived(
    newest
      ? formatDistanceToNow(new Date(newest.endedAt ?? newest.startedAt))
      : ""
  );

  const approveTo = $derived(
    deciding ? (approveTarget(stages, task.stage)?.name ?? null) : null
  );
  const backTo = $derived(
    deciding ? (sendBackTarget(stages, task.stage)?.name ?? null) : null
  );
  const hasFoot = $derived(deciding || failed || !!cantStart);

  const result = $derived(review?.result ?? null);
  const DETAIL_PARTS = $derived([
    {
      glyph: IconDocument,
      title: "Description",
      text: task.description || null,
    },
    {
      glyph: IconSuccess,
      title: "Acceptance criteria",
      text: task.acceptance || null,
    },
  ]);
  const todosDone = $derived(task.todos.filter((todo) => todo.done).length);
</script>

{#snippet arrowLabel(verb: string, to: string)}
  <span>{verb}</span>
  <IconArrowRight
    aria-hidden="true"
    class="arrow-mark size-3"
    data-box
    data-arrow-mark
  />
  <span>{stageLabel(to)}</span>
{/snippet}

{#snippet more(withMoves: boolean)}
  <DropdownMenu.Root>
    <DropdownMenu.Trigger>
      {#snippet child({ props })}
        <Button
          {...props}
          aria-label="More for {task.id}"
          size="icon-sm"
          variant="ghost"
        >
          <IconMore />
        </Button>
      {/snippet}
    </DropdownMenu.Trigger>
    <DropdownMenu.Content align="start" class="w-56">
      {#if withMoves}
        {#each stages.stages.filter((stage) => stage.name !== task.stage) as stage (stage.name)}
          <DropdownMenu.Item>
            <IconArrowRight />
            <span>Move to {stageLabel(stage.name)}</span>
          </DropdownMenu.Item>
        {/each}
        <DropdownMenu.Separator />
      {/if}
      {#if !(failed || cantStart)}
        <DropdownMenu.Item>
          <IconWorking />
          <span>Try again</span>
        </DropdownMenu.Item>
      {/if}
      {#if newest}
        <DropdownMenu.Item>
          <IconArrowUpRight />
          <span>Open session</span>
        </DropdownMenu.Item>
      {/if}
      <DropdownMenu.Item>
        <IconTaskList />
        <span>Comment without moving</span>
      </DropdownMenu.Item>
      <DropdownMenu.Item>
        <IconMinusCircle />
        <span>Drop</span>
      </DropdownMenu.Item>
    </DropdownMenu.Content>
  </DropdownMenu.Root>
{/snippet}

{#snippet body()}
  <div class="pane" data-task-pane-next={task.id} data-tab={view}>
    <header data-slot="head" class="head">
      <h2 data-slot="title" class="title">
        <button
          class="title-button press-tint focus-inset"
          title="Edit the title"
          type="button">{task.title}</button
        >
      </h2>
      <div data-slot="chips" class="chips">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <button
                {...props}
                aria-label="Stage: {stageLabel(task.stage)}"
                class="kit-chip touch-hit chip"
                data-stage-chip
                data-kind={kind}
                type="button"
              >
                <StageGlyph
                  aria-hidden="true"
                  class="chip-glyph"
                  data-breath={kind === "active" && live ? "" : undefined}
                />
                <span class="chip-label">{stageLabel(task.stage)}</span>
                <IconChevronDown
                  aria-hidden="true"
                  class="chip-chevron"
                  data-box
                />
              </button>
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="start" class="w-48">
            {#each stages.stages as stage (stage.name)}
              {@const Glyph = STAGE_GLYPH[stage.kind]}
              <DropdownMenu.Item disabled={stage.name === task.stage}>
                <Glyph />
                <span>{stageLabel(stage.name)}</span>
              </DropdownMenu.Item>
            {/each}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
        <button
          aria-label="Labels"
          class="kit-chip touch-hit chip"
          type="button"
        >
          <IconColumns aria-hidden="true" class="chip-glyph" />
          <span class="chip-label"
            >{task.labels.length > 0
              ? task.labels.join(" · ")
              : "Add label"}</span
          >
          <IconChevronDown aria-hidden="true" class="chip-chevron" data-box />
        </button>
      </div>
      {#if newest && sessionState}
        <div
          data-slot="session-row"
          class="session-row mark-line"
          data-status={sessionState.status}
        >
          <SessionMark
            id={newest.instanceId}
            place={placeOf(newest.instanceId)}
            status={sessionState.status}
          />
          <span class="session-name">{shownName}</span>
          {#if rowWord}
            <span class="session-word">{rowWord}</span>
          {:else}
            <!-- The stage's chip already says it; the row reads it out, its
                 mark echoes while it works. -->
            <span class="sr-only">{sessionState.word}</span>
          {/if}
          <span data-slot="num" class="session-age num">{age}</span>
        </div>
        {#if failed && newest.endedHow}
          <p data-slot="ended" class="ended">{newest.endedHow}</p>
        {/if}
      {/if}
      {#if cantStart}
        <p data-slot="refusal" class="refusal mark-line">
          <span class="mark-cell"
            ><IconWarningTriangle
              aria-hidden="true"
              class="refusal-glyph"
            /></span
          >
          <span
            ><span class="refusal-word">Couldn't start</span> · {cantStart}</span
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
        <TabsList aria-label="Task">
          {#if reviewable}
            <TabItem label="Review" value="review" />
          {/if}
          <TabItem label="Session" value="session" />
          <TabItem label="Details" value="details" />
          <TabItem label="Activity" value="activity" />
        </TabsList>
      </Tabs>
    </header>

    <div
      data-slot="content"
      class="content kit-edge-fade-block"
      data-content={view}
    >
      {#if view === "review"}
        <section aria-label="Review {task.id}" class="review" data-review-stage>
          {#if result}
            <p class="summary">{result.summary}</p>
            {#if result.check.length > 0}
              <p class="check">
                <span class="check-label">Check:</span>
                {result.check.join(" · ")}
              </p>
            {/if}
            {#if result.artifacts.length > 0}
              <div class="attachments">
                {#each result.artifacts as one, index (index)}
                  {@const Glyph = one.kind === "link" ? IconLink : IconDocument}
                  <a
                    class="attachment mark-line press-tint focus-inset"
                    href="?file={index}"
                  >
                    <Glyph aria-hidden="true" class="attachment-glyph" />
                    <span class="attachment-name"
                      >{one.name}{#if one.kind === "link"}
                        · github.com{/if}</span
                    >
                  </a>
                {/each}
              </div>
            {/if}
          {:else if failed && newest}
            <p class="summary muted">
              It handed nothing in before it stopped. The Session tab has where
              it got to.
            </p>
          {/if}
        </section>
      {:else if view === "session"}
        <section aria-label="Session" class="session" data-session-tab>
          {#if newest && sessionState}
            {#if page}
              <ol class="attempts">
                {#each task.attempts as attempt (attempt.workItemId)}
                  {@const word = attemptWord(attempt.state)}
                  <li class="attempt mark-line">
                    <SessionMark
                      id={attempt.instanceId}
                      place={placeOf(attempt.instanceId)}
                      status={TONE[word] ?? "idle"}
                    />
                    <span class="session-name"
                      >{nameOf(attempt.instanceId)}</span
                    >
                    <span class="session-word" data-word={word}>{word}</span>
                    <span data-slot="num" class="session-age num"
                      >{formatDistanceToNow(
                        new Date(attempt.endedAt ?? attempt.startedAt)
                      )}</span
                    >
                  </li>
                {/each}
              </ol>
              <Button class="open-session" size="sm" variant="outline">
                <span>Open session</span>
                <IconArrowUpRight data-box />
              </Button>
            {:else}
              <div class="peek-head mark-line">
                <span
                  class="status mark-line"
                  data-box
                  data-status={sessionState.status}
                >
                  {#if sessionState.status === "live"}
                    <IconWorking aria-hidden="true" class="status-glyph" />
                  {:else if sessionState.status === "fail"}
                    <IconError aria-hidden="true" class="status-glyph" />
                  {:else}
                    <IconSuccess aria-hidden="true" class="status-glyph" />
                  {/if}
                  <span>{sessionState.word}</span>
                </span>
                {#if live && tool}
                  <span class="tool">{tool}</span>
                {/if}
                <Button class="open" data-box size="sm" variant="ghost">
                  <span>Open</span>
                  <IconArrowUpRight data-box />
                </Button>
              </div>
              {#if live}
                <div class="plan">
                  <p class="plan-head mark-line">
                    <TaskRing done={todosDone} total={task.todos.length} />
                    <span>Plan</span>
                    <span data-slot="num" class="num"
                      >{todosDone}/{task.todos.length}</span
                    >
                  </p>
                  <ol class="plan-list">
                    {#each task.todos.slice(0, 5) as todo (todo.path)}
                      <li data-done={todo.done || undefined}>{todo.text}</li>
                    {/each}
                  </ol>
                </div>
              {/if}
              <ol class="turns">
                {#each tail as turn, index (index)}
                  <li>{turn}</li>
                {/each}
              </ol>
              <!-- The session's own Composer, words alone: talking to the agent
                   is this tab's, the decision is the foot's. -->
              <div
                data-slot="say"
                class="say"
                style:block-size="calc({sayFoot}px + var(--space-3))"
              >
                <Composer
                  agentName={shownName}
                  attach={false}
                  draft={sayDraft}
                  onfoot={(foot) => {
                    sayFoot = foot.stack;
                  }}
                  onstop={() => undefined}
                  onsubmit={() => undefined}
                  placeholder="Message {shownName}"
                />
              </div>
            {/if}
          {:else}
            <EmptyState
              class="session-empty"
              icon={IconWorking}
              title="No session yet"
            >
              {#snippet action()}
                {#if !cantStart}
                  <Button size="sm" variant="outline">Start a session</Button>
                {/if}
              {/snippet}
            </EmptyState>
          {/if}
        </section>
      {:else if view === "details"}
        <section aria-label="Details" class="details">
          {#each DETAIL_PARTS as part (part.title)}
            {@const Glyph = part.glyph}
            <div class="part">
              <h3 class="part-head mark-line">
                <Glyph aria-hidden="true" class="part-glyph" /><span
                  >{part.title}</span
                >
              </h3>
              {#if part.text}
                <p class="part-text">{part.text}</p>
              {:else}
                <p class="part-text muted">None yet.</p>
              {/if}
            </div>
          {/each}
          <div class="part">
            <h3 class="part-head mark-line">
              <IconToolTodo aria-hidden="true" class="part-glyph" />
              <span>To-dos</span>
              {#if task.todos.length > 0}
                <span data-slot="num" class="part-count num"
                  >{todosDone}/{task.todos.length}</span
                >
              {/if}
            </h3>
            <ol class="todo-list">
              {#each task.todos as todo (todo.path)}
                <li class="todo mark-line" data-done={todo.done || undefined}>
                  {#if todo.done}<IconSuccess
                      aria-hidden="true"
                      class="todo-glyph done"
                    />{:else}<IconDot
                      aria-hidden="true"
                      class="todo-glyph"
                    />{/if}
                  <span>{todo.text}</span>
                </li>
              {/each}
            </ol>
          </div>
          <div class="part">
            <h3 class="part-head mark-line">
              <IconLink aria-hidden="true" class="part-glyph" /><span
                >Relations</span
              >
            </h3>
            <p class="part-text muted">
              {task.after.length > 0
                ? `After ${task.after.join(", ")}`
                : "None."}
            </p>
          </div>
        </section>
      {:else}
        <section aria-label="Activity" class="activity">
          <TaskActivity
            comments={task.comments}
            {history}
            historyProblem={null}
            oncomment={() => Promise.resolve()}
            reaches={live ? { kind: "live", session: shownName } : null}
            rereadHistory={() => undefined}
          />
        </section>
      {/if}
    </div>

    {#if hasFoot}
      <div data-slot="foot" class="foot" data-band="decide">
        {#if deciding && approveTo && backTo}
          <Button data-approve size="sm"
            >{@render arrowLabel("Approve", approveTo)}</Button
          >
          <Button data-send-back size="sm" variant="outline">Send back</Button>
          {@render more(true)}
        {:else}
          <Button size="sm">Try again</Button>
          {@render more(true)}
        {/if}
      </div>
    {/if}
  </div>
{/snippet}

{#if page}
  <section aria-label="Task {task.id}" class="task-page">
    <header data-slot="page-head" class="page-head">
      <Button size="sm" variant="ghost">
        <IconChevronLeft />
        <span>Board</span>
      </Button>
      <span class="page-id">{task.id}</span>
    </header>
    {@render body()}
  </section>
{:else}
  <SideSurface
    class="task-card"
    label="Task {task.id}"
    onclose={() => undefined}
    recessed={false}
    title={task.id}
  >
    {@render body()}
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
  .pane {
    --pane-inline: var(--space-3);
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-block-size: 0;
    overflow: hidden;
  }
  .task-page .pane {
    --pane-inline: var(--space-5);
  }
  .head {
    display: flex;
    flex: none;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2) var(--pane-inline) var(--space-2);
  }
  .title {
    margin: 0;
    font: var(--type-title);
    letter-spacing: var(--track-title);
  }
  .title-button {
    display: block;
    inline-size: calc(100% + var(--space-2));
    margin-inline: calc(var(--space-1) * -1);
    padding: var(--space-1);
    border-radius: var(--radius-sm);
    font: inherit;
    color: var(--ink-strong);
    text-align: start;
    text-wrap: balance;
    overflow-wrap: anywhere;
  }
  @media (hover: hover) and (pointer: fine) {
    .title-button:hover {
      background: var(--surface-hover);
    }
  }
  /* One group of equal setting chips (New-session dialog: 30px, 8px
     radius, a 16px glyph, a 12px chevron), wrapping as a unit. */
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }
  .chip {
    gap: var(--space-1);
    padding-inline: var(--space-2);
  }
  .chip :global(.chip-glyph) {
    flex: none;
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
    color: var(--ink-muted);
  }
  .chip[data-kind="you"] :global(.chip-glyph) {
    color: var(--status-attn-glyph);
  }
  .chip[data-kind="active"] :global(.chip-glyph) {
    color: var(--status-live-glyph);
  }
  .chip[data-kind="done"] :global(.chip-glyph) {
    color: var(--status-done-glyph);
  }
  @media (prefers-reduced-motion: no-preference) {
    .chip :global([data-breath]) {
      animation: breath var(--breath) var(--ease-in-out) infinite;
    }
  }
  @keyframes breath {
    50% {
      opacity: 0.45;
    }
  }
  .chip-label {
    min-inline-size: 0;
    overflow: clip;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chip :global(.chip-chevron) {
    flex: none;
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
    color: var(--ink-subtle);
  }
  /* One session row (Identity marks, compact): mark, name, its state word, age at the end. */
  .session-row,
  .attempt {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-block-size: var(--c-btn-h-xs);
    min-inline-size: 0;
  }
  .session-name {
    min-inline-size: 0;
    overflow: clip;
    font: var(--type-label);
    color: var(--ink-strong);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .session-word {
    flex: none;
    font: var(--type-label);
    color: var(--ink-muted);
  }
  .session-row[data-status="live"] .session-word,
  .session-word[data-word="Working"] {
    color: var(--status-live-ink);
  }
  .session-row[data-status="fail"] .session-word,
  .session-word[data-word="Failed"] {
    color: var(--status-fail-ink);
  }
  .session-age {
    flex: none;
    margin-inline-start: auto;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .ended {
    margin: 0;
    padding-inline-start: calc(18px + var(--space-2));
    font: var(--type-body);
    color: var(--status-fail-ink);
    overflow-wrap: anywhere;
  }
  .refusal {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    margin: 0;
    font: var(--type-body);
    color: var(--ink-strong);
    overflow-wrap: anywhere;
  }
  .refusal :global(.refusal-glyph) {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
    color: var(--status-attn-glyph);
  }
  .refusal-word {
    font-weight: var(--weight-strong);
    color: var(--status-attn-ink);
  }
  /* Only the chosen tab scrolls, under the kit's edge fade: no hairlines. */
  .content {
    flex: 1 1 auto;
    min-block-size: 0;
    padding: var(--space-2) var(--pane-inline) var(--space-5);
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .review,
  .session,
  .details {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .summary,
  .check,
  .part-text {
    margin: 0;
    font: var(--type-body);
    color: var(--ink-strong);
    text-wrap: pretty;
    overflow-wrap: anywhere;
  }
  .check {
    color: var(--ink-muted);
  }
  .check-label {
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
  }
  .muted {
    color: var(--ink-muted);
  }
  .attachments {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-3);
  }
  .attachment {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    max-inline-size: 100%;
    min-block-size: var(--c-btn-h-xs);
    padding-inline: var(--space-1);
    margin-inline: calc(var(--space-1) * -1);
    border-radius: var(--radius-sm);
    font: var(--type-label);
    color: var(--ink-muted);
    text-decoration: none;
  }
  .attachment :global(.attachment-glyph) {
    flex: none;
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
  }
  .attachment-name {
    min-inline-size: 0;
    overflow: clip;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .peek-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
  }
  .status {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font: var(--type-label);
  }
  .status :global(.status-glyph) {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
  }
  .status[data-status="live"] {
    color: var(--status-live-ink);
  }
  .status[data-status="fail"] {
    color: var(--status-fail-ink);
  }
  .status[data-status="done"] {
    color: var(--status-done-ink);
  }
  .tool {
    min-inline-size: 0;
    font: var(--type-code);
    font-variant-ligatures: none;
    color: var(--ink-muted);
    overflow-wrap: anywhere;
  }
  .peek-head :global(.open) {
    margin-inline-start: auto;
  }
  .plan {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    background: var(--surface-well);
    box-shadow: inset 0 0 0 1px var(--border-well);
  }
  .plan-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .plan-head .num {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .plan-list,
  .turns,
  .attempts,
  .todo-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .plan-list li {
    font: var(--type-body);
    color: var(--ink-strong);
  }
  .plan-list li[data-done] {
    color: var(--ink-muted);
  }
  .turns li {
    font: var(--type-body);
    color: var(--ink-strong);
    text-wrap: pretty;
  }
  .say {
    position: relative;
    flex: none;
    inline-size: 100%;
  }
  .content :global(.session-empty) {
    padding-block: var(--space-3);
  }
  .part {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  /* Caw's panel's head recipe: a 16px glyph in ink-muted, the title in label, a count in meta. */
  .part-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .part-head :global(.part-glyph) {
    flex: none;
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
    color: var(--ink-muted);
  }
  .part-count {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .todo {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font: var(--type-body);
    color: var(--ink-strong);
  }
  .todo[data-done] {
    color: var(--ink-muted);
  }
  .todo :global(.todo-glyph) {
    flex: none;
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
    color: var(--ink-subtle);
  }
  .todo :global(.todo-glyph.done) {
    color: var(--status-done-glyph);
  }
  /* The decision, pinned at the pane's foot over the safe area. */
  .foot {
    display: flex;
    flex: none;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--pane-inline);
    padding-block-end: max(var(--space-3), env(safe-area-inset-bottom));
  }
  .foot :global(.arrow-mark) {
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
  }
</style>
