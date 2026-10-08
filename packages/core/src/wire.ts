/**
 * How a message crosses one of the hub's WebSockets, at any size, without
 * losing a frame or holding the sender's loop.
 *
 * PARTS. A message whose JSON is longer than {@link WIRE_PART_CHARS} goes out
 * as parts: `{"part":{"id","seq","last"},"text":"…"}`, each carrying the next
 * slice of the message's JSON text, re-encoded as a JSON string. The receiver
 * joins the slices in order and parses the whole once ({@link WireAssembler}).
 * Every frame on the wire is therefore at most {@link WIRE_FRAME_LIMIT_BYTES},
 * which every end accepts, and no single `send()` carries more than one part:
 * with permessage-deflate negotiated (the hub's server offers it to every
 * socket, Bun having one WebSocket config per server), a client's `send()`
 * deflates synchronously at ~15 ms per MB, so a 64 MB message held the
 * agent's loop for 937 ms and a 1 MiB part holds it for ~17 ms.
 *
 * OUTBOX. Every frame to a socket leaves through one ordered queue per socket
 * ({@link Outbox}). A frame goes straight out while nothing waits and the
 * socket takes it; once it does not, this frame and all later ones wait for
 * the socket to drain. Nothing is dropped: Bun's server `send()` drops a frame
 * outright (returns 0) once its socket has 16 MB buffered
 * (`backpressureLimit`; oven-sh/bun#44520), which lost every frame behind a
 * large one. A socket that owes more than {@link WIRE_MESSAGE_LIMIT_BYTES} is
 * a peer that is not reading: it is closed, and its peer reconnects and reads
 * its state afresh.
 *
 * Browser-safe: no Node or Bun imports.
 */

/**
 * The largest frame any end sends, and so the largest any end must accept.
 * Our choice, under every end's own limit: Bun's WebSocket client closes at
 * about 256 MB (1009 "Message too big"), the Apple app's socket takes 64 MiB,
 * browsers more. A part is at most 3 bytes of UTF-8 per character of its
 * slice (a quote or backslash escapes to 2; a character outside ASCII is at
 * most 3, or 6 for a surrogate split at a cut), so a {@link WIRE_PART_CHARS}
 * slice fits with room for its header.
 */
export const WIRE_FRAME_LIMIT_BYTES = 4 * 1024 * 1024;

/**
 * Characters of a message's JSON per part. Our choice: one deflated part costs
 * its sender ~17 ms (measured, Bun 1.4.2), well under the 50 ms a loop may be
 * held for, and a message of ordinary size goes as one frame.
 */
export const WIRE_PART_CHARS = 1024 * 1024;

/**
 * The largest message the wire carries, assembled, and the most a socket's
 * outbox may owe. Our choice: above the largest message the fleet sends (a
 * long session's transcript, tens of MB), with room for an outlier; a peer
 * that falls this far behind is not reading.
 */
export const WIRE_MESSAGE_LIMIT_BYTES = 512 * 1024 * 1024;

/** One part of a message too long for one frame. */
export interface WirePart {
  part: { id: string; last: boolean; seq: number };
  text: string;
}

let nextId = 0;
const runId = Math.random().toString(36).slice(2, 10);

/**
 * One queued message, cut into its frames as they are sent, not before:
 * encoding all of a long message's parts at once held the sender's loop for
 * as long as encoding the whole message (171 ms for 256 MB, measured).
 */
class Outgoing {
  readonly #json: string;
  /** Sent as it is: a message that fits one frame, or a frame being relayed. */
  readonly #whole: boolean;
  readonly #id: string;
  #at = 0;
  #seq = 0;
  /** The next frame, cut and not yet taken by the socket. */
  #cut: { end: number; frame: string } | undefined;

  constructor(json: string, whole: boolean) {
    this.#json = json;
    this.#whole = whole || json.length <= WIRE_PART_CHARS;
    if (this.#whole) {
      this.#id = "";
    } else {
      nextId += 1;
      this.#id = `${runId}-${nextId}`;
    }
  }

  /** Characters not yet taken by the socket. */
  get left(): number {
    return this.#json.length - this.#at;
  }

  /** The next frame to send; the same one again until it is {@link taken}. */
  next(): string {
    if (this.#whole) {
      return this.#json;
    }
    if (!this.#cut) {
      const json = this.#json;
      let end = Math.min(this.#at + WIRE_PART_CHARS, json.length);
      // Never between the halves of a surrogate pair.
      const last = json.charCodeAt(end - 1);
      if (end < json.length && last >= 0xd8_00 && last <= 0xdb_ff) {
        end += 1;
      }
      const part: WirePart = {
        part: { id: this.#id, seq: this.#seq, last: end >= json.length },
        text: json.slice(this.#at, end),
      };
      this.#cut = { end, frame: JSON.stringify(part) };
    }
    return this.#cut.frame;
  }

  /** The socket took the frame {@link next} gave; whether the message is all sent. */
  taken(): boolean {
    if (this.#whole) {
      this.#at = this.#json.length;
      return true;
    }
    this.#at = this.#cut?.end ?? this.#at;
    this.#seq += 1;
    this.#cut = undefined;
    return this.#at >= this.#json.length;
  }
}

const isPart = (frame: unknown): frame is WirePart => {
  const part = (frame as { part?: unknown } | null)?.part as
    | WirePart["part"]
    | undefined;
  return (
    typeof frame === "object" &&
    frame !== null &&
    typeof part === "object" &&
    part !== null &&
    typeof part.id === "string" &&
    typeof part.seq === "number" &&
    typeof (frame as { text?: unknown }).text === "string"
  );
};

/** A part frame that does not continue the message its id began, or one past the size limit. */
export class WireError extends Error {}

/** Returned by {@link WireAssembler.take} for a part that does not yet complete its message. */
export const WIRE_PENDING: unique symbol = Symbol("wire-pending");

/** Joins one socket's parts back into messages. */
export class WireAssembler {
  readonly #open = new Map<
    string,
    { chars: number; next: number; slices: string[] }
  >();

  /**
   * A frame off the socket, parsed: a whole message is returned as it is; a
   * part is kept, and the last part of a message returns that message.
   */
  take(frame: unknown): unknown {
    if (!isPart(frame)) {
      return frame;
    }
    const { id, seq, last } = frame.part;
    const open = this.#open.get(id) ?? { slices: [], next: 0, chars: 0 };
    if (seq !== open.next) {
      this.#open.delete(id);
      throw new WireError(
        `wire part ${id}#${seq} arrived where #${open.next} was expected`
      );
    }
    open.slices.push(frame.text);
    open.next += 1;
    open.chars += frame.text.length;
    if (open.chars > WIRE_MESSAGE_LIMIT_BYTES) {
      this.#open.delete(id);
      throw new WireError(
        `wire message ${id} passed ${WIRE_MESSAGE_LIMIT_BYTES} bytes`
      );
    }
    if (!last) {
      this.#open.set(id, open);
      return WIRE_PENDING;
    }
    this.#open.delete(id);
    return JSON.parse(open.slices.join(""));
  }
}

/**
 * How an {@link Outbox} reaches its socket. `write` reports what the socket
 * did with a frame: `sent` (written, or taken into its buffer with room to
 * spare), `buffered` (taken, but the socket now backs up: wait for it to
 * drain), or `dropped` (not taken: send it again once it drains).
 */
export interface OutboxTransport {
  /** Bytes the socket holds unwritten. */
  buffered: () => number;
  /** Closes the socket because its peer has fallen too far behind. */
  overflow: (owed: number) => void;
  /**
   * How long to wait before looking again at a socket that backs up, for a
   * socket with no drain event (a client `WebSocket`); absent where the
   * owner calls {@link Outbox.drained} on the socket's own drain.
   */
  pollMs?: number;
  write: (frame: string) => "sent" | "buffered" | "dropped";
}

/** What of Bun's `ServerWebSocket` an outbox uses. */
export interface ServerSocketLike {
  close: (code?: number, reason?: string) => void;
  getBufferedAmount: () => number;
  send: (data: string, compress?: boolean) => number;
}

/**
 * An outbox's way onto Bun's server socket. The owner calls
 * {@link Outbox.drained} from the socket's `drain`. Bun's `send()` returns the
 * bytes written, -1 when it took the frame into its buffer, which now backs
 * up, or 0 when it did not take it at all (oven-sh/bun#44520).
 */
export const serverTransport = (
  raw: ServerSocketLike,
  compress: boolean
): OutboxTransport => ({
  buffered: () => raw.getBufferedAmount(),
  write: (frame) => {
    const status = raw.send(frame, compress);
    if (status > 0) {
      return "sent";
    }
    return status === -1 ? "buffered" : "dropped";
  },
  overflow: (owed) =>
    raw.close(1013, `fell behind: ${owed} bytes owed, reconnect`),
});

/**
 * How often a client socket that backs up is looked at again: it has no drain
 * event. Our choice: a fraction of what one part takes to send.
 */
const CLIENT_POLL_MS = 5;

/** An outbox's way onto a client `WebSocket` (a browser's, or Bun's in the agent). */
export const clientTransport = (socket: WebSocket): OutboxTransport => ({
  buffered: () => socket.bufferedAmount,
  pollMs: CLIENT_POLL_MS,
  write: (frame) => {
    socket.send(frame);
    return "sent";
  },
  overflow: (owed) =>
    socket.close(4013, `fell behind: ${owed} bytes owed, reconnect`),
});

/** A client's side of one socket: its outbox and its assembler. */
export interface ClientLine {
  /**
   * A frame off the socket: the message it completes, or {@link WIRE_PENDING}
   * while its parts are still arriving. A part out of order closes the
   * socket (4002); the client's reconnect reads its state afresh.
   */
  receive: (data: string) => unknown;
  /** Queues one message's JSON, behind everything sent before it. */
  send: (json: string) => void;
}

const clientLines = new WeakMap<WebSocket, ClientLine>();

/** The line over a client `WebSocket`: one per socket, ended with it. */
export const clientLine = (socket: WebSocket): ClientLine => {
  const open = clientLines.get(socket);
  if (open) {
    return open;
  }
  const outbox = new Outbox(clientTransport(socket));
  const assembler = new WireAssembler();
  const line: ClientLine = {
    send: (json) => outbox.send(json),
    receive: (data) => {
      try {
        return assembler.take(JSON.parse(data));
      } catch (error) {
        if (!(error instanceof WireError)) {
          throw error;
        }
        socket.close(4002, error.message);
        return WIRE_PENDING;
      }
    },
  };
  clientLines.set(socket, line);
  socket.addEventListener("close", () => outbox.close(), { once: true });
  return line;
};

/**
 * Bytes a socket may hold unwritten before the outbox waits for it. Our
 * choice: a couple of parts, so the socket always has the next one ready
 * without letting its own buffer (which Bun copies, and on the server drops
 * past 16 MB) grow.
 */
const OUTBOX_HIGH_WATER = 2 * WIRE_PART_CHARS;

/** Characters an outbox hands over per turn of the loop before it yields. */
const OUTBOX_TURN_CHARS = WIRE_PART_CHARS;

/** One socket's frames, in order, never dropped, never more than a part per turn. */
export class Outbox {
  readonly #to: OutboxTransport;
  #queue: Outgoing[] = [];
  #head = 0;
  #owed = 0;
  /**
   * `waiting`: on the socket to drain. `scheduled`: to go on in the next turn.
   * `closed`: the socket is gone. An object, so each method reads it as it is.
   */
  readonly #flags: { closed: boolean; scheduled: boolean; waiting: boolean } = {
    waiting: false,
    scheduled: false,
    closed: false,
  };

  constructor(to: OutboxTransport) {
    this.#to = to;
  }

  /** Queues a message's JSON, sent as one frame or, cut as it goes, its parts. */
  send(json: string): void {
    this.#enqueue(new Outgoing(json, false));
  }

  /**
   * Queues a frame that is already on the wire, as it is: a relay passes the
   * other side's frames (parts included) through without cutting them again.
   */
  forward(frame: string): void {
    this.#enqueue(new Outgoing(frame, true));
  }

  #enqueue(outgoing: Outgoing): void {
    if (this.#flags.closed) {
      return;
    }
    this.#queue.push(outgoing);
    this.#owed += outgoing.left;
    if (this.#owed > WIRE_MESSAGE_LIMIT_BYTES) {
      const owed = this.#owed;
      this.close();
      this.#to.overflow(owed);
      return;
    }
    if (!(this.#flags.waiting || this.#flags.scheduled)) {
      this.#pump();
    }
  }

  /** The socket drained: what waits goes on. */
  drained(): void {
    if (this.#flags.waiting) {
      this.#flags.waiting = false;
      this.#pump();
    }
  }

  /** Characters queued and not yet handed to the socket. */
  get owed(): number {
    return this.#owed;
  }

  /** The socket is gone: nothing more is sent. */
  close(): void {
    this.#flags.closed = true;
    this.#queue = [];
    this.#head = 0;
    this.#owed = 0;
  }

  #wait(): void {
    this.#flags.waiting = true;
    const { pollMs } = this.#to;
    if (pollMs !== undefined) {
      setTimeout(() => {
        if (this.#to.buffered() > OUTBOX_HIGH_WATER) {
          this.#wait();
          return;
        }
        this.drained();
      }, pollMs);
    }
  }

  #pump(): void {
    let turn = 0;
    while (!this.#flags.closed && this.#head < this.#queue.length) {
      if (turn >= OUTBOX_TURN_CHARS) {
        // Yield the loop; the rest goes on in the next turn.
        this.#flags.scheduled = true;
        setTimeout(() => {
          this.#flags.scheduled = false;
          if (!this.#flags.waiting) {
            this.#pump();
          }
        }, 0);
        return;
      }
      if (this.#to.buffered() > OUTBOX_HIGH_WATER) {
        this.#wait();
        return;
      }
      const outgoing = this.#queue[this.#head] as Outgoing;
      const frame = outgoing.next();
      const outcome = this.#to.write(frame);
      if (outcome === "dropped") {
        this.#wait();
        return;
      }
      const before = outgoing.left;
      const done = outgoing.taken();
      this.#owed -= before - outgoing.left;
      turn += frame.length;
      if (done) {
        this.#head += 1;
      }
      if (this.#head === this.#queue.length) {
        this.#queue = [];
        this.#head = 0;
      } else if (this.#head > 1024) {
        this.#queue = this.#queue.slice(this.#head);
        this.#head = 0;
      }
      if (outcome === "buffered") {
        this.#wait();
        return;
      }
    }
  }
}
