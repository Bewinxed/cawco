/**
 * Every send the hub accepts becomes exactly one turn in its session, on
 * every harness: a send the hub hands over again after its session took it
 * starts no turn, and its record reads read. Read on a scratch fleet with the
 * real Claude Code, OpenCode and pi against the mock model.
 *
 * The case is the stage-2 proof's of 2026-10-17 (rig keeperheld): a session
 * took a send 0.3 s before its hub stopped, the next hub could not tell it was
 * read, owed it again ("owed again: This never reached the session.") and it
 * became a second turn. Here, per harness, a session takes a send and its turn
 * ends; the hub and the machine's agent are stopped, and the send's record is
 * put back as that hub left it: pending and owed, its envelope to hand over
 * again. Both start again, the agent taking its sessions back, and the hub
 * hands the send to the machine. Asserted:
 *
 *   - the record reads read again;
 *   - the agent that came back started no turn on it, from the record on
 *     disk (its log: "taken already: no turn"),
 *     and the mock model was asked nothing after the hand-over;
 *   - the session goes on: a next send is one turn, read.
 *
 *   bun scripts/probe-kit/run.ts send-once
 */
import {
  delay,
  type Fleet,
  HARNESSES,
  type Harness,
  MACHINE,
  until,
} from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

/** Lines of `log` that name `uuid`, for a failure's detail. */
const linesNaming = (log: string, uuid: string): string =>
  log
    .split("\n")
    .filter((line) => line.includes(uuid))
    .join(" | ") || "(none)";

/** The model requests whose last message carries `words`. */
const askedOf = (fleet: Fleet, words: string): number =>
  fleet.seen.filter((request) => request.last.includes(words)).length;

/** One harness's session, a send it took handed over again across a hub restart. */
const handedAgain = async (
  check: Kit["check"],
  fleet: Fleet,
  harness: Harness
): Promise<void> => {
  const instanceId = await fleet.spawn(harness, `send once ${harness}`);
  const words = `send-once ${harness} ${crypto.randomUUID()}`;
  const uuid = await fleet.send(instanceId, words);
  await until(
    `${harness}: the send read`,
    () => fleet.sendRow(uuid),
    (row) => row?.state === "read",
    120_000
  );
  await until(
    `${harness}: its turn over`,
    () => fleet.instance(instanceId),
    (row) => row?.turn_open_at === null,
    120_000
  );
  // OpenCode's first turn asks for the session's title too, with the words.
  const before = fleet.seen.length;
  const asked = askedOf(fleet, words);
  check(
    `${harness}: the send's turn asked the model before the hub restarts`,
    asked >= 1,
    `requests carrying it: ${asked}`
  );

  // The hub stops; its record of the send is put back as the hub of 13:47:14
  // left it, owed again to the session that took it. A read send keeps no
  // envelope, so it is made again from the record's body, as the hub makes
  // one (server.ts `envelopeOf`, a text send).
  // The agent restarts too, as it does in the update: the next one knows the
  // session took the send only from the record on disk.
  await fleet.stop("hub");
  await fleet.stop("agent");
  const [stored] = fleet.query<{ body: string }>(
    "SELECT body FROM sent_messages WHERE uuid = ?",
    uuid
  );
  const envelope = JSON.stringify({
    verb: "send",
    machineId: MACHINE,
    instanceId,
    payload: { instanceId, message: JSON.parse(stored?.body ?? "null") },
  });
  fleet.write(
    "UPDATE sent_messages SET state = 'pending', held = 0, envelope = ?, owed = ? WHERE uuid = ?",
    envelope,
    envelope,
    uuid
  );
  const [put] = fleet.query<{ state: string; owed: string | null }>(
    "SELECT state, owed FROM sent_messages WHERE uuid = ?",
    uuid
  );
  check(
    `${harness}: the send's record is pending and owed again while the hub is down`,
    put?.state === "pending" && put.owed !== null,
    `state ${put?.state}, owed ${put?.owed === null ? "no" : "yes"}`
  );
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.launch("agent");
  await fleet.agentUp();

  const again = await until(
    `${harness}: the send read again`,
    () => fleet.sendRow(uuid),
    (sent) => sent?.state === "read",
    120_000
  ).catch(() => fleet.sendRow(uuid));
  // Read on the machine's word ("read: its session took it already"), or by
  // the hub's own settle of the agent that came back, whichever is first.
  const hubLog = await fleet.logs("hub");
  check(
    `${harness}: handed over again, the send reads read`,
    again?.state === "read",
    `record: ${JSON.stringify(again)}; hub lines: ${linesNaming(hubLog, uuid)}`
  );
  // Room for a turn the second hand-over would have started.
  await delay(8000);
  const agentLog = await fleet.logs("agent");
  check(
    `${harness}: the agent started no turn on it, and the model was asked nothing after`,
    agentLog.includes(
      `${instanceId}: send ${uuid} handed over again, taken already: no turn`
    ) &&
      askedOf(fleet, words) === asked &&
      fleet.seen.length === before,
    `requests carrying it: ${askedOf(fleet, words)}; requests since the restart: ${fleet.seen.length - before}; agent lines: ${linesNaming(agentLog, uuid)}`
  );

  const next = `send-once ${harness} next ${crypto.randomUUID()}`;
  const nextUuid = await fleet.send(instanceId, next);
  const nextRow = await until(
    `${harness}: the next send read`,
    () => fleet.sendRow(nextUuid),
    (sent) => sent?.state === "read",
    120_000
  ).catch(() => fleet.sendRow(nextUuid));
  await until(
    `${harness}: the next turn asked of the model`,
    () => askedOf(fleet, next),
    (count) => count > 0,
    60_000
  ).catch(() => 0);
  check(
    `${harness}: the session goes on: the next send is read and its turn asks the model`,
    nextRow?.state === "read" && askedOf(fleet, next) >= 1,
    `record: ${JSON.stringify(nextRow)}; requests carrying it: ${askedOf(fleet, next)}`
  );
};

const spec: Spec = {
  name: "send-once",
  async run(kit) {
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["done"] }));
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    for (const harness of HARNESSES) {
      // biome-ignore lint/performance/noAwaitInLoops: each harness's case restarts the one hub
      await handedAgain(kit.check, fleet, harness);
    }
  },
};

export default spec;
