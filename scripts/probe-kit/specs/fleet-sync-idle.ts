/**
 * WIP (not run yet): a fleet with no config change pushes nothing, one
 * change pushes once, and a place added and taken away pushes once each,
 * writing only that place's copies.
 *
 * On a scratch fleet (real hub, agent and sessiond, against the mock model),
 * delegating nothing, so it runs inside a workspace:
 *
 * 0. A project at a checkout, with a fleet hook, a hook bound to the
 *    project and a memory document scoped to it; the syncs that brings
 *    settle.
 * 1. Five minutes with no change: the hub sends no delta and no welcome,
 *    the agent takes no sync, and no boundary's form moves.
 * 2. One change (the fleet hook's script): exactly one delta sent, one sync
 *    taken.
 * 3. A second checkout added as a place, then taken away: one delta each,
 *    "a place changed"; the memory document written into the new place and
 *    taken out of it; nothing under the first checkout's `.claude/` or the
 *    user layer's settings written.
 *
 *   bun scripts/probe-kit/run.ts fleet-sync-idle
 */
import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { readWithin } from "../../../packages/core/src/bounded";
import { MACHINE, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

/** How long the fleet is left alone. */
const QUIET_MS = 5 * 60_000;
/** How long a change's delta, its converge and its report take to land. */
const SETTLE_MS = 20_000;
/** The hub's line for each delta or welcome it sends (hub fleet-sync.ts `#sendDiff`): its rev, item count and why. */
const SENT_LINE =
  /\[fleet\] (?:delta|welcome) rev (\d+) sent → [^:]+: (\d+) item\(s\)[^;]*; (.*)/g;
/** The agent's line for each delta that moved an item (agent session.ts `FLEET_DELTA`). */
const SYNC_LINE = /\[fleet\] sync from the hub: rev (\d+)/g;
/** The agent's lines for a boundary's form move or hand-over (agent boundary.ts). */
const BOUNDARY_LINE =
  /\[workspace\] [0-9a-f-]+: its boundary(?:'s form moved| \d+ \(form \w+\) is handed over)/g;
const DOC = "probe-idle.md";

type Fleet = Awaited<ReturnType<Kit["fleet"]>>;

/** The hub's own routes, as the admin tools call them. */
const hubCall = async (
  fleet: Fleet,
  method: string,
  path: string,
  body?: unknown
): Promise<unknown> => {
  const read = await readWithin(30_000, async (signal) => {
    const response = await fetch(`${fleet.base}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal,
    });
    return { status: response.status, text: await response.text() };
  });
  if (read.kind === "unanswered") {
    throw new Error(`${method} ${path}: no answer within ${read.after} ms`);
  }
  if (read.value.status >= 400) {
    throw new Error(
      `${method} ${path}: ${read.value.status} ${read.value.text}`
    );
  }
  return JSON.parse(read.value.text || "null") as unknown;
};

/** Every file and dir under `root` by path, with its inode and mtime: what a write moves. */
const stamps = async (root: string): Promise<Map<string, string>> => {
  const out = new Map<string, string>();
  const walk = async (dir: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(
      () => []
    );
    for (const entry of entries) {
      const path = join(dir, entry.name);
      // biome-ignore lint/performance/noAwaitInLoops: a small tree, read in order
      const held = await lstat(path).catch(() => undefined);
      if (held) {
        out.set(path, `${held.ino}:${held.mtimeMs}`);
      }
      if (entry.isDirectory()) {
        await walk(path);
      }
    }
  };
  await walk(root);
  return out;
};

/** The paths whose stamp differs between `before` and `after`, gone and new ones included. */
const movedStamps = (
  before: Map<string, string>,
  after: Map<string, string>
): string[] =>
  [...new Set([...before.keys(), ...after.keys()])].filter(
    (path) => before.get(path) !== after.get(path)
  );

const count = (text: string, pattern: RegExp): string[] =>
  [...text.matchAll(pattern)].map((found) => found[0]);

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
  const home = fleet.env.HOME as string;
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();

  // 0: a project at a checkout, and rows placed there.
  const src = join(fleet.sandbox, "src");
  await Bun.$`mkdir -p ${src} && git -C ${src} init -q -b main && git -C ${src} -c user.name=o -c user.email=o@probe.test commit -q --allow-empty -m first`.quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Idle",
    machineId: MACHINE,
    cwd: src,
  });
  const fleetHook = crypto.randomUUID();
  const hook = (id: string, extra: object, script: string) =>
    hubCall(fleet, "PUT", `/api/fleet/hooks/${id}`, {
      enabled: true,
      handler: { type: "command" },
      name: `idle probe ${id.slice(0, 4)}`,
      event: "Notification",
      script,
      ...extra,
    });
  await hook(fleetHook, {}, "#!/bin/bash\nexit 0");
  await hook(
    crypto.randomUUID(),
    { scope: "project", projectId: project.id },
    "#!/bin/bash\nexit 0"
  );
  await hubCall(fleet, "PUT", "/api/fleet/memory/docs", {
    path: DOC,
    content: "# Idle probe\n",
    scope: { projectIds: [project.id] },
  });
  const hubSettled = await fleet.logMark("hub");
  await until(
    "the syncs of the setup settled: no delta sent for 20 s",
    async () => {
      const before = count(await hubSettled.since(), SENT_LINE).length;
      await Bun.sleep(SETTLE_MS);
      return count(await hubSettled.since(), SENT_LINE).length === before;
    },
    Boolean,
    180_000
  );
  kit.check(
    "0: the memory document scoped to the project is placed at its checkout",
    (await Bun.file(join(src, ".claude", "rules", "cawco", DOC)).exists()) ===
      true,
    `${join(src, ".claude", "rules", "cawco", DOC)}`
  );

  // 1: five minutes with no change.
  const hubQuiet = await fleet.logMark("hub");
  const agentQuiet = await fleet.logMark("agent");
  await Bun.sleep(QUIET_MS);
  const quietSent = count(await hubQuiet.since(), SENT_LINE);
  const quietAgent = await agentQuiet.since();
  kit.check(
    `1: ${QUIET_MS / 60_000} minutes with no change: no delta or welcome sent, no sync taken, no boundary's form moved or handed over`,
    quietSent.length === 0 &&
      count(quietAgent, SYNC_LINE).length === 0 &&
      count(quietAgent, BOUNDARY_LINE).length === 0,
    `sent: ${quietSent.join(" | ") || "none"}; syncs: ${count(quietAgent, SYNC_LINE).length}; boundary lines: ${count(quietAgent, BOUNDARY_LINE).length}`
  );

  // 2: one change, one push.
  const hubOne = await fleet.logMark("hub");
  const agentOne = await fleet.logMark("agent");
  await hook(fleetHook, {}, "#!/bin/bash\necho changed\nexit 0");
  await Bun.sleep(SETTLE_MS);
  const oneSent = count(await hubOne.since(), SENT_LINE);
  kit.check(
    "2: one change of the fleet hook: exactly one delta sent and one sync taken",
    oneSent.length === 1 &&
      count(await agentOne.since(), SYNC_LINE).length === 1,
    `sent: ${oneSent.join(" | ") || "none"}; syncs: ${count(await agentOne.since(), SYNC_LINE).length}`
  );

  // 3: a place added and taken away.
  const second = join(fleet.sandbox, "src-2");
  await Bun.$`git clone -q ${src} ${second}`.quiet();
  const firstBefore = await stamps(join(src, ".claude"));
  const settingsBefore = await stamps(join(home, ".claude"));
  const hubAdd = await fleet.logMark("hub");
  const added = await hubCall(
    fleet,
    "POST",
    `/api/projects/${project.id}/places`,
    { machineId: MACHINE, path: second }
  );
  await Bun.sleep(SETTLE_MS);
  const addSent = count(await hubAdd.since(), SENT_LINE);
  const placedDoc = join(second, ".claude", "rules", "cawco", DOC);
  kit.check(
    "3: a second checkout added: exactly one delta, a place changed, and the document written there",
    addSent.length === 1 &&
      addSent[0]?.includes("a place changed") === true &&
      (await Bun.file(placedDoc).exists()),
    `sent: ${addSent.join(" | ") || "none"}; ${placedDoc}: ${await Bun.file(placedDoc).exists()}`
  );
  const placeId = (added as { places?: { id: string; path: string }[] })
    .places
    ? (added as { places: { id: string; path: string }[] }).places.find(
        (place) => place.path === second
      )?.id
    : (added as { id?: string }).id;
  const hubGone = await fleet.logMark("hub");
  await hubCall(
    fleet,
    "DELETE",
    `/api/projects/${project.id}/places/${placeId}`
  );
  await Bun.sleep(SETTLE_MS);
  const goneSent = count(await hubGone.since(), SENT_LINE);
  const firstMoved = movedStamps(firstBefore, await stamps(join(src, ".claude")));
  const settingsMoved = movedStamps(
    settingsBefore,
    await stamps(join(home, ".claude"))
  );
  kit.check(
    "3: the place taken away: exactly one delta, the document gone from it, and nothing under the first checkout's .claude or the user layer written by either",
    goneSent.length === 1 &&
      !(await Bun.file(placedDoc).exists()) &&
      firstMoved.length === 0 &&
      settingsMoved.length === 0,
    `sent: ${goneSent.join(" | ") || "none"}; first checkout moved: ${firstMoved.join(", ") || "none"}; user layer moved: ${settingsMoved.join(", ") || "none"}`
  );
};

const spec: Spec = {
  name: "fleet-sync-idle",
  run,
};

export default spec;
