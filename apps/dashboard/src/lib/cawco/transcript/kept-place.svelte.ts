/**
 * The scrolling transcript: the folded rows, virtualized. The live tail rides
 * as rows of its own (see `buildRowsFrom`), so streaming text, an open reasoning
 * block and the tool in flight all scroll with the conversation. Announces
 * genuine arrivals — and blocked-on-you — through a dedicated live region
 * beside the log, never through the virtualized container itself.
 */
import { onDestroy, untrack } from "svelte";
import type { CacheSnapshot } from "virtua";
import type { VirtualizerHandle } from "virtua/svelte";
import { z } from "zod";
import { readJson, writeJson } from "#lib/platform/storage.js";
import type { ConversationFind } from "../find/conversation-find.svelte";
import type { SessionState } from "../stores/sessions.svelte";
import type { Message } from "../types";
import { disclosure } from "./disclosure.svelte";
import { BUFFER_SCREENS } from "./mounted-rows.svelte";
import {
  blockOf,
  matchBox,
  recordIn,
  rowAt,
  rowHolding,
} from "./open-at.svelte";
import type { Built } from "./row-build.svelte";
import type { Row } from "./rows";

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
 * the conversation was opened at (`?at=`, open-at.svelte.ts), the words it
 * matched on in view (`seekInto`): never kept, it is the address's.
 */
const LandingSchema = z.union([
  z.object({ tail: z.literal(true) }),
  z.object({ tail: z.literal(false), block: z.string(), into: z.number() }),
  z.object({
    tail: z.literal(false),
    at: z.string(),
    terms: z.array(z.string()).readonly(),
  }),
]);
export type Landing = z.infer<typeof LandingSchema>;
const LANDING = "cawco:landing:";

/**
 * A row's key as any later mount of this pane will fold it: a message's
 * row by the message, since an answer streamed in this view goes by the
 * live row's key (rows.ts `keepLive`) and a new fold never sees that one.
 */
const placeOf = (row: Row): string =>
  row.kind === "single" ? row.message.id : row.key;

/** How far above what find grows out of the composer the band ends, px: a line's air. Our own call. */
const FIND_GAP = 24;

/**
 * THE WORDS SOUGHT END UP IN VIEW, NOT JUST THEIR ROW. How far into the
 * row at `index` the view's top stands for a seek to it (a negative
 * distance, the room above the row), in the band the reader sees
 * (`band`). With `terms` and the first of them drawn in the record
 * (open-at.svelte.ts `matchBox`): those words at the band's middle, so a
 * tall row (a test run's output) does not leave them under the composer.
 * Not drawn, the record's fold (a call's body, its reasoning) is opened,
 * as the reader's press opens it and staying so, and they are looked for
 * again in the next frame. Otherwise the record (its part of the row, or the row while it is not
 * drawn) centred in the band, or, taller than it, its top at the band's
 * top, so its first line is read first, clear of the head. Read each
 * frame of the seek (`restore`): the row is drawn, and its words found,
 * once the first write has brought it into range.
 */
/**
 * Whether `item` is still moving by a motion of its own that ends (a fold
 * opening under the words a seek is after), never a loop (a breath): the
 * list shifts its offset by every px a row above the view's top grows, so
 * a seek that ends mid-fold leaves the words above the view.
 */
const settling = (item: Element): boolean =>
  item
    .getAnimations({ subtree: true })
    .some(
      (motion) =>
        motion.playState === "running" &&
        motion.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY
    );

/** The most frames a place is put back over while the rows around it measure: our own call. */
const KEEP_FRAMES = 12;

/** How long a landing's place is held once the list is drawn, ms: our own call. */
export const LANDING_HOLD_MS = 1500;

/**
 * How long a landing's place is still held once the rows around it are
 * all mounted: the last of them measuring, and virtua's own scroll
 * settling (its 150ms), ms. Our own call.
 */
const FILLED_HOLD_MS = 500;
export interface KeptPlaceHost {
  atBottom: boolean;
  readonly findHere: ConversationFind;
  readonly headStrip: HTMLElement | undefined;
  readonly jumping: boolean;
  readonly landed: boolean;
  readonly lastTop: number;
  lastWrite: number | null;
  readonly list: VirtualizerHandle | undefined;
  readonly listing: HTMLElement | undefined;
  readonly listStart: number;
  readonly mounted: {
    readonly buffer: number;
    readonly unseen: boolean;
  };
  readonly older: {
    readonly paged: () => SessionState | null;
  };
  readonly rowBuild: {
    readonly built: Built;
  };
  readonly rowDraw: {
    readonly presentation: { readonly shifted: boolean };
    readonly renderedRows: Row[];
  };
  readonly scroller: HTMLElement | undefined;
  readonly seeking: string | null;
  readonly session: SessionState;
  readonly shown: boolean;
  readonly viewHeight: number;
  readonly visible: boolean;
  readonly whole: {
    readonly rooms: { foot: number; measured: boolean };
  };
}

export class KeptPlace {
  readonly #host: KeptPlaceHost;

  readonly cache: CacheSnapshot | undefined;

  /**
   * The place this pane returns to, until a landing has used it. A place at
   * a row the rows do not hold yet — a reload, whose first rows are the
   * newest page — is read back to, a page at a time (see the reveal).
   */
  resume: Landing | null;

  /** This transcript lands at its tail: the place it returns to, if any, is the tail, and no record is sought (`seek`). */
  standsAtTail: boolean;

  /**
   * Keep where the reader is for the pane's next mount. Called where a pane
   * hides — inside a swipe's release, among others — so it reads nothing off
   * the page: the row at the top of the view comes from virtua's own sizes,
   * at the offset the scroll handler last saw.
   */
  saveLanding = (): void => {
    if (
      !(this.#host.list && this.#host.shown) ||
      this.#host.rowDraw.renderedRows.length === 0
    ) {
      return;
    }
    sizes.set(this.landingFor, {
      cache: this.#host.list.getCache(),
      first: placeOf(this.#host.rowDraw.renderedRows[0]),
      count: this.#host.rowDraw.renderedRows.length,
    });
    const place = this.#host.atBottom
      ? null
      : (this.keptPlace ?? this.placeAt(this.#host.lastTop));
    const landing: Landing = place ? { tail: false, ...place } : { tail: true };
    writeJson(LANDING + this.landingFor, landing, "session");
  };

  /**
   * Whose place `saveLanding` keeps: the conversation this transcript drew,
   * read while it stands. Torn down because its owner stopped showing it
   * (a new conversation asked for), its `session` prop already reads the
   * owner's next value, which may be none.
   */
  landingFor: string;

  /** The row the reader's place is at, while it is being returned to: its index, or -1. */
  anchorIndex = (): number => {
    if (!this.resume || this.resume.tail) {
      return -1;
    }
    return "at" in this.resume
      ? rowAt(
          this.#host.rowDraw.renderedRows,
          this.resume.at,
          this.#host.older.paged()?.cursor === null
        )
      : rowHolding(this.#host.rowDraw.renderedRows, this.resume.block);
  };

  /**
   * The reader's place at the view's top `top`: the first block of the row
   * there, or of the nearest row above it that has one (the live tail's rows
   * have none), and how far past that row's top the view stands. Read off
   * virtua's sizes, never the page.
   */
  placeAt(top: number): { block: string; into: number } | null {
    if (!this.#host.list || this.#host.rowDraw.renderedRows.length === 0) {
      return null;
    }
    for (
      let index = this.#host.list.findItemIndex(top);
      index >= 0;
      index -= 1
    ) {
      const block = blockOf(this.#host.rowDraw.renderedRows[index]);
      if (block) {
        return {
          block,
          into:
            top - this.#host.listStart - this.#host.list.getItemOffset(index),
        };
      }
    }
    return null;
  }

  /**
   * The band of the view the reader sees, px down from the scroller's top:
   * under the bar floating over its top (`headRoom`, the strip's padding)
   * and above the foot the composer stands over (`rooms`), and above what
   * grows out of the composer while find stands (its field on the pill's
   * top, its places as the composer's layer), which stand over the
   * transcript without moving it (find/conversation-find).
   */
  band(): { top: number; bottom: number } {
    if (!this.#host.scroller) {
      return { top: 0, bottom: 0 };
    }
    const top = this.#host.headStrip
      ? Number.parseFloat(getComputedStyle(this.#host.headStrip).paddingTop)
      : 0;
    let bottom = this.#host.scroller.clientHeight - this.#host.whole.rooms.foot;
    if (this.#host.findHere.open) {
      const view = this.#host.scroller.getBoundingClientRect();
      const dock = document.querySelector<HTMLElement>(
        `[data-slot="dock"][data-find-view="${CSS.escape(this.#host.session.instanceId)}"]`
      );
      for (const over of dock?.querySelectorAll<HTMLElement>(
        '[data-slot="cin"], [data-slot="find-layer"]'
      ) ?? []) {
        const box = over.getBoundingClientRect();
        if (box.height > 0 && box.left < view.right && box.right > view.left) {
          bottom = Math.min(bottom, box.top - view.top - FIND_GAP);
        }
      }
    }
    return { top: Number.isFinite(top) ? top : 0, bottom };
  }

  /**
   * The last `seekInto` asked for words it did not find drawn, or found in
   * a row still moving (their fold was opened, or is still opening): the
   * seek reads them again next frame rather than ending with them out of
   * the band, under the composer or above the view.
   */
  wordsAwaited: boolean;

  seekInto(index: number, terms: readonly string[]): number {
    if (!(this.#host.list && this.#host.scroller)) {
      return 0;
    }
    const { top, bottom } = this.band();
    const room = bottom - top;
    const drawn = this.recordDrawn(index);
    if (!drawn) {
      this.wordsAwaited = terms.length > 0;
      const size = this.#host.list.getItemSize(index);
      return size < room ? -(top + (room - size) / 2) : -top;
    }
    const itemTop = drawn.item.getBoundingClientRect().top;
    const words = terms.length > 0 ? matchBox(drawn.record, terms) : null;
    this.wordsAwaited = terms.length > 0 && (!words || settling(drawn.item));
    if (words) {
      return words.top + words.height / 2 - itemTop - (top + bottom) / 2;
    }
    if (terms.length > 0 && drawn.message) {
      disclosure(drawn.message).set(true);
    }
    const box = drawn.record.getBoundingClientRect();
    const from = box.top - itemTop;
    return box.height < room
      ? from - (top + (room - box.height) / 2)
      : from - top;
  }

  /**
   * The record a seek is after, as the row at `index` draws it: the message
   * `at` names (open-at.svelte.ts `recordIn`: its id or its stored entry's
   * uuid), its own part when the row draws several (a message's, a run's
   * call, by the message's id), else the whole row; and virtua's item
   * around it, whose top its offsets measure to. None while the row is not
   * drawn.
   */
  recordDrawn(index: number): {
    item: Element;
    message: Message | undefined;
    record: Element;
  } | null {
    const row = this.#host.rowDraw.renderedRows[index];
    const drawn = row
      ? this.#host.listing?.querySelector(`[data-row="${CSS.escape(row.key)}"]`)
      : null;
    if (!(row && drawn && this.resume && "at" in this.resume)) {
      return null;
    }
    const message = recordIn(row, this.resume.at, this.resume.terms);
    const part =
      message?.id === undefined
        ? null
        : drawn.querySelector(`[data-message="${CSS.escape(message.id)}"]`);
    return {
      item: drawn.closest("[data-item]") ?? drawn,
      message,
      record: part ?? drawn,
    };
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
  restore(): boolean {
    const index = this.anchorIndex();
    if (!(this.resume && !this.resume.tail) || index < 0) {
      return false;
    }
    this.#host.atBottom = false;
    return this.scrollToRow(
      index,
      "at" in this.resume
        ? this.seekInto(index, this.resume.terms)
        : this.resume.into
    );
  }

  /**
   * The last offset this component wrote to put a row back in its place,
   * and the offset the engine read back for it. An engine rounds a written
   * offset to its own steps (WebKit to whole pixels: 455.65625 reads back
   * 455), so a place it cannot reach any closer is reached once the offset
   * reads back what it did for that same write.
   */
  placeWrite: { target: number; read: number } | null = null;

  /**
   * Puts the row at `index` at the view's top, `into` pixels past its top,
   * from virtua's sizes as they stand; says whether the scroller had to
   * move. Within what the scroller can reach: a place past its end — rows
   * below it that are shorter now than when it was left — is its end.
   */
  scrollToRow(index: number, into: number): boolean {
    if (!(this.#host.list && this.#host.scroller && this.#host.listing)) {
      return false;
    }
    const start =
      this.#host.listing.getBoundingClientRect().top -
      this.#host.scroller.getBoundingClientRect().top +
      this.#host.scroller.scrollTop;
    // Never past the row's own end as virtua has it sized: a row it has not
    // measured is `ROW_ESTIMATE` tall, and a place further into it than that
    // put the row above the view, where it is never drawn, never measured,
    // and the place never reached (the reload landed on the row after it).
    // Its last pixel at the view's top, it is drawn, measured, and the next
    // write goes as far into it as the place says.
    const reach = Math.min(
      into,
      Math.max(0, this.#host.list.getItemSize(index) - 1)
    );
    // Rounded to a whole pixel: WebKit drops the fraction of a `scrollTop`
    // written to it, so 2075.72 landed at 2075, and with the row's own snap
    // to the device's pixels the place stood 1.3px short (transcript-holds'
    // landings, WebKit at 390), where the nearest pixel is half a pixel off
    // at most.
    const target = Math.round(
      Math.min(
        Math.max(0, start + this.#host.list.getItemOffset(index) + reach),
        this.#host.scroller.scrollHeight - this.#host.scroller.clientHeight
      )
    );
    const now = this.#host.scroller.scrollTop;
    if (
      Math.abs(now - target) <= 0.5 ||
      (this.placeWrite !== null &&
        Math.abs(this.placeWrite.target - target) <= 0.5 &&
        now === this.placeWrite.read)
    ) {
      return false;
    }
    this.#host.scroller.scrollTop = target;
    this.#host.lastWrite = this.#host.scroller.scrollTop;
    this.placeWrite = { target, read: this.#host.lastWrite };
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
  keptPlace: { block: string; into: number } | null = null;

  /** The frame the place is put back in, while it is. */
  keepFrame = 0;

  /**
   * Bumped each time the reader's own scroll moves the view (`readScroll`):
   * a place put back stops being put back the moment the reader moves.
   */
  readerMoved = 0;

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
  holdUntil = 0;

  /** A landing's place held on while the rows around it are still coming in (`holdUntil`). */
  holdWhileFilling(now: number): void {
    if (
      now < this.holdUntil &&
      !this.#host.mounted.unseen &&
      this.#host.mounted.buffer < this.#host.viewHeight * BUFFER_SCREENS
    ) {
      this.holdUntil = Math.max(this.holdUntil, now + FILLED_HOLD_MS);
    }
  }

  holdPlace = (): void => {
    cancelAnimationFrame(this.keepFrame);
    this.keepFrame = 0;
    const place = this.keptPlace;
    if (
      !(place && this.#host.landed && this.#host.shown) ||
      this.#host.atBottom ||
      this.#host.jumping ||
      this.#host.seeking !== null ||
      (this.resume !== null && !this.resume.tail)
    ) {
      return;
    }
    const moved = this.readerMoved;
    let frames = 0;
    const step = (): void => {
      this.keepFrame = requestAnimationFrame(() => {
        this.keepFrame = 0;
        // The reader moved since, or the view follows the tail again.
        if (this.#host.atBottom || this.readerMoved !== moved) {
          return;
        }
        // The row at the view's top first: it is the place's unless the list
        // moved under it, and the whole list is read for it only then.
        const top = this.#host.list
          ? this.#host.list.findItemIndex(this.#host.lastTop)
          : -1;
        const index =
          top >= 0 &&
          blockOf(this.#host.rowDraw.renderedRows[top]) === place.block
            ? top
            : rowHolding(this.#host.rowDraw.renderedRows, place.block);
        const put = index >= 0 && this.scrollToRow(index, place.into);
        if (put) {
          frames += 1;
          this.keptPlace = place;
        }
        const now = performance.now();
        this.holdWhileFilling(now);
        if ((put && frames < KEEP_FRAMES) || now < this.holdUntil) {
          step();
        }
      });
    };
    step();
  };

  constructor(host: KeptPlaceHost) {
    this.#host = host;
    this.cache = untrack(() => {
      // A pane with no saved sizes and no rows has `undefined` on both sides of
      // the first-row match, so the saved entry is checked on its own first.
      const saved = sizes.get(this.#host.session.instanceId);
      return saved !== undefined &&
        this.#host.rowBuild.built.rows.length > 0 &&
        saved.first === placeOf(this.#host.rowBuild.built.rows[0]) &&
        this.#host.rowBuild.built.rows.length >= saved.count
        ? saved.cache
        : undefined;
    });
    this.resume = readJson(
      LANDING + untrack(() => this.#host.session.instanceId),
      LandingSchema.nullable(),
      null,
      "session"
    );
    this.standsAtTail = $state(this.resume === null || this.resume.tail);
    this.landingFor = untrack(() => this.#host.session.instanceId);
    this.wordsAwaited = false;

    $effect.pre(() => {
      // The prop reads null while its owner tears this down.
      const id = this.#host.session?.instanceId;
      if (id) {
        this.landingFor = id;
      }
    });

    $effect.pre(() => {
      if (!this.#host.visible) {
        untrack(this.saveLanding);
      }
    });

    onDestroy(this.saveLanding);

    // A reload tears the page down without destroying anything.
    $effect(() => {
      addEventListener("pagehide", this.saveLanding);
      return () => removeEventListener("pagehide", this.saveLanding);
    });

    $effect(() => {
      // The rows drawn are what moves the place, and whether this drawing
      // shifted them is said with them.
      const { shifted } = this.#host.rowDraw.presentation;
      // A change only in front is virtua's own `shift`, unless a landing's
      // place is still held: then it is put back after that change too.
      if (!shifted || performance.now() < this.holdUntil) {
        untrack(this.holdPlace);
      }
      return () => cancelAnimationFrame(this.keepFrame);
    });
  }
}
