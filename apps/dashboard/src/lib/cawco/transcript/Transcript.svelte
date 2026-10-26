<script lang="ts" module>
  import type { CacheSnapshot } from "virtua";

  /**
   * virtua's measured sizes for each conversation, by session id, so a pane
   * that mounts again lands on measured rows instead of measuring its way
   * there. Sizes are by index: they are handed back only to rows that begin
   * with the same row and have not lost any.
   */
  const sizes = new Map<
    string,
    { cache: CacheSnapshot; first: string; count: number }
  >();

  /**
   * Where the reader left a conversation: at its tail, or at a block — the
   * first block of the row at the top of the view, by id, and how many
   * pixels of its row were scrolled past. A block keeps its id whatever
   * arrives before or after it and however the rows around it fold, and
   * the row holding it is found again (open-at.svelte.ts `rowHolding`), so
   * the place survives a conversation that grew while it was away. Kept per
   * session in sessionStorage, so a reload returns there too. Or at a record
   * the conversation was opened at (`?at=`, open-at.svelte.ts), centred:
   * never kept, it is the address's.
   */
  type Landing =
    | { tail: true }
    | { tail: false; block: string; into: number }
    | { tail: false; at: string };
  const LANDING = "cawco:landing:";
</script>

<script lang="ts">
  import { commonWords, transcriptWords } from "@cawco/core";
  import { detach } from "@cawco/core/detach";
  /**
   * The scrolling transcript: the folded rows, virtualized. The live tail rides
   * as rows of its own (see `buildRowsFrom`), so streaming text, an open reasoning
   * block and the tool in flight all scroll with the conversation. Announces
   * genuine arrivals — and blocked-on-you — through a dedicated live region
   * beside the log, never through the virtualized container itself.
   */
  import { flushSync, onDestroy, setContext, tick, untrack } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import { Virtualizer, type VirtualizerHandle } from "virtua/svelte";
  import { track } from "#lib/cawco/track.js";
  import { describeTool } from "#lib/components/features/tool-cards/descriptors.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { IconChat } from "#lib/icons.js";
  import { browser } from "$app/env";
  import { stopWords } from "../accounts/switch.svelte";
  import {
    cawco,
    faultMessage,
    readOlderPage,
    readTranscript,
    reconnectingNow,
    type SessionState,
  } from "../client.svelte";
  import { devNote } from "../dev-debug";
  import EmptyAsk from "../EmptyAsk.svelte";
  import { askFirst, EMPTY_LINES, firstAskLabel } from "../empty-asks";
  import {
    type FrameObserver,
    frameObserver,
    frameSize,
  } from "../frame-observer";
  import { crossIn, dur, ease, motionOk, rise } from "../motion/curves.svelte";
  import { BLEED } from "../motion/rows.svelte";
  import { carry, waiting } from "../motion/share.svelte";
  import { provideSessionHere } from "../session-here";
  import { readJson, writeJson } from "../storage";
  import { isThreadTab } from "../thread-tabs";
  import { rebuildScheduler } from "../workspace/scheduler.svelte";
  import { warm } from "../workspace/warm.svelte";
  import AccountMoveDivider from "./AccountMoveDivider.svelte";
  import {
    type Handoff,
    type Motion,
    provideLedger,
    type Ticket,
    watchedSessions,
  } from "./arrivals.svelte";
  import Behind from "./Behind.svelte";
  import CatchUp from "./CatchUp.svelte";
  import CompactionDivider from "./CompactionDivider.svelte";
  import ConnectCard from "./ConnectCard.svelte";
  import { compactionMarkComing } from "./compaction-mark";
  import { paneDrafts } from "./composer-draft.svelte";
  import { connectReveal } from "./connect-sign-ins.svelte";
  import Delegate from "./Delegate.svelte";
  import { disclosureAt } from "./disclosure.svelte";
  import Latest from "./Latest.svelte";
  import LiveRow from "./LiveRow.svelte";
  import MessageRow from "./MessageRow.svelte";
  import NoticeRun from "./NoticeRun.svelte";
  import { blockOf, openAt, rowHolding } from "./open-at.svelte";
  import QuestionCard from "./QuestionCard.svelte";
  import TranscriptRow from "./Row.svelte";
  import {
    buildRowsFrom,
    called,
    type Fold,
    type FoldMemo,
    queuedFrom,
    type Row,
    type StepFold,
    stepFold,
    wellRunsFrom,
  } from "./rows";
  import Subagent from "./Subagent.svelte";
  import SystemLine from "./SystemLine.svelte";
  import Thinking from "./Thinking.svelte";
  import ToolGroup from "./ToolGroup.svelte";
  import { trayNews, trayReveal } from "./tray.svelte";

  let {
    session,
    visible,
    focused,
    agentName,
    onlanded,
    onshown,
    firstScreen = false,
    bare = false,
    parkedHeight = 0,
    latestInset,

    /**
     * Whether this transcript is on screen at all. Governs how OFTEN rows are
     * built: a pane nobody can see reads its session only at the scheduler's
     * slow tier, and never in the flush that brings it on screen.
     */
    /**
     * Whether this is the transcript being worked in. Governs how EAGERLY
     * rows are rebuilt, and who gets to ride the tail and announce.
     *
     * Defaults to `visible`, so the single-pane case — one transcript, on
     * screen, being read — behaves exactly as it always has.
     */
    /** Optional callback when the transcript first renders content. */
    /**
     * Told whether this transcript's list is drawn (`shown`, below), and told
     * false when this transcript goes: the pane's placeholder stands over it
     * exactly while it is not.
     */
  }: {
    session: SessionState;
    visible: boolean;
    focused?: boolean;
    agentName: string;
    onlanded?: () => void;
    onshown?: (shown: boolean) => void;
    /**
     * The rows are the server's first screen of this conversation (the
     * page a cold load was served with): stood in, painted at the tail from
     * the server's HTML on, until the list has landed and is drawn in their
     * place (`servedRows`).
     */
    firstScreen?: boolean;
    /**
     * An empty conversation draws nothing of its own: its composer is the
     * whole instruction (a thread with a project's Caw, which has no `/` or
     * `@` to tell of).
     */
    bare?: boolean;
    /**
     * How far what rises past the composer lent to this conversation (an
     * ask it grows into, an offer on its tray row) stands over the foot, px.
     * Set on the two boxes that read it (`.parked-room`, `.dock`), never on
     * a box around the list: it changes as the composer measures itself and
     * as it is lent from tab to tab, and written above the list it restyled
     * every row in the list each time.
     */
    parkedHeight?: number;
    /** Where the way back to the tail rests, up from the scroller's foot, when the pane says (a thread). */
    latestInset?: string;
  } = $props();

  setContext("cawco:machine", () => session.machineId);
  provideSessionHere(() => session.instanceId);

  /** One transcript, on screen, being read: `focused` follows `visible`. */
  const isFocused = $derived(focused ?? visible);

  /**
   * The old single flag, kept as the name the rest of this file reads.
   *
   * Everything below that asks "am I the transcript the reader is at" —
   * riding the streaming tail, announcing turns, landing on reactivation —
   * means FOCUSED. Only the row-building freeze means VISIBLE, and it says
   * so where it happens.
   */
  const active = $derived(isFocused);

  /**
   * The folded rows — frozen while this pane is off screen.
   *
   * The session layout keeps one pane per open tab and never unmounts it, so
   * the scroll offset and the half-typed message survive a switch. The cost of
   * that was paid on every streamed frame: a session streaming into a tab the
   * reader is NOT looking at rebuilt every row and re-parsed the streaming
   * turn's markdown, frame after frame, forever. Measured at 1.09s of script
   * and 513 layouts per 300 streamed frames — MORE than the same stream costs
   * in the pane actually on screen, because the background session was the
   * large one. With several tabs open and one session streaming, the reader
   * pays that for a picture nobody can see.
   *
   * So an invisible transcript stops reading the session at all. While
   * `visible` is false the body below touches only `visible` and the array it
   * already built, which means nothing the session writes can invalidate it —
   * there is no recompute to skip because there is no invalidation. virtua
   * stays mounted on the rows it already has, so the DOM, the heights it
   * measured and the scroll offset are all untouched and a frozen pane costs
   * nothing per frame.
   *
   * Flipping `visible` or `focused` back on does NOT rebuild in that flush.
   * The switch used to fold every message and re-render every row inside the
   * same task as the tab change — the dock's `appendChild`, the scroll
   * restore and a 256ms fold, all before the first paint — which is the
   * delay the reader felt as the tab sticking. Now the switch paints the
   * frozen rows as they are (`held`), and the catch-up runs after that paint
   * as an APPEND: the fold restarts at the last turn before the old end, so
   * every row before it keeps its identity and the keyed each touches only
   * the rows that are actually new. The tail-follow effect below then rides
   * to the new tail if the reader was at the tail when they left.
   *
   * The grid adds a third state between those two. A pane that is visible but
   * NOT focused still has to show what its agent is saying, but rebuilding it
   * on every frame of its own stream is what makes four panes cost four times
   * one. So it reads the session under `untrack` and depends on nothing but a
   * counter the scheduler bumps when this pane's turn comes round. The session
   * can write as often as it likes; only the tick invalidates this. A hidden
   * pane takes the same turns at the scheduler's slow tier, so that by the
   * time it is switched to there is usually nothing left to fold.
   */
  /** No settled rows: a build whose rows are all read afresh. */
  const NO_ROWS: Row[] = [];
  /**
   * `read` of a build's settled rows (`Built`'s `settled`), once for each
   * array the fold hands over: a new array is a settled row moved, gone or
   * changed (rows.ts `stillDrawn`: the store's revision moves with every
   * change to a message), so what was read of the last one still holds.
   */
  function perSettled<T>(read: (settled: Row[]) => T): (settled: Row[]) => T {
    const seen = new WeakMap<Row[], T>();
    return (settled) => {
      if (!seen.has(settled)) {
        seen.set(settled, read(settled));
      }
      return seen.get(settled) as T;
    };
  }
  /** Which keys a list of rows holds. */
  interface Keys {
    has: (key: string) => boolean;
  }
  const settledKeys = perSettled(
    (settled) => new Set(settled.map((row) => row.key))
  );
  /** The keys of `among`, which begins with `settled`: those read once, the rest now. */
  function keysIn(among: Row[], settled: Row[]): Keys {
    const known = settledKeys(settled);
    const rest = new Set<string>();
    for (let i = settled.length; i < among.length; i += 1) {
      rest.add(among[i].key);
    }
    return { has: (key) => known.has(key) || rest.has(key) };
  }
  /** Where among settled rows the ones that can leave stand (`canLeave`): a failed send, a compaction running. */
  const leavableIn = perSettled((settled) =>
    settled.flatMap((row, index) => (canLeave(row) ? [index] : []))
  );
  let frozen: Row[] = [];
  /** The rows `frozen` begins with as the fold keeps them (see `Built`). */
  let frozenSettled: Row[] = NO_ROWS;
  /**
   * A build: the rows, whether they grew at the front, and how the last live
   * row ended — and the array the rows begin with, `settled`: the fold's
   * settled rows (rows.ts `FoldMemo.drawn`), the same array from one build to
   * the next for as long as none of them moves. Whatever is read off every
   * row is read off those once for each such array (`perSettled`), and off
   * the rows after them each build: a streamed word moves the tail alone.
   */
  interface Built {
    /**
     * Whether the conversation had a page before these rows as they were
     * built: the strip before the list says so (the markup) for these rows,
     * and goes with the page that ends it in the flush that puts it in front.
     */
    before: boolean;
    ended: Fold["ended"];
    rows: Row[];
    settled: Row[];
    shifted: boolean;
  }
  /** Whether the rows on screen were built with a page before them (`Built.before`). */
  let frozenBefore = false;
  /** The rows already on screen, handed back unchanged: nothing moved, nothing ended. */
  const STILL_BUILD = (): Built => ({
    before: frozenBefore,
    rows: frozen,
    settled: frozenSettled,
    shifted: false,
    ended: null,
  });
  /**
   * The second step of a change virtua has to take in two (see `build`):
   * the rows it ends on, and the bump that hands them over.
   */
  let pending: { rows: Row[]; settled: Row[] } | null = null;
  let secondStep = $state(0);
  /** What `frozen` was folded from — the incremental fold's memory. */
  let memo: FoldMemo | null = null;
  /** Whether `frozen` holds a real build yet — the first one is unconditional. */
  let primed = false;
  /** Bumped by the scheduler. The ONLY dependency of an unfocused rebuild. */
  let rebuildTick = $state(0);
  /**
   * The switch flush, and the frame it paints: while this holds, the rows
   * are the frozen ones whatever the session says. Raised by the build that
   * first sees the rising edge of `visible` / `focused` with something to
   * catch up on (see `hold`), let go once that flush has painted.
   */
  let held = false;
  /** Bumped when the hold lets go: the build's dependency on the release. */
  let released = $state(0);
  /**
   * How many times `visible` or `focused` has risen. A count rather than the
   * two flags, so the build it feeds is invalidated by a rising edge alone: a
   * pane leaving view is no reason to rebuild it inside that flush.
   */
  let seenVisible = false;
  let seenFocused = false;
  let rises = 0;
  const risen = $derived.by(() => {
    if ((visible && !seenVisible) || (isFocused && !seenFocused)) {
      rises += 1;
    }
    seenVisible = visible;
    seenFocused = isFocused;
    return rises;
  });
  /** The count the last build saw: a build that sees a higher one is the switch's. */
  let builtRises = 0;
  /**
   * From the switch until the append lands — what the tail indicator shows.
   * Distinct from `held` because the fold itself happens after the hold is
   * released, and the indicator should stay until it has.
   */
  let catching = $state(false);
  // The transcript opens on the latest message, not the top. virtua fires an
  // onscroll on mount (scrollTop 0, tall content) which would flip `atBottom`
  // false before the tail-follow effect runs, leaving the reader at the top —
  // so the first landing is unconditional, and only then does `atBottom` govern.
  // Declared up here because the build reads it, and the server evaluates the
  // rows before the scroller's own state is declared.
  let landed = $state(false);
  /**
   * Whether the list is drawn. Until the first landing has put the rows where
   * they will stay, it is laid out and measured but not painted: see the
   * reveal below. Declared up here with `landed`, which the build reads.
   * This instance's own, from false: a transcript mounted again — a pane
   * remounting, a module replaced in development — measures and lands
   * before it is painted, like the first one.
   */
  let shown = $state(false);
  $effect(() => {
    const drawn = shown || servedRows;
    untrack(() => onshown?.(drawn));
    return () => untrack(() => onshown?.(false));
  });
  // ── The arrival ledger's state. Read by every build, so declared before
  // the first one (the server evaluates the rows during init).
  /** Every id this view has held: rows, the calls inside runs, the live tail's rows. */
  const known = new Set<string>();
  /**
   * The rows whose ids are all in `known`. A build keeps every row it did
   * not fold again as the same object, and a row's ids never change, so a
   * row seen once is never read for its ids again: a long transcript's every
   * row was, on every streamed frame. Declared here with the rest of the
   * ledger: a transcript mounting on a session whose sizes it kept builds
   * during init (`cache`), and read further down it was not yet initialised.
   */
  const recorded = new WeakSet<Row>();
  /** Arrivals decided and not yet mounted. A row takes its own, once. */
  const tickets = new Map<string, Ticket>();
  /** The array the last build folded. Live frames push onto it; history replaces it. */
  let lastArray: unknown = null;
  /** Whether the ledger has seen a build: the first one is everything already there. */
  let seeded = false;
  /** Rows that land together cascade this far apart, and no more than five deep. */
  const STAGGER_MS = 30;
  const STAGGER_ROWS = 5;

  /** Whether the page is visible. Tracked, so the ledger and the rows can read it. */
  let pageHidden = $state(browser && document.hidden);
  $effect(() => {
    const seen = (): void => {
      pageHidden = document.hidden;
      tickets.clear();
    };
    document.addEventListener("visibilitychange", seen);
    return () => document.removeEventListener("visibilitychange", seen);
  });

  /**
   * Whether this view is being watched: landed and drawn, the transcript
   * being worked in, on screen, not replaying a catch-up, on a visible page.
   * A build outside this window is history for this view, whatever it
   * contains.
   */
  const watched = $derived(
    landed && shown && active && visible && !catching && !pageHidden
  );

  $effect(() => {
    const id = session.instanceId;
    if (!watched) {
      tickets.clear();
      return;
    }
    watchedSessions.add(id);
    return () => watchedSessions.delete(id);
  });

  const idsOf = (row: Row): string[] =>
    row.kind === "tools" ? row.messages.map(callId) : [row.key];

  /**
   * A row's key as any later mount of this pane will fold it: a message's
   * row by the message, since an answer streamed in this view goes by the
   * live row's key (rows.ts `keepLive`) and a new fold never sees that one.
   */
  const placeOf = (row: Row): string =>
    row.kind === "single" ? row.message.id : row.key;

  /** Rows whose data is the live tail's own — they exist only while the session is live. */
  const LIVE_KINDS = new Set<Row["kind"]>(["live", "livetool", "queued"]);

  /** A tool call's id to the ledger: the run it sits in is not what arrives. */
  const callId = (m: { id?: string; toolCallId?: string | null }): string =>
    `call:${m.id ?? m.toolCallId}`;

  /**
   * What the session looked like when these rows were last built.
   *
   * Coming back to a conversation used to rebuild every row and re-render
   * them — markdown parsed, code highlighted — whether or not a single word
   * had arrived while it was away. Measured on a real switch: one 256ms task
   * with the main thread blocked for all of it, which is the delay a reader
   * feels as the tab "sticking".
   *
   * Nothing that has not changed needs rebuilding. When the print matches,
   * the SAME array is returned, so the keyed each sees identical rows, no
   * component re-renders, and the pane simply becomes visible again.
   */
  let builtPrint = "";
  /**
   * Each message array this view folds gets a number. The ledger reads a new
   * array as history and a grown one as live, so a build must see every new
   * array: the store's read replacing the server's stand-in with a list of
   * the same length printed the same, was never built, and the first turn
   * pushed onto the store's list was taken for history — the reader's own
   * message arriving still.
   */
  const arrays = new WeakMap<object, number>();
  let arraySerial = 0;
  const arrayOf = (messages: object): number => {
    let serial = arrays.get(messages);
    if (serial === undefined) {
      arraySerial += 1;
      serial = arraySerial;
      arrays.set(messages, serial);
    }
    return serial;
  };
  // Where the waiting messages begin and which message ends the conversation
  // before them: a read moves a row there without changing how many
  // messages there are.
  const printOf = (): string => {
    const settled = queuedFrom(session.messages);
    const last = session.messages[settled - 1];

    return (
      `${arrayOf(session.messages)}:${session.messages.length}:${settled}:${last?.id ?? ""}:${session.streaming.length}:` +
      `${session.thinkingStream.length}:${session.busy ? 1 : 0}:${session.pending.map((ask) => `${ask.requestId}${ask.routedTo ?? ""}`).join(",")}:` +
      `${session.openBlock}:${session.thinkingClosing}:${session.currentTool?.toolId ?? ""}:${session.sdkStatus}:${session.lastCompaction?.at ?? ""}:${session.cursor === null ? 0 : 1}:` +
      `${last?.metadata?.sendFailed ?? ""}:${session.rev}`
    );
  };
  /** Dev-only: the gate that catches an accidentally tracked session read. */
  const countBuild = (): void => {
    if (!import.meta.env.DEV || typeof window === "undefined") {
      return;
    }
    const w = window as unknown as {
      __transcriptBuilds?: Record<string, number>;
    };
    w.__transcriptBuilds ??= {};
    const key = session.instanceId;
    w.__transcriptBuilds[key] = (w.__transcriptBuilds[key] ?? 0) + 1;
  };
  const built = $derived.by<Built>(() => {
    track(secondStep);
    track(fronted);
    // The switch flush paints what is already there; the catch-up comes
    // after the paint, through the hold letting go.
    if (risen !== builtRises) {
      builtRises = risen;
      if (primed && !held && untrack(() => printOf() !== builtPrint)) {
        hold();
      }
    }
    track(released);
    if (held) {
      return STILL_BUILD();
    }
    // A pane born off screen would otherwise hold an empty transcript until it
    // was first looked at, so the first build never consults the tier.
    if (!isFocused && primed) {
      // Read, not used: this is `built`'s reactive dependency on the unfocused
      // tier's own clock — its change is what re-runs this branch to re-check
      // the print, in place of the tracked reads `untrack` below hides.
      track(rebuildTick);
      return untrack(rebuild);
    }
    // The print is the whole of what a focused build depends on: the live
    // tail's fields and the store's revision of the rows (`session.rev`),
    // which moves whenever a row is placed, moved or takes the hub's word.
    // The fold itself reads every row of the conversation, and tracked, each
    // build of a long transcript registered (and the next one compared) a
    // dependency per field per row, on every streamed frame.
    printOf();
    return untrack(rebuild);
  });

  /**
   * What the build returns once the switch and the tier have had their say.
   *
   * Reading the print tracks exactly the handful of fields that mean "there
   * is something new to draw", so an unchanged session cannot invalidate
   * this at all — and a changed one still rebuilds on the very next frame.
   * It is read BEFORE the second step of a two-step change is handed over:
   * a build that returned the second step without it depended on the bump
   * alone, and nothing the session wrote after that rebuilt the rows. A
   * session that moved between the two steps drops the second one and is
   * built afresh from the first.
   */
  function rebuild(): Built {
    const caught = catchUp;
    catchUp = false;
    const current = printOf() === builtPrint;
    const next = pending;
    pending = null;
    if (next && current) {
      return {
        before: session.cursor !== null,
        rows: next.rows,
        settled: next.settled,
        shifted: frontOnly(frozen, next.rows),
        ended: null,
      };
    }
    if (primed && current) {
      return STILL_BUILD();
    }
    return run(caught);
  }

  /**
   * The switch itself: the build that meets the rising edge of `visible` or
   * `focused` holds the rows for this flush and schedules the catch-up behind
   * its paint. It is the build that decides, not an `$effect.pre` ahead of
   * it: in async mode Svelte runs a flush's dirty block effects (`{#if}`,
   * `{#each}`) as it walks the tree and every `$effect.pre` after the walk,
   * and those blocks read the rows. A pre-effect's hold came after the build
   * it was meant to stop — a tab's whole history folded and shifted in
   * front, and virtua's 4767px scroll correction written, inside the
   * release of the swipe that opened it.
   *
   * `catching` is state, and a build may not write state: it goes up in the
   * microtask behind this flush, before the paint.
   *
   * The delay is `requestAnimationFrame` THEN `setTimeout(0)`, not either
   * alone. A rAF callback runs at the top of the next frame, before that
   * frame paints, and Svelte flushes the state change it makes in a
   * microtask right behind it — still before the paint, which is exactly the
   * blocking this exists to avoid. `setTimeout(0)` alone is a macrotask the
   * browser may run within the same frame interval, ahead of its rendering
   * step. The pair pins the work to the far side of one real paint.
   *
   * Nothing is held when the print already matches: a pane whose rows are
   * current simply becomes visible, with no indicator to flash.
   */
  function hold(): void {
    held = true;
    queueMicrotask(() => {
      catching = true;
    });
    requestAnimationFrame(() => {
      setTimeout(() => {
        held = false;
        catchUp = true;
        released += 1;
      }, 0);
    });
  }
  /** The next build is the catch-up behind a switch's paint (`hold`): what it appends is folded in steps (`foldInSteps`). */
  let catchUp = false;

  function run(caught = false): Built {
    if (stepping) {
      if (stepping.list === session.messages) {
        return STILL_BUILD();
      }
      // The list moved on under the fold (another page in front, a read):
      // what it is now decides.
      stepping = null;
    }
    const steps = primed ? stepFold(session, memo, caught) : null;
    if (steps) {
      foldInSteps(steps);
      return STILL_BUILD();
    }
    countBuild();
    builtPrint = printOf();
    return build();
  }

  /**
   * A PAGE IN FRONT, AND A LONG CATCH-UP, ARE FOLDED A STEP A TASK, AND
   * HANDED OVER IN ONE.
   *
   * A page of older blocks put in front of a long conversation folded every
   * message in the task its page landed in (109–432ms of script on Safari,
   * a 188ms task on Chromium's trace: transcript-holds' wheel); a tab caught
   * up after a long absence folded all its session said meanwhile in the
   * task behind the switch's paint (`hold`: 64–77ms frames on Safari). So
   * the rows on screen stay as they are (`STILL_BUILD`), and the fold runs
   * `STEP_MS` a task, each step once a frame has painted (web.dev,
   * "Optimize long tasks"; `requestAnimationFrame` then `setTimeout`, the
   * yield every engine has: `scheduler.yield` is not in Safari, MDN
   * "Limited availability"). The build after the last step takes its memo,
   * draws the rows from it at once, and hands a page in front to virtua with
   * its `shift` in that one flush: rows added in front only, the one change
   * `shift` is for (inokawa/virtua#284).
   */
  let stepping: StepFold | null = null;
  /**
   * The rows mounted as a page in front is handed over, by key, kept
   * mounted while the buffer steps back up (`keepMounted`). Handed over
   * with virtua's buffer, the screen above the view filled at once with
   * rows it had never measured, at `ROW_ESTIMATE` each: 40 rows mounted in
   * the hand-over's task, 80ms of its 185 (transcript-holds' wheel).
   */
  let frontHeld = $state<string[]>([]);
  /** Bumped when a page in front is folded: the build's dependency on it. */
  let fronted = $state(0);
  /** How long a step of a stepped fold runs, ms: a quarter of a frame here, a frame on a CPU four times slower. Our own call. */
  const STEP_MS = 4;
  function foldInSteps(steps: StepFold): void {
    stepping = steps;
    let folded = false;
    const step = () =>
      requestAnimationFrame(() =>
        setTimeout(() => {
          if (stepping !== steps) {
            return;
          }
          // The hand-over in a task of its own: behind the last step, it
          // was that step and the drawing of the rows in one.
          if (!folded) {
            folded = steps.step(STEP_MS);
            step();
            return;
          }
          handOver(steps);
        })
      );
    step();
  }
  /** The stepped fold's rows, handed to the build (`fronted`). */
  function handOver(steps: StepFold): void {
    memo = steps.memo();
    stepping = null;
    if (steps.front) {
      // Handed over with nothing mounted past what is (`frontHeld`): the
      // screen above fills a step a task (`buffer`).
      frontHeld = [...onList()];
      buffer = 0;
    }
    // The page that ends the conversation's pages takes the strip before
    // the list with it (`Built.before`).
    const strip =
      steps.front && frozenBefore && session.cursor === null && !atBottom
        ? olderRoom
        : 0;
    fronted += 1;
    if (strip > 0 && scroller) {
      stripGone(scroller, strip);
    }
  }
  onDestroy(() => {
    stepping = null;
  });
  /**
   * THE STRIP GOES WITH THE PAGE THAT ENDS IT, AND MOVES NOTHING. Left to
   * its own observer (`keepPlace`), WebKit delivered its shrink a frame
   * after the rows came in under it (transcript-holds, webkit 390: the
   * row at the view's top painted 53.375px up for a frame). So the flush
   * that hands the page over is run now, and the view moved up by the
   * strip's height in the same task, behind virtua's own jump (whose write
   * laid the page out): the observer then hears nothing left to move.
   */
  function stripGone(node: HTMLElement, strip: number): void {
    flushSync();
    olderRoom = 0;
    node.scrollTop -= strip;
    lastWrite = node.scrollTop;
  }

  function build(): Built {
    const folded = buildRowsFrom(session, memo);
    const { rows: next } = folded;
    ({ memo } = folded);
    const settled = folded.memo.drawn.rows;
    ledger(folded);
    noteMoves(frozen, next, folded.ended, settled);
    // FRONT-CHANGE DETECTION for virtua's `shift` mode: an older history chunk
    // arriving puts new rows ABOVE everything on screen — without `shift`,
    // virtua keeps the scroll OFFSET and the content lurches toward the top
    // (the post-SSR "jumps to the top then back" flash). The read that
    // replaces the server's tail can also START later than it did, dropping
    // rows in front: virtua keeps its sizes by index, so without `shift` every
    // row on screen landed on an index with no size, hid, and reappeared
    // measured somewhere else (0.66 at 1440). Either is exact: the rows on
    // screen are the same, in the same order, to the end of the list.
    // Returned WITH the rows so the Virtualizer reads both in the same flush.
    //
    // Only once LANDED. Before the first landing there is no position to
    // keep — `land` teleports to the tail regardless — and asking for a shift
    // then is worse than useless: virtua has not attached its scroller yet
    // (that waits a tick after mount), so the anchoring jump stays pending
    // until the landing's own write has already put the scroller at its
    // maximum. Applied on top of that, the jump is clamped, fires no scroll
    // event, and virtua's range stays latched at empty until the reader
    // scrolls — a switched-to pane with a sized box and not one row in it.
    const landedNow = untrack(() => landed);
    const shifted = landedNow && frontOnly(frozen, next);
    // TWO STEPS. The read that replaces the server's tail with the live
    // session's can change both ends at once: rows dropped or added in
    // front, and the live row arriving at the end. virtua's `shift` moves
    // its sizes at ONE end per update, and with neither the rows on screen
    // lost their sizes, hid, and reappeared measured somewhere else (0.66
    // mid-turn at 1440). So the end goes first — the rows before it
    // untouched, their sizes where they were — and the front a microtask
    // later, as the shift it is. Both land before the paint.
    if (landedNow && !shifted) {
      const was = tailStart(frozen);
      const now = tailStart(next);
      // The same settled rows, or as many, is no change in front: asked
      // before copying either.
      if (
        settled !== frozenSettled &&
        was !== now &&
        frontOnly(frozen.slice(0, was), next.slice(0, now))
      ) {
        pending = { rows: next, settled };
        queueMicrotask(() => {
          secondStep += 1;
        });
        return {
          before: session.cursor !== null,
          rows: [...frozen.slice(0, was), ...next.slice(now)],
          // The last build's settled rows, still in front: a tail never
          // holds a settled row (rows.ts `tailRows`).
          settled: frozenSettled.length <= was ? frozenSettled : NO_ROWS,
          shifted: false,
          ended: folded.ended,
        };
      }
    }
    return {
      before: session.cursor !== null,
      rows: next,
      settled,
      shifted,
      ended: folded.ended,
    };
  }

  /**
   * A SEND MOVES; NOTHING JUMPS. A send that goes between the rows waiting at
   * the end and its place in the conversation — read, or failed out of the
   * wait — is the same row the whole way (one key, one element), so it
   * slides there, and every row it trades places with slides aside (FLIP,
   * transform only): each is measured where it is drawn before the update,
   * and once the update is in it starts from there and travels home.
   *
   * A failed send its retry replaced folds shut where it stood (see
   * `leaving`), and the rows after it close up behind it — but the update
   * that takes it out also regroups them: the agent's turn under it joins the
   * turn above and loses its speaker line, a row's height gone in one frame.
   * So that update slides them too, on the fold's own timing: the rows after
   * the fold start where they were drawn and ride it up as one.
   *
   * Each row slides from where it was drawn to where it is drawn now, by its
   * bottom edge: a speaker line comes and goes at a row's top, so the words
   * under it hold still. Where it is drawn now can still change: a row the
   * update resized (a speaker line gained, a turn settling taller) is placed
   * by virtua once it has measured it — in the same frame, or on WebKit, when
   * a measurement slips past the frame, in the next — and every row under it
   * moves then. That move is carried into the slides still running
   * (`carrySlides`), so a slide starts where the row was and ends where it is,
   * whenever the list finishes placing it.
   */
  interface Box {
    /** Its list item's layout top and height, in the list. */
    height: number;
    /** How far the row is drawn off that top: a slide still in flight. */
    shift: number;
    top: number;
  }
  /** The mounted rows as they stood before an update that moves a send. */
  let beforeMove: Map<string, Box> | null = null;
  /**
   * The rows that stand still above each change in that update: the last row
   * before a send moved, and a replaced send starting its fold. The slide
   * starts under the first of them.
   */
  let movedAfter = new Set<string>();
  /** The update folds a replaced send: its slides run on the fold's timing. */
  let foldMove = false;
  /** The name a slide's animation goes by, so a newer one can take it over. */
  const SLIDE = "send-slide";

  /** Every mounted row's box in the list, by key. */
  function measure(): Map<string, Box> {
    const boxes = new Map<string, Box>();
    if (!listing) {
      return boxes;
    }
    const origin = listing.getBoundingClientRect().top;
    for (const node of listing.querySelectorAll<HTMLElement>("[data-row]")) {
      const item = node.parentElement;
      if (item && node.dataset.row) {
        const box = item.getBoundingClientRect();
        boxes.set(node.dataset.row, {
          top: box.top - origin,
          height: box.height,
          shift: node.getBoundingClientRect().top - box.top - node.offsetTop,
        });
      }
    }
    return boxes;
  }

  /**
   * A live row that settled in that update, by the key of the row it became:
   * the same object on screen, so it moves from where the live row was drawn.
   */
  let settledFrom = new Map<string, string>();

  /**
   * Whether this build moves a row that was already in the list — a send
   * between the wait and its place, a turn settling above a send still
   * waiting, anything put in before a row rather than after it — and if so,
   * every mounted row is measured where it stands. A build that only adds
   * rows at the end, or changes rows in place, moves nothing and measures
   * nothing.
   */
  function noteMoves(
    prior: Row[],
    next: Row[],
    ended: Fold["ended"],
    settled: Row[]
  ): void {
    if (!untrack(() => landed && watched && motionOk.current)) {
      return;
    }
    // Both begin with the same settled rows: those are in their places.
    let from = settled === frozenSettled ? settled.length : 0;
    while (
      from < prior.length &&
      from < next.length &&
      prior[from].key === next[from].key
    ) {
      from += 1;
    }
    // Every row the last build drew is in its place, or every row it draws
    // now is: what follows is new or gone, and nothing moved. A streamed
    // word ends here, without a map of every row's place built for it.
    if (from === prior.length || from === next.length) {
      return;
    }
    const was = new Map(prior.map((row, index) => [row.key, index]));
    const moved = next
      .slice(from)
      .some((row, i) => (was.get(row.key) ?? from + i) !== from + i);
    // A change from the very first row is a different transcript, not a move.
    if (!moved || from === 0) {
      return;
    }
    beforeMove ??= measure();
    movedAfter.add(next[from - 1].key);
    if (ended?.into) {
      settledFrom.set(ended.into, ended.key);
    }
  }

  /**
   * A row starting its fold: the rows after it are measured where they
   * stand, before the update that regroups them is drawn.
   */
  function noteFold(key: string): void {
    if (!untrack(() => landed && watched && motionOk.current)) {
      return;
    }
    beforeMove ??= measure();
    movedAfter.add(key);
    foldMove = true;
  }

  /**
   * Every row under the change that was on screen before it, sliding from
   * where it was drawn. A row new to the list arrives by its own entrance; a
   * live row that settled moves from where the live row was; a row that was
   * not on screen before is not seen to move.
   */
  function slideMoves(): void {
    const boxes = beforeMove;
    const after = movedAfter;
    const settled = settledFrom;
    const timing = foldMove
      ? { duration: dur("--dur-panel"), easing: ease("--ease-out") }
      : { duration: dur("--dur-panel"), easing: ease("--ease-in-out") };
    beforeMove = null;
    movedAfter = new Set();
    settledFrom = new Map();
    foldMove = false;
    const drawn = renderedRows;
    const start = drawn.findIndex((row) => after.has(row.key));
    if (!(boxes && listing) || start < 0) {
      return;
    }
    const origin = listing.getBoundingClientRect().top;
    // A row put in above that opens its own place from nothing (its arrival,
    // Row's `arrive`) moves every row under it as it opens: they slide by
    // whatever else moved them, never by its place too. Slid by it as well,
    // a send put in above the turn's indicator sent the indicator up over the
    // message before it for the frames the opening took to be measured. Its
    // place is the room virtua gave it — the next item's top less its own,
    // its size estimated until it is measured — not the row's own height.
    let opening = 0;
    let arrivedAt: number | null = null;
    for (const row of drawn.slice(start + 1)) {
      const box = boxes.get(settled.get(row.key) ?? row.key);
      const node = listing.querySelector<HTMLElement>(
        `[data-row="${CSS.escape(row.key)}"]`
      );
      const item = node?.parentElement;
      if (!(node && item)) {
        continue;
      }
      const now = item.getBoundingClientRect();
      if (arrivedAt !== null) {
        opening += now.top - arrivedAt;
        arrivedAt = null;
      }
      if (box) {
        slide(
          node,
          box,
          now.top - origin - opening,
          now.height,
          timing,
          opening > 0
        );
      } else if (
        tickets.get(row.key)?.kind === "arrive" &&
        !presentation.handed.has(row.key)
      ) {
        arrivedAt = now.top;
      }
    }
  }

  /**
   * Where each sliding row's list item stood, in the list, when its slide
   * last took its place: what a later placing of the row is measured from.
   * With it, the row that was first in the list then (`first`) and where
   * virtua had it (`front`): rows virtua puts in front since move every row
   * down the list by their height, and its own `shift` scroll moves the view
   * with them, so nothing moves on screen. Counted as a move, a page landing
   * in front carried a sliding row up over the rows above it by the page's
   * height (165px, the turn's indicator over a quick call's row, for the
   * rest of its slide).
   */
  const slidFrom = new WeakMap<
    HTMLElement,
    { first: string; front: number; top: number }
  >();

  /** Where virtua has the row `key` in the list, by its sizes; null when it is not in the list. */
  function offsetOf(key: string): number | null {
    const index = renderedRows.findIndex((row) => row.key === key);
    return index < 0 || !list ? null : list.getItemOffset(index);
  }

  /**
   * How many slide animations are running. The list is re-placed on every
   * row it measures — each row a scroll mounts — and with nothing sliding
   * there is nothing to carry: `carrySlides` reads no layout then.
   */
  let sliding = 0;

  /** A slide on `node`, counted for as long as it runs. */
  function startSlide(
    node: HTMLElement,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions
  ): void {
    sliding += 1;
    const settled = () => {
      sliding -= 1;
    };
    node
      .animate(keyframes, { id: SLIDE, ...options })
      .finished.then(settled, settled);
  }

  /**
   * One row sliding from `box`, where it was drawn, to its item's place now
   * (`top`, drawn `height` tall), by its bottom edge — or by its top edge
   * (`byTop`), for a row an arrival above is pushing down: its top is what
   * moves, and a change of its own height belongs below it. Slid by the
   * bottom edge, the turn's indicator grew 5px at its top as a send arrived
   * above it and stood that far over the send for a frame.
   */
  function slide(
    node: HTMLElement,
    box: Box,
    top: number,
    height: number,
    timing: KeyframeAnimationOptions,
    byTop = false
  ): void {
    const delta = byTop
      ? box.top + box.shift - top
      : box.top + box.shift + box.height - (top + height);
    if (Math.abs(delta) <= 0.5) {
      return;
    }
    const first = renderedRows[0]?.key;
    if (first !== undefined) {
      slidFrom.set(node, { first, front: offsetOf(first) ?? 0, top });
    }
    // A row that gained a speaker line starts with it above where the row
    // began — over the row above. It is cut off there and opens as the row
    // travels. The sides and bottom stay open as far as a well bleeds past
    // its box (motion/rows `BLEED`): the row slides on a layer as large as
    // its clip.
    const gained = byTop
      ? 0
      : Math.max(0, height - box.height - node.offsetTop);
    const open = `${-BLEED}px`;
    for (const running of node.getAnimations()) {
      if (running.id === SLIDE) {
        running.cancel();
      }
    }
    // The cut is a slide of its own on the travel's timing: an effect that
    // cuts and moves dies with its renderer once carrySlides' move displaces
    // it (house/no-clip-with-move).
    startSlide(
      node,
      [{ translate: `0 ${delta}px` }, { translate: "0 0" }],
      timing
    );
    startSlide(
      node,
      [
        { clipPath: `inset(${gained}px ${open} ${open})` },
        { clipPath: `inset(0px ${open} ${open})` },
      ],
      timing
    );
  }

  /**
   * The transcript moved its rows under a slide: virtua placed them again
   * (it measured some), or the pin scrolled the list by `scrolled`; rows
   * put in front since (`slidFrom`'s `front`) moved nothing on screen. A slide
   * is a path on the screen like a flight, so every row still sliding whose
   * place on screen moved is put back where it was drawn and taken to its new
   * place over the rest of its slide, on the slide's own curve. The reader's
   * own scrolling is not carried: it moves the list, slides and all.
   */
  function carrySlides(scrolled: number): void {
    if (sliding === 0 || !listing) {
      return;
    }
    const origin = listing.getBoundingClientRect().top;
    for (const node of listing.querySelectorAll<HTMLElement>("[data-row]")) {
      const was = slidFrom.get(node);
      const item = node.parentElement;
      const slides = node
        .getAnimations()
        .filter((each) => each.id === SLIDE && each.playState === "running");
      if (was === undefined || !item || slides.length === 0) {
        slidFrom.delete(node);
        continue;
      }
      const top = item.getBoundingClientRect().top - origin;
      const front = offsetOf(was.first) ?? was.front;
      const moved = top - was.top - (front - was.front) - scrolled;
      if (Math.abs(moved) <= 0.5) {
        continue;
      }
      slidFrom.set(node, { first: was.first, front, top });
      const timing = slides[0].effect?.getComputedTiming();
      const remaining = Math.max(
        ...slides.map(
          (each) =>
            Number(each.effect?.getComputedTiming().duration) -
            Number(each.currentTime)
        )
      );
      startSlide(node, [{ translate: `0 ${-moved}px` }, { translate: "0 0" }], {
        duration: remaining,
        easing: timing?.easing,
        composite: "add",
      });
    }
  }

  /** Where a build's own tail — the live row, the tool in flight, the queue — begins. */
  function tailStart(sequence: Row[]): number {
    let start = sequence.length;
    while (start > 0 && LIVE_KINDS.has(sequence[start - 1].kind)) {
      start -= 1;
    }
    return start;
  }

  /**
   * Whether `next` differs from `prior` only in front: rows added before the
   * first one that survives, or dropped before it, and from that row on the
   * same rows in the same order to the end of both.
   */
  function frontOnly(prior: Row[], next: Row[]): boolean {
    if (
      prior.length === 0 ||
      next.length === prior.length ||
      next.at(-1)?.key !== prior.at(-1)?.key
    ) {
      return false;
    }
    const index = new Map(next.map((row, i) => [row.key, i]));
    const from = prior.findIndex((row) => index.has(row.key));
    if (from < 0) {
      return false;
    }
    const to = index.get(prior[from].key) as number;

    return (
      next.length - to === prior.length - from &&
      prior.slice(from).every((row, i) => next[to + i].key === row.key)
    );
  }

  /**
   * Take a turn in the rotation while unfocused — the visible tier beside the
   * pane being read, the slow tier when hidden behind it — and give it back
   * on focus. The fingerprint is every cheap O(1) reading that means "there
   * is something new to draw" — deliberately not a deep comparison, because
   * the point is to skip the expensive build, not to do an expensive check
   * first.
   */
  $effect(() => {
    if (isFocused) {
      return;
    }
    return rebuildScheduler.join(
      session.instanceId,
      printOf,
      () => {
        rebuildTick += 1;
      },
      visible ? "visible" : "hidden"
    );
  });

  // Side effects that the derived CANNOT carry (Svelte forbids writes inside
  // $derived). An $effect runs after the derived is read but before the DOM
  // renders, so the bookkeeping stays in sync with what the Virtualizer sees.
  $effect(() => {
    const { rows: next, settled, before } = built;
    frozen = next;
    frozenSettled = settled;
    frozenBefore = before;
    primed = true;
    // The append has landed: the rows on screen are the session's again, and
    // the indicator under them has nothing left to wait for.
    if (!(held || stepping) && untrack(() => catching)) {
      catching = false;
    }
    // The update is in: what it moved starts where it was drawn.
    if (beforeMove) {
      untrack(slideMoves);
    }
  });
  const rows = $derived(built.rows);
  /**
   * While the session is stopped at its account's limit, its newest account
   * line is that stop, drawn as an error with its way out
   * (switch.svelte.ts `stopWords`); every older one stays history.
   */
  const stop = $derived.by(() => {
    const instance = cawco.instanceIndex.byId.get(session.instanceId);
    const words = instance ? stopWords(instance) : undefined;
    const key = words
      ? rows.findLast((one) => one.kind === "account")?.key
      : undefined;
    return words && key ? { key, words } : undefined;
  });
  const cache = untrack(() => {
    // A pane with no saved sizes and no rows has `undefined` on both sides of
    // the first-row match, so the saved entry is checked on its own first.
    const saved = sizes.get(session.instanceId);
    return saved !== undefined &&
      built.rows.length > 0 &&
      saved.first === placeOf(built.rows[0]) &&
      built.rows.length >= saved.count
      ? saved.cache
      : undefined;
  });
  /**
   * The place this pane returns to, until a landing has used it. A place at
   * a row the rows do not hold yet — a reload, whose first rows are the
   * newest page — is read back to, a page at a time (see the reveal).
   */
  let resume: Landing | null = readJson<Landing | null>(
    LANDING + untrack(() => session.instanceId),
    null,
    "session"
  );
  /** This transcript lands at its tail: the place it returns to, if any, is the tail, and no record is sought (`seek`). */
  let standsAtTail = $state(resume === null || resume.tail);
  /**
   * virtua's size for a row it has not measured yet — and a transcript's
   * newest row is always one it has not measured. The smallest row there is:
   * one tool line and its gap. Guessing high put phantom height at the tail
   * (320px for a 40px indicator) that the follow chased and virtua then took
   * back, with a jump that froze its range and dropped the very row that was
   * arriving. Guessing low, a new row can only grow once it is measured —
   * which the follow rides — and it sits inside virtua's render buffer from
   * its first frame. Leaving the size to virtua is worse still: until it has
   * measured a viewport's worth it renders no buffer at all.
   */
  const ROW_ESTIMATE = 21;
  /**
   * The foot's height (the markup's `foot`): the composer's standing box
   * cleared, and the run its pane's foot fade covers (`--foot-fade-run`,
   * FootFade `footFadeRun`), so the last row ends above the fade; the old
   * fixed reserve its floor.
   */
  const FOOT_ROOM =
    "max(calc(var(--space-8) * 3), var(--composer-clearance, 0px), var(--foot-fade-run, 0px))";
  /** What every list item carries: the name its drawn rule finds it by (the style's `[data-item]`). */
  const ITEM_ATTRS = { "data-item": "" };
  /**
   * A row a warming pane holds is skipped while it stages (`skipping`, set
   * by `parkRows`), and a row the view did not show as the pane was put away
   * until it is styled again (`aside`): its content is not styled, and its
   * box keeps the size virtua already has for it, so virtua's observer reads
   * that same size and nothing moves.
   */
  const itemAttrs = ({ item }: { item: Row }) => {
    const px = skipped.get(item.key) ?? aside.get(item.key);
    return px === undefined
      ? ITEM_ATTRS
      : {
          "data-item": "",
          style: {
            "content-visibility": "hidden",
            "contain-intrinsic-block-size": `${px}px`,
          },
        };
  };

  /**
   * ROWS LEAVE WHERE THEY STAND; THEY DO NOT VANISH.
   *
   * The live tail's rows — the turn's indicator, a tool's glance, a queued
   * message — go the moment the session says so, and a failed send goes as
   * its retry replaces it; virtua drops a missing key at once, and the list
   * would lose that height in one frame. So a row that goes WITHOUT becoming
   * something else in the list is kept where it stood while it folds shut
   * (`Row`'s `leaving`), the rows under it closing up over the fold, and the
   * end of its own fold is what takes it out, at no height by then. virtua
   * keeps its sizes by index, so a row taken out of the middle hands its
   * size to the row after it until that one is measured again. A live row
   * that settled is not leaving: the row it became is already on screen, in
   * its place.
   */
  const TAIL_KINDS = new Set<Row["kind"]>(["live", "livetool", "queued"]);
  /**
   * A row that can leave the list, as it was last drawn, with where it stood:
   * the keys of the rows above it, nearest first, back to the first one that
   * cannot leave — or none, when it was the first row.
   */
  interface Standing {
    above: string[];
    row: Row;
  }
  /** The live tail's rows and the failed sends, as last drawn. */
  let standing = new Map<string, Standing>();
  /** Rows folding shut where they stood. */
  let leaving: Standing[] = [];
  let leftTick = $state(0);
  /** The keys the list drew last: a row not among them is new. */
  let drawnKeys: Keys = new Set<string>();
  /**
   * The row that takes a leaving row's place: whether it takes the place in
   * on top of its own (`absorbs`), and whether it is a different row from
   * the one that left (`replaces`), which then fades over the place as the
   * taker opens.
   */
  interface Taker {
    absorbs: boolean;
    key: string;
    replaces: boolean;
  }

  /**
   * Whether `row` can leave the list: a tail row, a failed send its retry
   * replaces, or a compaction still running, which goes when it turns out
   * never to have happened (skipped, or stopped: rows.ts `outcome`).
   */
  const canLeave = (row: Row): boolean =>
    TAIL_KINDS.has(row.kind) ||
    (row.kind === "single" && row.message.state === "failed") ||
    (row.kind === "compaction" && row.state === "compacting");

  /**
   * Whether the row `key` has left the list, rather than become something
   * else in it: a live row that became its settled row, or a tool's glance
   * whose call has landed, is already on screen in its new form, and a
   * queued message the session read is still in the list under its key.
   */
  function hasLeft(key: string, row: Row, ended: Fold["ended"]): boolean {
    if (row.kind === "single") {
      return untrack(() => session.records[key]?.state === "replaced");
    }

    return !(
      (ended?.key === key && ended.into !== null) ||
      (row.kind === "livetool" &&
        untrack(() => called(session, row.glance.toolId)))
    );
  }

  /** The build the rows were last drawn from (`presentation`). */
  let drawnFrom: Built | null = null;
  // What it reads of the rows' messages (a send's state, a call's id) is the
  // build's to depend on (`session.rev`): untracked, it is invalidated by a
  // new build and a fold ending alone, not by every row it reads.
  //
  // `shifted` is virtua's `shift` for this drawing: the build's own word on
  // the change it made, said once, in the drawing that build makes. virtua
  // keeps its sizes by index and reads `shift` whenever the list's length
  // changes. Held on for as long as the build stood, a fold that ended after
  // a page landed in front took its row out with `shift` still set: virtua
  // dropped the FIRST size, every row above the fold was left holding the
  // size of the row under it, and none of them was measured again (their
  // indexes had not moved), so the turn's rows stood over one another until
  // a reload (the owner's "good morning", nightly 0.1.12-nightly.5855).
  const presentation = $derived.by(() => {
    track(leftTick);
    const from = built;
    const shifted = from.shifted && from !== drawnFrom;
    drawnFrom = from;
    const { rows: next, ended, settled } = from;
    return untrack(() => ({ ...withLeaving(next, settled, ended), shifted }));
  });

  /**
   * The rows as drawn: `next`, with the rows folding shut where they stood,
   * and the settled rows they still begin with — none, when a row folding
   * shut stands among those.
   */
  function withLeaving(next: Row[], settled: Row[], ended: Fold["ended"]) {
    const present = keysIn(next, settled);
    const folding = new Set(leaving.map(({ row }) => row.key));
    const handed = new Map<string, Handoff>();
    // Only a row on screen folds or hands its place on: one outside virtua's
    // range, or one no frame has laid out yet (`drawnHeights`), has nothing
    // to fold, and nobody to see it go.
    for (const [key, stood] of standing) {
      if (present.has(key) || folding.has(key)) {
        continue;
      }
      const node = drawnRow(key);
      const height = node ? drawnHeights.get(node) : undefined;
      if (
        !node ||
        height === undefined ||
        handOn(node, height, takerOf(key, stood, next, ended), handed)
      ) {
        continue;
      }
      if (hasLeft(key, stood.row, ended)) {
        leaving.push(stood);
        noteFold(key);
      }
    }
    leaving = leaving.filter(({ row }) => !present.has(row.key));
    // The rows themselves, when nothing folds: a streamed word copies none.
    const drawn = leaving.length > 0 ? [...next] : next;
    // Where the first row put back in stands: one among the settled rows
    // means the list no longer begins with them.
    let first = drawn.length;
    // Each goes back in where it stood. One that stood under another row on
    // its way out goes in once that one is in; one whose place is not in the
    // list any more — the rows around it read again from history — was not
    // seen to go, and is let go with them.
    let unplaced = leaving;
    let placed = true;
    while (unplaced.length > 0 && placed) {
      placed = false;
      unplaced = unplaced.filter(({ above, row }) => {
        const at = placeIn(drawn, above, ended);
        if (at < 0) {
          return true;
        }
        drawn.splice(at, 0, row);
        first = Math.min(first, at);
        placed = true;
        return false;
      });
    }
    const lost = new Set(unplaced.map(({ row }) => row.key));
    leaving = leaving.filter(({ row }) => !lost.has(row.key));
    const begins = first >= settled.length ? settled : NO_ROWS;
    standing = standingIn(drawn, begins, present);
    drawnKeys = keysIn(drawn, begins);
    return {
      rows: drawn,
      settled: begins,
      leaving: new Set(leaving.map(({ row }) => row.key)),
      handed,
    };
  }

  /**
   * The row drawn as `node`, `height` tall as the last frame laid it out,
   * hands its place to `taker`: the height the taker starts from — the
   * place's, or the place's on top of its own when it absorbs it. A row
   * that becomes another is drawn at the place's height whether or not it
   * moves; a run taking a call in is drawn at its own new height at once
   * when nothing moves, or when no frame has laid it out yet, and is handed
   * nothing. False when nothing takes the place.
   */
  function handOn(
    node: HTMLElement,
    height: number,
    taker: Taker | null,
    handed: Map<string, Handoff>
  ): boolean {
    if (!taker) {
      return false;
    }
    const ghost = taker.replaces ? ghostOf(node) : null;
    if (!taker.absorbs) {
      handed.set(taker.key, { from: height, ghost, taken: false });
      return true;
    }
    const holder = drawnRow(taker.key);
    const own = holder ? drawnHeights.get(holder) : undefined;
    if (
      own !== undefined &&
      untrack(() => landed && watched && motionOk.current)
    ) {
      // The run's place grows out of the one it took over, under it: the
      // ghost stands where the row stood, below the run's own lines.
      if (ghost) {
        ghost.style.transform = `translateY(${own}px)`;
      }
      handed.set(taker.key, { from: own + height, ghost, taken: false });
    }
    return true;
  }

  /**
   * The row drawn as `node`, copied as it is on screen, to stand over its
   * place while it fades (`Row`'s handoff): inert, unheard, and carrying none
   * of the hooks the list and the flights find rows by.
   */
  function ghostOf(node: HTMLElement): HTMLElement {
    const copy = node.cloneNode(true) as HTMLElement;
    copy.removeAttribute("data-row");
    copy.inert = true;
    copy.setAttribute("aria-hidden", "true");
    for (const hooked of copy.querySelectorAll(
      "[data-row], [data-share], [data-message], [aria-live]"
    )) {
      hooked.removeAttribute("data-row");
      hooked.removeAttribute("data-share");
      hooked.removeAttribute("data-message");
      hooked.removeAttribute("aria-live");
    }
    return copy;
  }

  /** The row `key` as it is drawn now, before the update lands. */
  const drawnRow = (key: string): HTMLElement | null | undefined =>
    listing?.querySelector<HTMLElement>(`[data-row="${CSS.escape(key)}"]`);

  /**
   * Each row of the list's height as the last frame laid it out: its border
   * box, from the reports of one size observer on every row, read inside the
   * delivery on the layout that frame has just done (frame-observer's
   * shared delivery, as LiveRow's `drawnHeight`). What a row handing its
   * place on hands on (`handOn`), read off the record in the update that
   * changes the rows. Read off the rows there instead, their boxes laid the
   * page out again after that update's own writes (a reply's frame, forced
   * after a Svelte style write: be88156f). A row with none has never been
   * laid out, and has nothing on screen to hand on.
   */
  const drawnHeights = new WeakMap<Element, number>();
  /** The rows' size observer, made by the first row the list mounts (none on the server). */
  let rowSizes: FrameObserver | null = null;
  /**
   * The rows' size observer, made here and not in a row's attachment: made
   * there, its reader closed over that row, and held the first row the list
   * mounted for as long as the list lived (tab-return's detached leg).
   */
  function rowSizesOf(): FrameObserver {
    rowSizes ??= frameObserver(null, {
      read: (entries) => {
        for (const entry of entries) {
          const height = entry.borderBoxSize[0]?.blockSize;
          if (height !== undefined) {
            drawnHeights.set(entry.target, height);
          }
        }
      },
    });
    return rowSizes;
  }
  /** A row of the list, heard as each frame lays it out (`drawnHeights`). */
  const measureRow: Attachment<HTMLElement> = (node) => {
    const sizes = rowSizesOf();
    sizes.observe(node, { box: "border-box" });
    return () => {
      sizes.unobserve(node);
      drawnHeights.delete(node);
    };
  };
  onDestroy(() => rowSizes?.disconnect());
  /** A row's height as the last frame laid it out (`drawnHeights`): what its fold starts from (Row's `heightOf`). */
  const heightOfRow = (row: HTMLElement): number | undefined =>
    drawnHeights.get(row);

  /**
   * A TAIL ROW HANDS ITS PLACE TO THE ROW THAT TAKES IT.
   *
   * The tail's rows change hands in one update: the live row settles into
   * the row it became, a tool's glance lands as its call in a run, the turn's
   * indicator gives way to the tool it announced. Each was drawn as one row
   * going and another arriving at its own height, on no shared clock — the
   * settled row cut the live row's height tween short, the run came in at
   * virtua's estimate, WebKit drew the tool's opening at nothing under a fold
   * already running — and every row above jumped. So the row that takes the
   * place starts at the height it took over and tweens to its own (`Row`'s
   * handoff), and the list lays it out at that height before it has
   * measured it (`handOn`).
   *
   * The taker of the row `key` that is no longer in the list, or null: the
   * row its live content settled into, the run its call landed in — which
   * takes the glance's height in on top of its own when it was already drawn
   * (`absorbs`) — or the new row standing where it stood. The turn's live
   * row and a glance give their place to whatever the turn did next, in the
   * same frame: a new row where they stood, or the run just above them that
   * took the new call in. Waiting on their fold before the next row opened
   * left the place empty between the two, and the tail dipped and jumped.
   * A queued message gives its place only to another tail row.
   */
  function takerOf(
    key: string,
    stood: Standing,
    next: Row[],
    ended: Fold["ended"]
  ): Taker | null {
    if (ended?.key === key && ended.into) {
      return { key: ended.into, absorbs: false, replaces: false };
    }
    const { row } = stood;
    if (row.kind === "livetool") {
      // From the end: the call has just landed, in the newest runs.
      const holder = next.findLast(
        (r) =>
          r.kind === "tools" &&
          r.messages.some(
            (m) => (m.metadata?.toolId ?? m.toolCallId) === row.glance.toolId
          )
      );
      if (holder) {
        return {
          key: holder.key,
          absorbs: drawnKeys.has(holder.key),
          replaces: false,
        };
      }
    }
    if (!(TAIL_KINDS.has(row.kind) && hasLeft(key, row, ended))) {
      return null;
    }
    const at = placeIn(next, stood.above, ended);
    const heir = next[at];
    const turns = row.kind !== "queued";
    if (
      heir &&
      !drawnKeys.has(heir.key) &&
      (turns || TAIL_KINDS.has(heir.kind))
    ) {
      return { key: heir.key, absorbs: false, replaces: true };
    }
    const runAbove = next[at - 1];
    if (
      turns &&
      runAbove?.kind === "tools" &&
      drawnKeys.has(runAbove.key) &&
      runAbove.messages.some((m) => tickets.get(callId(m))?.kind === "arrive")
    ) {
      return { key: runAbove.key, absorbs: true, replaces: true };
    }
    return null;
  }

  /**
   * The rows of the list (`present`) that can leave, each with the rows drawn
   * above it — a row already folding among them. A folding row is not one of
   * them: it has left, and counted again it would be taken out again, and
   * fold again, every time its fold ended.
   */
  function standingIn(
    drawn: Row[],
    settled: Row[],
    present: Keys
  ): Map<string, Standing> {
    const stood = new Map<string, Standing>();
    const stand = (index: number) => {
      const row = drawn[index];
      if (!(present.has(row.key) && canLeave(row))) {
        return;
      }
      const above: string[] = [];
      for (let i = index - 1; i >= 0; i -= 1) {
        above.push(drawn[i].key);
        if (!canLeave(drawn[i])) {
          break;
        }
      }
      stood.set(row.key, { above, row });
    };
    // Among the settled rows, the few that can leave were found once.
    for (const index of leavableIn(settled)) {
      stand(index);
    }
    for (let index = settled.length; index < drawn.length; index += 1) {
      stand(index);
    }
    return stood;
  }

  /**
   * Where a row that stood under `above` goes back in among `drawn`: under
   * the nearest of those rows still drawn — a live row that settled stands
   * as the row it became — first when it stood first, or -1 while none is.
   */
  function placeIn(
    drawn: Row[],
    above: string[],
    ended: Fold["ended"]
  ): number {
    if (above.length === 0) {
      return 0;
    }
    for (const key of above) {
      const as = key === ended?.key && ended.into ? ended.into : key;
      // From the end: the rows a row stood under are the tail's, nearly always.
      const index = drawn.findLastIndex((row) => row.key === as);
      if (index >= 0) {
        return index + 1;
      }
    }
    return -1;
  }
  const renderedRows = $derived(presentation.rows);
  /**
   * THE SERVER'S FIRST SCREEN IS PAINTED, AND STAYS UNTIL THE LIST TAKES IT.
   *
   * A cold load's rows are the page the server read (`firstScreen`), and the
   * server draws them, standing on the transcript's foot as the landed list
   * stands, in a box over the list's own (the markup's `first-screen`): the
   * newest rows are on screen from the HTML's first paint, before any script
   * has run. The list mounts under them unpainted, lands and measures (the
   * reveal), and is drawn in the frame they go: the same rows, in the same
   * columns, on the same foot, so the frame that swaps them moves nothing.
   * The list itself serves nothing (no `ssrCount`): two copies of every row
   * in the HTML, one of them never painted, were what a long session's cold
   * load weighed and hydrated.
   *
   * Only a landing at the tail is stood in for: a transcript returning to the
   * reader's place far up, or opened at a record, lands elsewhere, and the
   * pane's placeholder stands over it instead (`onshown`).
   */
  const servedRows = $derived(
    firstScreen && standsAtTail && !shown && renderedRows.length > 0
  );
  /**
   * The reader's rows whose well runs on into the next. A row folding away is
   * already out of its run: the rows either side close or join over its fold.
   */
  const runsOn = $derived.by((): Keys => {
    const drawn = renderedRows;
    const { leaving: gone, settled } = presentation;
    return untrack(() => {
      // No row folding away stands among the settled rows (`withLeaving`).
      const before = settledRuns(settled);
      const after = wellRunsFrom(
        drawn.slice(settled.length),
        (key) => gone.has(key),
        before.above
      ).runs;
      return { has: (key) => before.runs.has(key) || after.has(key) };
    });
  });
  const settledRuns = perSettled((settled) =>
    wellRunsFrom(settled, () => false, null)
  );

  /**
   * THE TAIL STAYS MOUNTED.
   *
   * The tail is where everything moves: rows arriving, the live row changing
   * phase, a reasoning block folding shut, a row leaving. virtua mounts only
   * what its range covers, and while those rows change size its range can
   * drop the newest of them for a frame and pick it up again — from inside
   * its own ResizeObserver callback, where observing a new element is exactly
   * the "ResizeObserver loop completed with undelivered notifications" the
   * page kept raising, and where a row that was mid-arrival lost it. The last
   * few rows are kept mounted instead, whatever the range says.
   */
  const TAIL_MOUNTED = 8;
  /** A far landing: virtua mounts what is on screen alone (`landFar`). */
  let narrow = $state(false);
  /**
   * PUT AWAY, NOTHING MOUNTED IS LET GO; WHAT THE VIEW DOES NOT SHOW IS SKIPPED.
   *
   * A pane put away is skipped (PaneLeaf `.pane-hidden`, `content-visibility:
   * hidden`): the engine lays none of it out, and a row the list took down
   * there stayed held by the list's last layout, its boxes and its text, until
   * the pane was shown again. Stepping virtua's buffer down to the view as the
   * pane was put away took the rows around it down so: the busy list went
   * from 35 mounted rows to 17, and Chromium held every one (31 rows, 350 text
   * nodes, after 30 switches: tab-return's detached leg). So while a pane is
   * away (`unseen`) every row mounted as it was put away stays mounted
   * (`away`, in `keepMounted`), until it is shown or a far landing lets them
   * go a step a task (`landFar`). Its range is the view alone meanwhile
   * (`buffer`) and its tail takes no new rows, so a row its session sends
   * waits unmounted, as before; shown again, the rows it kept are its buffer
   * again in the flush that stops keeping them, and none is mounted or let go.
   *
   * The switch that shows a warm pane restyles every element it holds, the
   * inherited `visibility` coming back on each (2,366 elements, 26.7ms, for a
   * view and a screen above and below it). So the rows the view does not
   * show are skipped as the pane is put away (`aside`, in `itemAttrs`: their
   * content unstyled, their boxes at virtua's size for them), and the switch
   * styles the view's rows alone. Once the shown pane's first frame has
   * painted they are styled `STAGE_ROWS` a task, nearest the view first
   * (web.dev, "Optimize long tasks"), where virtua's buffer stepping back up
   * mounted each of them again; a scroll before then styles the ones it
   * brings into the view at once (`onListScroll`). What is on screen never
   * moves: a skipped row's box keeps the size virtua has for it.
   */
  let unseen = $state(untrack(() => !visible));
  /** The rows mounted as the pane was put away, by key: kept mounted while it is away (`keepMounted`). */
  let away = $state.raw<ReadonlySet<string>>(new Set());
  /** virtua's buffer as the pane was put away: what the rows it kept span (`away`). */
  let keptBuffer = 0;
  /** The rows skipped since the pane was put away, each at virtua's size for it, px, nearest the view first (`itemAttrs`). */
  let aside = $state.raw<ReadonlyMap<string, number>>(new Map());
  /**
   * How long each mounted row's text was as the pane was put away, by key:
   * what virtua last measured (`parkRows`). Read off the page's text, never
   * its layout.
   */
  let putAway = new Map<string, number>();
  /** Whether the pane was seen at the last look: one put away keeps what it has mounted (`away`). */
  let wasSeen = untrack(() => visible);
  $effect(() => {
    const now = visible;
    const goneAway = wasSeen && !now;
    wasSeen = now;
    let task: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      task = setTimeout(() => {
        unseen = !now;
        if (now) {
          return;
        }
        putAway = textOfRows();
        // Laid out again meanwhile (`wasWarm`), it lets go freely until it is skipped again.
        if (goneAway && !wasWarm) {
          away = onList();
          aside = rowsAside();
          keptBuffer = buffer;
        }
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(task);
    };
  });
  /**
   * How far either side of the view virtua mounts rows (its `bufferSize`):
   * none at once for a far landing (`narrow`), and otherwise stepped up an
   * eighth of a screen (`viewHeight`) a task, each step once a frame has
   * painted, to `BUFFER_SCREENS` of one. In one task, the screens either
   * side of a pane just shown mounted together, 1,189 elements and 23ms of
   * style in one 46ms task 73ms after the switch; a quarter a step, the
   * frame after each step still styled 626 of them (a 36ms frame,
   * two-pane-perf's one pane point switch). None while the pane is away
   * (`unseen`), whose rows are kept by `away`; shown again, as much as they
   * span, at once (`keptBuffer`).
   */
  const BUFFER_STEPS = 8;
  /**
   * How many screens either side virtua mounts when the pane is seen: half
   * of one. virtua's own word for it: "A smaller value gives better
   * performance, and a larger value avoids showing blank items in fast
   * scrolling" (its `bufferSize`, 0.53.4). A whole screen mounted a screen
   * of rows above the view each time a wheel came to rest (virtua lets go
   * of the buffer behind a scroll while it runs, and takes it back at rest:
   * 612 elements styled in one frame as a page landed under a still
   * reader), and as much again as a wheel began. Half a screen still
   * measures a row well before a wheel's notch (120px) brings it into view.
   */
  const BUFFER_SCREENS = 0.5;
  let buffer = $state(0);
  $effect(() => {
    const full = viewHeight * BUFFER_SCREENS;
    track(fronted);
    if (narrow || unseen) {
      buffer = 0;
      return;
    }
    // Shown again, the rows it kept are its buffer again, in the flush that
    // stops keeping them.
    if (untrack(() => away.size) > 0) {
      away = new Set();
      buffer = Math.min(full, keptBuffer);
    }
    if (untrack(() => buffer) >= full) {
      buffer = full;
      return;
    }
    const by = Math.max(1, full / BUFFER_STEPS);
    let frame = 0;
    let task: ReturnType<typeof setTimeout> | undefined;
    const grow = () => {
      frame = requestAnimationFrame(() => {
        task = setTimeout(() => {
          buffer = Math.min(full, buffer + by);
          if (buffer < full) {
            grow();
          } else if (untrack(() => frontHeld.length) > 0) {
            frontHeld = [];
          }
        });
      });
    };
    grow();
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(task);
    };
  });
  /**
   * The mounted rows the view does not show, each at virtua's size for it,
   * nearest the view first: skipped while the pane is away (`aside`). A row
   * virtua never measured (its `hide`) is left to be measured as the pane
   * is laid out. Attributes and virtua's sizes alone: nothing here reads the
   * page's layout.
   */
  function rowsAside(): ReadonlyMap<string, number> {
    const container = listing?.firstElementChild;
    if (!(container && list)) {
      return new Map();
    }
    const top = list.getScrollOffset();
    const first = list.findItemIndex(top);
    const last = list.findItemIndex(top + list.getViewportSize());
    const at = new Map(renderedRows.map((row, index) => [row.key, index]));
    const out: { far: number; key: string; px: number }[] = [];
    for (const item of container.children) {
      const key = item.querySelector<HTMLElement>(":scope > [data-row]")
        ?.dataset.row;
      const index = key === undefined ? undefined : at.get(key);
      if (
        key === undefined ||
        index === undefined ||
        (index >= first && index <= last) ||
        (item as HTMLElement).style.visibility === "hidden"
      ) {
        continue;
      }
      out.push({
        key,
        px: list.getItemSize(index),
        far: index < first ? first - index : index - last,
      });
    }
    out.sort((a, b) => a.far - b.far);
    return new Map(out.map(({ key, px }) => [key, px]));
  }
  /** The rows skipped aside that the view from `top` shows are styled from here on (a scroll's, `onListScroll`). */
  function liftInView(top: number): void {
    if (!list) {
      return;
    }
    const last = list.findItemIndex(top + list.getViewportSize());
    const inView: string[] = [];
    for (let index = list.findItemIndex(top); index <= last; index += 1) {
      const key = renderedRows[index]?.key;
      if (key !== undefined && aside.has(key)) {
        inView.push(key);
      }
    }
    if (inView.length > 0) {
      aside = new Map([...aside].filter(([key]) => !inView.includes(key)));
    }
  }
  // Shown, the rows skipped aside are styled `STAGE_ROWS` a task, each step
  // once a frame has painted; not while a far landing is on its way, which
  // lets go of the view it leaves itself, still skipped (`landFar`).
  $effect(() => {
    if (unseen || untrack(() => aside.size) === 0) {
      return;
    }
    let frame = 0;
    let task: ReturnType<typeof setTimeout> | undefined;
    const step = () => {
      frame = requestAnimationFrame(() => {
        task = setTimeout(() => {
          if (!(staging || narrow || landingAway !== undefined)) {
            const mounted = onList();
            aside = new Map(
              [...aside].filter(([key]) => mounted.has(key)).slice(STAGE_ROWS)
            );
          }
          if (aside.size > 0) {
            step();
          }
        });
      });
    };
    step();
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(task);
    };
  });
  /** The rows of the view a far landing left, held mounted while it lands. */
  let lingering = $state<number[]>([]);
  /**
   * A PANE LAID OUT AGAIN IS STYLED A FEW ROWS A TASK.
   *
   * A pane put away is skipped (PaneLeaf `.pane-hidden`), and virtua hears
   * nothing of it: no size, no scroll. The frame that lays it out again as
   * the reader reaches for its tab (warm.svelte.ts) styled every element it
   * holds, 772 of them and 17.5ms on its own (tab-return 1a), and delivered
   * virtua's observer every size it missed: the range it cut there took
   * down the rows the view held when it was put away, 4.6-9.6ms of their
   * removal in a 21-28ms task (1b). So as the pane warms, in that flush, the
   * rows it holds are kept mounted (`heldRows`, by key, in `keepMounted`) and
   * skipped, each at the size virtua has for it (`skipping`, in
   * `itemAttrs`): the frame lays out the pane and those rows' boxes alone.
   * Once it has painted, `STAGE_ROWS` of them a task are styled, or let go
   * unstyled where virtua's range no longer holds them (web.dev, "Optimize
   * long tasks"). While a far landing is on its way they wait: it lets go
   * of the view it leaves itself (`landFar`), and those rows go still
   * skipped; once it has landed, what is held is let go and what is left
   * mounted is styled, a step a task. A row virtua never measured (mounted while the pane was
   * skipped: virtua's `hide`, `visibility: hidden` on its item) is skipped
   * at virtua's estimate and goes first: its first measurement lands in the
   * first step, not in the frame that lays the pane out (six such rows, 300
   * of the 454 elements that frame styled: tab-return 1a). A row rewritten
   * since the pane was put away is not skipped at all: virtua's size for it
   * is stale, and it is measured in that frame, as before. Shown before
   * that ends, the pane lifts every skip in the flush that shows it
   * (`skipped`).
   */
  let heldRows = $state<string[]>([]);
  /** The rows still skipped while they stage, each at virtua's size for it, px. */
  let skipping = $state.raw<ReadonlyMap<string, number>>(new Map());
  const NO_SKIPS: ReadonlyMap<string, number> = new Map();
  /** What `itemAttrs` skips: nothing once the pane is shown. */
  const skipped = $derived(visible ? NO_SKIPS : skipping);
  /** Each hold's number: whose rows a step in hand is staging. */
  let parkings = 0;
  function parkRows(): void {
    const container = listing?.firstElementChild;
    if (!(container && list)) {
      return;
    }
    // Attributes alone: nothing here reads the page's layout. A row skipped
    // aside stays so until the pane is shown (`aside`): not held here.
    const holding: string[] = [];
    const unmeasured = new Set<string>();
    for (const item of container.children) {
      const key = item.querySelector<HTMLElement>(":scope > [data-row]")
        ?.dataset.row;
      if (key && !aside.has(key)) {
        holding.push(key);
        if ((item as HTMLElement).style.visibility === "hidden") {
          unmeasured.add(key);
        }
      }
    }
    if (holding.length === 0) {
      return;
    }
    const at = new Map(renderedRows.map((row, index) => [row.key, index]));
    // A row rewritten since the pane was put away (its text changed: the
    // live row a turn streamed into) has outgrown the size virtua has for
    // it: it is not skipped, and is measured in the frame that lays the
    // pane out. Skipped and let go by a far landing, it kept that size above
    // the view (tab-return 1b: the list 15.5px short of main's).
    const now = textOfRows();
    const rewritten = (key: string) =>
      putAway.has(key) && putAway.get(key) !== now.get(key);
    const skips = new Map<string, number>();
    for (const key of holding) {
      const index = at.get(key);
      if (index !== undefined && !rewritten(key)) {
        skips.set(key, list.getItemSize(index));
      }
    }
    // The rows virtua never measured stage first: their first measurement
    // lands in the first step, behind the frame that laid the pane out.
    heldRows = [
      ...holding.filter((key) => unmeasured.has(key)),
      ...holding.filter((key) => !unmeasured.has(key)),
    ];
    skipping = skips;
    parkings += 1;
    const own = parkings;
    // The task after the frame that lays the pane out, then a step a task.
    const step = () =>
      requestAnimationFrame(() =>
        setTimeout(() => {
          if (own === parkings && stageStep()) {
            step();
          }
        })
      );
    step();
  }
  /** How long each mounted row's text is, by key. */
  function textOfRows(): Map<string, number> {
    const lengths = new Map<string, number>();
    for (const item of listing?.firstElementChild?.children ?? []) {
      const row = item.querySelector<HTMLElement>(":scope > [data-row]");
      if (row?.dataset.row) {
        lengths.set(row.dataset.row, row.textContent?.length ?? 0);
      }
    }
    return lengths;
  }
  /** One step of the staging (`parkRows`); answers whether another is due. */
  function stageStep(): boolean {
    // A far landing on its way lets the view it leaves go itself, a step a
    // task (`landFar`, `catchUpRest`): the held rows wait, still skipped,
    // and go unstyled; let go here as well, their removal landed in the
    // frame of the landing's own step (tab-return 1b: 14.2ms).
    if (staging || narrow || landingAway !== undefined) {
      return true;
    }
    // Nor in the frame the away landing's scroll comes in: its `onscroll`
    // reads the list's place, and the rows styled here were styled there
    // (tab-return 1a: 277 elements, a 13.3ms scroll event). Two steps at
    // most, should no scroll come.
    if (awayScroll > 0) {
      awayScroll -= 1;
      return true;
    }
    if (heldRows.length > 0) {
      const done = heldRows.slice(0, STAGE_ROWS);
      heldRows = heldRows.slice(STAGE_ROWS);
      liftSkips(done.filter((key) => onList().has(key)));
    } else {
      liftSkips(stillMounted().slice(0, STAGE_ROWS));
    }
    return heldRows.length > 0 || skipping.size > 0;
  }
  /** The keys of the rows virtua has mounted, read off their attributes. */
  function onList(): Set<string> {
    const keys = new Set<string>();
    for (const item of listing?.firstElementChild?.children ?? []) {
      const key = item.querySelector<HTMLElement>(":scope > [data-row]")
        ?.dataset.row;
      if (key) {
        keys.add(key);
      }
    }
    return keys;
  }
  /** The rows still skipped that virtua has mounted; the skips of those it let go are dropped. */
  function stillMounted(): string[] {
    const mountedKeys = onList();
    const kept = [...skipping.keys()].filter((key) => mountedKeys.has(key));
    if (kept.length < skipping.size) {
      skipping = new Map([...skipping].filter(([key]) => mountedKeys.has(key)));
    }
    return kept;
  }
  /** `keys` are styled from here on: their skips are lifted. */
  function liftSkips(keys: string[]): void {
    if (!keys.some((key) => skipping.has(key))) {
      return;
    }
    const unlifted = new Map(skipping);
    for (const key of keys) {
      unlifted.delete(key);
    }
    skipping = unlifted;
  }
  /** Whether this pane was warm at the last look: it stages as it warms, once. */
  let wasWarm = false;
  $effect(() => {
    // Both read every time, so a pane warming or `visible` wakes this. A
    // session's pane goes by the session's id; a thread's by its tab's, read
    // off the slot it is docked in, which can be none yet as this first runs
    // (PaneHost moves it there after it mounts).
    const warmed = warm.panes();
    const hidden = !visible;
    // PaneLeaf's slot: a side split's own panes (paneforge) carry an empty `data-pane`.
    const pane = listing?.closest<HTMLElement>('[data-slot="pane"][data-pane]')
      ?.dataset.pane;
    const now =
      hidden &&
      (warmed.includes(session.instanceId) ||
        (!!pane && warmed.includes(pane)));
    // Gone cold, the pane is skipped again: it keeps what it has mounted,
    // whatever a far landing while it was warm let go (`away`).
    if (now && !wasWarm) {
      untrack(parkRows);
    } else if (hidden && wasWarm && !now) {
      away = untrack(onList);
    }
    wasWarm = now;
  });
  // Shown, nothing stays skipped: `skipped` lifts every skip in this flush,
  // and the skips are dropped with it, so none comes back if it is put away.
  $effect.pre(() => {
    if (visible) {
      untrack(() => {
        if (skipping.size > 0) {
          skipping = NO_SKIPS;
        }
      });
    }
  });
  /**
   * The indexes virtua keeps mounted whatever its range: the last
   * `TAIL_MOUNTED` rows, and every row folding shut wherever it stands —
   * virtua dropping one mid-fold cancelled the fold, it never said it had
   * gone, and it stayed in the list at full height to fold again whenever it
   * was next drawn. These are indexes into the rows of this flush; virtua
   * mounts one only once its store holds that many rows.
   */
  const keepMounted = $derived.by(() => {
    const count = renderedRows.length;
    const { leaving: folding, settled } = presentation;
    // Not seen, the tail has no motion to keep: every row its session sends
    // would wait mounted for the reach to style it, with the view it was put
    // away at (tab-return 1b: 8 rows, 550 elements, in the warm frame). A
    // far landing builds its own (`staged`).
    const tail = unseen ? 0 : TAIL_MOUNTED;
    const kept = Array.from(
      { length: Math.min(Math.max(tail, staged), count) },
      (_, i) => count - 1 - i
    );
    // A row folding shut stands after the settled rows (`withLeaving`).
    for (
      let index = settled.length;
      folding.size > 0 && index < count;
      index += 1
    ) {
      if (folding.has(renderedRows[index].key)) {
        kept.push(index);
      }
    }
    // The view a far landing leaves, held while it lands (`landFar`).
    for (const index of lingering) {
      if (index < count) {
        kept.push(index);
      }
    }
    // The rows mounted as a page in front was handed over, held while the
    // buffer steps back up (`frontHeld`).
    if (frontHeld.length > 0) {
      const mountedKeys = new Set(frontHeld);
      renderedRows.forEach((row, index) => {
        if (mountedKeys.has(row.key)) {
          kept.push(index);
        }
      });
    }
    // The rows a pane held as it was laid out again, held while they stage (`heldRows`).
    if (heldRows.length > 0) {
      const warmKeys = new Set(heldRows);
      renderedRows.forEach((row, index) => {
        if (warmKeys.has(row.key)) {
          kept.push(index);
        }
      });
    }
    // Put away, every row mounted as it was (`away`): one let go there stays held.
    if (away.size > 0) {
      renderedRows.forEach((row, index) => {
        if (away.has(row.key)) {
          kept.push(index);
        }
      });
    }
    return kept;
  });

  /**
   * A LANDING FAR DOWN DRAWS WHAT IS ON SCREEN FIRST.
   *
   * A pane whose session went on without it — laid out unseen as the reader
   * reaches for its tab (`awayAtTail`), or shown again with no reach first, a
   * catch-up, `active` rising — is put on its new tail by the pin, a screen
   * or more below where it stood (`pinBottom`). virtua re-cut its range
   * there in one go: every row on screen at the tail and a screen more above
   * it mounted, and every row of the view it left taken down, in one scroll
   * event of 53ms. While it lands, it mounts only what the view shows (no
   * `bufferSize`) and keeps the rows of the view it left (`lingering`, in
   * `keepMounted`), out of sight above.
   * Once that frame has painted, the screen above is mounted in a task of its
   * own, and the rows left behind are let go in the next (web.dev, "Optimize
   * long tasks": break a long task up and yield between the parts). What is
   * on screen is drawn in the first and never moves after: the rows mounted
   * later are above it, and virtua keeps the view where it stands as they
   * are measured.
   */
  let unwinding = false;
  /** Each far landing's number: whose rows a let-go in hand is letting go (`catchUpRest`). */
  let landings = 0;
  function landFar(was: number): void {
    // Before the reveal nothing is painted: the first landing has no screen to keep.
    if (!(list && shown && renderedRows.length > 0)) {
      return;
    }
    // virtua's own range as it stands, read off its sizes: the view and its
    // buffer either side (virtua's `$getRange`), what is mounted now, and
    // the rows a pane put away kept (`away`), let go with them. Read wider,
    // the rows virtua never mounted were mounted here, three screens of them
    // in the landing's frame (65ms, tab-return's 3 min).
    const from = list.findItemIndex(Math.max(0, was - buffer));
    const to = list.findItemIndex(was + viewHeight + buffer);
    const behind = new Set(
      Array.from({ length: to - from + 1 }, (_, i) => from + i)
    );
    if (away.size > 0) {
      renderedRows.forEach((row, index) => {
        if (away.has(row.key)) {
          behind.add(index);
        }
      });
      away = new Set();
    }
    lingering = [...behind].sort((a, b) => a - b);
    narrow = true;
    unwinding = false;
    landings += 1;
    // The landing's scroll comes in the next frame (`onscroll`); past it,
    // the rest follows even if nothing scrolled.
    requestAnimationFrame(() =>
      setTimeout(() => requestAnimationFrame(() => setTimeout(catchUpRest)))
    );
  }
  /**
   * After the landing's frame has painted: the screen above, then the rows
   * left behind, `STAGE_ROWS` a task (a view's worth let go in one, a far
   * landing's last step took 34ms, 27ms of it the rows' removal: tab-return's
   * 3 min), then the far landing's built rows past what virtua's range
   * holds, the same few a task.
   */
  function catchUpRest(): void {
    if (!narrow || unwinding) {
      return;
    }
    unwinding = true;
    // A far landing made meanwhile (`landFar`) holds rows of its own: this
    // one lets go of nothing more.
    const own = landings;
    const release = () =>
      requestAnimationFrame(() =>
        setTimeout(() => {
          if (own !== landings) {
            return;
          }
          lingering = lingering.slice(STAGE_ROWS);
          if (lingering.length > 0) {
            release();
            return;
          }
          // The staged screen above the view, the topmost rows first, as
          // the view left behind was (`ABOVE_LANDING`).
          staged = Math.max(0, staged - STAGE_ROWS);
          if (staged > 0) {
            release();
            return;
          }
          unwinding = false;
        })
      );
    requestAnimationFrame(() =>
      setTimeout(() => {
        narrow = false;
        release();
      })
    );
  }

  /**
   * A FAR LANDING'S ROWS ARE BUILT BEFORE IT, A FEW A TASK.
   *
   * The tail a far landing goes to is rows the view has never drawn: a pane
   * shown again after minutes away holds the view it left and its last few
   * rows, nothing between. Landed at once, every row of the new view was
   * built, styled and laid out in the one task its scroll set off (19 rows,
   * 853 elements, 34ms, tab-return's 3 min). So the rows from the end are
   * kept mounted (`staged`, in `keepMounted`) `STAGE_ROWS` a task, each step
   * once a frame has painted and measured the last, under the view the
   * reader still sees, until they fill a view by virtua's sizes; the pin
   * lands then, among rows already measured (web.dev, "Optimize long tasks":
   * break a long task up and yield between the parts). A reader who scrolls
   * meanwhile keeps the view, and the staged rows go with the landing's.
   *
   * THE SCREEN ABOVE THE LANDING IS MEASURED WITH IT. Once the pane is shown
   * its `buffer` mounts a screen above the view, an eighth a task, and the
   * rows there are the ones its session sent while it was away: never drawn,
   * at `ROW_ESTIMATE`. Each step measured them taller, and virtua held the
   * tail's rows where they stood by scrolling (its `scrollTo` behind the
   * flush, a style and a layout forced), whose scroll event in the next frame
   * cut its range again: 5 corrections from 89ms to 180ms after the press,
   * tasks of 16-29ms (tab-return 1b). So the staging measures that screen
   * too, out of sight, and the rows above the view are let go again with the
   * view the landing left (`catchUpRest`), before the press shows the pane:
   * virtua keeps the sizes of rows it unmounts, and the buffer mounts
   * measured rows that move nothing.
   */
  const STAGE_ROWS = 6;
  /** How many views of rows from the end a far landing stages: its view, and the screen above it the buffer mounts. */
  const ABOVE_LANDING = 2;
  /** How many rows from the end a far landing still being built keeps mounted; 0 when none is. */
  let staged = $state(0);
  /** The far landing's rows fill a view: the pin's next far write lands. */
  let stagedReady = false;
  let staging = false;
  function stageFar(): void {
    if (staging) {
      return;
    }
    staging = true;
    const step = () =>
      requestAnimationFrame(() =>
        setTimeout(() => {
          if (!(staging && list && atBottom)) {
            staging = false;
            staged = 0;
            return;
          }
          // The rows from the end that fill the view and the screen above it
          // (`ABOVE_LANDING`), by virtua's sizes: each step's rows measured by
          // now, the rest at `ROW_ESTIMATE`.
          const count = renderedRows.length;
          const fill = viewHeight * ABOVE_LANDING;
          let need = 0;
          for (let height = 0; need < count && height < fill; need += 1) {
            height += list.getItemSize(count - 1 - need);
          }
          if (staged >= need) {
            staging = false;
            stagedReady = true;
            pinBottom();
            stagedReady = false;
            return;
          }
          staged = Math.min(need, staged + STAGE_ROWS);
          step();
        })
      );
    step();
  }

  function left(key: string): void {
    leaving = leaving.filter(({ row }) => row.key !== key);
    leftTick += 1;
  }

  /**
   * A leaving row's report, bound to its key when `Row` reads it — as its
   * fold starts. The list item behind a row is a live view of an index, and
   * by the time a fold finishes the tail can have changed under it (a queued
   * message read mid-turn leaves as its turn lands above), so reading the key
   * then read past the end of the list and the row never left.
   */
  const leaver = (key: string) => () => left(key);

  let scroller = $state<HTMLElement | undefined>();
  /**
   * The scroller's height: what sets how far past the view virtua mounts
   * rows (its `bufferSize`, `BUFFER_SCREENS` of it), so a row is measured
   * well before the reader reaches it.
   * virtua takes up a row's change of size for the reader only while the row
   * is wholly above the view; scrolling up, a row it had only estimated
   * (`ROW_ESTIMATE`) that came into view unmeasured — any page put in front,
   * met by a wheel longer than its default 200px — grew there and pushed
   * the rows under it down by the difference. Read as the scroller mounts,
   * and a change in the next frame (frameSize): the rows it mounts lay the
   * list out again.
   */
  let viewHeight = $state(0);
  const measureView = frameSize<HTMLElement>((node) => {
    viewHeight = node.clientHeight;
  });
  /** virtua's imperative handle: its sizes, its cache, and `scrollToIndex` for
      a row that is not the tail (the tray's reveal). */
  let list = $state<VirtualizerHandle | undefined>();
  /** The box around the list; its first child is virtua's container. */
  let listing = $state<HTMLElement>();
  /**
   * The part of a pixel that makes the scroll range a whole number of pixels,
   * laid above the list's first row. A scroll offset is whole (at a device
   * pixel ratio of 1, in Chromium and WebKit alike), and the range it moves
   * over — the content's height less the scroller's own box — rarely is: the
   * list is the sum of its rows' measured heights, and the box is whatever
   * the pane's layout left it (733.359375px in WebKit, 732.859375px in
   * Chromium, where `clientHeight` says 733 for both). Pinned at the largest
   * whole offset, the last row stood off the foot by what was left over: a row
   * arriving moved the tail 0.56px, and in WebKit the tail rested 0.359px
   * above the foot, where virtua took the growing row for one above the view
   * and held its top (its store's `shouldKeep`), a write of its own on every
   * frame of a reply. Taken up at the top, where no reader sees a sub-pixel,
   * it puts the tail on the foot exactly, every time.
   */
  let spare = $state(0);
  /** The room past the end for what rises past the composer (the markup). */
  let parkedRoom = $state<HTMLElement>();
  /** The room under the list that clears the composer (the markup). */
  let foot = $state<HTMLElement>();
  /**
   * The list's own height. virtua's `getScrollSize` is its store's, exact,
   * where the height it writes to its container's style reads back in
   * Chromium cut to six significant digits (2129.05 for 2129.046875), but it
   * is never less than the viewport (virtua 0.53.4: `getScrollSize` is
   * `max($getTotalSize(), $getViewportSize())`). A list shorter than its
   * view read as tall as the view, so it never fitted: the spare was the
   * rooms' part of a pixel (0.96875px under a 144.03125px foot), put on or
   * not by whether a resize came while the view was pinned. A list shorter
   * than its view is the height virtua wrote on its container
   * (`height: totalSize + "px"`), whose six digits are exact to a
   * thousandth at that size.
   */
  function listHeight(): number {
    const size = list?.getScrollSize() ?? 0;
    if (size > (list?.getViewportSize() ?? 0)) {
      return size;
    }
    const inner = listing?.firstElementChild as HTMLElement | null | undefined;
    return Number.parseFloat(inner?.style.height ?? "");
  }

  /**
   * Puts `spare` on the tail's range as it stands; says whether it moved.
   * Its padding goes on the page with the flush it is set in, which the pin
   * reads behind (`pinNext`), so a list that grew is whole in the frame it
   * grew.
   *
   * The range is where the tail stands (`tailTop`): virtua's viewport (the
   * box's content height, `getViewportSize`) against the strip before the
   * list, the list (`listHeight`) and the foot. The parked room past the
   * foot is not the tail's, so it is not counted. None of them is read off
   * the layout: this runs in whatever task virtua's write landed in. The
   * foot is the size its observer last delivered (`rooms`): read here as its
   * computed style, its resolved block size laid the page out in the
   * microtask behind every height virtua wrote, a whole layout per row a
   * streamed reply grew.
   *
   * A list that fits its view has no range to make whole, and no spare.
   */
  function keepWhole(): boolean {
    const height = listHeight();
    const viewport = list?.getViewportSize() ?? 0;
    if (!(viewport > 0 && rooms.measured && Number.isFinite(height))) {
      return false;
    }
    const range = olderRoom + height + rooms.foot - viewport;
    const over = range <= 0 ? 0 : ((-range % 1) + 1) % 1;
    const next = over < 0.001 || over > 0.999 ? 0 : over;
    if (Math.abs(next - spare) <= 0.001) {
      return false;
    }
    spare = next;
    return true;
  }
  /**
   * Keeps `spare` on the list's height whatever changed it, and the tail on
   * the foot when the pin did not see the change: a row taken out at the end
   * (a parked ask's call) moves no row's size, only the list's, and virtua
   * says nothing of it. The height is heard through a MutationObserver on
   * virtua's container's style, as the microtask behind virtua's write,
   * before the frame is painted. virtua writes it from inside its own
   * ResizeObserver callback, so the container is never observed for size
   * (THE PIN, below). A change the pin saw is already whole by then.
   *
   * A LIST THAT GOT SHORTER UNDER A VIEW AT ITS END IS NOT THE READER. The
   * browser clamps the offset to the new end, and the scroll event that
   * makes is dispatched a frame later, by when the list can have grown again
   * (a row in at its estimate). So the clamp is tagged here, where the
   * shrink is heard: read with the layout it clamped in, a view standing on
   * the end is the clamp's, and its event is this component's own
   * (`lastWrite`). Nothing is written. Left to `onscroll`'s own clamp test
   * against the height at dispatch, that event read as the reader scrolling
   * up, 21px short of an end that had moved on, and the tail was let go for
   * good: after a continuation in place (its list shrinks by 1,350px at the
   * tail as the next rows come in), the open pane stood a turn short of the
   * reply after it and no longer followed the tail (the page's CPU
   * throttled 4x or 6x, 3 runs of 6).
   */
  /**
   * The foot's height, as its observer last delivered it: after a layout,
   * never by asking for one. It comes as the foot is first laid out and
   * whenever it resizes (the composer's clearance changing), and the list
   * is made whole again for it. The parked room is not observed: it moves
   * neither the tail nor the view.
   */
  const rooms = { foot: 0, measured: false };
  $effect(() => {
    const footNode = foot;
    if (!footNode) {
      return;
    }
    // biome-ignore lint/style/noRestrictedGlobals: the foot is read in the delivery, after the layout that sized it, and a pinned tail made whole there, so no frame paints it off the end
    const sizes = new ResizeObserver((entries) => {
      for (const entry of entries) {
        rooms.foot = entry.borderBoxSize[0]?.blockSize ?? 0;
      }
      rooms.measured = true;
      if (keepWhole() && pinned()) {
        pinNext();
      }
    });
    sizes.observe(footNode);
    return () => {
      sizes.disconnect();
      rooms.measured = false;
    };
  });

  function wholeHeight(node: HTMLElement) {
    const inner = node.firstElementChild;
    if (!inner) {
      return;
    }
    keepWhole();
    let size = list?.getScrollSize() ?? 0;
    const watch = new MutationObserver(() => {
      const now = list?.getScrollSize() ?? 0;
      const shrank = now < size;
      size = now;
      // A list that got shorter under a view pinned at its end is the
      // pin's: it reads where the clamp leaves the view, and tags it
      // (`pinBottom`). Read here as well, behind the pin, the scroller's
      // height was a second read of the microtask (`(anonymous)` at
      // Transcript.svelte:2417 compiled, a reply's long frames); a view the
      // reader holds is told from a clamp by the scroll that comes
      // (`readScroll`).
      if ((keepWhole() || shrank) && pinned()) {
        pinNext();
      }
    });
    watch.observe(inner, { attributes: true, attributeFilter: ["style"] });
    return () => watch.disconnect();
  }
  let atBottom = $state(true);
  /** How many screens from the tail the reader goes before "Jump to latest"
      shows; our own call, no source sets it. */
  const FAR_FROM_LATEST = 0.75;
  /** Past FAR_FROM_LATEST screens from the tail, and not back at it since. */
  let farFromLatest = $state(false);

  /**
   * Where the reader was, as the scroll handler last saw it. A pane hides
   * inside whatever task hid it — a finger lifting off a swipe between tabs
   * — and reading the scroller there forced a layout into that task; what the
   * landing keeps is already known without asking.
   */
  let lastTop = 0;
  /** Where the list begins in the scroller, as the scroll handler last saw it. */
  let listStart = 0;

  /**
   * Keep where the reader is for the pane's next mount. Called where a pane
   * hides — inside a swipe's release, among others — so it reads nothing off
   * the page: the row at the top of the view comes from virtua's own sizes,
   * at the offset the scroll handler last saw.
   */
  function saveLanding(): void {
    if (!(list && shown) || renderedRows.length === 0) {
      return;
    }
    sizes.set(session.instanceId, {
      cache: list.getCache(),
      first: placeOf(renderedRows[0]),
      count: renderedRows.length,
    });
    const place = atBottom ? null : (keptPlace ?? placeAt(lastTop));
    const landing: Landing = place ? { tail: false, ...place } : { tail: true };
    writeJson(LANDING + session.instanceId, landing, "session");
  }

  $effect.pre(() => {
    if (!visible) {
      untrack(saveLanding);
    }
  });
  onDestroy(saveLanding);
  // A reload tears the page down without destroying anything.
  $effect(() => {
    addEventListener("pagehide", saveLanding);
    return () => removeEventListener("pagehide", saveLanding);
  });

  /** The row the reader's place is at, while it is being returned to: its index, or -1. */
  function anchorIndex(): number {
    if (!resume || resume.tail) {
      return -1;
    }
    return rowHolding(renderedRows, "at" in resume ? resume.at : resume.block);
  }

  /**
   * The reader's place at the view's top `top`: the first block of the row
   * there, or of the nearest row above it that has one (the live tail's rows
   * have none), and how far past that row's top the view stands. Read off
   * virtua's sizes, never the page.
   */
  function placeAt(top: number): { block: string; into: number } | null {
    if (!list || renderedRows.length === 0) {
      return null;
    }
    for (let index = list.findItemIndex(top); index >= 0; index -= 1) {
      const block = blockOf(renderedRows[index]);
      if (block) {
        return { block, into: top - listStart - list.getItemOffset(index) };
      }
    }
    return null;
  }

  /**
   * How far into the row at `index` the view's top stands to centre it in
   * the room the reader sees, above the foot the composer stands over: a
   * negative distance, the room above the row. A row taller than that room
   * starts at the view's top, so its first line is read first.
   */
  function centred(index: number): number {
    if (!(list && scroller)) {
      return 0;
    }
    const room = scroller.clientHeight - rooms.foot;
    const size = list.getItemSize(index);
    return size < room ? -(room - size) / 2 : 0;
  }

  /**
   * Put the reader's row back at the top of the view, as far into it as they
   * had scrolled, from virtua's sizes as they stand; says whether the
   * scroller had to move. Called until it no longer does: each write brings
   * rows into range that virtua measures, which moves the row again, and the
   * list is not drawn until it has stopped (see the reveal). virtua's own
   * `scrollToIndex` was no use here: after older history is shifted in front,
   * it chased the row to the end of the list.
   */
  function restore(): boolean {
    const index = anchorIndex();
    if (!(resume && !resume.tail) || index < 0) {
      return false;
    }
    atBottom = false;
    return scrollToRow(index, "at" in resume ? centred(index) : resume.into);
  }

  /**
   * The last offset this component wrote to put a row back in its place,
   * and the offset the engine read back for it. An engine rounds a written
   * offset to its own steps (WebKit to whole pixels: 455.65625 reads back
   * 455), so a place it cannot reach any closer is reached once the offset
   * reads back what it did for that same write.
   */
  let placeWrite: { target: number; read: number } | null = null;

  /**
   * Puts the row at `index` at the view's top, `into` pixels past its top,
   * from virtua's sizes as they stand; says whether the scroller had to
   * move. Within what the scroller can reach: a place past its end — rows
   * below it that are shorter now than when it was left — is its end.
   */
  function scrollToRow(index: number, into: number): boolean {
    if (!(list && scroller && listing)) {
      return false;
    }
    const start =
      listing.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop;
    // Never past the row's own end as virtua has it sized: a row it has not
    // measured is `ROW_ESTIMATE` tall, and a place further into it than that
    // put the row above the view, where it is never drawn, never measured,
    // and the place never reached (the reload landed on the row after it).
    // Its last pixel at the view's top, it is drawn, measured, and the next
    // write goes as far into it as the place says.
    const reach = Math.min(into, Math.max(0, list.getItemSize(index) - 1));
    // Rounded to a whole pixel: WebKit drops the fraction of a `scrollTop`
    // written to it, so 2075.72 landed at 2075, and with the row's own snap
    // to the device's pixels the place stood 1.3px short (transcript-holds'
    // landings, WebKit at 390), where the nearest pixel is half a pixel off
    // at most.
    const target = Math.round(
      Math.min(
        Math.max(0, start + list.getItemOffset(index) + reach),
        scroller.scrollHeight - scroller.clientHeight
      )
    );
    const now = scroller.scrollTop;
    if (
      Math.abs(now - target) <= 0.5 ||
      (placeWrite !== null &&
        Math.abs(placeWrite.target - target) <= 0.5 &&
        now === placeWrite.read)
    ) {
      return false;
    }
    scroller.scrollTop = target;
    lastWrite = scroller.scrollTop;
    placeWrite = { target, read: lastWrite };
    return true;
  }

  /**
   * THE PLACE IS A BLOCK. The reader's place off the tail, as their own
   * scroll last left it (`readScroll`, `placeAt`), or as this component last
   * put it back: the block at the view's top and how far into its row. No
   * other scroll moves it: virtua's corrections and the strip's keep the
   * rows on screen where they stand, and a scroll the page's own layout
   * makes as it goes (a reload) is not the reader's. What a reload returns
   * to (`saveLanding`). Whatever the list does under it (a row put in above,
   * one taken out, rows folding again), the row holding that block is put
   * back at the view's top, as far into it, once the change is laid out
   * (`holdPlace`). A change only in front is virtua's own `shift`, which is
   * exact; at the tail the place does not move.
   */
  let keptPlace: { block: string; into: number } | null = null;
  /** The frame the place is put back in, while it is. */
  let keepFrame = 0;
  /** The most frames a place is put back over while the rows around it measure: our own call. */
  const KEEP_FRAMES = 12;
  /**
   * Bumped each time the reader's own scroll moves the view (`readScroll`):
   * a place put back stops being put back the moment the reader moves.
   */
  let readerMoved = 0;
  /**
   * Until when a landing's place is held (performance.now()): the rows
   * around a place read back to go on measuring after the list is drawn,
   * and each measurement above it moves it, frames apart. Held for a time
   * alone, it could be let go while those rows were still coming in. A
   * page handed over in front puts virtua's buffer at none, and the buffer
   * steps back up a frame and a task at a time, eight steps. On WebKit at
   * 390 under load, frames came 220–340ms apart (transcript-holds' reload
   * legs, traced): the list was drawn with the buffer at 250 of its 400px,
   * and the place was put back at +257ms and again at +971ms, as the buffer
   * filled, after 130px of rows had come in above it. In another run a page
   * in front landed 1227ms after the list was drawn, and its eight steps ran
   * on past the 1.5s hold. virtua on an iPhone keeps a size change made
   * while it scrolls aside rather than correcting for it at once (0.53.4
   * core: `p() && 0 !== I ? b += t : S += t`). So a landing's place is held
   * while the buffer is not whole, and `FILLED_HOLD_MS` past that.
   */
  let holdUntil = 0;
  /** How long a landing's place is held once the list is drawn, ms: our own call. */
  const LANDING_HOLD_MS = 1500;
  /**
   * How long a landing's place is still held once the rows around it are
   * all mounted: the last of them measuring, and virtua's own scroll
   * settling (its 150ms), ms. Our own call.
   */
  const FILLED_HOLD_MS = 500;
  /** A landing's place held on while the rows around it are still coming in (`holdUntil`). */
  function holdWhileFilling(now: number): void {
    if (now < holdUntil && !unseen && buffer < viewHeight * BUFFER_SCREENS) {
      holdUntil = Math.max(holdUntil, now + FILLED_HOLD_MS);
    }
  }
  function holdPlace(): void {
    cancelAnimationFrame(keepFrame);
    keepFrame = 0;
    const place = keptPlace;
    if (
      !(place && landed && shown) ||
      atBottom ||
      jumping ||
      seeking !== null ||
      (resume !== null && !resume.tail)
    ) {
      return;
    }
    const moved = readerMoved;
    let frames = 0;
    const step = (): void => {
      keepFrame = requestAnimationFrame(() => {
        keepFrame = 0;
        // The reader moved since, or the view follows the tail again.
        if (atBottom || readerMoved !== moved) {
          return;
        }
        // The row at the view's top first: it is the place's unless the list
        // moved under it, and the whole list is read for it only then.
        const top = list ? list.findItemIndex(lastTop) : -1;
        const index =
          top >= 0 && blockOf(renderedRows[top]) === place.block
            ? top
            : rowHolding(renderedRows, place.block);
        const put = index >= 0 && scrollToRow(index, place.into);
        if (put) {
          frames += 1;
          keptPlace = place;
        }
        const now = performance.now();
        holdWhileFilling(now);
        if ((put && frames < KEEP_FRAMES) || now < holdUntil) {
          step();
        }
      });
    };
    step();
  }
  $effect(() => {
    // The rows drawn are what moves the place, and whether this drawing
    // shifted them is said with them.
    const { shifted } = presentation;
    // A change only in front is virtua's own `shift`, unless a landing's
    // place is still held: then it is put back after that change too.
    if (!shifted || performance.now() < holdUntil) {
      untrack(holdPlace);
    }
    return () => cancelAnimationFrame(keepFrame);
  });

  // ── Opened at a record ────────────────────────────────────────────────
  /**
   * THE RECORD ASKED FOR IS READ BACK TO, CENTRED AND MARKED.
   *
   * `?at=` names a record of this conversation (open-at.svelte.ts). It is a
   * landing like a kept place (`resume`), centred rather than at the view's
   * top: before the list is drawn, the reveal reads the pages before the
   * rows held, one at a time, until one holds it, and draws the list there;
   * once drawn, `seeking` does the same in place. Either way the view then
   * stands off the tail, so nothing that arrives there moves it, until the
   * reader scrolls. A record the whole conversation does not hold opens at
   * the latest row, and the dock says so.
   */
  /** Bumped by each ask: what re-runs a reveal under way to read back to it. */
  let asked = $state(0);
  /** The record sought in a list already drawn. */
  let seeking = $state<string | null>(null);
  /** The row opened at, by key: `on` until the reader moves on, then fading. */
  let marked = $state<{ key: string; state: "on" | "off" } | null>(null);
  /** The record asked for is not here (`gone`), or the pages before could not be read (`unread`). */
  let unfound = $state<"gone" | "unread" | null>(null);
  /** What the dock says, and the live region says once, of a record not reached. */
  const unfoundWords = $derived(
    unfound === "unread"
      ? "That moment couldn't be reached: the turns before these couldn't be read."
      : `That moment isn't in this ${isThreadTab(session.instanceId) ? "thread" : "session"} any more.`
  );
  /** The most frames a seek re-centres for while rows around it measure: our own call. */
  const SEEK_FRAMES = 30;

  function seek(docId: string): void {
    marked = null;
    unfound = null;
    resume = { tail: false, at: docId };
    standsAtTail = false;
    if (shown) {
      seeking = docId;
    } else {
      asked += 1;
    }
  }

  /** The ask this transcript is seeking, until it has arrived. */
  let taking: string | null = null;
  // An ask is the view's until a transcript of it has arrived at it: one
  // unmounted mid-seek (its pane's state changing under it while the newest
  // page is read) leaves it to the next.
  $effect(() => {
    const docId = openAt.get(session.instanceId);
    if (docId === undefined || docId === taking) {
      return;
    }
    taking = docId;
    untrack(() => seek(docId));
  });

  /** The seek is over: the record is in view and marked, or it is said not to be. */
  function arrived(docId: string): void {
    taking = null;
    if (openAt.get(session.instanceId) === docId) {
      openAt.delete(session.instanceId);
    }
    // Said once, here, where the seek ends: a landing is a state change and
    // a record not held is a refusal (PRODUCT.md, screen readers), and
    // nothing after it (a scroll, a live row) says it again.
    const index = rowHolding(renderedRows, docId);
    if (index < 0) {
      marked = null;
      unfound = paged()?.olderFault ? "unread" : "gone";
      announcement = unfoundWords;
      return;
    }
    marked = { key: renderedRows[index].key, state: "on" };
    // The record opened at is the place now, as a reader's scroll to it is.
    keptPlace = placeAt(lastTop);
    // The finder's own words for the key that brought the reader here
    // ("↵ open at that line", docs/tom/find-and-mention-chosen.md).
    announcement = "Opened at that line.";
    if (scroller) {
      const distance = tailTop(scroller) - scroller.scrollTop;
      farFromLatest = distance > FAR_FROM_LATEST * scroller.clientHeight;
    }
  }

  // In a list already drawn: the pages before are read until one holds the
  // record, then the view is centred on it over the frames the rows around
  // it take to measure (`restore`, as the reveal does).
  $effect(() => {
    const docId = seeking;
    if (!(docId && shown && visible)) {
      return;
    }
    track(rowCount);
    const own = paged();
    if (session.loading || own?.loading) {
      return;
    }
    if (untrack(anchorIndex) < 0) {
      if (own?.cursor && !own.olderFault) {
        if (!own.hydrating && untrack(printOf) === builtPrint) {
          detach(
            untrack(() => readOlderPage(own.instanceId)),
            "untrack"
          );
        }
        return;
      }
      // The conversation's start is in hand, or a page would not read: the
      // latest row, and why not the one asked for.
      untrack(() => {
        resume = null;
        seeking = null;
        atBottom = true;
        farFromLatest = false;
        pinBottom();
        arrived(docId);
      });
      return;
    }
    let frame: number | null = null;
    let frames = 0;
    const step = (): void => {
      frame = requestAnimationFrame(() => {
        frame = null;
        if (restore() && frames < SEEK_FRAMES) {
          frames += 1;
          step();
          return;
        }
        resume = null;
        seeking = null;
        arrived(docId);
      });
    };
    untrack(() => {
      stopFollow();
      tickets.clear();
      step();
    });
    return () => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
    };
  });

  /** The reader has moved on: the mark fades where it stands, and the note goes. */
  function letGo(): void {
    unfound = null;
    if (marked?.state !== "on") {
      return;
    }
    const { key } = marked;
    marked = { key, state: "off" };
    setTimeout(() => {
      if (marked?.key === key && marked.state === "off") {
        marked = null;
      }
    }, dur("--dur-panel"));
  }

  // A press or a key in the transcript is the reader's, as their scroll is
  // (`onscroll`).
  $effect(() => {
    const node = scroller;
    if (!(node && (marked?.state === "on" || unfound))) {
      return;
    }
    node.addEventListener("pointerdown", letGo);
    node.addEventListener("keydown", letGo);
    return () => {
      node.removeEventListener("pointerdown", letGo);
      node.removeEventListener("keydown", letGo);
    };
  });

  // ── Older pages ─────────────────────────────────────────────────────────
  /**
   * The session whose older pages this view asks for: the store's own. The
   * server's stand-in for it (see `SessionPane`) is dropped the moment the
   * store's read lands, and a page put in front of it would go with it.
   */
  function paged(): SessionState | null {
    const store = cawco.session(session.instanceId);
    return store === session ? store : null;
  }

  /**
   * OLDER PAGES COME AS THE READER NEARS THEM, ONE AT A TIME.
   *
   * The view holds the newest page and whatever its reader has scrolled up
   * to. The next older page is asked for when less than ONE VIEWPORT of rows
   * stands between the top of the view and the first row held: `above`, the
   * list's own top to the view's top, as virtua has the rows sized. A row it
   * has not measured counts at `ROW_ESTIMATE`, the smallest a row can be, so
   * the rows really there are never fewer than counted and the ask is early,
   * never late; a wheel notch, a key or a flick moves the view by less than
   * the viewport it is asked across. A list shorter than its viewport is
   * inside that distance by definition, so it fills, a page at a time, until
   * it can scroll or the conversation's start is in hand.
   *
   * Asked from the reader's scrolling and again once a page has landed (the
   * rows in front may still be too few), never before the list is drawn,
   * never for a pane off screen, and not again for a page that failed: that
   * one is asked for by its own Try again (the strip above the list).
   */
  function askOlder(above: number): void {
    const store = paged();
    if (
      !(list && shown && visible && store?.cursor) ||
      store.hydrating ||
      store.loading ||
      store.olderFault
    ) {
      return;
    }
    // A front shift virtua is holding until a touch scroll comes to rest is
    // not in the scroll offset yet: it stands in the first row's own offset.
    if (above - list.getItemOffset(0) < list.getViewportSize()) {
      detach(readOlderPage(store.instanceId), "readOlderPage");
    }
  }

  /**
   * How many rows there are, apart from the rows themselves: every build is
   * a new list, a streamed word's included, and what asks for an older page
   * cares only when a page has changed how many there are.
   */
  const rowCount = $derived(rows.length);
  /**
   * The list's place in the view, heard in the shared size observer's
   * delivery (frame-observer.ts): the listing is observed again in the
   * frame's callbacks, so it reports in that frame's delivery, and is read
   * there, on the layout the frame has just done (as motion/rows' `heard`
   * reads its containers). Read in the frame's callbacks, its boxes laid out
   * what the update had just written (`askOlder`, 15.6ms of style in a
   * reply's 51ms frame).
   */
  let nearStart: FrameObserver | null = null;
  /** Asked for in the frame's callbacks: the listing reports in that frame's delivery. */
  let nearFrame = 0;
  function askOlderInFrame(): () => void {
    cancelAnimationFrame(nearFrame);
    nearFrame = requestAnimationFrame(() => {
      nearFrame = 0;
      const node = listing;
      if (!node) {
        return;
      }
      nearStart ??= frameObserver(null, {
        read: (entries) => {
          const target = entries.at(-1)?.target;
          nearStart?.unobserve(target as Element);
          if (target && scroller) {
            askOlder(
              scroller.getBoundingClientRect().top -
                target.getBoundingClientRect().top
            );
          }
        },
      });
      nearStart.observe(node);
    });
    return () => {
      cancelAnimationFrame(nearFrame);
      nearFrame = 0;
    };
  }
  onDestroy(() => nearStart?.disconnect());
  // What can bring the first rows near without a scroll: the list drawn, a
  // page landed with few rows in it, the pane coming on screen. Read in the
  // next frame, once virtua has moved the view by what the page added.
  $effect(() => {
    const store = paged();
    if (
      !(shown && visible && store?.cursor) ||
      store.hydrating ||
      store.loading ||
      store.olderFault
    ) {
      return;
    }
    track(rowCount);
    return askOlderInFrame();
  });

  /**
   * How tall the strip before the list stands (see the markup): the page
   * being read, or the one that could not be. The list starts under it, and
   * virtua is told so (`startMargin`).
   */
  let olderRoom = $state(0);
  /**
   * THE STRIP BEFORE THE LIST MOVES NOTHING. It comes and goes with the
   * cursor, and grows when a read fails — above every row, where a change of
   * height would push the whole conversation by as much. So the view moves
   * with it, in the resize itself, after the frame's layout and before its
   * paint: the rows on screen stand where they stood. At the tail the pin
   * does the same from the other end.
   */
  function keepPlace(node: HTMLElement) {
    // biome-ignore lint/style/noRestrictedGlobals: THE STRIP BEFORE THE LIST MOVES NOTHING: the view moves by the strip's growth after the frame's layout and before its paint, so the rows on screen never jump; deferred, a frame paints them pushed down
    const watch = new ResizeObserver(() => {
      const grew = node.offsetHeight - olderRoom;
      if (grew === 0) {
        return;
      }
      olderRoom = node.offsetHeight;
      flushSync();
      if (!(landed && scroller) || jumping) {
        return;
      }
      if (atBottom) {
        pinBottom();
        return;
      }
      scroller.scrollTop += grew;
      lastWrite = scroller.scrollTop;
    });
    watch.observe(node);
    return () => watch.disconnect();
  }

  /** The scroll height the last scroll event saw — what tells a clamp from a reader. */
  let lastHeight = 0;
  /**
   * THE READER'S SCROLL FOLLOWS THE READER'S INPUT. A scroll is theirs only
   * while their own input is under way — a wheel, a finger, a key that moves
   * the view, a mouse press (the scrollbar's, a selection dragged past an
   * edge) — and for `FLING_MS` after it ends, so a
   * fling's momentum and a key's smooth scroll are still theirs; each scroll
   * of theirs in that time holds it on. Any other scroll is the list's own
   * (virtua keeping the rows on screen where they stand while rows above
   * them measure), and moves nothing of the reader's. Told by where the rows
   * stand instead, an iPhone's landing let go of its place: virtua 0.53.4
   * there holds back its correction for rows measured above the view while
   * the view counts as scrolling, which the landing's own writes start
   * (`p() && 0 !== I ? b += t : S += t`), and writes it with `scrollBy` when
   * its 150ms scroll-end timer fires; while it is pending `getItemOffset`
   * subtracts it and `findItemIndex` does not, so the row read at the view's
   * top stood hundreds of pixels above it, and the correction's own scroll,
   * 172–252ms after the landing's last write, read as the reader's in 14 of
   * 20 landings (transcript-cold-load demo, WebKit at 390).
   */
  let inputOn = false;
  /** The timer that ends `inputOn` once the input has ended. */
  let inputOff: ReturnType<typeof setTimeout> | undefined;
  /** How long a scroll is still the reader's once their input ends, ms: a fling's momentum. Our own call. */
  const FLING_MS = 1000;
  function inputBegins(): void {
    clearTimeout(inputOff);
    inputOff = undefined;
    inputOn = true;
  }
  /** The input ended: what it scrolls is the reader's for `FLING_MS` more. */
  function inputEnds(): void {
    clearTimeout(inputOff);
    inputOff = setTimeout(() => {
      inputOn = false;
      inputOff = undefined;
    }, FLING_MS);
  }
  /** Keys that move the view: the scroll keys, and Tab bringing what it focuses into view. */
  const movesView = (key: string): boolean =>
    SCROLL_KEYS.has(key) || key === "Tab";
  /** The reader's input on the scroller, and on the page for keys and a press let go anywhere. */
  function readerInput(node: HTMLElement): () => void {
    const options = { passive: true } as const;
    const wheel = (): void => {
      inputBegins();
      inputEnds();
    };
    const touch = (): void => inputBegins();
    const lift = (event: TouchEvent): void => {
      if (event.touches.length === 0) {
        inputEnds();
      }
    };
    // A finger is read by its touch events: its pointer is cancelled as the
    // scroll takes it over, ahead of the scroll it makes.
    const press = (event: PointerEvent): void => {
      if (event.pointerType === "mouse") {
        inputBegins();
      }
    };
    const release = (event: PointerEvent): void => {
      if (event.pointerType === "mouse" && inputOn) {
        inputEnds();
      }
    };
    const key = (event: KeyboardEvent): void => {
      const target = event.target as Node | null;
      if (
        movesView(event.key) &&
        (target === document.body || node.contains(target))
      ) {
        inputBegins();
      }
    };
    const keyUp = (event: KeyboardEvent): void => {
      if (movesView(event.key) && inputOn) {
        inputEnds();
      }
    };
    node.addEventListener("wheel", wheel, options);
    node.addEventListener("touchstart", touch, options);
    node.addEventListener("touchmove", touch, options);
    node.addEventListener("touchend", lift, options);
    node.addEventListener("touchcancel", lift, options);
    node.addEventListener("pointerdown", press, options);
    addEventListener("pointerup", release, options);
    addEventListener("pointercancel", release, options);
    addEventListener("keydown", key, options);
    addEventListener("keyup", keyUp, options);
    return () => {
      clearTimeout(inputOff);
      node.removeEventListener("wheel", wheel);
      node.removeEventListener("touchstart", touch);
      node.removeEventListener("touchmove", touch);
      node.removeEventListener("touchend", lift);
      node.removeEventListener("touchcancel", lift);
      node.removeEventListener("pointerdown", press);
      removeEventListener("pointerup", release);
      removeEventListener("pointercancel", release);
      removeEventListener("keydown", key);
      removeEventListener("keyup", keyUp);
    };
  }
  /**
   * The frame a pane is shown in, from `visible` rising to the task after
   * that frame's rendering. The scroll event its scroller fires there (the
   * offset it was put away at, taken back as it is drawn) is read after the
   * frame, in that task (`onscroll`): read in the event, its offset, height
   * and boxes forced a style pass of their own ahead of the frame's (two
   * panes, a focus switch: "style 365 by" the handler before the frame's
   * 1089), and a switch restyled past what it shows. Nobody is scrolling a
   * pane in the frame it appears in, so every other scroll is read in its
   * event, where the reader's own scroll is told from this component's
   * writes before the next frame's follow can land over it.
   */
  let showing = false;
  /** The frame and the task a scroll held in a pane's showing frame is read in. */
  let heldFrame = 0;
  let heldTask: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    if (!visible) {
      return;
    }
    showing = true;
    let task: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      task = setTimeout(() => {
        showing = false;
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(task);
      showing = false;
    };
  });
  $effect(() => () => {
    cancelAnimationFrame(heldFrame);
    clearTimeout(heldTask);
  });
  /**
   * A scroll, as virtua's own scroll handler hands it on (its `onscroll`):
   * the offset it has just read off the scroller. That read is virtua's,
   * and it lays out whatever the tasks before the event wrote; read here
   * behind it, the scroller's height and boxes are that same layout, read
   * again for nothing. Read as the event's own listener instead, ahead of
   * virtua's, they were the read that laid it out (`readScroll`, Layout
   * 17.1ms in a 107ms task: a reply's long frames).
   */
  function onListScroll(offset: number): void {
    awayScroll = 0;
    if (aside.size > 0) {
      liftInView(offset);
    }
    if (!showing) {
      readScroll(offset);
      return;
    }
    if (heldFrame === 0) {
      heldFrame = requestAnimationFrame(() => {
        heldTask = setTimeout(() => {
          heldFrame = 0;
          readScroll(list?.getScrollOffset() ?? offset);
        });
      });
    }
  }
  /** What a scroll to `offset` did (`onListScroll`). */
  function readScroll(offset: number): void {
    if (!(scroller && list && landed)) {
      return;
    }
    lastTop = offset;
    giveRoomBack(scroller, offset);
    // A far landing's scroll: what it left and the screen above follow.
    if (narrow) {
      catchUpRest();
    }
    const height = scroller.scrollHeight;
    const shrank = height < lastHeight;
    lastHeight = height;
    listStart =
      (listing?.getBoundingClientRect().top ?? 0) -
      scroller.getBoundingClientRect().top +
      offset;
    // Until the reveal the list is laid out but not painted: nothing on it
    // is the reader's to have scrolled. virtua's own writes land here while
    // it measures the rows the store's read brings in — untagged, and at a
    // cold load on a phone one of them left 5,400px of tail under the
    // landing, read as the reader scrolling up, and the transcript opened
    // stranded there with the follow let go.
    if (!shown) {
      return;
    }
    // Wherever the view now is, and whoever moved it: near the first rows
    // held, the page before them is asked for.
    askOlder(lastTop - listStart);
    if (jumping) {
      jumpScrolled(scroller);
      return;
    }
    // Every write this component makes is tagged with the position it wrote.
    // An event that matches the tag is our OWN motion — the paced follow, or
    // the pin holding the bottom while a row opens — and says nothing about
    // where the reader is looking, even under their finger. Neither does the
    // browser clamping the offset because the content under it got shorter
    // (a tail row folding shut): that event comes with a smaller scroll
    // height and leaves the offset at its end. Nor does any scroll that
    // follows none of the reader's input (`inputOn`): virtua keeping the rows
    // on screen where they are while rows above them change size, measured
    // as they mount under a ride to the tail or a landing, a history chunk
    // put in front. Taken for the reader, one of those let go of the tail in
    // the middle of a returning pane's catch-up and left it 2,800px short for
    // good. A scroll their input makes is the READER: wheel, scrollbar drag,
    // keyboard, a finger, its momentum and its bounce.
    const clamped = shrank && offset >= height - scroller.clientHeight - 1;

    if (
      (lastWrite !== null && Math.abs(offset - lastWrite) <= 1) ||
      clamped ||
      !inputOn
    ) {
      return;
    }
    // A fling goes on after the finger lifts: each scroll of it holds on.
    if (inputOff !== undefined) {
      inputEnds();
    }
    // Each scroll taken for the reader's, for a probe to count (dev only).
    if (import.meta.env.DEV) {
      devNote("readerScrolls", { view: session.instanceId, top: offset });
    }
    readerMoved += 1;
    holdUntil = 0;
    keptPlace = placeAt(lastTop);
    stopFollow();
    // A row the reader scrolls to is not arriving, whenever it came in: what
    // is still waiting to mount is theirs to read, not ours to play.
    tickets.clear();
    if (marked?.state === "on" || unfound) {
      letGo();
    }
    // The reader's scroll has the screen until it comes to rest: nothing
    // writes the scroll offset under a finger, its momentum or its bounce,
    // however near the tail it moves. The tail is taken back at rest, and
    // only there (`onscrollend`).
    atBottom = false;
    const tail = tailTop(scroller);
    const distance = tail - offset;
    // Reaching the end marks where it stood; the reader is at the tail for
    // as long as they stay at or past that mark (into the parked room
    // included). Rows arriving while the scroll bounces off the end move the
    // end on, and the bounce settles short of it, at the end the reader
    // reached.
    if (distance <= TAIL_SLACK) {
      tailMark = tail;
    } else if (tailMark !== null && offset < tailMark - TAIL_SLACK) {
      tailMark = null;
    }
    restsAtTail = tailMark !== null;
    // Hysteresis: up past the far mark, and it stays until back at the tail.
    farFromLatest =
      !restsAtTail &&
      (farFromLatest || distance > FAR_FROM_LATEST * scroller.clientHeight);
  }

  /**
   * Where the reader's own scrolling last left the view, until it comes to
   * rest: at the tail, or away from it. Null once a rest has read it, and
   * while nothing of the reader's has moved the view since.
   */
  let restsAtTail: boolean | null = null;
  /** The offset of the end as it stood when the reader's scroll last reached it. */
  let tailMark: number | null = null;
  /** How far off the bottom still counts as the tail: a pixel's rounding. */
  const TAIL_SLACK = 1;

  /**
   * The scroll has come to rest. virtua says so 150ms after the last scroll
   * event, and never while a finger is on the screen, so a drag, the
   * momentum after it and the bounce at the end are one scroll. A reader
   * who comes to rest at the tail is following it again; anywhere else,
   * they stay where they are.
   */
  function onscrollend(): void {
    if (restsAtTail === null || jumping) {
      return;
    }
    const tail = restsAtTail;
    restsAtTail = null;
    tailMark = null;
    if (tail) {
      atBottom = true;
      farFromLatest = false;
      followBottom();
    }
  }

  /**
   * The tail is the scroller's own maximum, past the padding band under the
   * list, which is exactly the height of the composer column: the last row
   * fully in view, above the floating composer stack. (`scrollToIndex(…,
   * 'end')` seats the last row's foot on the VIEWPORT's foot, behind the
   * composer: virtua's box math stops at the list.)
   */
  /** The frame the next write to the tail is waiting for, and this
   *  component's LAST WRITE — the tag that tells its own scroll events from
   *  the reader's while their input is under way (`inputOn`). */
  let following: number | null = null;
  let landingFrame: number | null = null;
  // Null until the first write: a number here (it was -1) is within a pixel
  // of the top, and the reader's scroll to 0 read as our own write.
  let lastWrite: number | null = null;
  function stopFollow(): void {
    if (following !== null) {
      cancelAnimationFrame(following);
    }
    following = null;
  }

  /**
   * A PINNED TRANSCRIPT STAYS PINNED. While the reader is at the tail, the
   * tail is where the view is, every frame: what arrives there moves by its
   * own entrance (a row's reserve and cascade), not by the scroll. The
   * follow used to ride to a new tail over --dur-panel, which left every
   * landing up to 24px short for a quarter of a second — on 450 streamed
   * frames, 16 of them more than a pixel off. It yields to the reader in
   * `onscroll`: any scroll that moves what is on screen lets go.
   */
  /**
   * WHILE A ROW OPENS, ITS EDGE IS THE SCROLL.
   *
   * A tool call opens its own height (`Row`'s `open`), a reasoning block
   * folds, a failed send's reason unfolds: the bottom of the list moves on
   * every frame of the motion. virtua measures the row on every one of those
   * frames, so the pin (`onresize`, below) puts the view back in the frame
   * the row grew: the row's growth is what moves it. One motion, at the row's
   * own curve.
   */

  /**
   * THE TAIL IS THE LIST'S END, NOT THE SCROLLER'S. The parked room past the
   * end (an ask the composer grows into, an offer on its tray row) is room
   * the reader may scroll into, never a place the view is taken: at the
   * tail the last row stands on the foot whether a card is parked over it
   * or not, so a card parking or leaving moves no row (owner, a7443251: "it
   * shouldn't push the transcript up"; DESIGN.md, The Composer Layer Rule).
   * Read after the layout the scroll height has just forced, as laid out.
   */
  function tailTop(node: HTMLElement): number {
    const parked = parkedRoom?.getBoundingClientRect().height ?? 0;
    return node.scrollHeight - node.clientHeight - parked;
  }

  /**
   * A CARD THAT LEAVES TAKES NO ROOM FROM UNDER THE READER. The reader who
   * scrolled into the parked room (to read the last row over the card)
   * stands that far into it; the card going shrinks the room, and the
   * browser would clamp the view back up by the difference, moving every
   * row. So the room is held at where they stand (`heldRoom`) as the card
   * leaves, and given back only as they scroll out of it (`readScroll`): the
   * end moves with them, and nothing clamps.
   */
  let heldRoom = $state(0);
  const roomHeight = $derived(Math.max(parkedHeight, heldRoom));
  $effect.pre(() => {
    const next = parkedHeight;
    untrack(() => {
      if (!(scroller && parkedRoom)) {
        return;
      }
      if (next >= parkedRoom.getBoundingClientRect().height) {
        return;
      }
      const into = scroller.scrollTop - tailTop(scroller);
      heldRoom = into > next ? into : 0;
    });
  });
  /** A room held open under a reader gives itself back as they scroll out of it (to `offset`), never under them. */
  function giveRoomBack(node: HTMLElement, offset: number): void {
    if (heldRoom > 0) {
      const into = offset - tailTop(node);
      heldRoom = into > parkedHeight ? into : 0;
    }
  }

  /**
   * Pin the viewport to the bottom. Called from the list's own resize (see the
   * pin below), after virtua has laid the list out and before the frame is
   * painted, so the viewport and the opening row move on the same frame.
   */
  function pinBottom(): void {
    if (!scroller) {
      return;
    }
    const bottom = tailTop(scroller);
    // At the tail already, or past it in the parked room: where the view
    // stands is the pin's, and its scroll (the browser clamping a list that
    // got shorter under it) is told from the reader's by it (`lastWrite`).
    if (bottom - scroller.scrollTop <= 0.5) {
      lastWrite = scroller.scrollTop;
      return;
    }
    // Short of the tail, it is put there.
    const was = scroller.scrollTop;
    if (bottom - was > scroller.clientHeight) {
      // Drawn already: its rows are built first (`stageFar`), and the
      // pin lands once they are.
      if (list && shown && renderedRows.length > 0 && !stagedReady) {
        stageFar();
        return;
      }
      landFar(was);
    }
    scroller.scrollTop = bottom;
    lastWrite = scroller.scrollTop;
    // A send landing at the tail is carried through the pin. The pin runs
    // once the list has measured the row it drew, a frame after that row
    // was first drawn and its flight begun; lifted with the list in that
    // one frame, the flight lost most of its way on a phone, where the tail
    // sits right over the composer (33px of flight, 114px of jump on iOS).
    if (listing) {
      carry(listing, was - scroller.scrollTop);
      carrySlides(scroller.scrollTop - was);
    }
  }

  /** A thinking row opening or closing on the kit's reveal. */
  const isThinking = (event: Event): boolean =>
    !!(event.target as Element).closest('[data-slot="thinking-steps-content"]');

  /**
   * A disclosure the READER opens — a tool's body, a branch, a note — holds
   * its header where they clicked it and opens downward. Riding the bottom
   * through it scrolled the header they had just clicked off the top of the
   * view; so the transcript lets go of the tail instead, exactly as if they
   * had scrolled. A reasoning block folding shut is the transcript's own
   * motion, and keeps the pin.
   */
  function onrevealstart(event: Event): void {
    if (
      !isThinking(event) &&
      (event.target as Element).getAttribute("data-state") === "open"
    ) {
      stopFollow();
      tickets.clear();
      atBottom = false;
    }
  }

  $effect(() => {
    const node = scroller;
    if (!node) {
      return;
    }
    node.addEventListener("revealstart", onrevealstart);
    return () => {
      node.removeEventListener("revealstart", onrevealstart);
      if (landingFrame !== null) {
        cancelAnimationFrame(landingFrame);
      }
      clearTimeout(landingAway);
      landingAway = undefined;
      stopFollow();
    };
  });

  /**
   * Whether the tail is this transcript's to hold: landed at it, the reader
   * still there, no jump gliding to it. A pane being worked in holds it for
   * as long as the reader stays; a pane beside it (the grid) holds it only
   * until its list is first drawn — its landing, which no scroll of virtua's
   * chases for it any more — and from then on keeps where it stands while
   * its rows come in on the scheduler's turns, as it always has.
   */
  const pinned = (): boolean =>
    landed && atBottom && !jumping && (active || !shown);

  /**
   * A PANE PUT AWAY AT ITS TAIL IS LAID OUT AT ITS TAIL.
   *
   * Put away, a pane is skipped (PaneLeaf `.pane-hidden`): its rows are built
   * on the scheduler's turns but never measured, so nothing moves its view,
   * and minutes of a busy session leave the view it was put away at screens
   * above its end (2,400px after 3 min, tab-return 1b). Started by the
   * press, the far landing that distance makes (`stageFar`, `landFar`) ran
   * in front of the reader: each step's measurement pinned again in virtua's
   * observer, a layout forced behind the rows it had just flushed, 20ms a
   * frame for 300ms, and the landing's own frame 35ms. The reach lays the
   * pane out unseen first (warm.svelte.ts), and virtua measures its rows
   * there: the landing starts then, its steps out of sight, so the press
   * finds a pane at its tail holding the rows of that view. Only from
   * virtua's observer,
   * which a skipped pane never hears (Chromium delivers no ResizeObserver
   * entry inside `content-visibility: hidden`, and a scroll write there lays
   * the subtree out to land): a read of the page in a pane put away would lay
   * it out. And in a task of its own behind the frame that measured: that
   * frame already styles every element the pane holds.
   */
  const awayAtTail = (): boolean => landed && atBottom && !jumping && !visible;
  let landingAway: ReturnType<typeof setTimeout> | undefined;
  /** Steps a warming pane's staging waits for the away landing's scroll (`stageStep`); 0 once it has come. */
  let awayScroll = 0;
  function landAway(): void {
    landingAway ??= setTimeout(() => {
      landingAway = undefined;
      if (awayAtTail()) {
        const was = scroller?.scrollTop;
        if (keepWhole()) {
          flushSync();
        }
        pinBottom();
        if (scroller && scroller.scrollTop !== was) {
          awayScroll = 2;
        }
      }
    });
  }

  /**
   * THE PIN. While the reader is at the tail, the list getting taller is
   * followed, by this and nothing else: one writer of the tail's offset, in
   * the frame the list grew.
   *
   * A row growing (an answer streaming in, a row arriving, a row opening or
   * settling taller) and the scroller's own box changing (the window, the
   * composer column's clearance) are all measured by virtua's one
   * ResizeObserver, and virtua says so through `onresize` (virtua 0.53.2,
   * made for "stay at the bottom": inokawa/virtua#301, #408). That call comes
   * inside virtua's observer, after the frame's layout and before its paint.
   * The list's new height is still Svelte state there: the pin keeps the
   * list whole (`keepWhole`) and asks for the delivery after the layout
   * that state is written to (`pinNext`), where it reads the height the
   * frame will paint off that layout and writes the tail before the paint.
   * It used to flush the state into virtua's container in the call and read
   * the height there, which laid the page out under that flush's writes:
   * the rows it mounted styled inside the pin (`tailTop`, 10.1ms of style
   * in one reply frame at 4x CPU throttle). A row that flush mounts (the
   * range grown with the view) is observed at the next frame, not inside
   * the delivery (patches/virtua@0.53.4.patch): observed there, WebKit
   * reported "ResizeObserver loop completed with undelivered notifications"
   * as an ask left under a reader at the tail (composer-layers).
   *
   * It pins in the frame virtua measured in. It used to wait two microtasks: the landing
   * asked virtua to `scrollToIndex` the last row, and virtua aims such a
   * scroll again at every measurement, in a microtask it queues behind this
   * call, at the row that was last when it was asked, for as long as rows
   * measure under 150ms apart — the whole of a streamed reply. Pinned in the
   * call, that aim wrote after it every frame (the reply grew 1,500px under
   * the composer in 3 of 5 runs); pinned two microtasks later, the two wrote
   * every frame and the pin won by ordering. The landing is the pin's now
   * (`land`), so no scroll of virtua's is left aiming at the tail, and the
   * pin is the last write of the frame by being the only one.
   *
   * Nothing else writes the tail while it streams. A row taken out at the end
   * (a parked ask's call, a tail row that went) is the browser's: the list
   * gets shorter, and the offset is clamped to the new end. What that leaves
   * of a pixel is `keepWhole`'s (`wholeHeight`). The strip above the list is
   * `keepPlace`'s.
   */
  function onresize(): void {
    if (!pinned()) {
      if (awayAtTail()) {
        landAway();
      }
      return;
    }
    keepWhole();
    pinNext();
  }

  /**
   * THE PIN READS ON THE FRAME'S OWN LAYOUT. What the pin has to follow is
   * written by the flush behind the delivery that asked for it (virtua's
   * sizes, the spare), and the frame lays it out before it delivers again,
   * to every box deeper than the shallowest it has delivered. The pin's
   * mark (the markup, under the foot) is deeper than any row of the list, so
   * observed again here it is delivered in the frame's next round, on that
   * layout: the pin reads the tail there, with nothing to lay out, and its
   * write lands before the paint. Asked for outside a delivery (a flush in a
   * task), it is delivered in the next frame's first round.
   */
  let pinMark = $state<HTMLElement>();
  let pinSizes: FrameObserver | null = null;
  let pinAsked = false;
  function pinNext(): void {
    const mark = pinMark;
    if (!mark) {
      return;
    }
    pinAsked = true;
    pinSizes ??= frameObserver(null, {
      read: () => {
        if (!pinAsked) {
          return;
        }
        pinAsked = false;
        if (pinMark) {
          pinSizes?.unobserve(pinMark);
        }
        if (pinned()) {
          keepWhole();
          pinBottom();
        }
      },
    });
    pinSizes.observe(mark);
  }
  onDestroy(() => pinSizes?.disconnect());

  /**
   * THE REVEAL. A transcript opening draws its rows once, where they stay.
   *
   * virtua renders a row it has not measured yet under `visibility: hidden`,
   * at an estimated offset, and shows it the moment it is measured — at its
   * real offset, in the same frame as the landing's scroll. Chrome counts a
   * hidden box that moves and appears in one frame as a layout shift, from
   * wherever it was laid out while hidden: on a cold load that was the whole
   * tail jumping from the top of the list to its place (CLS 0.62 at 1440).
   *
   * So the list's own box stays unpainted until the transcript has landed
   * and every row in the viewport is drawn and measured, and is drawn a
   * frame later — any change to the rows in between starts the wait again —
   * so the frame that shows the rows is never the frame that moved them.
   * Meanwhile a cold load's rows stand on screen as the server drew them
   * (`servedRows`), and go in that frame. It waits for the newest page and for
   * nothing older — with one exception, the reader's own place (below).
   * What arrives after the reveal — a read again, an older page in front —
   * keeps the rows on screen measured and in place: see `frontOnly` and the
   * two steps in `build`.
   */
  $effect(() => {
    const node = scroller;
    const container = listing?.firstElementChild;
    // The newest page under way replaces these rows when they are the
    // server's stand-in for it (see `SessionPane`): the store's session takes
    // their place the moment its read is in, with the turn in flight on the
    // end. Drawn first, they would be moved under the reader.
    const store = cawco.session(session.instanceId);

    const reading =
      session.loading || (store !== null && store !== session && store.loading);
    track(asked);

    if (shown || reading || !(landed && node && container)) {
      return;
    }
    // THE READER'S PLACE IS READ BACK TO. A place kept at a row older than
    // the rows held (a reload far up: the first rows are the newest page) is
    // not given up for the tail: the pages before them are read, one at a
    // time, until one holds that row or the conversation's start is in hand,
    // and the list is drawn there. A page that cannot be read ends the
    // search: the list is drawn with what it holds, the failure said at its
    // top. Each page is asked for once the last one is in the rows searched:
    // a pane off screen builds its rows on its scheduler turn, and asking on
    // the page's landing alone read on past the place before it was looked for.
    const own = paged();
    if (resume && !resume.tail && anchorIndex() < 0) {
      // The place is looked for only among rows built from the store's
      // session as it stands: not while a build's second step is still to
      // come (`pending`) or the rows lag what the store holds, and not among
      // the server's stand-in rows once the store has rows to take their
      // place (`SessionPane`). Concluded not found there, the list was drawn
      // at another row with the place a moment from arriving above it
      // (transcript-holds, its reload legs).
      if (
        pending !== null ||
        untrack(printOf) !== builtPrint ||
        (store !== null && store !== session && store.messages.length > 0)
      ) {
        return;
      }
      if (own?.cursor && !own.olderFault) {
        if (!own.hydrating) {
          detach(
            untrack(() => readOlderPage(own.instanceId)),
            "untrack"
          );
        }
        return;
      }
    }
    let frame: number | null = null;
    /** This reveal is still the one being waited for. */
    let live = true;
    /**
     * Every row in the viewport is drawn and measured: virtua has rendered
     * the rows the scroll offset covers — they abut, with no gap, from the
     * top of the viewport down — and none of them is still hidden awaiting
     * its size.
     */
    const measured = (): boolean => {
      const view = node.getBoundingClientRect();
      const boxes: DOMRect[] = [];
      for (const item of container.children) {
        const box = item.getBoundingClientRect();
        if (box.bottom > view.top && box.top < view.bottom) {
          if ((item as HTMLElement).style.visibility === "hidden") {
            return false;
          }
          boxes.push(box);
        }
      }
      boxes.sort((a, b) => a.top - b.top);
      if (node.scrollTop > 0 && (boxes[0]?.top ?? view.bottom) > view.top + 1) {
        return false;
      }
      return boxes.every(
        (box, i) => i === 0 || box.top <= boxes[i - 1].bottom + 1
      );
    };
    // Measured in the next frame's callbacks, never in the task that
    // changed the rows (a tab switch landing a pane among them): reading
    // the rows there lays the page out mid-task. The callbacks run before
    // that frame's layout, so the rows are shown in the frame they are
    // found measured, as before.
    const wait = (): void => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
      frame = requestAnimationFrame(() => {
        frame = null;
        if (restore()) {
          wait();
          return;
        }
        if (!measured()) {
          return;
        }
        // A list that opens on a compaction is shown with Caw beside the
        // word, not a frame or two before him: it waits for his picture
        // (bounded, see `compactionMarkComing`), then measures again.
        const caw = renderedRows.some((row) => row.kind === "compaction")
          ? compactionMarkComing()
          : null;
        if (caw) {
          caw.then(() => {
            if (live) {
              wait();
            }
          });
          return;
        }
        drawAtLanding();
      });
    };
    const changes = new MutationObserver(wait);
    changes.observe(container, {
      attributes: true,
      attributeFilter: ["style"],
      childList: true,
      subtree: true,
    });
    wait();
    return () => {
      live = false;
      changes.disconnect();
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
    };
  });

  /**
   * The list drawn where its landing put it. A record asked for is said to
   * be reached (`arrived`); a place read back to stays the place while the
   * rows around it go on measuring (`holdPlace`): drawn at it, the list
   * moved off it by what the rows above measured to after the reveal.
   */
  function drawAtLanding(): void {
    const sought = resume && "at" in resume ? resume.at : null;
    const kept =
      resume && !resume.tail && "block" in resume
        ? { block: resume.block, into: resume.into }
        : null;
    resume = null;
    shown = true;
    if (sought !== null) {
      arrived(sought);
    }
    if (kept) {
      keptPlace = kept;
      holdUntil = performance.now() + LANDING_HOLD_MS;
      holdPlace();
    }
  }

  /**
   * Put the view at the tail in the next frame, before it paints: the
   * reader's own scroll came to rest there (`onscrollend`). Nothing is read
   * in the task that called it; the frame's callbacks read the scroller
   * anyway, before its layout.
   */
  function followBottom(): void {
    if (!scroller || following !== null) {
      return;
    }
    following = requestAnimationFrame(() => {
      following = null;
      if (atBottom) {
        pinBottom();
      }
    });
  }

  function land(): void {
    if (!landed) {
      // A place the rows do not hold yet — a reload's first rows are the
      // newest page — is read back to before the list is drawn (the reveal).
      // The tail is the pin's: put there now, at the rows' estimated sizes,
      // and put back on every measurement that follows (`onresize`) until the
      // list is drawn, focused or not (`pinned`).
      landed = true;
      if (anchorIndex() >= 0) {
        restore();
      } else {
        atBottom = true;
        pinBottom();
      }
      settle();
      return;
    }
    // Measured in the next frame's callbacks, never in the task that called
    // for the land: that can be a finger lifting off a switch between
    // groups, and reading the scroller there forced a layout into it. The
    // callbacks run before that frame's layout, so what they write is what
    // the frame paints.
    if (landingFrame !== null) {
      cancelAnimationFrame(landingFrame);
    }
    landingFrame = requestAnimationFrame(landInFrame);
    atBottom = true;
    farFromLatest = false;
  }

  /** The already-landed half of `land`, in the frame after it was called for. */
  function landInFrame(): void {
    landingFrame = null;
    // A tail far off — a tab back from a long absence, the jump back from far
    // up — lands at the rows' estimated sizes; the rows it lands among are
    // measured in that frame's layout, and the pin puts the view back on the
    // true end before the frame is painted (`onresize`).
    if (!(scroller && active && atBottom)) {
      return;
    }
    pinBottom();
    settle();
  }

  /** Fire `onlanded` once, the first time the transcript has content. */
  let landingTold = false;
  function settle(): void {
    if (landingTold) {
      return;
    }
    landingTold = true;
    onlanded?.();
  }

  // A conversation with nothing in it never lands — `land` needs a row to
  // scroll to — so the handshake would never be answered and a pane waiting on
  // it would hold an invisible transcript for good. An empty read that has
  // finished IS settled; say so.
  $effect(() => {
    if (session.loading || rows.length > 0) {
      return;
    }
    landed = true;
    settle();
  });

  // The landings: the first, once there are rows, and the pane coming back to
  // be worked in at the tail, once, as `active` rises — the rows it caught up
  // on while it was not were measured with no pin running (`pinned`), so it
  // is put on their end. Nothing else lands here: what grows the tail while
  // the reader is at it — a row, a streamed word, the composer column's
  // clearance — is the pin's, in the frame it grew (`onresize`). This effect
  // used to re-land on every row and every streamed frame, a frame behind
  // the pin, a second writer of the same offset.
  //
  // A landed pane depends on `active` alone, never on its rows or its
  // stream: an off-screen pane re-runs nothing as its session streams.
  $effect(() => {
    if (landed) {
      if (active && untrack(() => atBottom)) {
        detach(
          tick().then(() => {
            if (active && atBottom) {
              land();
            }
          }),
          "tick"
        );
      }
      return;
    }
    if (rows.length > 0) {
      detach(
        tick().then(() => {
          if (!landed) {
            land();
          }
        }),
        "tick"
      );
    }
  });

  /**
   * Which rows draw a rail, and which of them continue the one above.
   *
   * The rail is painted per row, because rows are virtualised siblings and
   * there is no element spanning a run to hang one line on. Consecutive rail
   * rows therefore have to abut and paint the continuation weight rather than
   * each restarting the head gradient — otherwise a run reads as a stack of
   * stubs, which is exactly how the in-flight tool looked against the
   * completed calls above it.
   */
  const NO_RAIL = new Set<Extract<Row, { kind: "single" }>["message"]["type"]>([
    "user",
    "assistant",
    "user.peer",
    "user.rule",
    "user.delegate_ask",
    "ui.command_output",
    "ui.error",
    "ui.session_error",
    "result.error",
  ]);

  /**
   * Read off what the row draws. The live row draws its reasoning block —
   * the rail's own head — for as long as it has no answer, the indicator
   * before any reasoning included: reading it off `thinking` flipped the
   * row's gap 14px in one frame as the first reasoning arrived, and every row
   * above jumped.
   */
  function railLed(row: Row): boolean {
    if (row.kind === "single") {
      return !NO_RAIL.has(row.message.type);
    }

    return (
      row.kind === "tools" ||
      row.kind === "harness" ||
      row.kind === "thinking" ||
      (row.kind === "live" && !row.text) ||
      row.kind === "livetool" ||
      row.kind === "subagent" ||
      row.kind === "delegate" ||
      row.kind === "connect"
    );
  }

  /**
   * A row the ledger emits but never paints: a successful result, an assistant
   * frame that carried nothing but a tool call, a thinking block with no text.
   * `MessageRow` renders nothing for these, so they stand between two rail rows
   * at zero height — adjacent on screen, one apart in the list. Reading the
   * list literally is why a run of tool calls kept drawing its line in
   * disconnected stubs.
   */
  function unpainted(row: Row): boolean {
    if (row.kind !== "single") {
      return false;
    }
    const m = row.message;
    if (m.type === "result.success") {
      return true;
    }

    return (
      (m.type === "assistant" || m.type === "thinking") && !m.content.trim()
    );
  }

  /**
   * Keys of rows whose line is the same line as the row above them ON SCREEN
   * — read off the rows drawn, so a row folding shut keeps its gap, and the
   * rows around it theirs, until it is gone.
   */
  const continued = $derived.by((): Keys => {
    const rowList = renderedRows;
    const { settled } = presentation;
    return untrack(() => {
      const before = settledContinued(settled);
      const after = continuesAbove(rowList, settled.length);
      return { has: (key) => before.has(key) || after.has(key) };
    });
  });
  const settledContinued = perSettled((settled) => continuesAbove(settled, 1));

  /** The keys of `rowList`'s rows from `from` on that continue the line above them. */
  function continuesAbove(rowList: Row[], from: number): Set<string> {
    const keys = new Set<string>();
    for (let i = Math.max(1, from); i < rowList.length; i += 1) {
      if (!railLed(rowList[i])) {
        continue;
      }
      let above = i - 1;
      while (above >= 0 && unpainted(rowList[above])) {
        above -= 1;
      }
      if (above >= 0 && railLed(rowList[above])) {
        keys.add(rowList[i].key);
      }
    }
    return keys;
  }

  // ── Arrivals ────────────────────────────────────────────────────────────
  // The rule and why it is read from data live in `arrivals.svelte.ts`. This
  // is where it runs: once per build, over every id the build holds.

  function ledger(fold: Fold): void {
    const live = session.messages === lastArray;
    lastArray = session.messages;
    const open = seeded && untrack(() => watched);
    seeded = true;
    const fresh = unheld(fold.rows);
    if (!open) {
      tickets.clear();
      return;
    }
    let slot = 0;
    // The calls whose glance the last build drew: each is that glance, landed.
    // A glance is a tail row (`tailStart`): only the tail is read.
    const glanced = new Set(
      frozen
        .slice(tailStart(frozen))
        .flatMap((row) => (row.kind === "livetool" ? [row.glance.toolId] : []))
    );
    for (const { id, row } of fresh) {
      if (!(live || LIVE_KINDS.has(row.kind))) {
        continue;
      }
      if (row.kind === "tools" && wasGlanced(row, id, glanced)) {
        continue;
      }
      const ticket = ticketFor(row, fold.ended, slot);
      tickets.set(id, ticket);
      slot += ticket.kind === "arrive" ? 1 : 0;
    }
  }

  /**
   * Whether the call `id` in this run is one the reader already had on screen
   * as its glance: its line opened then, and this is that line settling.
   */
  function wasGlanced(
    row: Extract<Row, { kind: "tools" }>,
    id: string,
    glanced: Set<string>
  ): boolean {
    return row.messages.some(
      (m) =>
        callId(m) === id &&
        glanced.has(m.metadata?.toolId ?? m.toolCallId ?? "")
    );
  }

  /** The ids this build holds that this view never has — recorded as held now. */
  function unheld(candidates: Row[]): { id: string; row: Row }[] {
    const fresh: { id: string; row: Row }[] = [];
    for (const row of candidates) {
      if (recorded.has(row)) {
        continue;
      }
      recorded.add(row);
      for (const id of idsOf(row)) {
        if (!known.has(id)) {
          known.add(id);
          fresh.push({ id, row });
        }
      }
    }
    return fresh;
  }

  /**
   * What a new row gets. Reasoning settling into its own row is the same
   * object, so it does not arrive: it folds shut from where it was open. An
   * answer settles under the live row's own key, so it is never new.
   * Everything else arrives in its place in the burst.
   */
  function ticketFor(row: Row, ended: Fold["ended"], slot: number): Ticket {
    if (row.key === ended?.into) {
      return { kind: "fold" };
    }
    return {
      kind: "arrive",
      lead: Math.min(slot, STAGGER_ROWS - 1) * STAGGER_MS,
      start: null,
    };
  }

  /** How a row arrives, by what it is. */
  function motionOf(row: Row): Motion {
    // The reader's own message, sent from the composer below, is its text
    // landing from the field in the one row the send drew, keyed by the
    // message's id: no entrance of the row's own.
    if (
      ((row.kind === "single" && row.message.type === "user") ||
        row.kind === "queued") &&
      waiting(`sent:${row.message.id}`)
    ) {
      return "emerge";
    }
    return "draw";
  }

  provideLedger({
    take(id) {
      const ticket = tickets.get(id) ?? null;
      if (ticket && ticket.kind !== "arrive") {
        tickets.delete(id);
      } else if (ticket && ticket.start === null) {
        ticket.start = document.timeline.currentTime as number;
      }
      return ticket;
    },
    done(id) {
      tickets.delete(id);
    },
    get watched() {
      return watched;
    },
  });

  /** Within this many screens of the tail the jump scrolls there smoothly;
      past it, it lands at once. Our own call, no source sets it. */
  const JUMP_SMOOTH_SCREENS = 3;
  /** Keys that scroll the transcript: pressed during a jump, they are the reader's. */
  const SCROLL_KEYS = new Set([
    "PageUp",
    "PageDown",
    "ArrowUp",
    "ArrowDown",
    "Home",
    "End",
    " ",
  ]);
  /**
   * The jump's scroll is under way. Its scroll events are not the reader's,
   * and `atBottom` stays false until it ends so that no follow or landing
   * writes over it: a `scrollTop` write stops a smooth scroll where it is.
   */
  let jumping = false;
  /** Where the jump's smooth scroll was sent. */
  let jumpTarget: number | null = null;

  /**
   * Back to the newest row, from wherever the reader is: one smooth scroll
   * to the tail when it is within `JUMP_SMOOTH_SCREENS`, otherwise — or
   * under reduced motion — an instant landing there. Arriving pins the true
   * tail (`jumpScrolled`). The reader's own input takes the scroll back.
   */
  function jump(): void {
    tickets.clear();
    farFromLatest = false;
    const node = scroller;
    if (!(
      node &&
      motionOk.current &&
      tailTop(node) - node.scrollTop <= JUMP_SMOOTH_SCREENS * node.clientHeight
    )) {
      // Landed in the click itself, not in `land`'s next frame: a re-armed
      // `land` (the rows effect) can push that frame back one more.
      atBottom = true;
      landInFrame();
      return;
    }
    stopFollow();
    restsAtTail = null;
    tailMark = null;
    jumping = true;
    node.addEventListener("wheel", yieldJump, { passive: true });
    node.addEventListener("touchstart", yieldJump, { passive: true });
    node.addEventListener("pointerdown", yieldJump);
    node.addEventListener("keydown", yieldKey);
    glide();
  }

  /** One smooth scroll to the bottom as it stands now. */
  function glide(): void {
    const node = scroller;
    if (!(jumping && node)) {
      return;
    }
    const bottom = tailTop(node);
    if (bottom - node.scrollTop <= 1) {
      arrive();
      return;
    }
    jumpTarget = bottom;
    node.scrollTo({ top: bottom, behavior: "smooth" });
  }

  /**
   * A scroll event of the jump's: arrived once it reaches the target it was
   * sent to, or the bottom when the rows shrank under it. Rows that grew the
   * bottom past the target while it scrolled get one more smooth scroll.
   */
  function jumpScrolled(node: HTMLElement): void {
    if (jumpTarget === null) {
      return;
    }
    const bottom = tailTop(node);
    const top = node.scrollTop;
    if (Math.abs(top - jumpTarget) > 1 && top < bottom - 1) {
      return;
    }
    if (bottom - top > 1) {
      glide();
      return;
    }
    arrive();
  }

  /** The jump is over: at the latest row, pinned there. */
  function arrive(): void {
    endJump();
    atBottom = true;
    farFromLatest = false;
    pinBottom();
  }

  function endJump(): void {
    jumping = false;
    jumpTarget = null;
    scroller?.removeEventListener("wheel", yieldJump);
    scroller?.removeEventListener("touchstart", yieldJump);
    scroller?.removeEventListener("pointerdown", yieldJump);
    scroller?.removeEventListener("keydown", yieldKey);
  }

  /**
   * The reader's own input during a jump: the jump lets go where the view
   * is, and the reader's next scroll decides `atBottom` and the button.
   * The write stops a smooth scroll a click would not; it is untagged, so
   * its event is read as the reader's.
   */
  function yieldJump(): void {
    endJump();
    scroller?.scrollTo({ top: scroller.scrollTop, behavior: "instant" });
  }

  function yieldKey(event: KeyboardEvent): void {
    if (SCROLL_KEYS.has(event.key)) {
      yieldJump();
    }
  }

  const showLatest = $derived(landed && farFromLatest && rows.length > 0);

  // ── The live region ─────────────────────────────────────────────────────
  // The scroll container is NOT the live region. virtua mounts and unmounts
  // rows as they cross the viewport, so `aria-live` on it re-reads history the
  // moment the operator scrolls, and re-reads the streaming turn on every token.
  // Instead: rows the transcript has not announced before, once it has landed
  // and is being read, get one coarse sentence each.

  /**
   * What identifies a row for announcement purposes. The streaming rows are
   * deliberately unannounceable — their text arrives token by token, and a live
   * region fed from it is a stutter. The settled `single` row the turn becomes
   * is what says "replied". The in-flight tool is keyed by its call id rather
   * than its row key, which virtua reuses for every tool in turn.
   */
  function announceKeyOf(row: Row): string {
    if (
      row.kind === "stream" ||
      row.kind === "thinking" ||
      row.kind === "live"
    ) {
      return "";
    }
    // A harness notification is plumbing the operator never asked for. It is
    // worth a line on the rail and nothing at all in the ear.
    if (row.kind === "harness") {
      return "";
    }
    // Nor a queued message: the operator just sent it. Reading their own words
    // back to them, then again when the session starts on them, is noise.
    if (row.kind === "queued") {
      return "";
    }
    if (row.kind === "livetool") {
      return `livetool:${row.glance.toolId}`;
    }
    return row.key;
  }

  /**
   * The whole announceable vocabulary, and it is five phrases long. A row that
   * maps to nothing says nothing — a settled tool run, a prepended history
   * chunk and the operator's own message are all visible on a surface the
   * operator is looking at.
   */
  function phraseOf(row: Row): string {
    if (row.kind === "single") {
      // The operator's own message needs no reading back to them.
      return row.message.type === "user" ? "" : "Agent replied";
    }
    if (row.kind === "livetool") {
      return `${row.glance.name} running`;
    }
    return "";
  }

  /** What the polite region currently holds. Replaced, never appended to. */
  let announcement = $state("");
  const announced = new Set<string>();

  $effect(() => {
    // Before the transcript lands, everything on it is history, not an arrival.
    // A pane that is off screen is the same case twice over: it has no business
    // speaking about a surface the reader cannot see, and its rows are frozen
    // anyway. Both branches still SEED `announced`, so coming back to a tab
    // announces what arrived while it was away exactly once, rather than
    // re-reading the whole transcript. An older page put in front is history
    // too, however long the pane has been read.
    if (!(landed && active) || built.shifted) {
      for (const r of rows) {
        announced.add(announceKeyOf(r));
      }
      return;
    }
    let phrase = "";
    for (const r of rows) {
      const key = announceKeyOf(r);
      if (!key || announced.has(key)) {
        continue;
      }
      announced.add(key);
      const said = phraseOf(r);
      if (said) {
        phrase = said;
      }
    }
    // A batch that lands in one frame says only its last line: three sentences
    // read back-to-back is the spam this region exists to stop.
    if (phrase) {
      announcement = phrase;
    }
  });

  // The end of a turn is a state change, not a row: the last thing the agent
  // said may have landed several frames before it stopped working. `busy`
  // falling is the only honest signal for it.
  // `busy` is still TRACKED off screen — it flips once a turn, not once a
  // frame, so it costs nothing — but only a pane on screen says so out loud.
  // Following it either way is what keeps `wasBusy` honest: dropping the
  // bookkeeping while hidden would make the next switch announce a turn that
  // finished minutes ago.
  // A finished chip pressed while its delegate's report is off screen: the
  // report comes into view (and the chip, seeing it, flies there).
  $effect(() => {
    const want = trayReveal.get(session.instanceId);
    if (!(want && active)) {
      return;
    }
    untrack(() => {
      trayReveal.delete(session.instanceId);
      const index = renderedRows.findIndex(
        (row) => row.kind === "single" && row.message.id === want
      );
      if (index >= 0) {
        list?.scrollToIndex(index, { align: "center", smooth: true });
      }
    });
  });

  // The "1 needs you" chip pressed: the open connect card comes into view,
  // and its Connect takes the keys once it is drawn there.
  $effect(() => {
    if (!(connectReveal.has(session.instanceId) && active)) {
      return;
    }
    untrack(() => {
      connectReveal.delete(session.instanceId);
      const index = renderedRows.findLastIndex(
        (row) => row.kind === "connect" && row.answer === null
      );
      if (index < 0) {
        return;
      }
      list?.scrollToIndex(index, { align: "center", smooth: true });
      const { key } = renderedRows[index];
      requestAnimationFrame(() => {
        document
          .querySelector(`[data-row="${CSS.escape(key)}"]`)
          ?.querySelector<HTMLElement>("[data-connect]")
          ?.focus({ preventScroll: true });
      });
    });
  });

  // The delegate tray's news: a delegate started, finished or failed (polite),
  // or has a question for the reader (assertive, cleared once it is said).
  let trayAlert = $state("");
  $effect(() => {
    const news = trayNews.get(session.instanceId);
    if (!(news && active && landed)) {
      return;
    }
    untrack(() => {
      if (news.polite) {
        announcement = news.polite;
      }
      trayAlert = news.assertive;
    });
    if (news.assertive) {
      const clear = setTimeout(() => {
        trayAlert = "";
      }, 5000);
      return () => clearTimeout(clear);
    }
  });

  let wasBusy = false;
  $effect(() => {
    const { busy } = session;
    if (active && landed && wasBusy && !busy) {
      announcement = "Turn finished";
    }
    wasBusy = busy;
  });

  /**
   * The blocked-on-you line, which interrupts: it is the one state where the
   * run has stopped and only the operator can restart it. Empty otherwise, so
   * clearing the block does not itself announce anything.
   */
  const blockedNote = $derived.by(() => {
    if (!landed) {
      return "";
    }
    if (session.pending.length > 0) {
      return "Agent needs your permission";
    }
    if (rows.at(-1)?.kind === "question") {
      return `Question from ${agentName}`;
    }
    return "";
  });

  /**
   * Why a read again over these rows failed; null while the transcript is
   * caught up. Only over rows drawn: with none, the pane says why in their
   * place.
   */
  const behind = $derived(
    renderedRows.length > 0
      ? (cawco.session(session.instanceId)?.behind ?? null)
      : null
  );
</script>

<!-- One row's content, as the list draws it and as the server's first
     screen stands it in (`servedRows`): `ticket` is the row's arrival or fold
     (`Row`), and `announce` whether a live row speaks (only the list's). -->
{#snippet rowBody(row: Row, ticket: Ticket | null, announce: boolean)}
  <!-- The live row, and the answer it streamed once that has
       landed (rows.ts `keepLive`): one branch, so the settle is
       the same LiveRow updating, not a MessageRow mounting. -->
  {#if row.kind === "live" || (row.kind === "single" && row.streamed)}
    <LiveRow {agentName} {announce} {row} />
  {:else if row.kind === "single" || row.kind === "queued"}
    <MessageRow
      {agentName}
      folding={ticket?.kind === "fold"}
      grouped={row.grouped}
      message={row.message}
      runsOn={runsOn.has(row.key)}
    />
  {:else if row.kind === "tools"}
    <ToolGroup messages={row.messages} />
  {:else if row.kind === "question"}
    <QuestionCard asker={agentName} message={row.message} />
  {:else if row.kind === "connect"}
    <ConnectCard
      answer={row.answer}
      asker={agentName}
      instanceId={session.instanceId}
      message={row.message}
    />
  {:else if row.kind === "harness"}
    <SystemLine
      disclosed={disclosureAt(session.instanceId, row.key)}
      harness={row.note}
    />
  {:else if row.kind === "compaction"}
    <CompactionDivider
      lead={ticket?.kind === "arrive" ? ticket.lead : null}
      {row}
    />
  {:else if row.kind === "account"}
    <AccountMoveDivider
      {row}
      stop={stop?.key === row.key ? stop.words : undefined}
    />
  {:else if row.kind === "notices"}
    <NoticeRun {row} />
  {:else if row.kind === "subagent"}
    <Subagent branch={row.branch} spawn={row.spawn} />
  {:else if row.kind === "delegate"}
    <Delegate message={row.message} />
  {:else if row.kind === "thinking"}
    <Thinking live={row.live} text={row.text} />
  {:else if row.kind === "livetool"}
    {@const d = describeTool(row.glance.name, undefined, undefined, "pending")}
    {@const LiveIcon = d.icon}
    <!-- The in-flight tool is a rail row on the same columns as the
         calls it becomes (app.css `.rail-row`, `.rail-line`): one
         line, at the transcript's line height. No colour on the
         glyph: the tool family's `text-tool-*` tint governs it, the
         generic case inheriting the row's strong ink. -->
    <div
      data-tx-rail
      data-slot="livetool"
      class="min-h-(--tx-line) coarse:min-h-(--tx-line-touch) text-size-label font-medium text-ink-strong rail-row rail-line"
    >
      <span data-slot="rail-cell" class="rail-cell {d.color}"
        ><LiveIcon class="size-icon-md" /></span
      >
      <!-- The same anatomy the settled ToolGroup row has: the
           descriptor's verb, then the mono argument, the verb
           omitted where the object is the whole sentence. Printing
           `glance.name` here and `d.label` once it settled changed
           the call's vocabulary the instant it completed. -->
      {#if d.label}
        <span
          class="font-medium text-ink-strong flex-initial min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
          >{d.label}</span
        >
      {/if}
      <!-- The argument gives way first (ToolGroup's row). -->
      <span
        class="font-(family-name:--font-mono) text-ink-muted overflow-clip text-ellipsis whitespace-nowrap min-w-0 flex-1"
        >{row.glance.glance}</span
      >
    </div>
  {/if}
{/snippet}

<!-- Off-screen, and the only thing on this surface that speaks. Two channels:
     what just arrived (polite, queued behind the reader), and what is blocking
     (assertive, because the run has stopped). -->
<p
  aria-atomic="true"
  aria-live="polite"
  class="sr-only border-none border-current"
  role="status"
>
  {announcement}
</p>
<p
  aria-atomic="true"
  aria-live="assertive"
  class="sr-only border-none border-current"
>
  {blockedNote || trayAlert}
</p>

<!-- Asymmetric content padding is the DESIGN.md ledger signature: inline
     start --space-7 (25), inline end --space-6 (21). The foot's height
     (`.foot`), which what floats over it stands on, is --foot-room. What
     scrolls here is its own stacking context, so nothing in it (a row's
     raised mark, a card's z-index) rises over the pane's fades (FootFade,
     HeadFade): every child but the dock is isolated. The view is kept in
     place by this component alone (`keepPlace`, and virtua inside its
     list): a browser that anchors scrolling moved it a second time for the
     strip before the list. Its scroll drives the pane's head blur
     (HeadFade), which the pane brings in scope with `timeline-scope`. -->
<div
  data-tx-columns
  data-slot="tr"
  aria-label={transcriptWords.transcript}
  style:--foot-room={FOOT_ROOM}
  class="flex-auto overflow-y-auto anchor-none scroll-timeline-transcript-head py-0 ps-space-7 pe-space-6 max-desk:ps-space-5 max-desk:pe-space-5 min-h-0 relative tx-columns"
  role="log"
  bind:this={scroller}
  {@attach measureView}
  {@attach readerInput}
>
  <!-- Empty is what is drawn: a conversation whose one row is folding away
       as its retry comes in is not empty for the frame between the two, and
       the empty state shown there pushed the fold 53px down. -->
  {#if (session.loading || session.cursor !== null) && renderedRows.length === 0}
    <p
      data-slot="transcript-empty"
      class="mark-line isolate flex items-center gap-space-2 text-size-meta font-normal text-ink-muted py-space-5"
    >
      <LiveDot /><span>Loading transcript…</span>
    </p>
  {:else if renderedRows.length === 0 && !bare}
    <!-- Only once the read has said the conversation is empty, fading in
         where it stands. The two keys that do anything from the composer
         below. Left-aligned: this surface is a ledger. -->
    <div class="isolate" in:crossIn>
      <!-- Its one action starts the work (DESIGN.md, The Empty Starts Work
           Rule, a session's own case): its own agent asked, in this
           session's composer, unsent; with no composer standing, the New
           Session form in its folder with the same words. -->
      <EmptyState
        icon={IconChat}
        line={EMPTY_LINES.transcript}
        title="No messages yet"
      >
        {#snippet action()}
          <EmptyAsk
            label={firstAskLabel(session.harness)}
            onask={(anchor) =>
              askFirst(
                session.instanceId,
                paneDrafts.has(session.instanceId),
                anchor
              )}
          />
        {/snippet}
      </EmptyState>
    </div>
  {/if}

  <!-- What is before the first row, while there is a page before it: the
       transcript's loading row, or — that page could not be read — why, and
       the way to ask for it again. The reader sees it only at the very top
       of the rows held; a page is asked for a viewport before that. -->
  <!-- The failed line's button stands off the first row by the line's own
       block padding. -->
  <div class="isolate has-data-retry:pb-space-5" {@attach keepPlace}>
    {#if renderedRows.length > 0 && session.olderFault}
      <p
        data-slot="transcript-empty"
        class="text-size-meta font-normal text-ink-muted py-space-5"
      >
        {#if session.olderFault.reason !== "offline"}
          The turns before these couldn't be read:
        {:else if reconnectingNow(session.olderFault)}
          This machine is reconnecting:
        {:else}
          This machine is offline:
        {/if}
        {faultMessage(session.olderFault)}
      </p>
      <Button
        data-retry
        onclick={() => readOlderPage(session.instanceId)}
        size="sm"
        variant="outline"
      >
        {commonWords.tryAgain}
      </Button>
    {:else if renderedRows.length > 0 && built.before}
      <p
        data-slot="transcript-empty"
        class="mark-line flex items-center gap-space-2 text-size-meta font-normal text-ink-muted py-space-5"
      >
        <LiveDot /><span>Loading transcript…</span>
      </p>
    {/if}
  </div>

  <!-- The list's own box: what the pin reads virtua's container off. The
       reader's chosen message (its strip holding the keyboard's focus, its
       edit open, its sheet open) wears the selection pill under its well, in
       the well's four corners (MessageRow, Well; The Concentric Rule), and
       the pill glides to the next one chosen. No ghost: under the pointer a
       message shows its strip. -->
  <!-- Its rows take the pointer while the list scrolls: virtua sets
       `pointer-events: none` on its container whenever it reads the
       scroller as scrolling (Virtualizer.svelte `isScrolling`), and this
       scroller is moved by the reader and by the tail's follow alike, so
       while a turn grew under a reader at the tail every row's link and
       button (a review card's Open and More, a message's pictures) went
       dead. Only what set itself `pointer-events-auto` answered. -->
  <div
    data-transcript-shown={shown || undefined}
    data-slot="listing"
    data-shown={shown || undefined}
    class="isolate not-data-shown:invisible *:pointer-events-auto!"
    bind:this={listing}
    style:padding-top={spare ? `${spare}px` : undefined}
    {@attach wholeHeight}
    {@attach highlight({
      rows: '[data-slot="well"]',
      selected: '[data-slot="well"][data-selected]',
      ghost: false,
    })}
  >
    <Virtualizer
      bufferSize={buffer}
      {cache}
      data={renderedRows}
      getKey={(r) => r.key}
      itemProps={itemAttrs}
      itemSize={ROW_ESTIMATE}
      {keepMounted}
      onscroll={onListScroll}
      {onresize}
      {onscrollend}
      scrollRef={scroller}
      shift={presentation.shifted}
      startMargin={olderRoom + spare}
      bind:this={
        () => list,
        (value) => {
          list = value as unknown as VirtualizerHandle;
        }
      }
    >
      {#snippet children(row)}
        <TranscriptRow
          continues={continued.has(row.key)}
          handoff={presentation.handed.get(row.key)}
          heightOf={heightOfRow}
          id={row.kind === "tools" ? undefined : row.key}
          leaving={presentation.leaving.has(row.key)}
          marked={marked?.key === row.key ? marked.state : undefined}
          measured={measureRow}
          motion={motionOf(row)}
          onleft={leaver(row.key)}
          rowKey={row.key}
        >
          {#snippet children(ticket)}
            {@render rowBody(row, ticket, active)}
          {/snippet}
        </TranscriptRow>
      {/snippet}
    </Virtualizer>
  </div>
  <!-- Room past the end for what rises past the composer (the ask it grows
       into, an offer on its tray row), which stands over the transcript's
       foot and never pushes it (owner, a7443251: "it
       shouldn't push the transcript up"). It moves nothing where the reader
       is: the tail's pin follows the list and the rows, not this, so the
       view holds still as a card parks, and the reader can scroll on to the
       last row, clear above it. -->
  <div
    aria-hidden="true"
    class="isolate invisible h-(--parked-room) pointer-events-none"
    style:--parked-room="{roomHeight}px"
    bind:this={parkedRoom}
  ></div>
  <!-- The foot clears the composer's standing box: the pill at one line, the
       delegate tray's row and the suggestion row on it. `--composer-clearance`
       is that box plus its offsets, set by the pane from the composer's own
       tokens; the old fixed reserve is the floor. A box in the flow rather
       than the scroller's padding: virtua takes the scroller's content box
       for its view. -->
  <div
    data-slot="foot"
    aria-hidden="true"
    class="isolate invisible h-(--foot-room) pointer-events-none"
    bind:this={foot}
  >
    <!-- The pin's mark (`pinNext`): a pixel, deeper than any row of the
         list, so it reports in the round after the one a row's resize is
         delivered in. -->
    <span class="block size-px"
      ><span class="block size-px"
        ><span class="block size-px"
          ><span class="block size-px"
            ><span class="block size-px" bind:this={pinMark}></span></span
          ></span
        ></span
      ></span
    >
  </div>
  <!-- Floating above the composer column, at zero height in the flow, so
       nothing here coming or going moves a row: the catch-up, from the switch
       until it has appended, and — scrolled away from the tail — the way back.
       Where it rests, up from the scroller's foot, is the pane's to say
       (`--latest-inset`): a thread keeps the room Caw's rise takes above its
       composer; elsewhere it stands at the top of the composer's clearance
       (the foot room less the composer's own dock gap, where the last row
       ends at the tail), and over what rises past it (`--parked-room`):
       never under an ask. A sticky box's inset is measured from the
       scrollport's foot, so the foot room is counted once. Over the pane's
       foot fade (FootFade), which only the rows pass under. A column hung
       up from the foot: what overflows its zero height goes up, the pills
       at the bottom and the not-caught-up line over them. -->
  <div
    data-slot="dock"
    class="sticky z-2 bottom-(--dock-bottom) h-0 flex flex-col justify-box-end items-center gap-space-2 pointer-events-none"
    style:--latest-inset={latestInset}
    style:--parked-room="{parkedHeight}px"
    style:--dock-bottom={"var(--latest-inset, calc(var(--foot-room) - var(--space-4) + var(--parked-room, 0px)))"}
  >
    <!-- The line over the pills, as on iOS: a phone gives it the whole width. -->
    {#if behind}
      <Behind
        fault={behind}
        floating
        onretry={() => readTranscript(session.instanceId, "retry")}
      />
    {/if}
    <!-- The record this was opened at is not here: shown where the reader
         landed instead, until they move on. Heard once through the polite
         region above (`arrived`), so this line is no live region itself. -->
    {#if unfound}
      <!-- The dock's raised line, as the not-caught-up line floats (Behind). -->
      <p
        class="max-w-full py-space-2 px-space-3 border border-border-hairline rounded-md bg-surface-raised shadow-overlay text-size-meta font-normal text-ink-muted text-center text-balance"
        data-open-at={unfound}
        in:rise={"--dur-panel"}
        out:rise={"--dur-exit"}
      >
        {unfoundWords}
      </p>
    {/if}
    {#if catching || showLatest}
      <div class="flex justify-center items-box-end gap-space-2">
        {#if catching}
          <CatchUp />
        {/if}
        {#if showLatest}
          <Latest onjump={jump} />
        {/if}
      </div>
    {/if}
  </div>
</div>

<!-- The server's first screen (`servedRows`), in the scroller's box (the
     transcript area's, as the pane's placeholder takes it) and in its
     geometry: the ledger's gutters and columns, the strip before the rows,
     the rows as the list draws them, and the foot they stand on at the tail
     (`tailTop`: the parked room is past the tail, never under it), standing
     on its bottom edge. A reversed column scrolls from its end, so it opens
     on its last row with the scroll bar the list will have, if any. It goes
     in the frame the list is drawn. -->
{#if servedRows}
  <div
    data-slot="first-screen"
    style:--foot-room={FOOT_ROOM}
    class="absolute inset-0 isolate flex flex-col-reverse overflow-y-auto anchor-none ps-space-7 pe-space-6 max-desk:ps-space-5 max-desk:pe-space-5 tx-columns"
  >
    <div>
      {#if built.before}
        <div class="isolate">
          <p
            data-slot="transcript-empty"
            class="mark-line flex items-center gap-space-2 text-size-meta font-normal text-ink-muted py-space-5"
          >
            <LiveDot /><span>Loading transcript…</span>
          </p>
        </div>
      {/if}
      <div class="isolate">
        {#each renderedRows as row (row.key)}
          <TranscriptRow continues={continued.has(row.key)}>
            {#snippet children()}
              {@render rowBody(row, null, false)}
            {/snippet}
          </TranscriptRow>
        {/each}
      </div>
      <div aria-hidden="true" class="isolate h-(--foot-room)"></div>
    </div>
  </div>
{/if}
