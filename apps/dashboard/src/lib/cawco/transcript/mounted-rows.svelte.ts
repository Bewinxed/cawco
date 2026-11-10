/**
 * The scrolling transcript: the folded rows, virtualized. The live tail rides
 * as rows of its own (see `buildRowsFrom`), so streaming text, an open reasoning
 * block and the tool in flight all scroll with the conversation. Announces
 * genuine arrivals — and blocked-on-you — through a dedicated live region
 * beside the log, never through the virtualized container itself.
 */
import { untrack } from "svelte";
import type { VirtualizerHandle } from "virtua/svelte";
import { track } from "#lib/platform/track.js";
import type { SessionState } from "../stores/sessions.svelte";
import { warm } from "../workspace/warm.svelte";
import type { Row } from "./rows";

/** What every list item carries: the name its drawn rule finds it by (the style's `[data-item]`). */
const ITEM_ATTRS = { "data-item": "" };

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
export const BUFFER_SCREENS = 0.5;

const NO_SKIPS: ReadonlyMap<string, number> = new Map();

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
export interface MountedRowsHost {
  readonly atBottom: boolean;
  readonly landingAway: ReturnType<typeof setTimeout> | undefined;
  readonly list: VirtualizerHandle | undefined;
  readonly listing: HTMLElement | undefined;
  readonly pinBottom: () => void;
  readonly rowBuild: {
    readonly fronted: number;
  };
  readonly rowDraw: {
    readonly presentation: {
      readonly leaving: ReadonlySet<string>;
      readonly settled: Row[];
    };
    readonly renderedRows: Row[];
  };
  readonly session: SessionState;
  readonly shown: boolean;
  readonly viewHeight: number;
  readonly visible: boolean;
}

export class MountedRows {
  readonly #host: MountedRowsHost;

  /**
   * The rows mounted as a page in front is handed over, by key, kept
   * mounted while the buffer steps back up (`keepMounted`). Handed over
   * with virtua's buffer, the screen above the view filled at once with
   * rows it had never measured, at `ROW_ESTIMATE` each: 40 rows mounted in
   * the hand-over's task, 80ms of its 185 (transcript-holds' wheel).
   */
  frontHeld = $state<string[]>([]);

  /**
   * A row a warming pane holds is skipped while it stages (`skipping`, set
   * by `parkRows`), and a row the view did not show as the pane was put away
   * until it is styled again (`aside`): its content is not styled, and its
   * box keeps the size virtua already has for it, so virtua's observer reads
   * that same size and nothing moves.
   */
  readonly itemAttrs = ({ item }: { item: Row }) => {
    const px = this.skipped.get(item.key) ?? this.aside.get(item.key);
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

  /** A far landing: virtua mounts what is on screen alone (`landFar`). */
  narrow = $state(false);

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
  unseen: boolean;

  /** The rows mounted as the pane was put away, by key: kept mounted while it is away (`keepMounted`). */
  away = $state.raw<ReadonlySet<string>>(new Set());

  /** virtua's buffer as the pane was put away: what the rows it kept span (`away`). */
  keptBuffer = 0;

  /** The rows skipped since the pane was put away, each at virtua's size for it, px, nearest the view first (`itemAttrs`). */
  aside = $state.raw<ReadonlyMap<string, number>>(new Map());

  /**
   * How long each mounted row's text was as the pane was put away, by key:
   * what virtua last measured (`parkRows`). Read off the page's text, never
   * its layout.
   */
  putAway = new Map<string, number>();

  /** Whether the pane was seen at the last look: one put away keeps what it has mounted (`away`). */
  wasSeen: boolean;

  buffer = $state(0);

  /**
   * The mounted rows the view does not show, each at virtua's size for it,
   * nearest the view first: skipped while the pane is away (`aside`). A row
   * virtua never measured (its `hide`) is left to be measured as the pane
   * is laid out. Attributes and virtua's sizes alone: nothing here reads the
   * page's layout.
   */
  rowsAside(): ReadonlyMap<string, number> {
    const container = this.#host.listing?.firstElementChild;
    if (!(container && this.#host.list)) {
      return new Map();
    }
    const top = this.#host.list.getScrollOffset();
    const first = this.#host.list.findItemIndex(top);
    const last = this.#host.list.findItemIndex(
      top + this.#host.list.getViewportSize()
    );
    const at = new Map(
      this.#host.rowDraw.renderedRows.map((row, index) => [row.key, index])
    );
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
        px: this.#host.list.getItemSize(index),
        far: index < first ? first - index : index - last,
      });
    }
    out.sort((a, b) => a.far - b.far);
    return new Map(out.map(({ key, px }) => [key, px]));
  }

  /** The rows skipped aside that the view from `top` shows are styled from here on (a scroll's, `onListScroll`). */
  liftInView(top: number): void {
    if (!this.#host.list) {
      return;
    }
    const last = this.#host.list.findItemIndex(
      top + this.#host.list.getViewportSize()
    );
    const inView: string[] = [];
    for (
      let index = this.#host.list.findItemIndex(top);
      index <= last;
      index += 1
    ) {
      const key = this.#host.rowDraw.renderedRows[index]?.key;
      if (key !== undefined && this.aside.has(key)) {
        inView.push(key);
      }
    }
    if (inView.length > 0) {
      this.aside = new Map(
        [...this.aside].filter(([key]) => !inView.includes(key))
      );
    }
  }

  /** The rows of the view a far landing left, held mounted while it lands. */
  lingering = $state<number[]>([]);

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
  heldRows = $state<string[]>([]);

  /** The rows still skipped while they stage, each at virtua's size for it, px. */
  skipping = $state.raw<ReadonlyMap<string, number>>(new Map());

  /** What `itemAttrs` skips: nothing once the pane is shown. */
  readonly skipped = $derived.by(() =>
    this.#host.visible ? NO_SKIPS : this.skipping
  );

  /** Each hold's number: whose rows a step in hand is staging. */
  parkings = 0;

  parkRows = (): void => {
    const container = this.#host.listing?.firstElementChild;
    if (!(container && this.#host.list)) {
      return;
    }
    // Attributes alone: nothing here reads the page's layout. A row skipped
    // aside stays so until the pane is shown (`aside`): not held here.
    const holding: string[] = [];
    const unmeasured = new Set<string>();
    for (const item of container.children) {
      const key = item.querySelector<HTMLElement>(":scope > [data-row]")
        ?.dataset.row;
      if (key && !this.aside.has(key)) {
        holding.push(key);
        if ((item as HTMLElement).style.visibility === "hidden") {
          unmeasured.add(key);
        }
      }
    }
    if (holding.length === 0) {
      return;
    }
    const at = new Map(
      this.#host.rowDraw.renderedRows.map((row, index) => [row.key, index])
    );
    // A row rewritten since the pane was put away (its text changed: the
    // live row a turn streamed into) has outgrown the size virtua has for
    // it: it is not skipped, and is measured in the frame that lays the
    // pane out. Skipped and let go by a far landing, it kept that size above
    // the view (tab-return 1b: the list 15.5px short of main's).
    const now = this.textOfRows();
    const rewritten = (key: string) =>
      this.putAway.has(key) && this.putAway.get(key) !== now.get(key);
    const skips = new Map<string, number>();
    for (const key of holding) {
      const index = at.get(key);
      if (index !== undefined && !rewritten(key)) {
        skips.set(key, this.#host.list.getItemSize(index));
      }
    }
    // The rows virtua never measured stage first: their first measurement
    // lands in the first step, behind the frame that laid the pane out.
    this.heldRows = [
      ...holding.filter((key) => unmeasured.has(key)),
      ...holding.filter((key) => !unmeasured.has(key)),
    ];
    this.skipping = skips;
    this.parkings += 1;
    const own = this.parkings;
    // The task after the frame that lays the pane out, then a step a task.
    const step = () =>
      requestAnimationFrame(() =>
        setTimeout(() => {
          if (own === this.parkings && this.stageStep()) {
            step();
          }
        })
      );
    step();
  };

  /** How long each mounted row's text is, by key. */
  textOfRows(): Map<string, number> {
    const lengths = new Map<string, number>();
    for (const item of this.#host.listing?.firstElementChild?.children ?? []) {
      const row = item.querySelector<HTMLElement>(":scope > [data-row]");
      if (row?.dataset.row) {
        lengths.set(row.dataset.row, row.textContent?.length ?? 0);
      }
    }
    return lengths;
  }

  /** One step of the staging (`parkRows`); answers whether another is due. */
  stageStep(): boolean {
    // A far landing on its way lets the view it leaves go itself, a step a
    // task (`landFar`, `catchUpRest`): the held rows wait, still skipped,
    // and go unstyled; let go here as well, their removal landed in the
    // frame of the landing's own step (tab-return 1b: 14.2ms).
    if (this.staging || this.narrow || this.#host.landingAway !== undefined) {
      return true;
    }
    // Nor in the frame the away landing's scroll comes in: its `onscroll`
    // reads the list's place, and the rows styled here were styled there
    // (tab-return 1a: 277 elements, a 13.3ms scroll event). Two steps at
    // most, should no scroll come.
    if (this.awayScroll > 0) {
      this.awayScroll -= 1;
      return true;
    }
    if (this.heldRows.length > 0) {
      const done = this.heldRows.slice(0, STAGE_ROWS);
      this.heldRows = this.heldRows.slice(STAGE_ROWS);
      this.liftSkips(done.filter((key) => this.onList().has(key)));
    } else {
      this.liftSkips(this.stillMounted().slice(0, STAGE_ROWS));
    }
    return this.heldRows.length > 0 || this.skipping.size > 0;
  }

  /** The keys of the rows virtua has mounted, read off their attributes. */
  onList = (): Set<string> => {
    const keys = new Set<string>();
    for (const item of this.#host.listing?.firstElementChild?.children ?? []) {
      const key = item.querySelector<HTMLElement>(":scope > [data-row]")
        ?.dataset.row;
      if (key) {
        keys.add(key);
      }
    }
    return keys;
  };

  /** The rows still skipped that virtua has mounted; the skips of those it let go are dropped. */
  stillMounted(): string[] {
    const mountedKeys = this.onList();
    const kept = [...this.skipping.keys()].filter((key) =>
      mountedKeys.has(key)
    );
    if (kept.length < this.skipping.size) {
      this.skipping = new Map(
        [...this.skipping].filter(([key]) => mountedKeys.has(key))
      );
    }
    return kept;
  }

  /** `keys` are styled from here on: their skips are lifted. */
  liftSkips(keys: string[]): void {
    if (!keys.some((key) => this.skipping.has(key))) {
      return;
    }
    const unlifted = new Map(this.skipping);
    for (const key of keys) {
      unlifted.delete(key);
    }
    this.skipping = unlifted;
  }

  /** Whether this pane was warm at the last look: it stages as it warms, once. */
  wasWarm: boolean;

  /**
   * The indexes virtua keeps mounted whatever its range: the last
   * `TAIL_MOUNTED` rows, and every row folding shut wherever it stands —
   * virtua dropping one mid-fold cancelled the fold, it never said it had
   * gone, and it stayed in the list at full height to fold again whenever it
   * was next drawn. These are indexes into the rows of this flush; virtua
   * mounts one only once its store holds that many rows.
   */
  readonly keepMounted = $derived.by(() => {
    const count = this.#host.rowDraw.renderedRows.length;
    const { leaving: folding, settled } = this.#host.rowDraw.presentation;
    // Not seen, the tail has no motion to keep: every row its session sends
    // would wait mounted for the reach to style it, with the view it was put
    // away at (tab-return 1b: 8 rows, 550 elements, in the warm frame). A
    // far landing builds its own (`staged`).
    const tail = this.unseen ? 0 : TAIL_MOUNTED;
    const kept = Array.from(
      { length: Math.min(Math.max(tail, this.staged), count) },
      (_, i) => count - 1 - i
    );
    // A row folding shut stands after the settled rows (`withLeaving`).
    for (
      let index = settled.length;
      folding.size > 0 && index < count;
      index += 1
    ) {
      if (folding.has(this.#host.rowDraw.renderedRows[index].key)) {
        kept.push(index);
      }
    }
    // The view a far landing leaves, held while it lands (`landFar`).
    for (const index of this.lingering) {
      if (index < count) {
        kept.push(index);
      }
    }
    // The rows mounted as a page in front was handed over, held while the
    // buffer steps back up (`frontHeld`).
    if (this.frontHeld.length > 0) {
      const mountedKeys = new Set(this.frontHeld);
      this.#host.rowDraw.renderedRows.forEach((row, index) => {
        if (mountedKeys.has(row.key)) {
          kept.push(index);
        }
      });
    }
    // The rows a pane held as it was laid out again, held while they stage (`heldRows`).
    if (this.heldRows.length > 0) {
      const warmKeys = new Set(this.heldRows);
      this.#host.rowDraw.renderedRows.forEach((row, index) => {
        if (warmKeys.has(row.key)) {
          kept.push(index);
        }
      });
    }
    // Put away, every row mounted as it was (`away`): one let go there stays held.
    if (this.away.size > 0) {
      this.#host.rowDraw.renderedRows.forEach((row, index) => {
        if (this.away.has(row.key)) {
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
  unwinding: boolean;

  /** Each far landing's number: whose rows a let-go in hand is letting go (`catchUpRest`). */
  landings = 0;

  landFar(was: number): void {
    // Before the reveal nothing is painted: the first landing has no screen to keep.
    if (!(
      this.#host.list &&
      this.#host.shown &&
      this.#host.rowDraw.renderedRows.length > 0
    )) {
      return;
    }
    // virtua's own range as it stands, read off its sizes: the view and its
    // buffer either side (virtua's `$getRange`), what is mounted now, and
    // the rows a pane put away kept (`away`), let go with them. Read wider,
    // the rows virtua never mounted were mounted here, three screens of them
    // in the landing's frame (65ms, tab-return's 3 min).
    const from = this.#host.list.findItemIndex(Math.max(0, was - this.buffer));
    const to = this.#host.list.findItemIndex(
      was + this.#host.viewHeight + this.buffer
    );
    const behind = new Set(
      Array.from({ length: to - from + 1 }, (_, i) => from + i)
    );
    if (this.away.size > 0) {
      this.#host.rowDraw.renderedRows.forEach((row, index) => {
        if (this.away.has(row.key)) {
          behind.add(index);
        }
      });
      this.away = new Set();
    }
    this.lingering = [...behind].sort((a, b) => a - b);
    this.narrow = true;
    this.unwinding = false;
    this.landings += 1;
    // The landing's scroll comes in the next frame (`onscroll`); past it,
    // the rest follows even if nothing scrolled.
    requestAnimationFrame(() =>
      setTimeout(() =>
        requestAnimationFrame(() => setTimeout(this.catchUpRest))
      )
    );
  }

  /**
   * After the landing's frame has painted: the screen above, then the rows
   * left behind, `STAGE_ROWS` a task (a view's worth let go in one, a far
   * landing's last step took 34ms, 27ms of it the rows' removal: tab-return's
   * 3 min), then the far landing's built rows past what virtua's range
   * holds, the same few a task.
   */
  catchUpRest = (): void => {
    if (!this.narrow || this.unwinding) {
      return;
    }
    this.unwinding = true;
    // A far landing made meanwhile (`landFar`) holds rows of its own: this
    // one lets go of nothing more.
    const own = this.landings;
    const release = () =>
      requestAnimationFrame(() =>
        setTimeout(() => {
          if (own !== this.landings) {
            return;
          }
          this.lingering = this.lingering.slice(STAGE_ROWS);
          if (this.lingering.length > 0) {
            release();
            return;
          }
          // The staged screen above the view, the topmost rows first, as
          // the view left behind was (`ABOVE_LANDING`).
          this.staged = Math.max(0, this.staged - STAGE_ROWS);
          if (this.staged > 0) {
            release();
            return;
          }
          this.unwinding = false;
        })
      );
    requestAnimationFrame(() =>
      setTimeout(() => {
        this.narrow = false;
        release();
      })
    );
  };

  /** How many rows from the end a far landing still being built keeps mounted; 0 when none is. */
  staged = $state(0);

  /** The far landing's rows fill a view: the pin's next far write lands. */
  stagedReady: boolean;

  staging: boolean;

  stageFar(): void {
    if (this.staging) {
      return;
    }
    this.staging = true;
    const step = () =>
      requestAnimationFrame(() =>
        setTimeout(() => {
          if (!(this.staging && this.#host.list && this.#host.atBottom)) {
            this.staging = false;
            this.staged = 0;
            return;
          }
          // The rows from the end that fill the view and the screen above it
          // (`ABOVE_LANDING`), by virtua's sizes: each step's rows measured by
          // now, the rest at `ROW_ESTIMATE`.
          const count = this.#host.rowDraw.renderedRows.length;
          const fill = this.#host.viewHeight * ABOVE_LANDING;
          let need = 0;
          for (let height = 0; need < count && height < fill; need += 1) {
            height += this.#host.list.getItemSize(count - 1 - need);
          }
          if (this.staged >= need) {
            this.staging = false;
            this.stagedReady = true;
            this.#host.pinBottom();
            this.stagedReady = false;
            return;
          }
          this.staged = Math.min(need, this.staged + STAGE_ROWS);
          step();
        })
      );
    step();
  }

  /** Steps a warming pane's staging waits for the away landing's scroll (`stageStep`); 0 once it has come. */
  awayScroll = 0;

  constructor(host: MountedRowsHost) {
    this.#host = host;
    this.unseen = $state(untrack(() => !this.#host.visible));
    this.wasSeen = untrack(() => this.#host.visible);
    this.wasWarm = false;
    this.unwinding = false;
    this.stagedReady = false;
    this.staging = false;

    $effect(() => {
      const now = this.#host.visible;
      const goneAway = this.wasSeen && !now;
      this.wasSeen = now;
      let task: ReturnType<typeof setTimeout> | undefined;
      const frame = requestAnimationFrame(() => {
        task = setTimeout(() => {
          this.unseen = !now;
          if (now) {
            return;
          }
          this.putAway = this.textOfRows();
          // Laid out again meanwhile (`wasWarm`), it lets go freely until it is skipped again.
          if (goneAway && !this.wasWarm) {
            this.away = this.onList();
            this.aside = this.rowsAside();
            this.keptBuffer = this.buffer;
          }
        });
      });
      return () => {
        cancelAnimationFrame(frame);
        clearTimeout(task);
      };
    });

    $effect(() => {
      const full = this.#host.viewHeight * BUFFER_SCREENS;
      track(this.#host.rowBuild.fronted);
      if (this.narrow || this.unseen) {
        this.buffer = 0;
        return;
      }
      // Shown again, the rows it kept are its buffer again, in the flush that
      // stops keeping them.
      if (untrack(() => this.away.size) > 0) {
        this.away = new Set();
        this.buffer = Math.min(full, this.keptBuffer);
      }
      if (untrack(() => this.buffer) >= full) {
        this.buffer = full;
        return;
      }
      const by = Math.max(1, full / BUFFER_STEPS);
      let frame = 0;
      let task: ReturnType<typeof setTimeout> | undefined;
      const grow = () => {
        frame = requestAnimationFrame(() => {
          task = setTimeout(() => {
            this.buffer = Math.min(full, this.buffer + by);
            if (this.buffer < full) {
              grow();
            } else if (untrack(() => this.frontHeld.length) > 0) {
              this.frontHeld = [];
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

    // Shown, the rows skipped aside are styled `STAGE_ROWS` a task, each step
    // once a frame has painted; not while a far landing is on its way, which
    // lets go of the view it leaves itself, still skipped (`landFar`).
    $effect(() => {
      if (this.unseen || untrack(() => this.aside.size) === 0) {
        return;
      }
      let frame = 0;
      let task: ReturnType<typeof setTimeout> | undefined;
      const step = () => {
        frame = requestAnimationFrame(() => {
          task = setTimeout(() => {
            if (!(
              this.staging ||
              this.narrow ||
              this.#host.landingAway !== undefined
            )) {
              const mounted = this.onList();
              this.aside = new Map(
                [...this.aside]
                  .filter(([key]) => mounted.has(key))
                  .slice(STAGE_ROWS)
              );
            }
            if (this.aside.size > 0) {
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

    $effect(() => {
      // Both read every time, so a pane warming or `visible` wakes this. A
      // session's pane goes by the session's id, read off the slot it is
      // docked in, which can be none yet as this first runs (PaneHost moves it
      // there after it mounts).
      const warmed = warm.panes();
      const hidden = !this.#host.visible;
      // PaneLeaf's slot: a side split's own panes (paneforge) carry an empty `data-pane`.
      const pane = this.#host.listing?.closest<HTMLElement>(
        '[data-slot="pane"][data-pane]'
      )?.dataset.pane;
      const now =
        hidden &&
        (warmed.includes(this.#host.session.instanceId) ||
          (!!pane && warmed.includes(pane)));
      // Gone cold, the pane is skipped again: it keeps what it has mounted,
      // whatever a far landing while it was warm let go (`away`).
      if (now && !this.wasWarm) {
        untrack(this.parkRows);
      } else if (hidden && this.wasWarm && !now) {
        this.away = untrack(this.onList);
      }
      this.wasWarm = now;
    });

    // Shown, nothing stays skipped: `skipped` lifts every skip in this flush,
    // and the skips are dropped with it, so none comes back if it is put away.
    $effect.pre(() => {
      if (this.#host.visible) {
        untrack(() => {
          if (this.skipping.size > 0) {
            this.skipping = NO_SKIPS;
          }
        });
      }
    });
  }
}
