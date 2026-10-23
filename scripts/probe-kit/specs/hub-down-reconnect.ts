/**
 * An agent registers again within a few seconds of its hub answering, however
 * long the hub was away, and asks a hub that is down only so often (agent
 * daemon.ts `reconnect`, `HUB_PROBE`).
 *
 * 2026-10-24, binary-update-waits-for-hub: a hub down 65 s had its agent
 * register 19–30 s after it answered again, the socket's backoff grown to
 * 30 s past the 2 s of 50 ms knocks. While backed off, the agent now asks
 * the hub's `/health` once a second and reconnects at its first answer.
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
 *
 *   bun scripts/probe-kit/run.ts hub-down-reconnect
 */
import { createServer, type Socket } from "node:net";
import type { Spec } from "../kit";

/** How long the hub stays down: past the knocks, deep into the backoff. */
const DOWN_MS = 90_000;
const UPGRADE = /^upgrade:\s*websocket/im;

/**
 * Counts the connections made to `at`'s port while its hub is down, each cut
 * at its first line: `/health` probes, socket upgrades, and anything else.
 */
async function countKnocks(at: URL): Promise<{
  stop: () => Promise<{ health: number; other: number; sockets: number }>;
}> {
  const counts = { health: 0, other: 0, sockets: 0 };
  const open = new Set<Socket>();
  const server = createServer((socket) => {
    open.add(socket);
    socket.once("close", () => open.delete(socket));
    socket.once("data", (chunk) => {
      const head = chunk.toString("latin1");
      if (head.startsWith("GET /health")) {
        counts.health += 1;
      } else if (UPGRADE.test(head)) {
        counts.sockets += 1;
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

    // (a) The hub down 90 s, the agent's asks counted.
    await fleet.stop("hub");
    const knocks = await countKnocks(new URL(fleet.base));
    await Bun.sleep(DOWN_MS);
    const knocked = await knocks.stop();
    check(
      "while its hub was down 90 s, the agent's asks stayed bounded: at most 60 socket attempts (2 s of 50 ms knocks, then the backoff) and one /health a second",
      knocked.sockets <= 60 && knocked.health <= DOWN_MS / 1000 + 5,
      JSON.stringify(knocked)
    );
    check(
      "it asked the down hub's /health while backed off",
      knocked.health > 0,
      JSON.stringify(knocked)
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
  },
};

export default spec;
