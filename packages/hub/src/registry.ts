import type { FrameEnvelope, HubEnvelope } from "@cawco/core/envelopes";
import { isRecord } from "@cawco/core/is-record";
import type { Verb } from "@cawco/core/protocol";
import { Context, Effect, Layer } from "effect";
import type { AskCard } from "./ask-presentation";
import { HubLifetime, type HubLifetimeShape } from "./lifetime";
import {
  type ClientFrame,
  type ClientSocket,
  type MachineSocket,
  sendToClient,
} from "./wire-socket";

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
): FrameEnvelope<"error"> => {
  const field = (key: string): string | undefined => {
    const value = isRecord(frame) ? frame[key] : undefined;
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

export interface RegistryShape {
  /** `older`: the page behind the socket was built for a wire before this hub's. */
  readonly addDashboard: (socket: ClientSocket, older: boolean) => void;
  readonly address: (machineId: string) => string | undefined;
  readonly agent: (machineId: string) => MachineSocket | undefined;
  /**
   * An envelope to every dashboard and app socket; a parked ask goes as its
   * card alone (ask-presentation.ts `AskCard`, wire-socket.ts `ClientFrame`).
   */
  readonly broadcast: <F extends HubEnvelope>(
    envelope: ClientFrame<F> | AskCard
  ) => void;
  /**
   * What moved on the board, to every page on this hub's wire. A page built
   * for an older one was sent the board whole as its socket opened, which
   * reloads it, and reads nothing after (dashboard socket.svelte.ts
   * `olderThanHub`): it is sent none of this.
   */
  readonly broadcastBoard: (frame: FrameEnvelope<"board">) => void;
  /** A hub frame that is not an envelope (`{ type, … }`), to every dashboard and app socket. */
  readonly broadcastTyped: (frame: { readonly type: string }) => void;
  /** Every usable dashboard origin seen since the hub started, newest first: empty if none has connected. */
  readonly dashboardOrigins: () => readonly string[];
  /** Returns the machine the socket was registered as, if it was an agent. */
  readonly dropAgent: (socketId: string) => string | undefined;
  readonly dropDashboard: (socket: ClientSocket) => void;
  readonly machineIds: () => string[];
  /**
   * Remembers the origin a dashboard just connected from, if it is one worth
   * linking to. Junk is dropped rather than rejected loudly — a client is free
   * to send whatever `Origin` it likes.
   */
  readonly noteDashboardOrigin: (origin: string | undefined) => void;
  /**
   * Hears each agent socket once, the moment it stops being its machine's:
   * a newer register replaced it ({@link registerAgent}), or it was dropped
   * ({@link dropAgent}), whichever comes first.
   */
  readonly onAgentLeft: (
    listener: (machineId: string, socketId: string) => void
  ) => void;
  /**
   * Hears each machine whose socket came or went, as it does: a register,
   * one replacing it, a drop. What reads the machine's presence (the board)
   * lays it again.
   */
  readonly onPresence: (listener: (machineId: string) => void) => void;
  readonly registerAgent: (
    machineId: string,
    socket: MachineSocket,
    address?: string
  ) => void;
  /** Routes the reply to a forwarded `control` back to the dashboard that asked. */
  readonly rememberRequester: (requestId: string, socket: ClientSocket) => void;
  /**
   * The most recent usable dashboard origin on https, or nothing if none has
   * connected over https: the only address OpenRouter's sign-in returns to
   * (its OAuth `callback_url` takes "https URLs and localhost/127.0.0.1 URLs").
   */
  readonly secureDashboardOrigin: () => string | undefined;
  /** Consumes the route — a `requestId` is answered once. */
  readonly takeRequester: (requestId: string) => ClientSocket | undefined;
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

/** How many dashboard origins the hub keeps: a person's few addresses, and no more for a client that sends many. Our choice. */
const KEPT_DASHBOARD_ORIGINS = 16;

/** A control whose reply never came stops being routable after this. */
const REQUESTER_TTL_MS = 5 * 60_000;
const SWEEP_INTERVAL_MS = 60_000;

export class Registry extends Context.Service<Registry, RegistryShape>()(
  "Registry"
) {}

const make = (lifetime: HubLifetimeShape): RegistryShape => {
  const agents = new Map<string, MachineSocket>();
  const addresses = new Map<string, string>();
  /** One entry per dashboard socket. A session's own frames reach it through `stream.ts`. */
  const dashboards = new Map<string, ClientSocket>();
  /** The dashboard sockets whose page was built for an older wire, by id. */
  const older = new Set<string>();
  const requesters = new Map<string, { socket: ClientSocket; at: number }>();
  /**
   * Every origin a dashboard reached this hub from, newest first, each once.
   * Kept rather than derived because the hub has no other way to learn them —
   * see `dashboardUrl` in `dashboard-url.ts`. Newest leads: an operator who has
   * moved to a new hostname is telling the hub so by opening the dashboard
   * there. The rest stay for a reader that wants one on the hub's own names
   * (`delegateDashboard`): a person's phone through a public proxy is the
   * newest as often as not.
   */
  let dashboardOrigins: string[] = [];
  /**
   * The last of those on https, kept apart: the address a person is linked to
   * is the one that reached the hub last, whatever its scheme, but a sign-in
   * that must return over https needs the last https one even when a plain
   * http page connected since.
   */
  let lastSecureDashboardOrigin: string | undefined;

  lifetime.every("registry requesters swept", SWEEP_INTERVAL_MS, () => {
    const cutoff = Date.now() - REQUESTER_TTL_MS;
    for (const [requestId, entry] of requesters) {
      if (entry.at < cutoff) {
        requesters.delete(requestId);
      }
    }
  });

  const leftListeners: ((machineId: string, socketId: string) => void)[] = [];
  const presenceListeners: ((machineId: string) => void)[] = [];
  const presenceMoved = (machineId: string): void => {
    for (const listener of presenceListeners) {
      listener(machineId);
    }
  };
  const left = (machineId: string, socketId: string): void => {
    for (const listener of leftListeners) {
      listener(machineId, socketId);
    }
  };

  return {
    onAgentLeft: (listener) => {
      leftListeners.push(listener);
    },
    onPresence: (listener) => {
      presenceListeners.push(listener);
    },
    registerAgent: (machineId, socket, address) => {
      const before = agents.get(machineId);
      agents.set(machineId, socket);
      if (address) {
        addresses.set(machineId, address);
      }
      if (before && before.id !== socket.id) {
        left(machineId, before.id);
      }
      presenceMoved(machineId);
    },
    dropAgent: (socketId) => {
      for (const [machineId, socket] of agents) {
        if (socket.id === socketId) {
          agents.delete(machineId);
          addresses.delete(machineId);
          left(machineId, socketId);
          presenceMoved(machineId);
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
        sendToClient(socket, envelope);
      }
    },
    broadcastTyped: (frame) => {
      for (const socket of dashboards.values()) {
        sendToClient(socket, frame);
      }
    },
    broadcastBoard: (frame) => {
      for (const socket of dashboards.values()) {
        if (!older.has(socket.id)) {
          sendToClient(socket, frame);
        }
      }
    },
    noteDashboardOrigin: (origin) => {
      const usable = usableOrigin(origin);
      if (usable) {
        dashboardOrigins = [
          usable,
          ...dashboardOrigins.filter((one) => one !== usable),
        ].slice(0, KEPT_DASHBOARD_ORIGINS);
        if (usable.startsWith("https://")) {
          lastSecureDashboardOrigin = usable;
        }
      }
    },
    dashboardOrigins: () => dashboardOrigins,
    secureDashboardOrigin: () => lastSecureDashboardOrigin,
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

export const RegistryLayer = Layer.effect(Registry)(
  Effect.gen(function* () {
    return make(yield* HubLifetime);
  })
);
