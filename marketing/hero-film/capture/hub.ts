/**
 * A stand-in hub for the hero film: it answers the dashboard's REST reads and
 * its `/ws/dashboard` socket with the hub's own wire shapes (@cawco/core),
 * from a made-up fleet (fleet.ts). The dashboard it serves is the real one,
 * unmodified, on `vite dev` with `CAWCO_DEV_HUB_URL` pointing here.
 *
 * The film's beats are frames this hub sends when the capture asks for them
 * (`POST /__film/beat/<name>`), so a beat lands on the frame the capture
 * chooses. The one beat the dashboard starts itself is the answer: the
 * capture presses Allow in the real composer, and the `permission.answer`
 * command that sends is what settles the ask here. Nothing here reaches a
 * real hub, machine or model.
 *
 *   bun marketing/hero-film/capture/hub.ts [port]
 */
import type { ServerWebSocket } from "bun";
import {
  ACCOUNTS,
  BEATS,
  type Beat,
  type Fleet,
  FORECAST,
  fleetAt,
  IDS,
  transcriptPage,
} from "./fleet";

const PORT = Number(process.argv[2] ?? 4877);
const WIRE_PROTOCOL = 6;

let fleet: Fleet = fleetAt([]);
const done: Beat[] = [];
const sockets = new Set<ServerWebSocket<unknown>>();
/** Each session's stream position, as the page read and the events since say it. */
const seqs: Record<string, number> = {};

const envelope = (payload: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ verb: "frames", machineId: "hub", ...extra, payload });

const broadcast = (message: string) => {
  for (const socket of sockets) {
    socket.send(message);
  }
};

const board = () =>
  envelope({
    kind: "instances",
    protocol: WIRE_PROTOCOL,
    instances: fleet.instances,
    agents: fleet.machines,
    moves: [],
    noticesSeen: [],
    pulses: fleet.pulses,
    handoffs: {},
    continuations: [],
    formerIds: {},
  });

/** Plays a beat: the board moves, and every frame a hub would send for it goes out. */
function play(beat: Beat): void {
  done.push(beat);
  const before = fleet;
  fleet = fleetAt(done);
  for (const frame of fleet.framesSince(before, beat)) {
    broadcast(envelope(frame));
  }
  for (const [sessionId, events] of Object.entries(
    fleet.streamSince(before, beat)
  )) {
    seqs[sessionId] = (seqs[sessionId] ?? 1) + 1;
    broadcast(
      JSON.stringify({
        type: "stream.event",
        event: {
          sessionId,
          seq: seqs[sessionId],
          frame: { kind: "transcript", instanceId: sessionId, events },
        },
      })
    );
  }
}

/** What each REST read answers. */
const reads: Record<string, () => unknown> = {
  "/api/agents": () => fleet.machines,
  "/api/instances": () => fleet.instances,
  "/api/projects": () => fleet.projects,
  "/api/pending": () => fleet.pending,
  "/api/handoffs": () => ({}),
  "/api/usage/limits": () => ({ machines: [] }),
  "/api/usage/spend": () => fleet.spend,
  "/api/continuations": () => [],
  "/api/project-offers": () => [],
  "/api/accounts": () => ACCOUNTS,
  "/api/accounts/forecast": () => FORECAST,
  "/api/accounts/providers": () => [],
  "/api/actions/waiting": () => ({ actions: [] }),
  "/api/fleet-watch/notices": () => ({ notices: [] }),
  "/api/threads": () => ({}),
  "/api/workflows": () => ({ workflows: [] }),
  "/api/delegate-events": () => [],
  "/api/work-items": () => fleet.workItems,
  // Jev off: the composer offers no suggestions.
  "/api/jev": () => ({
    route: null,
    suggestWhileTyping: false,
    typesafe: null,
  }),
};

const TRANSCRIPT = /^\/api\/instances\/([^/]+)\/(transcript|tooling)$/;
const unknownReads = new Set<string>();

Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",
  fetch(request, server) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/ws/")) {
      return server.upgrade(request)
        ? undefined
        : new Response("upgrade failed", { status: 400 });
    }
    if (url.pathname.startsWith("/__film/beat/")) {
      const name = url.pathname.slice("/__film/beat/".length) as Beat;
      if (!BEATS.includes(name)) {
        return new Response(`no beat ${name}`, { status: 404 });
      }
      play(name);
      return Response.json({ ok: true, beat: name });
    }
    if (url.pathname === "/__film/reset") {
      // Back to the board before any beat, for the next take. A page
      // already open keeps what it was sent; the capture opens a fresh one.
      done.length = 0;
      fleet = fleetAt(done);
      return Response.json({ ok: true });
    }
    const transcript = TRANSCRIPT.exec(url.pathname);
    if (transcript) {
      const [, id, what] = transcript;
      if (what === "tooling") {
        return Response.json({ servers: [], tools: [] });
      }
      seqs[id] = 1;
      return Response.json(transcriptPage(fleet, id, 1));
    }
    const read = reads[url.pathname];
    if (read) {
      return Response.json(read());
    }
    if (request.method === "POST") {
      return Response.json({ ok: true });
    }
    const key = `${request.method} ${url.pathname}`;
    if (!unknownReads.has(key)) {
      unknownReads.add(key);
      console.log(`[stand-in hub] unanswered ${key}`);
    }
    return Response.json(null, { status: 404 });
  },
  websocket: {
    open(socket) {
      sockets.add(socket);
      socket.send(board());
    },
    message(socket, data) {
      const message = JSON.parse(String(data)) as {
        type?: string;
        verb?: string;
        kind?: string;
        commandId?: string;
        requestId?: string;
        payload?: { method?: string; requestId?: string };
      };
      if (message.type === "heartbeat") {
        socket.send(JSON.stringify({ type: "heartbeat" }));
        return;
      }
      if (message.verb === "control" && message.requestId) {
        // listSessions, getTodos: nothing stored beyond the board.
        socket.send(
          envelope(
            {
              kind: "control_result",
              ok: true,
              requestId: message.requestId,
              result: [],
            },
            { requestId: message.requestId }
          )
        );
        return;
      }
      if (message.type === "command" && message.commandId) {
        socket.send(
          JSON.stringify({
            type: "command.ack",
            commandId: message.commandId,
            stage: "applied",
          })
        );
        if (
          message.kind === "permission.answer" &&
          !done.includes("answered")
        ) {
          play("answered");
        }
        return;
      }
      if (
        message.type === "stream.subscribe" ||
        message.type === "stream.unsubscribe" ||
        message.type?.startsWith("plan.")
      ) {
        return;
      }
      console.log(`[stand-in hub] socket said ${String(data).slice(0, 240)}`);
    },
    close(socket) {
      sockets.delete(socket);
    },
  },
});

console.log(`[stand-in hub] listening on ${PORT}; ${IDS.ledger} asks`);
