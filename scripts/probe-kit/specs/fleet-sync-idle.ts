/**
 * A fleet with no config change pushes nothing; a delegate's workspace
 * opened or archived pushes nothing, its clone placed by the machine from
 * the project rows it holds before its first session starts; one change of
 * a project row pushes once and reaches the checkout and every live clone;
 * and after the agent starts again a new clone is placed from the rows it
 * kept on disk (agent fleet-place.ts, session.ts `placeClone`).
 *
 * On 2026-10-25 the hub re-pushed obelisk's fleet about once a minute
 * (25 times in 30 minutes): every delegate workspace was one of its
 * project's places, so each open and archive changed the machine's items.
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model), boundaries included: run it where a workspace boundary can
 * start. Setup: a project at a git checkout, with a skill, an MCP server, a
 * memory document and a hook bound to it, and a parent session in it; the
 * syncs that brings settle.
 *
 * - a. Five quiet minutes: the hub sends no delta or welcome, and the agent
 *   takes no sync.
 * - b. Three workspaces opened, one after another, and each archived: no
 *   delta sent. Each clone holds the project's skill, memory document, MCP
 *   server (in the fleet MCP set, at the clone) and hook (its script and its
 *   harness-set entry, at the clone), each written before its first
 *   session's spawn.
 * - c. Two workspaces open, then the memory document changed: exactly one
 *   delta, and the document's new text in the checkout and in both clones.
 * - d. The agent started again, then a workspace opened: its clone holds the
 *   changed document, placed from the rows kept on disk.
 *
 *   bun scripts/probe-kit/run.ts fleet-sync-idle
 */
import { existsSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readWithin } from "../../../packages/core/src/bounded";
import {
  placedMemoryDir,
  placedSkillsDir,
} from "../../../packages/core/src/paths";
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
/** The agent's line for a clone placed as its workspace was cut (agent session.ts `placeClone`): the clone, then the project. */
const PLACED_LINE =
  /\[fleet\] (\S+): project (\S+)'s (\d+) skill\(s\), .* placed from the rows kept on disk/;
const SKILL = "idle-probe-skill";
const MCP = "idle-probe-mcp";
/** The project's MCP server: a stdio fixture, which the hub probes for nothing. */
const MCP_SERVER = join(
  import.meta.dir,
  "..",
  "fixtures",
  "where-mcp-server.ts"
);
const DOC = "idle-probe.md";
const DOC_FIRST = "# Idle probe\n";
const DOC_CHANGED = "# Idle probe, changed\n";

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

const count = (text: string, pattern: RegExp): string[] =>
  [...text.matchAll(pattern)].map((found) => found[0]);

/** CawCo's data dir on the scratch machine (core `cawcoDataDir`). */
const dataDirOf = (fleet: Fleet): string =>
  join(fleet.env.XDG_DATA_HOME as string, "cawco");

const readJson = async <T>(path: string): Promise<T | undefined> =>
  JSON.parse(await readFile(path, "utf8").catch(() => "null")) ?? undefined;

/** Where each of the project's rows lands for the folder `cwd`, as the agent places it. */
const placedPaths = (fleet: Fleet, cwd: string, hookId: string) => ({
  skill: join(placedSkillsDir(cwd), SKILL, "SKILL.md"),
  memory: join(placedMemoryDir(cwd), DOC),
  hook: join(
    dataDirOf(fleet),
    "fleet-hooks",
    `${hookId}@${encodeURIComponent(cwd)}.sh`
  ),
  mcpSet: join(dataDirOf(fleet), "fleet-mcp-set.json"),
  harnessSet: join(dataDirOf(fleet), "fleet-harness-set.json"),
});

/** What the folder `cwd` holds of the project's rows: each file's path and mtime, and whether the sets name it. */
const placedAt = async (fleet: Fleet, cwd: string, hookId: string) => {
  const paths = placedPaths(fleet, cwd, hookId);
  const mtime = (path: string): number | undefined =>
    statSync(path, { throwIfNoEntry: false })?.mtimeMs;
  const mcpSet = await readJson<{
    placed?: Record<string, { cwd: string; name: string }>;
  }>(paths.mcpSet);
  const harnessSet = await readJson<{
    placedHooks?: Record<string, { cwd: string }>;
  }>(paths.harnessSet);
  return {
    paths,
    skill: mtime(paths.skill),
    memory: mtime(paths.memory),
    hook: mtime(paths.hook),
    memoryText: await readFile(paths.memory, "utf8").catch(() => ""),
    mcp: Object.values(mcpSet?.placed ?? {}).some(
      (one) => one.cwd === cwd && one.name === MCP
    ),
    hookEntry: Object.entries(harnessSet?.placedHooks ?? {}).some(
      ([id, one]) => one.cwd === cwd && id.startsWith(`${hookId}@`)
    ),
  };
};

type Placed = Awaited<ReturnType<typeof placedAt>>;

/** Whether every row is placed at the folder. */
const whole = (placed: Placed): boolean =>
  placed.skill !== undefined &&
  placed.memory !== undefined &&
  placed.hook !== undefined &&
  placed.mcp &&
  placed.hookEntry;

/** One placement in words, its paths named. */
const said = (placed: Placed): string =>
  [
    `skill ${placed.paths.skill} ${placed.skill ? "there" : "missing"}`,
    `memory ${placed.paths.memory} ${placed.memory ? "there" : "missing"}`,
    `hook script ${placed.paths.hook} ${placed.hook ? "there" : "missing"}`,
    `MCP ${MCP} in ${placed.paths.mcpSet} at the folder: ${placed.mcp}`,
    `hook entry in ${placed.paths.harnessSet} at the folder: ${placed.hookEntry}`,
  ].join("; ");

interface Opened {
  clone: string;
  instanceId: string;
  /** When the hub spawned its first session, ms epoch. */
  spawnedAt: number;
  workspaceId: string;
}

/** A delegate of `parent` in a new workspace of the project, once its session is spawned. */
const openWorkspace = async (
  fleet: Fleet,
  parent: string,
  src: string,
  title: string
): Promise<Opened> => {
  const started = await fleet.api<{
    instanceId: string;
    workItemId: string;
    workspaceId: string;
  }>("/api/work-items", {
    parentInstanceId: parent,
    title,
    prompt: "Say ok.",
    harness: "claude",
    model: "claude-haiku-4-5",
    cwd: src,
  });
  const clone = await until(
    `${title}'s clone`,
    () =>
      fleet.query<{ path: string }>(
        "SELECT path FROM workspaces WHERE id = ?",
        started.workspaceId
      )[0]?.path,
    Boolean,
    120_000
  );
  const spawnedAt = await until(
    `${title}'s session spawned`,
    () =>
      fleet.query<{ spawned_at: number | null }>(
        "SELECT spawned_at FROM instances WHERE id = ?",
        started.instanceId
      )[0]?.spawned_at ?? undefined,
    (at) => at > 0,
    120_000
  );
  return {
    clone,
    instanceId: started.instanceId,
    spawnedAt,
    workspaceId: started.workspaceId,
  };
};

/** The workspace's item stopped by its parent, then the workspace archived, its clone gone. */
const archiveWorkspace = async (
  fleet: Fleet,
  parent: string,
  opened: Opened
): Promise<string> => {
  await fleet.api("/api/work-items/stop", {
    from: parent,
    instanceId: opened.instanceId,
  });
  const state = () =>
    fleet.query<{ state: string }>(
      "SELECT state FROM workspaces WHERE id = ?",
      opened.workspaceId
    )[0]?.state ?? "gone";
  const settled = await until(
    "the workspace settled after its item stopped",
    state,
    (now) => now === "archived",
    60_000
  ).catch(state);
  if (settled !== "archived") {
    await until(
      "the workspace's item ended",
      () =>
        fleet.query<{ state: string }>(
          "SELECT state FROM work_items WHERE workspace_id = ?",
          opened.workspaceId
        )[0]?.state,
      (now) => now !== "running" && now !== "starting",
      60_000
    ).catch(() => undefined);
    await fleet.api(`/api/workspaces/${opened.workspaceId}/archive`, {});
  }
  await until(
    "the clone deleted",
    () => !existsSync(opened.clone),
    Boolean,
    60_000
  ).catch(() => undefined);
  return `${state()}, clone ${existsSync(opened.clone) ? "still there" : "gone"}`;
};

const run = async (kit: Kit) => {
  const nested =
    await Bun.$`bwrap --unshare-user --unshare-net --die-with-parent --ro-bind / / --dev /dev --proc /proc true`
      .quiet()
      .nothrow();
  if (process.platform === "linux" && nested.exitCode !== 0) {
    kit.check(
      "0: a workspace boundary can start here (run this spec on the host, not inside a workspace)",
      false,
      nested.stderr.toString().trim()
    );
    return;
  }
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

  // Setup: a project at a checkout, its rows, and a parent session in it.
  const src = join(fleet.sandbox, "src");
  await mkdir(src, { recursive: true });
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  await Bun.$`sh -c ${"git init -q -b main && echo idle > README.md && git add -A && git commit -qm 'First commit'"}`
    .cwd(src)
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Idle",
    machineId: MACHINE,
    cwd: src,
  });
  const parent = await fleet.spawn("claude", "Parent", src, {
    projectId: project.id,
  });
  const hookId = crypto.randomUUID();
  const source = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      new Response(
        `---\nname: ${SKILL}\ndescription: a probe skill placed for one project.\n---\n\nSay ok.\n`
      ),
  });
  try {
    await hubCall(fleet, "PUT", `/api/fleet/hooks/${hookId}`, {
      enabled: true,
      handler: { type: "command" },
      name: "idle probe hook",
      event: "Notification",
      script: "#!/bin/bash\nexit 0",
      scope: "project",
      projectId: project.id,
    });
    await hubCall(fleet, "PUT", "/api/fleet/memory/docs", {
      path: DOC,
      content: DOC_FIRST,
      scope: { projectIds: [project.id] },
    });
    await hubCall(fleet, "PUT", `/api/fleet/mcp/${MCP}`, {
      config: { command: process.execPath, args: [MCP_SERVER] },
      enabled: true,
      projectId: project.id,
    });
    await hubCall(fleet, "PUT", `/api/fleet/skills/${SKILL}`, {
      source: `http://127.0.0.1:${source.port}/SKILL.md`,
      enabled: true,
      projectId: project.id,
    });
    await until(
      "the skill fetched at the hub",
      async () =>
        (
          (await hubCall(fleet, "GET", "/api/fleet")) as {
            skills?: { name: string; hash?: string; error?: string }[];
          }
        ).skills?.find((one) => one.name === SKILL),
      (row) => Boolean(row?.hash || row?.error),
      120_000
    );
  } finally {
    source.stop(true);
  }
  const hubSettled = await fleet.logMark("hub");
  await until(
    "the syncs of the setup settled: no delta sent for 20 s",
    async () => {
      const before = count(await hubSettled.since(), SENT_LINE).length;
      await Bun.sleep(SETTLE_MS);
      return count(await hubSettled.since(), SENT_LINE).length === before;
    },
    Boolean,
    240_000
  );
  const atCheckout = await placedAt(fleet, src, hookId);
  kit.check(
    "0: the project's skill, memory document, MCP server and hook are placed at its checkout",
    whole(atCheckout),
    said(atCheckout)
  );

  // a: five minutes with no change.
  const hubQuiet = await fleet.logMark("hub");
  const agentQuiet = await fleet.logMark("agent");
  await Bun.sleep(QUIET_MS);
  const quietSent = count(await hubQuiet.since(), SENT_LINE);
  const quietSyncs = count(await agentQuiet.since(), SYNC_LINE);
  kit.check(
    `a: ${QUIET_MS / 60_000} minutes with no change: no delta or welcome sent, no sync taken`,
    quietSent.length === 0 && quietSyncs.length === 0,
    `sent: ${quietSent.join(" | ") || "none"}; syncs taken: ${quietSyncs.length}`
  );

  // b: three workspaces opened and archived, one after another.
  const hubOpen = await fleet.logMark("hub");
  const agentOpen = await fleet.logMark("agent");
  const opens: { opened: Opened; placed: Placed; archived: string }[] = [];
  for (const n of [1, 2, 3]) {
    // biome-ignore lint/performance/noAwaitInLoops: one workspace at a time, each read before it goes
    const opened = await openWorkspace(fleet, parent, src, `Idle open ${n}`);
    const placed = await placedAt(fleet, opened.clone, hookId);
    const archived = await archiveWorkspace(fleet, parent, opened);
    opens.push({ opened, placed, archived });
  }
  await Bun.sleep(SETTLE_MS);
  const openSent = count(await hubOpen.since(), SENT_LINE);
  const openLog = await agentOpen.since();
  kit.check(
    "b: three workspaces opened and archived: no delta sent, no sync taken",
    openSent.length === 0 && count(openLog, SYNC_LINE).length === 0,
    `sent: ${openSent.join(" | ") || "none"}; syncs taken: ${count(openLog, SYNC_LINE).length}; ${opens.map(({ opened, archived }) => `${opened.workspaceId.slice(0, 8)} ${archived}`).join("; ")}`
  );
  for (const { opened, placed } of opens) {
    const before = [placed.skill, placed.memory, placed.hook].every(
      (at) => at !== undefined && at <= opened.spawnedAt
    );
    const line = openLog
      .split("\n")
      .map((one) => PLACED_LINE.exec(one))
      .find((found) => found?.[1] === opened.clone);
    kit.check(
      `b: workspace ${opened.workspaceId.slice(0, 8)}'s clone holds the project's skill, memory document, MCP server and hook, written before its first session's spawn`,
      whole(placed) && before && line?.[2] === project.id,
      `${said(placed)}; files written ${[placed.skill, placed.memory, placed.hook].map((at) => (at === undefined ? "never" : `${Math.round(opened.spawnedAt - at)} ms before the spawn`)).join(", ")}; agent: ${line?.[0] ?? "no placement line"}`
    );
  }

  // c: one change of a project row while two clones are live.
  const hubTwo = await fleet.logMark("hub");
  const live = [
    await openWorkspace(fleet, parent, src, "Idle live 1"),
    await openWorkspace(fleet, parent, src, "Idle live 2"),
  ];
  await Bun.sleep(SETTLE_MS);
  const twoSent = count(await hubTwo.since(), SENT_LINE);
  const hubChange = await fleet.logMark("hub");
  const agentChange = await fleet.logMark("agent");
  await hubCall(fleet, "PUT", "/api/fleet/memory/docs", {
    path: DOC,
    content: DOC_CHANGED,
    scope: { projectIds: [project.id] },
  });
  const folders = [src, ...live.map((one) => one.clone)];
  await until(
    "the changed document in the checkout and both clones",
    async () =>
      Promise.all(
        folders.map(
          async (folder) => (await placedAt(fleet, folder, hookId)).memoryText
        )
      ),
    (read) => read.every((text) => text === DOC_CHANGED),
    60_000
  ).catch(() => undefined);
  await Bun.sleep(SETTLE_MS);
  const changeSent = count(await hubChange.since(), SENT_LINE);
  const texts = await Promise.all(
    folders.map(async (folder) => ({
      folder,
      text: (await placedAt(fleet, folder, hookId)).memoryText,
    }))
  );
  kit.check(
    "c: two workspaces opened with no delta; then one memory document changed: exactly one delta sent and one sync taken",
    twoSent.length === 0 &&
      changeSent.length === 1 &&
      count(await agentChange.since(), SYNC_LINE).length === 1,
    `while opening: ${twoSent.join(" | ") || "none"}; on the change: ${changeSent.join(" | ") || "none"}; syncs taken: ${count(await agentChange.since(), SYNC_LINE).length}`
  );
  kit.check(
    "c: the changed document is in the checkout and in every live clone",
    texts.every(({ text }) => text === DOC_CHANGED),
    texts
      .map(
        ({ folder, text }) =>
          `${join(placedMemoryDir(folder), DOC)}: ${JSON.stringify(text)}`
      )
      .join("; ")
  );
  for (const one of live) {
    // biome-ignore lint/performance/noAwaitInLoops: one archive at a time
    await archiveWorkspace(fleet, parent, one);
  }

  // d: the agent started again, then a workspace opened.
  const kept = join(dataDirOf(fleet), "fleet-project-rows.json");
  const keptBefore = existsSync(kept);
  await fleet.stop("agent");
  const agentAgain = await fleet.logMark("agent");
  fleet.launch("agent");
  await fleet.agentUp();
  const after = await openWorkspace(fleet, parent, src, "Idle after restart");
  const placedAfter = await placedAt(fleet, after.clone, hookId);
  const lineAfter = (await agentAgain.since())
    .split("\n")
    .map((one) => PLACED_LINE.exec(one))
    .find((found) => found?.[1] === after.clone);
  kit.check(
    "d: after the agent started again, a new clone holds the project's rows, the changed document among them, placed from the rows kept on disk",
    keptBefore &&
      whole(placedAfter) &&
      placedAfter.memoryText === DOC_CHANGED &&
      lineAfter?.[2] === project.id,
    `${kept} kept before the restart: ${keptBefore}; ${said(placedAfter)}; its document ${JSON.stringify(placedAfter.memoryText)}; agent: ${lineAfter?.[0] ?? "no placement line"}`
  );
  await archiveWorkspace(fleet, parent, after);
};

const spec: Spec = {
  name: "fleet-sync-idle",
  host: "it delegates, so its fleet cuts workspaces",
  run,
};

export default spec;
