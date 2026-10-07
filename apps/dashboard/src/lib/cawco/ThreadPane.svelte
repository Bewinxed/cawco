<script lang="ts">
  /**
   * A thread with a project's Caw, as a session tab (design §3): the
   * thread's messages shaped into the transcript's session, so the real
   * Transcript draws it, and the group's one composer lent to it. Your
   * words are your turns in the reader's well; Caw's are his turns, his
   * still on the speaker line, the tasks they are about as cards under
   * them; what woke him is a code line. His question is the composer while
   * it waits (it grows into it) and, answered, is drawn as its QuestionCard
   * row; withdrawn, a quiet line says so.
   *
   * Caw sits on the composer: his ledge peek over the pill's top-leading
   * corner, then the thread's status, clipped at the pill's edge. With the
   * lead off, or unable to start, the composer gives way to a line that says
   * why and turns him on.
   *
   * `thread:new:<project>` is a thread not yet started: its first message
   * makes it, and the tab is re-addressed to the thread the hub made.
   */
  import type { CawView, PermissionResult, ThreadMessage } from "@cawco/core";
  import { untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { cawLoop } from "#lib/cawco/feel.svelte.js";
  import { crossIn, crossOut } from "#lib/cawco/motion/curves.svelte.js";
  import { land } from "#lib/cawco/motion/share.svelte.js";
  import {
    Alert,
    AlertAction,
    AlertDescription,
  } from "#lib/components/ui/alert/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { browser } from "$app/env";
  import {
    type BlockedRequest,
    blankSession,
    cawco,
    cawOf,
    configureCaw,
    readThread,
    type SendExtras,
    type SessionState,
    sayInThread,
    startThread,
    submitCommand,
    unwatchPlan,
    watchPlan,
  } from "./client.svelte";
  import Caw, { CAW_HEADROOM, LEDGE_LINE } from "./home/Caw.svelte";
  import CawFace from "./home/CawFace.svelte";
  import { planProgress, planShows } from "./plan/PlanPane.svelte";
  import PlanRing from "./plan/PlanRing.svelte";
  import FolderFiles from "./project/FolderFiles.svelte";
  import {
    listTasks,
    movesFrom,
    moveTask,
    readStages,
    type StageKind,
    type StagesView,
    type TaskSummary,
    type TaskView,
  } from "./project-tasks";
  import SideSplit from "./side/SideSplit.svelte";
  import TaskCard from "./tasks/TaskCard.svelte";
  import TaskSheet from "./tasks/TaskSheet.svelte";
  import { newThreadProjectOf, threadIdOf, threadTabId } from "./thread-tabs";
  import type { ComposerAsk, ComposerFoot } from "./transcript/Composer.svelte";
  import { ComposerDraft } from "./transcript/composer-draft.svelte";
  import FootFade from "./transcript/FootFade.svelte";
  import Transcript from "./transcript/Transcript.svelte";
  import TranscriptSkeleton from "./transcript/TranscriptSkeleton.svelte";
  import { CAW_EVENT, setVoice } from "./transcript/voice";
  import type { Message } from "./types";
  import {
    type ComposerBinding,
    composerBindings,
  } from "./workspace/composer-dock.svelte";
  import { workspace } from "./workspace/workspace.svelte";

  let {
    viewId,
    visible,
    active,
    focused = false,
  }: {
    viewId: string;
    visible: boolean;
    /** Its group's active tab (PaneHost). */
    active: boolean;
    focused?: boolean;
  } = $props();

  const threadId = $derived(threadIdOf(viewId));
  const thread = $derived(cawco.threadOf(viewId) ?? null);
  const projectId = $derived(
    thread?.projectId ?? newThreadProjectOf(viewId) ?? ""
  );

  let paneWidth = $state(0);
  const coarse = new MediaQuery("(pointer: coarse)");
  /** Caw's still box on the composer: 56px at a desk, 48px on a phone. */
  const seatSize = $derived(
    (paneWidth > 0 && paneWidth < 900) || coarse.current ? 48 : 56
  );

  // --- the thread's messages ------------------------------------------------

  /** Null until read; kept by `thread.message` frames from the read on. */
  const messages = $derived<ThreadMessage[] | null>(
    threadId ? cawco.threadMessagesOf(threadId) : []
  );
  let readProblem = $state<string | null>(null);
  $effect(() => {
    const id = threadId;
    const pid = projectId;
    const live = cawco.status === "connected";
    if (!(id && pid && live)) {
      return;
    }
    untrack(() => {
      readThread(pid, id).then(
        () => {
          readProblem = null;
        },
        (error: unknown) => {
          readProblem = error instanceof Error ? error.message : String(error);
        }
      );
    });
  });

  /** One message as the transcript's block (`Message`). */
  function blockOf(message: ThreadMessage): Message {
    const base = {
      id: message.id,
      instanceId: viewId,
      timestamp: new Date(message.createdAt).toISOString(),
    };
    if (message.author === "caw") {
      const metadata = {
        ...(message.tasks?.length ? { tasks: message.tasks } : {}),
        ...(message.files?.length ? { files: message.files } : {}),
      };
      return {
        ...base,
        type: "assistant",
        content: message.body,
        metadata: Object.keys(metadata).length ? metadata : undefined,
      };
    }
    if (message.author === "event") {
      return {
        ...base,
        type: "ui.system_note",
        content: message.body ?? "",
        metadata: { noteTitle: message.noteTitle, noteKind: CAW_EVENT },
      };
    }
    if (message.question && message.answer) {
      // Your answer to his question: the call that asked it, answered, which
      // the transcript draws as the settled QuestionCard.
      const call = message.question.toolUseId ?? message.id;
      return {
        ...base,
        type: "tool.use",
        content: "",
        toolCallId: call,
        metadata: {
          toolName: "AskUserQuestion",
          toolId: call,
          toolInput: { questions: message.question.questions },
          toolStatus: "success",
          toolUseResult:
            message.answer.outcome === "answered"
              ? {
                  outcome: "answered",
                  answers: message.answer.answers,
                  questions: message.question.questions,
                  ...(message.answer.annotations
                    ? { annotations: message.answer.annotations }
                    : {}),
                }
              : { outcome: "dismissed", questions: message.question.questions },
        },
      };
    }
    return { ...base, type: "user", content: message.body };
  }

  /** The thread as the transcript's session: one object, its fields kept current. */
  const session = $state<SessionState>(
    untrack(() => ({ ...blankSession(viewId), harness: "claude" }))
  );
  $effect.pre(() => {
    const blocks = (messages ?? []).map(blockOf);
    // A withdrawn question's line stands after what was said before it went.
    for (const note of withdrawn) {
      const at = blocks.findLastIndex(
        (block) => (block.timestamp ?? "") <= (note.timestamp ?? "")
      );
      blocks.splice(at + 1, 0, note);
    }
    session.blocks = blocks;
    session.messages = blocks;
    session.initialized = messages !== null;
    session.busy = thread?.status === "working";
    session.lastActivityAt = thread ? new Date(thread.lastAt) : null;
  });

  let shown = $state(false);
  const waiting = $derived(messages === null && !readProblem);
  const veiled = $derived(waiting || (!shown && (messages?.length ?? 0) > 0));

  // --- Caw, the lead -----------------------------------------------------------

  let view = $state<CawView | null>(null);
  $effect(() => {
    const pid = projectId;
    // A thread's status moves with the lead; his view is read again with it.
    // biome-ignore lint/complexity/noVoid: read-only dependency
    void thread?.status;
    if (!(pid && cawco.status === "connected")) {
      return;
    }
    untrack(() => {
      cawOf(pid).then(
        (read) => {
          if (pid === projectId) {
            view = read;
          }
        },
        () => undefined
      );
    });
  });
  const leadOn = $derived(view?.on === true && !view.problem);
  let turningOn = $state(false);
  async function turnOn() {
    turningOn = true;
    try {
      view = await configureCaw(projectId, { on: true });
    } finally {
      turningOn = false;
    }
  }

  // --- his plan, the thread's --------------------------------------------------

  /** The lead's session: a thread's plan is his, beside it as a session's is. */
  const lead = $derived(view?.leadInstanceId ?? null);
  // The lead is no tab of this dashboard's, so his plan is followed alone.
  $effect(() => {
    const id = lead;
    if (!id) {
      return;
    }
    watchPlan(id);
    return () => unwatchPlan(id);
  });
  const leadPlan = $derived(lead ? cawco.planOf(lead) : undefined);
  const planProgressNow = $derived(
    leadPlan && planShows(leadPlan) ? planProgress(leadPlan) : null
  );
  let side = $state<ReturnType<typeof SideSplit>>();
  /** The side surface's share of the width, in percent. */
  let sideShare = $state(0);
  const phone = $derived(paneWidth > 0 && paneWidth < 900);

  /** What Caw plays on the composer: the thread's status, his loop or its still. */
  const seatStatus = $derived(thread?.status ?? "ready");

  // --- his questions, parked on the composer ---------------------------------

  const asks = $derived<BlockedRequest[]>(
    threadId
      ? cawco.blocked.filter((row) => row.request.threadId === threadId)
      : []
  );
  function onanswer(
    ask: BlockedRequest,
    result: PermissionResult
  ): string | null {
    return submitCommand(ask.instanceId, ask.machineId, "permission.answer", {
      requestId: ask.request.requestId,
      result,
    });
  }
  /** The first of them, which the composer grows into: one at a time. */
  const firstAsk = $derived.by((): ComposerAsk | null => {
    const [first] = asks;
    return first
      ? {
          request: first.request,
          asker: "Caw",
          more: asks.length - 1,
          onanswer: (result) => onanswer(first, result),
        }
      : null;
  });

  /**
   * His questions withdrawn before they were answered (his turn
   * interrupted): each leaves its quiet line in the thread, where it was
   * asked. They are his session's asks, so the line is read from the store
   * as one leaves.
   */
  let withdrawn = $state<Message[]>([]);
  let waitingOn = new Set<string>();
  $effect(() => {
    const now = new Set(asks.map((ask) => ask.request.requestId));
    untrack(() => {
      const gone = [...waitingOn].filter((id) => !now.has(id));
      const lines = gone.flatMap((id) => {
        const note = cawco.withdrawnAsk(id);
        return note ? [{ ...note, instanceId: viewId }] : [];
      });
      if (lines.length > 0) {
        withdrawn = [...withdrawn, ...lines];
      }
      waitingOn = now;
    });
  });

  // --- the tasks his turns are about -------------------------------------------

  let tasks = $state<TaskSummary[]>([]);
  let stages = $state<StagesView | null>(null);
  let openTask = $state<string | null>(null);
  const named = $derived(
    (messages ?? []).some(
      (message) => message.author === "caw" && message.tasks?.length
    )
  );
  /** Reads of the tasks so far: only the newest one's answer is kept. */
  let reads = 0;
  async function readTasks() {
    const pid = projectId;
    reads += 1;
    const ticket = reads;
    const [{ tasks: listed }, stagesNow] = await Promise.all([
      listTasks(pid),
      readStages(pid),
    ]);
    if (pid === projectId && ticket === reads) {
      tasks = listed;
      stages = stagesNow;
    }
  }
  $effect(() => {
    if (!(named && projectId)) {
      return;
    }
    // Read again when a new message may name new tasks, and when the
    // project's tasks change (a card's stage moves under it).
    // biome-ignore lint/complexity/noVoid: read-only dependencies
    void [messages?.length, cawco.tasksChangedOf(projectId)];
    untrack(() => {
      readTasks().catch(() => undefined);
    });
  });
  const kindOf = (id: string): StageKind | null | undefined =>
    tasks.find((task) => task.id === id)?.kind;
  const taskHref = (id: string) =>
    `/project/${encodeURIComponent(projectId)}?task=${encodeURIComponent(id)}`;

  setVoice({ face, tasks: taskCards, files: folderFiles });

  /**
   * The Setup thread's newest reply that names files is where setup ends:
   * "Open the board" stands under it, to the project's landing page.
   */
  const boardAfter = $derived(
    thread?.setup
      ? (messages ?? []).findLast(
          (message) => message.author === "caw" && message.files?.length
        )?.id
      : undefined
  );

  // --- the composer -------------------------------------------------------------

  const draft = new ComposerDraft();
  let sending = $state(false);
  let sendError = $state("");

  async function onsubmit(text: string, extras: SendExtras, id: string) {
    sending = true;
    sendError = "";
    try {
      // The words left the field as `sent:<id>`, and go to the hub as that
      // message: its row lands them however soon its frame draws it.
      const said = threadId
        ? await sayInThread(projectId, threadId, text, id)
        : await startThread(projectId, text, id);
      if (!threadId) {
        workspace.retarget(viewId, threadTabId(said.thread.id));
      }
    } catch (error) {
      draft.restore(text, extras);
      sendError = error instanceof Error ? error.message : String(error);
    } finally {
      sending = false;
    }
  }

  /** Stop interrupts the lead's turn. */
  function onstop() {
    const row = lead ? cawco.instanceIndex.byId.get(lead) : undefined;
    if (lead && row) {
      submitCommand(lead, row.machineId, "interrupt", {});
    }
  }

  const binding: ComposerBinding = {
    draft,
    agentName: "Caw",
    placeholder: "Message the project…",
    commands: [],
    mentions: [],
    suggest: { candidates: [] },
    get busy() {
      return thread?.status === "working";
    },
    get sending() {
      return sending;
    },
    get sendError() {
      return sendError;
    },
    get paneVisible() {
      return visible;
    },
    get previewPhone() {
      return phone;
    },
    get transcriptShare() {
      return (100 - sideShare) / 100;
    },
    delegatesOf: "",
    get recallOf() {
      return viewId;
    },
    onsubmit,
    oninterruptsend: (text, extras, id) => {
      onstop();
      onsubmit(text, extras, id);
    },
    onmenu: () => undefined,
    onstop,
    get ask() {
      return firstAsk;
    },
    perch,
    onfoot: (next) => {
      foot = next;
    },
    get planRing() {
      return planProgressNow ? planRing : undefined;
    },
  };

  $effect(() => {
    if (!(browser && leadOn)) {
      return;
    }
    const id = viewId;
    composerBindings.set(id, binding);
    return () => {
      if (composerBindings.get(id) === binding) {
        composerBindings.delete(id);
      }
    };
  });

  /** What the composer stands over the foot: the fade and "Jump to latest" rest on it. */
  let foot = $state<ComposerFoot>({ stack: 0, perch: 0, parked: 0 });
  /**
   * Scrolled away from the tail, the way back rests on the composer's stack,
   * beside Caw; the foot's fade is solid to the higher of his top and its
   * own, so it stands over rows already gone, never over words being read.
   */
  const latestFoot = $derived(
    `calc(var(--space-4) + ${foot.stack}px + var(--space-2))`
  );
  const fadeSolid = $derived(
    `max(calc(var(--space-4) + ${foot.stack + foot.perch}px), calc(${latestFoot} + var(--c-btn-h-sm)))`
  );
  /** The lead-off line's height, standing where the composer would: the foot clears it. */
  let offHeight = $state(0);
  /**
   * Room at the transcript's foot for what stands over it: the composer and
   * Caw's rise above the pill (his slot over the ledge line, and the
   * artboard above it his acting may reach).
   * The composer grown into a question stands over the foot and moves
   * nothing, as in a session: the owner, on a parked card, "it shouldn't
   * push the transcript up" (a7443251).
   */
  const composerRoom = $derived.by(() => {
    if (!leadOn) {
      return view ? `${offHeight}px` : "0px";
    }
    // His slot above the pill, and what his acting may draw above it, in
    // every status: a working Caw reaches higher than his still.
    const rise = seatSize * (LEDGE_LINE + CAW_HEADROOM);
    return `var(--c-composer-panel) + var(--c-tray-row) + ${rise}px`;
  });
  const offLine = $derived(
    view?.on && view.problem
      ? view.problem
      : "Caw lead is off for this project — turn it on to message him."
  );
</script>

{#snippet face(
  live: boolean
)}
  <CawFace size={18} status={live ? "working" : "ready"} />
{/snippet}

{#snippet taskCards(
  ids: string[]
)}
  <ul class="thread-tasks">
    {#each ids as id (id)}
      {@const task = tasks.find((each) => each.id === id)}
      {#if task}
        <li>
          <TaskCard
            href={taskHref(id)}
            {kindOf}
            onopen={(open) => {
              openTask = open;
            }}
            {task}
          />
        </li>
      {/if}
    {/each}
  </ul>
{/snippet}

{#snippet folderFiles(
  files: string[],
  messageId: string
)}
  <FolderFiles {files} {projectId} />
  {#if messageId === boardAfter}
    <div class="board-link">
      <Button
        class="pressable"
        href="/project/{encodeURIComponent(projectId)}"
        label="Open the board"
        size="sm"
        variant="outline"
      />
    </div>
  {/if}
{/snippet}

{#snippet planRing()}
  {#if planProgressNow}
    <PlanRing
      done={planProgressNow.done}
      onopen={() => side?.openPlan()}
      open={side?.planShowing() ?? false}
      total={planProgressNow.total}
    />
  {/if}
{/snippet}

{#snippet perch()}
  <!-- He lands here from wherever he stood (the empty board's 80px Caw). -->
  <div
    class="seat"
    style:--seat="{seatSize}px"
    {@attach land(() => (projectId ? `caw:${projectId}` : undefined), {
      uniform: true,
    })}
  >
    <Caw
      ledge
      next={["working", "needs-you", "ready"]}
      size={seatSize}
      status={seatStatus}
      still={seatStatus === "working" && !cawLoop.on}
    />
  </div>
{/snippet}

<div class="pane" bind:clientWidth={paneWidth}>
  <div
    class="body"
    style="--composer-clearance: calc({composerRoom} + var(--space-4) + var(--space-4)); --parked-room: {leadOn
      ? foot.parked
      : 0}px; {leadOn && foot.stack
      ? `--latest-inset: calc(${latestFoot} - max(calc(var(--space-8) * 3), var(--composer-clearance)))`
      : ""}"
  >
    <SideSplit
      {active}
      oncapture={(pick, shot) => draft.captured(pick, shot)}
      onescape={() => draft.closeSelectionEditor()}
      onselect={(selection) => draft.attach(selection)}
      {phone}
      planOf={lead}
      previewOf={lead}
      {viewId}
      {visible}
      bind:this={side}
      bind:share={sideShare}
    >
      <div class="transcript-slide">
        {#if readProblem}
          <p class="problem" role="alert" in:crossIn>
            The thread could not be read: {readProblem}
          </p>
        {:else if messages !== null}
          <div class="state">
            <Transcript
              agentName="Caw"
              bare
              {focused}
              onshown={(drawn) => {
                shown = drawn;
              }}
              {session}
              {visible}
            />
          </div>
        {/if}
        <!-- The skeleton stands in for rows still on their way and goes the
             moment they are drawn: its rows are not where the real ones fall, so
             fading it over them reads as a second, stale transcript. -->
        {#if leadOn}
          <FootFade solid={foot.stack ? fadeSolid : undefined} />
        {/if}
        {#if veiled}
          <div class="veil" in:crossIn>
            <TranscriptSkeleton />
          </div>
        {/if}
      </div>
    </SideSplit>
    {#if view && !leadOn}
      <!-- No composer: nothing would read it. What is true, and the one
           thing that changes it. -->
      <div class="off" bind:clientHeight={offHeight} in:crossIn out:crossOut>
        <Alert class="off-line" role="status">
          <AlertDescription>{offLine}</AlertDescription>
          {#if !view.on}
            <AlertAction>
              <Button
                label="Turn on"
                onclick={turnOn}
                pending={turningOn}
                pendingLabel="Turning on…"
                size="sm"
                variant="outline"
              />
            </AlertAction>
          {/if}
        </Alert>
      </div>
    {/if}
  </div>
</div>

{#if stages}
  <TaskSheet
    allowedFrom={(stage) => (stages ? movesFrom(stages, stage) : new Set())}
    onchanged={() => {
      readTasks().catch(() => undefined);
    }}
    onmove={async (id, stage) => {
      const moved: TaskView = await moveTask(projectId, id, stage);
      readTasks().catch(() => undefined);
      return moved;
    }}
    {projectId}
    {stages}
    {tasks}
    bind:taskId={openTask}
  />
{/if}

<style>
  .pane {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    background: var(--surface-recess);
  }
  .body {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
  }
  .transcript-slide {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
    isolation: isolate;
  }
  .state {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
  }
  /* A thread has no tool rail: its rows are messages and event lines, so
     the rail's column is the rows' own edge (app.css .tx-columns, as it is
     on a narrow screen) and the answered question's card stands on it. */
  .state :global(.tx-columns) {
    --x-rail: 0px;
  }
  .veil {
    position: absolute;
    inset: 0;
    z-index: 4;
    display: flex;
    flex-direction: column;
    background: var(--surface-recess);
  }
  .problem {
    margin: auto;
    max-inline-size: 46ch;
    padding: var(--space-6);
    font: var(--type-body);
    color: var(--ink-muted);
  }
  /* Where the composer stands when there is one, as it stands (Composer
     .dock and .cin): over the pane's foot, in its column and at its lift,
     on its surface. The transcript clears it as it clears the composer. */
  .off {
    position: absolute;
    inset-inline: 0;
    inset-block-end: calc(var(--space-4) + env(safe-area-inset-bottom));
    z-index: 20;
    inline-size: var(--c-composer-w);
    margin-inline: auto;
  }
  .off :global(.off-line) {
    align-items: center;
    border: 1px solid var(--border-control);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
  }
  .off :global(.off-line [data-slot="alert-action"]) {
    inset-block: 0;
    display: flex;
    align-items: center;
  }
  .seat {
    inline-size: var(--seat);
  }
  .thread-tasks {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
    gap: var(--space-2);
    margin: var(--space-3) 0 0;
    padding: 0;
    list-style: none;
  }
  .board-link {
    margin-block-start: var(--space-3);
  }
</style>
