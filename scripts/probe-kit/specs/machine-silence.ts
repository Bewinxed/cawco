/**
 * A machine that is slow, or silent for a moment, is never a notice to the
 * person; only a machine CawCo has really lost is, once (hub
 * machine-contact.ts, core words/contact.ts `MACHINE_LOST_MS`). And the
 * hub's settle reads and OpenCode's reattach never turn one slow moment
 * into a storm.
 *
 * 2026-10-20, obelisk: "obelisk hasn't responded in time" reached the owner
 * about the hub's own machine: fleet watch's "Same error 3 times" over one
 * 10 s transcript read missed three times. 2026-10-23 19:28:56, obelisk:
 * 471 settle reads of one machine in one second, none answered within
 * 10 s; 20:20, 369 OpenCode reattaches retrying every 5 s, unbounded.
 *
 * On a scratch fleet (real hub, agent and sessiond on this one machine, the
 * hub's own) against the mock model:
 *
 * (a) Six Claude sessions are each sent a message while the agent is
 *     frozen, so each holds an unread send; the agent is killed and started
 *     again, twice. The agent reaches the hub through a relay here
 *     ({@link agentRelay}), and the moment the hub asks it for a transcript
 *     (its settle reads, as it registers) the agent is frozen and what it
 *     says is held, for {@link FROZEN_MS}: the reads go unanswered. No
 *     Needs-you item and no push about the machine, nor any fleet-watch
 *     notice, comes of it.
 * (b) The machine is asked {@link SETTLE_READS_PER_MACHINE} settle reads at
 *     most at once (server.ts `SETTLE_READS_PER_MACHINE`), the rest waiting
 *     their turn.
 * (c) Each session's settle reads never overlap, and each after an
 *     unanswered one is asked no sooner than its backoff said.
 * (d) Frozen past `MACHINE_LOST_MS` with sessions on it, the machine is
 *     lost: exactly one notice (Needs you's item on the machine's row and
 *     one push), in its words; it is taken down once the machine answers.
 * (e) An OpenCode session's server frozen (its active-sessions read hangs)
 *     across an agent restart: its reattach's waits double from 1 s to the
 *     30 s ceiling, and it stops at its 120 s budget in its own words, the
 *     session settled asleep.
 *
 *   bun scripts/probe-kit/run.ts machine-silence
 */

import { connect, createServer, type Socket } from "node:net";
import {
  contactWords,
  MACHINE_LOST_MS,
  machineLabel,
} from "../../../packages/core/src";
import { signal } from "../../../packages/core/src/signal";
import { delay, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";
import { type Phone, standInPhone } from "./turn-push";

/** server.ts `SETTLE_READS_PER_MACHINE`. */
const SETTLE_READS_PER_MACHINE = 4;
/** More sessions than the machine's settle turns, so some wait theirs. */
const SESSIONS = 6;
/** Each freeze after a register: past two rounds of 10 s reads, well short of `MACHINE_LOST_MS`. */
const FROZEN_MS = 25_000;
/** opencode.ts: the reattach's first wait, its ceiling and its budget. */
const RETRY_FIRST_MS = 1000;
const RETRY_MAX_MS = 30_000;
const RETRY_BUDGET_MS = 120_000;
/** The hub's line for a settle read its machine left unanswered (server.ts `askSettle`). */
const SETTLE =
  /\[hub\] ([0-9a-f-]{36}): settle read on .+ not answered \(asked at (\d+), waited (\d+) ms\); its next is asked no sooner than (\d+),/;
const RETRY =
  /\[opencode\] recovery ([0-9a-f-]{36}) waiting; retry (\d+) in (\d+)ms/;

/** What the hub asks a machine for when it reads a transcript (core harness.ts `CONTROL_GET_SESSION_MESSAGES`). */
const TRANSCRIPT_ASK = "getSessionMessages";
/** The upgrade's header that offers permessage-deflate. */
const DEFLATE_OFFER = /^sec-websocket-extensions:/i;

/**
 * A relay the agent reaches the hub through. Armed, the first hub frame that
 * asks for a transcript calls `asked` (the agent is frozen there) before the
 * agent can read it, and from then on what the agent sends is held, never
 * passed on, until `release`. It strips the agent's offer to deflate, so
 * the hub's frames cross it as plain JSON. Without that hold an agent answers in the
 * milliseconds before a freeze from outside lands.
 */
const agentRelay = (hubPort: number) => {
  let armed: (() => void) | null = null;
  let holding = false;
  const pairs = new Set<{ agent: Socket; hub: Socket; kept: Buffer[] }>();
  const server = createServer((agent) => {
    const hub = connect(hubPort, "127.0.0.1");
    const pair = { agent, hub, kept: [] as Buffer[] };
    pairs.add(pair);
    // The upgrade without its offer of permessage-deflate, so the hub's
    // frames cross the relay as their own JSON, read for the ask.
    let upgrade: Buffer | null = Buffer.alloc(0);
    agent.on("data", (data: Buffer) => {
      let chunk = data;
      if (upgrade) {
        upgrade = Buffer.concat([upgrade, data]);
        const end = upgrade.indexOf("\r\n\r\n");
        if (end < 0) {
          return;
        }
        const head = upgrade
          .subarray(0, end)
          .toString("latin1")
          .split("\r\n")
          .filter((line) => !DEFLATE_OFFER.test(line))
          .join("\r\n");
        chunk = Buffer.concat([
          Buffer.from(head, "latin1"),
          upgrade.subarray(end),
        ]);
        upgrade = null;
      }
      if (holding) {
        pair.kept.push(chunk);
      } else {
        hub.write(chunk);
      }
    });
    hub.on("data", (chunk) => {
      if (armed && chunk.includes(TRANSCRIPT_ASK)) {
        const fire = armed;
        armed = null;
        holding = true;
        fire();
      }
      agent.write(chunk);
    });
    const end = () => {
      pairs.delete(pair);
      agent.destroy();
      hub.destroy();
    };
    agent.on("close", end);
    hub.on("close", end);
    agent.on("error", end);
    hub.on("error", end);
  });
  return {
    listening: new Promise<number>((resolve) => {
      server.listen(0, "127.0.0.1", () =>
        resolve((server.address() as { port: number }).port)
      );
    }),
    /** The next transcript ask calls `asked`, and holds what the agent says from then. */
    arm: (asked: () => void) => {
      armed = asked;
    },
    /** What the agent said meanwhile goes on, and nothing more is held. */
    release: () => {
      holding = false;
      for (const pair of pairs) {
        for (const chunk of pair.kept.splice(0)) {
          pair.hub.write(chunk);
        }
      }
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

interface SettleRead {
  asked: number;
  ended: number;
  next: number;
  session: string;
}

export default {
  name: "machine-silence",
  run: async (kit: Kit) => {
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
    // What reaches the person's phone: every push the hub sends.
    const phone = standInPhone(fleet);
    try {
      await legs(kit, fleet, phone);
    } finally {
      phone.stop();
    }
  },
} satisfies Spec;

const legs = async (kit: Kit, fleet: KitFleet, phone: Phone) => {
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  await phone.pair();
  fleet.fileAccount();
  const relay = agentRelay(Number(new URL(fleet.base).port));
  const through = `ws://127.0.0.1:${await relay.listening}/ws`;
  const launchAgent = () =>
    fleet.launch("agent", [], { CAWCO_HUB_URL: through });
  try {
    await relayedLegs(kit, fleet, phone, relay, launchAgent);
  } finally {
    relay.stop();
  }
};

const relayedLegs = async (
  kit: Kit,
  fleet: KitFleet,
  phone: Phone,
  relay: ReturnType<typeof agentRelay>,
  launchAgent: () => void
) => {
  const { check } = kit;
  launchAgent();
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const hubLog = await fleet.logMark("hub");
  const machinePushes = () =>
    phone
      .pushes()
      .filter(
        (one) =>
          one.payload.cawco?.kind === "machine" ||
          one.collapseId?.startsWith("watch-") === true ||
          one.collapseId?.startsWith("machine-") === true
      );

  const sessions: string[] = [];
  for (let at = 0; at < SESSIONS; at += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: one session's start at a time, as a person makes them
    sessions.push(await fleet.spawn("claude", `Silence ${at + 1}`));
  }
  // A first turn each, so each names its conversation: a session with none
  // has no transcript to read.
  for (const id of sessions) {
    // biome-ignore lint/performance/noAwaitInLoops: one turn at a time
    const first = await fleet.send(id, "Hello.");
    await until(
      "its first turn read and its conversation named",
      () =>
        fleet.query<{ session_id: string | null; state: string }>(
          "SELECT i.session_id, m.state FROM instances i, sent_messages m WHERE i.id = ? AND m.uuid = ?",
          id,
          first
        )[0],
      (row) => row.state === "read" && row.session_id !== null
    );
  }
  const lostAt = async (): Promise<number | null> => {
    const rows =
      await fleet.api<{ lostAt?: number | null; machineId: string }[]>(
        "/api/agents"
      );
    return (
      rows.find((row) => row.machineId === "scratch-fleet")?.lostAt ?? null
    );
  };

  // (a) Unread sends, then two registers each frozen at once.
  fleet.freeze("agent", true);
  for (const id of sessions) {
    // biome-ignore lint/performance/noAwaitInLoops: one send at a time
    await fleet.send(id, "Are you there?");
  }
  await delay(2000);
  const lostSeen: (number | null)[] = [];
  for (const wave of [1, 2]) {
    // biome-ignore lint/performance/noAwaitInLoops: one register after the other
    await fleet.stop("agent", "SIGKILL");
    relay.release();
    const asked = new Promise<void>((resolve) =>
      relay.arm(() => {
        fleet.freeze("agent", true);
        resolve();
      })
    );
    launchAgent();
    await Promise.race([
      asked,
      delay(60_000).then(() => {
        throw new Error(
          `wave ${wave}: the hub asked for no transcript within 60 s`
        );
      }),
    ]);
    const frozenAt = Date.now();
    while (Date.now() - frozenAt < FROZEN_MS) {
      // biome-ignore lint/performance/noAwaitInLoops: a look every 2.5 s through the freeze
      lostSeen.push(await lostAt());
      await delay(2500);
    }
  }
  fleet.freeze("agent", false);
  relay.release();
  await delay(12_000);
  const said = (await hubLog.since()).split("\n");
  const machineLines = said.filter(
    (line) =>
      line.includes("[machines]") ||
      line.includes("push machine-") ||
      line.includes("push watch-")
  );
  check(
    `a: frozen ${FROZEN_MS / 1000} s twice with ${SESSIONS} unread sends, the machine raises no Needs-you item, no push and no fleet-watch notice`,
    machineLines.length === 0 &&
      lostSeen.every((one) => one === null) &&
      machinePushes().length === 0,
    `${JSON.stringify(machineLines)}; lostAt read ${JSON.stringify(lostSeen)}; pushes ${JSON.stringify(phone.ids())}`
  );
  const reads: SettleRead[] = said.flatMap((line) => {
    const found = SETTLE.exec(line);
    return found?.[1] && sessions.includes(found[1])
      ? [
          {
            session: found[1],
            asked: Number(found[2]),
            ended: Number(found[2]) + Number(found[3]),
            next: Number(found[4]),
          },
        ]
      : [];
  });
  const most = Math.max(
    0,
    ...reads.map(
      (read) =>
        reads.filter(
          (other) => other.asked <= read.asked && other.ended > read.asked
        ).length
    )
  );
  check(
    `b: the machine is asked ${SETTLE_READS_PER_MACHINE} settle reads at most at once, the rest waiting their turn`,
    reads.length > SETTLE_READS_PER_MACHINE && most <= SETTLE_READS_PER_MACHINE,
    `${reads.length} unanswered settle reads, at most ${most} at once`
  );
  const bySession = new Map<string, SettleRead[]>();
  for (const read of reads) {
    bySession.set(read.session, [...(bySession.get(read.session) ?? []), read]);
  }
  const spacing = [...bySession.values()].flatMap((own) =>
    own
      .sort((one, two) => one.asked - two.asked)
      .slice(1)
      .map((read, at) => {
        const before = own[at] as SettleRead;
        return {
          gap: read.asked - before.ended,
          early: before.next - read.asked,
          overlap: read.asked < before.ended,
        };
      })
  );
  check(
    "c: each session's settle reads never overlap, and each after an unanswered one waits out its backoff",
    spacing.length > 0 &&
      spacing.every((one) => !one.overlap && one.early <= 50),
    `${spacing.length} repeat read(s): ${JSON.stringify(spacing)}`
  );

  // (d) Lost past the span, with sessions on it.
  const before = await fleet.logMark("hub");
  fleet.freeze("agent", true);
  const raisedBy = await until(
    "the machine lost",
    lostAt,
    (one) => one !== null,
    MACHINE_LOST_MS + 30_000
  );
  // Its one push, out of the hub's burst while the machine is lost.
  await until(
    "the lost machine's push",
    () => (machinePushes().length > 0 ? true : undefined),
    Boolean,
    60_000
  );
  await delay(5000);
  const whileLost = (await before.since()).split("\n");
  fleet.freeze("agent", false);
  const down = await until(
    "the machine answering again",
    async () => ((await lostAt()) === null ? true : undefined),
    Boolean,
    60_000
  );
  await delay(2000);
  const lostLines = (await before.since()).split("\n");
  const told = whileLost.filter((line) =>
    line.includes(contactWords.lostLogged)
  );
  const rows =
    await fleet.api<{ hostname: string; machineId: string }[]>("/api/agents");
  const name = machineLabel(
    rows.find((row) => row.machineId === "scratch-fleet")?.hostname ?? ""
  );
  const pushed = machinePushes();
  const alert = pushed[0]?.payload.aps?.alert;
  const back = lostLines.filter((line) =>
    line.includes(contactWords.backLogged)
  );
  check(
    `d: frozen past ${MACHINE_LOST_MS / 1000} s, the machine is lost once (Needs you's item, one push: “${contactWords.lostTitle(name)}”), and it is taken down once it answers`,
    raisedBy !== null &&
      Date.now() - raisedBy >= MACHINE_LOST_MS &&
      told.length === 1 &&
      pushed.length === 1 &&
      alert?.title === contactWords.lostTitle(name) &&
      alert.body === contactWords.lostLine(name, MACHINE_LOST_MS / 60_000) &&
      down &&
      back.length === 1 &&
      lostLines.filter((line) => line.includes(contactWords.lostLogged))
        .length === 1,
    `lost since ${raisedBy}; told ${JSON.stringify(told)}; pushes ${JSON.stringify(pushed)}; back ${JSON.stringify(back)}`
  );

  // (e) OpenCode silent across an agent restart.
  const oc = await fleet.spawn("opencode", "Silent OpenCode");
  await fleet.stop("agent", "SIGKILL");
  const servers = (await fleet.heldProcs()).filter((proc) =>
    proc.procId.includes("opencode-server")
  );
  for (const server of servers) {
    signal(server.pid, "SIGSTOP");
  }
  const agentLog = await fleet.logMark("agent");
  launchAgent();
  const gaveUp = await until(
    "the reattach giving up",
    async () => {
      const text = await agentLog.since();
      return text.includes(`recovery ${oc} gave up`) ? text : undefined;
    },
    Boolean,
    RETRY_BUDGET_MS + 60_000
  );
  for (const server of servers) {
    signal(server.pid, "SIGCONT");
  }
  const waits = gaveUp.split("\n").flatMap((line) => {
    const found = RETRY.exec(line);
    return found?.[1] === oc ? [Number(found[3])] : [];
  });
  const asleep = await until(
    "the session settled asleep",
    () => fleet.instance(oc),
    (row) => row?.status === "sleeping",
    30_000
  );
  const words = gaveUp
    .split("\n")
    .find(
      (line) =>
        line.includes(oc) &&
        line.includes(contactWords.reattachSilent(RETRY_BUDGET_MS / 1000))
    );
  check(
    `e: OpenCode silent, the reattach's waits double from ${RETRY_FIRST_MS / 1000} s to the ${RETRY_MAX_MS / 1000} s ceiling and stop at its ${RETRY_BUDGET_MS / 1000} s budget, the session asleep, said in its own words`,
    servers.length > 0 &&
      waits[0] === RETRY_FIRST_MS &&
      waits.every(
        (wait, at) =>
          at === 0 ||
          wait === Math.min((waits[at - 1] as number) * 2, RETRY_MAX_MS)
      ) &&
      waits.includes(RETRY_MAX_MS) &&
      asleep?.status === "sleeping" &&
      words !== undefined,
    `${servers.length} server(s) frozen; waits ${JSON.stringify(waits)}; row ${asleep?.status}; ${words ?? "no words"}`
  );
};
