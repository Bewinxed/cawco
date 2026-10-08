import type { Envelope, ErrorFrame, Verb } from "@cawco/core";
import { Context, Effect, Layer } from "effect";

/**
 * The slice of Elysia's WebSocket handle the registry needs — structural so the
 * registry stays free of Elysia's route generics. Elysia builds a fresh handle
 * per lifecycle callback, so sockets are only ever compared by `id`.
 */
export interface HubSocket {
  readonly id: string;
  // biome-ignore lint/style/useConsistentMethodSignatures: HubSocket is implemented by Elysia's ws handle across server.ts and stream.ts; a property signature would narrow the callback's variance against those real implementations.
  send(data: unknown, compress?: boolean): unknown;
}

/**
 * Every frame to a dashboard goes out deflated. The dashboard route negotiates
 * permessage-deflate, but Bun compresses only a message sent with the flag
 * set: negotiated alone, a 1.8MB board went out as 1.8MB, and with it as 58KB.
 * The board's first read is a couple of MB of JSON (every machine's whole
 * session catalogue), which on a phone's link was half a minute of an empty
 * board. JSON that repetitive deflates about thirtyfold.
 */
export const toDashboard = (socket: HubSocket, frame: unknown): unknown =>
  socket.send(frame, true);

/**
 * The hub's answer to a frame it will not act on, on every socket: an `error`
 * frame saying why, under the ids the frame carried, so the request it refuses
 * is answered rather than left to time out. A frame too malformed to carry an
 * id is still answered: the sender learns which field broke it.
 */
export const refusalFrame = (
  frame: unknown,
  message: string,
  verb?: Verb
): Envelope<ErrorFrame> => {
  const field = (key: string): string | undefined => {
    const value =
      typeof frame === "object" && frame !== null
        ? (frame as Record<string, unknown>)[key]
        : undefined;
    return typeof value === "string" ? value : undefined;
  };
  return {
    verb: "frames",
    machineId: field("machineId") ?? "",
    instanceId: field("instanceId"),
    requestId: field("requestId"),
    payload: { kind: "error", ...(verb ? { verb } : {}), message },
  };
};

/**
 * What a frame that is not an envelope lacks, in the sender's terms: the
 * fields every envelope must carry as strings.
 */
export const envelopeFault = (frame: unknown): string => {
  if (typeof frame !== "object" || frame === null || Array.isArray(frame)) {
    return "frame refused: it is not a JSON object with `verb` and `machineId`";
  }
  const missing = ["verb", "machineId"].filter(
    (key) => typeof (frame as Record<string, unknown>)[key] !== "string"
  );
  return `frame refused: ${missing.map((key) => `\`${key}\``).join(" and ")} ${missing.length > 1 ? "are" : "is"} missing or not a string`;
};

export interface RegistryShape {
  /** `older`: the page behind the socket was built for a wire before this hub's. */
  readonly addDashboard: (socket: HubSocket, older: boolean) => void;
  readonly address: (machineId: string) => string | undefined;
  readonly agent: (machineId: string) => HubSocket | undefined;
  readonly broadcast: (envelope: Envelope) => void;
  /**
   * A move of the board. A page on this hub's wire gets `delta`. An older one
   * cannot read it and gets the snapshot instead: the one frame every build
   * reads, and the one whose `protocol` reloads it. Built once, and only when
   * an older page is connected.
   */
  readonly broadcastBoard: (delta: Envelope, snapshot: () => Envelope) => void;
  /** The most recent usable dashboard origin, or nothing if none has connected. */
  readonly dashboardOrigin: () => string | undefined;
  /** Returns the machine the socket was registered as, if it was an agent. */
  readonly dropAgent: (socketId: string) => string | undefined;
  readonly dropDashboard: (socket: HubSocket) => void;
  readonly machineIds: () => string[];
  /**
   * Remembers the origin a dashboard just connected from, if it is one worth
   * linking to. Junk is dropped rather than rejected loudly — a client is free
   * to send whatever `Origin` it likes.
   */
  readonly noteDashboardOrigin: (origin: string | undefined) => void;
  readonly registerAgent: (
    machineId: string,
    socket: HubSocket,
    address?: string
  ) => void;
  /** Routes the reply to a forwarded `control` back to the dashboard that asked. */
  readonly rememberRequester: (requestId: string, socket: HubSocket) => void;
  /** Consumes the route — a `requestId` is answered once. */
  readonly takeRequester: (requestId: string) => HubSocket | undefined;
}

/**
 * Hosts a link is pointless with. A message goes to a phone, and loopback names
 * resolve on the phone, not on the machine the dashboard is running on.
 */
const LOOPBACK_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "[::1]",
  "[::]",
]);

/**
 * The origin as something safe to put in a link, or nothing.
 *
 * `Origin` is a header the client writes, so it is parsed rather than believed:
 * anything that is not an absolute http(s) URL is dropped, and so is loopback —
 * see {@link LOOPBACK_HOSTS}. What comes back is `URL.origin`, which is scheme,
 * host and port and nothing else: no path, no query, no credentials.
 */
const usableOrigin = (origin: string | undefined): string | undefined => {
  if (!origin) {
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return undefined;
  }
  if (LOOPBACK_HOSTS.has(url.hostname)) {
    return undefined;
  }
  return url.origin;
};

/** A control whose reply never came stops being routable after this. */
const REQUESTER_TTL_MS = 5 * 60_000;
const SWEEP_INTERVAL_MS = 60_000;

export class Registry extends Context.Service<Registry, RegistryShape>()(
  "Registry"
) {}

const make = (): RegistryShape => {
  const agents = new Map<string, HubSocket>();
  const addresses = new Map<string, string>();
  /** One entry per dashboard socket. A session's own frames reach it through `stream.ts`. */
  const dashboards = new Map<string, HubSocket>();
  /** The dashboard sockets whose page was built for an older wire, by id. */
  const older = new Set<string>();
  const requesters = new Map<string, { socket: HubSocket; at: number }>();
  /**
   * The last origin a dashboard reached this hub from. Kept rather than derived
   * because the hub has no other way to learn it — see `dashboardUrl` in
   * `telegram.ts`. Newest wins: an operator who has moved to a new hostname is
   * telling the hub so by opening the dashboard there.
   */
  let lastDashboardOrigin: string | undefined;

  const sweep = setInterval(() => {
    const cutoff = Date.now() - REQUESTER_TTL_MS;
    for (const [requestId, entry] of requesters) {
      if (entry.at < cutoff) {
        requesters.delete(requestId);
      }
    }
  }, SWEEP_INTERVAL_MS);
  sweep.unref();

  return {
    registerAgent: (machineId, socket, address) => {
      agents.set(machineId, socket);
      if (address) {
        addresses.set(machineId, address);
      }
    },
    dropAgent: (socketId) => {
      for (const [machineId, socket] of agents) {
        if (socket.id === socketId) {
          agents.delete(machineId);
          addresses.delete(machineId);
          return machineId;
        }
      }
    },
    agent: (machineId) => agents.get(machineId),
    address: (machineId) => addresses.get(machineId),
    machineIds: () => [...agents.keys()],
    addDashboard: (socket, isOlder) => {
      dashboards.set(socket.id, socket);
      if (isOlder) {
        older.add(socket.id);
      }
    },
    dropDashboard: (socket) => {
      dashboards.delete(socket.id);
      older.delete(socket.id);
      for (const [requestId, entry] of requesters) {
        if (entry.socket.id === socket.id) {
          requesters.delete(requestId);
        }
      }
    },
    broadcast: (envelope) => {
      for (const socket of dashboards.values()) {
        toDashboard(socket, envelope);
      }
    },
    broadcastBoard: (delta, snapshot) => {
      let whole: Envelope | undefined;
      for (const socket of dashboards.values()) {
        if (older.has(socket.id)) {
          whole ??= snapshot();
          toDashboard(socket, whole);
        } else {
          toDashboard(socket, delta);
        }
      }
    },
    noteDashboardOrigin: (origin) => {
      const usable = usableOrigin(origin);
      if (usable) {
        lastDashboardOrigin = usable;
      }
    },
    dashboardOrigin: () => lastDashboardOrigin,
    rememberRequester: (requestId, socket) => {
      requesters.set(requestId, { socket, at: Date.now() });
    },
    takeRequester: (requestId) => {
      const entry = requesters.get(requestId);
      requesters.delete(requestId);
      return entry?.socket;
    },
  };
};

export const RegistryLayer = Layer.effect(Registry)(Effect.sync(make));
