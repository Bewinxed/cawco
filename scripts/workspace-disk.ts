/**
 * What delegation keeps on this machine's disk, read from the hub's database
 * (`sqlite3 -readonly`'s way: `bun:sqlite` opened read-only) and the disk
 * alone. It deletes nothing.
 *
 * For each class of folder a workspace leaves, every folder whose workspace
 * is archived or unknown to the hub is an orphan:
 * - clones, `~/.worktrees/<repo>-<id8>`;
 * - state dirs, `~/.cawco/workspaces/<id>`;
 * - scratch dirs, `~/.cawco/tmp/<id8>`;
 * - door dirs, `$XDG_RUNTIME_DIR/cawco-ws/<id8>`;
 * - Apple build roots, `~/.cawco/workspace-cache/xdg/cawco-apple/<clone>`;
 * - host-check checkouts, `~/.cawco/host-checks/<run>`, one per check run in
 *   progress: each is listed with its age, since the hub keeps no record of
 *   a run's checkout to read.
 * Then the live workspaces, by state, with their clone's size and how much
 * of its `node_modules` is files of its own (link count 1) and how much is
 * shared with the workspaces' bun cache.
 *
 *   bun scripts/workspace-disk.ts [--json] [--no-sizes]
 *
 * Runs on the hub's machine (the database is read there), outside every
 * boundary: a workspace sees none of these folders but its own.
 */
import { Database } from "bun:sqlite";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import {
  hostChecksDir,
  hubDbPath,
  workspaceCacheDir,
  workspaceScratchRoot,
  workspacesDir,
} from "../packages/core/src/paths";

const json = process.argv.includes("--json");
const sizes = !process.argv.includes("--no-sizes");

interface Row {
  id: string;
  path: string;
  state: string;
}

/** A live workspace's items: how many are still going, and when the last one ended. */
interface Items {
  ended: number;
  last_end: number | null;
  open: number;
  states: string;
  workspace_id: string;
}

const db = new Database(hubDbPath(), { readonly: true });
const rows = db.query("SELECT id, path, state FROM workspaces").all() as Row[];
const items = new Map(
  (
    db
      .query(
        `SELECT workspace_id,
          SUM(state IN ('starting', 'running')) AS open,
          SUM(state NOT IN ('starting', 'running')) AS ended,
          MAX(ended_at) AS last_end,
          GROUP_CONCAT(DISTINCT state) AS states
        FROM work_items GROUP BY workspace_id`
      )
      .all() as Items[]
  ).map((row) => [row.workspace_id, row])
);
db.close();

const live = (row: Row | undefined): boolean =>
  row !== undefined && row.state !== "archived";
const byId = new Map(rows.map((row) => [row.id, row]));
/** Every row an id8 names: several when two ids share their first 8 characters. */
const byId8 = new Map<string, Row[]>();
for (const row of rows) {
  const id8 = row.id.slice(0, 8);
  byId8.set(id8, [...(byId8.get(id8) ?? []), row]);
}
const liveId8 = (id8: string): boolean =>
  (byId8.get(id8) ?? []).some((row) => live(row));
const livePaths = new Set(rows.filter(live).map((row) => row.path));

/** `du -sk` in bytes; 0 when it cannot be read. */
const du = async (path: string): Promise<number> => {
  if (!sizes) {
    return 0;
  }
  const run = Bun.spawn(["du", "-sk", path], {
    stdout: "pipe",
    stderr: "ignore",
  });
  const [out] = await Promise.all([new Response(run.stdout).text(), run.exited]);
  return Number(out.split("\t")[0]) * 1024 || 0;
};

const list = (dir: string): Promise<string[]> =>
  readdir(dir).catch(() => [] as string[]);

const ageHours = async (path: string): Promise<number> => {
  const info = await stat(path).catch(() => undefined);
  return info ? (Date.now() - info.mtimeMs) / 3_600_000 : 0;
};

interface Found {
  ageHours: number;
  bytes: number;
  class: string;
  path: string;
  why: string;
}

const ID8 = /^[0-9a-f]{8}$/;
const CLONE = /-([0-9a-f]{8})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const orphans: Found[] = [];
const inFlight: Found[] = [];

const note = async (
  into: Found[],
  kind: string,
  path: string,
  why: string
): Promise<void> => {
  into.push({
    class: kind,
    path,
    bytes: await du(path),
    why,
    ageHours: await ageHours(path),
  });
};

/** Why an id8-named folder is an orphan, or nothing when its workspace lives. */
const id8Why = (id8: string): string | undefined => {
  if (liveId8(id8)) {
    return;
  }
  return byId8.has(id8)
    ? `workspace ${id8} is archived`
    : `no workspace ${id8} in the hub`;
};

const worktrees = join(homedir(), ".worktrees");
for (const name of await list(worktrees)) {
  const path = join(worktrees, name);
  const id8 = CLONE.exec(name)?.[1];
  if (!id8 || livePaths.has(path)) {
    continue;
  }
  // A folder there whose id8 the hub never cut is someone's own worktree.
  if (byId8.has(id8)) {
    // biome-ignore lint/performance/noAwaitInLoops: one folder at a time, du is the bulk
    await note(orphans, "clone", path, `workspace ${id8} is archived`);
  }
}

for (const id of await list(workspacesDir())) {
  const row = byId.get(id);
  if (!live(row)) {
    // biome-ignore lint/performance/noAwaitInLoops: one folder at a time
    await note(
      orphans,
      "state",
      join(workspacesDir(), id),
      row ? `workspace ${id} is archived` : `no workspace ${id} in the hub`
    );
  }
}

for (const id8 of await list(workspaceScratchRoot())) {
  const why = ID8.test(id8) ? id8Why(id8) : "named by no workspace id";
  if (why) {
    // biome-ignore lint/performance/noAwaitInLoops: one folder at a time
    await note(orphans, "scratch", join(workspaceScratchRoot(), id8), why);
  }
}

const runtime = process.env.XDG_RUNTIME_DIR;
if (runtime) {
  const doors = join(runtime, "cawco-ws");
  for (const id8 of await list(doors)) {
    const why = ID8.test(id8) ? id8Why(id8) : "named by no workspace id";
    if (why) {
      // biome-ignore lint/performance/noAwaitInLoops: one folder at a time
      await note(orphans, "door", join(doors, id8), why);
    }
  }
}

const apple = join(workspaceCacheDir(), "xdg", "cawco-apple");
for (const name of await list(apple)) {
  const id8 = CLONE.exec(name)?.[1];
  if (!id8) {
    continue;
  }
  const why = id8Why(id8);
  if (why) {
    // biome-ignore lint/performance/noAwaitInLoops: one folder at a time
    await note(orphans, "apple-build", join(apple, name), why);
  }
}

for (const run of await list(hostChecksDir())) {
  const path = join(hostChecksDir(), run);
  // biome-ignore lint/performance/noAwaitInLoops: one folder at a time
  await note(
    UUID.test(run) ? inFlight : orphans,
    "host-check",
    path,
    UUID.test(run) ? "a check run's checkout" : "named by no check run"
  );
}

/** A live clone's size, and its `node_modules` split into files of its own and files shared by a link. */
const cloneSize = async (path: string) => {
  const total = await du(path);
  const find = Bun.spawn(
    [
      "find",
      path,
      "-xdev",
      "-path",
      "*/node_modules/*",
      "-type",
      "f",
      "-printf",
      "%n %s\\n",
    ],
    { stdout: "pipe", stderr: "ignore" }
  );
  const [out] = await Promise.all([
    new Response(find.stdout).text(),
    find.exited,
  ]);
  let own = 0;
  let shared = 0;
  for (const line of out.split("\n")) {
    const [links, bytes] = line.split(" ").map(Number);
    if (links === undefined || bytes === undefined || Number.isNaN(bytes)) {
      continue;
    }
    if (links > 1) {
      shared += bytes;
    } else {
      own += bytes;
    }
  }
  return { total, nodeModulesOwn: own, nodeModulesShared: shared };
};

const liveRows = rows.filter(
  (row) => live(row) && row.path.startsWith(worktrees)
);
interface Clone {
  id: string;
  idleHours: number | null;
  itemStates: string;
  itemsOpen: number;
  nodeModulesOwn: number;
  nodeModulesShared: number;
  path: string;
  present: boolean;
  state: string;
  total: number;
}

/** How a live clone's items stand: idle since its last one ended, or one still open. */
const itemWords = (clone: Clone): string => {
  if (clone.idleHours !== null) {
    return `, idle ${clone.idleHours.toFixed(1)}h`;
  }
  return clone.itemsOpen > 0 ? ", one open" : "";
};

const clones: Clone[] = [];
for (const row of liveRows) {
  // biome-ignore lint/performance/noAwaitInLoops: one clone at a time, find and du are the bulk
  const there = await stat(row.path).catch(() => undefined);
  const of = items.get(row.id);
  clones.push({
    id: row.id,
    state: row.state,
    path: row.path,
    itemsOpen: of?.open ?? 0,
    itemStates: of?.states ?? "",
    idleHours:
      of && of.open === 0 && of.last_end
        ? (Date.now() - of.last_end) / 3_600_000
        : null,
    ...(there && sizes
      ? await cloneSize(row.path)
      : { total: 0, nodeModulesOwn: 0, nodeModulesShared: 0 }),
    present: Boolean(there),
  });
}

const gb = (bytes: number): string => `${(bytes / 1e9).toFixed(2)} GB`;
const sum = (found: { bytes: number }[]): number =>
  found.reduce((total, one) => total + one.bytes, 0);

if (json) {
  console.log(JSON.stringify({ orphans, inFlight, clones }, null, 2));
} else {
  const classes = [...new Set(orphans.map((one) => one.class))];
  console.log(
    `ORPHANS ${orphans.length} (${gb(sum(orphans))}) in ${classes.length} class(es)`
  );
  for (const kind of classes) {
    const of = orphans.filter((one) => one.class === kind);
    console.log(`  ${kind}: ${of.length}, ${gb(sum(of))}`);
    for (const one of of) {
      console.log(
        `    ${basename(one.path)}  ${gb(one.bytes)}  ${one.ageHours.toFixed(1)}h old  ${one.why}`
      );
    }
  }
  console.log(`HOST CHECKOUTS ${inFlight.length} (${gb(sum(inFlight))})`);
  for (const one of inFlight) {
    console.log(
      `    ${basename(one.path)}  ${gb(one.bytes)}  ${one.ageHours.toFixed(1)}h old`
    );
  }
  for (const state of ["active", "held"]) {
    const of = clones.filter((clone) => clone.state === state);
    console.log(
      `LIVE ${state} ${of.length}: ${gb(of.reduce((total, clone) => total + clone.total, 0))} on disk, node_modules ${gb(of.reduce((total, clone) => total + clone.nodeModulesOwn, 0))} own + ${gb(of.reduce((total, clone) => total + clone.nodeModulesShared, 0))} linked`
    );
    for (const clone of of) {
      console.log(
        `    ${basename(clone.path)}  ${clone.present ? gb(clone.total) : "gone"}  node_modules own ${gb(clone.nodeModulesOwn)}, linked ${gb(clone.nodeModulesShared)}  items ${clone.itemStates || "none"}${itemWords(clone)}`
      );
    }
  }
  const spent = clones.filter((clone) => clone.idleHours !== null);
  for (const hours of [1, 6, 24]) {
    const idle = spent.filter((clone) => (clone.idleHours ?? 0) >= hours);
    console.log(
      `SPENT idle >= ${hours}h: ${idle.length} workspaces, ${gb(idle.reduce((total, clone) => total + clone.total, 0))}`
    );
  }
}
