/**
 * The scrolling transcript: the folded rows, virtualized. The live tail rides
 * as rows of its own (see `buildRowsFrom`), so streaming text, an open reasoning
 * block and the tool in flight all scroll with the conversation. Announces
 * genuine arrivals — and blocked-on-you — through a dedicated live region
 * beside the log, never through the virtualized container itself.
 */
import { flushSync, onDestroy, untrack } from "svelte";
import { track } from "#lib/platform/track.js";
import type { SessionState } from "../stores/sessions.svelte";
import { rebuildScheduler } from "../workspace/scheduler.svelte";
import {
  buildRowsFrom,
  type Fold,
  type FoldMemo,
  queuedFrom,
  type Row,
  type StepFold,
  stepFold,
} from "./rows";
import type { Box } from "./send-slides.svelte";

/**
 * A build: the rows, whether they grew at the front, and how the last live
 * row ended — and the array the rows begin with, `settled`: the fold's
 * settled rows (rows.ts `FoldMemo.drawn`), the same array from one build to
 * the next for as long as none of them moves. Whatever is read off every
 * row is read off those once for each such array (`perSettled`), and off
 * the rows after them each build: a streamed word moves the tail alone.
 */
export interface Built {
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
export const NO_ROWS: Row[] = [];

/** Rows whose data is the live tail's own — they exist only while the session is live. */
export const LIVE_KINDS = new Set<Row["kind"]>(["live", "livetool", "queued"]);

/** How long a step of a stepped fold runs, ms: a quarter of a frame here, a frame on a CPU four times slower. Our own call. */
const STEP_MS = 4;

/** Where a build's own tail — the live row, the tool in flight, the queue — begins. */
export function tailStart(sequence: Row[]): number {
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
export interface RowBuildHost {
  readonly arrivals: {
    readonly ledger: (fold: Fold) => void;
  };
  readonly atBottom: boolean;
  buffer: number;
  frontHeld: string[];
  readonly isFocused: boolean;
  readonly landed: boolean;
  lastWrite: number | null;
  olderRoom: number;
  readonly onList: () => Set<string>;
  readonly scroller: HTMLElement | undefined;
  readonly session: SessionState;
  readonly slides: {
    readonly beforeMove: Map<string, Box> | null;
    readonly noteMoves: (
      prior: Row[],
      next: Row[],
      ended: Fold["ended"],
      settled: Row[]
    ) => void;
    readonly slideMoves: () => void;
  };
  readonly visible: boolean;
}

export class RowBuild {
  readonly #host: RowBuildHost;

  frozen: Row[] = [];

  /** The rows `frozen` begins with as the fold keeps them (see `Built`). */
  frozenSettled: Row[] = NO_ROWS;

  /** Whether the rows on screen were built with a page before them (`Built.before`). */
  frozenBefore: boolean;

  /** The rows already on screen, handed back unchanged: nothing moved, nothing ended. */
  readonly STILL_BUILD = (): Built => ({
    before: this.frozenBefore,
    rows: this.frozen,
    settled: this.frozenSettled,
    shifted: false,
    ended: null,
  });

  /**
   * The second step of a change virtua has to take in two (see `build`):
   * the rows it ends on, and the bump that hands them over.
   */
  pending: { rows: Row[]; settled: Row[] } | null = null;

  secondStep = $state(0);

  /** What `frozen` was folded from — the incremental fold's memory. */
  memo: FoldMemo | null = null;

  /** Whether `frozen` holds a real build yet — the first one is unconditional. */
  primed: boolean;

  /** Bumped by the scheduler. The ONLY dependency of an unfocused rebuild. */
  rebuildTick = $state(0);

  /**
   * The switch flush, and the frame it paints: while this holds, the rows
   * are the frozen ones whatever the session says. Raised by the build that
   * first sees the rising edge of `visible` / `focused` with something to
   * catch up on (see `hold`), let go once that flush has painted.
   */
  held: boolean;

  /** Bumped when the hold lets go: the build's dependency on the release. */
  released = $state(0);

  /**
   * How many times `visible` or `focused` has risen. A count rather than the
   * two flags, so the build it feeds is invalidated by a rising edge alone: a
   * pane leaving view is no reason to rebuild it inside that flush.
   */
  seenVisible: boolean;

  seenFocused: boolean;

  rises = 0;

  readonly risen = $derived.by(() => {
    if (
      (this.#host.visible && !this.seenVisible) ||
      (this.#host.isFocused && !this.seenFocused)
    ) {
      this.rises += 1;
    }
    this.seenVisible = this.#host.visible;
    this.seenFocused = this.#host.isFocused;
    return this.rises;
  });

  /** The count the last build saw: a build that sees a higher one is the switch's. */
  builtRises = 0;

  /**
   * From the switch until the append lands — what the tail indicator shows.
   * Distinct from `held` because the fold itself happens after the hold is
   * released, and the indicator should stay until it has.
   */
  catching = $state(false);

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
  builtPrint = "";

  /**
   * Each message array this view folds gets a number. The ledger reads a new
   * array as history and a grown one as live, so a build must see every new
   * array: the store's read replacing the server's stand-in with a list of
   * the same length printed the same, was never built, and the first turn
   * pushed onto the store's list was taken for history — the reader's own
   * message arriving still.
   */
  readonly arrays = new WeakMap<object, number>();

  arraySerial = 0;

  readonly arrayOf = (messages: object): number => {
    let serial = this.arrays.get(messages);
    if (serial === undefined) {
      this.arraySerial += 1;
      serial = this.arraySerial;
      this.arrays.set(messages, serial);
    }
    return serial;
  };

  // Where the waiting messages begin and which message ends the conversation
  // before them: a read moves a row there without changing how many
  // messages there are.
  readonly printOf = (): string => {
    const settled = queuedFrom(this.#host.session.messages);
    const last = this.#host.session.messages[settled - 1];

    return (
      `${this.arrayOf(this.#host.session.messages)}:${this.#host.session.messages.length}:${settled}:${last?.id ?? ""}:${this.#host.session.streaming.length}:` +
      `${this.#host.session.thinkingStream.length}:${this.#host.session.busy ? 1 : 0}:${this.#host.session.pending.map((ask) => `${ask.requestId}${ask.routedTo ?? ""}`).join(",")}:` +
      `${this.#host.session.openBlock}:${this.#host.session.thinkingClosing}:${this.#host.session.currentTool?.toolId ?? ""}:${this.#host.session.sdkStatus}:${this.#host.session.lastCompaction?.at ?? ""}:${this.#host.session.cursor === null ? 0 : 1}:` +
      `${last?.metadata?.sendFailed ?? ""}:${this.#host.session.rev}`
    );
  };

  /** Dev-only: the gate that catches an accidentally tracked session read. */
  readonly countBuild = (): void => {
    if (!import.meta.env.DEV || typeof window === "undefined") {
      return;
    }
    const w = window as unknown as {
      __transcriptBuilds?: Record<string, number>;
    };
    w.__transcriptBuilds ??= {};
    const key = this.#host.session.instanceId;
    w.__transcriptBuilds[key] = (w.__transcriptBuilds[key] ?? 0) + 1;
  };

  readonly built = $derived.by<Built>(() => {
    track(this.secondStep);
    track(this.fronted);
    // The switch flush paints what is already there; the catch-up comes
    // after the paint, through the hold letting go.
    if (this.risen !== this.builtRises) {
      this.builtRises = this.risen;
      if (
        this.primed &&
        !this.held &&
        untrack(() => this.printOf() !== this.builtPrint)
      ) {
        this.hold();
      }
    }
    track(this.released);
    if (this.held) {
      return this.STILL_BUILD();
    }
    // A pane born off screen would otherwise hold an empty transcript until it
    // was first looked at, so the first build never consults the tier.
    if (!this.#host.isFocused && this.primed) {
      // Read, not used: this is `built`'s reactive dependency on the unfocused
      // tier's own clock — its change is what re-runs this branch to re-check
      // the print, in place of the tracked reads `untrack` below hides.
      track(this.rebuildTick);
      return untrack(this.rebuild);
    }
    // The print is the whole of what a focused build depends on: the live
    // tail's fields and the store's revision of the rows (`session.rev`),
    // which moves whenever a row is placed, moved or takes the hub's word.
    // The fold itself reads every row of the conversation, and tracked, each
    // build of a long transcript registered (and the next one compared) a
    // dependency per field per row, on every streamed frame.
    this.printOf();
    return untrack(this.rebuild);
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
  rebuild = (): Built => {
    const caught = this.catchUp;
    this.catchUp = false;
    const current = this.printOf() === this.builtPrint;
    const next = this.pending;
    this.pending = null;
    if (next && current) {
      return {
        before: this.#host.session.cursor !== null,
        rows: next.rows,
        settled: next.settled,
        shifted: frontOnly(this.frozen, next.rows),
        ended: null,
      };
    }
    if (this.primed && current) {
      return this.STILL_BUILD();
    }
    return this.run(caught);
  };

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
  hold(): void {
    this.held = true;
    queueMicrotask(() => {
      this.catching = true;
    });
    requestAnimationFrame(() => {
      setTimeout(() => {
        this.held = false;
        this.catchUp = true;
        this.released += 1;
      }, 0);
    });
  }

  /** The next build is the catch-up behind a switch's paint (`hold`): what it appends is folded in steps (`foldInSteps`). */
  catchUp: boolean;

  run(caught = false): Built {
    if (this.stepping) {
      if (this.stepping.list === this.#host.session.messages) {
        return this.STILL_BUILD();
      }
      // The list moved on under the fold (another page in front, a read):
      // what it is now decides.
      this.stepping = null;
    }
    const steps = this.primed
      ? stepFold(this.#host.session, this.memo, caught)
      : null;
    if (steps) {
      this.foldInSteps(steps);
      return this.STILL_BUILD();
    }
    this.countBuild();
    this.builtPrint = this.printOf();
    return this.build();
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
  stepping: StepFold | null = null;

  /** Bumped when a page in front is folded: the build's dependency on it. */
  fronted = $state(0);

  foldInSteps(steps: StepFold): void {
    this.stepping = steps;
    let folded = false;
    const step = () =>
      requestAnimationFrame(() =>
        setTimeout(() => {
          if (this.stepping !== steps) {
            return;
          }
          // The hand-over in a task of its own: behind the last step, it
          // was that step and the drawing of the rows in one.
          if (!folded) {
            folded = steps.step(STEP_MS);
            step();
            return;
          }
          this.handOver(steps);
        })
      );
    step();
  }

  /** The stepped fold's rows, handed to the build (`fronted`). */
  handOver(steps: StepFold): void {
    this.memo = steps.memo();
    this.stepping = null;
    if (steps.front) {
      // Handed over with nothing mounted past what is (`frontHeld`): the
      // screen above fills a step a task (`buffer`).
      this.#host.frontHeld = [...this.#host.onList()];
      this.#host.buffer = 0;
    }
    // The page that ends the conversation's pages takes the strip before
    // the list with it (`Built.before`).
    const strip =
      steps.front &&
      this.frozenBefore &&
      this.#host.session.cursor === null &&
      !this.#host.atBottom
        ? this.#host.olderRoom
        : 0;
    this.fronted += 1;
    if (strip > 0 && this.#host.scroller) {
      this.stripGone(this.#host.scroller, strip);
    }
  }

  /**
   * THE STRIP GOES WITH THE PAGE THAT ENDS IT, AND MOVES NOTHING. Left to
   * its own observer (`keepPlace`), WebKit delivered its shrink a frame
   * after the rows came in under it (transcript-holds, webkit 390: the
   * row at the view's top painted 53.375px up for a frame). So the flush
   * that hands the page over is run now, and the view moved up by the
   * strip's height in the same task, behind virtua's own jump (whose write
   * laid the page out): the observer then hears nothing left to move.
   */
  stripGone(node: HTMLElement, strip: number): void {
    flushSync();
    this.#host.olderRoom = 0;
    node.scrollTop -= strip;
    this.#host.lastWrite = node.scrollTop;
  }

  build(): Built {
    const folded = buildRowsFrom(this.#host.session, this.memo);
    const { rows: next } = folded;
    ({ memo: this.memo } = folded);
    const settled = folded.memo.drawn.rows;
    this.#host.arrivals.ledger(folded);
    this.#host.slides.noteMoves(this.frozen, next, folded.ended, settled);
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
    const landedNow = untrack(() => this.#host.landed);
    const shifted = landedNow && frontOnly(this.frozen, next);
    // TWO STEPS. The read that replaces the server's tail with the live
    // session's can change both ends at once: rows dropped or added in
    // front, and the live row arriving at the end. virtua's `shift` moves
    // its sizes at ONE end per update, and with neither the rows on screen
    // lost their sizes, hid, and reappeared measured somewhere else (0.66
    // mid-turn at 1440). So the end goes first — the rows before it
    // untouched, their sizes where they were — and the front a microtask
    // later, as the shift it is. Both land before the paint.
    if (landedNow && !shifted) {
      const was = tailStart(this.frozen);
      const now = tailStart(next);
      // The same settled rows, or as many, is no change in front: asked
      // before copying either.
      if (
        settled !== this.frozenSettled &&
        was !== now &&
        frontOnly(this.frozen.slice(0, was), next.slice(0, now))
      ) {
        this.pending = { rows: next, settled };
        queueMicrotask(() => {
          this.secondStep += 1;
        });
        return {
          before: this.#host.session.cursor !== null,
          rows: [...this.frozen.slice(0, was), ...next.slice(now)],
          // The last build's settled rows, still in front: a tail never
          // holds a settled row (rows.ts `tailRows`).
          settled:
            this.frozenSettled.length <= was ? this.frozenSettled : NO_ROWS,
          shifted: false,
          ended: folded.ended,
        };
      }
    }
    return {
      before: this.#host.session.cursor !== null,
      rows: next,
      settled,
      shifted,
      ended: folded.ended,
    };
  }

  readonly rows = $derived.by(() => this.built.rows);

  /**
   * How many rows there are, apart from the rows themselves: every build is
   * a new list, a streamed word's included, and what asks for an older page
   * cares only when a page has changed how many there are.
   */
  readonly rowCount = $derived.by(() => this.rows.length);

  constructor(host: RowBuildHost) {
    this.#host = host;
    this.frozenBefore = false;
    this.primed = false;
    this.held = false;
    this.seenVisible = false;
    this.seenFocused = false;
    this.catchUp = false;

    onDestroy(() => {
      this.stepping = null;
    });

    /**
     * Take a turn in the rotation while unfocused — the visible tier beside the
     * pane being read, the slow tier when hidden behind it — and give it back
     * on focus. The fingerprint is every cheap O(1) reading that means "there
     * is something new to draw" — deliberately not a deep comparison, because
     * the point is to skip the expensive build, not to do an expensive check
     * first.
     */
    $effect(() => {
      if (this.#host.isFocused) {
        return;
      }
      return rebuildScheduler.join(
        this.#host.session.instanceId,
        this.printOf,
        () => {
          this.rebuildTick += 1;
        },
        this.#host.visible ? "visible" : "hidden"
      );
    });

    // Side effects that the derived CANNOT carry (Svelte forbids writes inside
    // $derived). An $effect runs after the derived is read but before the DOM
    // renders, so the bookkeeping stays in sync with what the Virtualizer sees.
    $effect(() => {
      const { rows: next, settled, before } = this.built;
      this.frozen = next;
      this.frozenSettled = settled;
      this.frozenBefore = before;
      this.primed = true;
      // The append has landed: the rows on screen are the session's again, and
      // the indicator under them has nothing left to wait for.
      if (!(this.held || this.stepping) && untrack(() => this.catching)) {
        this.catching = false;
      }
      // The update is in: what it moved starts where it was drawn.
      if (this.#host.slides.beforeMove) {
        untrack(this.#host.slides.slideMoves);
      }
    });
  }
}
