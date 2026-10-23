/**
 * The hub's half of the wire (`@cawco/core/wire`): every frame to an agent or
 * a dashboard leaves through its socket's outbox, and every frame from one is
 * joined back into its message here first.
 *
 * WHY NOTHING SENDS ON A SOCKET DIRECTLY. Bun's server `send()` drops a frame
 * (returns 0) once the socket holds 16 MB unsent, and the hub never looked:
 * behind one large frame, the next ones to a slow dashboard or agent were
 * lost without a word (measured, Bun 1.4.2: after a 64 MB frame the next
 * frame's `send()` returned 0 and it never arrived). `HubSocket` carries no
 * `send`; {@link sendFrame} is the one way out.
 *
 * WHEN A PEER STOPS READING. A socket that takes nothing for
 * `WIRE_STALL_MS` while frames wait is closed (1013, try again later); one
 * whose peer reads, however far behind, is kept. A dashboard
 * reconnects by itself and is sent the whole board on open (server.ts
 * `/ws/dashboard` open: `instancesFrame("")`), and reads each session it
 * follows again, whose page subscribes it (stream.ts `subscribe`). An agent
 * reconnects, registers, and the register ack's ledger tells it where every
 * session's frames resume (server.ts `registerAck`).
 */
import {
  announcesParts,
  Inbox,
  Outbox,
  type ServerSocketLike,
  serverTransport,
  WIRE_PENDING,
  WireAssembler,
  WireError,
} from "@cawco/core/wire";

type RawSocket = ServerSocketLike;

/**
 * One socket, as everything in the hub holds it: its id, and nothing to send
 * with. Elysia builds a fresh handle per callback, so sockets are compared by
 * `id` only, and every frame goes out through {@link sendFrame}.
 */
export interface HubSocket {
  readonly id: string;
}

interface Line {
  assembler: WireAssembler;
  inbox: Inbox;
  outbox: Outbox;
  raw: RawSocket;
  /** Frames the socket has handed the hub so far: what {@link caughtUp} watches go still. */
  received: number;
}

/**
 * Bun's socket under Elysia's handle. `ElysiaWS` declares `raw`
 * (elysia/dist/ws/context.d.ts) and every handle has it, but the context type
 * a route's callbacks are given leaves it out; this is the one place it is read.
 */
const rawOf = (socket: HubSocket): RawSocket =>
  (socket as unknown as { raw: RawSocket }).raw;

const lines = new Map<string, Line>();

/**
 * Opens the socket's line. `compress`: every frame to a dashboard goes out
 * deflated. The route negotiates permessage-deflate, but Bun compresses only
 * a message sent with the flag set: negotiated alone, a 1.8 MB board went out
 * as 1.8 MB, and with it as 58 KB, half a minute of an empty board on a
 * phone's link otherwise.
 */
export const openLine = (
  socket: HubSocket & { query: Record<string, string | undefined> },
  compress: boolean
): void => {
  const raw = rawOf(socket);
  lines.set(socket.id, {
    raw,
    assembler: new WireAssembler(),
    inbox: new Inbox(),
    received: 0,
    // A client that does not announce parts runs the build before them (an
    // agent not yet updated, a tab not yet reloaded): it is sent every
    // message whole, as that build reads them (`WIRE_PARTS_PARAM`).
    outbox: new Outbox(
      serverTransport(raw, compress),
      announcesParts(socket.query)
    ),
  });
};

/** The one way a frame leaves the hub for a socket. */
export const sendFrame = (socket: HubSocket, frame: unknown): void => {
  lines.get(socket.id)?.outbox.send(frame);
};

/** The socket's own `drain`: what waits goes on. */
export const drainLine = (socket: HubSocket): void => {
  lines.get(socket.id)?.outbox.drained();
};

/**
 * How long {@link caughtUp} waits for a socket to hand over nothing more, and
 * the most it waits in all: a 4 MB answer that lay in a stopped hub's socket
 * was read 6 ms after its deadline's timer ran (measured, Bun 1.4.4).
 */
const QUIET_MS = 10;
const CATCH_UP_MS = 1000;

/**
 * Resolves once the hub has caught up with the socket `socketId`: it has
 * read what the socket holds (until a {@link QUIET_MS} turn brings no frame,
 * {@link CATCH_UP_MS} at most) and worked every frame it read through the
 * inbox. What a deadline waits for before it says no answer came. After the
 * hub's thread was held past a deadline, Bun runs the deadline's timer
 * before it reads the sockets, so an answer sent in time still lies in the
 * socket (measured: "deadline at 1710ms, message seen: false … message at
 * 1716ms"); and one read in time may wait in the inbox behind the frames
 * before it (a transcript's parts, a turn's budget at a time). At once for
 * a socket that is gone.
 */
export const caughtUp = async (socketId: string): Promise<void> => {
  const until = Date.now() + CATCH_UP_MS;
  for (;;) {
    const seen = lines.get(socketId)?.received;
    if (seen === undefined) {
      return;
    }
    // biome-ignore lint/performance/noAwaitInLoops: one quiet turn after another, until the socket hands over nothing more
    await Bun.sleep(QUIET_MS);
    if (lines.get(socketId)?.received === seen || Date.now() >= until) {
      break;
    }
  }
  const line = lines.get(socketId);
  if (line) {
    await new Promise<void>((resolve) => line.inbox.push(0, resolve));
  }
};

/** The socket closed: its queue and any half-received message go with it. */
export const closeLine = (socket: HubSocket): void => {
  lines.get(socket.id)?.outbox.close();
  lines.delete(socket.id);
};

/**
 * A frame from the socket, as Elysia parsed it, read in order through the
 * socket's inbox: each message it completes goes to `deliver`. A message's
 * parts are read about one per turn of the loop, however many the socket
 * hands over at once. A part out of order closes the socket (1002): what it
 * was building can no longer be trusted.
 */
export const receiveFrame = (
  socket: HubSocket,
  frame: unknown,
  deliver: (message: unknown) => void
): void => {
  const line = lines.get(socket.id);
  if (!line) {
    return;
  }
  line.received += 1;
  const text = (frame as { text?: unknown } | null)?.text;
  line.inbox.push(typeof text === "string" ? text.length : 0, () => {
    let message: unknown;
    try {
      message = line.assembler.take(frame);
    } catch (error) {
      if (!(error instanceof WireError)) {
        throw error;
      }
      console.warn(`[hub] socket ${socket.id}: ${error.message}`);
      line.raw.close(1002, error.message);
      return;
    }
    if (message !== WIRE_PENDING) {
      deliver(message);
    }
  });
};
