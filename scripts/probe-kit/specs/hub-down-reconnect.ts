/**
 * An agent registers again within a few seconds of its hub answering, however
 * long the hub was away, and asks a hub that is down only so often (agent
 * daemon.ts `reconnect`, `HUB_PROBE`).
 *
 * 2026-10-24, binary-update-waits-for-hub: a hub down 65 s had its agent
 * register 19–30 s after it answered again, the socket's backoff grown to
 * 30 s past the 2 s of 50 ms knocks. While backed off, the agent now asks
 * the hub's `/health` once a second and reconnects at its first answer
 * after one it did not give.
 *
 * On a scratch fleet (sessiond, hub, agent):
 *
 * (a) The hub is stopped and stays down 90 s. Every connection the agent
 *     makes to the hub's port meanwhile is counted and cut at its first
 *     line, as a hub that is not there answers none: socket upgrades at
 *     most 60 (40 knocks in 2 s, then 1, 2, 4 … 30 s jittered), `/health`
 *     at most one a second.
 * (b) The hub starts again: the agent is online on it within 5 s of its
 *     first answer.
 * (c) The hub is stopped again, and for 60 s its port answers `/health` as
 *     the hub does, with its hubId, but cuts every socket: a hub up and
 *     refusing this agent. Its answers never end a wait, so the socket
 *     follows the backoff, not the probe: past the 2 s of knocks, at most 10
 *     attempts (1, 2, 4, 8, 16, 30 s jittered; a probe-driven retry would
 *     make one a second), and at most 60 in all. (b)'s connection stood
 *     under a minute (daemon.ts `HEALTHY_CONNECTION`), so the series goes
 *     on where (a) left it, at its 30 s step, with no knocks. Then the hub itself takes
 *     the port again and the agent registers, within one backoff step.
 *
 *   bun scripts/probe-kit/run.ts hub-down-reconnect
 */
import { createServer, type Socket } from "node:net";
import type { Spec } from "../kit";

/** How long the hub stays down in (a): past the knocks, deep into the backoff. */
const DOWN_MS = 90_000;
/** How long (c)'s port answers `/health` and cuts every socket. */
const REFUSING_MS = 60_000;
/** The knocks' window (daemon.ts `RESTART_KNOCK` × `RESTART_KNOCKS`, 2 s), and a second of slack. */
const KNOCKS_MS = 3000;
const UPGRADE = /^upgrade:\s*websocket/im;

interface Knocked {
  health: number;
  other: number;
  /** When each socket upgrade came, ms after the count began. */
  sockets: number[];
}

/**
 * Counts the connections made to `at`'s port while its hub is away: `/health`
 * probes, socket upgrades, and anything else. Each is cut at its first line,
 * except a `/health` when `hubId` is given: answered 200 with it, as the hub
 * answers.
 */
async function countKnocks(
  at: URL,
  hubId?: string
): Promise<{ stop: () => Promise<Knocked> }> {
  const began = Date.now();
  const counts: Knocked = { health: 0, other: 0, sockets: [] };
  const open = new Set<Socket>();
  const health = JSON.stringify({ hubId });
  const server = createServer((socket) => {
    open.add(socket);
    socket.once("close", () => open.delete(socket));
    socket.once("data", (chunk) => {
      const head = chunk.toString("latin1");
      if (head.startsWith("GET /health")) {
        counts.health += 1;
        if (hubId) {
          socket.end(
            `HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: ${health.length}\r\nconnection: close\r\n\r\n${health}`
          );
          return;
        }
      } else if (UPGRADE.test(head)) {
        counts.sockets.push(Date.now() - began);
      } else {
        counts.other += 1;
      }
      socket.destroy();
    });
  });
  await new Promise<void>((resolve) =>
    server.listen(Number(at.port), at.hostname, resolve)
  );
  return {
    stop: () =>
      new Promise((resolve) => {
        server.close(() => resolve({ ...counts }));
        for (const socket of open) {
          socket.destroy();
        }
      }),
  };
}

const spec: Spec = {
  group: "The hub and machines",
  name: "hub-down-reconnect",
  async run(kit) {
    const { check } = kit;
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.launch("agent");
    await fleet.agentUp();
    const { hubId } = (await (await fetch(`${fleet.base}/health`)).json()) as {
      hubId: string;
    };

    // (a) The hub down 90 s, the agent's asks counted.
    await fleet.stop("hub");
    const knocks = await countKnocks(new URL(fleet.base));
    await Bun.sleep(DOWN_MS);
    const knocked = await knocks.stop();
    check(
      "while its hub was down 90 s, the agent's asks stayed bounded: at most 60 socket attempts (2 s of 50 ms knocks, then the backoff) and one /health a second",
      knocked.sockets.length <= 60 && knocked.health <= DOWN_MS / 1000 + 5,
      `${knocked.sockets.length} socket attempts, ${knocked.health} /health, ${knocked.other} other`
    );
    check(
      "it asked the down hub's /health while backed off",
      knocked.health > 0,
      `${knocked.health} /health`
    );

    // (b) The hub back.
    fleet.launch("hub");
    await fleet.hubUp();
    const answered = Date.now();
    await fleet.agentUp();
    const online = Date.now() - answered;
    check(
      "the agent is online on the returned hub within 5 s of its first answer",
      online <= 5000,
      `online ${online} ms after the hub answered`
    );

    // (c) A hub that answers /health and cuts every socket, 60 s.
    await fleet.stop("hub");
    const refusing = await countKnocks(new URL(fleet.base), hubId);
    await Bun.sleep(REFUSING_MS);
    const refused = await refusing.stop();
    const late = refused.sockets.filter((at) => at > KNOCKS_MS);
    check(
      "a hub answering /health but cutting every socket for 60 s gets the backoff, not the probe: at most 10 socket attempts past the knocks, 60 in all",
      late.length <= 10 && refused.sockets.length <= 60,
      `${refused.sockets.length} socket attempts, ${late.length} past ${KNOCKS_MS} ms, at ${late.map((at) => `${(at / 1000).toFixed(1)} s`).join(", ")}; ${refused.health} /health answered`
    );
    check(
      "its /health answered through the 60 s (the probe ran, and ended no wait)",
      refused.health > 0,
      `${refused.health} /health`
    );
    fleet.launch("hub");
    await fleet.hubUp();
    const letThrough = Date.now();
    await fleet.agentUp();
    const through = Date.now() - letThrough;
    check(
      "once the hub takes its port again, the agent registers, within one backoff step (30 s) of its answer",
      through <= 35_000,
      `online ${through} ms after the hub answered`
    );
  },
};

export default spec;
