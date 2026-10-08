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
 * WHEN A PEER FALLS TOO FAR BEHIND. A socket owing more than
 * `WIRE_MESSAGE_LIMIT_BYTES` is closed (1013, try again later). A dashboard
 * reconnects by itself and is sent the whole board on open (server.ts
 * `/ws/dashboard` open: `instancesFrame("")`), and each session it follows
 * again from its own cursor (stream.ts `subscribe`, `afterSeq`). An agent
 * reconnects, registers, and the register ack's ledger tells it where every
 * session's frames resume (server.ts `registerAck`).
 */
import {
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
  outbox: Outbox;
  raw: RawSocket;
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
export const openLine = (socket: HubSocket, compress: boolean): void => {
  const raw = rawOf(socket);
  lines.set(socket.id, {
    raw,
    assembler: new WireAssembler(),
    outbox: new Outbox(serverTransport(raw, compress)),
  });
};

/** The one way a frame leaves the hub for a socket. */
export const sendFrame = (socket: HubSocket, frame: unknown): void => {
  lines.get(socket.id)?.outbox.send(JSON.stringify(frame));
};

/** The socket's own `drain`: what waits goes on. */
export const drainLine = (socket: HubSocket): void => {
  lines.get(socket.id)?.outbox.drained();
};

/** The socket closed: its queue and any half-received message go with it. */
export const closeLine = (socket: HubSocket): void => {
  lines.get(socket.id)?.outbox.close();
  lines.delete(socket.id);
};

/**
 * A frame from the socket, as Elysia parsed it: the message it completes, or
 * {@link WIRE_PENDING} while its parts are still arriving. A part out of order
 * closes the socket (1002): what it was building can no longer be trusted.
 */
export const receiveFrame = (socket: HubSocket, frame: unknown): unknown => {
  const line = lines.get(socket.id);
  if (!line) {
    return frame;
  }
  try {
    return line.assembler.take(frame);
  } catch (error) {
    if (!(error instanceof WireError)) {
      throw error;
    }
    console.warn(`[hub] socket ${socket.id}: ${error.message}`);
    line.raw.close(1002, error.message);
    return WIRE_PENDING;
  }
};
