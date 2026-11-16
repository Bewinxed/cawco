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
 * `send`; {@link sendToClient} and {@link sendToMachine} are the ways out.
 *
 * TWO PEERS, TWO DOORS. A line is opened as a machine's (an agent) or a
 * client's (a dashboard, the apps, an artifact tab), and each send names
 * the peer it is for: a client is sent what a screen reads, a machine the
 * hub's command as it is (a machine runs it, keys and an approved call's
 * input included). Each peer's socket is its own type ({@link MachineSocket},
 * {@link ClientSocket}), given only by the line opened for it
 * ({@link machineSocket}, {@link clientSocket}), which stamps the handle
 * with its peer under a symbol only this module holds, so a send through
 * the other peer's door does not compile; one that reached it anyway throws
 * before anything goes. A parked ask's own input goes through the machine's
 * door alone: a client is sent its card ({@link ClientFrame}).
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

import type { HubEnvelope } from "@cawco/core/envelopes";
import type { FramePayload } from "@cawco/core/frames";
import { isRecord } from "@cawco/core/is-record";

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
import { AskCard } from "./ask-presentation";

type RawSocket = ServerSocketLike;

/**
 * One socket, as everything in the hub holds it: its id, and nothing to send
 * with. Elysia builds a fresh handle per callback, so sockets are compared by
 * `id` only, and every frame goes out through {@link sendToClient} or {@link sendToMachine}.
 */
export interface HubSocket {
  readonly id: string;
}

/** Who reads a line: a machine's agent, or a client (a dashboard, the apps, an artifact tab). */
export type Peer = "machine" | "client";

/** The key a handle's peer is stamped under ({@link machineSocket}, {@link clientSocket}): held by this module alone. */
const PEER: unique symbol = Symbol("cawco wire peer");

/** A machine's socket: its line was opened for a machine ({@link machineSocket}). */
export type MachineSocket = HubSocket & { readonly [PEER]: "machine" };

/** A client's socket (a dashboard, the apps, an artifact tab): its line was opened for a client ({@link clientSocket}). */
export type ClientSocket = HubSocket & { readonly [PEER]: "client" };

interface Line {
  assembler: WireAssembler;
  inbox: Inbox;
  outbox: Outbox;
  peer: Peer;
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
  // Cast kept, Elysia 2.0.0-rc.4 (newest) gap: the route context omits `raw`, and `ElysiaWS.raw`'s type omits Bun's `getBufferedAmount`; no upstream issue exists (searched elysiajs/elysia).
  (socket as unknown as { raw: RawSocket }).raw;

const lines = new Map<string, Line>();

/**
 * Opens the socket's line for `peer`. Every frame to a client goes out
 * deflated. The route negotiates permessage-deflate, but Bun compresses only
 * a message sent with the flag set: negotiated alone, a 1.8 MB board went out
 * as 1.8 MB, and with it as 58 KB, half a minute of an empty board on a
 * phone's link otherwise.
 */
export const openLine = (
  socket: HubSocket & { query: Record<string, string | undefined> },
  peer: Peer
): void => {
  const raw = rawOf(socket);
  lines.set(socket.id, {
    raw,
    peer,
    assembler: new WireAssembler(),
    inbox: new Inbox(),
    received: 0,
    // A client that does not announce parts runs the build before them (an
    // agent not yet updated, a tab not yet reloaded): it is sent every
    // message whole, as that build reads them (`WIRE_PARTS_PARAM`).
    outbox: new Outbox(
      serverTransport(raw, peer === "client"),
      announcesParts(socket.query)
    ),
  });
};

/**
 * `socket` as its peer's own type, read off the line its route opened
 * ({@link openLine}): every callback of a route is handed a fresh handle,
 * which each takes as its peer's socket here. A line opened for the other
 * peer throws (module: two doors); a closed one is still its peer's.
 */
export const machineSocket = <S extends HubSocket>(
  socket: S
): S & MachineSocket => {
  lineFor(socket, "machine");
  return Object.assign(socket, { [PEER]: "machine" as const });
};

/** {@link machineSocket}'s twin for a client's line. */
export const clientSocket = <S extends HubSocket>(
  socket: S
): S & ClientSocket => {
  lineFor(socket, "client");
  return Object.assign(socket, { [PEER]: "client" as const });
};

/** The socket's line, when it is still open; one opened for another peer throws (module: two doors). */
const lineFor = (socket: HubSocket, peer: Peer): Line | undefined => {
  const line = lines.get(socket.id);
  if (line && line.peer !== peer) {
    throw new Error(
      `A frame for a ${peer} was sent on socket ${socket.id}, a ${line.peer}'s line.`
    );
  }
  return line;
};

/** What leaves for a client: an envelope, a `{ type }` message, or a session stream frame. */
export type ClientMessage =
  HubEnvelope | { readonly type: string } | { readonly kind: string };

/** A parked ask's payload: its input is the call's own, which only a machine is sent. */
interface AskPayload {
  readonly kind: "permission_request";
}

/** The parked asks' payloads a frame of type `F` may be or carry. */
type AskPayloadOf<F> =
  | Extract<F, AskPayload>
  | (F extends { readonly payload: infer P } ? Extract<P, AskPayload> : never);

/**
 * `F` as a client may be sent it: `never` for a frame that may carry a parked
 * ask, which leaves for a client only as its card ({@link AskCard}).
 */
export type ClientFrame<F> = [AskPayloadOf<F>] extends [never] ? F : never;

/** A frame payload a client may be sent as it is: any but a parked ask's, which goes as its card. */
export type ClientPayload = Exclude<FramePayload, AskPayload>;

/** A send to a client's socket: any client frame, or a parked ask's card. */
export type SendToClient = <F extends ClientMessage>(
  socket: ClientSocket,
  frame: ClientFrame<F> | AskCard
) => void;

/**
 * A frame to a client's socket (a dashboard, the apps, an artifact tab). A
 * parked ask goes only as its card (ask-presentation.ts `AskCard`, its input
 * hidden by field): a frame whose type may carry one does not compile here.
 */
export const sendToClient: SendToClient = (socket, frame) => {
  lineFor(socket, "client")?.outbox.send(
    frame instanceof AskCard ? frame.ask : frame
  );
};

/** The hub's command to a machine's socket, as it is: the machine runs it. */
export const sendToMachine = (socket: MachineSocket, frame: object): void => {
  lineFor(socket, "machine")?.outbox.send(frame);
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
  const text = isRecord(frame) ? frame.text : undefined;
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
