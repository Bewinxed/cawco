<script lang="ts" module>
  import type { CacheSnapshot } from "virtua";

  /**
   * Where each conversation was left, by session id: virtua's measured sizes
   * and the scroll offset, so a pane that mounts again lands in one write
   * instead of hunting for its tail across several re-ranges.
   */
  const landings = new Map<
    string,
    { cache: CacheSnapshot; offset: number; count: number; tail: boolean }
  >();
</script>

<script lang="ts">
  /**
   * The scrolling transcript: the folded rows, virtualized. The live tail rides
   * as rows of its own (see `buildRows`), so streaming text, an open reasoning
   * block and the tool in flight all scroll with the conversation. Announces
   * genuine arrivals — and blocked-on-you — through a dedicated live region
   * beside the log, never through the virtualized container itself.
   */
  import { onDestroy, setContext, tick, untrack } from "svelte";
  import { Virtualizer, type VirtualizerHandle } from "virtua/svelte";
  import { browser } from "$app/environment";
  import { describeTool } from "$lib/components/features/tool-cards/descriptors";
  import type { Trail } from "$lib/components/ui/markdown/trail";
  import { motionOk } from "$lib/whiffle/motion/curves.svelte";
  import { type SessionState, whiffle } from "../client.svelte";
  import { rebuildScheduler } from "../workspace/scheduler.svelte";
  import {
    type Motion,
    provideLedger,
    type Ticket,
    watchedSessions,
  } from "./arrivals.svelte";
  import CatchUp from "./CatchUp.svelte";
  import Delegate from "./Delegate.svelte";
  import Latest from "./Latest.svelte";
  import LiveRow from "./LiveRow.svelte";
  import MessageRow from "./MessageRow.svelte";
  import QuestionCard from "./QuestionCard.svelte";
  import Queued from "./Queued.svelte";
  import TranscriptRow from "./Row.svelte";
  import {
    buildRowsFrom,
    called,
    type Fold,
    type FoldMemo,
    type Row,
    sent,
  } from "./rows";
  import Subagent from "./Subagent.svelte";
  import SystemLine from "./SystemLine.svelte";
  import Thinking from "./Thinking.svelte";
  import ToolGroup from "./ToolGroup.svelte";

  let {
    session,
    visible,
    focused,
    agentName,
    machineName = "",
    cwd = "",
    onlanded,
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
    /** Where this session runs — named in the empty state, nowhere else. */
    machineName?: string;
    /** The folder it runs in — named in the empty state, nowhere else. */
    cwd?: string;
    /** Optional callback when the transcript first renders content. */
    onlanded?: () => void;
  } = $props();

  setContext("whiffle:machine", () => session.machineId);

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
   * are the frozen ones whatever the session says. Set on the rising edge of
   * `visible` / `focused` when there is something to catch up on, cleared
   * once that flush has painted.
   */
  let held = $state(false);
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
   */
  let shown = $state(false);
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
  const printOf = (): string =>
    `${session.messages.length}:${session.queued.length}:${session.streaming.length}:` +
    `${session.thinkingStream.length}:${session.busy ? 1 : 0}:${session.pending.length}:` +
    `${session.openBlock}:${session.thinkingClosing}:${session.currentTool?.toolId ?? ""}:${session.sdkStatus}:` +
    `${session.messages.at(-1)?.metadata?.sendFailed ?? ""}`;
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
    if (pending) {
      const next = pending;
      pending = null;
      return { rows: next, shifted: frontOnly(frozen, next), ended: null };
    }
    // The switch flush paints what is already there; the catch-up comes
    // after the paint, through `held` clearing.
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
      return untrack(() => (printOf() === builtPrint ? STILL_BUILD() : run()));
    }
    // Reading the print tracks exactly the handful of fields that mean "there
    // is something new to draw", so an unchanged session cannot invalidate
    // this at all — and a changed one still rebuilds on the very next frame.
    if (primed && printOf() === builtPrint) {
      return STILL_BUILD();
    }
    return run();
  });

  /**
   * The switch itself, before the DOM updates: on the rising edge of
   * `visible` or `focused`, hold the rows for this flush and schedule the
   * catch-up behind its paint. `$effect.pre` because the hold has to be in
   * place before the Virtualizer reads `built` in the same flush.
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
  let wasVisible = false;
  let wasFocused = false;
  $effect.pre(() => {
    const nowVisible = visible;
    const nowFocused = isFocused;
    const rising = (nowVisible && !wasVisible) || (nowFocused && !wasFocused);
    wasVisible = nowVisible;
    wasFocused = nowFocused;
    if (!(rising && primed)) {
      return;
    }
    untrack(() => {
      if (held || printOf() === builtPrint) {
        return;
      }
      held = true;
      catching = true;
      returning = true;
      requestAnimationFrame(() => {
        setTimeout(() => {
          held = false;
        }, 0);
      });
    });
  });

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
    if (untrack(() => catching && !held)) {
      catching = false;
    }
  });
  const rows = $derived(built.rows);
  const snapshot = untrack(() => {
    const saved = landings.get(session.instanceId);
    return saved?.count === built.rows.length ? saved : undefined;
  });
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
   * TAIL ROWS LEAVE; THEY DO NOT VANISH.
   *
   * The live tail's rows — the turn's indicator, a tool's glance, a queued
   * message — go the moment the session says so, and virtua drops a missing
   * key at once: the tail would lose that height in one frame. So a tail row
   * that goes WITHOUT becoming a settled row is kept, drawn after every other
   * row so that nothing below it can move, while it folds shut (`Row`'s
   * `leaving`); the end of its own fold is what takes it out. A live row that
   * settled is not leaving: the row it became is already on screen, in its
   * place.
   */
  const TAIL_KINDS = new Set<Row["kind"]>(["live", "livetool", "queued"]);
  let tail = new Map<string, Row>();
  let leaving: Row[] = [];
  let leftTick = $state(0);
  const presentation = $derived.by(() => {
    // biome-ignore lint/complexity/noVoid: a row finishing its fold re-draws the list without it.
    void leftTick;
    const { rows: next, ended } = built;
    const present = new Set(next.map((row) => row.key));
    for (const [key, row] of tail) {
      // A live row that became its settled row, or a tool's glance whose call
      // has landed: either is already on screen in its new form. A queued
      // message that was sent is not its turn, which arrives as a row of its
      // own — but that turn lands above anything folding at the end, and
      // would push the fold down under the reader; the placeholder just goes.
      const settled =
        (ended?.key === key && ended.into !== null) ||
        (row.kind === "livetool" &&
          untrack(() => called(session, row.glance.toolId))) ||
        (row.kind === "queued" &&
          untrack(() => sent(session, row.queued.text)));
      if (!(present.has(key) || settled || leaving.includes(row))) {
        leaving.push(row);
      }
    }
    tail = new Map(
      next
        .filter((row) => TAIL_KINDS.has(row.kind))
        .map((row) => [row.key, row])
    );
    leaving = leaving.filter((row) => !present.has(row.key));
    return {
      rows: leaving.length > 0 ? [...next, ...leaving] : next,
      leaving: new Set(leaving.map((row) => row.key)),
    };
  });
  const renderedRows = $derived(presentation.rows);

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
  const keepMounted = $derived(
    Array.from(
      { length: Math.min(TAIL_MOUNTED, renderedRows.length) },
      (_, i) => renderedRows.length - 1 - i
    )
  );

  function left(key: string): void {
    leaving = leaving.filter((row) => row.key !== key);
    leftTick += 1;
  }

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

  let scroller = $state<HTMLElement | undefined>();
  /** virtua's imperative handle — `scrollToIndex` reaches the true last row even
      as rows are still being measured, which a one-shot scrollTop cannot. */
  let list = $state<VirtualizerHandle | undefined>();
  /** The box around the list; its first child is virtua's container. */
  let listing = $state<HTMLElement>();
  let atBottom = $state(true);

  function saveLanding(): void {
    if (!(list && scroller && landed)) {
      return;
    }
    const cache = list.getCache();
    landings.set(session.instanceId, {
      cache,
      offset: scroller.scrollTop,
      count: built.rows.length,
      tail:
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <
        120,
    });
  }

  $effect.pre(() => {
    if (!visible) {
      untrack(saveLanding);
    }
  });
  onDestroy(saveLanding);

  /** The scroll height the last scroll event saw — what tells a clamp from a reader. */
  let lastHeight = 0;
  function onscroll(): void {
    if (!(scroller && landed)) {
      return;
    }
    const height = scroller.scrollHeight;
    const shrank = height < lastHeight;
    lastHeight = height;
    // Every write this component makes is tagged with the position it wrote.
    // An event that matches the tag is our OWN motion — the paced follow, or
    // the pin holding the bottom while a row opens — and says nothing about
    // where the reader is looking. Neither does the browser clamping the
    // offset because the content under it got shorter (a tail row folding
    // shut): that event comes with a smaller scroll height and leaves the
    // offset at its end. Anything else is the READER: wheel, scrollbar drag,
    // keyboard, momentum, anything.
    const clamped =
      shrank && scroller.scrollTop >= height - scroller.clientHeight - 1;
    if (Math.abs(scroller.scrollTop - lastWrite) <= 1 || clamped) {
      return;
    }
    stopFollow();
    // A row the reader scrolls to is not arriving, whenever it came in: what
    // is still waiting to mount is theirs to read, not ours to play.
    tickets.clear();
    atBottom = height - scroller.scrollTop - scroller.clientHeight < 120;
  }

  /**
   * Put the last row fully in view, above the floating composer stack.
   *
   * `scrollToIndex(…, 'end')` seats the last row's foot on the VIEWPORT's foot,
   * which is behind the composer: the clearance is padding under the list, and
   * virtua's box math stops at the list. So the landing is two moves — virtua
   * measures its way to the true last row, then one more frame runs the scroller
   * to its own maximum, past the padding band, which is exactly the height of
   * the composer column. A tall permission card therefore never sits on top of
   * the message that raised it.
   */
  /** The follow loop's handle, and its own LAST WRITE — the tag that tells the
   *  loop's scroll events from the reader's without caring which input device
   *  made them (a scrollbar drag fires no wheel event; a tagged write needs no
   *  event taxonomy at all). */
  let following: number | null = null;
  let landingFrame: number | null = null;
  let lastWrite = -1;
  function stopFollow(): void {
    if (following !== null) {
      cancelAnimationFrame(following);
    }
    following = null;
  }

  /**
   * TELEPROMPTER FOLLOW. Streaming arrives in irregular bursts, and any scheme
   * that moves per-arrival — a tween, native smooth scroll, damped chasing —
   * inherits that jitter, because the impulse IS the burst. So the follow is
   * decoupled: one loop at a CONSTANT reading pace, and bursts merely
   * accumulate below the fold while the viewport advances steadily. Velocity,
   * not distance, is what the eye judges as smooth. The pace ramps only under
   * a real backlog (more than half a viewport behind); past two viewports it
   * is a teleport, not a ride; reduced motion always snaps; and the loop
   * yields to the reader two ways — `atBottom` going false ends it, and any
   * scroll event that is not its own tagged write ends it in `onscroll`.
   */
  /**
   * WHILE A ROW OPENS, ITS EDGE IS THE SCROLL.
   *
   * A tool call opens its own height (`Row`'s `open`), so the bottom of the
   * list moves for the length of that animation. The teleprompter below moves
   * at a pace of its own choosing, and a pace chasing a target that is itself
   * still moving is two animations arguing about where the bottom is. So for
   * exactly as long as a row is opening — or a reasoning block is folding —
   * the follow is not paced at all: the viewport is pinned to the bottom and
   * the row's growth is what moves it. One motion, at the row's own curve.
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
      scroller.scrollTop = bottom;
      lastWrite = scroller.scrollTop;
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

  $effect(() => {
    const node = scroller;
    if (!node) {
      return;
    }
    node.addEventListener("animationcancel", onanimationend);
    node.addEventListener("revealstart", onrevealstart);
    node.addEventListener("revealend", onrevealend);
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
    const box = new ResizeObserver(follow);
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
    const store = whiffle.session(session.instanceId);
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
    const wait = (): void => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
      }
      if (!measured()) {
        return;
      }
      frame = requestAnimationFrame(() => {
        frame = null;
        shown = true;
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

  const FOLLOW_SPEED = 360; // px/s — a calm reading pace
  function followBottom(): void {
    if (!scroller || opening > 0) {
      return;
    }
    const target = () =>
      scroller ? scroller.scrollHeight - scroller.clientHeight : 0;
    const gap = target() - scroller.scrollTop;
    if (gap <= 0) {
      return;
    }
    if (!motionOk.current || gap > scroller.clientHeight * 2) {
      scroller.scrollTop = scroller.scrollHeight;
      lastWrite = scroller.scrollTop;
      return;
    }
    if (following !== null) {
      return; // one loop; it reads the live target
    }
    const span = Number.parseFloat(
      getComputedStyle(scroller).getPropertyValue("--dur-panel")
    );
    // Both are set by the loop's first frame, not here: a loop armed while
    // the page was hidden runs when the reader is back, and glides from there.
    let last = 0;
    let ends = 0;
    const step = (now: number): void => {
      if (!(scroller && atBottom)) {
        stopFollow();
        return;
      }
      if (ends === 0) {
        last = now;
        ends = now + span;
      }
      const dt = Math.min(64, now - last);
      last = now;
      const remaining = target() - scroller.scrollTop;
      if (remaining <= 0.5) {
        if (remaining > 0) {
          scroller.scrollTop = target();
          lastWrite = scroller.scrollTop;
        }
        stopFollow();
        return;
      }
      // Duration-bounded, not distance-bounded: an engagement lands within
      // one --dur-panel however far it has to go. The speed is three times
      // what the distance left needs in the time left, so it eases out along
      // a cubic and arrives as the time runs out, and reads the live target
      // every frame, so a tail that keeps growing is absorbed without a jump.
      // Past the deadline the time left holds at a quarter span: whatever
      // still grows is caught up with quickly, never snapped to. A hop of a
      // line or two rides at the reading pace instead. Without the bound the
      // loop trod water behind a long stream or a return from elsewhere: a
      // crawl of a second or more nobody asked for.
      const timeLeft = Math.max(ends - now, span / 4) / 1000;
      const speed = Math.max(FOLLOW_SPEED, (3 * remaining) / timeLeft);
      scroller.scrollTop += Math.min(remaining, (speed * dt) / 1000);
      lastWrite = scroller.scrollTop;
      following = requestAnimationFrame(step);
    };
    following = requestAnimationFrame(step);
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: first landing and streaming follow share the scroll ownership state
  function land(): void {
    if (landed && opening > 0) {
      return;
    }
    // `scrollToIndex` is virtua's far-row measuring power — needed for the
    // first landing and for catching up from a real distance. For the
    // message-sized follow it was the hard jump per stream batch that read as
    // jitter, so a followable gap goes to the loop untouched.
    const gap = scroller
      ? scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop
      : 0;
    const instant = !landed;
    if (instant) {
      if (snapshot && scroller) {
        scroller.scrollTop = snapshot.tail
          ? scroller.scrollHeight
          : snapshot.offset;
        lastWrite = scroller.scrollTop;
        atBottom = snapshot.tail;
      } else {
        list?.scrollToIndex(rows.length - 1, { align: "end" });
        atBottom = true;
      }
      landed = true;
      settle();
      return;
    }
    // A tab-return whose catch-up has just appended: the reader left at the
    // tail, so the new turns ride in from where they were. A gap past the
    // followable bound is first closed to within it in one silent write, and
    // the loop rides the rest — the same arrival at any distance, rather than
    // a teleport for a long absence. virtua measures the rows the ride
    // crosses as they enter the viewport; the loop reads the live target
    // every frame, so an estimate that firms up mid-ride is absorbed.
    const riding = returning && gap > 0;
    // Consumed by the land that has somewhere to go: the rising edge lands
    // once on the frozen rows (gap 0) before the append does.
    if (gap > 0) {
      returning = false;
    }
    const bound = (scroller?.clientHeight ?? 0) * 2;
    const followable = !!scroller && (gap <= bound || riding);
    if (!followable) {
      if (list) {
        list.scrollToIndex(rows.length - 1, { align: "end" });
      } else if (scroller) {
        scroller.scrollTop = scroller.scrollHeight;
      }
    }
    if (landingFrame !== null) {
      cancelAnimationFrame(landingFrame);
    }
    landingFrame = requestAnimationFrame(() => {
      landingFrame = null;
      if (!(scroller && active && atBottom)) {
        return;
      }
      // The live follow and the catch-up ride the loop. The closing write sits inside
      // the same frame as the loop's start, so the scroll event it raises
      // carries the loop's own tag and is not read as the reader scrolling.
      if (followable) {
        if (
          riding &&
          scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop >
            bound
        ) {
          // One pixel inside the bound: `followBottom` teleports past it,
          // and a scrollTop the browser rounds must not land on the far side.
          scroller.scrollTop =
            scroller.scrollHeight - scroller.clientHeight - bound + 1;
          lastWrite = scroller.scrollTop;
        }
        followBottom();
      } else {
        scroller.scrollTop = scroller.scrollHeight;
      }
      settle();
    });
    atBottom = true;
    landed = true;
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
  // dependency too: when a permission card grows the composer column, the row
  // that was flush with the composer is now behind it, so the tail re-lands.
  //
  // `active` is read FIRST, before the tail it follows. Reading `session.streaming`
  // ahead of the guard re-ran this effect on every streamed frame of a pane
  // nobody was looking at — the same cost `rows` above stops paying, arriving
  // by the other door. Guarding first means an off-screen pane has no
  // dependency on the stream at all; and because `active` is itself tracked,
  // switching back re-runs this once, on rows that have just caught up.
  /** Whether the CURRENT land follows a tab-return: the catch-up's append
   *  is what changed `rows`, and a reader who left at the tail rides to the
   *  new one rather than being teleported. Plain var: raised with the hold
   *  when a switch has something to catch up on, consumed by the land that
   *  follows the append, and dropped if the reader was scrolled up — they
   *  stay where they were. */
  let returning = false;
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
    } else {
      returning = false;
    }
  });

  // Composer height changes are handled entirely by CSS: `--composer-clearance`
  // on the parent adjusts `.tr`'s `padding-bottom`, the browser updates
  // `scrollHeight`, and the existing follow loop (which watches `rows.length`
  // and `session.streaming`) catches any overshoot on the next frame. No JS
  // needed — a padding change is layout, not a scroll event.

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

  function railLed(row: Row): boolean {
    if (row.kind === "single") {
      return !NO_RAIL.has(row.message.type);
    }
    return (
      row.kind === "tools" ||
      row.kind === "harness" ||
      row.kind === "thinking" ||
      (row.kind === "live" && row.thinking !== null) ||
      row.kind === "livetool" ||
      row.kind === "subagent" ||
      row.kind === "delegate"
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

  /** Keys of rows whose line is the same line as the row above them ON SCREEN. */
  const continued = $derived.by(() => {
    const keys = new Set<string>();
    const rowList = built.rows;
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
    if (row.kind === "single" && row.message.type === "user") {
      // The reader's own message, sent from the composer below: it leaves the
      // field they typed it in. A turn that WAITED in the queue was on screen
      // already, as a queued row; it arrives like any other.
      return row.message.metadata?.queuedLocally ? "emerge" : "rise";
    }
    if (row.kind === "question") {
      return "settle";
    }
    // A tool's glance is the call's own line, opening before its message
    // lands: it opens as a call does, and the call it becomes does not.
    return row.kind === "livetool" ? "open" : "rise";
  }

  /**
   * The composer this transcript's reader writes in: the pane's own on a
   * desk (the nearest one up the tree, so a grid of panes finds each its
   * own), and on a phone the deck's — the one composer there is, drawn
   * outside the pane.
   */
  const COMPOSER = 'textarea[aria-label="Message the agent"]';
  function composer(): Element | null {
    for (let node = scroller?.parentElement; node; node = node.parentElement) {
      const field = node.querySelector(COMPOSER);
      if (field) {
        return field;
      }
    }
    return document.querySelector(COMPOSER);
  }

  provideLedger({
    composer,
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

  /** Back to the newest row, from wherever the reader is: a glide, not a jump cut. */
  function jump(): void {
    tickets.clear();
    atBottom = true;
    returning = true;
    land();
  }

  const showLatest = $derived(landed && !atBottom && rows.length > 0);

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
<p aria-atomic="true" aria-live="assertive" class="spoken">{blockedNote}</p>

<div
  aria-label="Session transcript"
  class="tr"
  {onanimationend}
  {onanimationstart}
  {onscroll}
  role="log"
  bind:this={scroller}
>
  <!-- Pinned to the top of the transcript viewport (the foot is the composer's),
       first child so `position: sticky` actually holds. -->
  {#if compacting}
    <div class="compacting-note" role="status">
      <span aria-hidden="true" class="beat"></span>
      Compacting context…
    </div>
  {/if}
  {#if session.loading && rows.length === 0}
    <p class="empty">Loading transcript…</p>
  {:else if rows.length === 0}
    <!-- Not a shrug: where this session runs, then the two keys that do anything
         from the composer below. Left-aligned — this surface is a ledger. -->
    <div class="blank">
      <!-- Both halves or neither: the identity line is `machine : folder`, and
           half of it is a dangling colon. -->
      {#if machineName && cwd}
        <p class="b-where">{machineName} : {cwd}</p>
      {/if}
      <h2 class="b-lead">No messages yet.</h2>
      <p class="b-hint">
        Send the first instruction below — / lists this session's commands, @
        names a machine or session.
      </p>
    </div>
  {/if}

  <!-- The list's own box: what the pin reads virtua's container off. -->
  <div class="listing" bind:this={listing} class:shown>
    <Virtualizer
      cache={snapshot?.cache}
      data={renderedRows}
      getKey={(r) => r.key}
      itemSize={ROW_ESTIMATE}
      {keepMounted}
      scrollRef={scroller}
      shift={built.shifted}
      {ssrCount}
      bind:this={
        () => list,
        (value) => { list = value as unknown as VirtualizerHandle; }
      }
    >
      {#snippet children(row)}
        <TranscriptRow
          continues={continued.has(row.key)}
          id={row.kind === 'tools' ? undefined : row.key}
          leaving={presentation.leaving.has(row.key)}
          motion={motionOf(row)}
          onleft={() => left(row.key)}
        >
          {#snippet children(ticket)}
            {#if row.kind === 'single'}
              <MessageRow
                {agentName}
                carry={ticket?.kind === 'carry' ? ticket.trail : null}
                folding={ticket?.kind === 'fold'}
                message={row.message}
              />
            {:else if row.kind === 'tools'}
              <ToolGroup messages={row.messages} />
            {:else if row.kind === 'question'}
              <QuestionCard message={row.message} />
            {:else if row.kind === 'harness'}
              <SystemLine harness={row.note} />
            {:else if row.kind === 'subagent'}
              <Subagent branch={row.branch} spawn={row.spawn} />
            {:else if row.kind === 'delegate'}
              <Delegate message={row.message} />
            {:else if row.kind === 'thinking'}
              <Thinking live={row.live} text={row.text} />
            {:else if row.kind === 'live'}
              <LiveRow {agentName} announce={active} {row} />
            {:else if row.kind === 'queued'}
              <Queued queued={row.queued} />
            {:else if row.kind === 'livetool'}
              {@const d = describeTool(row.glance.name, undefined, undefined, 'pending')}
              {@const LiveIcon = d.icon}
              <div class="livetool">
                <span class="ic breathe {d.color}"><LiveIcon /></span>
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
  <!-- Under the last row, inside the scroller, from the switch until the
       catch-up has appended: the transcript the reader left is on screen
       already; this says the rest is on its way. -->
  {#if catching}
    <CatchUp />
  {/if}
  <!-- Scrolled away from the tail: the way back, floating above the composer
       column. Zero height in the flow, so its coming and going moves nothing. -->
  {#if showLatest}
    <div class="latest-dock"><Latest onjump={jump} /></div>
  {/if}
</div>

<style>
  .listing:not(.shown) {
    visibility: hidden;
  }
  .tr {
    flex: 1 1 auto;
    overflow-y: auto;
    /* asymmetric content padding is the DESIGN.md ledger signature:
       inline start --space-7 (25), inline end --space-6 (21). */
    padding-block-start: 0;
    padding-inline: var(--space-7) var(--space-6);
    /* The foot clears the floating composer COLUMN, not the bare pill: a
       permission card stacks above the input inside it and can stand 400px
       tall, which used to bury the very message that raised it.
       `--composer-clearance` is that column's measured height plus its offsets,
       published by the pane; the old fixed reserve is the floor, so a bare
       composer looks exactly as it did. */
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
    font-size: var(--text-label);
    color: var(--ink-muted);
    padding-block: var(--space-5);
  }

  /* The empty transcript. Quiet by construction — no fill, no border, no
     illustration; it is a caption on the ledger, so it sits where every other
     row starts rather than in the middle of the pane. */
  .blank {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding-block: var(--space-8);
    line-height: var(--leading-body);
  }
  .b-where {
    font-family: var(--font-mono);
    font-size: var(--text-meta);
    color: var(--ink-muted);
  }
  .b-lead {
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
  }
  .b-hint {
    max-inline-size: 44ch;
    font-size: var(--text-label);
    color: var(--ink-muted);
  }

  .compacting-note {
    position: sticky;
    inset-block-start: var(--space-3);
    z-index: 3;
    inline-size: fit-content;
    max-inline-size: 100%;
    margin-block: 0 var(--space-4);
    margin-inline: auto;
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

  /* The way back to the tail. A zero-height strip stuck to the foot of the
     scrollport, above the composer column; the control hangs up out of it, so
     its coming and going never changes the scroll height it is about. */
  .latest-dock {
    position: sticky;
    inset-block-end: calc(
      max(calc(var(--space-8) * 3), var(--composer-clearance, 0px)) -
      var(--space-4)
    );
    block-size: 0;
    display: flex;
    justify-content: center;
    align-items: end;
    pointer-events: none;

    & > :global(*) {
      pointer-events: auto;
    }
  }

  /* The in-flight tool sits on the same rail column as the calls it becomes,
     at every width — see the breakpoint below. */
  .livetool {
    /* one rhythm value (--space-4) tops every row type; the rail indent is
       --space-2 margin + --space-3 padding, shared across every rail block. */
    margin-block-start: var(--rail-gap, var(--space-4));
    margin-inline-start: var(--space-2);
    padding-inline-start: var(--space-3);
    background: var(--rail-head, var(--rail)) left top / 2px 100% no-repeat;
    min-block-size: 26px;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-label);
    color: var(--ink-strong);

    @media (width <= 900px) {
      margin-inline-start: 0;
    }

    /* No `color` here: the tool family's `text-tool-*` tint governs the
       glyph; the generic case inherits --ink-strong from .livetool. */
    & .ic {
      inline-size: 15px;
      block-size: 15px;
      flex: 0 0 auto;
      display: grid;
      place-items: center;

      & :global(svg) {
        inline-size: 15px;
        block-size: 15px;
      }
    }
    & .tk {
      font-weight: var(--weight-strong);
      color: var(--ink-strong);
      flex: 0 0 auto;
    }
    & .arg {
      font-family: var(--font-mono);
      color: var(--ink-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-inline-size: 0;
    }

    /* The in-flight tool's glyph breathes — the one live channel — so the
       running row reads as in-progress against the still, completed rows in
       ToolGroup. This IS the progress indicator on tool usage; done rows hold
       their glyph. */
    @media (prefers-reduced-motion: no-preference) {
      & .ic.breathe :global(svg) {
        animation: breathe var(--breath) var(--ease-in-out) infinite;
      }
    }
  }
  @keyframes breathe {
    0%,
    100% {
      opacity: 0.5;
    }
    50% {
      opacity: 1;
    }
  }
</style>
