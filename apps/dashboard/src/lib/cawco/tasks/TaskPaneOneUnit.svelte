<script lang="ts">
  /**
   * PROPOSED: the task pane as one unit (taskpane advisor §1). The head
   * stands still: the title, one group of setting chips (the stage, the
   * labels), one session row, and the hub's refusal when it could not
   * start. Then four tabs, Review · Session · Details · Activity (Review
   * only while there is one); only the chosen tab scrolls, under the kit's
   * edge fade, never between hairlines. The decision is the pane's foot,
   * right under what it decides on (pinned once the tab runs long), only
   * while there is one: Approve and Send back with More, or
   * Try again with More. The stage is said once, on its chip; the session
   * row says the session's own state.
   */
  import type { DecisionCard } from "@cawco/core/decisions";
  import { untrack } from "svelte";
  import {
    approveTarget,
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
  import TaskActivity from "#lib/cawco/tasks/TaskActivity.svelte";
  import Composer from "#lib/cawco/transcript/Composer.svelte";
  import { ComposerDraft } from "#lib/cawco/transcript/composer-draft.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    chipsVariants,
    chipVariants,
  } from "#lib/components/ui/chip/index.js";
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
    IconEye,
    IconHistory,
    IconInfo,
    IconLink,
    IconMinusCircle,
    IconMore,
    IconNeedsYou,
    IconSuccess,
    IconTaskList,
    IconToolTodo,
    IconTranscript,
    IconWorking,
  } from "#lib/icons.js";
  import { formatDistanceToNow } from "#lib/utils/time.js";
  // The failure and blocked marks are solid Solar bold (the failure-mark
  // ruling): no warning triangle and no x in a circle marks a status.
  import IconFailed from "~icons/solar/danger-circle-bold";
  import IconBlocked from "~icons/solar/forbidden-circle-bold";
  import type { NameOf, PlaceOf } from "./task-state-line";

  type Tab = "review" | "session" | "details" | "activity";

  let {
    task,
    stages,
    history,
    page = false,
    tab: startTab = null,
    tail = [],
    tool = null,
    asked = null,
    nameOf,
    placeOf,
  }: {
    task: TaskView;
    stages: StagesView;
    history: TaskHistoryEvent[];
    /** The session's last turns, flat: the Session tab's tail. */
    tail?: string[];
    /** The tool its session is running, while it runs. */
    tool?: string | null;
    /**
     * The decision its agent asks with the review: the open card of the
     * decision page its attempt handed in (a result artifact of kind
     * `artifact`, read with `readDecision`). Its options stand over
     * Approve and Send back, so the agent offers whatever moves it has.
     */
    asked?: DecisionCard | null;
    /** A session's name: the fleet's (session-name.ts) or a sheet's fixture. */
    nameOf: NameOf;
    /** Where a session works: the fleet's (session-name.ts) or a sheet's fixture. */
    placeOf: PlaceOf;
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
   * The session's state word only when it is news the stage cannot carry:
   * it failed or was stopped. Working and Done are what the stage already
   * says (a task in Review was handed in by a session that is done), so the
   * pane says one status, on its stage (owner pin: "why are you mentioning
   * 'working' twice here?").
   */
  const rowWord = $derived(
    sessionState &&
      (sessionState.status === "fail" || sessionState.status === "idle")
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

  /** The pane's inline padding: the side card's, or a phone's page's. */
  const inline = $derived(page ? "px-space-5" : "px-space-3");
  /** A 16px glyph that leads its words. */
  const GLYPH = "size-icon-md flex-none";
  /** Body words on the pane: strong ink, wrapping whole. */
  const PROSE = "m-0 type-body text-ink-strong text-pretty wrap-anywhere";
  /** A list of the pane's: its own rows, no markers. */
  const LIST = "m-0 flex list-none flex-col gap-space-2 p-0";
</script>

{#snippet arrowLabel(verb: string, to: string)}
  <span>{verb}</span>
  <IconArrowRight
    aria-hidden="true"
    class="size-icon-sm"
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
    <DropdownMenu.Content align="start" width="wide">
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
  <div
    class="flex min-h-0 flex-auto flex-col overflow-hidden"
    data-task-pane-next={task.id}
    data-tab={view}
  >
    <header
      data-slot="head"
      class={["flex flex-none flex-col gap-space-2 py-space-2", inline]}
    >
      <h2 data-slot="title" class="m-0 type-title tracking-title">
        <button
          class="press-tint focus-inset -mx-space-1 box-content block w-full rounded-sm p-space-1 font-inherit text-start text-balance wrap-anywhere text-ink-strong hover:bg-surface-hover"
          title="Edit the title"
          type="button">{task.title}</button
        >
      </h2>
      <!-- One group of equal setting chips (New-session dialog: 30px, 8px
           radius, a 16px glyph, a 12px chevron), wrapping as a unit. -->
      <div data-slot="chips" class="flex flex-wrap gap-space-1">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <button
                {...props}
                aria-label="Stage: {stageLabel(task.stage)}"
                class={chipVariants({
                  variant: "setting",
                  class: "gap-space-1",
                })}
                data-stage-chip
                data-kind={kind}
                type="button"
              >
                <StageGlyph
                  aria-hidden="true"
                  class={[
                    "text-ink-muted",
                    kind === "you" && "text-status-attn-glyph",
                    kind === "active" && "text-status-live-glyph",
                    kind === "done" && "text-status-done-glyph",
                    kind === "active" && live && "motion-safe:animate-breath",
                  ]}
                  data-breath={kind === "active" && live ? "" : undefined}
                />
                <span data-slot="chip-label">{stageLabel(task.stage)}</span>
                <IconChevronDown
                  aria-hidden="true"
                  data-box
                  data-slot="chevron"
                />
              </button>
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="start" width="regular">
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
          class={chipVariants({ variant: "setting", class: "gap-space-1" })}
          type="button"
        >
          <IconColumns aria-hidden="true" class="text-ink-muted" />
          <span data-slot="chip-label"
            >{task.labels.length > 0
              ? task.labels.join(" · ")
              : "Add label"}</span
          >
          <IconChevronDown aria-hidden="true" data-box data-slot="chevron" />
        </button>
      </div>
      {#if newest && sessionState}
        <div
          data-slot="session-row"
          class="group/row mark-line flex min-h-c-btn-h-xs min-w-0 items-center gap-space-2"
          data-status={sessionState.status}
        >
          <!-- One session row (Identity marks, compact): mark, name, its
               state word, age at the end. -->
          <SessionMark
            id={newest.instanceId}
            place={placeOf(newest.instanceId)}
            status={sessionState.status}
          />
          <span
            class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-label text-ink-strong"
            >{shownName}</span
          >
          {#if rowWord}
            <span
              data-slot="session-word"
              class="flex-none type-label text-ink-muted group-data-[status=fail]/row:text-status-fail-ink"
              >{rowWord}</span
            >
          {:else}
            <!-- The stage's chip already says it; the row reads it out, its
                 mark echoes while it works. -->
            <span class="sr-only">{sessionState.word}</span>
          {/if}
          <span
            data-slot="num"
            class="num ms-auto flex-none type-meta text-ink-muted">{age}</span
          >
        </div>
        {#if failed && newest.endedHow}
          <p
            data-slot="ended"
            style:--ended-in="calc(var(--c-row-mark) + var(--space-2))"
            class="m-0 ps-(--ended-in) type-body text-status-fail-ink wrap-anywhere"
          >
            {newest.endedHow}
          </p>
        {/if}
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
            ><span class="font-medium text-status-attn-ink">Can't start</span>
            · {cantStart}</span
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
        <!-- Scrollable: a narrow pane keeps each tab's words whole and scrolls
             the track under its edge fade, never cutting a name to "R…". -->
        <TabsList aria-label="Task" scrollable>
          <!-- Each section leads with its glyph (owner pin: "ICONS IN SECTIONS"),
               none of them a glyph its own headings already wear. -->
          {#if reviewable}
            <TabItem icon={IconEye} label="Review" value="review" />
          {/if}
          <TabItem icon={IconTranscript} label="Session" value="session" />
          <TabItem icon={IconInfo} label="Details" value="details" />
          <TabItem icon={IconHistory} label="Activity" value="activity" />
        </TabsList>
      </Tabs>
    </header>

    <!-- Only the chosen tab scrolls, under the kit's edge fade: no
         hairlines. As tall as what it holds, so the decision follows it;
         past the pane's room it gives way and scrolls, the decision then
         pinned under it. -->
    <div
      data-slot="content"
      class={[
        "kit-edge-fade-block min-h-0 flex-initial overflow-y-auto overscroll-contain pt-space-2 pb-space-5",
        inline,
      ]}
      data-content={view}
    >
      {#if view === "review"}
        <section
          aria-label="Review {task.id}"
          class="flex flex-col gap-space-3"
          data-review-stage
        >
          {#if result}
            <p class={PROSE}>{result.summary}</p>
            {#if result.check.length > 0}
              <p class={[PROSE, "text-ink-muted"]}>
                <span class="font-medium text-ink-strong">Check:</span>
                {result.check.join(" · ")}
              </p>
            {/if}
            {#if result.artifacts.length > 0}
              <div class="flex flex-wrap gap-x-space-3 gap-y-space-2">
                {#each result.artifacts as one, index (index)}
                  {@const Glyph = one.kind === "link" ? IconLink : IconDocument}
                  <a
                    class="mark-line press-tint focus-inset -mx-space-1 inline-flex min-h-c-btn-h-xs max-w-full items-center gap-space-1 rounded-sm px-space-1 type-label text-ink-muted no-underline"
                    href="?file={index}"
                  >
                    <Glyph aria-hidden="true" class={GLYPH} />
                    <span
                      class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
                      >{one.name}{#if one.kind === "link"}
                        · github.com{/if}</span
                    >
                  </a>
                {/each}
              </div>
            {/if}
          {:else if failed && newest}
            <p class={[PROSE, "text-ink-muted"]}>
              It handed nothing in before it stopped. The Session tab has where
              it got to.
            </p>
          {/if}
        </section>
      {:else if view === "session"}
        <!-- The session read in place, on a desk and on a phone alike (owner
             pin: the Session tab is the session, not a link to it): what it
             is running, its plan, its last turns and its composer. Its state
             word only when the stage can't carry it (rowWord): the stage
             chip already says Working or Done, said once. -->
        <section
          aria-label="Session"
          class="flex flex-col gap-space-3"
          data-session-tab
        >
          {#if newest && sessionState}
            <div
              class="mark-line flex flex-wrap items-center gap-x-space-3 gap-y-space-2"
            >
              {#if rowWord}
                <span
                  data-slot="status"
                  class="mark-line inline-flex items-center gap-space-1 type-label data-[status=fail]:text-status-fail-ink data-[status=idle]:text-ink-muted"
                  data-box
                  data-status={sessionState.status}
                >
                  {#if sessionState.status === "fail"}
                    <IconFailed aria-hidden="true" class="size-icon-md" />
                  {:else}
                    <IconMinusCircle aria-hidden="true" class="size-icon-md" />
                  {/if}
                  <span>{rowWord}</span>
                </span>
              {/if}
              {#if live && tool}
                <span
                  class="min-w-0 type-code liga-none text-ink-muted wrap-anywhere"
                  >{tool}</span
                >
              {/if}
              <Button class="ms-auto" data-box size="sm" variant="ghost">
                <span>Open</span>
                <IconArrowUpRight data-box />
              </Button>
            </div>
            {#if live}
              <div
                class="flex flex-col gap-space-1 rounded-md bg-surface-well px-space-3 py-space-2 inset-ring inset-ring-border-well"
              >
                <p
                  class="mark-line m-0 flex items-center gap-space-2 type-label text-ink-strong"
                >
                  <TaskRing done={todosDone} total={task.todos.length} />
                  <span>Plan</span>
                  <span data-slot="num" class="num type-meta text-ink-muted"
                    >{todosDone}/{task.todos.length}</span
                  >
                </p>
                <ol class={LIST}>
                  {#each task.todos.slice(0, 5) as todo (todo.path)}
                    <li
                      class="type-body text-ink-strong data-done:text-ink-muted"
                      data-done={todo.done || undefined}
                    >
                      {todo.text}
                    </li>
                  {/each}
                </ol>
              </div>
            {/if}
            <ol class={LIST}>
              {#each tail as turn, index (index)}
                <li class="type-body text-ink-strong text-pretty">{turn}</li>
              {/each}
            </ol>
            <!-- The session's own Composer, words alone: talking to the agent
                 is this tab's, the decision is the foot's. -->
            <div
              data-slot="say"
              class="relative w-full flex-none"
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
          {:else}
            <EmptyState icon={IconWorking} title="No session yet">
              {#snippet action()}
                {#if !cantStart}
                  <Button size="sm" variant="outline">Start a session</Button>
                {/if}
              {/snippet}
            </EmptyState>
          {/if}
        </section>
      {:else if view === "details"}
        <section aria-label="Details" class="flex flex-col gap-space-3">
          {#each DETAIL_PARTS as part (part.title)}
            {@const Glyph = part.glyph}
            <div class="flex flex-col gap-space-2">
              <!-- Caw's panel's head recipe: a 16px glyph in ink-muted, the title in label, a count in meta. -->
              <h3
                class="mark-line m-0 flex items-center gap-space-2 type-label text-ink-strong"
              >
                <Glyph
                  aria-hidden="true"
                  class={[GLYPH, "text-ink-muted"]}
                /><span>{part.title}</span>
              </h3>
              {#if part.text}
                <p class={PROSE}>{part.text}</p>
              {:else}
                <p class={[PROSE, "text-ink-muted"]}>None yet.</p>
              {/if}
            </div>
          {/each}
          <div class="flex flex-col gap-space-2">
            <h3
              class="mark-line m-0 flex items-center gap-space-2 type-label text-ink-strong"
            >
              <IconToolTodo
                aria-hidden="true"
                class={[GLYPH, "text-ink-muted"]}
              />
              <span>To-dos</span>
              {#if task.todos.length > 0}
                <span data-slot="num" class="num type-meta text-ink-muted"
                  >{todosDone}/{task.todos.length}</span
                >
              {/if}
            </h3>
            <ol class={LIST}>
              {#each task.todos as todo (todo.path)}
                <li
                  class="mark-line flex items-center gap-space-2 type-body text-ink-strong data-done:text-ink-muted"
                  data-done={todo.done || undefined}
                >
                  {#if todo.done}<IconSuccess
                      aria-hidden="true"
                      class={[GLYPH, "text-status-done-glyph"]}
                    />{:else}<IconDot
                      aria-hidden="true"
                      class={[GLYPH, "text-ink-subtle"]}
                    />{/if}
                  <span>{todo.text}</span>
                </li>
              {/each}
            </ol>
          </div>
          <div class="flex flex-col gap-space-2">
            <h3
              class="mark-line m-0 flex items-center gap-space-2 type-label text-ink-strong"
            >
              <IconLink
                aria-hidden="true"
                class={[GLYPH, "text-ink-muted"]}
              /><span>Relations</span>
            </h3>
            <p class={[PROSE, "text-ink-muted"]}>
              {task.after.length > 0
                ? `After ${task.after.join(", ")}`
                : "None."}
            </p>
          </div>
        </section>
      {:else}
        <section aria-label="Activity">
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
      <!-- The decision: under what it decides on, clear of the safe area. -->
      <div
        data-slot="foot"
        class={[
          "flex flex-none flex-wrap items-center gap-space-2 pt-space-3 pb-safe-space-3",
          inline,
        ]}
        data-band="decide"
        data-safe-bottom
      >
        {#if deciding && asked}
          <!-- The agent's own decision: its question, then its options as the
               kit's option chips, a press picking it on the agent's page. -->
          <!-- The agent's decision: a line of its own over CawCo's fixed moves. -->
          <fieldset
            class="m-0 flex min-w-0 shrink-0 grow basis-full flex-col gap-space-2 border-0 p-0"
            data-asked={asked.id}
          >
            <legend
              class="p-0 type-label text-ink-strong text-pretty wrap-anywhere"
            >
              {asked.question}
            </legend>
            <ul class={chipsVariants({ class: "m-0 list-none p-0" })}>
              {#each asked.options as option (option.id)}
                <li class="min-w-0 max-w-full">
                  <button
                    class={chipVariants({
                      variant: "option",
                      class: "wrap-anywhere",
                    })}
                    type="button">{option.label}</button
                  >
                </li>
              {/each}
            </ul>
          </fieldset>
        {/if}
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
  <section aria-label="Task {task.id}" class="flex min-h-0 flex-1 flex-col">
    <header
      data-slot="page-head"
      class="flex flex-none items-center gap-space-2 pt-0 pe-space-5 pb-space-2 ps-space-3"
    >
      <Button size="sm" variant="ghost">
        <IconChevronLeft />
        <span>Board</span>
      </Button>
      <span
        class="ms-auto type-meta font-(family-name:--font-mono) liga-none text-ink-subtle"
        >{task.id}</span
      >
    </header>
    {@render body()}
  </section>
{:else}
  <SideSurface
    label="Task {task.id}"
    onclose={() => undefined}
    recessed={false}
    title={task.id}
  >
    {@render body()}
  </SideSurface>
{/if}
