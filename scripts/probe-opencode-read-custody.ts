#!/usr/bin/env bun
/**
 * The agent hands a send back to the hub only when no process read it. An
 * OpenCode session says a send is read under its own message id (the id it
 * named in `messages_stored` as it admitted the send), not the hub's uuid;
 * the agent's record of what it handed matches either, as the hub's does.
 *
 * On a scratch fleet (scratch-fleet.ts) with OpenCode 2.0 (`opencode2`,
 * 2.0.28, on the PATH) against the mock model:
 *
 * (a) An OpenCode send that runs, then the agent puts the session to sleep:
 *     the agent logs no "handed back: no process took it" for it, and the hub
 *     hears nothing of it come back.
 * (b) A send queued in OpenCode's inbox behind a slow turn, then the
 *     dashboard relaunches the session: the agent hands that send back
 *     ("handed back: no process took it"), and not the slow turn's own send,
 *     which was read; the hub owes it to the new process, which reads it once.
 *
 *   bun scripts/probe-opencode-read-custody.ts
 */
import { MACHINE, scratchFleet, until } from "./scratch-fleet";

const SLOW = "READ-CUSTODY-SLOW";

const failures: string[] = [];
const check = (label: string, ok: boolean, detail = "") => {
  console.log(
    `${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`
  );
  if (!ok) {
    failures.push(label);
  }
};

const fleet = await scratchFleet({
  name: "probe-opencode-read-custody",
  respond: (request) =>
    request.tools && request.last.includes(SLOW)
      ? { words: Array.from({ length: 120 }, (_, i) => `w${i} `), everyMs: 500 }
      : { words: ["ok"], everyMs: 10 },
});

const mark = (what: string) =>
  `READ-CUSTODY-${what}-${crypto.randomUUID().slice(0, 6)}`;
/** Turns the mock answered whose prompt carries `marker`. */
const turnsOf = (marker: string) =>
  fleet.seen.filter((one) => one.tools && one.last.includes(marker)).length;
const read = (uuid: string) =>
  until(
    `send ${uuid} read`,
    () => fleet.sendRow(uuid),
    (row) => row?.state === "read",
    120_000
  );
/** The agent's lines naming this send as handed back. */
const handedBack = async (uuid: string) =>
  (await fleet.logs("agent"))
    .split("\n")
    .filter((line) => line.includes(`send ${uuid} handed back`));
/** The hub's lines naming this send as come back. */
const cameBack = async (uuid: string) =>
  (await fleet.logs("hub"))
    .split("\n")
    .filter((line) => line.includes(`send ${uuid} to `));

let passed = false;
try {
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.launch("agent");
  await fleet.agentUp();

  // ── (a) read, then asleep ─────────────────────────────────────────────
  const resting = await fleet.spawn("opencode", "read then sleep");
  const ran = mark("ran");
  const ranUuid = await fleet.send(resting, `${ran}: say ok.`);
  await read(ranUuid);
  await until(
    "its turn over",
    () => fleet.instance(resting),
    (row) => row?.turn_open_at === null,
    60_000
  );
  check(
    "(a) the send ran its turn",
    turnsOf(ran) === 1,
    `${turnsOf(ran)} turn(s) at the model`
  );
  // Asked again until it is at rest: the agent refuses a sleep while it
  // cannot yet say (a server generation being handed over, its custody).
  let asked = 0;
  await until(
    "the session asleep",
    async () => {
      if ((await fleet.logs("agent")).includes(`put ${resting} to sleep`)) {
        return true;
      }
      if (Date.now() - asked > 5000) {
        asked = Date.now();
        await fleet.control(resting, "sleep");
      }
      return false;
    },
    Boolean,
    180_000
  );
  // Room for a hand-back to reach the hub's log.
  await Bun.sleep(3000);
  const ranBack = await handedBack(ranUuid);
  check(
    "(a) asleep, the agent hands back nothing it read",
    ranBack.length === 0,
    ranBack.join(" | ") || "no hand-back line"
  );
  const ranCame = await cameBack(ranUuid);
  check(
    "(a) the hub hears nothing of it come back",
    ranCame.length === 0,
    ranCame.join(" | ") || "no hub line"
  );

  // ── (b) unread, then relaunched ───────────────────────────────────────
  const busy = await fleet.spawn("opencode", "unread then relaunch");
  const slow = mark("slow");
  const slowUuid = await fleet.send(busy, `${SLOW} ${slow}: count slowly.`);
  await until(
    `${slow} streaming`,
    () => turnsOf(slow),
    (n) => n >= 1,
    120_000
  );
  await read(slowUuid);
  const queued = mark("queued");
  const queuedUuid = await fleet.send(busy, `${queued}: say ok.`);
  await Bun.sleep(1500);
  const before = fleet.sendRow(queuedUuid);
  check(
    "(b) the queued send waits unread behind the slow turn",
    before?.state === "pending" && turnsOf(queued) === 0,
    JSON.stringify(before)
  );
  const [launched] = fleet.query<{ session_id: string; cwd: string }>(
    "SELECT session_id, cwd FROM instances WHERE id = ?",
    busy
  );
  await fleet.post({
    verb: "spawn",
    machineId: MACHINE,
    instanceId: busy,
    requestId: crypto.randomUUID(),
    payload: {
      instanceId: busy,
      cwd: launched?.cwd,
      harness: "opencode",
      resume: { sessionKey: launched?.session_id },
      // A replacement of its process (the hub's revive says so): without it,
      // a resume for a session the machine carries keeps the process.
      relaunch: true,
      permissionMode: "bypassPermissions",
    },
  });
  const queuedBack = await until(
    "the queued send handed back",
    () => handedBack(queuedUuid),
    (lines) => lines.length > 0,
    90_000
  ).catch(() => [] as string[]);
  check(
    '(b) relaunched, the agent hands back the unread send ("no process took it")',
    queuedBack.length === 1 &&
      (queuedBack[0] ?? "").includes("no process took it"),
    queuedBack.join(" | ") || "no hand-back line"
  );
  const slowBack = await handedBack(slowUuid);
  check(
    "(b) and not the slow turn's own send, which was read",
    slowBack.length === 0,
    slowBack.join(" | ") || "no hand-back line"
  );
  await read(queuedUuid);
  // Room for a second delivery, which would be a hand-back gone wrong.
  await Bun.sleep(8000);
  check(
    "(b) the new process reads it once",
    turnsOf(queued) === 1,
    `${turnsOf(queued)} turn(s) at the model; ${(await cameBack(queuedUuid)).join(" | ")}`
  );
  passed = failures.length === 0;
} catch (error) {
  console.error(error);
} finally {
  if (!passed) {
    console.log(
      (await fleet.logs("agent"))
        .split("\n")
        .filter(
          (line) => line.includes("[session]") || line.includes("[opencode]")
        )
        .slice(-40)
        .join("\n")
    );
  }
  await fleet.close();
  await fleet.clean(!passed);
}
console.log(
  passed
    ? "opencode read custody probe: passed"
    : `opencode read custody probe: FAILED (${failures.join("; ") || "error"})`
);
process.exit(passed ? 0 : 1);
