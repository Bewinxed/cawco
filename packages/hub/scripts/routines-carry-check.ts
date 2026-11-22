/**
 * The routines-as-tasks migration (0464 and routine-carry.ts), run on a copy
 * of a hub's database and its project folders, with counts before and after:
 *
 *   bun packages/hub/scripts/routines-carry-check.ts --dir <scratch>
 *
 * `<scratch>` holds `cawco.db` (a `VACUUM INTO` copy of the hub's database,
 * at a schema before 0464), its `secrets.key` beside it, and `projects/` (a
 * copy of the hub's project folders): the hub in this process (hub-in-
 * process.ts) reads its folders beside its database, so it writes only
 * there. Nothing outside `<scratch>` is written.
 *
 * The hub it opens is inert: it serves nothing and dials no machine
 * (hub-in-process.ts), and every outbound call it would make (a model's,
 * a service's) is refused here before it leaves and counted: one is a
 * failure. Its start-up writes (a boot sweep, sends kept, expired relay
 * sessions dropped) land on the copy alone, as `migrations:check --db`'s do.
 *
 * It prints the counts it read before the hub opened the copy, after 0464
 * applied, and after the routines were carried over (one pass, then a
 * second that must file none), and a `FAIL:` line for each thing that did
 * not come through: a routine whose runs, routes or actions did not stay
 * with it, a filed routine with no task file that makes it one, a wait
 * still naming a filed routine. It exits 1 when any `FAIL:` was printed.
 */
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { hubInProcess } from "./hub-in-process";

const at = process.argv.indexOf("--dir");
const dir = at === -1 ? undefined : process.argv[at + 1];
if (!dir) {
  console.error("usage: routines-carry-check.ts --dir <scratch>");
  process.exit(2);
}
const scratch = resolve(dir);
const dbPath = join(scratch, "cawco.db");
const projectsDir = join(scratch, "projects");
const failures: string[] = [];
const fail = (line: string): void => {
  failures.push(line);
  console.log(`FAIL: ${line}`);
};

const ROUTINE_WAIT = /routine:([0-9a-f-]{36})/giu;
/** A file's front matter block. */
const FRONT = /^---\r?\n[\s\S]*?\r?\n---/u;

/** Every task file's front matter under the copied folders, by project. */
const taskFronts = (): { front: string; path: string; projectId: string }[] => {
  if (!existsSync(projectsDir)) {
    return [];
  }
  const found: { front: string; path: string; projectId: string }[] = [];
  for (const projectId of readdirSync(projectsDir)) {
    const tasks = join(projectsDir, projectId, "tasks");
    if (!existsSync(tasks)) {
      continue;
    }
    for (const name of readdirSync(tasks).filter((one) =>
      one.endsWith(".md")
    )) {
      const text = readFileSync(join(tasks, name), "utf8");
      const front = FRONT.exec(text)?.[0] ?? "";
      found.push({ projectId, path: `tasks/${name}`, front });
    }
  }
  return found;
};

const count = (database: Database, sql: string): number =>
  database.query<{ n: number }, []>(sql).get()?.n ?? 0;

const tables = (database: Database): Set<string> =>
  new Set(
    database
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'table'"
      )
      .all()
      .map((row) => row.name)
  );

// --- before ----------------------------------------------------------------

const before = new Database(dbPath, { readwrite: true });
const had = tables(before);
if (!had.has("routines")) {
  console.log(
    "This copy has no routines table: 0464 applied to it already, or it predates routines."
  );
}
const routinesBefore = had.has("routines")
  ? before
      .query<
        {
          id: string;
          project_id: string | null;
          stopped: string | null;
          target: string;
        },
        []
      >("SELECT id, project_id, target, stopped FROM routines")
      .all()
  : [];
const runsBefore = had.has("routine_runs")
  ? before
      .query<{ n: number; routine_id: string }, []>(
        "SELECT routine_id, count(*) AS n FROM routine_runs GROUP BY routine_id"
      )
      .all()
  : [];
const routesBefore = before
  .query<{ id: string; routine_id: string }, []>(
    "SELECT id, routine_id FROM event_routes"
  )
  .all();
const actionsBefore = count(
  before,
  "SELECT count(*) AS n FROM actions WHERE routine_id IS NOT NULL"
);
const stepWaitsBefore = count(
  before,
  "SELECT count(*) AS n FROM session_plan_steps WHERE waits_on LIKE 'routine:%'"
);
const witnessesBefore = count(
  before,
  "SELECT count(*) AS n FROM work_item_waits WHERE target LIKE 'routine:%'"
);
const setUp = new Set(
  before
    .query<{ id: string; template: string | null }, []>(
      "SELECT id, template FROM projects"
    )
    .all()
    .filter(
      (row) =>
        row.template !== null ||
        existsSync(join(projectsDir, row.id, "stages.md"))
    )
    .map((row) => row.id)
);
before.close();
const filesBefore = taskFronts().filter((file) =>
  new RegExp(ROUTINE_WAIT.source, "iu").test(file.front)
);

const byTarget = (rows: { target: string }[]): string => {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.target, (counts.get(row.target) ?? 0) + 1);
  }
  return [...counts].map(([target, n]) => `${target} ${n}`).join(", ");
};
console.log("== before");
console.log(
  `routines: ${routinesBefore.length} (${byTarget(routinesBefore)}); in no project ${routinesBefore.filter((row) => row.project_id === null).length}; in a project not set up ${routinesBefore.filter((row) => row.project_id !== null && !setUp.has(row.project_id)).length}; met ${routinesBefore.filter((row) => row.stopped === "met").length}`
);
console.log(
  `routine runs: ${runsBefore.reduce((sum, row) => sum + row.n, 0)}; event routes: ${routesBefore.length}; actions of a routine: ${actionsBefore}`
);
console.log(
  `waits on a routine: ${filesBefore.length} task file(s), ${stepWaitsBefore} plan step(s), ${witnessesBefore} attempt witness(es)`
);

// --- the hub opens the copy: 0464 applies ---------------------------------------

/** Every outbound call the hub tried, refused before it left. */
const outbound: string[] = [];
/** Where a call was going. */
const urlOf = (input: RequestInfo | URL): string => {
  if (input instanceof Request) {
    return input.url;
  }
  return input instanceof URL ? input.href : input;
};
const refused: typeof fetch = Object.assign(
  (input: RequestInfo | URL): Promise<Response> => {
    const url = urlOf(input);
    outbound.push(url);
    return Promise.reject(
      new Error(`routines-carry-check: no outbound call (${url})`)
    );
  },
  { preconnect: (_url: string | URL): void => undefined }
);
globalThis.fetch = refused;

const home = join(scratch, "home");
mkdirSync(home, { recursive: true });
const { db, hub, lifetime } = await hubInProcess(dbPath, home);
const raw = new Database(dbPath, { readonly: true });
console.log("== after 0464");
console.log(
  `task_triggers: ${count(raw, "SELECT count(*) AS n FROM task_triggers")} (carried, waiting to be filed: ${count(raw, "SELECT count(*) AS n FROM task_triggers WHERE task_id IS NULL")}); task_runs: ${count(raw, "SELECT count(*) AS n FROM task_runs")}; routines table left: ${tables(raw).has("routines")}`
);
for (const routine of routinesBefore) {
  const trigger = raw
    .query<{ project_id: string }, [string]>(
      "SELECT project_id FROM task_triggers WHERE id = ?"
    )
    .get(routine.id);
  if (!trigger) {
    fail(`routine ${routine.id} has no trigger`);
  }
  const runs = runsBefore.find((row) => row.routine_id === routine.id)?.n ?? 0;
  const kept = count(
    raw,
    `SELECT count(*) AS n FROM task_runs WHERE trigger_id = '${routine.id}'`
  );
  if (kept !== runs) {
    fail(`routine ${routine.id} had ${runs} runs, its trigger keeps ${kept}`);
  }
}
for (const route of routesBefore) {
  const kept = raw
    .query<{ routine_id: string }, [string]>(
      "SELECT routine_id FROM event_routes WHERE id = ?"
    )
    .get(route.id);
  if (kept?.routine_id !== route.routine_id) {
    fail(`event route ${route.id} no longer names routine ${route.routine_id}`);
  }
}
const actionsAfter = count(
  raw,
  "SELECT count(*) AS n FROM actions WHERE routine_id IS NOT NULL"
);
if (actionsAfter !== actionsBefore) {
  fail(`actions of a routine: ${actionsBefore} before, ${actionsAfter} after`);
}

// --- the carry -----------------------------------------------------------------

const first = await hub.routinesCarried.carry();
console.log("== carried over");
console.log(
  `first pass: ${first.filed} filed, ${first.waiting} waiting, ${first.waitsRewritten} task file(s)' waits rewritten`
);
const second = await hub.routinesCarried.carry();
console.log(
  `second pass: ${second.filed} filed, ${second.waiting} waiting, ${second.waitsRewritten} rewritten`
);
if (second.filed !== 0 || second.waitsRewritten !== 0) {
  fail("a second pass filed or rewrote again");
}
const triggers = raw
  .query<
    {
      id: string;
      project_id: string;
      target: string | null;
      task_id: string | null;
    },
    []
  >("SELECT id, project_id, task_id, target FROM task_triggers")
  .all();
const fronts = taskFronts();
const filed = triggers.filter((row) => row.task_id !== null);
console.log(
  `task_triggers: ${triggers.length}, filed ${filed.length}, still carried ${triggers.length - filed.length}`
);
for (const row of filed) {
  const file = fronts.find(
    (one) =>
      one.projectId === row.project_id &&
      one.path.startsWith(`tasks/${row.task_id}-`)
  );
  if (!file) {
    fail(
      `routine ${row.id} names ${row.task_id}, which has no file in ${row.project_id}`
    );
  } else if (!/^target:/mu.test(file.front)) {
    fail(`${row.project_id}/${file.path} has no target: line`);
  }
}
const filedIds = new Set(filed.map((row) => row.id));
for (const file of fronts) {
  for (const found of file.front.matchAll(ROUTINE_WAIT)) {
    if (filedIds.has(found[1].toLowerCase())) {
      fail(`${file.projectId}/${file.path} still waits on routine:${found[1]}`);
    }
  }
}
const stepWaitsAfter = count(
  raw,
  "SELECT count(*) AS n FROM session_plan_steps WHERE waits_on LIKE 'routine:%'"
);
const witnessesAfter = count(
  raw,
  "SELECT count(*) AS n FROM work_item_waits WHERE target LIKE 'routine:%'"
);
console.log(
  `waits still naming a routine: ${fronts.filter((file) => new RegExp(ROUTINE_WAIT.source, "iu").test(file.front)).length} task file(s), ${stepWaitsAfter} plan step(s), ${witnessesAfter} witness(es)`
);
console.log(
  `Fleet project: ${db.project("00000000-0000-4000-8000-00000000f1ee")?.name ?? "missing"}`
);
if (outbound.length > 0) {
  fail(
    `the hub tried ${outbound.length} outbound call(s): ${[...new Set(outbound)].join(", ")}`
  );
}
raw.close();
lifetime.close();
console.log(failures.length === 0 ? "ok" : `${failures.length} failure(s)`);
process.exit(failures.length === 0 ? 0 : 1);
