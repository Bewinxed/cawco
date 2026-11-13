/**
 * The scrolling transcript: the folded rows, virtualized. The live tail rides
 * as rows of its own (see `buildRowsFrom`), so streaming text, an open reasoning
 * block and the tool in flight all scroll with the conversation. Announces
 * genuine arrivals — and blocked-on-you — through a dedicated live region
 * beside the log, never through the virtualized container itself.
 */
import { untrack } from "svelte";
import type { VirtualizerHandle } from "virtua/svelte";
import { dur, ease, motionOk } from "#lib/platform/motion/curves.svelte.js";
import { BLEED } from "#lib/platform/motion/rows.svelte.js";
import type { Handoff, Ticket } from "./arrivals.svelte";
import type { Fold, Row } from "./rows";

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
export interface Box {
  /** Its list item's layout top and height, in the list. */
  height: number;
  /** How far the row is drawn off that top: a slide still in flight. */
  shift: number;
  top: number;
}

/** The name a slide's animation goes by, so a newer one can take it over. */
const SLIDE = "send-slide";
export interface SendSlidesHost {
  readonly arrivals: {
    readonly tickets: Map<string, Ticket>;
    readonly watched: boolean;
  };
  readonly landed: boolean;
  readonly pin: {
    readonly list: VirtualizerHandle | undefined;
    readonly listing: HTMLElement | undefined;
  };
  readonly rowBuild: {
    readonly frozenSettled: Row[];
  };
  readonly rowDraw: {
    readonly presentation: { readonly handed: ReadonlyMap<string, Handoff> };
    readonly renderedRows: Row[];
  };
}

export class SendSlides {
  readonly #host: SendSlidesHost;

  /** The mounted rows as they stood before an update that moves a send. */
  beforeMove: Map<string, Box> | null = null;

  /**
   * The rows that stand still above each change in that update: the last row
   * before a send moved, and a replaced send starting its fold. The slide
   * starts under the first of them.
   */
  movedAfter = new Set<string>();

  /** The update folds a replaced send: its slides run on the fold's timing. */
  foldMove: boolean;

  /** Every mounted row's box in the list, by key. */
  measure(): Map<string, Box> {
    const boxes = new Map<string, Box>();
    if (!this.#host.pin.listing) {
      return boxes;
    }
    const origin = this.#host.pin.listing.getBoundingClientRect().top;
    for (const node of this.#host.pin.listing.querySelectorAll<HTMLElement>(
      "[data-row]"
    )) {
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
  settledFrom = new Map<string, string>();

  /**
   * Whether this build moves a row that was already in the list — a send
   * between the wait and its place, a turn settling above a send still
   * waiting, anything put in before a row rather than after it — and if so,
   * every mounted row is measured where it stands. A build that only adds
   * rows at the end, or changes rows in place, moves nothing and measures
   * nothing.
   */
  noteMoves(
    prior: Row[],
    next: Row[],
    ended: Fold["ended"],
    settled: Row[]
  ): void {
    if (
      !untrack(
        () =>
          this.#host.landed && this.#host.arrivals.watched && motionOk.current
      )
    ) {
      return;
    }
    // Both begin with the same settled rows: those are in their places.
    let from =
      settled === this.#host.rowBuild.frozenSettled ? settled.length : 0;
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
    this.beforeMove ??= this.measure();
    this.movedAfter.add(next[from - 1].key);
    if (ended?.into) {
      this.settledFrom.set(ended.into, ended.key);
    }
  }

  /**
   * A row starting its fold: the rows after it are measured where they
   * stand, before the update that regroups them is drawn.
   */
  noteFold(key: string): void {
    if (
      !untrack(
        () =>
          this.#host.landed && this.#host.arrivals.watched && motionOk.current
      )
    ) {
      return;
    }
    this.beforeMove ??= this.measure();
    this.movedAfter.add(key);
    this.foldMove = true;
  }

  /**
   * Every row under the change that was on screen before it, sliding from
   * where it was drawn. A row new to the list arrives by its own entrance; a
   * live row that settled moves from where the live row was; a row that was
   * not on screen before is not seen to move.
   */
  slideMoves = (): void => {
    const boxes = this.beforeMove;
    const after = this.movedAfter;
    const settled = this.settledFrom;
    const timing = this.foldMove
      ? { duration: dur("--duration-panel"), easing: ease("--ease-out") }
      : { duration: dur("--duration-panel"), easing: ease("--ease-in-out") };
    this.beforeMove = null;
    this.movedAfter = new Set();
    this.settledFrom = new Map();
    this.foldMove = false;
    const drawn = this.#host.rowDraw.renderedRows;
    const start = drawn.findIndex((row) => after.has(row.key));
    if (!(boxes && this.#host.pin.listing) || start < 0) {
      return;
    }
    const origin = this.#host.pin.listing.getBoundingClientRect().top;
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
      const node = this.#host.pin.listing.querySelector<HTMLElement>(
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
        this.slide(
          node,
          box,
          now.top - origin - opening,
          now.height,
          timing,
          opening > 0
        );
      } else if (
        this.#host.arrivals.tickets.get(row.key)?.kind === "arrive" &&
        !this.#host.rowDraw.presentation.handed.has(row.key)
      ) {
        arrivedAt = now.top;
      }
    }
  };

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
  readonly slidFrom = new WeakMap<
    HTMLElement,
    { first: string; front: number; top: number }
  >();

  /** Where virtua has the row `key` in the list, by its sizes; null when it is not in the list. */
  offsetOf(key: string): number | null {
    const index = this.#host.rowDraw.renderedRows.findIndex(
      (row) => row.key === key
    );
    return index < 0 || !this.#host.pin.list
      ? null
      : this.#host.pin.list.getItemOffset(index);
  }

  /**
   * How many slide animations are running. The list is re-placed on every
   * row it measures — each row a scroll mounts — and with nothing sliding
   * there is nothing to carry: `carrySlides` reads no layout then.
   */
  sliding = 0;

  /** A slide on `node`, counted for as long as it runs. */
  startSlide(
    node: HTMLElement,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions
  ): void {
    this.sliding += 1;
    const settled = () => {
      this.sliding -= 1;
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
  slide(
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
    const first = this.#host.rowDraw.renderedRows[0]?.key;
    if (first !== undefined) {
      this.slidFrom.set(node, { first, front: this.offsetOf(first) ?? 0, top });
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
    this.startSlide(
      node,
      [{ translate: `0 ${delta}px` }, { translate: "0 0" }],
      timing
    );
    this.startSlide(
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
  carrySlides(scrolled: number): void {
    if (this.sliding === 0 || !this.#host.pin.listing) {
      return;
    }
    const origin = this.#host.pin.listing.getBoundingClientRect().top;
    for (const node of this.#host.pin.listing.querySelectorAll<HTMLElement>(
      "[data-row]"
    )) {
      const was = this.slidFrom.get(node);
      const item = node.parentElement;
      const slides = node
        .getAnimations()
        .filter((each) => each.id === SLIDE && each.playState === "running");
      if (was === undefined || !item || slides.length === 0) {
        this.slidFrom.delete(node);
        continue;
      }
      const top = item.getBoundingClientRect().top - origin;
      const front = this.offsetOf(was.first) ?? was.front;
      const moved = top - was.top - (front - was.front) - scrolled;
      if (Math.abs(moved) <= 0.5) {
        continue;
      }
      this.slidFrom.set(node, { first: was.first, front, top });
      const timing = slides[0].effect?.getComputedTiming();
      const remaining = Math.max(
        ...slides.map(
          (each) =>
            Number(each.effect?.getComputedTiming().duration) -
            Number(each.currentTime)
        )
      );
      this.startSlide(
        node,
        [{ translate: `0 ${-moved}px` }, { translate: "0 0" }],
        {
          duration: remaining,
          easing: timing?.easing,
          composite: "add",
        }
      );
    }
  }

  constructor(host: SendSlidesHost) {
    this.#host = host;
    this.foldMove = false;
  }
}
