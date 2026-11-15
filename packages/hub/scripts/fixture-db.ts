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
 * delegates), sends, tasks, workspaces and work items. Every value
 * is made up here, so nothing in it needs sanitizing: no person's words, no
 * secret, no path off a real machine.
 *
 * With `--at`, this file and hub-in-process.ts run inside a worktree of that
 * commit, against its hub; the seed below must fit that commit's Db.
 *
 * With `--lists`, the same fleet and the lists fixture's sessions, types,
 * budgets, at-limit policies, landings, gate passes and outputs besides
 * ({@link seedLists}, {@link seedBudgets}, {@link seedAtLimit},
 * {@link seedLanded}, {@link seedGatePasses}, {@link seedOutputs}), written to
 * fixtures/lists-db.sqlite.gz: the migration check runs over both.
 */
import { Database } from "bun:sqlite";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { HARNESSES } from "@cawco/core/harness/kinds";
import { machinePath } from "@cawco/core/machine-path";
import { HOUR_MS } from "@cawco/core/time";
import { hubInProcess } from "./hub-in-process";
import { newestNightly } from "./shipped";

/** A fixture folder on a fixture machine, made as every machine path is. */
const fixturePath = (raw: string) => machinePath("/home/dev", raw, "fixture");

const HUB = resolve(import.meta.dir, "..");
export const FIXTURE = join(HUB, "fixtures", "realistic-db.sqlite.gz");
/**
 * `--lists`: the same fleet with every shape a session's or delegate type's
 * lists took before migration 0397 (what it may start, its starting set, a
 * trashed type, a continued work item), every shape a budget took before
 * migration 0398, every shape a provider's at-limit policy took before
 * migration 0399, every shape a work item's landing took before migration
 * 0400, every shape a work item's gate passes took before migration 0401,
 * and every shape a work item's and a task's outputs took before migration
 * 0404, written here.
 */
export const LISTS_FIXTURE = join(HUB, "fixtures", "lists-db.sqlite.gz");
const LISTS = "--lists";

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
      origin: parent ? "delegate" : "person",
      projectId,
      ...(parent ? { parentInstanceId: parent.id, mayStart: [] } : {}),
      startingSet: null,
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

/** Each project's tasks. */
function seedTasks(db: HubDb, projects: string[]): void {
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
        outputs: [],
        waitsOn: t > 2 ? [`tsk-${t}`] : [],
        partOf: t > 10 ? "tsk-1" : null,
        foundIn: null,
        duplicateOf: null,
        rank: `a${t}`,
        labels: t % 4 === 0 ? ["release"] : [],
        fields: {},
        links: [],
        todosDone: t % 3,
        todosTotal: 3,
        problem: null,
        budgetUnread: null,
        listsUnread: null,
        hash: Bun.hash(`${projectId}-${t}`).toString(16),
        updatedAt: new Date(Date.UTC(2026, 9, 2) + t * HOUR_MS),
      }))
    );
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

/** What a delegate may start, as `delegate` calls and their types say it. */
const DELEGATE_MAY_START = [[], ["browser"], ["browser", "advisor"], ["any"]];

/** Starting sets a session's type or project gave it. */
const STARTING_SETS = [
  { skills: ["code-review", "frontend-design"], servers: ["github"] },
  { skills: [], servers: [] },
];

/** A session of the lists fixture's, opened as the hub's own start opens one. */
const openListed = (
  db: HubDb,
  parent: Seeded,
  fields: Partial<Parameters<HubDb["openInstance"]>[0]>
): Seeded => {
  const instanceId = crypto.randomUUID();
  db.openInstance({
    id: instanceId,
    machineId: parent.machineId,
    cwd: fixturePath(`/home/dev/src/${parent.projectId}`),
    sessionId: crypto.randomUUID(),
    harness: pick(HARNESSES),
    origin: "delegate",
    projectId: parent.projectId,
    parentInstanceId: parent.id,
    title: pick(WORDS),
    kind: "mainline",
    permissionMode: "bypassPermissions",
    model: "model-a",
    startingSet: null,
    ...fields,
  });
  return {
    id: instanceId,
    machineId: parent.machineId,
    projectId: parent.projectId,
  };
};

/**
 * Every shape the lists of migration 0397 take, on sessions under `sessions`:
 * each list a delegate is given, a work item's session that named none,
 * summarisers, starting sets, continued work items whose later sessions
 * named none (each continuation's `continued_into`, written after the hub
 * closes, {@link seedByHand}), and work items whose later session names
 * neither a list nor the session it went on from. Answers each
 * continuation's pair of ids.
 */
function seedLists(db: HubDb, sessions: Seeded[]): [string, string][] {
  const continued: [string, string][] = [];
  for (let s = 0; s < 60; s += 1) {
    const parent = pick(sessions);
    openListed(db, parent, {
      mayStart: DELEGATE_MAY_START[s % DELEGATE_MAY_START.length],
      workItemId: id("wi", s),
      ...(s % 5 === 0 ? { startingSet: pick(STARTING_SETS) } : {}),
    });
  }
  for (let s = 0; s < 6; s += 1) {
    const parent = pick(sessions);
    // A work item's session that named no list, nothing before it.
    openListed(db, parent, { workItemId: id("wi-alone", s) });
    // A work item's later session that named no list and no link to the
    // one before it (an old harness-switch continuation): its work item's
    // first session has one.
    const unlinked = id("wi-unlinked", s);
    openListed(db, parent, { mayStart: ["browser"], workItemId: unlinked });
    openListed(db, parent, { workItemId: unlinked });
    // A continuation's summariser: no parent, no list.
    openListed(db, parent, { kind: "summariser", origin: "check" });
    // A work item continued twice; its later sessions named no list. Every
    // third, the first two sessions' lists differ.
    const item = id("wi-continued", s);
    const first = openListed(db, parent, {
      mayStart: ["browser"],
      workItemId: item,
    });
    const second = openListed(
      db,
      parent,
      s % 3 === 0
        ? { mayStart: ["advisor"], workItemId: item }
        : { workItemId: item }
    );
    const third = openListed(db, parent, { workItemId: item });
    continued.push([first.id, second.id], [second.id, third.id]);
  }
  return continued;
}

/** The fleet's own delegate types beside the seeded defaults, each list of a type in use; one more in the trash. */
function seedDelegateTypes(db: HubDb): void {
  db.delegateTypes.put({
    name: "browser",
    description:
      "Drives the person's browser through a flow and reports what it saw.",
    harness: "claude",
    model: "model-a",
    effort: "medium",
    denyTools: ["Write", "Edit"],
    skills: ["browser-use"],
    startingSet: { skills: ["browser-use"], servers: ["chrome-devtools"] },
  });
  db.delegateTypes.put({
    name: "coordinator",
    description:
      "Splits a large change into delegates and lands them in order.",
    harness: "claude",
    model: "model-a",
    mayStart: ["any"],
    connections: ["github-dev"],
  });
  db.delegateTypes.put({
    name: "tester",
    description:
      "Checks a change in the browser and may hand the clicking to browser.",
    harness: "opencode",
    model: "model-a",
    mayStart: ["browser", "advisor"],
    startingSet: { skills: [], servers: [] },
  });
  db.delegateTypes.put({
    name: "reviewer",
    description: "Reads a diff and answers with ranked findings.",
    harness: "claude",
    model: "model-a",
    mayStart: ["advisor"],
    skills: ["code-review"],
    denyTools: ["Write"],
    connections: ["github-dev"],
    startingSet: { skills: ["code-review"], servers: [] },
  });
  db.trash.put({ kind: "delegateType", key: "reviewer" }, Date.now());
}

/**
 * What the hub's own code writes after it closes, and values no code of
 * the hub writes but a hand edit of the database could: each continuation's
 * `continued_into`; a session's list and set and a delegate type's denied
 * tools that are not the JSON their column held; a trash entry for a type
 * that is not one row. Migration 0397 places each.
 */
function seedByHand(dbPath: string, continued: [string, string][]): void {
  const sqlite = new Database(dbPath);
  for (const [from, to] of continued) {
    sqlite.run("UPDATE instances SET continued_into = ? WHERE id = ?", [
      to,
      from,
    ]);
  }
  sqlite.run(
    "UPDATE instances SET may_start = 'browser, advisor' WHERE id = (SELECT id FROM instances WHERE work_item_id IS NOT NULL ORDER BY id LIMIT 1)"
  );
  sqlite.run(
    `UPDATE instances SET starting_set = '{"skills":"all"}' WHERE id = (SELECT id FROM instances ORDER BY id DESC LIMIT 1)`
  );
  sqlite.run(
    "UPDATE delegate_types SET deny_tools = 'Write Edit' WHERE name = 'tester'"
  );
  sqlite.run(
    "INSERT INTO config_trash (kind, key, rows, deleted_at) VALUES ('delegateType', 'half', '[]', ?)",
    [Date.now()]
  );
  sqlite.close();
}

/** Far past any run: a seeded routine never fires in the hub the migration check starts. */
const NEVER = Date.UTC(2100, 0, 1);

/**
 * Every shape migration 0398 reads a budget in, as the hub's writers stored
 * it (JSON text, `null` for none) and as a hand edit could: each limit set
 * alone and together, a budget unset at each level (null, JSON `null`,
 * `{}`), a work item that took its project's limit beside its own and one
 * in the same project made before the project had one, at each level a
 * budget that does not read, one of them partly, and a task whose file's
 * budget line did not read.
 */
function seedBudgets(dbPath: string): void {
  const sqlite = new Database(dbPath);
  const items = sqlite
    .query<{ id: string; project: string }, []>(
      "SELECT id, project_id AS project FROM work_items ORDER BY rowid"
    )
    .all();
  const [first] = items;
  if (!first) {
    throw new Error("The fixture has no work item to give a budget.");
  }
  const projects = sqlite
    .query<{ id: string }, [string]>(
      "SELECT id FROM projects WHERE id <> ? ORDER BY rowid"
    )
    .all(first.project)
    .map((row) => row.id);
  const budget = (table: string, key: string, value: string): void => {
    sqlite.run(`UPDATE ${table} SET budget = ? WHERE id = ?`, [value, key]);
  };
  // The first item's project: its items take its dollars.
  budget("projects", first.project, '{"usd":5}');
  budget("work_items", first.id, '{"usd":5,"turns":40}');
  const projectBudgets = [
    '{"turns":40}',
    '{"minutes":30}',
    '{"usd":2.5,"turns":20,"minutes":45}',
    "{}",
    "null",
    '{"usd":"5"}',
  ];
  for (const [n, value] of projectBudgets.entries()) {
    const project = projects[n];
    if (project) {
      budget("projects", project, value);
    }
  }
  const others = items.filter((item) => item.project !== first.project);
  const itemBudgets = [
    '{"usd":1.25}',
    '{"turns":12}',
    '{"minutes":90}',
    '{"usd":3,"turns":30,"minutes":60}',
    "null",
    "{}",
    '{"dollars":3}',
    '{"usd":2,"turns":-1}',
    "usd 5",
  ];
  for (const [n, value] of itemBudgets.entries()) {
    const item = others[n];
    if (item) {
      budget("work_items", item.id, value);
    }
  }
  const routine = (name: string, value: string | null): void => {
    sqlite.run(
      "INSERT INTO routines (id, project_id, name, cron, time_zone, target, prompt, lands, budget, enabled, created_by, keep, next_slot, created_at) VALUES (?, ?, ?, '0 9 * * 1', 'UTC', 'delegate', ?, 'none', ?, 1, 'owner', 1, ?, ?)",
      [
        crypto.randomUUID(),
        first.project,
        name,
        `Weekly: ${name.toLowerCase()}.`,
        value,
        NEVER,
        Date.UTC(2026, 9, 3),
      ]
    );
  };
  // A task file whose budget line did not read, as the index held it.
  sqlite.run(
    "UPDATE project_tasks SET problem = ? WHERE rowid = (SELECT rowid FROM project_tasks WHERE project_id = ? ORDER BY number LIMIT 1)",
    [
      "budget: “usd: lots” is not one of usd (dollars), turns or minutes (whole numbers) with a value above 0.",
      first.project,
    ]
  );
  routine("Check the release proof", '{"usd":3,"turns":30,"minutes":60}');
  routine("Tidy the preview pane", null);
  routine("Answer the queued asks", "{}");
  routine("Move tasks to the new stage", "not json");
  routine("Check the migration", '{"usd":1,"minutes":0}');
  sqlite.close();
}

/**
 * Every shape migration 0399 reads a provider's at-limit policy in, as the
 * hub's one writer stored it (the whole policy as JSON, a key the hub no
 * longer reads kept) and as a hand edit could: a provider never saved (an
 * account and no row), the shape every live row holds, each field set away
 * from its default, a room left from before `fileRoom` (`fileAtPct` 0,
 * filing off), a policy that is not JSON, and one that reads in part.
 */
function seedAtLimit(dbPath: string): void {
  const sqlite = new Database(dbPath);
  sqlite.run(
    "INSERT INTO accounts (id, provider, kind, label, hue, \"order\", created_at) VALUES (?, 'deepseek', 'api_key', 'DeepSeek key', 'amber', 0, ?)",
    [crypto.randomUUID(), Date.UTC(2026, 9, 3)]
  );
  const routing = (provider: string, atLimit: string): void => {
    sqlite.run(
      "INSERT INTO account_routing (provider, yours_strategy, delegates_strategy, at_limit) VALUES (?, 'fill-first', 'fill-first', ?)",
      [provider, atLimit]
    );
  };
  routing(
    "anthropic",
    '{"move":true,"waitMinutes":15,"moveWholeUnderK":200,"delegateWork":"move","staleAfterHours":24,"compaction":{"beforeMove":"native","atLimit":"summary","summarizer":{"harness":"claude","model":"claude-sonnet-5-5"},"fileRoom":30000}}'
  );
  routing(
    "openai",
    '{"move":false,"waitMinutes":0,"moveWholeUnderK":50,"staleAfterHours":6,"compaction":{"beforeMove":"whole","atLimit":"native","fileRoom":0,"summarizer":{"harness":"opencode","model":"openai/gpt-5.5"}}}'
  );
  routing(
    "openrouter",
    '{"move":true,"waitMinutes":30,"moveWholeUnderK":120,"staleAfterHours":48,"compaction":{"beforeMove":"summary","atLimit":"summary","fileAtPct":0,"summarizer":{"harness":"pi","model":"anthropic/claude-haiku-5"}}}'
  );
  routing("zai", "move at the limit, wait 15");
  routing(
    "moonshot",
    '{"move":true,"waitMinutes":15,"moveWholeUnderK":200,"staleAfterHours":"a day","compaction":{"beforeMove":"native","atLimit":"summary","fileAtPct":85,"summarizer":{"harness":"claude","model":""}}}'
  );
  sqlite.close();
}

/** Every work item's id, oldest first. */
const workItemIds = (sqlite: Database): string[] =>
  sqlite
    .query<{ id: string }, []>("SELECT id FROM work_items ORDER BY rowid")
    .all()
    .map((row) => row.id);

/** A commit's or a tree's name, made up: the same for the same words. */
const gitName = (words: string): string =>
  new Bun.CryptoHasher("sha1").update(words).digest("hex");

/**
 * Every shape migration 0400 reads a work item's landing in, as the hub's
 * one writer stored it (landing-run.ts `landOnBase`, `landOnBranch`) and as
 * a hand edit could: an item that landed nothing (null), a landing on the
 * base with its gate and one from before gates were kept, a branch push
 * with its time and one from before times were kept, a landing with all
 * four fields, a key nothing reads, two items whose gates passed on one
 * tree (one command twice), a landing that is not JSON, JSON `null`, an
 * array, and three that read in part: a gate with no commands, no `onto`
 * and an `at` that is words, no `sha`.
 */
function seedLanded(dbPath: string): void {
  const sqlite = new Database(dbPath);
  const items = workItemIds(sqlite);
  const tree = gitName("tree of the release");
  const gate = (passed: string[]) => ({ tree, passed });
  const at = Date.UTC(2026, 9, 21, 14, 5);
  const landings: [lands: string, landed: string | null][] = [
    ["main", null],
    [
      "main",
      JSON.stringify({
        sha: gitName("landed 1"),
        onto: gitName("main 1"),
        gate: gate(["bun run check --all", "bun run test:binary"]),
      }),
    ],
    [
      "main",
      JSON.stringify({ sha: gitName("landed 2"), onto: gitName("main 2") }),
    ],
    ["branch", JSON.stringify({ sha: gitName("pushed 3"), onto: null, at })],
    ["pr", JSON.stringify({ sha: gitName("pushed 4"), onto: null })],
    [
      "main",
      JSON.stringify({
        sha: gitName("landed 5"),
        onto: gitName("main 5"),
        at,
        gate: {
          tree: gitName("tree 5"),
          passed: ["bun run check --all"],
        },
      }),
    ],
    [
      "branch",
      JSON.stringify({
        sha: gitName("pushed 6"),
        onto: null,
        at: at + HOUR_MS,
        pr: "https://github.com/acme/atlas/pull/412",
      }),
    ],
    [
      "main",
      JSON.stringify({
        sha: gitName("landed 7"),
        onto: gitName("main 7"),
        gate: gate([
          "bun run check --all",
          "bun run check --all",
          "swift build",
        ]),
      }),
    ],
    ["main", "landed abc123456 on main"],
    ["main", "null"],
    ["branch", JSON.stringify([gitName("pushed 10")])],
    [
      "main",
      JSON.stringify({
        sha: gitName("landed 11"),
        onto: gitName("main 11"),
        gate: { tree: gitName("tree 11") },
      }),
    ],
    ["branch", JSON.stringify({ sha: gitName("pushed 12"), at: "yesterday" })],
    ["main", JSON.stringify({ onto: gitName("main 13") })],
  ];
  for (const [n, [lands, landed]] of landings.entries()) {
    const item = items[n];
    if (!item) {
      throw new Error(`The fixture has no work item ${n} to land.`);
    }
    sqlite.run(
      "UPDATE work_items SET state = 'done', lands = ?, landed = ?, ended_at = ? WHERE id = ?",
      [lands, landed, at + n * HOUR_MS, item]
    );
  }
  sqlite.close();
}

/** Where gate passes are seeded: past the items {@link seedLanded} lands. */
const FIRST_GATED = 14;

/**
 * Every shape migration 0401 reads a work item's gate passes in, as the
 * hub's writers stored them (gate.ts `keepPass` adds a pass under its key,
 * `dropPasses` leaves a key's list empty, work-items.ts `finish` writes
 * null) and as a hand edit could: no passes (null, an empty record, a key
 * whose passes were let go), passes on one tree, passes on two trees and
 * on a step's input paths, a command that passed in two stages and one pass
 * kept twice, a pass with a key nothing reads; a record that is not JSON,
 * JSON `null`, an array; and two that read in part: a pass with no stage
 * beside one that reads, and a key whose passes are words.
 */
function seedGatePasses(dbPath: string): void {
  const sqlite = new Database(dbPath);
  const items = workItemIds(sqlite).slice(FIRST_GATED);
  const finished = gitName("tree at finish_item");
  const rebased = gitName("tree on top of main");
  const apple = `inputs apps/apple=${gitName("apps/apple tree")}`;
  const check = "bun run check --all";
  const binary = "bun run test:binary";
  const atFinish = "at finish_item";
  const onMain = "while gating on top of main";
  const inTurn = "in its turn to land on main";
  const pass = (command: string, stage: string) => ({ command, stage });
  const records: (string | null)[] = [
    null,
    JSON.stringify({}),
    JSON.stringify({ [finished]: [] }),
    JSON.stringify({
      [finished]: [pass(check, atFinish), pass(binary, atFinish)],
    }),
    JSON.stringify({
      [finished]: [pass(check, atFinish)],
      [rebased]: [pass(check, onMain), pass(binary, onMain)],
      [apple]: [pass("swift build", atFinish)],
    }),
    JSON.stringify({
      [rebased]: [
        pass(check, onMain),
        pass(check, inTurn),
        pass(check, onMain),
      ],
    }),
    JSON.stringify({
      [finished]: [{ command: check, stage: atFinish, ms: 412_000 }],
    }),
    `passed ${check} on ${finished}`,
    "null",
    JSON.stringify([pass(check, atFinish)]),
    JSON.stringify({
      [finished]: [pass(check, atFinish), { command: binary }],
    }),
    JSON.stringify({
      [finished]: [pass(check, atFinish)],
      [rebased]: check,
    }),
  ];
  for (const [n, record] of records.entries()) {
    const item = items[n];
    if (!item) {
      throw new Error(
        `The fixture has no work item ${FIRST_GATED + n} to keep passes on.`
      );
    }
    sqlite.run("UPDATE work_items SET gate_passes = ? WHERE id = ?", [
      record,
      item,
    ]);
  }
  sqlite.close();
}

/** Where outputs are seeded: past the items {@link seedGatePasses} keeps passes on. */
const FIRST_OUTPUTS = FIRST_GATED + 12;

/**
 * Every shape migration 0404 reads a work item's and a task's outputs in,
 * as the hub's writers stored them (work-items.ts `placing` writes null for
 * none and a list of paths, each once; tasks.ts `indexRow` writes its
 * file's list, `[]` for none) and as a hand edit could: none (null, `[]`),
 * one path, several, a path kept twice; a list that is not JSON, JSON
 * `null`, an object; one that reads in part (a number and a null among
 * paths); and tasks whose file's outputs, owns, checks, accounts, waits_on
 * or labels line was left open, as the index held them (labels' is shown
 * and read on, so its row is not read again).
 */
function seedOutputs(dbPath: string): void {
  const sqlite = new Database(dbPath);
  const items = workItemIds(sqlite).slice(FIRST_OUTPUTS);
  const lists: (string | null)[] = [
    null,
    "[]",
    JSON.stringify(["report.md"]),
    JSON.stringify(["report.md", "docs/notes", "assets/hero.png"]),
    JSON.stringify(["report.md", "docs/notes", "report.md"]),
    "report.md, docs/notes",
    "null",
    JSON.stringify({ path: "report.md" }),
    JSON.stringify(["report.md", 42, null, "docs/notes"]),
  ];
  for (const [n, list] of lists.entries()) {
    const item = items[n];
    if (!item) {
      throw new Error(
        `The fixture has no work item ${FIRST_OUTPUTS + n} to give outputs.`
      );
    }
    sqlite.run("UPDATE work_items SET outputs = ? WHERE id = ?", [list, item]);
  }
  const [, project] = sqlite
    .query<{ id: string }, []>("SELECT id FROM projects ORDER BY rowid")
    .all()
    .map((row) => row.id);
  if (!project) {
    throw new Error("The fixture has no second project to give task outputs.");
  }
  const taskLists: [number, string, string | null][] = [
    [1, JSON.stringify(["post.md"]), null],
    [
      2,
      JSON.stringify(["post.md", "assets/hero.png", "notes/outline.md"]),
      null,
    ],
    [3, JSON.stringify(["post.md", "post.md"]), null],
    [4, "post.md", null],
    [5, JSON.stringify(["post.md", 7]), null],
    [6, "[]", "outputs: is not a list like [a, b]."],
    [7, "[]", "owns: is not a list like [a, b]."],
    [8, "[]", "checks: is not a list like [a, b]."],
    [9, "[]", "accounts: is not a list like [a, b]."],
    [10, "[]", 'waits_on: is not a list like [138, "<artifact id>#<card>"].'],
    [11, "[]", "labels: is not a list like [a, b]."],
  ];
  for (const [number, list, problem] of taskLists) {
    sqlite.run(
      "UPDATE project_tasks SET outputs = ?, problem = ? WHERE project_id = ? AND number = ?",
      [list, problem, project, number]
    );
  }
  sqlite.close();
}

async function seed(
  dbPath: string,
  home: string,
  withLists: boolean
): Promise<void> {
  const { db, lifetime } = await hubInProcess(dbPath, home);
  const projects = seedProjects(db);
  const sessions = seedSessions(db, projects);
  seedTasks(db, projects);
  seedWorkspaces(db, sessions);
  const continued = withLists ? seedLists(db, sessions) : [];
  if (withLists) {
    seedDelegateTypes(db);
  }
  lifetime.close();
  if (withLists) {
    seedByHand(dbPath, continued);
    seedBudgets(dbPath);
    seedAtLimit(dbPath);
    seedLanded(dbPath);
    seedGatePasses(dbPath);
    seedOutputs(dbPath);
  }
}

const out = flag("--seed");
if (out) {
  const scratch = mkdtempSync(join(tmpdir(), "cawco-fixture-db-"));
  try {
    const dbPath = join(scratch, "hub.db");
    mkdirSync(join(scratch, "home"));
    await seed(dbPath, join(scratch, "home"), process.argv.includes(LISTS));
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

// The made database: seeded at `--at` (the newest published nightly when
// not given), written to FIXTURE, or with `--lists` to LISTS_FIXTURE.
const lists = process.argv.includes(LISTS);
const written = lists ? LISTS_FIXTURE : FIXTURE;
const started = performance.now();
const run = (command: string[], cwd: string): void => {
  const child = Bun.spawnSync(command, {
    env: process.env,
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
    [
      process.execPath,
      "packages/hub/scripts/fixture-db.ts",
      "--seed",
      written,
      ...(lists ? [LISTS] : []),
    ],
    tree
  );
} finally {
  run(["git", "worktree", "remove", "--force", tree], HUB);
}
console.log(
  `fixture-db: seeded at ${at}, written to ${written} in ${((performance.now() - started) / 1000).toFixed(1)} s`
);
