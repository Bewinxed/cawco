/**
 * `bun run fixture-db` in packages/hub: the realistic database the
 * migration check (migrations-check.ts) starts a hub on, written to
 * fixtures/realistic-db.sqlite.gz. Made once, and again only when wanted:
 * every migration added after it is run over its rows by every commit's
 * typecheck.
 *
 * It is a scratch fleet's database as the hub's own code writes it: a hub
 * built in-process (hub-in-process.ts) at the newest published nightly (or
 * `--at <ref>`), the schema a real hub upgrades from, seeded through the
 * hub's Db with many machines, projects, sessions (live, ended, failed,
 * delegates), sends, tasks, threads, workspaces and work items. Every value
 * is made up here, so nothing in it needs sanitizing: no person's words, no
 * secret, no path off a real machine.
 *
 * With `--at`, this file and hub-in-process.ts run inside a worktree of that
 * commit, against its hub; the seed below must fit that commit's Db.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one seeded row after another keeps the database's order as a real hub's.
import { Database } from "bun:sqlite";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { machinePath } from "@cawco/core/machine-path";
import { hubInProcess } from "./hub-in-process";

/** A fixture folder on a fixture machine, made as every machine path is. */
const fixturePath = (raw: string) => machinePath("/home/dev", raw, "fixture");

import { newestNightly } from "./shipped";

const HUB = resolve(import.meta.dir, "..");
export const FIXTURE = join(HUB, "fixtures", "realistic-db.sqlite.gz");

const flag = (name: string): string | undefined => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
};

/** A seeded pick: the same shapes and counts every time it is made at the same commit (ids are new each time). */
let state = 0x2f_6b_1d_93;
const next = (): number => {
  state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
  return state / 2_147_483_648;
};
const pick = <T>(items: readonly T[]): T =>
  items[Math.floor(next() * items.length)] as T;
const id = (prefix: string, n: number): string =>
  `${prefix}-${n.toString(36).padStart(5, "0")}-${Math.floor(next() * 1e9).toString(36)}`;

const MACHINES = ["obsidian", "lumen", "quarry", "marlin"];
const HARNESSES = ["claude", "opencode", "pi"] as const;
const WORDS =
  "fix the board's scroll after a reconnect; tidy the preview pane; make the release proof faster; answer the queued ask; the rail shows the wrong title; move tasks to the new stage; check the migration on a real database; the canvas loses its pins".split(
    "; "
  );

type HubDb = Awaited<ReturnType<typeof hubInProcess>>["db"];
interface Seeded {
  id: string;
  machineId: string;
  projectId: string;
}

/** Machines and projects: the projects' ids. */
function seedProjects(db: HubDb): string[] {
  for (const machineId of MACHINES) {
    db.upsertAgent({
      machineId,
      hostname: `${machineId}.local`,
      os: machineId === "marlin" ? "darwin" : "linux",
      auth: "unknown",
    });
  }
  const projects: string[] = [];
  for (let p = 0; p < 12; p += 1) {
    const projectId = id("proj", p);
    const machineId = pick(MACHINES);
    db.createProject({
      id: projectId,
      name: `Project ${p + 1}`,
      checkout: {
        machineId,
        path: fixturePath(`/home/dev/src/project-${p + 1}`),
      },
      remote:
        p % 3 === 0 ? null : `https://example.invalid/dev/project-${p + 1}.git`,
    });
    projects.push(projectId);
  }
  return projects;
}

/** Sessions, a share of them delegates, each with its sends; half ended, a tenth failed. */
function seedSessions(db: HubDb, projects: string[]): Seeded[] {
  const sessions: Seeded[] = [];
  for (let s = 0; s < 420; s += 1) {
    const projectId = pick(projects);
    const machineId = pick(MACHINES);
    const instanceId = crypto.randomUUID();
    const parent = s > 40 && next() < 0.45 ? pick(sessions) : undefined;
    db.openInstance({
      id: instanceId,
      machineId,
      cwd: fixturePath(`/home/dev/src/${projectId}`),
      sessionId: crypto.randomUUID(),
      harness: pick(HARNESSES),
      projectId,
      ...(parent ? { parentInstanceId: parent.id, canDelegate: false } : {}),
      title: pick(WORDS),
      kind: s % 25 === 0 ? "scratch" : "mainline",
      permissionMode: "bypassPermissions",
      model: "model-a",
    });
    sessions.push({ id: instanceId, machineId, projectId });
    for (let m = 0; m < 1 + Math.floor(next() * 4); m += 1) {
      db.recordSend({
        uuid: crypto.randomUUID(),
        instanceId,
        acceptedAt: new Date(Date.UTC(2026, 9, 1) + s * 60_000 + m * 1000),
        body: {
          type: "user",
          uuid: crypto.randomUUID(),
          message: { role: "user", content: pick(WORDS) },
          parent_tool_use_id: null,
        },
      });
    }
    const end = next();
    if (end < 0.5) {
      db.endInstance(instanceId, pick(["stop", "discard"] as const));
    } else if (end < 0.6) {
      db.failInstance(instanceId, "The harness exited with status 1.");
    }
  }
  return sessions;
}

/** Each project's tasks and its threads with Caw. */
function seedTasksAndThreads(db: HubDb, projects: string[]): void {
  for (const projectId of projects) {
    db.putTaskIndex(
      Array.from({ length: 18 }, (_, t) => ({
        projectId,
        path: `tasks/tsk-${t + 1}.md`,
        id: `tsk-${t + 1}`,
        number: t + 1,
        title: pick(WORDS),
        stage: pick(["inbox", "next", "doing", "review", "done"]),
        type: pick(["bug", "feature", null]),
        after: t > 2 ? [`tsk-${t}`] : [],
        parent: t > 10 ? "tsk-1" : null,
        related: [],
        foundIn: null,
        duplicateOf: null,
        rank: `a${t}`,
        labels: t % 4 === 0 ? ["release"] : [],
        fields: {},
        todosDone: t % 3,
        todosTotal: 3,
        problem: null,
        hash: Bun.hash(`${projectId}-${t}`).toString(16),
        updatedAt: new Date(Date.UTC(2026, 9, 2) + t * 3_600_000),
      }))
    );
    for (let t = 0; t < 4; t += 1) {
      const { thread } = db.createThread({
        id: crypto.randomUUID(),
        projectId,
        title: pick(WORDS),
        first: { author: "you", body: pick(WORDS) },
      });
      for (let m = 0; m < 10; m += 1) {
        db.addThreadMessage({
          threadId: thread.id,
          author: m % 2 ? "you" : "caw",
          body: pick(WORDS),
        });
      }
    }
  }
}

/** Delegate workspaces, two work items in each. */
function seedWorkspaces(db: HubDb, sessions: Seeded[]): void {
  for (let w = 0; w < 60; w += 1) {
    const parent = pick(sessions);
    const workspace = db.createWorkspace({
      id: id("ws", w),
      machineId: parent.machineId,
      repoRoot: fixturePath(`/home/dev/src/${parent.projectId}`),
      path: fixturePath(`/home/dev/.worktrees/${parent.projectId}-${w}`),
      branch: `ws/${w}`,
      createdByInstanceId: parent.id,
    });
    for (let i = 0; i < 2; i += 1) {
      const child = pick(sessions);
      db.createWorkItem({
        id: id("item", w * 2 + i),
        workspaceId: workspace.id,
        parentInstanceId: parent.id,
        instanceId: child.id,
        brief: pick(WORDS),
        title: pick(WORDS),
        harness: pick(HARNESSES),
        projectId: parent.projectId,
      });
    }
  }
}

async function seed(dbPath: string, home: string): Promise<void> {
  const { db, lifetime } = await hubInProcess(dbPath, home);
  const projects = seedProjects(db);
  const sessions = seedSessions(db, projects);
  seedTasksAndThreads(db, projects);
  seedWorkspaces(db, sessions);
  lifetime.close();
}

const out = flag("--seed");
if (out) {
  const scratch = mkdtempSync(join(tmpdir(), "cawco-fixture-db-"));
  try {
    const dbPath = join(scratch, "hub.db");
    mkdirSync(join(scratch, "home"));
    await seed(dbPath, join(scratch, "home"));
    const sqlite = new Database(dbPath);
    sqlite.run("PRAGMA wal_checkpoint(TRUNCATE)");
    sqlite.run("VACUUM");
    await Bun.write(out, Bun.gzipSync(new Uint8Array(sqlite.serialize())));
    sqlite.close();
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  process.exit(0);
}

// The made database: seeded at `--at` (the newest published nightly when not given), written to FIXTURE.
const started = performance.now();
const run = (command: string[], cwd: string): void => {
  const child = Bun.spawnSync(command, {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (child.exitCode !== 0) {
    throw new Error(
      `${command.join(" ")} failed with exit status ${child.exitCode}`
    );
  }
};
const at = flag("--at") ?? newestNightly(HUB).commit;
const tree = mkdtempSync(join(tmpdir(), "cawco-fixture-tree-"));
try {
  run(["git", "worktree", "add", "--detach", tree, at], HUB);
  run([process.execPath, "install", "--frozen-lockfile"], tree);
  for (const name of ["fixture-db.ts", "hub-in-process.ts", "shipped.ts"]) {
    copyFileSync(
      join(import.meta.dir, name),
      join(tree, "packages/hub/scripts", name)
    );
  }
  run(
    [process.execPath, "packages/hub/scripts/fixture-db.ts", "--seed", FIXTURE],
    tree
  );
} finally {
  run(["git", "worktree", "remove", "--force", tree], HUB);
}
console.log(
  `fixture-db: seeded at ${at}, written to ${FIXTURE} in ${((performance.now() - started) / 1000).toFixed(1)} s`
);
