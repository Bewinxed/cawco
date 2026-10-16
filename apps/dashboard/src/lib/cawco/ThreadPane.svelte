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
   * corner, then the thread's status, clipped at the pill's edge. On or off,
   * your words start him; only when he cannot start (no machine for him)
   * does the composer give way to a line that says why.
   *
   * `thread:new:<project>` is a thread not yet started: its first message
   * makes it, and the tab is re-addressed to the thread the hub made.
   *
   * A thread with nothing said yet opens on the hero (PRD §5.6, the New
   * project page's and the empty board's): Caw at 80 over the question,
   * and the project's starters, each putting its sentence into the
   * composer. He stands there instead of on the composer; your first words
   * send him from the hero to his seat on it.
   */
  import type { CawView, PermissionResult, ThreadMessage } from "@cawco/core";
  import { type Snippet, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import type { TransitionConfig } from "svelte/transition";
  import { cawLoop } from "#lib/cawco/feel.svelte.js";
  import { crossIn, crossOut } from "#lib/cawco/motion/curves.svelte.js";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import { depart, land } from "#lib/cawco/motion/share.svelte.js";
  import CawStarters from "#lib/cawco/project/CawStarters.svelte";
  import StarterCards from "#lib/cawco/project/StarterCards.svelte";
  import {
    Alert,
    AlertAction,
    AlertDescription,
  } from "#lib/components/ui/alert/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { browser } from "$app/env";
  import { goto } from "$app/navigation";
  import { barGlass } from "./bar-glass.svelte";
  import {
    type BlockedRequest,
    blankSession,
    cawco,
    cawOf,
    readThread,
    readTranscript,
    type SendExtras,
    type SessionState,
    sayInThread,
    startThread,
    submitCommand,
    unwatchDelegate,
    unwatchPlan,
    wakeThread,
    watchDelegate,
    watchPlan,
  } from "./client.svelte";
  import Caw, { CAW_HEADROOM, LEDGE_LINE } from "./home/Caw.svelte";
  import CawFace from "./home/CawFace.svelte";
  import { failureWords, THREAD_SEND_UNREACHED, unreachable } from "./hub-read";
  import { planProgress, planShows } from "./plan/PlanPane.svelte";
  import PlanRing from "./plan/PlanRing.svelte";
  import FolderFile from "./project/FolderFile.svelte";
  import FolderFiles from "./project/FolderFiles.svelte";
  import {
    listTasks,
    movesFrom,
    moveTask,
    type ProjectStarter,
    readStages,
    type StageKind,
    type StagesView,
    stageLabel,
    type TaskSummary,
    type TaskView,
    tellStarterOutcome,
  } from "./project-tasks";
  import RegionBoundary from "./RegionBoundary.svelte";
  import RowFault from "./RowFault.svelte";
  import SideSplit from "./side/SideSplit.svelte";
  import { setTaskProject, waitsOnYou } from "./tasks/needs.svelte";
  import TaskCard from "./tasks/TaskCard.svelte";
  import TaskNeedsFor from "./tasks/TaskNeedsFor.svelte";
  import TaskPane from "./tasks/TaskPane.svelte";
  import { threadBlockOf } from "./thread-blocks";
  import { newThreadProjectOf, threadIdOf, threadTabId } from "./thread-tabs";
  import Composer, {
    type ComposerAsk,
    type ComposerFoot,
  } from "./transcript/Composer.svelte";
  import { ComposerDraft } from "./transcript/composer-draft.svelte";
  import FootFade from "./transcript/FootFade.svelte";
  import HeadFade from "./transcript/HeadFade.svelte";
  import Transcript from "./transcript/Transcript.svelte";
  import TranscriptSkeleton from "./transcript/TranscriptSkeleton.svelte";
  import { setVoice } from "./turn/voice";
  import type { Message } from "./types";
  import {
    type ComposerBinding,
    composerBindings,
  } from "./workspace/composer-dock.svelte";
  import { settleWhile } from "./workspace/dock.svelte";
  import { workspace } from "./workspace/workspace.svelte";

  let {
    viewId,
    visible,
    active,
    focused = false,
    docked,
  }: {
    viewId: string;
    visible: boolean;
    /** Its group's active tab (PaneHost). */
    active: boolean;
    focused?: boolean;
    /**
     * Drawn in Caw's panel floating over a project's page (CawThread), not
     * as a tab: it draws its own composer (there is no group to lend one)
     * on the panel's `draft`, so your half-written words outlive the panel
     * being put away; nothing beside it; and the thread its first message
     * makes is handed to the panel (`onthread`) where a tab would be
     * re-addressed. Its hero offers the starters as chips, then `under`
     * (the project's earlier threads).
     */
    docked?: {
      onthread: (threadId: string) => void;
      draft: ComposerDraft;
      under?: Snippet;
    };
  } = $props();

  const threadId = $derived(threadIdOf(viewId));
  const thread = $derived(cawco.threadOf(viewId) ?? null);
  const projectId = $derived(
    thread?.projectId ?? newThreadProjectOf(viewId) ?? ""
  );
  setTaskProject(() => projectId);

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
          readProblem = failureWords(error);
        }
      );
    });
  });

  /** One message as the transcript's block (`Message`). */
  const blockOf = (message: ThreadMessage): Message =>
    threadBlockOf(message, viewId);

  /**
   * His questions withdrawn before they were answered (his turn
   * interrupted): each leaves its quiet line in the thread, where it was
   * asked. Declared before the effect below reads it: a pre-effect runs as
   * the component is set up, and a later `let` is not yet initialised.
   */
  let withdrawn = $state<Message[]>([]);

  // --- his words as he writes them ----------------------------------------------

  /**
   * His turn that has read your words here and not answered them yet: his
   * session, and the send it read them as (core `ThreadHearing`). Declared
   * before the transcript's effect that reads what it gives.
   */
  const hearing = $derived(thread?.hearing ?? null);
  const hearingLead = $derived(hearing?.instanceId ?? null);
  // His session is no tab of this dashboard's: its frames are followed while
  // his turn answers this thread, and its newest page read to stand on.
  $effect(() => {
    const id = hearingLead;
    if (!id) {
      return;
    }
    untrack(() => {
      watchDelegate(id);
      // biome-ignore lint/complexity/noVoid: fire-and-forget: the read adopts the page and the stream follows it
      void readTranscript(id);
    });
    return () => unwatchDelegate(id);
  });
  /**
   * What he has said since reading your words, as the hub posts it here as
   * his reply when his turn ends (caw.ts `answerUnreplied`): his plain words
   * in his session after the send `hearing` names, the one he is writing
   * last. None once a reply of his stands after your newest words: it lands
   * a frame before the thread's row lets go of the hearing, and the live
   * row settles into it.
   */
  const liveWords = $derived.by(() => {
    if (!hearing) {
      return "";
    }
    const newest = (messages ?? []).findLast(
      (message) => message.author !== "event"
    );
    const lead = cawco.session(hearing.instanceId);
    const at = lead?.blocks.findIndex((block) => block.id === hearing.send);
    if (!(lead && at !== undefined && at >= 0 && newest?.author === "you")) {
      return "";
    }
    const words = lead.blocks
      .slice(at + 1)
      .filter(
        (block) =>
          block.type === "assistant" &&
          !block.parentToolUseId &&
          block.content.trim()
      )
      .map((block) => block.content);
    if (lead.streaming) {
      words.push(lead.streaming);
    }
    return words.join("\n\n").trim();
  });

  /**
   * The thread as the transcript's session: one object, its fields kept
   * current. Its id is the pane's address, which a new thread's first
   * message moves to the thread it made: the transcript's turn, landing and
   * sizes are that thread's from then on, never the next new thread's.
   */
  const session = $state<SessionState>(
    untrack(() => ({ ...blankSession(viewId), harness: "claude" }))
  );
  $effect.pre(() => {
    session.instanceId = viewId;
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
    session.streaming = liveWords;
    session.lastActivityAt = thread ? new Date(thread.lastAt) : null;
  });

  let shown = $state(false);
  const waiting = $derived(messages === null && !readProblem);
  const veiled = $derived(waiting || (!shown && (messages?.length ?? 0) > 0));
  // Hidden while veiled, the pane is still laid out, so its transcript can
  // measure and draw before its tab is chosen (dock.svelte.ts `settling`).
  settleWhile(
    () => viewId,
    () => veiled
  );

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
  /**
   * You can write to Caw, on or off: your words start him. Only a reason he
   * cannot start (no machine for him) takes the composer away.
   */
  const writable = $derived(view !== null && !view.problem);

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

  // His questions withdrawn (`withdrawn`, declared before the transcript's
  // effect that reads them) are read from the store as one leaves.
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
  /**
   * The head over a reply's cards: how many he filed and the stage they
   * stand in ("Filed 6 tasks · Draft"), or each stage's count where they
   * differ ("Filed 6 tasks · 4 Draft · 2 Ready"), in the board's order.
   */
  function filedWords(filed: TaskSummary[]): string {
    const count = `Filed ${filed.length} ${filed.length === 1 ? "task" : "tasks"}`;
    const order = stages?.stages.map((stage) => stage.name) ?? [];
    const rank = (name: string) => {
      const at = order.indexOf(name);
      return at < 0 ? order.length : at;
    };
    const by = new Map<string, number>();
    for (const task of filed) {
      by.set(task.stage, (by.get(task.stage) ?? 0) + 1);
    }
    const counted = [...by].toSorted(([a], [b]) => rank(a) - rank(b));
    if (counted.length === 1) {
      return `${count} · ${stageLabel(counted[0][0])}`;
    }
    return [
      count,
      ...counted.map(([stage, many]) => `${many} ${stageLabel(stage)}`),
    ].join(" · ");
  }
  const taskHref = (id: string) =>
    `/project/${encodeURIComponent(projectId)}?task=${encodeURIComponent(id)}`;
  /**
   * A card opens its task beside the conversation on a desk; on a phone the
   * task is its own page, whose Back comes back here. Docked beside the
   * project page, the page stands it beside its board.
   */
  function openTaskOf(id: string) {
    if (phone || docked) {
      goto(taskHref(id), { state: { taskOpened: true } });
      return;
    }
    openTask = id;
  }
  // Narrowed to a phone, the task beside the conversation is put away.
  $effect(() => {
    if (phone) {
      openTask = null;
    }
  });
  /** A move from the thread: the list is read again, so every card follows. */
  async function moveIn(id: string, stage: string): Promise<TaskView> {
    const moved = await moveTask(projectId, id, stage);
    readTasks().catch(() => undefined);
    return moved;
  }
  const changedIn = () => {
    readTasks().catch(() => undefined);
  };

  // --- your words he has not read ----------------------------------------------

  /** A thread message's not-woken data, when it is a not-woken note (core `CawNotWoken`). */
  const notWokenOf = (message: ThreadMessage | undefined) =>
    message?.author === "event" && message.event?.kind === "caw"
      ? message.event.notWoken
      : undefined;
  /** The note Try again was pressed on and went: its wake is under way, so it is not offered twice. */
  let retried = $state<string | null>(null);
  /**
   * The one not-woken note that offers Try again: the newest, about your
   * newest words, with no reply of his after them, while no turn of his is
   * on the thread (the hub refuses the rest the same way).
   */
  const retryable = $derived.by(() => {
    const said = messages ?? [];
    if (thread?.status === "working") {
      return null;
    }
    const at = said.findLastIndex(
      (message) => message.author === "you" && !message.answer
    );
    const yours = said[at];
    const after = said.slice(at + 1);
    const note = after.findLast(
      (message) => notWokenOf(message)?.message === yours?.id
    );
    return yours &&
      note &&
      note.id !== retried &&
      !after.some((message) => message.author === "caw")
      ? note.id
      : null;
  });
  async function wakeAgain(noteId: string): Promise<void> {
    await wakeThread(projectId, threadId ?? "");
    retried = noteId;
  }

  setVoice({ event: eventUnder, face, tasks: taskCards, files: folderFiles });

  // --- a file his reply names ------------------------------------------------------

  /**
   * The project folder's file open from its chip, in the page (The Open
   * Page Rule): beside the thread in its split (SideSplit, on the phone's
   * sheet over the composer), or, where the thread has no split (docked),
   * in the thread's own place over its transcript, which keeps its scroll
   * under it for Close to come back to.
   */
  let openFile = $state<string | null>(null);
  const closeFile = () => {
    openFile = null;
  };

  /**
   * The Setup thread's newest reply that names files is where setup ends:
   * "Open the board" stands under it, to the project's landing page, unless
   * the reply's task cards already stand on it with theirs.
   */
  const boardAfter = $derived.by(() => {
    const last = thread?.setup
      ? (messages ?? []).findLast(
          (message) => message.author === "caw" && message.files?.length
        )
      : undefined;
    return last?.author === "caw" && last.tasks?.length ? undefined : last?.id;
  });

  // --- the composer -------------------------------------------------------------

  const draft = untrack(() => docked?.draft) ?? new ComposerDraft();
  let sending = $state(false);
  let sendError = $state("");
  /** The failed send never reached the hub: its line offers Send again. */
  let sendAgain = $state(false);

  // --- the hero: a thread with nothing said yet ---------------------------------

  /**
   * Nothing said here yet and nothing on its way: the hero stands where the
   * transcript will. Your first send takes it away as it leaves, and a send
   * the hub refused brings it back with your words in the field.
   */
  const hero = $derived(
    messages !== null && messages.length === 0 && !sending && !readProblem
  );
  /** The project's starters its stages carried, read for the hero. */
  let startersRead = $state<ProjectStarter[] | undefined>(undefined);
  /** The project's starters, live: a new set the hub writes replaces the read one. */
  const starters = $derived(cawco.startersOf(projectId, "board", startersRead));
  $effect(() => {
    const pid = projectId;
    if (!(hero && pid && cawco.status === "connected")) {
      return;
    }
    untrack(() => {
      readStages(pid).then(
        (stagesRead) => {
          if (pid === projectId) {
            startersRead = stagesRead.starters;
          }
        },
        () => undefined
      );
    });
  });
  const projectName = $derived(
    cawco.project(projectId)?.name ?? "this project"
  );
  /** A starter's sentence into the composer, the caret after it; nothing is sent. */
  function pick(text: string) {
    draft.press(text, "board");
  }
  /**
   * The hero's Caw departs as it goes, and his seat on the composer lands
   * him (`perch`): one Caw, 80 into his seat, as the empty board's does.
   */
  function seatHim(node: HTMLElement): TransitionConfig {
    depart(node);
    return { duration: 0 };
  }

  async function onsubmit(text: string, extras: SendExtras, id: string) {
    sending = true;
    sendError = "";
    sendAgain = false;
    try {
      // The words left the field as `sent:<id>`, and go to the hub as that
      // message: its row lands them however soon its frame draws it.
      const said = threadId
        ? await sayInThread(projectId, threadId, text, id, extras)
        : await startThread(projectId, text, id, extras);
      // A starter pressed into the field went: as its words stood, or
      // changed. Told after the hub took the words; the hub keeps it as
      // Jev's steering, and nothing here waits on it.
      const pressed = draft.takePressed(text);
      if (pressed) {
        tellStarterOutcome(projectId, pressed).catch(() => undefined);
      }
      if (!threadId) {
        if (docked) {
          docked.onthread(said.thread.id);
        } else {
          workspace.retarget(viewId, threadTabId(said.thread.id));
        }
      }
    } catch (error) {
      draft.restore(text, extras);
      sendAgain = unreachable(error);
      sendError = sendAgain ? THREAD_SEND_UNREACHED : failureWords(error);
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
    mentionsFrom: null,
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
    get sendAgain() {
      return sendAgain;
    },
    get paneVisible() {
      return visible;
    },
    get transcriptShare() {
      return docked ? 1 : (100 - sideShare) / 100;
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
    get perch() {
      return hero ? undefined : perch;
    },
    onfoot: (next) => {
      foot = next;
    },
    // Docked, the plan has nowhere beside the thread to open: the dock is
    // the page's side surface.
    get planRing() {
      return planProgressNow && !docked ? planRing : undefined;
    },
  };

  $effect(() => {
    if (!(browser && writable) || docked) {
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
  let foot = $state<ComposerFoot>({ stack: 0, perch: 0, parked: 0, shelf: 0 });
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
  /** The problem line's height, standing where the composer would: the foot clears it. */
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
    if (!writable) {
      return view ? `${offHeight}px` : "0px";
    }
    // His slot above the pill, and what his acting may draw above it, in
    // every status: a working Caw reaches higher than his still. On the
    // hero he stands over it instead, and the pill has no seat.
    const rise = hero ? 0 : seatSize * (LEDGE_LINE + CAW_HEADROOM);
    return `var(--c-composer-panel) + var(--c-tray-row) + ${rise}px`;
  });
  /** Caw cannot start because no machine is online: the cause's one action is to look at the machines. */
  const noMachine = $derived(
    !!view?.problem && cawco.onlineMachines.length === 0
  );
</script>

{#snippet face(live: boolean)}
  <CawFace size={18} status={live ? "working" : "ready"} />
{/snippet}

{#snippet eventUnder(id: string)}
  <!-- A not-woken note: why, and the way on with the words he has not read
       (only on the note that still stands for them). With no machine
       online it says what happens next; every other reason is the hub's
       own words. -->
  {@const why = notWokenOf(
    (messages ?? []).find((message) => message.id === id)
  )}
  {#if why}
    <RowFault
      class="not-woken"
      again={retryable === id ? () => wakeAgain(id) : undefined}
      againPending="Waking Caw…"
      data-not-woken={why.reason}
      reason={why.reason === "no-machine"
        ? "No machine was online when you wrote. He reads it when one is back."
        : why.words}
    />
  {/if}
{/snippet}

{#snippet taskCards(ids: string[])}
  <!-- What the cards are, the cards at one height (title over id), what
       each waits on you for under it, and the way to the board they are on.
       The box tweens as cards arrive and the head's words change (a stage
       moves under it). -->
  {@const filed = ids.flatMap((id) => tasks.filter((task) => task.id === id))}
  <div class="thread-tasks" data-thread-tasks {@attach morph()}>
    {#if filed.length > 0}
      <p class="tasks-head" data-tasks-head>
        <MorphText text={filedWords(filed)} />
      </p>
      <ul class="tasks-grid">
        {#each filed as task (task.id)}
          <li class="thread-task">
            <TaskCard
              href={taskHref(task.id)}
              {kindOf}
              onopen={openTaskOf}
              {task}
              titleFirst
            />
            {#if stages && waitsOnYou(projectId, task)}
              <TaskNeedsFor
                onchanged={changedIn}
                onmove={moveIn}
                onopen={openTaskOf}
                {projectId}
                {stages}
                summary={task}
                {tasks}
              />
            {/if}
          </li>
        {/each}
      </ul>
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
  </div>
{/snippet}

{#snippet folderFiles(files: string[], messageId: string)}
  <FolderFiles
    {files}
    onopen={(path) => {
      openFile = path;
    }}
    shown={openFile}
  />
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
    data-slot="seat"
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

{#snippet slide()}
  <div class="transcript-slide">
    {#if readProblem}
      <p class="problem" role="alert" in:crossIn>
        The thread could not be read: {readProblem}
      </p>
    {:else if hero}
      <div class="hero" data-thread-hero in:crossIn>
        <EmptyState
          line={view && !view.on && !docked
            ? "Caw is off, so he acts only when you write to him."
            : undefined}
          title="What's next for {projectName}?"
        >
          {#snippet mark()}
            <div
              data-slot="caw-80"
              class="caw-80"
              data-share={projectId ? `caw:${projectId}` : undefined}
              out:seatHim|global
            >
              <Caw size={80} status="ready" />
            </div>
          {/snippet}
          {#snippet action()}
            {#if docked}
              <CawStarters onpick={pick} {starters} />
              {@render docked.under?.()}
            {:else if starters.length > 0}
              <StarterCards onpick={pick} {starters} />
            {/if}
          {/snippet}
        </EmptyState>
      </div>
    {:else if messages !== null}
      <div class="state">
        <Transcript
          agentName="Caw"
          bare
          {focused}
          latestInset={writable && foot.stack
            ? `calc(${latestFoot} - max(calc(var(--space-8) * 3), var(--composer-clearance)))`
            : undefined}
          onshown={(drawn) => {
            shown = drawn;
          }}
          parkedHeight={writable ? foot.parked : 0}
          shelfHeight={writable ? foot.shelf : 0}
          {session}
          {visible}
        />
      </div>
      <HeadFade />
    {/if}
    <!-- The skeleton stands in for rows still on their way and goes the
         moment they are drawn: its rows are not where the real ones fall, so
         fading it over them reads as a second, stale transcript. -->
    {#if writable}
      <FootFade solid={foot.stack ? fadeSolid : undefined} />
    {/if}
    {#if veiled}
      <div class="veil" in:crossIn>
        <TranscriptSkeleton />
      </div>
    {/if}
  </div>
{/snippet}

<div data-slot="pane" class="pane" bind:clientWidth={paneWidth}>
  <div
    data-slot="body"
    class="body"
    style="--composer-clearance: calc({composerRoom} + var(--space-4) + var(--space-4))"
  >
    {#if docked}
      <div class="under-file" inert={openFile !== null}>
        {@render slide()}
      </div>
    {:else}
      <SideSplit
        {active}
        file={fileSurface}
        fileOpen={openFile !== null}
        {phone}
        planOf={lead}
        previewOf={lead}
        task={stages ? taskSurface : undefined}
        taskOpen={openTask !== null}
        {viewId}
        {visible}
        bind:this={side}
        bind:share={sideShare}
      >
        {@render slide()}
      </SideSplit>
    {/if}
    {#if docked && writable}
      <!-- No group lends this pane a composer: it draws its own, where the
           group's stands (PaneLeaf `.dock`), from the same binding. -->
      <div data-slot="composer-dock" class="composer-dock">
        <RegionBoundary kept="Your draft is kept." region="composer">
          <Composer
            agentName={binding.agentName}
            ask={firstAsk}
            busy={thread?.status === "working"}
            commands={binding.commands}
            {draft}
            mentionsFrom={binding.mentionsFrom}
            onfoot={binding.onfoot}
            oninterruptsend={binding.oninterruptsend}
            onmenu={binding.onmenu}
            {onstop}
            {onsubmit}
            paneVisible={visible}
            perch={hero ? undefined : perch}
            placeholder={binding.placeholder}
            recallOf={viewId}
            {sendAgain}
            {sendError}
            {sending}
            suggest={binding.suggest}
          />
        </RegionBoundary>
      </div>
    {/if}
    {#if docked && openFile}
      <!-- No split to stand in: the file takes the thread's place, over
           its transcript and composer, until Close gives it back. -->
      <div class="file-in-place" data-file-in-place in:crossIn out:crossOut>
        <RegionBoundary region="file">
          {@render fileSurface(undefined)}
        </RegionBoundary>
      </div>
    {/if}
    {#if view?.problem}
      <!-- No composer: Caw cannot start to read it. What is true, and the
           one thing that changes it. -->
      <div
        class="off"
        data-safe-bottom
        bind:clientHeight={offHeight}
        in:crossIn
        out:crossOut
      >
        <Alert class="off-line" role="status">
          <AlertDescription>{view.problem}</AlertDescription>
          {#if noMachine}
            <AlertAction>
              <Button
                label="Check machines"
                onclick={() => {
                  barGlass.open = "machines";
                }}
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

{#snippet fileSurface(switcher: Snippet | undefined)}
  {#if openFile && projectId}
    {#key openFile}
      <FolderFile onclose={closeFile} path={openFile} {projectId} {switcher} />
    {/key}
  {/if}
{/snippet}

{#snippet taskSurface(switcher: Snippet | undefined)}
  {#if stages && openTask}
    <TaskPane
      allowedFrom={(stage) => (stages ? movesFrom(stages, stage) : new Set())}
      onchanged={changedIn}
      onclose={() => {
        openTask = null;
      }}
      onmove={moveIn}
      onopen={openTaskOf}
      {projectId}
      {stages}
      {switcher}
      taskId={openTask}
      {tasks}
    />
  {/if}
{/snippet}

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
    /* The transcript's scroll, in reach of its head blur (HeadFade). */
    timeline-scope: --transcript-head;
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
  /* A not-woken note's reason and Try again under its title, at the text
     column (SystemLine `.note.unread`): muted, since nothing failed. */
  .state :global(.not-woken) {
    --fault-ink: var(--ink-muted);
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
    inset-block-end: calc(var(--space-4) + var(--safe-bottom));
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
  /* The hero: the empty board's (project page `.caw-empty`), centred in the
     room over the composer, which it clears as the transcript does. */
  .hero {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    justify-content: center;
    min-block-size: 0;
    padding: var(--space-6) var(--space-5) var(--composer-clearance);
    overflow-y: auto;
    /* Its own stacking: what is raised inside it (an Earlier row's mark)
       stays under the foot fade as it scrolls past the composer. */
    isolation: isolate;
  }
  .hero :global(.kit-empty) {
    align-items: center;
    inline-size: 100%;
    max-inline-size: var(--c-starters-w);
    margin-inline: auto;
    text-align: center;
  }
  .hero :global(.kit-empty-action) {
    align-self: stretch;
  }
  .caw-80 {
    display: grid;
    place-items: center;
    margin-block-end: var(--space-3);
  }
  /* The docked composer's layer, as the group's (PaneLeaf `.dock`): over
     the pane, taking no press but the composer's own. */
  .composer-dock {
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
  }
  /* The transcript under a file in its place: laid out as it was, so its
     scroll is where Close finds it. */
  .under-file {
    display: contents;
  }
  /* A file in the thread's own place, over its transcript and composer. The
     pane is already a card (the dock's), so the file's card draws no frame
     of its own inside it: no second shadow, corner or ground. */
  .file-in-place {
    position: absolute;
    inset: 0;
    z-index: 21;
    display: flex;
    background: var(--surface-raised);
  }
  .file-in-place :global(.side-card) {
    flex: 1 1 auto;
    padding-inline: 0;
    border-radius: 0;
    box-shadow: none;
  }
  .thread-tasks:has(.tasks-head) {
    padding-block-start: var(--space-3);
  }
  /* What the cards are, in the kit's meta line over them. */
  .tasks-head {
    margin: 0 0 var(--space-2);
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  /* Each task is two tracks, its card's and what it needs of you, and the
     card tracks are all one `1fr`: every card as tall as the tallest in the
     block, whatever it has to say; a task's needs take only their own track
     (`auto`, empty for a task that needs nothing). */
  .tasks-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
    grid-auto-rows: 1fr auto;
    column-gap: var(--space-2);
    row-gap: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .thread-task {
    display: grid;
    grid-row: span 2;
    grid-template-rows: subgrid;
    min-inline-size: 0;
  }
  .thread-task > :global(.task-card) {
    margin-block-end: var(--space-2);
  }
  .thread-task > :global(.needs-for) {
    margin-block-end: var(--space-2);
  }
  /* A task that needs you takes the row: its card, then what it needs and
     the way to act, collapsed to the deliverable's first lines. */
  .thread-task:has(:global(.needs-stack)) {
    grid-column: 1 / -1;
    max-inline-size: 74ch;
  }
  .board-link {
    margin-block-start: var(--space-3);
  }
</style>
