/**
 * The hub hears a machine by its agent's connection, not by its heartbeat
 * (hub machine-contact.ts): an agent whose messages come late while its
 * loop turns is never "stopped answering"; one whose loop is held past
 * `MACHINE_LOST_MS` is, once, and on the hub's own machine its words name
 * the agent, not the machine (core words/contact.ts).
 *
 * 2026-10-25 12:38, obelisk: "obelisk-of-light stopped answering … Check
 * that the machine is awake" reached the owner's phone about the machine
 * the hub runs on, while he worked on it.
 *
 * On a scratch fleet (real hub, agent and sessiond on this one machine, the
 * hub's own), one Claude session on it, the agent reaching the hub through
 * a relay here:
 *
 * (a) Slow but connected: for {@link HELD_MS}, past `MACHINE_LOST_MS`, the
 *     relay holds every message the agent sends (its heartbeats among them)
 *     and passes its pings, as a loaded machine's queue holds its beats
 *     while its loop turns. No Needs-you item and no push; the link stays
 *     the one it was, and the held messages arrive after.
 * (b) Stalled: the agent is stopped (SIGSTOP) past `MACHINE_LOST_MS`. The
 *     machine is lost once: Needs you's item and one push, in the words for
 *     the hub's own machine; both come down once it runs again (SIGCONT).
 *
 *   bun scripts/probe-kit/run.ts agent-contact
 */

import { connect, createServer, type Socket } from "node:net";
import {
  contactWords,
  MACHINE_LOST_MS,
  machineLabel,
} from "../../../packages/core/src";
import { delay, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";
import { standInPhone } from "../phone";
import { frames, PING, type WsFrame } from "../ws-frames";

/** How long (a) holds the agent's messages: past the span by half a minute. */
const HELD_MS = MACHINE_LOST_MS + 30_000;
/** The scratch fleet's machine (scratch-fleet.ts `MACHINE`). */
const MACHINE = "scratch-fleet";
/** A request that upgrades to a WebSocket. */
const WEBSOCKET_UPGRADE = /^upgrade:\s*websocket/im;
/** RFC 6455 §5.2: opcodes from here up are control frames. */
const CONTROL = 0x8;

/**
 * A relay the agent reaches the hub through. While `hold` is on, every
 * message frame the agent sends is kept, in order, and its control frames
 * (its pings) pass; `release` sends what was kept. It counts the
 * WebSocket links the agent opens through it.
 */
const agentRelay = (hubPort: number) => {
  let holding = false;
  let links = 0;
  let pings = 0;
  const pairs = new Set<{ agent: Socket; hub: Socket; kept: Buffer[] }>();
  const server = createServer((agent) => {
    const hub = connect(hubPort, "127.0.0.1");
    const pair = { agent, hub, kept: [] as Buffer[] };
    pairs.add(pair);
    const split = frames();
    /** One frame from the agent: kept while holding a message, else passed. */
    const pass = ({ frame, opcode }: WsFrame) => {
      if (opcode === PING) {
        pings += 1;
      }
      if (holding && opcode < CONTROL) {
        pair.kept.push(frame);
      } else {
        hub.write(frame);
      }
    };
    /** The request, until it has come whole: then the bytes after it, or null for a plain one. */
    let head: Buffer | null = Buffer.alloc(0);
    let plain = false;
    const opened = (data: Buffer): Buffer | null => {
      head = Buffer.concat([head ?? Buffer.alloc(0), data]);
      const end = head.indexOf("\r\n\r\n");
      if (end < 0) {
        return null;
      }
      const request = head.subarray(0, end + 4);
      const rest = head.subarray(end + 4);
      head = null;
      hub.write(request);
      if (!WEBSOCKET_UPGRADE.test(request.toString("latin1"))) {
        plain = true;
        hub.write(rest);
        return null;
      }
      links += 1;
      return rest;
    };
    agent.on("data", (data: Buffer) => {
      if (plain) {
        hub.write(data);
        return;
      }
      const chunk = head ? opened(data) : data;
      for (const one of chunk ? split(chunk) : []) {
        pass(one);
      }
    });
    hub.on("data", (chunk: Buffer) => agent.write(chunk));
    const end = () => {
      pairs.delete(pair);
      agent.destroy();
      hub.destroy();
    };
    for (const socket of [agent, hub]) {
      socket.on("close", end);
      socket.on("error", end);
    }
  });
  return {
    listening: new Promise<number>((resolve) => {
      server.listen(0, "127.0.0.1", () =>
        resolve((server.address() as { port: number }).port)
      );
    }),
    /** WebSocket links opened through it so far, and pings passed. */
    counts: () => ({ links, pings }),
    hold: () => {
      holding = true;
    },
    /** What was kept goes on, in order; the frames kept. */
    release: (): number => {
      holding = false;
      let kept = 0;
      for (const pair of pairs) {
        kept += pair.kept.length;
        for (const frame of pair.kept.splice(0)) {
          pair.hub.write(frame);
        }
      }
      return kept;
    },
    stop: () => {
      for (const pair of pairs) {
        pair.agent.destroy();
        pair.hub.destroy();
      }
      server.close();
    },
  };
};

export default {
  group: "The hub and machines",
  name: "agent-contact",
  run: async (kit: Kit) => {
    const { check } = kit;
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
    const phone = standInPhone(fleet);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    await phone.pair();
    fleet.fileAccount();
    const relay = agentRelay(Number(new URL(fleet.base).port));
    const through = `ws://127.0.0.1:${await relay.listening}/ws`;
    try {
      fleet.launch("agent", [], { CAWCO_HUB_URL: through });
      await fleet.agentUp();
      await fleet.accountSignedIn();
      // A session on the machine, its first turn read: the machine holds
      // sessions at its next beat.
      const id = await fleet.spawn("claude", "Contact");
      const first = await fleet.send(id, "Hello.");
      await until(
        "its first turn read",
        () =>
          fleet.query<{ state: string }>(
            "SELECT state FROM sent_messages WHERE uuid = ?",
            first
          )[0],
        (sent) => sent.state === "read"
      );
      // Two beats, so the hub's last says sessions run there.
      await delay(31_000);
      const row = async () =>
        (
          await fleet.api<
            {
              hostname: string;
              hostsHub?: boolean;
              lostAt?: number | null;
              machineId: string;
            }[]
          >("/api/agents")
        ).find((one) => one.machineId === MACHINE);
      const machinePushes = () =>
        phone
          .pushes()
          .filter(
            (one) =>
              one.payload.cawco?.kind === "machine" ||
              one.collapseId?.startsWith("machine-") === true
          );
      const lostReads: (number | null)[] = [];
      const watchLost = async (ms: number) => {
        const from = Date.now();
        while (Date.now() - from < ms) {
          // biome-ignore lint/performance/noAwaitInLoops: a look every 2.5 s
          lostReads.push((await row())?.lostAt ?? null);
          await delay(2500);
        }
      };

      // (a) Slow but connected.
      const quiet = await fleet.logMark("hub");
      const before = relay.counts();
      relay.hold();
      await watchLost(HELD_MS);
      const during = relay.counts();
      const kept = relay.release();
      await delay(10_000);
      const quietLines = (await quiet.since())
        .split("\n")
        .filter((line) => line.includes("[machines]"));
      check(
        `a: the agent's messages held ${HELD_MS / 1000} s (past ${MACHINE_LOST_MS / 1000} s) while its pings pass: no Needs-you item, no push, the link the one it was`,
        kept > 0 &&
          during.pings > before.pings &&
          during.links === before.links &&
          relay.counts().links === before.links &&
          lostReads.every((one) => one === null) &&
          quietLines.length === 0 &&
          machinePushes().length === 0,
        `${kept} message frame(s) held, ${during.pings - before.pings} ping(s) passed, links ${before.links} → ${relay.counts().links}; lostAt read ${JSON.stringify(lostReads)}; ${JSON.stringify(quietLines)}; pushes ${JSON.stringify(phone.ids())}`
      );

      // (b) Stalled past the span.
      const lostLog = await fleet.logMark("hub");
      fleet.freeze("agent", true);
      const stoppedAt = Date.now();
      await until(
        "the machine lost",
        async () => (await row())?.lostAt ?? undefined,
        (one) => typeof one === "number",
        MACHINE_LOST_MS + 30_000
      );
      // Its last word came at most one ping (15 s) before the stop.
      const raisedAfter = Date.now() - stoppedAt;
      await until(
        "the lost machine's push",
        () => (machinePushes().length > 0 ? true : undefined),
        Boolean,
        60_000
      );
      await delay(5000);
      const lostRow = await row();
      fleet.freeze("agent", false);
      const down = await until(
        "the machine answering again",
        async () => ((await row())?.lostAt === null ? true : undefined),
        Boolean,
        60_000
      );
      await delay(2000);
      const said = (await lostLog.since()).split("\n");
      const name = machineLabel(lostRow?.hostname ?? "");
      const pushed = machinePushes();
      const alert = pushed[0]?.payload.aps?.alert;
      const told = said.filter((line) =>
        line.includes(contactWords.lostLogged)
      );
      const back = said.filter((line) =>
        line.includes(contactWords.backLogged)
      );
      check(
        `b: the agent stopped past ${MACHINE_LOST_MS / 1000} s, the hub's own machine is lost once (Needs you's item, one push: “${contactWords.lostTitle(name, true)}”), and both come down once it runs`,
        raisedAfter >= MACHINE_LOST_MS - 16_000 &&
          raisedAfter <= MACHINE_LOST_MS + 16_000 &&
          lostRow?.hostsHub === true &&
          told.length === 1 &&
          pushed.length === 1 &&
          alert?.title === contactWords.lostTitle(name, true) &&
          alert.body ===
            contactWords.lostLine(name, MACHINE_LOST_MS / 60_000, true) &&
          down &&
          back.length === 1,
        `lost ${Math.round(raisedAfter / 1000)} s after the stop; hostsHub ${lostRow?.hostsHub}; told ${JSON.stringify(told)}; pushes ${JSON.stringify(pushed.map((one) => one.payload.aps?.alert))}; back ${JSON.stringify(back)}`
      );
    } finally {
      relay.stop();
      phone.stop();
    }
  },
} satisfies Spec;
