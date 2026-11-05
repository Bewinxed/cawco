<script lang="ts">
  /**
   * A task opened from its project's board, as the stage and the ledger.
   * From 900 up: the head, then the stage (whatever this stage kind makes
   * central, at its own size) beside the ledger strip, which holds its
   * place while the stage scrolls; File swaps the strip to its second page
   * and the stage stays; a session opened stands third, the stage narrowed.
   * Under 900: the task is its own scroller, the stage full-bleed and the
   * ledger a drawer peeking from the foot with the two moves on its handle;
   * a session opens in the task's place with Back.
   *
   * Its state arrives as props: the hub's read of the task (null before the
   * first), the move in flight, the session's ask, whether the hub is live.
   * Where the person goes inside it (the strip's page, the session beside,
   * the drawer's stop, the question under Send back) is bindable, so a press
   * moves it and a story can set it.
   */
  import { taskStageLedgerWords as words } from "@cawco/core/words/task-stage-ledger";
  import { MediaQuery } from "svelte/reactivity";
  import { crossIn } from "#lib/cawco/motion/curves.svelte.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { livenessOf } from "./derive";
  import FilePage from "./FilePage.svelte";
  import Ledger from "./Ledger.svelte";
  import PhoneLedger from "./PhoneLedger.svelte";
  import type {
    Liveness,
    MoveState,
    SaveState,
    SessionAsk,
    TaskRead,
  } from "./records";
  import SessionBeside from "./SessionBeside.svelte";
  import Stage from "./Stage.svelte";
  import TaskHead from "./TaskHead.svelte";

  let {
    task,
    now,
    move = "idle",
    refusal = null,
    ask = null,
    stale = null,
    back = null,
    pending = false,
    fileLoading = false,
    save = "idle",
    savedAs = null,
    fileRefusal = null,
    note = $bindable(""),
    asking = $bindable(false),
    historyOpen = $bindable(false),
    pane = $bindable("ledger"),
    session = $bindable("closed"),
    stop = $bindable("peek"),
    writing = $bindable(false),
    draft = $bindable(""),
    onpasson,
    onsendback,
    onanswer,
    onopenwait,
    onback,
    onretry,
    onreopen,
    onstart,
    onsave,
  }: {
    /** The hub's read of the task; null until the first read. */
    task: TaskRead | null;
    /** The clock the read is set at, ms epoch. */
    now: number;
    move?: MoveState;
    refusal?: string | null;
    ask?: SessionAsk | null;
    /** When the hub last answered, while it is not live. */
    stale?: number | null;
    /** The task this one was opened in the place of: Back returns to it. */
    back?: string | null;
    /** Retry, Reopen or Start attempt pressed, the hub not yet answered. */
    pending?: boolean;
    fileLoading?: boolean;
    save?: SaveState;
    savedAs?: string | null;
    fileRefusal?: string | null;
    note?: string;
    asking?: boolean;
    historyOpen?: boolean;
    /** The strip's page: the ledger, or File. */
    pane?: "ledger" | "file";
    /** The session beside: closed, its transcript, being read, or stopped answering. */
    session?: "closed" | "live" | "loading" | "stopped";
    /** The phone drawer's stop. */
    stop?: "peek" | "full";
    writing?: boolean;
    draft?: string;
    onpasson?: () => void;
    onsendback?: () => void;
    onanswer?: (word: "approve" | "deny") => void;
    onopenwait?: (target: string) => void;
    onback?: () => void;
    onretry?: () => void;
    onreopen?: () => void;
    onstart?: () => void;
    onsave?: () => void;
  } = $props();

  const desk = new MediaQuery("min-width: 900px", true);
  const form = $derived(desk.current ? "desk" : "phone");

  let root = $state<HTMLElement | null>(null);

  const show = $derived.by(() => {
    if (task === null) {
      return null;
    }
    return move === "landed" ? "outputs" : task.show;
  });
  const liveness = $derived<Liveness | null>(
    task === null ? null : livenessOf(task, move, ask)
  );
  const passOn = $derived(
    task?.kind === "you" && move !== "landed"
      ? { pending: move === "passing" }
      : null
  );
  const sessionOpen = $derived(session !== "closed");
  const sessionName = $derived(task?.who?.session ?? task?.title ?? "");

  const toggleSession = () => {
    session = sessionOpen ? "closed" : "live";
  };
  const openFile = () => {
    pane = "file";
    stop = "full";
  };
</script>

{#snippet beside(where: "desk" | "phone")}
  <SessionBeside
    form={where}
    lines={task?.transcript ?? []}
    onclose={toggleSession}
    onretry={() => {
      session = "loading";
    }}
    session={sessionName}
    state={session === "closed" ? "live" : session}
  />
{/snippet}

{#snippet head()}
  {#if task}
    <TaskHead
      {back}
      closed={task.kind === "done" || task.kind === "dropped"}
      {form}
      kind={words.kinds[task.kind]}
      {onback}
      {onpasson}
      onsession={toggleSession}
      {passOn}
      {sessionOpen}
      stage={move === "landed" ? "done" : task.stage}
      title={task.title}
    />
  {:else}
    <div aria-busy="true" class="flex h-c-top-bar-h items-center gap-space-3">
      <div class="w-1/3"><Skeleton height="x-height" /></div>
    </div>
  {/if}
{/snippet}

{#snippet stage()}
  <Stage
    {now}
    {onopenwait}
    {onreopen}
    {onretry}
    {onstart}
    ontranscript={toggleSession}
    {pending}
    {show}
    {task}
  />
{/snippet}

{#snippet strip()}
  {#if task === null}
    <div aria-busy="true" class="flex flex-col gap-space-4">
      <Skeleton height="control" />
      <Skeleton height="control" />
      <Skeleton height="block" />
      <Skeleton height="row" />
      <Skeleton height="item" />
    </div>
  {:else if pane === "file"}
    <div in:crossIn>
      <FilePage
        bind:draft
        bind:writing
        loading={fileLoading}
        onback={() => {
          pane = "ledger";
        }}
        {onsave}
        {onstart}
        refusal={fileRefusal}
        {save}
        {savedAs}
        {task}
      />
    </div>
  {:else}
    <div in:crossIn>
      <Ledger
        {ask}
        liveness={liveness ?? task.liveness}
        bind:asking
        bind:historyOpen
        bind:note
        {move}
        movesOn={form === "desk" ? "strip" : "handle"}
        {now}
        {onanswer}
        onfile={openFile}
        {onopenwait}
        {onpasson}
        {onretry}
        {onsendback}
        onsession={toggleSession}
        {refusal}
        {stale}
        {task}
      />
    </div>
  {/if}
{/snippet}

{#if form === "desk"}
  <div
    class="flex min-h-dvh flex-col gap-space-3 bg-surface-recess pe-space-6 ps-space-7 pb-space-6"
    data-slot="task"
  >
    {@render head()}
    <div
      class="grid flex-1 grid-cols-(--task-cols) items-start gap-space-group"
      style:--task-cols={sessionOpen
        ? "minmax(0, 1fr) var(--c-ledger-min-w) var(--c-session-beside-w)"
        : "minmax(0, 1fr) minmax(var(--c-ledger-min-w), var(--c-ledger-w))"}
    >
      <main class="min-w-0 pt-space-2">
        {@render stage()}
      </main>
      <aside
        aria-label={words.drawer}
        class="sticky top-space-3 flex max-h-(--strip-max-h) min-w-0 flex-col overflow-y-auto overscroll-contain rounded-panel bg-surface-raised p-space-5 shadow-tile"
        style:--strip-max-h={"calc(100dvh - var(--c-top-bar-h) - var(--space-6))"}
      >
        {@render strip()}
      </aside>
      {#if sessionOpen}
        <aside
          class="sticky top-space-3 flex max-h-(--strip-max-h) min-w-0 flex-col overflow-y-auto overscroll-contain rounded-panel bg-surface-raised p-space-5 shadow-tile"
          in:crossIn
          style:--strip-max-h={"calc(100dvh - var(--c-top-bar-h) - var(--space-6))"}
        >
          {@render beside("desk")}
        </aside>
      {/if}
    </div>
  </div>
{:else if sessionOpen}
  <div
    class="flex h-dvh flex-col overflow-y-auto bg-surface-recess px-space-4 pb-space-6"
    data-slot="task"
    in:crossIn
  >
    {@render beside("phone")}
  </div>
{:else}
  <div
    bind:this={root}
    class="relative flex h-dvh flex-col overflow-clip bg-surface-recess"
    data-slot="task"
  >
    <div class="flex-none px-space-4">{@render head()}</div>
    <main
      class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-space-4 pt-space-2 pb-(--peek-room)"
      style:--peek-room={"calc(var(--c-ledger-peek) + var(--space-6))"}
    >
      {@render stage()}
    </main>
    <PhoneLedger
      {ask}
      bind:asking
      bind:stop
      container={root}
      {liveness}
      {move}
      {onanswer}
      {onpasson}
      stale={stale !== null}
      {task}
    >
      {@render strip()}
    </PhoneLedger>
  </div>
{/if}
