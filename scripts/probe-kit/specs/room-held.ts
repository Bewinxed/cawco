/**
 * A session's start waits while its machine's room on memory fails, and is
 * never refused for it (packages/agent session.ts `#roomForStart`, core
 * machine-room.ts `measureMemoryRoom`).
 *
 * On a scratch fleet whose agent reads its memory as full (Linux's least
 * room, `CAWCO_ROOM_MEMORY_AVAILABLE_MIN_MIB`, set past any machine's
 * memory; the Mac's waiting level, `CAWCO_ROOM_PRESSURE_LEVEL`, set to 1,
 * normal), a Claude session is started:
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
 * Linux, a memory limit above the keeper: the agent started again with the
 * cgroup mount read from a stand-in tree (`CAWCO_ROOM_CGROUP_ROOT`; a
 * workspace cannot make a cgroup with the memory controller), the keeper's
 * own cgroup there under `memory.max` 2 GiB with 1.5 GiB in use and none of
 * it reclaimable file cache. The machine has room, the limit leaves 0.5 GiB:
 *
 * - the start waits, its line naming the limit's room, marked ✗;
 * - once 1 GiB of what the group holds is inactive file cache (memory.stat
 *   `inactive_file`), the limit leaves 1.5 GiB: the start goes by itself and
 *   the session runs.
 *
 *   bun scripts/probe-kit/run.ts room-held
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { MACHINE, MODEL, type Reply, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

/** Past the hub's own spawn wait (hub config.ts `SPAWN_START_TIMEOUT_MS`, 120 s). */
const PAST_HUB_WAIT_MS = 130_000;

const GIB = 1024 ** 3;

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

type Fleet = Awaited<ReturnType<Kit["fleet"]>>;

/** A Claude session asked of the machine, as the app asks one. */
const startSession = async (fleet: Fleet, title: string): Promise<string> => {
  const instanceId = crypto.randomUUID();
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
      title,
      permissionMode: "bypassPermissions",
    },
  });
  return instanceId;
};

/** The session's `room` line, once it has one. */
const roomLine = (fleet: Fleet, instanceId: string) =>
  until(
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

/** A start held on the machine's readings, past the hub's wait, ended by a stop. */
const heldAndStopped = async (kit: Kit, fleet: Fleet): Promise<void> => {
  const asked = Date.now();
  const instanceId = await startSession(fleet, "Room held");
  const line = await roomLine(fleet, instanceId);
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

/**
 * The stand-in mount: every group from the keeper's up to the mount, each
 * with no limit but the keeper's own, which holds `used` of `max` with
 * `inactive` of it inactive file cache.
 */
const standIn = (
  root: string,
  keeper: string,
  group: { inactive: number; max: number; used: number }
): void => {
  const own = join(root, keeper);
  for (let dir = own; dir.startsWith(`${root}/`); dir = dirname(dir)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "memory.max"),
      dir === own ? `${group.max}\n` : "max\n"
    );
  }
  writeFileSync(join(own, "memory.current"), `${group.used}\n`);
  writeFileSync(
    join(own, "memory.stat"),
    `anon ${group.used - group.inactive}\nfile ${group.inactive}\ninactive_file ${group.inactive}\nactive_file 0\n`
  );
};

/** A start held by the memory limit above its keeper, and let go once the limit leaves room. */
const underTheLimit = async (
  kit: Kit,
  fleet: Fleet,
  keeperPid: number
): Promise<void> => {
  const said = readFileSync(`/proc/${keeperPid}/cgroup`, "utf8");
  const keeper = said
    .split("\n")
    .find((entry) => entry.startsWith("0::"))
    ?.slice(3)
    .trim();
  if (!keeper) {
    kit.check("the keeper runs in a cgroup v2 group", false, said);
    return;
  }
  const root = join(fleet.home, "cgroup-stand-in");
  standIn(root, keeper, { max: 2 * GIB, used: 1.5 * GIB, inactive: 0 });
  await fleet.stop("agent");
  fleet.launch("agent", [], { CAWCO_ROOM_CGROUP_ROOT: root });
  await fleet.agentUp();

  const instanceId = await startSession(fleet, "Room under a limit");
  const line = await roomLine(fleet, instanceId);
  kit.check(
    "a machine with room waits on the memory limit above its keeper, naming what the limit leaves",
    !!line?.includes(
      `0.5 GiB left under the memory limit of 2.0 GiB on ${keeper} (a start needs 1.0 GiB) ✗`
    ) && line.includes("memory available (a start needs 1.0 GiB),"),
    line ?? "no room line"
  );

  standIn(root, keeper, { max: 2 * GIB, used: 1.5 * GIB, inactive: GIB });
  const row = await until(
    "the session's start once the limit leaves room",
    () => fleet.instance(instanceId),
    (found) => found?.status === "running",
    60_000
  ).catch(() => fleet.instance(instanceId));
  kit.check(
    "once the group's file cache can be given back, the start goes by itself and the session runs",
    row?.status === "running",
    JSON.stringify({ status: row?.status })
  );
  await fleet.stopSession(instanceId).catch(() => undefined);
};

const run = async (kit: Kit): Promise<void> => {
  const fleet = await kit.fleet(respond);
  const sessiond = fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent", [], {
    // 1 PiB: more than any machine has available.
    CAWCO_ROOM_MEMORY_AVAILABLE_MIN_MIB: String(1024 ** 3),
    CAWCO_ROOM_PRESSURE_LEVEL: "1",
  });
  await fleet.agentUp();
  await fleet.accountSignedIn();

  await heldAndStopped(kit, fleet);
  if (process.platform === "linux" && sessiond.pid !== undefined) {
    await underTheLimit(kit, fleet, sessiond.pid);
  }
};

const spec: Spec = {
  group: "The hub and machines",
  name: "room-held",
  run,
};

export default spec;
