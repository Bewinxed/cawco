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
 *     frozen (SIGSTOP, {@link FROZEN_MS}), so each holds an unread send. The
 *     agent is killed and started again, slow: it reaches the hub through a
 *     relay here ({@link agentRelay}) that holds its answer to every
 *     transcript the hub asks for, {@link SLOW_MS}, while its heartbeats
 *     pass, as obelisk beat on while its reads missed. The hub's settle
 *     reads go unanswered. No Needs-you item and no push about the machine,
 *     nor any fleet-watch notice, comes of it.
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
 * (f) Four Claude sessions start at once, and the agent is frozen the
 *     moment it sends the first credential ACK, for {@link HELD_MS}, past
 *     the 90 s it gives the hub (agent hub-away.ts `HUB_AWAY_BOUND_MS`): the
 *     hub's answer lies unread in its socket meanwhile. Every session starts
 *     and every credential is acknowledged; none is stopped as "not
 *     acknowledged". Main fails: its 15 s try's timer runs before the
 *     socket is read (core bounded.ts), and the 90 s are spent while held
 *     (2026-10-23 19:33, obelisk: 317 starts stopped so).
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
import { type Phone, standInPhone } from "../phone";
import { frames } from "../ws-frames";

/** server.ts `SETTLE_READS_PER_MACHINE`. */
const SETTLE_READS_PER_MACHINE = 4;
/** More sessions than the machine's settle turns, so some wait theirs. */
const SESSIONS = 6;
/** The agent's freeze while the sends go: about 15 s, well short of `MACHINE_LOST_MS`. */
const FROZEN_MS = 15_000;
/** How long the agent that comes back is slow to give transcripts: rounds of 10 s reads and their backoff. */
const SLOW_MS = 60_000;
/** opencode.ts: the reattach's first wait, its ceiling and its budget. */
const RETRY_FIRST_MS = 1000;
const RETRY_MAX_MS = 30_000;
const RETRY_BUDGET_MS = 120_000;
/** The hub's line for a settle read its machine left unanswered (server.ts `askSettle`). */
const SETTLE =
  /\[hub\] ([0-9a-f-]{36}): settle read on .+ not answered \(asked at (\d+), waited (\d+) ms\); its next is asked no sooner than (\d+),/;
const RETRY =
  /\[opencode\] recovery ([0-9a-f-]{36}) waiting; retry (\d+) in (\d+)ms/;

/** Leg (f)'s hold of the agent: past the 90 s it gives the hub's answer to an ACK. */
const HELD_MS = 95_000;
/** Sessions leg (f) starts at once. */
const STARTS = 4;
/** The request line of a credential's ACK (agent session-identity.ts). */
const ACK_ASK = "POST /api/session-identities/ack";
/** The agent's word for a start its ACK stopped (agent session-identity.ts `NOT_ACKNOWLEDGED`). */
const NOT_ACKED = "Session credential installation was not acknowledged";

/** What the hub asks a machine for when it reads a transcript (core harness.ts `CONTROL_GET_SESSION_MESSAGES`). */
const TRANSCRIPT_ASK = "getSessionMessages";
/** The upgrade's header that offers permessage-deflate. */
const DEFLATE_OFFER = /^sec-websocket-extensions:/i;
/** A request that upgrades to a WebSocket. */
const WEBSOCKET_UPGRADE = /^upgrade:\s*websocket/im;

/** A transcript ask's request id, as the hub's frame carries it (plain, or inside a wire part's string). */
const REQUEST_ID = /requestId\\?"\s*:\s*\\?"([0-9a-f-]{36})/g;

/**
 * A relay the agent reaches the hub through, standing for a machine that
 * is live but slow: while `slow`, the agent's answer to each transcript the
 * hub asks for is held (its heartbeats and every other frame pass), and
 * goes on, late, at `quick`. It strips the agent's offer to deflate, so the
 * hub's asks cross it as plain JSON. `armAck` calls back as the agent sends
 * a credential's ACK.
 */
const agentRelay = (hubPort: number) => {
  let slow = false;
  let ackArmed: (() => void) | null = null;
  /** Transcript asks the hub made while slow: their answers are held. */
  const asks = new Set<string>();
  const pairs = new Set<{ agent: Socket; hub: Socket; kept: Buffer[] }>();
  const server = createServer((agent) => {
    const hub = connect(hubPort, "127.0.0.1");
    const pair = { agent, hub, kept: [] as Buffer[] };
    pairs.add(pair);
    const split = frames();
    // The upgrade without its offer of permessage-deflate, so the hub's
    // frames cross the relay as their own JSON, read for the ask.
    let upgrade: Buffer | null = Buffer.alloc(0);
    // A connection that is no WebSocket (an ACK, a tool call) passes whole.
    let plain = false;
    const acked = (data: Buffer) => {
      if (ackArmed && data.includes(ACK_ASK)) {
        const fire = ackArmed;
        ackArmed = null;
        fire();
      }
    };
    /** The upgrade, read whole and passed on less its deflate offer; the bytes after it, or null while it is still coming or the connection is plain. */
    const opened = (data: Buffer): Buffer | null => {
      upgrade = Buffer.concat([upgrade ?? Buffer.alloc(0), data]);
      const end = upgrade.indexOf("\r\n\r\n");
      if (end < 0) {
        return null;
      }
      const head = Buffer.from(
        upgrade
          .subarray(0, end + 4)
          .toString("latin1")
          .split("\r\n")
          .filter((line) => !DEFLATE_OFFER.test(line))
          .join("\r\n"),
        "latin1"
      );
      const rest = upgrade.subarray(end + 4);
      upgrade = null;
      if (!WEBSOCKET_UPGRADE.test(head.toString("latin1"))) {
        plain = true;
        hub.write(Buffer.concat([head, rest]));
        acked(head);
        return null;
      }
      hub.write(head);
      return rest;
    };
    agent.on("data", (data: Buffer) => {
      if (plain) {
        hub.write(data);
        acked(data);
        return;
      }
      const chunk = upgrade ? opened(data) : data;
      if (!chunk) {
        return;
      }
      for (const { frame, payload } of split(chunk)) {
        if ([...asks].some((id) => payload.includes(id))) {
          pair.kept.push(frame);
        } else {
          hub.write(frame);
        }
      }
    });
    hub.on("data", (chunk: Buffer) => {
      if (slow && chunk.includes(TRANSCRIPT_ASK)) {
        for (const found of chunk.toString("utf8").matchAll(REQUEST_ID)) {
          if (found[1]) {
            asks.add(found[1]);
          }
        }
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
    /** From now, the agent's answers to transcript asks are held. */
    slow: () => {
      slow = true;
    },
    /** What was held goes on, late, and nothing more is. The asks held so far. */
    quick: (): number => {
      slow = false;
      const held = asks.size;
      asks.clear();
      for (const pair of pairs) {
        for (const frame of pair.kept.splice(0)) {
          pair.hub.write(frame);
        }
      }
      return held;
    },
    /** The next credential ACK the agent sends, passed on, calls `sent`; nothing is held. */
    armAck: (sent: () => void) => {
      ackArmed = sent;
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
  group: "The hub and machines",
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

  // (a) Unread sends while the agent is frozen; then it comes back slow.
  const lostSeen: (number | null)[] = [];
  const watchLost = async (ms: number) => {
    const from = Date.now();
    while (Date.now() - from < ms) {
      // biome-ignore lint/performance/noAwaitInLoops: a look every 2.5 s
      lostSeen.push(await lostAt());
      await delay(2500);
    }
  };
  fleet.freeze("agent", true);
  for (const id of sessions) {
    // biome-ignore lint/performance/noAwaitInLoops: one send at a time
    await fleet.send(id, "Are you there?");
  }
  await watchLost(FROZEN_MS);
  // Its process gone, the sessions held by sessiond: the agent that comes
  // back takes them over, and the hub settles what they were sent against
  // their transcripts, which the agent is slow to give.
  await fleet.stop("agent", "SIGKILL");
  relay.slow();
  launchAgent();
  await watchLost(SLOW_MS);
  const held = relay.quick();
  await delay(15_000);
  const said = (await hubLog.since()).split("\n");
  const machineLines = said.filter(
    (line) =>
      line.includes("[machines]") ||
      line.includes("push machine-") ||
      line.includes("push watch-")
  );
  check(
    `a: frozen ${FROZEN_MS / 1000} s with ${SESSIONS} unread sends, then slow to give their transcripts for ${SLOW_MS / 1000} s, the machine raises no Needs-you item, no push and no fleet-watch notice`,
    machineLines.length === 0 &&
      lostSeen.every((one) => one === null) &&
      machinePushes().length === 0,
    `${held} transcript ask(s) held; ${JSON.stringify(machineLines)}; lostAt read ${JSON.stringify(lostSeen)}; pushes ${JSON.stringify(phone.ids())}`
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
    `d: frozen past ${MACHINE_LOST_MS / 1000} s, the machine is lost once (Needs you's item, one push: “${contactWords.lostTitle(name, true)}”), and it is taken down once it answers`,
    raisedBy !== null &&
      Date.now() - raisedBy >= MACHINE_LOST_MS &&
      told.length === 1 &&
      pushed.length === 1 &&
      alert?.title === contactWords.lostTitle(name, true) &&
      alert.body ===
        contactWords.lostLine(name, MACHINE_LOST_MS / 60_000, true) &&
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

  // (f) Starts while the agent is held past its ACK's bound.
  const agentAt = await fleet.logMark("agent");
  let heldAt = 0;
  relay.armAck(() => {
    fleet.freeze("agent", true);
    heldAt = Date.now();
    setTimeout(() => fleet.freeze("agent", false), HELD_MS);
  });
  const started = await Promise.allSettled(
    Array.from({ length: STARTS }, (_, at) =>
      fleet.spawn("claude", `Held start ${at + 1}`)
    )
  );
  const ids = started.flatMap((one) =>
    one.status === "fulfilled" ? [one.value] : []
  );
  const agentSaid = await agentAt.since();
  // Installed: the hub took its ACK (session_identities `installed_at`).
  const acked = ids.filter(
    (id) =>
      (fleet.query<{ installed_at: number | null }>(
        "SELECT installed_at FROM session_identities WHERE instance_id = ?",
        id
      )[0]?.installed_at ?? null) !== null
  );
  const stopped = agentSaid
    .split("\n")
    .filter((line) => line.includes(NOT_ACKED));
  check(
    `f: ${STARTS} sessions start at once while the agent is held ${HELD_MS / 1000} s from its first credential ACK: every one starts, its credential acknowledged, none stopped as not acknowledged`,
    heldAt > 0 &&
      ids.length === STARTS &&
      acked.length === STARTS &&
      stopped.length === 0,
    `held ${heldAt > 0 ? "from the first ACK" : "never"}; ${ids.length} running; ${acked.length} acknowledged; stopped ${JSON.stringify(stopped)}; ${started
      .flatMap((one) => (one.status === "rejected" ? [String(one.reason)] : []))
      .join("; ")}`
  );
};
