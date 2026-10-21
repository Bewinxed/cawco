/**
 * Where the SSH connections the hub holds to the machines it added over SSH
 * (ssh-tunnels.ts) bring their machines in: a listener on this host's
 * loopback for each such machine, which carries every request and socket on
 * to the hub's own port, marked as having come through a machine's forward
 * and named by the address the person gave its add.
 *
 * A machine's forward listens on its own loopback, so on a box several
 * people share, any local user can reach it, not only the machine's own
 * agent. What arrives here is therefore held to what a hub that requires
 * paired devices holds every caller to (hub-auth.ts `classify`, whatever the
 * hub's own mode): a machine's proof of its key, a session's credential, a
 * paired device's token, or nothing, and nothing reaches only the open
 * routes. The mark is a secret this process made at start and keeps in
 * memory, as the hub's call to itself is (hub-self.ts), set here on every
 * request and socket and refused from anyone else.
 *
 * Every connection through a forward reaches the hub from this host's
 * loopback, so its own address names no machine. Each add's listener says
 * the host of the SSH target the person gave it instead
 * ({@link CLIENT_ADDRESS_HEADER}, the relay's word the gate already reads,
 * hub-auth.ts `clientAddress`): the machine waiting to be admitted, a log
 * line, a pairing asked from it all name that host, never 127.0.0.1.
 *
 * Every request goes on as the machine sent it, its body streamed, the
 * answer's bytes untouched: the agent's hub loopback carries the hub the
 * same way (agent hub-loopback.ts).
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  causeOf,
  type PreviewSocket,
  previewFailed,
  previewWebSocket,
  proxyHeaders,
  upgradePreview,
} from "@cawco/core/preview-proxy";
import type { Server } from "bun";
import { HUB_PORT } from "./config";
import type { HubLifetimeShape } from "./lifetime";

/** The header that says a request came in through a machine's SSH forward. */
export const SSH_FORWARD_HEADER = "x-cawco-ssh-forward";

/**
 * Where a request came from, as a relay that knows says it: the door's word
 * for a forward's machine, set here and never taken from the machine.
 */
export const CLIENT_ADDRESS_HEADER = "x-cawco-client-address";

/**
 * Which SSH add's forward a request came through: the record's id
 * (ssh-tunnels.ts), set by the door beside its mark and read only with it,
 * so the hub knows a connection is the machine an add is joining.
 */
export const SSH_RECORD_HEADER = "x-cawco-ssh-record";

const HOP = "ssh door";

const secret = randomBytes(32).toString("base64url");

/** Whether `value` is this process's own forward mark. */
export const viaSshForward = (value: string | null | undefined): boolean => {
  if (!value) {
    return false;
  }
  const given = Buffer.from(value);
  const held = Buffer.from(secret);
  return given.length === held.length && timingSafeEqual(given, held);
};

/**
 * The host an SSH target names, as the person typed it: `user@host` without
 * the user, a `Host` from `~/.ssh/config` as it is.
 */
export const targetHost = (target: string): string =>
  target.slice(target.lastIndexOf("@") + 1);

/** What the hub answers a request it could not carry on. */
const unreachable = (cause: string): Response =>
  new Response(`The hub did not answer on its own port (${cause}).\n`, {
    status: 502,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });

/** A request's headers as the hub reads them from the door: marked, and named by `address`, nothing the machine said in either's place. */
const marked = (from: Headers, address: string, record: string): Headers => {
  const headers = proxyHeaders(from);
  headers.set(CLIENT_ADDRESS_HEADER, address);
  headers.set(SSH_RECORD_HEADER, record);
  headers.set(SSH_FORWARD_HEADER, secret);
  return headers;
};

export interface SshDoor {
  /** Its listener closes: the add's record went. */
  readonly close: (id: string) => void;
  /**
   * The port on this host's loopback the forward of record `id` goes to,
   * its listener opened on the first ask and kept: every request through it
   * named by the host of `target`, the SSH target the person gave.
   */
  readonly port: (id: string, target: string) => number;
}

export const createSshDoor = (lifetime: HubLifetimeShape): SshDoor => {
  const listeners = new Map<string, Server<PreviewSocket>>();
  const hub = `127.0.0.1:${HUB_PORT}`;

  const open = (address: string, record: string): Server<PreviewSocket> =>
    Bun.serve<PreviewSocket>({
      hostname: "127.0.0.1",
      port: 0,
      websocket: previewWebSocket,
      async fetch(request, door) {
        const url = new URL(request.url);
        const at = `${url.pathname}${url.search}`;
        const headers = marked(request.headers, address, record);
        if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
          return upgradePreview(request, door, `ws://${hub}${at}`, headers, {
            hop: HOP,
            instanceId: null,
          })
            ? undefined
            : new Response("WebSocket upgrade failed", { status: 400 });
        }
        try {
          const answer = await fetch(`http://${hub}${at}`, {
            method: request.method,
            headers,
            body: request.body,
            redirect: "manual",
            decompress: false,
          });
          return new Response(answer.body, {
            status: answer.status,
            statusText: answer.statusText,
            headers: proxyHeaders(answer.headers),
          });
        } catch (error) {
          previewFailed(HOP, null, `${hub} didn't answer: ${causeOf(error)}`);
          return unreachable(causeOf(error));
        }
      },
      error(error) {
        previewFailed(HOP, null, causeOf(error));
        return unreachable(causeOf(error));
      },
    });

  lifetime.onClose(() => {
    for (const listener of listeners.values()) {
      listener.stop(true);
    }
    listeners.clear();
  });

  return {
    port: (id, target) => {
      if (lifetime.closed()) {
        throw new Error(
          "The hub is closing: its door for SSH forwards is shut."
        );
      }
      const held = listeners.get(id);
      if (held?.port) {
        return held.port;
      }
      const made = open(targetHost(target), id);
      listeners.set(id, made);
      if (!made.port) {
        throw new Error("The hub's door for SSH forwards opened on no port.");
      }
      return made.port;
    },
    close: (id) => {
      listeners.get(id)?.stop(true);
      listeners.delete(id);
    },
  };
};
