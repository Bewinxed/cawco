/**
 * Where the SSH connections the hub holds to the machines it added over SSH
 * (ssh-tunnels.ts) bring their machines in: a listener on this host's
 * loopback that carries every request and socket on to the hub's own port,
 * marked as having come through a machine's forward.
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

/** What the door sends on as a request's address: a relay's word the gate would read (hub-auth.ts `clientAddress`). */
const CLIENT_ADDRESS_HEADER = "x-cawco-client-address";

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

/** What the hub answers a request it could not carry on. */
const unreachable = (cause: string): Response =>
  new Response(`The hub did not answer on its own port (${cause}).\n`, {
    status: 502,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });

/** A request's headers as the hub reads them from the door: marked, and nothing the machine said in the mark's place. */
const marked = (from: Headers): Headers => {
  const headers = proxyHeaders(from);
  headers.delete(CLIENT_ADDRESS_HEADER);
  headers.set(SSH_FORWARD_HEADER, secret);
  return headers;
};

export interface SshDoor {
  /** The door's port on this host's loopback, once it listens. */
  readonly port: () => number;
  /** Opens the door: the hub serves. */
  readonly start: () => void;
}

export const createSshDoor = (lifetime: HubLifetimeShape): SshDoor => {
  let server: Server<PreviewSocket> | undefined;
  const hub = `127.0.0.1:${HUB_PORT}`;
  return {
    port: () => {
      if (!server?.port) {
        throw new Error("The hub's door for SSH forwards is not open.");
      }
      return server.port;
    },
    start: () => {
      if (server) {
        return;
      }
      server = Bun.serve<PreviewSocket>({
        hostname: "127.0.0.1",
        port: 0,
        websocket: previewWebSocket,
        async fetch(request, door) {
          const url = new URL(request.url);
          const at = `${url.pathname}${url.search}`;
          const headers = marked(request.headers);
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
      const open = server;
      lifetime.onClose(() => {
        open.stop(true);
      });
    },
  };
};
