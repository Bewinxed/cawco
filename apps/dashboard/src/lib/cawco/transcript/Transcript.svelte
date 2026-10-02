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
   * Where the reader left a conversation: at its tail, or at a row — the one
   * at the top of the view, by key, and how many pixels of it were scrolled
   * past. A row keeps its key whatever arrives before or after it, so the
   * place survives a conversation that grew while it was away. Kept per
   * session in sessionStorage, so a reload returns there too.
   */
  type Landing = { tail: true } | { tail: false; key: string; into: number };
  const LANDING = "cawco:landing:";
</script>

<script lang="ts">
  /**
   * The scrolling transcript: the folded rows, virtualized. The live tail rides
   * as rows of its own (see `buildRowsFrom`), so streaming text, an open reasoning
   * block and the tool in flight all scroll with the conversation. Announces
   * genuine arrivals — and blocked-on-you — through a dedicated live region
   * beside the log, never through the virtualized container itself.
   */
  import { flushSync, onDestroy, setContext, tick, untrack } from "svelte";
  import { Virtualizer, type VirtualizerHandle } from "virtua/svelte";
  import { browser } from "$app/environment";
  import { describeTool } from "$lib/components/features/tool-cards/descriptors";
  import { EmptyState } from "$lib/components/ui/empty";
  import type { Trail } from "$lib/components/ui/markdown/trail";
  import { IconChat } from "$lib/icons";
  import { cawco, type SessionState } from "../client.svelte";
  import {
    crossIn,
    dur,
    ease,
    easeOut,
    motionOk,
  } from "../motion/curves.svelte";
  import { carry, waiting } from "../motion/share.svelte";
  import { rebuildScheduler } from "../workspace/scheduler.svelte";
  import {
    type Handoff,
    type Motion,
    provideLedger,
    type Ticket,
    watchedSessions,
  } from "./arrivals.svelte";
  import CatchUp from "./CatchUp.svelte";
  import Delegate from "./Delegate.svelte";
  import { disclosureAt } from "./disclosure.svelte";
  import Latest from "./Latest.svelte";
  import LiveRow from "./LiveRow.svelte";
  import MessageRow from "./MessageRow.svelte";
  import QuestionCard from "./QuestionCard.svelte";
  import TranscriptRow from "./Row.svelte";
  import RunBlock from "./RunBlock.svelte";
  import {
    buildRowsFrom,
    called,
    type Fold,
    type FoldMemo,
    queuedFrom,
    type Row,
    wellRuns,
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
  }: {
    session: SessionState;
    /**
     * Whether this transcript is on screen at all. Governs how OFTEN rows are
     * built: a pane nobody can see reads its session only at the scheduler's
     * slow tier, and never in the flush that brings it on screen.
     */
    visible: boolean;
    /**
     * Whether this is the transcript being worked in. Governs how EAGERLY
     * rows are rebuilt, and who gets to ride the tail and announce.
     *
     * Defaults to `visible`, so the single-pane case — one transcript, on
     * screen, being read — behaves exactly as it always has.
     */
    focused?: boolean;
    agentName: string;
    /** Optional callback when the transcript first renders content. */
    onlanded?: () => void;
    /**
     * Told whether this transcript's list is drawn (`shown`, below), and told
     * false when this transcript goes: the pane's placeholder stands over it
     * exactly while it is not.
     */
    onshown?: (shown: boolean) => void;
  } = $props();

  setContext("cawco:machine", () => session.machineId);

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
  let frozen: Row[] = [];
  /** A build: the rows, whether they grew at the front, and how the last live row ended. */
  interface Built {
    ended: Fold["ended"];
    rows: Row[];
    shifted: boolean;
  }
  /** The rows already on screen, handed back unchanged: nothing moved, nothing ended. */
  const STILL_BUILD = (): Built => ({
    rows: frozen,
    shifted: false,
    ended: null,
  });
  /**
   * The second step of a change virtua has to take in two (see `build`):
   * the rows it ends on, and the bump that hands them over.
   */
  let pending: Row[] | null = null;
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
    const drawn = shown;
    untrack(() => onshown?.(drawn));
    return () => untrack(() => onshown?.(false));
  });
  // ── The arrival ledger's state. Read by every build, so declared before
  // the first one (the server evaluates the rows during init).
  /** Every id this view has held: rows, the calls inside runs, the live tail's rows. */
  const known = new Set<string>();
  /** Arrivals decided and not yet mounted. A row takes its own, once. */
  const tickets = new Map<string, Ticket>();
  /** The live rows' streamed chunks, by live row: handed to the row each settles into. */
  const trails = new Map<string, Trail>();
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
      `${session.thinkingStream.length}:${session.busy ? 1 : 0}:${session.pending.map((ask) => `${ask.requestId}${ask.routedTo ?? ""}`).join(",")}:${session.permissionMode}:` +
      `${session.openBlock}:${session.thinkingClosing}:${session.currentTool?.toolId ?? ""}:${session.sdkStatus}:` +
      `${last?.metadata?.sendFailed ?? ""}`
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
    // biome-ignore lint/complexity/noVoid: the bump that hands over a two-step change's second step.
    void secondStep;
    // The switch flush paints what is already there; the catch-up comes
    // after the paint, through the hold letting go.
    if (risen !== builtRises) {
      builtRises = risen;
      if (primed && !held && untrack(() => printOf() !== builtPrint)) {
        hold();
      }
    }
    // biome-ignore lint/complexity/noVoid: the release is what re-runs a held build.
    void released;
    if (held) {
      return STILL_BUILD();
    }
    // A pane born off screen would otherwise hold an empty transcript until it
    // was first looked at, so the first build never consults the tier.
    if (!isFocused && primed) {
      // Read, not used: this is `built`'s reactive dependency on the unfocused
      // tier's own clock — its change is what re-runs this branch to re-check
      // the print, in place of the tracked reads `untrack` below hides.
      // biome-ignore lint/complexity/noVoid: see comment above — a bare reference would look unused and get "cleaned up".
      void rebuildTick;
      return untrack(rebuild);
    }
    return rebuild();
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
    const current = printOf() === builtPrint;
    const next = pending;
    pending = null;
    if (next && current) {
      return { rows: next, shifted: frontOnly(frozen, next), ended: null };
    }
    if (primed && current) {
      return STILL_BUILD();
    }
    return run();
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
        released += 1;
      }, 0);
    });
  }

  function run(): Built {
    countBuild();
    builtPrint = printOf();
    return build();
  }

  function build(): Built {
    const folded = buildRowsFrom(session, memo);
    const { rows: next } = folded;
    ({ memo } = folded);
    ledger(folded);
    noteMoves(frozen, next, folded.ended);
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
      if (frontOnly(frozen.slice(0, was), next.slice(0, now))) {
        pending = next;
        queueMicrotask(() => {
          secondStep += 1;
        });
        return {
          rows: [...frozen.slice(0, was), ...next.slice(now)],
          shifted: false,
          ended: folded.ended,
        };
      }
    }
    return { rows: next, shifted, ended: folded.ended };
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
  function noteMoves(prior: Row[], next: Row[], ended: Fold["ended"]): void {
    if (!untrack(() => landed && watched && motionOk.current)) {
      return;
    }
    let from = 0;
    while (
      from < prior.length &&
      from < next.length &&
      prior[from].key === next[from].key
    ) {
      from += 1;
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
    for (const row of drawn.slice(start + 1)) {
      const box = boxes.get(settled.get(row.key) ?? row.key);
      const node = listing.querySelector<HTMLElement>(
        `[data-row="${CSS.escape(row.key)}"]`
      );
      const item = node?.parentElement;
      if (box && node && item) {
        const now = item.getBoundingClientRect();
        slide(node, box, now.top - origin, now.height, timing);
      }
    }
  }

  /**
   * Where each sliding row's list item stood, in the list, when its slide
   * last took its place: what a later placing of the row is measured from.
   */
  const slidFrom = new WeakMap<HTMLElement, number>();

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
   * (`top`, drawn `height` tall), by its bottom edge.
   */
  function slide(
    node: HTMLElement,
    box: Box,
    top: number,
    height: number,
    timing: KeyframeAnimationOptions
  ): void {
    const delta = box.top + box.shift + box.height - (top + height);
    if (Math.abs(delta) <= 0.5) {
      return;
    }
    slidFrom.set(node, top);
    // A row that gained a speaker line starts with it above where the row
    // began — over the row above. It is cut off there and opens as the row
    // travels. The sides and bottom stay open: a well bleeds past its box.
    const gained = Math.max(0, height - box.height - node.offsetTop);
    for (const running of node.getAnimations()) {
      if (running.id === SLIDE) {
        running.cancel();
      }
    }
    startSlide(
      node,
      [
        {
          translate: `0 ${delta}px`,
          clipPath: `inset(${gained}px -100vmax -100vmax)`,
        },
        { translate: "0 0", clipPath: "inset(0px -100vmax -100vmax)" },
      ],
      timing
    );
  }

  /**
   * The transcript moved its rows under a slide: virtua placed them again
   * (it measured some), or the pin scrolled the list by `scrolled`. A slide
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
      const moved = top - was - scrolled;
      if (Math.abs(moved) <= 0.5) {
        continue;
      }
      slidFrom.set(node, top);
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
    const { rows: next } = built;
    frozen = next;
    primed = true;
    // The append has landed: the rows on screen are the session's again, and
    // the indicator under them has nothing left to wait for.
    if (!held && untrack(() => catching)) {
      catching = false;
    }
    // The update is in: what it moved starts where it was drawn.
    if (beforeMove) {
      untrack(slideMoves);
    }
  });
  const rows = $derived(built.rows);
  const cache = untrack(() => {
    // A pane with no saved sizes and no rows has `undefined` on both sides of
    // the first-row match, so the saved entry is checked on its own first.
    const saved = sizes.get(session.instanceId);
    return saved !== undefined &&
      saved.first === built.rows[0]?.key &&
      built.rows.length >= saved.count
      ? saved.cache
      : undefined;
  });
  /**
   * The place this pane returns to, until a landing has used it. A place at
   * a row the rows do not hold yet — a reload, whose first rows are the
   * server's tail — waits for the history read (see the reveal).
   */
  let resume: Landing | null = browser
    ? JSON.parse(
        sessionStorage.getItem(LANDING + untrack(() => session.instanceId)) ??
          "null"
      )
    : null;
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
  let drawnKeys = new Set<string>();
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

  /** Whether `row` can leave the list: a tail row, or a failed send its retry replaces. */
  const canLeave = (row: Row): boolean =>
    TAIL_KINDS.has(row.kind) ||
    (row.kind === "single" && row.message.state === "failed");

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

  const presentation = $derived.by(() => {
    // biome-ignore lint/complexity/noVoid: a row finishing its fold re-draws the list without it.
    void leftTick;
    const { rows: next, ended } = built;
    const present = new Set(next.map((row) => row.key));
    const folding = new Set(leaving.map(({ row }) => row.key));
    const handed = new Map<string, Handoff>();
    // Only a row on screen folds or hands its place on: one outside virtua's
    // range has nothing to fold, and nobody to see it go.
    for (const [key, stood] of standing) {
      if (present.has(key) || folding.has(key)) {
        continue;
      }
      const node = drawnRow(key);
      if (!node || handOn(node, takerOf(key, stood, next, ended), handed)) {
        continue;
      }
      if (hasLeft(key, stood.row, ended)) {
        leaving.push(stood);
        noteFold(key);
      }
    }
    leaving = leaving.filter(({ row }) => !present.has(row.key));
    const drawn = [...next];
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
        placed = true;
        return false;
      });
    }
    const lost = new Set(unplaced.map(({ row }) => row.key));
    leaving = leaving.filter(({ row }) => !lost.has(row.key));
    standing = standingIn(drawn, present);
    drawnKeys = new Set(drawn.map((row) => row.key));
    return {
      rows: drawn,
      leaving: new Set(leaving.map(({ row }) => row.key)),
      handed,
    };
  });

  /**
   * The row drawn as `node` hands its place to `taker`: the height the taker
   * starts from — the place's, or the place's on top of its own when it
   * absorbs it. A row that becomes another is drawn at the place's height
   * whether or not it moves; a run taking a call in is drawn at its own new
   * height at once when nothing moves, and is handed nothing. False when
   * nothing takes the place.
   */
  function handOn(
    node: HTMLElement,
    taker: Taker | null,
    handed: Map<string, Handoff>
  ): boolean {
    if (!taker) {
      return false;
    }
    const { height } = node.getBoundingClientRect();
    const ghost = taker.replaces ? ghostOf(node) : null;
    if (!taker.absorbs) {
      handed.set(taker.key, { from: height, ghost, taken: false });
      return true;
    }
    const own = drawnRow(taker.key)?.getBoundingClientRect().height;
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
      const holder = next.find(
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
    present: Set<string>
  ): Map<string, Standing> {
    const stood = new Map<string, Standing>();
    drawn.forEach((row, index) => {
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
    });
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
      const index = drawn.findIndex((row) => row.key === as);
      if (index >= 0) {
        return index + 1;
      }
    }
    return -1;
  }
  const renderedRows = $derived(presentation.rows);
  /**
   * The reader's rows whose well runs on into the next. A row folding away is
   * already out of its run: the rows either side close or join over its fold.
   */
  const runsOn = $derived(
    wellRuns(renderedRows, (key) => presentation.leaving.has(key))
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
  // A row folding shut stays mounted too, wherever it stands: virtua dropping
  // it mid-fold cancelled the fold, it never said it had gone, and it stayed
  // in the list at full height to fold again whenever it was next drawn.
  const keepMounted = $derived([
    ...Array.from(
      { length: Math.min(TAIL_MOUNTED, renderedRows.length) },
      (_, i) => renderedRows.length - 1 - i
    ),
    ...renderedRows.flatMap((row, index) =>
      presentation.leaving.has(row.key) ? [index] : []
    ),
  ]);

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

  /**
   * How many rows the SERVER paints — and nothing the browser ever hears about.
   *
   * `ssrCount` is virtua's server-render escape hatch: without it the store has
   * no viewport and no scroll offset to reason from, so it renders the empty
   * range `[0, -1]` and the server's HTML carries a transcript with no rows in
   * it. Handing it the row count makes the server emit exactly that many, which
   * (with the `ListItem` patch that keeps them in normal flow until mount) is
   * what puts the conversation in the first response.
   *
   * The catch is that it is not a render hint — it is a LATCH. The store reads
   * it ONCE, at construction (`createVirtualStore(data.length, itemSize,
   * ssrCount, …)`), sets `isSSR = !!ssrCount`, and pins its range at
   * `[0, ssrCount - 1]`; `$getRange` then short-circuits to that frozen pair for
   * as long as `isSSR` holds. The only thing in the whole store that clears the
   * flag is `ACTION_SCROLL_OFFSET_CHANGE` — a genuine scroll event whose offset
   * actually differs from the one on file.
   *
   * So a hydrating client that is handed `ssrCount` inherits that latch, and a
   * transcript shorter than its viewport can never shed it: there is nothing to
   * scroll, so no scroll event, so the range stays pinned at the row count the
   * page happened to hydrate with. Rows built after that — the message the
   * operator just sent, every frame the agent streams back — were folded, keyed
   * and handed to the Virtualizer correctly and then dropped on the floor by a
   * range that had stopped moving. Only a reload (a new store, a new count)
   * showed them. That is the whole "transcript does not update live" defect.
   *
   * Gating on `browser` is therefore not a micro-optimisation but the contract:
   * the count belongs to the server render, and the client builds a store that
   * measures its viewport like any other. The hydrating render draws no rows for
   * the microtask before `onMount` wires virtua's ResizeObserver to the
   * scroller; ResizeObserver notifications are delivered in the rendering step
   * BEFORE paint, so the measured range lands in the same frame and the gap is
   * never seen.
   */
  const ssrCount = $derived(browser ? undefined : built.rows.length);

  /**
   * Compaction is a genuinely live process — the model is rewriting its own
   * context — and it says so with one sticky pill and a beating dot. It used to
   * warp the entire transcript through an SVG displacement filter; distorting
   * text the operator may be mid-sentence in, and repainting the whole scroll
   * surface every frame, is not a state indicator. The pill alone carries it.
   */
  const compacting = $derived(session.sdkStatus === "compacting");
  /** The pill rises into place as it fades up, and fades as it goes. */
  function pillIn(_node: Element) {
    const rise = motionOk.current;
    return {
      duration: dur("--dur-menu"),
      easing: easeOut,
      css: (t: number, u: number) =>
        `opacity: ${t}${rise ? `; translate: 0 ${(u * 4).toFixed(2)}px` : ""}`,
    };
  }
  function pillOut(_node: Element) {
    return {
      duration: dur("--dur-exit"),
      easing: easeOut,
      css: (t: number) => `opacity: ${t}`,
    };
  }

  let scroller = $state<HTMLElement | undefined>();
  /** virtua's imperative handle — `scrollToIndex` reaches the true last row even
      as rows are still being measured, which a one-shot scrollTop cannot. */
  let list = $state<VirtualizerHandle | undefined>();
  /** The box around the list; its first child is virtua's container. */
  let listing = $state<HTMLElement>();
  /**
   * The part of a pixel that makes the list a whole number of pixels tall,
   * laid above its first row. The list is the sum of its rows' measured
   * heights, which is rarely whole, and a scroll offset is: pinned to the
   * bottom, the last row stood off the foot by the list's fraction (a row
   * arriving moved the tail 0.56px). Taken up at the top, where no reader
   * sees a sub-pixel, it puts the tail on the foot exactly, every time.
   */
  let spare = $state(0);
  /**
   * Keeps `spare` on the list's height, whatever changed it — a row measured,
   * arriving, or leaving (a parked ask's call taken out moves no row's size,
   * only the list's). Read in the rendering step that laid the list out, and
   * the tail pinned again from the whole height, before the frame is painted.
   */
  function wholeHeight(node: HTMLElement) {
    const inner = node.firstElementChild as HTMLElement | null;
    if (!inner) {
      return;
    }
    const watch = new ResizeObserver(() => {
      const height = Number.parseFloat(inner.style.height);
      if (!Number.isFinite(height)) {
        return;
      }
      const whole = Math.ceil(height - 0.001) - height;
      const next = whole < 0.001 ? 0 : whole;
      if (Math.abs(next - spare) <= 0.001) {
        return;
      }
      spare = next;
      flushSync();
      if (active && landed && atBottom && !jumping) {
        pinBottom();
      }
    });
    watch.observe(inner);
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
      first: renderedRows[0].key,
      count: renderedRows.length,
    });
    let landing: Landing = { tail: true };
    if (!atBottom) {
      const index = list.findItemIndex(lastTop);
      landing = {
        tail: false,
        key: renderedRows[index].key,
        into: lastTop - listStart - list.getItemOffset(index),
      };
    }
    sessionStorage.setItem(
      LANDING + session.instanceId,
      JSON.stringify(landing)
    );
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
    const { key } = resume;
    return renderedRows.findIndex((row) => row.key === key);
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
    if (!(resume && !resume.tail && list && scroller && listing) || index < 0) {
      return false;
    }
    atBottom = false;
    const start =
      listing.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop;
    // Within what the scroller can reach: a place past its end — rows below
    // it that are shorter now than when it was left — is its end.
    const target = Math.min(
      Math.max(0, start + list.getItemOffset(index) + resume.into),
      scroller.scrollHeight - scroller.clientHeight
    );
    if (Math.abs(scroller.scrollTop - target) <= 0.5) {
      return false;
    }
    scroller.scrollTop = target;
    lastWrite = scroller.scrollTop;
    return true;
  }

  /** The scroll height the last scroll event saw — what tells a clamp from a reader. */
  let lastHeight = 0;
  /**
   * The row at the top of the view and how far below the view's top it
   * stood at the last scroll event, from virtua's sizes: what tells the
   * reader's scrolling from virtua's corrections (see `onscroll`). Taken at
   * scroll events only — never at this component's own writes — because
   * that is the offset virtua corrects from: its jump fix is written as the
   * offset it last saw plus what the rows above grew, and a write of ours
   * that landed since is simply replaced.
   */
  let onScreen: { key: string; at: number } | null = null;
  function rowAt(top: number): { key: string; at: number } | null {
    if (!list || renderedRows.length === 0) {
      return null;
    }
    const index = list.findItemIndex(top);
    return {
      key: renderedRows[index].key,
      at: listStart + list.getItemOffset(index) - top,
    };
  }
  /** Whether that row still stands where it stood in the view, at `top`. */
  function stillAt(was: { key: string; at: number }, top: number): boolean {
    const index = renderedRows.findIndex((row) => row.key === was.key);
    return (
      !!list &&
      index >= 0 &&
      Math.abs(listStart + list.getItemOffset(index) - top - was.at) <= 1
    );
  }
  function onscroll(): void {
    if (!(scroller && listing && landed)) {
      return;
    }
    lastTop = scroller.scrollTop;
    const height = scroller.scrollHeight;
    const shrank = height < lastHeight;
    lastHeight = height;
    listStart =
      listing.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      lastTop;
    const was = onScreen;
    onScreen = rowAt(lastTop);
    // Until the reveal the list is laid out but not painted: nothing on it
    // is the reader's to have scrolled. virtua's own writes land here while
    // it measures the rows the store's read brings in — untagged, and at a
    // cold load on a phone one of them left 5,400px of tail under the
    // landing, read as the reader scrolling up, and the transcript opened
    // stranded there with the follow let go.
    if (!shown) {
      return;
    }
    if (jumping) {
      jumpScrolled(scroller);
      return;
    }
    // Every write this component makes is tagged with the position it wrote.
    // An event that matches the tag is our OWN motion — the paced follow, or
    // the pin holding the bottom while a row opens — and says nothing about
    // where the reader is looking. Neither does the browser clamping the
    // offset because the content under it got shorter (a tail row folding
    // shut): that event comes with a smaller scroll height and leaves the
    // offset at its end. Nor does virtua keeping the rows on screen where
    // they are while rows above them change size — measured as they mount
    // under a ride to the tail, a history chunk put in front: the offset
    // moves by what they grew, and the rows on screen do not move at all.
    // virtua writes that correction from the offset it saw at the last
    // scroll event, over the top of any write of ours since, so the rows
    // stand where they stood THEN. Taken for the reader, one of those let go
    // of the tail in the middle of a returning pane's catch-up and left it
    // 2,800px short for good. Anything
    // that moves what is on screen is the READER: wheel, scrollbar drag,
    // keyboard, momentum, anything.
    const clamped =
      shrank && scroller.scrollTop >= height - scroller.clientHeight - 1;
    if (
      (lastWrite !== null && Math.abs(scroller.scrollTop - lastWrite) <= 1) ||
      clamped
    ) {
      return;
    }
    if (was && stillAt(was, lastTop)) {
      return;
    }
    stopFollow();
    // A row the reader scrolls to is not arriving, whenever it came in: what
    // is still waiting to mount is theirs to read, not ours to play.
    tickets.clear();
    const distance = height - scroller.scrollTop - scroller.clientHeight;
    atBottom = distance < 120;
    // Hysteresis: up past the far mark, and it stays until back at the tail.
    farFromLatest =
      !atBottom &&
      (farFromLatest || distance > FAR_FROM_LATEST * scroller.clientHeight);
  }

  /**
   * Put the last row fully in view, above the floating composer stack.
   *
   * `scrollToIndex(…, 'end')` seats the last row's foot on the VIEWPORT's foot,
   * which is behind the composer: the clearance is padding under the list, and
   * virtua's box math stops at the list. So the landing is two moves — virtua
   * measures its way to the true last row, then one more frame runs the scroller
   * to its own maximum, past the padding band, which is exactly the height of
   * the composer column.
   */
  /** The frame the next write to the tail is waiting for, and this
   *  component's LAST WRITE — the tag that tells its own scroll events from
   *  the reader's without caring which input device made them (a scrollbar
   *  drag fires no wheel event; a tagged write needs no event taxonomy). */
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
   * A tool call opens its own height (`Row`'s `open`), so the bottom of the
   * list moves on every frame of that animation. For exactly as long as a
   * row is opening — or a reasoning block is folding — the view is pinned to
   * the bottom in the list's own resize, the same frame the row grows,
   * rather than a frame behind it: the row's growth is what moves it. One
   * motion, at the row's own curve.
   */
  let opening = 0;
  const resizing = new Set<Element>();

  /**
   * Pin the viewport to the bottom. Called from the list's own resize (see the
   * pin below), after virtua has laid the list out and before the frame is
   * painted, so the viewport and the opening row move on the same frame.
   */
  function pinBottom(): void {
    if (!scroller) {
      return;
    }
    const bottom = scroller.scrollHeight - scroller.clientHeight;
    if (Math.abs(scroller.scrollTop - bottom) > 0.5) {
      const was = scroller.scrollTop;
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
  }

  /** Svelte scopes keyframe names, so a call's opening is matched by suffix. */
  const isOpening = (name: string): boolean => name.endsWith("row-open");

  /** A thinking row opening or closing on the kit's reveal. */
  const isThinking = (event: Event): boolean =>
    !!(event.target as Element).closest('[data-slot="thinking-steps-content"]');

  function startResizing(row: Element): void {
    resizing.add(row);
    opening = resizing.size;
    // The paced loop and the pin must never both be writing scrollTop.
    stopFollow();
  }

  function endResizing(row: Element): void {
    resizing.delete(row);
    opening = resizing.size;
    if (opening === 0 && atBottom) {
      followBottom();
    }
  }

  function onanimationstart(event: AnimationEvent): void {
    if (isOpening(event.animationName)) {
      startResizing(event.target as Element);
    }
  }

  function onanimationend(event: AnimationEvent): void {
    if (isOpening(event.animationName)) {
      endResizing(event.target as Element);
    }
  }

  /**
   * A disclosure the READER opens — a tool's body, a branch, a note — holds
   * its header where they clicked it and opens downward. Riding the bottom
   * through it scrolled the header they had just clicked off the top of the
   * view; so the transcript lets go of the tail instead, exactly as if they
   * had scrolled. A reasoning block folding shut is the transcript's own
   * motion, and keeps the pin.
   */
  function onrevealstart(event: Event): void {
    if (isThinking(event)) {
      startResizing(event.target as Element);
      return;
    }
    if ((event.target as Element).getAttribute("data-state") === "open") {
      stopFollow();
      tickets.clear();
      atBottom = false;
    }
  }

  function onrevealend(event: Event): void {
    if (isThinking(event)) {
      endResizing(event.target as Element);
    }
  }

  /**
   * A row that grows on a transition of its own (`data-opens`: a failed
   * send's reason and actions unfolding) is a row opening too: the tail is
   * pinned to its edge for exactly as long as its rows track moves.
   */
  const opensRow = (event: TransitionEvent): boolean =>
    event.propertyName === "grid-template-rows" &&
    (event.target as Element).hasAttribute("data-opens");

  function ontransitionrun(event: TransitionEvent): void {
    if (opensRow(event)) {
      startResizing(event.target as Element);
    }
  }

  function ontransitionend(event: TransitionEvent): void {
    if (opensRow(event)) {
      endResizing(event.target as Element);
    }
  }

  $effect(() => {
    const node = scroller;
    if (!node) {
      return;
    }
    node.addEventListener("animationcancel", onanimationend);
    node.addEventListener("revealstart", onrevealstart);
    node.addEventListener("revealend", onrevealend);
    node.addEventListener("transitionrun", ontransitionrun);
    node.addEventListener("transitionend", ontransitionend);
    node.addEventListener("transitioncancel", ontransitionend);
    const removed = new MutationObserver(() => {
      const before = resizing.size;
      for (const element of resizing) {
        if (!element.isConnected) {
          resizing.delete(element);
        }
      }
      if (before !== resizing.size) {
        opening = resizing.size;
        if (opening === 0 && atBottom) {
          followBottom();
        }
      }
    });
    removed.observe(node, { childList: true, subtree: true });
    return () => {
      removed.disconnect();
      node.removeEventListener("animationcancel", onanimationend);
      node.removeEventListener("revealstart", onrevealstart);
      node.removeEventListener("revealend", onrevealend);
      node.removeEventListener("transitionrun", ontransitionrun);
      node.removeEventListener("transitionend", ontransitionend);
      node.removeEventListener("transitioncancel", ontransitionend);
      if (landingFrame !== null) {
        cancelAnimationFrame(landingFrame);
      }
      stopFollow();
      resizing.clear();
      opening = 0;
    };
  });

  /**
   * THE PIN. While the reader is at the tail, the list getting taller is
   * followed: pinned while a row opens, paced by the teleprompter otherwise.
   *
   * It listens to virtua's own container — the element whose height virtua
   * sets from the rows it has measured — through a MutationObserver on its
   * style, NOT a ResizeObserver. virtua resizes that container from inside
   * its own ResizeObserver callback; observing it with another one asked for
   * a notification the browser could not deliver in the same loop, which is
   * the "ResizeObserver loop completed with undelivered notifications" every
   * arriving row used to raise. A style mutation is delivered as a microtask
   * right behind virtua's write, still before the frame is painted. The
   * scroller's own box (the window, the composer column's clearance) is the
   * one thing observed for size, and nothing here resizes it.
   *
   * The box is pinned in the resize itself. Its observer runs after the
   * frame's layout, before its paint, so the tail is put back in the frame
   * the box changed. It is made when this transcript becomes the one being
   * worked in, and an observer's first delivery comes in the next frame's
   * layout: the frame a switch first draws this pane. So a tail that grew
   * while the pane was off screen — skipped, never laid out — is pinned in
   * the glide's first frame, not a frame behind it (`land`'s own frame).
   */
  $effect(() => {
    const node = scroller;
    const container = listing?.firstElementChild;
    if (!(active && node && container)) {
      return;
    }
    const follow = (): void => {
      if (!(landed && atBottom)) {
        return;
      }
      if (opening > 0) {
        pinBottom();
      } else if (following === null) {
        followBottom();
      }
    };
    const grew = new MutationObserver(follow);
    grew.observe(container, { attributes: true, attributeFilter: ["style"] });
    const box = new ResizeObserver(() => {
      if (landed && atBottom && !jumping) {
        pinBottom();
      }
    });
    box.observe(node);
    return () => {
      grew.disconnect();
      box.disconnect();
    };
  });

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
   * so the frame that shows the rows is never the frame that moved them. The
   * server's render is unpainted too: it is the same rows, at estimated
   * offsets. It waits out a history read in flight as well. What arrives
   * after the reveal — the read replacing the server's tail, older chunks in
   * front — keeps the rows on screen measured and in place: see `frontOnly`
   * and the two steps in `build`.
   */
  $effect(() => {
    const node = scroller;
    const container = listing?.firstElementChild;
    // A read of the history under way is about to put rows in front of
    // these: drawn first, they would be moved under the reader. virtua
    // renders the indexes it was showing for a frame after such a shift,
    // rows far above the viewport now, and measures them there. That counts
    // the store's own read when these rows are the server's stand-in for it
    // (see `SessionPane`): the store's session replaces them the moment its
    // read is in, with the turn in flight on the end.
    const store = cawco.session(session.instanceId);
    const reading =
      session.loading ||
      session.hydrating ||
      (store !== null &&
        store !== session &&
        (store.loading || store.hydrating));
    if (shown || reading || !(landed && node && container)) {
      return;
    }
    let frame: number | null = null;
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
        if (measured()) {
          resume = null;
          shown = true;
        }
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
      changes.disconnect();
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
    };
  });

  /**
   * Put the view at the tail in the next frame, before it paints. Nothing is
   * read here: this is called from the list's observers, and those fire
   * inside whatever task changed the list — a finger lifting off a swipe
   * between tabs among them — where reading the scroller forced a layout
   * into that task. The frame's callbacks read it anyway, before its layout.
   */
  function followBottom(): void {
    if (!scroller || opening > 0 || following !== null) {
      return;
    }
    following = requestAnimationFrame(() => {
      following = null;
      if (atBottom && opening === 0) {
        pinBottom();
      }
    });
  }

  function land(): void {
    if (landed && opening > 0) {
      return;
    }
    if (!landed) {
      // A place the rows do not hold yet — a reload's first rows are the
      // server's tail — is looked for again once the history read is in.
      if (anchorIndex() >= 0) {
        restore();
      } else {
        list?.scrollToIndex(rows.length - 1, { align: "end" });
        atBottom = true;
      }
      landed = true;
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
    if (!scroller) {
      return;
    }
    // `scrollToIndex` is virtua's far-row measuring power: a tail more than
    // two viewports off — a tab back from a long absence, the jump back from
    // far up — is measured its way to before the view is put there.
    const gap =
      scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
    if (gap > scroller.clientHeight * 2) {
      list?.scrollToIndex(rows.length - 1, { align: "end" });
    }
    if (!(active && atBottom)) {
      return;
    }
    pinBottom();
    settle();
  }

  /** Fire `onlanded` once, the first time the transcript has content. */
  let settled = false;
  function settle(): void {
    if (settled) {
      return;
    }
    settled = true;
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

  // Follow the tail while the reader is already at the bottom — a scroll up to
  // read history is never yanked back by the next frame. `clearance` is a
  // dependency too: when the composer column grows (a tray, a chip row), the
  // row that was flush with the composer is now behind it, so the tail re-lands.
  //
  // `active` is read FIRST, before the tail it follows. Reading `session.streaming`
  // ahead of the guard re-ran this effect on every streamed frame of a pane
  // nobody was looking at — the same cost `rows` above stops paying, arriving
  // by the other door. Guarding first means an off-screen pane has no
  // dependency on the stream at all; and because `active` is itself tracked,
  // switching back re-runs this once, on rows that have just caught up.
  $effect(() => {
    if (!active && landed) {
      return;
    }
    // Read, not used: these two are this effect's tracked dependencies, read
    // in this order and only after the `active` guard above — see the doc
    // comment above this effect for why the order and the guard matter.
    // biome-ignore lint/complexity/noVoid: see comment above — a bare reference would look unused and get "cleaned up".
    void rows.length;
    if (active) {
      // biome-ignore lint/complexity/noVoid: track streaming only while focused
      void session.streaming;
    }
    if (rows.length === 0) {
      return;
    }
    if (!landed || atBottom) {
      // biome-ignore lint/complexity/noVoid: fire-and-forget by intent — this effect does not await the land, it only arms it.
      void tick().then(() => {
        if (!landed || (active && atBottom)) {
          land();
        }
      });
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
  const NO_RAIL = new Set([
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
      row.kind === "run"
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
  const continued = $derived.by(() => {
    const keys = new Set<string>();
    const rowList = renderedRows;
    for (let i = 1; i < rowList.length; i += 1) {
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
  });

  // ── Arrivals ────────────────────────────────────────────────────────────
  // The rule and why it is read from data live in `arrivals.svelte.ts`. This
  // is where it runs: once per build, over every id the build holds.

  function ledger(fold: Fold): void {
    const live = session.messages === lastArray;
    lastArray = session.messages;
    const open = seeded && untrack(() => watched);
    seeded = true;
    const fresh = unheld(fold.rows);
    // The live row that ended is gone: its trail goes to the row it settled
    // into, or nowhere.
    const trail = fold.ended ? trails.get(fold.ended.key) : undefined;
    if (fold.ended) {
      trails.delete(fold.ended.key);
    }
    if (!open) {
      tickets.clear();
      return;
    }
    let slot = 0;
    // The calls whose glance the last build drew: each is that glance, landed.
    const glanced = new Set(
      frozen.flatMap((row) =>
        row.kind === "livetool" ? [row.glance.toolId] : []
      )
    );
    for (const { id, row } of fresh) {
      if (!(live || LIVE_KINDS.has(row.kind))) {
        continue;
      }
      if (row.kind === "tools" && wasGlanced(row, id, glanced)) {
        continue;
      }
      const ticket = ticketFor(row, fold.ended, trail, slot);
      if (ticket) {
        tickets.set(id, ticket);
        slot += ticket.kind === "arrive" ? 1 : 0;
      }
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
   * What a new row gets. The live row settling into its own row is the same
   * object, so it does not arrive: reasoning that settles folds shut from
   * where it was open, and an answer carries on the chunk fades it had
   * running. Everything else arrives in its place in the burst.
   */
  function ticketFor(
    row: Row,
    ended: Fold["ended"],
    trail: Trail | undefined,
    slot: number
  ): Ticket | null {
    if (row.key !== ended?.into) {
      return {
        kind: "arrive",
        lead: Math.min(slot, STAGGER_ROWS - 1) * STAGGER_MS,
        start: null,
      };
    }
    if (ended.as === "reasoning") {
      return { kind: "fold" };
    }
    return trail ? { kind: "carry", trail } : null;
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
    trail(key) {
      let trail = trails.get(key);
      if (!trail) {
        trail = { chunks: [], drawn: 0 };
        trails.set(key, trail);
      }
      return trail;
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
    if (
      !(
        node &&
        motionOk.current &&
        node.scrollHeight - node.clientHeight - node.scrollTop <=
          JUMP_SMOOTH_SCREENS * node.clientHeight
      )
    ) {
      // Landed in the click itself, not in `land`'s next frame: a re-armed
      // `land` (the rows effect) can push that frame back one more.
      atBottom = true;
      landInFrame();
      return;
    }
    stopFollow();
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
    const bottom = node.scrollHeight - node.clientHeight;
    if (Math.abs(bottom - node.scrollTop) <= 1) {
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
    const bottom = node.scrollHeight - node.clientHeight;
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
    // re-reading the whole transcript.
    if (!(landed && active)) {
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
      return "Question from the agent";
    }
    return "";
  });
</script>

<!-- Off-screen, and the only thing on this surface that speaks. Two channels:
     what just arrived (polite, queued behind the reader), and what is blocking
     (assertive, because the run has stopped). -->
<p aria-atomic="true" aria-live="polite" class="spoken" role="status">
  {announcement}
</p>
<p aria-atomic="true" aria-live="assertive" class="spoken">
  {blockedNote || trayAlert}
</p>

<div
  aria-label="Session transcript"
  class="tr tx-columns"
  {onanimationend}
  {onanimationstart}
  {onscroll}
  role="log"
  bind:this={scroller}
>
  <!-- Pinned to the top of the transcript viewport (the foot is the composer's),
       first child so `position: sticky` actually holds. A strip at no height
       in the flow, the pill hanging from it over the rows, so its coming and
       going moves nothing. -->
  <div class="top-dock">
    {#if compacting}
      <div class="compacting-note" role="status" in:pillIn out:pillOut>
        <span aria-hidden="true" class="beat"></span>
        Compacting context…
      </div>
    {/if}
  </div>
  <!-- Empty is what is drawn: a conversation whose one row is folding away
       as its retry comes in is not empty for the frame between the two, and
       the empty state shown there pushed the fold 53px down. -->
  {#if session.loading && renderedRows.length === 0}
    <p class="empty">Loading transcript…</p>
  {:else if renderedRows.length === 0}
    <!-- Only once the read has said the conversation is empty, fading in
         where it stands. The two keys that do anything from the composer
         below. Left-aligned: this surface is a ledger. -->
    <div in:crossIn>
      <EmptyState
        icon={IconChat}
        line="Send the first instruction below — / lists this session's commands, @ names a machine or session."
        title="No messages yet"
      />
    </div>
  {/if}

  <!-- The list's own box: what the pin reads virtua's container off. -->
  <div
    class="listing"
    bind:this={listing}
    style:padding-top={spare ? `${spare}px` : undefined}
    class:shown
    {@attach wholeHeight}
  >
    <Virtualizer
      {cache}
      data={renderedRows}
      getKey={(r) => r.key}
      itemSize={ROW_ESTIMATE}
      {keepMounted}
      scrollRef={scroller}
      shift={built.shifted}
      {ssrCount}
      startMargin={spare}
      bind:this={
        () => list,
        (value) => { list = value as unknown as VirtualizerHandle; }
      }
    >
      {#snippet children(row)}
        <TranscriptRow
          continues={continued.has(row.key)}
          handoff={presentation.handed.get(row.key)}
          id={row.kind === 'tools' ? undefined : row.key}
          leaving={presentation.leaving.has(row.key)}
          motion={motionOf(row)}
          onleft={leaver(row.key)}
          rowKey={row.key}
        >
          {#snippet children(ticket)}
            {#if row.kind === 'single' || row.kind === 'queued'}
              <MessageRow
                {agentName}
                carry={ticket?.kind === 'carry' ? ticket.trail : null}
                folding={ticket?.kind === 'fold'}
                grouped={row.grouped}
                message={row.message}
                runsOn={runsOn.has(row.key)}
              />
            {:else if row.kind === 'tools'}
              <ToolGroup messages={row.messages} />
            {:else if row.kind === 'question'}
              <QuestionCard message={row.message} />
            {:else if row.kind === 'harness'}
              <SystemLine
                disclosed={disclosureAt(session.instanceId, row.key)}
                harness={row.note}
              />
            {:else if row.kind === 'subagent'}
              <Subagent branch={row.branch} spawn={row.spawn} />
            {:else if row.kind === 'delegate'}
              <Delegate message={row.message} />
            {:else if row.kind === 'run'}
              <RunBlock message={row.message} runId={row.runId} />
            {:else if row.kind === 'thinking'}
              <Thinking live={row.live} text={row.text} />
            {:else if row.kind === 'live'}
              <LiveRow {agentName} announce={active} {row} />
            {:else if row.kind === 'livetool'}
              {@const d = describeTool(row.glance.name, undefined, undefined, 'pending')}
              {@const LiveIcon = d.icon}
              <div class="livetool rail-row rail-line">
                <span class="ic rail-cell breathe {d.color}"><LiveIcon /></span>
                <!-- The same anatomy the settled ToolGroup row has: the
                     descriptor's verb, then the mono argument, the verb
                     omitted where the object is the whole sentence. Printing
                     `glance.name` here and `d.label` once it settled changed
                     the call's vocabulary the instant it completed. -->
                {#if d.label}
                  <span class="tk">{d.label}</span>
                {/if}
                <span class="arg">{row.glance.glance}</span>
              </div>
            {/if}
          {/snippet}
        </TranscriptRow>
      {/snippet}
    </Virtualizer>
  </div>
  <!-- Floating above the composer column, at zero height in the flow, so
       nothing here coming or going moves a row: the catch-up, from the switch
       until it has appended, and — scrolled away from the tail — the way back. -->
  <div class="dock">
    {#if catching}
      <CatchUp />
    {/if}
    {#if showLatest}
      <Latest onjump={jump} />
    {/if}
  </div>
</div>

<style>
  .listing:not(.shown) {
    visibility: hidden;
  }
  /* virtua writes `pointer-events: none` on its container while it scrolls
     and takes it off after. pointer-events is inherited, so each write
     restyled every row under it: the pin scrolls the list on every streamed
     chunk, and each write cost a style recalculation of the whole
     transcript (13,000 elements, ~140ms). Held at auto here, the inherited
     value never changes and the rows are left alone. */
  .listing > :global(:first-child) {
    pointer-events: auto !important;
  }
  .tr {
    flex: 1 1 auto;
    overflow-y: auto;
    /* asymmetric content padding is the DESIGN.md ledger signature:
       inline start --space-7 (25), inline end --space-6 (21). */
    padding-block-start: 0;
    padding-inline: var(--space-7) var(--space-6);
    /* The foot clears the composer's standing box: the pill at one line, the
       delegate tray's row and the suggestion row on it. Parked prompt cards
       and a grown draft stand over the transcript's foot and move nothing.
       `--composer-clearance` is that box plus its offsets, set by the pane
       in CSS from the composer's own tokens (app.css `--c-composer-*`), so
       it is the same whether the pane is on screen or not; the old fixed
       reserve is the floor. */
    padding-block-end: max(
      calc(var(--space-8) * 3),
      var(--composer-clearance, 0px)
    );
    min-block-size: 0;
    position: relative;

    @media (width <= 900px) {
      padding-inline: var(--space-5);
    }
  }
  .empty {
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    color: var(--ink-muted);
    padding-block: var(--space-5);
  }

  .top-dock {
    position: sticky;
    inset-block-start: var(--space-3);
    z-index: 3;
    block-size: 0;
    display: flex;
    justify-content: center;
    align-items: start;
    pointer-events: none;
  }
  .compacting-note {
    inline-size: fit-content;
    max-inline-size: 100%;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding-block: var(--space-2);
    padding-inline: var(--space-4);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-pill);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    color: var(--ink-strong);

    /* Motion is opt-in: the dot only beats when the reader hasn't asked for
       reduced motion. Without the query the pill's presence alone carries
       the state — the dot is still. */
    & .beat {
      inline-size: 6px;
      block-size: 6px;
      flex: 0 0 auto;
      border-radius: 50%;
      background: var(--status-live-ink);

      @media (prefers-reduced-motion: no-preference) {
        animation: beat var(--breath) var(--ease-in-out) infinite;
      }
    }
  }
  @keyframes beat {
    50% {
      opacity: 0.3;
    }
  }

  /* The live region is read, never seen: off-screen rather than
     `display: none`, which assistive tech skips entirely. */
  .spoken {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    margin: -1px;
    padding: 0;
    border: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* The catch-up and the way back to the tail. A zero-height strip stuck to
     the foot of the scrollport, above the composer column; what shows hangs
     up out of it, so its coming and going never changes the scroll height. */
  .dock {
    position: sticky;
    inset-block-end: calc(
      max(calc(var(--space-8) * 3), var(--composer-clearance, 0px)) -
      var(--space-4)
    );
    block-size: 0;
    display: flex;
    justify-content: center;
    align-items: end;
    gap: var(--space-2);
    pointer-events: none;

    & > :global(button) {
      pointer-events: auto;
    }
  }

  /* The in-flight tool is a rail row on the same columns as the calls it
     becomes (app.css `.rail-row`, `.rail-line`): one line, 26px tall. */
  .livetool {
    min-block-size: 26px;
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    color: var(--ink-strong);

    /* No `color` here: the tool family's `text-tool-*` tint governs the
       glyph; the generic case inherits --ink-strong from .livetool. */
    & .ic :global(svg) {
      inline-size: var(--w-glyph);
      block-size: var(--w-glyph);
    }
    & .tk {
      font-weight: var(--weight-strong);
      color: var(--ink-strong);
      flex: 0 1 auto;
      min-inline-size: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    & .arg {
      font-family: var(--font-mono);
      color: var(--ink-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-inline-size: 0;
    }
  }
</style>
