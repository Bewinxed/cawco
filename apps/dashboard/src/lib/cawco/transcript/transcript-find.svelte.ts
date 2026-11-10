/**
 * The scrolling transcript: the folded rows, virtualized. The live tail rides
 * as rows of its own (see `buildRowsFrom`), so streaming text, an open reasoning
 * block and the tool in flight all scroll with the conversation. Announces
 * genuine arrivals — and blocked-on-you — through a dedicated live region
 * beside the log, never through the virtualized container itself.
 */
import { untrack } from "svelte";
import { track } from "#lib/platform/track.js";
import { findIn } from "../find/conversation-find.svelte";
import { markFind, rangesOf } from "../find/find-marks";
import type { SessionState } from "../stores/sessions.svelte";
import { recordIn, rowHolding } from "./open-at.svelte";
import type { Row } from "./rows";
import { SCROLL_KEYS } from "./scroll-pin.svelte";

export interface TranscriptFindHost {
  readonly jumper: {
    readonly jump: () => void;
  };
  readonly keeper: {
    readonly placeAt: (top: number) => { block: string; into: number } | null;
  };
  readonly landed: boolean;
  readonly pin: {
    readonly atBottom: boolean;
    readonly farFromLatest: boolean;
    readonly lastTop: number;
    readonly listing: HTMLElement | undefined;
    readonly scroller: HTMLElement | undefined;
  };
  readonly rowBuild: {
    readonly rows: Row[];
  };
  readonly rowDraw: {
    readonly renderedRows: Row[];
  };
  readonly session: SessionState;
}

export class TranscriptFind {
  readonly #host: TranscriptFindHost;

  // Find in this conversation
  // (find/conversation-find): the words marked where they are drawn, the
  // place stepped to brought clear of the composer, and the way back to
  // where the conversation was read as find opened.

  readonly findHere = $derived.by(() => findIn(this.#host.session.instanceId));

  /** Read the drawn rows for the words and mark them: every place washed, the one stepped to solid. */
  markWords(): void {
    const words = this.findHere.words.trim();
    if (!(
      this.#host.pin.listing &&
      words &&
      (this.findHere.open || this.findHere.landed)
    )) {
      markFind(this.#host.session.instanceId, [], null);
      return;
    }
    const { current } = this.findHere;
    /** Where a place is drawn: its record's own part of its row, else the row; the live turn's row for the live place. */
    const drawnAt = (place: {
      docId: string;
      live: boolean;
    }): Element | null => {
      if (place.live) {
        return (
          this.#host.pin.listing?.querySelector('[data-slot="live"]') ?? null
        );
      }
      const drawn =
        this.#host.rowDraw.renderedRows[
          rowHolding(this.#host.rowDraw.renderedRows, place.docId)
        ];
      const row = drawn
        ? this.#host.pin.listing?.querySelector(
            `[data-row="${CSS.escape(drawn.key)}"]`
          )
        : null;
      const message = drawn ? recordIn(drawn, place.docId, [words]) : undefined;
      return (
        (message &&
          row?.querySelector(`[data-message="${CSS.escape(message.id)}"]`)) ??
        row ??
        null
      );
    };
    const within = current ? drawnAt(current) : null;
    // Whose words the places keep reaches the transcript: with a filter
    // pressed, only the places it keeps are washed.
    const kept =
      this.findHere.whose === "all"
        ? null
        : this.findHere.places.flatMap((place) => drawnAt(place) ?? []);
    const all = rangesOf(this.#host.pin.listing, words).filter(
      (range) =>
        kept === null || kept.some((at) => at.contains(range.startContainer))
    );
    const solid =
      (within && all.find((range) => within.contains(range.startContainer))) ??
      null;
    if (!this.findHere.open) {
      // Find closed here: the place keeps its wash until the reader moves on.
      markFind(this.#host.session.instanceId, solid ? [solid] : [], null);
      return;
    }
    markFind(
      this.#host.session.instanceId,
      all.filter((range) => range !== solid),
      solid
    );
  }

  /** The reader moves on from the place find closed at (a wheel, a touch, a scroll key): its wash goes, and the way back with it. */
  movedOn = (event: Event): void => {
    if (
      this.findHere.landed &&
      (event.type !== "keydown" ||
        (event instanceof KeyboardEvent && SCROLL_KEYS.has(event.key)))
    ) {
      this.findHere.leave();
    }
  };

  /** Back where you were: to the record read as find opened, or the tail. */
  backWhereYouWere = (): void => {
    if (this.findHere.back().tail) {
      this.#host.jumper.jump();
    }
  };

  readonly showBack = $derived.by(
    () =>
      this.findHere.landed &&
      this.findHere.reading !== null &&
      this.#host.rowBuild.rows.length > 0
  );

  readonly showLatest = $derived.by(
    () =>
      this.#host.landed &&
      this.#host.pin.farFromLatest &&
      this.#host.rowBuild.rows.length > 0 &&
      !this.findHere.open &&
      !this.showBack
  );

  constructor(host: TranscriptFindHost) {
    this.#host = host;

    // Where the conversation is read: its tail, or the record at the view's top.
    $effect(() =>
      this.findHere.readFrom(() => {
        if (this.#host.pin.atBottom) {
          return { tail: true };
        }
        const place = this.#host.keeper.placeAt(this.#host.pin.lastTop);
        return place ? { tail: false, docId: place.block } : { tail: true };
      })
    );

    $effect(() => {
      // The live turn's place is the conversation's tail, being written.
      if (
        this.findHere.stepped > 0 &&
        untrack(() => this.findHere.current?.live)
      ) {
        untrack(this.#host.jumper.jump);
      }
    });

    // Marked once a frame at most while find stands, as rows mount and the
    // live turn is written, never inside the mutation that asked.
    $effect(() => {
      const root = this.#host.pin.listing;
      if (!(root && (this.findHere.open || this.findHere.landed))) {
        markFind(this.#host.session.instanceId, [], null);
        return;
      }
      track(
        this.findHere.words,
        this.findHere.at,
        this.findHere.open,
        this.findHere.whose,
        this.#host.rowDraw.renderedRows
      );
      let frame = 0;
      const schedule = () => {
        frame ||= requestAnimationFrame(() => {
          frame = 0;
          this.markWords();
        });
      };
      schedule();
      const observer = new MutationObserver(schedule);
      observer.observe(root, {
        characterData: true,
        childList: true,
        subtree: true,
      });
      return () => {
        observer.disconnect();
        cancelAnimationFrame(frame);
      };
    });

    $effect(() => () => markFind(this.#host.session.instanceId, [], null));

    $effect(() => {
      const node = this.#host.pin.scroller;
      if (!(node && this.findHere.landed)) {
        return;
      }
      node.addEventListener("wheel", this.movedOn, { passive: true });
      node.addEventListener("touchstart", this.movedOn, { passive: true });
      node.addEventListener("keydown", this.movedOn);
      return () => {
        node.removeEventListener("wheel", this.movedOn);
        node.removeEventListener("touchstart", this.movedOn);
        node.removeEventListener("keydown", this.movedOn);
      };
    });
  }
}
