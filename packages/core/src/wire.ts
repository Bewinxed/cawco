/**
 * How a message crosses one of the hub's WebSockets, at any size, without
 * losing a frame or holding the sender's loop.
 *
 * PARTS. A message whose JSON is longer than {@link WIRE_PART_CHARS} goes out
 * as parts: `{"part":{"id","seq","last"},"text":"…"}`, each carrying the next
 * slice of the message's JSON text, re-encoded as a JSON string. The sender
 * writes the JSON as the parts go ({@link encodeJson}) and the receiver reads
 * each part into the message as it arrives ({@link WireAssembler}), so neither
 * end ever encodes or parses a long message in one call.
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
import {
  encodeJson,
  JsonDecoder,
  type JsonPieces,
  jsonSizeEstimate,
  surrogateSafeEnd,
  textPieces,
} from "./json-stream";

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

/**
 * The marker a client puts on its socket's URL to say it reads parts:
 * `?wire=parts`. The hub updates first, and a machine runs the previous build
 * until it updates itself through that very socket, as does a dashboard tab
 * loaded before the hub moved until it reloads: to a socket without the
 * marker the hub sends every message whole, as the wire did before parts
 * (still in order, never dropped), and takes whole messages from it up to
 * {@link WIRE_MESSAGE_LIMIT_BYTES}.
 */
export const WIRE_PARTS_PARAM = "wire";
export const WIRE_PARTS_VALUE = "parts";

/** `url` with the parts marker, for a client's socket. */
export const announcingParts = (url: string): string =>
  `${url}${url.includes("?") ? "&" : "?"}${WIRE_PARTS_PARAM}=${WIRE_PARTS_VALUE}`;

/** Whether a socket's query says its client reads parts. */
export const announcesParts = (
  query: Record<string, string | undefined>
): boolean => query[WIRE_PARTS_PARAM] === WIRE_PARTS_VALUE;

/** One part of a message too long for one frame. */
export interface WirePart {
  part: { id: string; last: boolean; seq: number };
  text: string;
}

let nextId = 0;
const runId = Math.random().toString(36).slice(2, 10);

/** A frame cut from a message: the text after it, and whether it is the message's last. */
interface Cut {
  done: boolean;
  frame: string;
  rest: string;
}

/**
 * One queued message: its JSON is written ({@link encodeJson}) and cut into
 * frames only as they are sent. Writing a long message whole, or cutting all
 * its parts at once, held the sender's loop for as long as encoding all of
 * it (612 ms for 300 MB on the hub, measured).
 */
class Outgoing {
  readonly #source: JsonPieces;
  /**
   * Sent as one frame, whatever its length: a frame being relayed (never cut
   * again), or any message to a peer that does not read parts.
   */
  readonly #relay: boolean;
  #seq = 0;
  /** Text written and not yet framed. */
  #buffer = "";
  /**
   * `id`: the parts' id, once the message turns out to need parts. `written`:
   * the whole JSON has been written. An object, so each method reads it as it is.
   */
  readonly #state: { id: string; written: boolean } = {
    id: "",
    written: false,
  };
  /** The next frame, cut and not yet taken by the socket. */
  #cut: Cut | undefined;
  /** What this message still counts against its outbox's bound. */
  owed: number;

  constructor(source: JsonPieces, owed: number, relay: boolean) {
    this.#source = source;
    this.owed = owed;
    this.#relay = relay;
  }

  /** The next frame to send; the same one again until it is {@link taken}. */
  next(): string {
    if (this.#cut) {
      return this.#cut.frame;
    }
    const state = this.#state;
    // A message sent whole is written whole: a peer one build behind reads
    // nothing else, so it is sent as the wire sent it before parts.
    while (
      !state.written &&
      (this.#relay || this.#buffer.length <= WIRE_PART_CHARS)
    ) {
      const piece = this.#source.next();
      if (piece === undefined) {
        state.written = true;
      } else {
        this.#buffer += piece;
      }
    }
    if (
      this.#relay ||
      (this.#seq === 0 &&
        state.written &&
        this.#buffer.length <= WIRE_PART_CHARS)
    ) {
      this.#cut = { frame: this.#buffer, rest: "", done: true };
      return this.#buffer;
    }
    if (!state.id) {
      nextId += 1;
      state.id = `${runId}-${nextId}`;
    }
    const end = surrogateSafeEnd(this.#buffer, WIRE_PART_CHARS);
    const rest = this.#buffer.slice(end);
    const done = state.written && rest.length === 0;
    const part: WirePart = {
      part: { id: state.id, seq: this.#seq, last: done },
      text: this.#buffer.slice(0, end),
    };
    this.#cut = { frame: JSON.stringify(part), rest, done };
    return this.#cut.frame;
  }

  /** The socket took the frame {@link next} gave; whether the message is all sent. */
  taken(): boolean {
    const cut = this.#cut as Cut;
    this.#buffer = cut.rest;
    this.#seq += 1;
    this.#cut = undefined;
    this.owed = cut.done
      ? 0
      : Math.max(0, this.owed - (cut.frame.length - cut.rest.length));
    return cut.done;
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

/**
 * Joins one socket's parts back into messages. Each part is read into its
 * message as it arrives ({@link JsonDecoder}), so the last part completes the
 * message at its own cost: parsing a 300 MB message whole held the agent's
 * loop for 278 ms (measured).
 */
export class WireAssembler {
  readonly #open = new Map<
    string,
    { chars: number; decoder: JsonDecoder; next: number }
  >();

  /**
   * A frame off the socket, parsed: a whole message is returned as it is; a
   * part is read on, and the last part of a message returns that message.
   */
  take(frame: unknown): unknown {
    if (!isPart(frame)) {
      return frame;
    }
    const { id, seq, last } = frame.part;
    const open = this.#open.get(id) ?? {
      decoder: new JsonDecoder(),
      next: 0,
      chars: 0,
    };
    if (seq !== open.next) {
      this.#open.delete(id);
      throw new WireError(
        `wire part ${id}#${seq} arrived where #${open.next} was expected`
      );
    }
    open.next += 1;
    open.chars += frame.text.length;
    if (open.chars > WIRE_MESSAGE_LIMIT_BYTES) {
      this.#open.delete(id);
      throw new WireError(
        `wire message ${id} passed ${WIRE_MESSAGE_LIMIT_BYTES} bytes`
      );
    }
    try {
      open.decoder.push(frame.text);
      if (!last) {
        this.#open.set(id, open);
        return WIRE_PENDING;
      }
      this.#open.delete(id);
      return open.decoder.end();
    } catch (error) {
      this.#open.delete(id);
      if (error instanceof SyntaxError) {
        throw new WireError(`wire message ${id}: ${error.message}`, {
          cause: error,
        });
      }
      throw error;
    }
  }
}

/**
 * Work an {@link Inbox} does per turn of the loop before it yields: about one
 * part read into its message (a few milliseconds, measured).
 */
const INBOX_TURN_CHARS = WIRE_PART_CHARS;

/**
 * Frames off one socket, worked through in order, about a part's worth per
 * turn of the loop. A socket hands over every frame it has read in one turn:
 * Bun's client dispatched up to 74 frames of 1 MiB in a single turn
 * (measured), so reading each part as it was dispatched held the loop for
 * 217 ms across a 300 MB message. A frame that arrives with nothing waiting
 * and budget left is worked at once, so ordinary traffic waits for nothing.
 */
export class Inbox {
  readonly #queue: { run: () => void; weight: number }[] = [];
  #head = 0;
  #spent = 0;
  /** A turn to go on in is set. An object, so each method reads it as it is. */
  readonly #flags: { scheduled: boolean } = { scheduled: false };

  /** Works `run` (about `weight` characters of reading) after every frame before it. */
  push(weight: number, run: () => void): void {
    if (this.#head === this.#queue.length && this.#spent < INBOX_TURN_CHARS) {
      this.#spend(weight);
      run();
      return;
    }
    this.#queue.push({ run, weight });
    this.#schedule();
  }

  #spend(weight: number): void {
    this.#spent += weight;
    this.#schedule();
  }

  /** A new turn: a fresh budget, and what waits goes on. */
  #schedule(): void {
    if (this.#flags.scheduled) {
      return;
    }
    this.#flags.scheduled = true;
    setTimeout(() => {
      this.#flags.scheduled = false;
      this.#spent = 0;
      this.#pump();
    }, 0);
  }

  #pump(): void {
    while (this.#head < this.#queue.length && this.#spent < INBOX_TURN_CHARS) {
      const step = this.#queue[this.#head] as {
        run: () => void;
        weight: number;
      };
      this.#head += 1;
      this.#spend(step.weight);
      step.run();
    }
    if (this.#head === this.#queue.length) {
      this.#queue.length = 0;
      this.#head = 0;
    } else if (this.#head > 1024) {
      this.#queue.splice(0, this.#head);
      this.#head = 0;
    }
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

/** A client's side of one socket: its outbox, its inbox and its assembler. */
export interface ClientLine {
  /** Where the socket's messages go, in order; replaces the one before. */
  listen: (handler: (message: unknown) => void) => void;
  /**
   * A frame off the socket, read in order ({@link Inbox}); each message it
   * completes goes to the handler {@link listen} named. A part out of order
   * closes the socket (4002); the client's reconnect reads its state afresh.
   */
  receive: (data: string) => void;
  /** Queues one message, behind everything sent before it. */
  send: (value: unknown) => void;
  /** Queues one message already being written as JSON pieces, about `chars` long. */
  sendPieces: (pieces: JsonPieces, chars: number) => void;
}

const clientLines = new WeakMap<WebSocket, ClientLine>();

/** The line over a client `WebSocket`: one per socket, ended with it. */
export const clientLine = (socket: WebSocket): ClientLine => {
  const open = clientLines.get(socket);
  if (open) {
    return open;
  }
  const outbox = new Outbox(clientTransport(socket));
  const inbox = new Inbox();
  const assembler = new WireAssembler();
  let deliver: (message: unknown) => void = () => undefined;
  const line: ClientLine = {
    send: (value) => outbox.send(value),
    sendPieces: (pieces, chars) => outbox.sendPieces(pieces, chars),
    listen: (handler) => {
      deliver = handler;
    },
    receive: (data) =>
      inbox.push(data.length, () => {
        let message: unknown;
        try {
          message = assembler.take(JSON.parse(data));
        } catch (error) {
          if (!(error instanceof WireError)) {
            throw error;
          }
          socket.close(4002, error.message);
          return;
        }
        if (message !== WIRE_PENDING) {
          deliver(message);
        }
      }),
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

  /** Whether the peer reads parts ({@link WIRE_PARTS_PARAM}); without, every message goes whole. */
  readonly #parts: boolean;

  constructor(to: OutboxTransport, parts = true) {
    this.#to = to;
    this.#parts = parts;
  }

  /**
   * Queues a message, written as JSON and cut into frames as it goes out. It
   * is counted against the bound by an estimate of its size
   * ({@link jsonSizeEstimate}), a walk far cheaper than writing it.
   */
  send(value: unknown): void {
    this.#enqueue(
      new Outgoing(encodeJson(value), jsonSizeEstimate(value), !this.#parts)
    );
  }

  /** Queues a message already being written as JSON pieces, about `chars` long. */
  sendPieces(pieces: JsonPieces, chars: number): void {
    this.#enqueue(new Outgoing(pieces, chars, !this.#parts));
  }

  /**
   * Queues a frame that is already on the wire, as it is: a relay passes the
   * other side's frames (parts included) through without cutting them again.
   */
  forward(frame: string): void {
    this.#enqueue(new Outgoing(textPieces(frame), frame.length, true));
  }

  #enqueue(outgoing: Outgoing): void {
    if (this.#flags.closed) {
      return;
    }
    this.#queue.push(outgoing);
    this.#owed += outgoing.owed;
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
      const before = outgoing.owed;
      const done = outgoing.taken();
      this.#owed -= before - outgoing.owed;
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
