/**
 * The hub's own call to a machine, answered after its deadline (hub
 * server.ts `awaitReply`, `lateAnswer`): its caller is told no answer came,
 * and the answer that comes later is said as that call's, late, never as a
 * reply nobody asked for.
 *
 * 2026-10-23 12:17:56, obelisk's hub: `[hub] unrouted reply session=none
 * request=02b36699-… kind=control_result machine=50b2e0c25123cc41`, and the
 * same for b106e151 and the hub's own machine, all in one second, with no
 * restart: the answers to one call the hub made of every machine came after
 * its deadline had dropped the call's waiter.
 *
 * On a scratch fleet (real hub, a second machine's agent and sessiond, no
 * session): the second machine's agent frozen (SIGSTOP), it is asked to
 * inspect its config (10 s deadline, server.ts `READ_TIMEOUT_MS`), and
 * thawed once the ask has failed, so it answers late.
 *
 * (a) The ask fails at its deadline, as a machine that did not answer.
 * (b) Its late answer is said as that call's (its method and how late),
 *     and nothing is logged as an unrouted reply.
 * (c) An answer that reached the hub in time but waits in its socket's
 *     inbox behind the frames before it (wire.ts `Inbox`, a part's worth a
 *     turn) as the deadline passes reaches its call: the machine asked for a
 *     picture of {@link PICTURE_BYTES} (its answer {@link PICTURE_BYTES}
 *     base64, several parts) while its agent is frozen; near the deadline the
 *     hub is frozen and the agent let go, so the whole answer lies in the
 *     hub's socket when the deadline passes; the hub let go, the ask is
 *     answered whole, and nothing is said late or unrouted.
 *
 *   bun scripts/probe-kit/run.ts late-answer
 */
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { signal, spawnedPid } from "../../../packages/core/src/signal";
import { delay } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const OTHER = "late-answer-other";
/** The hub's read deadline (server.ts `READ_TIMEOUT_MS`). */
const READ_DEADLINE_MS = 10_000;
/** The hub's line for a reply nobody waits on (server.ts `logUnroutedReply`). */
const UNROUTED = "[hub] unrouted reply";
/** The hub's line for a late answer to one of its calls (server.ts `lateAnswer`). */
const LATE = "past its 10 s deadline; its caller had been told no answer came";
/** Leg (c)'s picture: its answer, base64, is several of the wire's 1 MiB parts (core wire.ts `WIRE_PART_CHARS`). */
const PICTURE_BYTES = 3 * 1024 * 1024;
/** When, after its ask, leg (c) freezes the hub and lets the agent answer: short of the deadline. */
const FREEZE_HUB_AT_MS = 8000;
/** How long the hub stays frozen: across the deadline, with the agent's whole answer sent meanwhile. */
const HUB_FROZEN_MS = 4000;

export default {
  group: "The hub and machines",
  name: "late-answer",
  run: async (kit: Kit) => {
    const { check } = kit;
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.launch("agent");
    await fleet.agentUp();
    const other = await fleet.launchMachine(OTHER);
    const pid = spawnedPid(other.agent);
    if (pid === undefined) {
      throw new Error(`${OTHER}'s agent has no pid to freeze`);
    }
    const mark = await fleet.logMark("hub");
    signal(pid, "SIGSTOP");
    const asked = Date.now();
    const answer = await fetch(`${fleet.base}/api/agents/${OTHER}/inspect`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }).then(async (response) => ({
      status: response.status,
      said: (await response.text()).slice(0, 300),
    }));
    const failedAfter = Date.now() - asked;
    signal(pid, "SIGCONT");
    // The thawed agent reads the ask and answers it, late.
    await delay(3000);
    const said = await mark.since();
    const lines = said.split("\n");
    check(
      `a: frozen past the ${READ_DEADLINE_MS / 1000} s deadline, the machine's ask fails at that deadline as one it did not answer`,
      answer.status >= 400 &&
        failedAfter >= READ_DEADLINE_MS &&
        failedAfter < READ_DEADLINE_MS + 5000,
      `${answer.status} after ${failedAfter} ms: ${answer.said}`
    );
    const late = lines.filter((line) => line.includes(LATE));
    const unrouted = lines.filter((line) => line.includes(UNROUTED));
    check(
      "b: its late answer is said as that call's, late (its method named), and nothing is logged as an unrouted reply",
      late.length === 1 &&
        late[0]?.includes("inspectConfig") === true &&
        unrouted.length === 0,
      `late ${JSON.stringify(late)}; unrouted ${JSON.stringify(unrouted)}`
    );

    // (c) In time, but behind the frames before it in the hub's inbox.
    const picture = join(other.home, "big.png");
    const bytes = randomBytes(PICTURE_BYTES);
    writeFileSync(picture, bytes);
    const before = await fleet.logMark("hub");
    signal(pid, "SIGSTOP");
    const from = Date.now();
    const read = fetch(
      `${fleet.base}/api/agents/${OTHER}/media?path=${encodeURIComponent(picture)}`
    ).then(async (response) => ({
      status: response.status,
      size: (await response.arrayBuffer()).byteLength,
    }));
    await delay(FREEZE_HUB_AT_MS);
    fleet.freeze("hub", true);
    signal(pid, "SIGCONT");
    await delay(HUB_FROZEN_MS);
    fleet.freeze("hub", false);
    const got = await read;
    const spent = Date.now() - from;
    await delay(1000);
    const after = (await before.since()).split("\n");
    const lateC = after.filter((line) => line.includes(LATE));
    const unroutedC = after.filter((line) => line.includes(UNROUTED));
    check(
      `c: an answer in the hub's socket as the deadline passes, behind ${Math.ceil((PICTURE_BYTES * 4) / 3 / 1024 / 1024)} MiB of its own parts, reaches its call: the picture comes whole, and nothing is said late or unrouted`,
      got.status === 200 &&
        got.size === PICTURE_BYTES &&
        spent > READ_DEADLINE_MS &&
        lateC.length === 0 &&
        unroutedC.length === 0,
      `${got.status}, ${got.size} bytes after ${spent} ms; late ${JSON.stringify(lateC)}; unrouted ${JSON.stringify(unroutedC)}`
    );
  },
} satisfies Spec;
