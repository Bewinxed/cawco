/**
 * The bounded replay ring behind the Ledger Protocol ({@link ./stream.ts}).
 *
 * Lifted verbatim from `packages/hub/src/stream.ts` (mechanical extraction,
 * P0 of the sessiond design — no behavior change): the hub imports
 * {@link SessionRing} from here instead of defining it, and the sessiond
 * design (§6) reuses the same class for its per-child stdout ring.
 */

import type { SessionStreamEvent } from "./stream";

/**
 * Events kept per session for replay. A reconnect the user notices is a few
 * seconds of frames; 512 covers a long turn's worth of partials with room to
 * spare, and the honest refusal ({@link StreamReset}) covers everything longer.
 * Bounded per session on purpose: the hub holds the fleet, not a transcript.
 */
export const RING_SIZE = 512;

/** One sequenced event in a ring: what was recorded, under its seq. */
export interface RingEvent<F> {
  frame: F;
  seq: number;
  sessionId: string;
}

/**
 * One session's sequence and its replay window, of whatever it records: the
 * hub's stream frames by default, sessiond's raw stdout lines.
 *
 * A flat array indexed by `(seq - 1) % size`: because `seq` starts at 1
 * and only ever increments, the index is total and needs no head/tail pair to
 * chase. The two derived numbers are the whole contract — `head` is the last
 * seq assigned, `oldest` the earliest still replayable.
 */
export class SessionRing<F = SessionStreamEvent["frame"]> {
  /**
   * Grown as the session speaks rather than pre-allocated: most sessions never
   * reach 512 frames, and a hub holds every session it has ever relayed.
   */
  #events: (RingEvent<F> | undefined)[] = [];
  #head = 0;
  /**
   * How many events this ring keeps. Defaults to {@link RING_SIZE} so the hub's
   * behaviour is exactly what it always was; sessiond passes its own, larger
   * bound because it buffers a child's raw stdout lines rather than a hub's
   * already-folded frames, and a chatty turn produces far more of them.
   */
  readonly #size: number;
  /** The lowest seq this ring may still hold — raised by {@link forget}. */
  #floor = 1;
  #at = 0;

  constructor(size: number = RING_SIZE) {
    this.#size = size;
  }

  get head(): number {
    return this.#head;
  }

  /** When this session last said anything, for the idle sweep. */
  get lastAt(): number {
    return this.#at;
  }

  /** The earliest seq still in the ring; 0 when nothing has been recorded. */
  get oldest(): number {
    if (this.#head === 0) {
      return 0;
    }
    return Math.max(this.#floor, this.#head - this.#size + 1);
  }

  record(sessionId: string, frame: F): RingEvent<F> {
    this.#head += 1;
    const event: RingEvent<F> = { seq: this.#head, sessionId, frame };
    this.#events[(event.seq - 1) % this.#size] = event;
    this.#at = Date.now();
    return event;
  }

  /**
   * Drops the replay window, keeping the sequence. `oldest` becomes `head + 1`,
   * so a client that is exactly current still gets its (empty) backlog and
   * everyone behind gets a reset — no replay is ever partial.
   */
  forget(): void {
    this.#events = [];
    this.#floor = this.#head + 1;
  }

  /**
   * Whether the gap after `afterSeq` can be replayed WHOLE.
   *
   * Three ways it cannot: the first missing event has been overwritten
   * (`afterSeq + 1 < oldest`); the client claims events this hub never
   * assigned (`afterSeq > head` — a resume across a hub restart, whose seqs
   * belong to a dead epoch); or the number is not a sequence at all.
   */
  canReplay(afterSeq: number): boolean {
    if (!Number.isInteger(afterSeq) || afterSeq < 0) {
      return false;
    }
    if (afterSeq > this.#head) {
      return false;
    }
    if (this.#head === 0) {
      return true;
    }
    return afterSeq >= this.oldest - 1;
  }

  /** The contiguous ascending run `afterSeq + 1 .. head`. Empty when caught up. */
  since(afterSeq: number): RingEvent<F>[] {
    const events: RingEvent<F>[] = [];
    for (let seq = afterSeq + 1; seq <= this.#head; seq += 1) {
      const event = this.#events[(seq - 1) % this.#size];
      // Unreachable while `canReplay` guards the call — asserted rather than
      // skipped, because a hole silently dropped here is the one bug this
      // protocol exists to make impossible.
      if (!event || event.seq !== seq) {
        throw new Error(`[hub] stream ring lost seq ${seq}`);
      }
      events.push(event);
    }
    return events;
  }
}
