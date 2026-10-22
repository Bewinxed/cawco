/**
 * A session's start waits while its machine's room on memory fails, and is
 * never refused for it (packages/agent session.ts `#roomForStart`, core
 * machine-room.ts `measureMemoryRoom`).
 *
 * On a scratch fleet whose agent reads its memory as full (the memory
 * thresholds set to 0: `CAWCO_ROOM_MEMORY_STALL_MAX` on Linux,
 * `CAWCO_ROOM_SWAP_USED_MAX_PCT` on the Mac), a Claude session is started:
 *
 * - its row holds a `room` line, in the machine's readings ("this
 *   machine's measured room: …", the failing reading marked ✗), and the
 *   agent's log says the start waits;
 * - past the hub's 120 s spawn wait (hub config.ts `SPAWN_START_TIMEOUT_MS`)
 *   it still waits: the row is not running, and the hub never said it did
 *   not start;
 * - a stop ends the wait: the agent says so, and no Claude process was ever
 *   launched for it.
 *
 *   bun scripts/probe-kit/run.ts room-held
 */
import { MACHINE, MODEL, type Reply, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

/** Past the hub's own spawn wait (hub config.ts `SPAWN_START_TIMEOUT_MS`, 120 s). */
const PAST_HUB_WAIT_MS = 130_000;

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

const run = async (kit: Kit): Promise<void> => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent", [], {
    CAWCO_ROOM_MEMORY_STALL_MAX: "0",
    CAWCO_ROOM_SWAP_USED_MAX_PCT: "0",
    // Read on its own room, not as a machine the fleet brought up (scratch-fleet.ts).
    CAWCO_INSIDE_RUN: undefined,
  });
  await fleet.agentUp();
  await fleet.accountSignedIn();

  const instanceId = crypto.randomUUID();
  const asked = Date.now();
  await fleet.post({
    verb: "spawn",
    machineId: MACHINE,
    instanceId,
    requestId: crypto.randomUUID(),
    payload: {
      instanceId,
      cwd: fleet.repo,
      harness: "claude",
      model: MODEL.claude,
      title: "Room held",
      permissionMode: "bypassPermissions",
    },
  });
  const line = await until(
    "the start's room line",
    () =>
      fleet
        .query<{ content: string }>(
          "SELECT content FROM session_lines WHERE instance_id = ? AND kind = 'room'",
          instanceId
        )
        .at(0)?.content,
    (content) => content !== undefined,
    60_000
  ).catch(() => undefined);
  kit.check(
    "the session's transcript says why its start waits, in the machine's readings",
    // The queue's words open the sentence after the start's own, capitalised.
    !!line?.includes("This machine's measured room:") && line.includes("✗"),
    line ?? "no room line"
  );
  const waits = await until(
    "the agent's wait line",
    () => fleet.logs("agent"),
    (logs) => logs.includes(`${instanceId}: start waits:`),
    30_000
  ).catch(() => "");
  kit.check(
    "the agent says the start waits",
    waits.includes(`${instanceId}: start waits:`),
    waits.split("\n").slice(-5).join(" | ")
  );

  await Bun.sleep(Math.max(0, asked + PAST_HUB_WAIT_MS - Date.now()));
  const row = fleet.instance(instanceId);
  const hubLogs = await fleet.logs("hub");
  kit.check(
    `${Math.round((Date.now() - asked) / 1000)} s on, past the hub's 120 s spawn wait, the start still waits and was never refused`,
    row?.status !== "running" && !hubLogs.includes("did not start within"),
    JSON.stringify({ status: row?.status })
  );

  await fleet.stopSession(instanceId).catch(() => undefined);
  const stopped = await until(
    "the agent's stop of the wait",
    () => fleet.logs("agent"),
    (logs) => logs.includes("stopped while it waited for its machine's memory"),
    30_000
  ).catch(() => "");
  kit.check(
    "a stop ends the wait, and no Claude process was launched for it",
    stopped.includes("stopped while it waited for its machine's memory") &&
      !(await fleet.heldProcs()).some((proc) =>
        JSON.stringify(proc).includes(instanceId)
      ),
    stopped.split("\n").slice(-5).join(" | ")
  );
};

const spec: Spec = { name: "room-held", run };

export default spec;
