/**
 * Writes to a `node:net` socket in time proportional to the bytes written,
 * however large one message is.
 *
 * Under Bun (1.4.2), whatever a socket cannot take at once is copied into its
 * native buffer, and every flush of that buffer shifts the unsent tail down:
 * the cost of a write is quadratic in how much is queued beyond the kernel's
 * buffer, whether it was handed over as one string or as many queued ones.
 * Measured over a unix socket: 64 MB in 0.6 s, 128 MB in 2.3 s, 256 MB in
 * 8.9 s of the writer's loop. (oven-sh/bun#35940, open, holds queued writes
 * by reference for the same reason.) Handing over one piece at a time, the
 * next only once the socket has drained, keeps the native buffer to one
 * piece: the same 256 MB in 0.15 s.
 *
 * Messages leave in the order given; a piece never splits a character (the
 * text is cut by UTF-16 index, and never inside a surrogate pair).
 */
import type { Socket } from "node:net";

/** Our choice: large enough that a message of ordinary size goes as one write, small enough that the native buffer stays a fraction of a megabyte. */
export const PACED_PIECE = 256 * 1024;

export class PacedWriter {
  readonly #to: Socket;
  /** Messages not yet handed over in full, oldest first, from `#head`. */
  #queue: string[] = [];
  #head = 0;
  /** How much of the oldest message has been handed over. */
  #offset = 0;
  #draining = false;

  constructor(to: Socket) {
    this.#to = to;
  }

  /** Queues `text` behind everything before it. */
  write(text: string): void {
    if (text === "") {
      return;
    }
    this.#queue.push(text);
    // biome-ignore lint/suspicious/noUnnecessaryConditions: set true when a write fills the socket and false at its drain; biome's inference sees only the initializer
    if (!this.#draining) {
      this.#pump();
    }
  }

  #pump(): void {
    // A queue that never empties (a reader always behind) is cut back now and
    // then, so what was handed over is not kept.
    if (this.#head > 1024) {
      this.#queue = this.#queue.slice(this.#head);
      this.#head = 0;
    }
    while (this.#head < this.#queue.length) {
      if (this.#to.destroyed) {
        this.#queue = [];
        this.#head = 0;
        this.#offset = 0;
        return;
      }
      const message = this.#queue[this.#head] as string;
      let end = Math.min(this.#offset + PACED_PIECE, message.length);
      // A high surrogate at the cut keeps its partner: never half a character.
      const last = message.charCodeAt(end - 1);
      if (end < message.length && last >= 0xd8_00 && last <= 0xdb_ff) {
        end += 1;
      }
      const piece =
        this.#offset === 0 && end === message.length
          ? message
          : message.slice(this.#offset, end);
      this.#offset = end;
      if (this.#offset >= message.length) {
        this.#head += 1;
        this.#offset = 0;
        if (this.#head === this.#queue.length) {
          this.#queue = [];
          this.#head = 0;
        }
      }
      if (!this.#to.write(piece)) {
        this.#draining = true;
        this.#to.once("drain", () => {
          this.#draining = false;
          this.#pump();
        });
        return;
      }
    }
  }
}
