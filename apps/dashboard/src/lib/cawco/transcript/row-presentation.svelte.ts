/**
 * The scrolling transcript: the folded rows, virtualized. The live tail rides
 * as rows of its own (see `buildRowsFrom`), so streaming text, an open reasoning
 * block and the tool in flight all scroll with the conversation. Announces
 * genuine arrivals — and blocked-on-you — through a dedicated live region
 * beside the log, never through the virtualized container itself.
 */
import { onDestroy, untrack } from "svelte";
import type { Attachment } from "svelte/attachments";
import {
  type FrameObserver,
  frameObserver,
} from "#lib/platform/frame-observer.js";
import { motionOk } from "#lib/platform/motion/curves.svelte.js";
import { track } from "#lib/platform/track.js";
import { repeatedKey, reportRepeat } from "../repeated-keys";
import type { SessionState } from "../stores/sessions.svelte";
import { callId } from "./arrival-ledger.svelte";
import type { Handoff, Ticket } from "./arrivals.svelte";
import { type Built, NO_ROWS } from "./row-build.svelte";
import { called, type Fold, type Row, rowSaid } from "./rows";

/** Which keys a list of rows holds. */
export interface Keys {
  has: (key: string) => boolean;
}

/**
 * A row that can leave the list, as it was last drawn, with where it stood:
 * the keys of the rows above it, nearest first, back to the first one that
 * cannot leave — or none, when it was the first row.
 */
interface Standing {
  above: string[];
  row: Row;
}

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
 * `read` of a build's settled rows (`Built`'s `settled`), once for each
 * array the fold hands over: a new array is a settled row moved, gone or
 * changed (rows.ts `stillDrawn`: the store's revision moves with every
 * change to a message), so what was read of the last one still holds.
 */
export function perSettled<T>(
  read: (settled: Row[]) => T
): (settled: Row[]) => T {
  const seen = new WeakMap<Row[], T>();
  return (settled) => {
    if (!seen.has(settled)) {
      seen.set(settled, read(settled));
    }
    return seen.get(settled) as T;
  };
}

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
 * Whether `row` can leave the list: a tail row, a failed send its retry
 * replaces, or a compaction still running, which goes when it turns out
 * never to have happened (skipped, or stopped: rows.ts `outcome`).
 */
const canLeave = (row: Row): boolean =>
  TAIL_KINDS.has(row.kind) ||
  (row.kind === "single" && row.message.state === "failed") ||
  (row.kind === "compaction" && row.state === "compacting");
export interface RowPresentationHost {
  readonly arrivals: {
    readonly tickets: Map<string, Ticket>;
    readonly watched: boolean;
  };
  readonly landed: boolean;
  readonly pin: {
    readonly listing: HTMLElement | undefined;
  };
  readonly rowBuild: {
    readonly built: Built;
  };
  readonly session: SessionState;
  readonly slides: {
    readonly noteFold: (key: string) => void;
  };
}

export class RowPresentation {
  readonly #host: RowPresentationHost;

  readonly settledKeys = perSettled(
    (settled) => new Set(settled.map((row) => row.key))
  );

  /** The keys of `among`, which begins with `settled`: those read once, the rest now. */
  keysIn(among: Row[], settled: Row[]): Keys {
    const known = this.settledKeys(settled);
    const rest = new Set<string>();
    for (let i = settled.length; i < among.length; i += 1) {
      rest.add(among[i].key);
    }
    return { has: (key) => known.has(key) || rest.has(key) };
  }

  /** Where among settled rows the ones that can leave stand (`canLeave`): a failed send, a compaction running. */
  readonly leavableIn = perSettled((settled) =>
    settled.flatMap((row, index) => (canLeave(row) ? [index] : []))
  );

  /** The live tail's rows and the failed sends, as last drawn. */
  standing = new Map<string, Standing>();

  /** Rows folding shut where they stood. */
  leaving: Standing[] = [];

  leftTick = $state(0);

  /** The keys the list drew last: a row not among them is new. */
  drawnKeys: Keys = new Set<string>();

  /**
   * Whether the row `key` has left the list, rather than become something
   * else in it: a live row that became its settled row, or a tool's glance
   * whose call has landed, is already on screen in its new form, and a
   * queued message the session read is still in the list under its key.
   */
  hasLeft(key: string, row: Row, ended: Fold["ended"]): boolean {
    if (row.kind === "single") {
      return untrack(
        () => this.#host.session.records[key]?.state === "replaced"
      );
    }

    return !(
      (ended?.key === key && ended.into !== null) ||
      (row.kind === "livetool" &&
        untrack(() => called(this.#host.session, row.glance.toolId)))
    );
  }

  /** The build the rows were last drawn from (`presentation`). */
  drawnFrom: Built | null = null;

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
  readonly presentation = $derived.by(() => {
    track(this.leftTick);
    const from = this.#host.rowBuild.built;
    const shifted = from.shifted && from !== this.drawnFrom;
    this.drawnFrom = from;
    const { rows: next, ended, settled } = from;
    return untrack(() => ({
      ...this.withLeaving(next, settled, ended),
      shifted,
    }));
  });

  /**
   * The rows as drawn: `next`, with the rows folding shut where they stood,
   * and the settled rows they still begin with — none, when a row folding
   * shut stands among those.
   */
  withLeaving(next: Row[], settled: Row[], ended: Fold["ended"]) {
    const present = this.keysIn(next, settled);
    const folding = new Set(this.leaving.map(({ row }) => row.key));
    const handed = new Map<string, Handoff>();
    // Only a row on screen folds or hands its place on: one outside virtua's
    // range, or one no frame has laid out yet (`drawnHeights`), has nothing
    // to fold, and nobody to see it go.
    for (const [key, stood] of this.standing) {
      if (present.has(key) || folding.has(key)) {
        continue;
      }
      const node = this.drawnRow(key);
      const height = node ? this.drawnHeights.get(node) : undefined;
      if (
        !node ||
        height === undefined ||
        this.handOn(node, height, this.takerOf(key, stood, next, ended), handed)
      ) {
        continue;
      }
      if (this.hasLeft(key, stood.row, ended)) {
        this.leaving.push(stood);
        this.#host.slides.noteFold(key);
      }
    }
    this.leaving = this.leaving.filter(({ row }) => !present.has(row.key));
    // The rows themselves, when nothing folds: a streamed word copies none.
    const drawn = this.leaving.length > 0 ? [...next] : next;
    // Where the first row put back in stands: one among the settled rows
    // means the list no longer begins with them.
    let first = drawn.length;
    // Each goes back in where it stood. One that stood under another row on
    // its way out goes in once that one is in; one whose place is not in the
    // list any more — the rows around it read again from history — was not
    // seen to go, and is let go with them.
    let unplaced = this.leaving;
    let placed = true;
    while (unplaced.length > 0 && placed) {
      placed = false;
      unplaced = unplaced.filter(({ above, row }) => {
        const at = this.placeIn(drawn, above, ended);
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
    this.leaving = this.leaving.filter(({ row }) => !lost.has(row.key));
    const begins = first >= settled.length ? settled : NO_ROWS;
    this.standing = this.standingIn(drawn, begins, present);
    this.drawnKeys = this.keysIn(drawn, begins);
    return {
      rows: drawn,
      settled: begins,
      leaving: new Set(this.leaving.map(({ row }) => row.key)),
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
  handOn(
    node: HTMLElement,
    height: number,
    taker: Taker | null,
    handed: Map<string, Handoff>
  ): boolean {
    if (!taker) {
      return false;
    }
    const ghost = taker.replaces ? this.ghostOf(node) : null;
    if (!taker.absorbs) {
      handed.set(taker.key, { from: height, ghost, taken: false });
      return true;
    }
    const holder = this.drawnRow(taker.key);
    const own = holder ? this.drawnHeights.get(holder) : undefined;
    if (
      own !== undefined &&
      untrack(
        () =>
          this.#host.landed && this.#host.arrivals.watched && motionOk.current
      )
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
  ghostOf(node: HTMLElement): HTMLElement {
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
  readonly drawnRow = (key: string): HTMLElement | null | undefined =>
    this.#host.pin.listing?.querySelector<HTMLElement>(
      `[data-row="${CSS.escape(key)}"]`
    );

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
  readonly drawnHeights = new WeakMap<Element, number>();

  /** The rows' size observer, made by the first row the list mounts (none on the server). */
  rowSizes: FrameObserver | null = null;

  /**
   * The rows' size observer, made here and not in a row's attachment: made
   * there, its reader closed over that row, and held the first row the list
   * mounted for as long as the list lived (tab-return's detached leg).
   */
  rowSizesOf(): FrameObserver {
    this.rowSizes ??= frameObserver(null, {
      read: (entries) => {
        for (const entry of entries) {
          const height = entry.borderBoxSize[0]?.blockSize;
          if (height !== undefined) {
            this.drawnHeights.set(entry.target, height);
          }
        }
      },
    });
    return this.rowSizes;
  }

  /** A row of the list, heard as each frame lays it out (`drawnHeights`). */
  readonly measureRow: Attachment<HTMLElement> = (node) => {
    const sizes = this.rowSizesOf();
    sizes.observe(node, { box: "border-box" });
    return () => {
      sizes.unobserve(node);
      this.drawnHeights.delete(node);
    };
  };

  /** A row's height as the last frame laid it out (`drawnHeights`): what its fold starts from (Row's `heightOf`). */
  readonly heightOfRow = (row: HTMLElement): number | undefined =>
    this.drawnHeights.get(row);

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
  takerOf(
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
          absorbs: this.drawnKeys.has(holder.key),
          replaces: false,
        };
      }
    }
    if (!(TAIL_KINDS.has(row.kind) && this.hasLeft(key, row, ended))) {
      return null;
    }
    const at = this.placeIn(next, stood.above, ended);
    const heir = next[at];
    const turns = row.kind !== "queued";
    if (
      heir &&
      !this.drawnKeys.has(heir.key) &&
      (turns || TAIL_KINDS.has(heir.kind))
    ) {
      return { key: heir.key, absorbs: false, replaces: true };
    }
    const runAbove = next[at - 1];
    if (
      turns &&
      runAbove?.kind === "tools" &&
      this.drawnKeys.has(runAbove.key) &&
      runAbove.messages.some(
        (m) => this.#host.arrivals.tickets.get(callId(m))?.kind === "arrive"
      )
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
  standingIn(
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
    for (const index of this.leavableIn(settled)) {
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
  placeIn(drawn: Row[], above: string[], ended: Fold["ended"]): number {
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

  /**
   * The rows virtua keys, as they are, once their keys were checked: a key
   * held twice is reported with both rows and what moved the page last
   * (repeated-keys.ts), before the keyed each throws on it. The settled
   * rows they begin with are checked once for each such array, the rest
   * each time.
   */
  readonly settledRepeat = perSettled((settled) =>
    repeatedKey(settled, (row) => row.key)
  );

  keysChecked(drawn: Row[], settled: Row[]): Row[] {
    const repeat =
      (settled.length > 0 ? this.settledRepeat(settled) : null) ??
      repeatedKey(
        drawn,
        (row) => row.key,
        settled.length,
        this.settledKeys(settled)
      );
    if (repeat) {
      reportRepeat("transcript's rows", repeat, rowSaid);
    }
    return drawn;
  }

  readonly renderedRows = $derived.by(() =>
    this.keysChecked(this.presentation.rows, this.presentation.settled)
  );

  left(key: string): void {
    this.leaving = this.leaving.filter(({ row }) => row.key !== key);
    this.leftTick += 1;
  }

  /**
   * A leaving row's report, bound to its key when `Row` reads it — as its
   * fold starts. The list item behind a row is a live view of an index, and
   * by the time a fold finishes the tail can have changed under it (a queued
   * message read mid-turn leaves as its turn lands above), so reading the key
   * then read past the end of the list and the row never left.
   */
  readonly leaver = (key: string) => () => this.left(key);

  constructor(host: RowPresentationHost) {
    this.#host = host;

    onDestroy(() => this.rowSizes?.disconnect());
  }
}
