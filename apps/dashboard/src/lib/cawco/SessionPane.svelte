<script lang="ts">
  import type { PermissionResult } from "@cawco/core";
  /**
   * One conversation, whole: the identity header, the transcript (Chat) or its
   * graph (Flow), and the floating composer, grown into any parked permission
   * or question. Held per open tab by the session layout, so its
   * scroll offset and half-typed message survive a switch — nothing here
   * unmounts on navigation.
   *
   * The composer is not drawn here: the group draws one for all of its
   * conversations, so a tab switch or a swipe changes the transcript and
   * never the box being typed in. This pane lends that composer its session
   * (`composer-dock.svelte.ts`). Only the server's first paint, which has no
   * group composer yet, draws one here. The half-typed message is this
   * pane's either way — `draft` below.
   */
  import { type Snippet, untrack } from "svelte";
  import {
    crossIn,
    crossOut,
    crossOutWith,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { IconAlert, IconChat, IconLaptop } from "#lib/icons.js";
  import { browser } from "$app/env";
  import {
    cawco,
    clearReadFault,
    clearRestore,
    interrupt,
    latestCommandFor,
    loadMcpServers,
    openSession,
    type PendingPermission,
    pendingRestore,
    type ReadCause,
    type ReadFault,
    readFaultOf,
    readTranscript,
    refreshCommands,
    type SendExtras,
    type ServerTail,
    type SessionState,
    seededSession,
    sendFailureNotice,
    submitCommand,
  } from "./client.svelte";
  import { cleanDetail } from "./command-detail";
  import { instanceTitle, projectOfRow } from "./home/home-state.svelte";
  import { delegateHandle } from "./links";
  import MoveWait from "./move/MoveWait.svelte";
  import { moveOf } from "./move.svelte";
  import { planProgress, planShows } from "./plan/PlanPane.svelte";
  import PlanRing from "./plan/PlanRing.svelte";
  import {
    listTasks,
    movesFrom,
    moveTask,
    readStages,
    type StagesView,
    type TaskSummary,
    type TaskView,
  } from "./project-tasks";
  import RegionBoundary from "./RegionBoundary.svelte";
  import SideSplit from "./side/SideSplit.svelte";
  import { clip, type SuggestCandidate, suggestions } from "./suggest.svelte";
  import { besideOf, putAway, standBeside } from "./tasks/beside.svelte";
  import TaskPane from "./tasks/TaskPane.svelte";
  import { inLists, threadIdOf, threadTabId } from "./thread-tabs";
  import Composer, { type ComposerAsk } from "./transcript/Composer.svelte";
  import { ComposerDraft } from "./transcript/composer-draft.svelte";
  import FootFade from "./transcript/FootFade.svelte";
  import HeadFade from "./transcript/HeadFade.svelte";
  import { keepDraft } from "./transcript/keep-draft.svelte";
  import ProjectOffer from "./transcript/ProjectOffer.svelte";
  import { parkedAsks } from "./transcript/present";
  import Transcript from "./transcript/Transcript.svelte";
  import TranscriptSkeleton from "./transcript/TranscriptSkeleton.svelte";
  import {
    type ComposerBinding,
    composerBindings,
  } from "./workspace/composer-dock.svelte";
  import { settleWhile } from "./workspace/dock.svelte";
  import { rebuildScheduler } from "./workspace/scheduler.svelte";
  import { workspace } from "./workspace/workspace.svelte";

  let {
    viewId,
    browsing,
    browsingCwd,
    browsingHarness,
    visible,
    active,
    focused,
    serverTail = null,

    /** Whether this pane is on screen at all — governs row building. */
    /**
     * Whether this pane is the one being worked in. Defaults to `visible`,
     * so a single-pane layout behaves exactly as it always has.
     */
    /**
     * The newest transcript page the SERVER read, handed down by value. The
     * layout captures the page's data once per real navigation and gives it
     * to the one pane it was loaded for; every other pane reads its own.
     */
  }: {
    viewId: string;
    browsing: string | null;
    browsingCwd: string;
    browsingHarness: string;
    visible: boolean;
    /** Its group's active tab (PaneHost). */
    active: boolean;
    focused?: boolean;
    serverTail?: ServerTail | null;
  } = $props();

  /**
   * A named state stands in the middle of the transcript area, its mark,
   * title and line centred in it, as the board's empty state stands: never
   * a start-aligned block set in the middle.
   */
  const STATEFUL =
    "m-auto max-w-[46ch] items-center px-[var(--space-6)] text-center";
  let paneWidth = $state(0);
  /**
   * The side surface's share of this pane's width, in percent (SideSplit):
   * 0 while it is closed or a sheet. What is left is the transcript's, and
   * the group's composer sits over exactly that much.
   */
  let previewShare = $state(0);
  const phone = $derived(paneWidth > 0 && paneWidth < 900);
  let side = $state<ReturnType<typeof SideSplit>>();
  /** How far what stands on the composer rises past it: the transcript keeps that much room past its end. */
  let parkedRoom = $state(0);
  /** The delegate tray's open shelf: room past the end that a pinned tail follows. */
  let shelfRoom = $state(0);
  /** The session's plan has something to show: its ring opens it (SideSplit). */
  const plan = $derived(cawco.planOf(viewId));
  const planProgressNow = $derived(
    planShows(plan) && plan ? planProgress(plan) : null
  );

  /*
   * A task standing beside the session (tasks/beside.svelte.ts): its review
   * opened the session that worked it. Its project's tasks and stages are
   * read for the pane, again when they change.
   */
  const beside = $derived(besideOf(viewId));
  let besideTasks = $state<TaskSummary[]>([]);
  let besideStages = $state<StagesView | null>(null);
  let besideReads = 0;
  async function readBeside(projectId: string): Promise<void> {
    besideReads += 1;
    const ticket = besideReads;
    const [{ tasks }, stagesNow] = await Promise.all([
      listTasks(projectId),
      readStages(projectId),
    ]);
    if (ticket === besideReads && beside?.projectId === projectId) {
      besideTasks = tasks;
      besideStages = stagesNow;
    }
  }
  $effect(() => {
    const projectId = beside?.projectId;
    if (!projectId) {
      besideStages = null;
      return;
    }
    // biome-ignore lint/complexity/noVoid: read-only dependency
    void cawco.tasksChangedOf(projectId);
    untrack(() => {
      readBeside(projectId).catch(() => undefined);
    });
  });
  /** Another task (an edge, a blocker) in this one's place. */
  function showBeside(taskId: string): void {
    if (beside) {
      standBeside(viewId, { projectId: beside.projectId, taskId });
    }
  }
  async function moveBeside(taskId: string, stage: string): Promise<TaskView> {
    const projectId = beside?.projectId ?? "";
    const moved = await moveTask(projectId, taskId, stage);
    readBeside(projectId).catch(() => undefined);
    return moved;
  }

  /** The hub answered 404: no row, no stored file, no machine that knows the id. */
  let missing = $state(false);
  /**
   * This pane's own read has answered, so what the server said about its
   * read (`servedFault`) no longer speaks for it.
   */
  let readAnswered = $state(false);
  /** The read finished, cleanly, with nothing in it — a transcript with no turns yet. */
  let empty = $state(false);
  /** Bumped by Retry: the one thing that re-runs the read after it has failed. */
  let attempt = $state(0);
  /**
   * Why the next pass of the read reads: an open, or what bumped `attempt`.
   * A retry reads whether or not the stream is followed: a reset that failed
   * left it subscribed and waiting on this very read.
   */
  let nextCause: ReadCause = "open";

  /**
   * Whether the hub holds this id as a running session. This, not the tab's
   * remembered context, is what decides the tense of the read: a live session
   * is subscribed to and its frames reconciled behind the history; a stored one
   * is only read. The old `browsing === null` test stood in for it and was
   * wrong for every live session opened from the sidebar, which arrived with a
   * context and so was never opened at all.
   */
  const isLive = $derived(cawco.instances.some((row) => row.id === viewId));

  /** Asks the hub holds under this id with no session behind it (a project's memory proposal, hub memory.ts). */
  const rowless = $derived(
    isLive ? [] : parkedAsks(cawco.session(viewId)?.pending ?? [])
  );
  /**
   * An ask is answered where it was made: one Caw made opens his thread,
   * one a curator run made opens that run's session, each drawing it in
   * its composer. This tab goes there.
   */
  const madeIn = $derived.by((): string | null => {
    const ask = rowless.find((one) => one.threadId || one.originInstanceId);
    if (!ask) {
      return null;
    }
    return ask.threadId
      ? threadTabId(ask.threadId)
      : (ask.originInstanceId ?? null);
  });
  $effect(() => {
    const to = madeIn;
    if (to) {
      untrack(() => workspace.retarget(viewId, to));
    }
  });
  /**
   * An ask made in no conversation (a proposal Caw made before proposals
   * kept their thread): the pane is that ask's card and nothing else. No
   * transcript is read and no "no such session" is said; the composer is
   * the card (it grows into the ask). Kept once seen, so the pane does not
   * read or say anything in the moment between the answer and its close.
   */
  const asking = $derived(
    rowless.some((one) => !(one.threadId || one.originInstanceId))
  );
  let askHeld = $state(false);
  const askAlone = $derived(asking || askHeld);
  // Answered (or settled anywhere), the pane closes as its tab's own close
  // does: back to the tab it was opened from, else a neighbour (workspace
  // `close`).
  $effect(() => {
    const now = asking;
    const row = isLive;
    untrack(() => {
      if (now) {
        askHeld = true;
      } else if (askHeld && !row) {
        workspace.close(viewId);
      }
    });
  });

  /**
   * This session's project is moving to its machine for it (move.svelte.ts).
   * Until the move starts it its row is `moving` and there is nothing to
   * read: the staged wait is the whole pane. Once it starts, the wait stays
   * over the transcript until that has drawn, then fades from over it.
   */
  const move = $derived(moveOf(viewId));
  const prestart = $derived(!!move && move.stage !== "started");

  /**
   * Reads a conversation's transcript: one page read, addressed by the id
   * alone. The hub resolves the id — a live row to its key, anything else to
   * whichever machine holds the file — and every way this ends is a named
   * state.
   */
  async function readHistory(
    id: string,
    cause: ReadCause,
    fresh = false
  ): Promise<void> {
    const outcome = await readTranscript(id, cause, fresh);
    // Each outcome replaces what the last read said, and only an outcome
    // does: a read in flight leaves the pane showing what it showed. Why a
    // read failed is the session's `readFault`, which every read of this view
    // writes, the ones the store makes by itself too (`readFailed`).
    readAnswered = true;
    if (!outcome.ok) {
      // 404 is an answer, not a fault: nothing the hub or any machine holds
      // goes by this id. Retrying would ask the same question.
      missing = outcome.status === 404;
      return;
    }
    // Skipped means another read already holds this view; its outcome is the
    // one that counts, and this one has nothing to say.
    if (outcome.skipped) {
      return;
    }
    missing = false;
    // A clean read of nothing is known to be empty, running or stored, and
    // says so (DESIGN.md, the Claim of Nothing): a session that has not
    // started yet shows its blank state, never a skeleton waiting for turns.
    // Its first turn, streamed in, replaces the blank state with the rows.
    empty = (cawco.session(id)?.messages.length ?? 0) === 0;
  }

  // Bring the conversation into being: a stored session reads its transcript
  // back, a live one is opened (subscribed) and read back to what it said
  // before this tab joined.
  //
  // Deliberately untracked around the store. Both calls read AND write the
  // session's own `messages` / `loading`, so a plainly-tracked effect re-runs
  // itself on the transcript it just published; the URL this pane was opened
  // with, whether the hub holds it live, plus an explicit retry, are the only
  // things that should start a read.
  $effect(() => {
    const id = viewId;
    const cwd = browsingCwd;
    const harness = browsingHarness;
    const hint = browsing ? { machineId: browsing, cwd, harness } : null;
    const running = isLive;
    // biome-ignore lint/complexity/noVoid: read-only dependency — Retry bumps `attempt` purely to re-run this effect
    void attempt;
    // A session its project is still moving for has nothing to read yet;
    // this runs again the moment the move starts it. An ask standing alone
    // has no transcript at all.
    if (!id || prestart || askAlone) {
      return;
    }
    // Retry the read once the hub can actually answer. On a reload the effect
    // first runs while the socket is still reconnecting — a live session's
    // machineId isn't known yet and a stored read can't reach the socket.
    // Tracking the connection and the live session's machineId (neither
    // written by the read below) re-runs this the moment it becomes
    // answerable, so the transcript reads back instead of staying empty.
    // biome-ignore lint/complexity/noVoid: read-only dependency — re-runs this effect once the hub or the session's machineId become known, per the comment above
    void cawco.status;
    // biome-ignore lint/complexity/noVoid: read-only dependency — re-runs this effect once the hub or the session's machineId become known, per the comment above
    void cawco.session(id)?.machineId;
    untrack(() => {
      // What the last read said stands while this pass reads again: a
      // reconnect re-reads behind a "no session" or an offline card, and
      // only the read's own outcome replaces it (`readHistory`).
      //
      // A running session is opened — hydrated from its row and subscribed to
      // — on every pass, and ahead of the guard below: the guard skips a pane
      // whose read landed before the hub's rows arrived, and that pane would
      // otherwise never subscribe. Opening is idempotent; reading is not.
      if (running || !hint) {
        openSession(id);
      }
    });
    // A pane the reader RETURNS to needs no re-read: the store kept ingesting
    // while the tab was hidden (only the transcript's row-building froze), so
    // re-reading replaced a full transcript with the tail chunk — content
    // collapsed, scrollTop clamped, the view lurched, and the follow rode the
    // rebuild. That was the tab-switch scroll hijack. The stream heals any gap
    // on its own.
    const held = cawco.session(id);
    if (held?.initialized && held.messages.length > 0) {
      // The transcript is in hand, which answers any earlier failed read.
      untrack(() => {
        missing = false;
        empty = false;
      });
      return;
    }
    untrack(() => {
      const cause = nextCause;
      nextCause = "open";
      // biome-ignore lint/complexity/noVoid: fire-and-forget inside untrack — readHistory reports its outcome through the store fields this effect reads
      void readHistory(id, cause);
    });
  });

  /**
   * Whether the reader is on this conversation: on screen, and the tab its
   * group is showing. A phone paints the neighbours of the showing tab parked
   * either side, so `visible` alone stays true across a swipe to one.
   */
  const here = $derived(
    visible && (workspace.leafOf(viewId)?.active ?? viewId) === viewId
  );

  /**
   * A reader who left this conversation while its transcript was still on its
   * way and came back is not owed that read's remaining wait: it is ended and
   * read afresh, the same one read the pane's first look made. A pane never
   * shown has not been left, so a background read that is moving is not cut.
   */
  let seenBefore = untrack(() => here);
  let leftUnread = false;
  $effect(() => {
    const present = here;
    untrack(() => {
      if (!present) {
        const held = cawco.session(viewId);
        leftUnread =
          seenBefore && !(held?.initialized && held.messages.length > 0);
        return;
      }
      seenBefore = true;
      if (leftUnread) {
        leftUnread = false;
        // biome-ignore lint/complexity/noVoid: fire-and-forget inside untrack — readHistory reports its outcome through the store fields the pane reads
        void readHistory(viewId, "open", true);
      }
    });
  });

  /**
   * The newest transcript page, read at render time and shipped with the page.
   * This is what the SERVER paints: without it the first response carried an
   * empty pane and the conversation only appeared once the bundle had hydrated
   * and the stream had answered. Claimed by the pane the URL names.
   */
  const tail = $derived(serverTail?.viewId === viewId ? serverTail : null);

  /**
   * How the server's read of this transcript was refused, said the way the
   * pane's own read would say it, until that read answers. A 404 is the
   * hub's "no such session" (`servedMissing`), not a fault.
   */
  const served = $derived(tail && !tail.ok && !readAnswered ? tail : null);
  const servedMissing = $derived(served?.status === 404);
  const servedFault = $derived(
    served && !servedMissing
      ? readFaultOf(served, served.machineId, served.reconnecting)
      : null
  );

  /**
   * The conversation as a session, built from the page's own data.
   *
   * The cawco store is a module singleton, so on the server it is shared by
   * every request — filling it in during a render would hand one reader's
   * transcript to the next. Nothing here touches it: this is request-local, it
   * renders the server's HTML and the client's first (hydrating) render, and it
   * is dropped the moment the real store session carries the conversation.
   */
  const seeded = $derived.by<SessionState | null>(() => {
    // Nothing read back means nothing to stand in for: the store's own empty
    // and loading states are better than a blank pane pretending to be one.
    if (!tail?.ok || tail.page.blocks.length === 0) {
      return null;
    }
    return seededSession(viewId, tail.page);
  });

  /**
   * Whether the live store has taken this conversation over. A one-way latch:
   * the store session exists from the first effect (empty), and swapping to it
   * then would blank the transcript the server just painted. It earns the pane
   * once it has something to show — history read back, a turn in flight, or a
   * permission waiting.
   */
  let live = $state(false);
  $effect(() => {
    const held = cawco.session(viewId);
    if (!held) {
      return;
    }
    if (held.messages.length > 0 || held.busy || held.pending.length > 0) {
      live = true;
    }
  });

  const session = $derived(live || !seeded ? cawco.session(viewId) : seeded);
  const machineId = $derived(cawco.session(viewId)?.machineId ?? "");

  /**
   * Whether the virtualized transcript may be shown.
   *
   * `live` above is the moment the STORE has the conversation, which is several
   * frames before the transcript can draw it: virtua mounts, measures its rows
   * (the scroll height doubles as it goes), and only then scrolls home. Swapping
   * on `live` alone therefore replaced the server's painted tail with a column
   * that was still being measured — a blank content area for those frames.
   *
   * So the two are handed over instead of swapped. The static tail stays on
   * screen, the transcript mounts *behind* it under `visibility: hidden` (which
   * still lays out and measures, unlike `display: none`), and this flips the
   * instant `Transcript` says it has landed. Both boxes are the same rect by the
   * `.tr` padding contract, so the flip moves nothing — and because it is one
   * assignment, the two are never both painted.
   */
  // No standin, no veil, no handover. The transcript renders directly from
  // the seeded session (server tail) on SSR via virtua's `ssrCount`, then
  // switches to live data when the WS delivers. Virtua owns the DOM from
  // the first frame — its SSR support renders the tail items as real DOM
  // nodes that hydrate in place.

  /**
   * A session the hub could not find anywhere: not in its rows, not in its
   * store, not on any machine it asked. There is nothing to subscribe to and
   * nothing to read back, so the pane says so instead of sitting empty. This
   * used to be inferred from a blank `machineId` once the rows had arrived,
   * which mistook every stored session still being located for a lost one;
   * now it is the hub's own 404.
   */
  const unaddressable = $derived((missing || servedMissing) && !askAlone);

  /**
   * A stored transcript with no machine behind it: readable, not writable.
   *
   * A pane that had its history but no `machineId` used to render a live
   * composer — one that took keystrokes, refused them at the `!machineId`
   * guard, and said nothing. A transcript with words in it should still be
   * read; it just cannot be written to.
   */
  const readOnly = $derived(
    !isLive && !!session && !session.machineId && session.messages.length > 0
  );

  /**
   * What stopped the transcript arriving: the newest read's word, whoever
   * made it (this pane, a socket backfill, a peek, a read again once its
   * machine's reconnecting window ends), as the session's `readFault`; the
   * server's until this pane's read answers. A card with a button, never a
   * skeleton.
   */
  const fault = $derived(
    session?.messages.length || askAlone
      ? null
      : (session?.readFault ?? servedFault)
  );

  /**
   * The read finished and there is nothing in it: a named state, not a list.
   * Only once the conversation's start is in hand: a newest page with no
   * blocks and a page still before it is a transcript being read, and the
   * list asks for that page (`Transcript`).
   */
  const blank = $derived(
    empty && session?.messages.length === 0 && session.cursor === null
  );
  /** Nothing to draw yet: the history is still on its way. */
  const waiting = $derived(
    !!session && !session.initialized && session.messages.length === 0
  );
  /** A named state stands in the transcript area instead of a transcript; an ask alone stands there as nothing. */
  const namedState = $derived(!!(fault || unaddressable || blank || askAlone));

  /**
   * Whether the transcript may be built. On screen, at once. Off screen, a
   * history read landing used to build the whole transcript in the task
   * that delivered it — rows, virtualiser, every row's body, one flush of
   * up to 500ms at whatever moment the read came back. A pane nobody can
   * see builds it when its turn at the scheduler's slow tier comes round
   * instead, or the moment it is shown, whichever is first; built once, it
   * stays built.
   */
  let turned = $state(untrack(() => visible));
  const buildable = $derived(visible || turned);
  $effect(() => {
    if (visible) {
      turned = true;
    }
  });
  $effect(() => {
    if (turned || waiting) {
      return;
    }
    return rebuildScheduler.once(`land:${viewId}`, () => {
      turned = true;
    });
  });

  /** The transcript is mounted in the transcript area. */
  const mounted = $derived(!(namedState || waiting) && buildable);

  /**
   * Whether the mounted transcript has drawn its rows, as it reports them
   * (`onshown`). Transcript keeps its list unpainted until every row in view
   * is measured, so the placeholder stands over it until then; dropping the
   * placeholder when the transcript mounted left the pane blank for those
   * frames. A transcript that goes reports false as it goes, so the reveal
   * is always the mounted instance's own, never one it inherited.
   */
  let shown = $state(false);

  /**
   * The placeholder, as a function of what stands in the area: over the
   * history still on its way, and over a transcript not yet drawn. Its
   * leaving fades over --dur-control on top of rows already in place, which
   * is the cross-fade, and nothing under it moves.
   */
  const veiled = $derived(!(prestart || namedState) && (waiting || !shown));
  // Hidden while veiled, the pane is still laid out, so its transcript can
  // measure and draw before its tab is chosen (dock.svelte.ts `settling`).
  settleWhile(
    () => viewId,
    () => veiled
  );

  /**
   * A named state leaving under the one arriving: out of the flow where it
   * stands (crossOut) and held at its own height, so a state centred in the
   * area stays centred while it fades.
   */
  function leave(node: HTMLElement) {
    return crossOutWith(node, () => ({ height: `${node.offsetHeight}px` }));
  }

  /** What a read failure is called: its machine away (on its way back, or offline), or the read failed. */
  const faultTitle = $derived.by(() => {
    if (fault?.reason !== "offline") {
      return "This transcript couldn't be read";
    }
    return fault.reconnecting
      ? "This machine is reconnecting"
      : "This machine is offline";
  });

  /** What a read failure says: what went wrong, then what to do about it. */
  const faultLine = $derived.by(() => {
    if (fault?.reason !== "offline") {
      return `Reading it failed: ${fault?.message}. Try again; if it fails the same way, the hub's log has the cause.`;
    }
    return fault.reconnecting
      ? `${fault.message}.`
      : `${fault.message}. Try again once it is back online.`;
  });

  /** Try again: forget what was said about the last read, then read. */
  function retry(): void {
    clearReadFault(viewId);
    missing = false;
    reread("retry");
  }

  /** Read again behind what the pane shows; the outcome replaces it. */
  function reread(cause: ReadCause): void {
    nextCause = cause;
    attempt += 1;
  }

  /**
   * The machine a read was refused for, as the fleet list says it is now.
   * Its return is the moment the read can be answered: the hub lists a
   * machine online once it has registered, and nothing else on this pane
   * moves when that happens — a hub restart left the pane saying "offline"
   * long after the machine was back.
   */
  const awayMachine = $derived(
    fault?.reason === "offline" ? fault.machineId : null
  );
  const awayOnline = $derived(
    awayMachine !== null &&
      cawco.machines.some(
        (machine) =>
          machine.machineId === awayMachine && machine.status === "online"
      )
  );
  /** Whether that machine was online when last looked at: a return is a change to true. */
  let wasOnline: boolean | null = null;
  $effect(() => {
    const online = awayOnline;
    const machine = awayMachine;
    untrack(() => {
      if (machine === null) {
        wasOnline = null;
        return;
      }
      if (online && wasOnline === false) {
        reread("machineOnline");
      }
      wasOnline = online;
    });
  });

  // The header's MCP count wants a reading, and the composer's `/` menu wants
  // the descriptions; only a live session answers either.
  //
  // Untracked around the store, for the same reason the read effect above is:
  // both loaders read their own `commandsPending` / mcp guard AND write it, so a
  // plainly-tracked effect takes those flags as dependencies and re-runs itself
  // the instant the call it just fired flips them — on a session that can't
  // answer, the rejection clears the guard and the effect re-fires in a tight
  // loop (thousands of `supportedCommands … failed` a second). Only a change in
  // whether this pane addresses a live session, or the hub becoming reachable,
  // should start a load: a first run before the socket opens is refused, and
  // the MCP ask keeps that refusal as `[]`. `isLive` is the board's notion —
  // a sleeping row is on the board too — and a sleeping session has no process
  // to ask, so the gate is the running list.
  const liveForCommands = $derived(
    !!session &&
      cawco.runningInstances.some((row) => row.id === viewId) &&
      !!machineId &&
      cawco.status === "connected"
  );
  $effect(() => {
    if (!liveForCommands) {
      return;
    }
    const id = viewId;
    const mid = machineId;
    untrack(() => {
      // biome-ignore lint/complexity/noVoid: fire-and-forget inside untrack — each loader tracks its own pending guard
      void loadMcpServers(id, mid);
      // biome-ignore lint/complexity/noVoid: fire-and-forget inside untrack — each loader tracks its own pending guard
      void refreshCommands(id, mid);
    });
  });

  const HARNESS_LABEL: Record<string, string> = {
    claude: "Claude Code",
    opencode: "opencode",
    code: "opencode",
    pi: "pi",
  };
  const agentName = $derived(
    HARNESS_LABEL[session?.harness ?? ""] ?? session?.harness ?? "Agent"
  );

  const commands = $derived(cawco.commandsOf(viewId));

  /**
   * What the composer may suggest: the session's skills, its connected MCP
   * servers described by their tool names, and its tools. CawCo's own
   * server is not one. The hub ranks and caps them by usage.
   *
   * Built when the suggestion chips first read it — to ask the hub about a
   * draft, or to draw its answer — not when the composer is handed this
   * conversation: every tab switch built the whole list, every skill, server
   * and tool, for chips that mostly had nothing to show.
   */
  const candidates = $derived.by((): SuggestCandidate[] => {
    const tooling = cawco.toolingOf(viewId);
    const skills: SuggestCandidate[] = commands
      .filter((command) => command.type === "skill")
      .map((command) => ({
        id: `skill:${command.name}`,
        kind: "skill",
        name: command.name,
        description: clip(
          cleanDetail(command.description, undefined, command.source) ?? ""
        ),
      }));
    const servers: SuggestCandidate[] = tooling.servers
      .filter(
        (server) => server.status === "connected" && server.name !== "cawco"
      )
      .map((server) => {
        // Tool names carry the server name with anything outside [A-Za-z0-9_-] as `_`.
        const prefix = `mcp__${server.name.replace(/[^A-Za-z0-9_-]/g, "_")}__`;
        return {
          id: `mcp:${server.name}`,
          kind: "mcp",
          name: server.name,
          description: clip(
            tooling.tools
              .filter((tool) => tool.startsWith(prefix))
              .map((tool) => tool.slice(prefix.length))
              .join(", ")
          ),
        };
      });
    // Every non-MCP tool by name alone; an MCP server's tools ride on its chip.
    // The hub drops the ones never worth pointing at.
    const tools: SuggestCandidate[] = tooling.tools
      .filter((tool) => !tool.startsWith("mcp__"))
      .map((tool) => ({
        id: `tool:${tool}`,
        kind: "tool",
        name: tool,
        description: "",
      }));
    return [...skills, ...servers, ...tools];
  });
  const suggest = {
    get candidates() {
      return candidates;
    },
  };

  /**
   * Every operator action on this conversation goes out as ONE tracked command
   * and reports back the id its stages are readable under. Nothing here wraps a
   * promise to invent a state: what the header, the cards and the composer draw
   * is the tracker's own account of the action, on both the stream path and the
   * legacy one (where the same calls run and their promises are the stages).
   */

  /**
   * A parked request's answer, as a command. The id goes back to the card that
   * asked, which is the only thing that reads it: several cards can be parked
   * at once and they all answer in the same kind.
   */
  function onanswer(
    request: PendingPermission,
    on: string | undefined,
    result: PermissionResult
  ): string | null {
    if (!on) {
      return null;
    }
    return submitCommand(request.instanceId, on, "permission.answer", {
      requestId: request.requestId,
      result,
    });
  }

  /**
   * The asks this conversation made: its own (a delegate's belongs to its
   * parent, never the reader's queue), then those parked elsewhere that it
   * made (a memory curator run's proposal, on machine "hub"), each answered
   * on the machine it is parked on.
   */
  const parked = $derived<
    { machine: string | undefined; request: PendingPermission }[]
  >([
    ...parkedAsks(session?.pending ?? []).map((request) => ({
      request,
      machine: machineId || undefined,
    })),
    ...cawco.blocked
      .filter((row) => row.request.originInstanceId === viewId)
      .map((row) => ({ request: row.request, machine: row.machineId })),
  ]);
  /** The first of them, which the composer grows into: one ask at a time. */
  const firstAsk = $derived.by((): ComposerAsk | null => {
    const [first] = parked;
    return first
      ? {
          request: first.request,
          asker: agentName,
          more: parked.length - 1,
          onanswer: (result) => onanswer(first.request, first.machine, result),
        }
      : null;
  });

  /** "Make this a project", when the hub offered it to this session. */
  const projectOffer = $derived(cawco.projectOfferOf(viewId));
  /** The project the offer joined: the card says so where it stood. */
  const projectJoin = $derived(cawco.projectJoinOf(viewId));

  /** What this conversation has half-written, whichever composer draws it. */
  const draft = new ComposerDraft();

  // The draft across a reload, under the conversation's id. A pane is
  // mounted once per conversation (PaneHost keys it by id), so the id is
  // fixed for its life, and the draft is written once more as it closes.
  keepDraft(draft, () => viewId);

  // A queued message being edited here goes back as it was when the
  // conversation closes: its bubble is whole wherever it is next drawn.
  $effect(() => () => {
    draft.putBack();
  });

  // The hub took the send: the message it carried needs no keeping.
  $effect(() => {
    const stage = latestCommandFor(viewId, "send")?.stage;
    if (stage === "accepted" || stage === "applied") {
      untrack(() => draft.settle());
    }
  });

  /** Why this session's last send failed, said over its composer's field. */
  const sendFailure = $derived(sendFailureNotice(viewId));

  /**
   * "Edit" on a message that never sent: the store parks the whole payload in
   * this session's restore slot and the pane spends it here, back into the
   * draft. The row offering Edit is two components away from `draft`, so the
   * store is the channel; this is the far end of it.
   */
  $effect(() => {
    const slot = pendingRestore(viewId);
    if (!slot) {
      return;
    }
    const id = viewId;
    untrack(() => {
      draft.restore(slot.text, slot.extras);
      clearRestore(id);
    });
  });

  /** Whether this session's last message is out of this tab but not yet taken. */
  const sending = $derived(
    latestCommandFor(viewId, "send")?.stage === "submitted" &&
      !latestCommandFor(viewId, "send")?.waiting
  );

  async function onsubmit(
    text: string,
    extras: SendExtras,
    id: string
  ): Promise<string | undefined> {
    if (!machineId) {
      // A tripwire, not a guard anybody should hit: a pane with no machine
      // renders no composer at all. A render race can still land one keystroke
      // here, so it stays — but loud in development, because the whole point of
      // this change is that a typed sentence never disappears without a word.
      if (import.meta.env.DEV) {
        console.warn("composer rendered without a machine", viewId);
      }
      return;
    }
    // A message to a sleeping session wakes it on the hub, in the one path every
    // send takes, so this tab sends and nothing else. The hub's own refusal
    // ("machine X is not connected") becomes the command's failed stage — the
    // ledger is the report, which is why there is nothing to catch here.
    return await submitCommand(viewId, machineId, "send", { text, extras }, id);
  }

  /**
   * The queue-jump the shortcut sheet has promised all along (mod+Enter,
   * "Interrupt and send"): stop the turn in flight, then send — "do this
   * INSTEAD", where plain Enter's queue is "do this next". Two tracked
   * commands, deliberately: the interrupt's local half drops the working pill
   * at once, the send's echo renders at once, and any gap between the turn
   * dying and the message being taken is narrated by the queued row rather
   * than guessed at. On an idle session it is exactly a send.
   */
  function oninterruptsend(text: string, extras: SendExtras, id: string): void {
    if (!machineId) {
      return;
    }
    if (session?.busy) {
      submitCommand(viewId, machineId, "interrupt", {});
    }
    onsubmit(text, extras, id);
  }

  function onstop(): void {
    // Through the tracker, not the bare legacy call: the record it leaves is
    // how the transcript recognises the coming `result.error` as the receipt
    // of THIS stop and renders "Interrupted" instead of a failure card.
    if (machineId) {
      submitCommand(viewId, machineId, "interrupt", {});
    }
  }

  /** The `/` menu opened: ask the session again what it offers. */
  function refreshMenu(): void {
    if (machineId) {
      // biome-ignore lint/complexity/noVoid: fire-and-forget command menu refresh
      void refreshCommands(viewId, machineId);
    }
  }

  /** Whether this conversation takes messages from here at all. */
  const writable = $derived(
    !!session &&
      !(prestart || unaddressable || readOnly) &&
      // An ask alone has a composer only while the ask stands: it is the card.
      (asking || !askAlone) &&
      // A transcript that could not be read leaves the conversation as
      // writable as it was; only a machine that is offline cannot be written
      // to, and a send needs a machine to go to.
      (!fault || (fault.reason !== "offline" && !!machineId))
  );

  /**
   * The room this pane's transcript keeps clear at its foot for the
   * composer standing over it: the composer's one-line box, the delegate
   * tray's row on it (kept whether or not a chip is in it), and the
   * suggestion row on that where the surface suggests (app.css
   * `--c-composer-panel`, `--c-tray-row`, `--c-suggest-room`). Everything
   * else the composer holds — a longer draft, attachments, a failed send's
   * line, the ask it grows into — stands over the transcript's foot and moves no
   * row. A conversation that cannot be written to has no composer.
   *
   * CSS, from this conversation's own state, not a measurement: it holds
   * while the pane is off screen and is the same when it comes on screen.
   * Measured off the group's one composer and copied down, the room was the
   * showing conversation's in every pane, and changed under the arriving
   * one after it had started to draw (the rows under a pinned tail moved
   * 35px as a switch's glide ended, when two tabs' trays differed).
   */
  const composerRoom = $derived(
    writable
      ? `var(--c-composer-panel) + var(--c-tray-row)${suggestions.enabled ? " + var(--c-suggest-room)" : ""}`
      : "0px"
  );

  /**
   * This conversation, as its group's composer sees it. Read through getters,
   * so the composer follows the session live while it is in front.
   */
  const binding: ComposerBinding = {
    draft,
    get agentName() {
      return agentName;
    },
    get busy() {
      return session?.busy ?? false;
    },
    get sending() {
      return sending;
    },
    get sendError() {
      return sendFailure;
    },
    get commands() {
      return commands;
    },
    get mentionsFrom() {
      return viewId;
    },
    get suggest() {
      return suggest;
    },
    get paneVisible() {
      return visible;
    },
    get transcriptShare() {
      return (100 - previewShare) / 100;
    },
    get delegatesOf() {
      return viewId;
    },
    get recallOf() {
      return viewId;
    },
    onsubmit,
    oninterruptsend,
    onmenu: refreshMenu,
    onstop,
    prompts: offer,
    get ask() {
      return firstAsk;
    },
    onfoot: (next) => {
      parkedRoom = next.parked;
      shelfRoom = next.shelf;
    },
    get planRing() {
      return planProgressNow ? planRing : undefined;
    },
  };

  $effect(() => {
    if (!(browser && writable)) {
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
</script>

<!-- The composer's two slots, drawn by whichever composer is writing to this
     conversation: the one below on a desk, the deck's on a phone. -->
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

<!-- The quiet one: an offer, standing on the composer's tray row. A parked
     ask is not drawn here: the composer grows into it (`ask`). -->
{#snippet offer()}
  {#if projectOffer || projectJoin}
    <div class="parked" data-flip>
      <ProjectOffer
        instanceId={viewId}
        joined={projectJoin}
        offer={projectOffer}
      />
    </div>
  {/if}
{/snippet}

<!-- A named state, not an empty pane: what happened, in one line, and the one
     thing that can be done about it. -->
{#snippet faultState(fault: ReadFault)}
  <EmptyState
    class={STATEFUL}
    icon={fault.reason === "offline" ? IconLaptop : IconAlert}
    line={faultLine}
    role="alert"
    title={faultTitle}
  >
    {#snippet action()}
      <Button onclick={retry} variant="outline">Try again</Button>
    {/snippet}
  </EmptyState>
{/snippet}

{#snippet besideSurface(switcher: Snippet | undefined)}
  {#if beside && besideStages}
    <TaskPane
      allowedFrom={(stage) =>
        besideStages ? movesFrom(besideStages, stage) : new Set()}
      onchanged={() => {
        readBeside(beside?.projectId ?? "").catch(() => undefined);
      }}
      onclose={() => putAway(viewId)}
      onmove={moveBeside}
      onopen={showBeside}
      projectId={beside.projectId}
      stages={besideStages}
      {switcher}
      taskId={beside.taskId}
      tasks={besideTasks}
    />
  {/if}
{/snippet}

{#snippet missingState()}
  <EmptyState
    class={STATEFUL}
    icon={IconAlert}
    title="This session isn't reachable from here"
  >
    {#snippet line()}
      The hub has no record of <code>{viewId}</code>, and no machine it can
      reach has a transcript filed under it. It may live on a machine that is
      offline, or it may have been deleted.
    {/snippet}
    {#snippet action()}
      <Button href="/session" variant="outline">Back to the fleet</Button>
    {/snippet}
  </EmptyState>
{/snippet}

<div class="pane" bind:clientWidth={paneWidth}>
  {#if prestart}
    <!-- Nothing stands behind the wait: the session does not exist yet. -->
  {:else if session}
    <SideSplit
      {active}
      {phone}
      planOf={viewId}
      task={besideStages ? besideSurface : undefined}
      taskOpen={!!beside}
      {viewId}
      {visible}
      bind:this={side}
      bind:share={previewShare}
    >
      <div
        class="body"
        style="--composer-clearance: calc({composerRoom} + var(--space-4) + var(--space-4))"
      >
        <!-- The transcript area. Movement between conversations is owned by the
           pane above this one, so nothing here animates on a switch — this is
           the surface a swipe carries, not the thing that carries it. -->
        <div class="transcript-slide">
          <!-- A named state, not an empty pane: what happened, in one line,
                   and the one thing that can be done about it. -->
          {#if fault}
            <div class="state" in:crossIn out:leave>
              {@render faultState(fault)}
            </div>
          {:else if unaddressable}
            <div class="state" in:crossIn out:leave>
              {@render missingState()}
            </div>
          {:else if blank}
            <div class="state" in:crossIn out:leave>
              <EmptyState
                class={STATEFUL}
                icon={IconChat}
                line="Write the first message below."
                title="Nothing has been said here yet"
              />
            </div>
          {:else if mounted}
            <div class="state">
              <RegionBoundary region="transcript">
                <Transcript
                  {agentName}
                  {focused}
                  onshown={(drawn) => {
                    shown = drawn;
                  }}
                  parkedHeight={writable ? parkedRoom : 0}
                  shelfHeight={writable ? shelfRoom : 0}
                  {session}
                  {visible}
                />
              </RegionBoundary>
            </div>
            <HeadFade />
          {/if}
          <!-- The skeleton stands in for rows still on their way and goes the
               moment they are drawn: its rows are not where the real ones fall, so
               fading it over them reads as a second, stale transcript. -->
          {#if writable && browser}
            <FootFade />
          {/if}
          {#if veiled}
            <div class="veil" in:crossIn>
              <TranscriptSkeleton />
            </div>
          {/if}
        </div>

        <!-- The group draws the composer; only the server's first paint,
                 before any group composer exists, draws one here. -->
        {#if !fault && (unaddressable || readOnly)}
          <p class="readonly" in:crossIn out:crossOut>
            This transcript is stored; the session isn't reachable from here.
          </p>
        {:else if writable && !browser}
          <Composer
            {agentName}
            ask={firstAsk}
            busy={session.busy}
            {commands}
            {draft}
            mentionsFrom={viewId}
            {oninterruptsend}
            onmenu={refreshMenu}
            {onstop}
            {onsubmit}
            paneVisible={visible}
            recallOf={viewId}
            sendError={sendFailure}
            {sending}
            showing={viewId}
            {suggest}
            trayRows={[{ delegatesOf: viewId, id: viewId, prompts: offer }]}
          />
        {/if}
      </div>
    </SideSplit>
  {:else if fault}
    <!-- No session in the store yet, and the server's read was refused: the
         same named state the pane's own read would show. -->
    <div class="state">{@render faultState(fault)}</div>
  {:else if unaddressable}
    <div class="state">{@render missingState()}</div>
  {:else}
    <!-- No session in the store yet: the same placeholder the transcript
         area shows, so the two loading moments look like one. -->
    <TranscriptSkeleton />
  {/if}
  <!-- The move's wait: the whole pane until the session starts, then over
       its transcript until that has drawn, fading from over it (design
       §2e: the ready line is the transcript's first row by then). -->
  {#if move && (prestart || !(shown || namedState))}
    <div class="move-layer" out:crossOut>
      <MoveWait job={move} {phone} />
    </div>
  {/if}
</div>

<style>
  .body {
    min-width: 0;
  }

  /* The composer's slot, when there is no composer. Sits where the input would,
     in the muted voice of something stating a fact rather than refusing one. */
  .readonly {
    margin: 0 auto var(--space-4);
    padding: var(--space-2) var(--space-3);
    color: var(--ink-muted);
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    text-align: center;
  }

  .pane {
    position: relative;
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
    min-height: 0;
  }

  /* ── Transcript slide ─────────────────────────────────────────────
     Only the transcript area slides on tab switch. Header and composer
     stay put. The entering transcript slides in from the tab direction,
     the exiting one slides out the opposite way. */
  .transcript-slide {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
    /* The area's own stacking context: the placeholder's z-index below is
       ranked among the transcript's, never against the group's composer
       standing over this area's foot. Without it a desk's placeholder
       painted over the composer and took its clicks until the rows came. */
    isolation: isolate;
    /* The transcript's scroll, in reach of its head blur (HeadFade). */
    timeline-scope: --transcript-head;
  }

  /* One named state, or the transcript, filling the area. */
  .state {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
  }
  /* The placeholder, laid over the transcript until its rows are drawn:
     opaque, so fading it is the cross-fade, and above the transcript's own
     sticky notes, below the composer. */
  /* A move's wait, over everything the pane holds, opaque: fading it is the
     cross-fade to the transcript under it. */
  .move-layer {
    position: absolute;
    inset: 0;
    z-index: 6;
    display: flex;
    flex-direction: column;
  }
  .veil {
    position: absolute;
    inset: 0;
    z-index: 4;
    display: flex;
    flex-direction: column;
    background: var(--surface-recess);
  }

  /**
   * The handover. The transcript is IN FLOW the whole time — it is the thing
   * that stays — so revealing it moves nothing; it is merely unpainted while it
   * measures. The server's tail is the one lifted out of flow and laid over it,
   * because both want to be `.body`'s whole box and two in-flow flex children
   * would take half each.
   */
  /* No standin — virtua renders the tail directly via ssrCount. */
</style>
