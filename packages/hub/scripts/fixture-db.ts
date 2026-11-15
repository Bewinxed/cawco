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
 * budgets, at-limit policies, landings, gate passes, outputs, queued
 * starts, MCP servers' platforms, the fleet's routes, a tracker's
 * baselines, asks and preview passes, and the values migrations 0410 to
 * 0413 lift into columns besides ({@link seedLists},
 * {@link seedBudgets}, {@link seedAtLimit}, {@link seedLanded},
 * {@link seedGatePasses}, {@link seedOutputs}, {@link seedQueued},
 * {@link seedMcpServers}, {@link seedPlatformsRoutes}, {@link seedTracker},
 * {@link seedTrackerBaselines}, {@link seedAsks}, {@link seedAsksByHand},
 * {@link seedPassScopes}, {@link seedLiftedColumns}), written to
 * fixtures/lists-db.sqlite.gz: the migration check runs over both.
 */
import { Database } from "bun:sqlite";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { HARNESSES } from "@cawco/core/harness/kinds";
import { machinePath } from "@cawco/core/machine-path";
import { HOUR_MS, MINUTE_MS } from "@cawco/core/time";
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
 * every shape a work item's and a task's outputs took before migration
 * 0404, every shape a queued start's kept call took before migration
 * 0405, every shape an MCP server's platforms and the fleet's routes
 * took before migration 0406, every shape a tracker link's baseline took
 * before migration 0407, every shape an ask's record took before migration
 * 0408, every shape a preview pass's scope took before migration 0409, and
 * every shape a limit line, a workspace's source, a work item's block and a
 * send's origin took before migrations 0410 to 0413, written here.
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
 * paths); tasks whose file's outputs, owns, checks, accounts, waits_on
 * or labels line was left open, and one whose waits_on names no target, as
 * the index held them (labels' is shown and read on, so its row is not read
 * again).
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
    [
      12,
      "[]",
      "waits_on: “the release card” is not a task, card, pin, pull request, Actions run or session.",
    ],
  ];
  for (const [number, list, problem] of taskLists) {
    sqlite.run(
      "UPDATE project_tasks SET outputs = ?, problem = ? WHERE project_id = ? AND number = ?",
      [list, problem, project, number]
    );
  }
  sqlite.close();
}

/**
 * Every shape migration 0405 reads a queued start's kept call in, as the
 * hub's writers stored it (work-items.ts `delegate` through
 * `queueWorkItem`, its owned globs as rows; dispatch.ts `queuedForOwns` from
 * an `AttemptAsk`, null for a hook's start) and as a hand edit could: a
 * call that names every field and one that names only what it must, which
 * read; a call that is not JSON and an ask that is a list, which do not;
 * and one of each that does not read in one of the fields a start is
 * stopped by: a budget whose key is not a limit or whose limit is words,
 * what it may start or its outputs given as one name, and owned globs that
 * are no list or kept in a delegate's call, where they are rows.
 */
function seedQueued(dbPath: string): void {
  const sqlite = new Database(dbPath);
  const sessions = sqlite
    .query<{ id: string }, []>(
      "SELECT id FROM instances ORDER BY rowid LIMIT 2"
    )
    .all()
    .map((row) => row.id);
  const projects = sqlite
    .query<{ id: string }, []>("SELECT id FROM projects ORDER BY rowid LIMIT 1")
    .all()
    .map((row) => row.id);
  const [parent, other] = sessions;
  const [project] = projects;
  if (!(parent && other && project)) {
    throw new Error("The fixture has no sessions or project to queue under.");
  }
  const at = Date.UTC(2026, 10, 14, 9);
  const whole = {
    prompt: "Make the board's scroll hold after a reconnect.",
    title: "Hold the board's scroll",
    type: "high",
    harness: "claude",
    model: "claude-opus-5-5",
    account: "work",
    lands: "branch",
    budget: { usd: 4.5, turns: 60, minutes: 90 },
    mayStart: ["browser", "advisor"],
    outputs: ["docs/scroll-hold.md"],
    skills: ["svelte-house-rules"],
    inputs: ["/home/dev/notes/scroll.md", { report: "a1b2c3d4" }],
    group: "board",
    fork: false,
  };
  const calls: [string, string, string[]][] = [
    [
      "Hold the board's scroll",
      JSON.stringify({
        ...whole,
        parentInstanceId: parent,
        cwd: "/home/dev/atlas",
        machineId: "obsidian",
        clean: false,
        host: false,
      }),
      ["apps/dashboard/src/board/**"],
    ],
    [
      "Tidy the preview pane",
      JSON.stringify({
        parentInstanceId: other,
        prompt: "Tidy the preview pane's header.",
        title: "Tidy the preview pane",
      }),
      [],
    ],
    ["Answer the queued ask", "delegate: answer the queued ask", []],
    [
      "Fix the rail's title",
      JSON.stringify({
        parentInstanceId: other,
        prompt: "The rail shows the wrong title.",
        title: "Fix the rail's title",
        budget: { dollars: 5 },
      }),
      ["apps/dashboard/src/rail/**"],
    ],
    [
      "Move tasks to the new stage",
      JSON.stringify({
        parentInstanceId: parent,
        prompt: "Move the tasks to the new stage.",
        title: "Move tasks to the new stage",
        mayStart: "any",
      }),
      [],
    ],
    [
      "Make the release proof faster",
      JSON.stringify({
        parentInstanceId: other,
        prompt: "Make the release proof faster.",
        title: "Make the release proof faster",
        outputs: "docs/release-proof.md",
      }),
      ["scripts/release/**"],
    ],
    [
      "Check the migration on a real database",
      JSON.stringify({
        parentInstanceId: parent,
        prompt: "Check the migration on a copy of a real database.",
        title: "Check the migration on a real database",
        owns: ["packages/hub/drizzle/**"],
      }),
      [],
    ],
  ];
  for (const [n, [title, request, globs]] of calls.entries()) {
    const queued = id("queued", n);
    sqlite.run(
      "INSERT INTO queued_work_items (id, parent_instance_id, request, project_id, task_id, queued_instance_id, title, queued_at) VALUES (?, ?, ?, NULL, NULL, ?, ?, ?)",
      [
        queued,
        n % 2 === 0 ? parent : other,
        request,
        id("session", n),
        title,
        at + n * 60_000,
      ]
    );
    for (const glob of globs) {
      sqlite.run(
        "INSERT INTO queued_work_item_globs (queued_id, glob) VALUES (?, ?)",
        [queued, glob]
      );
    }
  }
  const asks: (string | null)[] = [
    JSON.stringify({ ...whole, owns: ["apps/dashboard/src/board/**"] }),
    null,
    JSON.stringify({
      prompt: "Write the canvas's pin notes.",
      title: "Write the canvas's pin notes",
    }),
    JSON.stringify(["Fix the board's scroll"]),
    JSON.stringify({
      prompt: "Fix it.",
      title: "Fix it",
      budget: { usd: "five" },
    }),
    JSON.stringify({ prompt: "Fix it.", title: "Fix it", mayStart: [1] }),
    JSON.stringify({
      prompt: "Fix it.",
      title: "Fix it",
      outputs: ["docs/post.md", 3],
    }),
    JSON.stringify({
      prompt: "Fix it.",
      title: "Fix it",
      owns: "src/theme/**",
    }),
  ];
  for (const [n, asked] of asks.entries()) {
    sqlite.run(
      "INSERT INTO queued_task_starts (project_id, task_id, stage, parent_instance_id, queued_at, why, retry, origin, asked) VALUES (?, ?, 'doing', ?, ?, ?, 0, ?, ?)",
      [
        project,
        `tsk-${900 + n}`,
        asked === null ? null : parent,
        at + n * 60_000,
        asked === null ? "cap" : "owns",
        asked === null ? "event" : "you",
        asked,
      ]
    );
  }
  sqlite.close();
}

/** The configs the fixture's MCP servers run: one started on the machine, one reached over HTTP. */
const STDIO_SERVER = {
  command: "npx",
  args: ["-y", "@example/sqlite-mcp", "--read-only"],
};
const HTTP_SERVER = {
  type: "http" as const,
  url: "https://mcp.example.invalid/mcp",
};

/**
 * The fleet's MCP servers as the hub's one writer (`putMcpServer`) saves
 * them: on every machine (no platforms), and with every field set (bound to
 * a project, shared, two platforms); servers whose platforms a hand edit
 * replaces ({@link seedPlatformsRoutes}); and three in the trash, one on
 * every machine, one scoped, one a hand edit breaks.
 */
function seedMcpServers(db: HubDb, projects: string[]): void {
  db.putMcpServer({ name: "linear-docs", config: HTTP_SERVER });
  db.putMcpServer({
    name: "sqlite-explorer",
    config: STDIO_SERVER,
    enabled: true,
    projectId: projects[0] ?? null,
    platforms: ["darwin", "linux"],
    shared: true,
  });
  for (const name of [
    "figma-bridge",
    "local-search",
    "notes-index",
    "screen-reader",
    "shell-tools",
  ]) {
    db.putMcpServer({ name, config: STDIO_SERVER, platforms: ["linux"] });
  }
  db.putMcpServer({ name: "trashed-everywhere", config: HTTP_SERVER });
  db.putMcpServer({
    name: "trashed-scoped",
    config: STDIO_SERVER,
    platforms: ["linux", "win32"],
  });
  db.putMcpServer({
    name: "trashed-broken",
    config: STDIO_SERVER,
    platforms: ["darwin"],
  });
  for (const key of [
    "trashed-everywhere",
    "trashed-scoped",
    "trashed-broken",
  ]) {
    db.trash.put({ kind: "mcp", key }, Date.now());
  }
}

/**
 * Every shape migration 0406 reads an MCP server's platforms and the
 * fleet's routes in, beside what {@link seedMcpServers} saved, as a hand
 * edit could leave them: platforms that are not JSON, partly platforms, a
 * platform kept twice, an empty list (on no machine), JSON `null`, and a
 * trashed server's partly platforms; the routes the hub reads (`'decides'`)
 * partly readable (every built-in kind set, one member a number, one member
 * gone, one key naming no kind), and three rows no code reads: every kind
 * set, none (`{}`), and not JSON.
 */
function seedPlatformsRoutes(dbPath: string): void {
  const sqlite = new Database(dbPath);
  const platforms: [string, string][] = [
    ["figma-bridge", "linux and darwin"],
    ["local-search", JSON.stringify(["linux", "freebsd", 3])],
    ["notes-index", JSON.stringify(["win32", "win32"])],
    ["screen-reader", "[]"],
    ["shell-tools", "null"],
  ];
  for (const [name, value] of platforms) {
    sqlite.run("UPDATE mcp_servers SET platforms = ? WHERE name = ?", [
      value,
      name,
    ]);
  }
  sqlite.run(
    "UPDATE config_trash SET rows = json_set(rows, '$[0].rows[0].platforms', ?) WHERE kind = 'mcp' AND key = 'trashed-broken'",
    [JSON.stringify(["darwin", "beos"])]
  );
  const routes: [string, string][] = [
    [
      "decides",
      JSON.stringify({
        look: "you",
        behaviour: "advisor",
        scope: "you",
        approach: "practice",
        rules: "former-agent",
        tools: 5,
        "retired-kind": "advisor",
      }),
    ],
    [
      "fixture-every",
      JSON.stringify({
        look: "advisor",
        behaviour: "you",
        scope: "practice",
        approach: "advisor",
        rules: "advisor",
        tools: "practice",
      }),
    ],
    ["fixture-unset", "{}"],
    ["fixture-unreadable", "look: advisor, tools: practice"],
  ];
  for (const [row, value] of routes) {
    sqlite.run("INSERT INTO decides_settings (id, routes) VALUES (?, ?)", [
      row,
      value,
    ]);
  }
  sqlite.close();
}

/** The fixture's tracker: a GitHub repository, and the tasks that name its issues, #41 onward. */
const TRACKED = {
  target: "dev/project-2",
  url: "https://github.com/dev/project-2",
  tasks: ["tsk-1", "tsk-2", "tsk-3", "tsk-4", "tsk-5", "tsk-6", "tsk-7"],
};

/**
 * The second project bound to a GitHub repository as the hub's tracker sync
 * writes it (`trackers.bind`, `trackers.putLink`): six tasks linked to their
 * issues, their baselines with a null Status, a Status option, labels and
 * none; and one task whose `issue:` names an issue the hub keeps no link
 * for (no baseline yet). A hand edit takes one baseline's Status away and
 * replaces three ({@link seedTrackerBaselines}).
 */
function seedTracker(db: HubDb, projects: string[]): void {
  const [, projectId] = projects;
  if (!projectId) {
    return;
  }
  const boundAt = new Date(Date.UTC(2026, 9, 1));
  const since = boundAt.getTime() + 30 * HOUR_MS;
  db.trackers.bind({
    projectId,
    provider: "github",
    connection: "github-dev",
    target: TRACKED.target,
    targetName: TRACKED.target,
    targetUrl: TRACKED.url,
    boundAt,
    cursor: { since, etag: null, commentsSince: since, commentsEtag: null },
    state: "synced",
    reason: null,
    polledAt: new Date(since),
    resumeAt: null,
    githubProject: null,
    githubProjectReason: null,
  });
  const baselines = [
    {
      title: "Fix the board's scroll after a reconnect",
      description: "The board jumps to the top when the hub comes back.",
      labels: ["bug", "release"],
      stage: "doing",
      state: "open",
      status: null,
    },
    {
      title: "Tidy the preview pane",
      description: "",
      labels: [],
      stage: "done",
      state: "closed:completed",
      status: null,
    },
    {
      title: "Make the release proof faster",
      description: "Run the binary's smoke test once per build.",
      labels: ["perf"],
      stage: "review",
      state: "open",
      status: "PVTSSO_review",
    },
  ];
  for (const [index, taskId] of TRACKED.tasks.entries()) {
    const number = 41 + index;
    const synced = baselines[index % baselines.length] ?? {
      title: "",
      description: "",
      labels: [],
      stage: "inbox",
      state: "open",
      status: null,
    };
    const record = {
      projectId,
      taskId,
      url: `${TRACKED.url}/issues/${number}`,
      source: "github" as const,
      kind: "issue" as const,
      externalId: `I_kwDOfixture${number}`,
      number,
      ref: `#${number}`,
      title: synced.title,
      state: synced.state === "open" ? ("open" as const) : ("closed" as const),
      stateName: synced.state === "open" ? "Open" : "Closed",
      author: null,
      labels: synced.labels,
      mode: "record" as const,
      remoteUpdatedAt: since,
      syncedAt: new Date(since),
      problem: null,
      etag: null,
    };
    if (taskId === "tsk-7") {
      db.taskLinks.putRef(record);
      continue;
    }
    db.trackers.putLink(
      {
        projectId,
        taskId,
        synced,
        linkedAt: boundAt,
        unvouched: number === 43 ? "a person GitHub does not vouch for" : null,
      },
      record
    );
  }
}

/**
 * Every shape migration 0407 reads a tracker link's baseline in, beside
 * what {@link seedTracker} saved, as a hand edit could leave them: one with
 * no Status key (as a baseline written before its binding had a Project,
 * or after `forgetStatus`, is), one that is not JSON, JSON `null`, and one
 * partly readable (title, description and state text; stage missing; a
 * label that is not text; a Status that is a number).
 */
function seedTrackerBaselines(dbPath: string): void {
  const sqlite = new Database(dbPath);
  sqlite.run(
    "UPDATE tracker_links SET synced = json_remove(synced, '$.status') WHERE task_id = 'tsk-1'"
  );
  const baselines: [string, string][] = [
    ["tsk-4", "title: Fix the rail, stage: doing"],
    [
      "tsk-5",
      JSON.stringify({
        title: "Check the migration on a real database",
        description: "Copy the live hub's database and run the new step on it.",
        labels: ["migration", 7],
        state: "open",
        status: 3,
      }),
    ],
    ["tsk-6", "null"],
  ];
  for (const [taskId, value] of baselines) {
    sqlite.run(
      "UPDATE tracker_links SET synced = ? WHERE task_id = ? AND project_id = (SELECT project_id FROM tracker_bindings)",
      [value, taskId]
    );
  }
  sqlite.close();
}

/** When the fixture's asks and passes were raised and entered: 2026-10-02, a minute apart. */
const ASKED_AT = Date.UTC(2026, 9, 2);

/** The fixture's first session, by its row: what the hand-written asks and passes are given to. */
const firstSession = (sqlite: Database): string | undefined =>
  sqlite
    .query<{ id: string }, []>(
      "SELECT id FROM instances ORDER BY rowid LIMIT 1"
    )
    .get()?.id;

/**
 * Asks as the hub's own code writes them (`asks.add`, `answer`, `carried`,
 * `grant`, `lapse`, `withdraw`), every one migration 0408 places whole:
 * an open approve ask with its source's facts and a skill's files, an open
 * question that blocks work, an open permit routed to its session's
 * parent; an approve ask that ran, one the hub went while running, one
 * declined; a question answered (a label and a multi-select's list) and one
 * dismissed; a permit granted and unspent, one spent, one lapsed; and a
 * question withdrawn. {@link seedAsksByHand} adds the ones that do not read.
 */
function seedAsks(db: HubDb, sessions: Seeded[]): void {
  const [first, second, third] = sessions;
  if (!(first && second && third)) {
    return;
  }
  let n = 0;
  const raised = (instanceId: string) => {
    n += 1;
    return {
      id: `ask_fixture-${n.toString().padStart(2, "0")}`,
      instanceId,
      state: "open" as const,
      raisedAt: ASKED_AT + n * MINUTE_MS,
    };
  };
  const at = (minutes: number) => ASKED_AT + minutes * MINUTE_MS;
  const approve = (tool: string, input: Record<string, unknown>) => ({
    kind: "approve" as const,
    tool,
    input,
    carry: { by: "hub" as const, tool },
  });
  const question = {
    kind: "question" as const,
    questions: [
      {
        header: "Retention",
        multiSelect: false,
        options: [
          { label: "90 days", description: "Keep a quarter of history." },
          { label: "A year", description: "Keep every release's history." },
        ],
        question: "How long should the board keep finished tasks?",
      },
      {
        header: "Surfaces",
        multiSelect: true,
        options: [
          { label: "Board", description: "The project's board." },
          { label: "Rail", description: "The session rail." },
        ],
        question: "Where should the archive show?",
      },
    ],
    blocks: true,
    waiting: "Deleting finished tasks older than the cut",
  };
  const permit = (command: string) => ({
    kind: "permit" as const,
    tool: "Bash",
    input: { command, description: "Run the release proof" },
  });
  const installing = raised(first.id);
  db.asks.add({
    ...installing,
    toolUseId: "toolu_fixture_install",
    asked: {
      ...approve("admin_skills_write", {
        reason: "The release task needs the proof skill.",
        name: "release-proof",
      }),
      source: {
        at: "github.com/dev/release-proof",
        since: "2025-03-14T09:00:00Z",
        stars: 214,
        weeklyDownloads: 1280,
        skill: {
          description: "Runs the binary's smoke test once per build.",
          files: [
            { hash: "sha256-a1", path: "SKILL.md" },
            { hash: "sha256-b2", path: "scripts/smoke.sh" },
          ],
          hash: "sha256-c3",
          name: "release-proof",
        },
      },
    },
  });
  db.asks.add({
    ...raised(first.id),
    toolUseId: "toolu_fixture_q",
    asked: question,
  });
  db.asks.add({
    ...raised(second.id),
    asked: permit("bun run test:binary"),
    routedTo: "parent",
  });
  const answered = (
    ask: ReturnType<typeof raised>,
    asked: Parameters<typeof db.asks.add>[0]["asked"],
    minutes: number,
    result:
      | { behavior: "allow"; answers?: Record<string, string | string[]> }
      | { behavior: "deny"; message: string }
  ) => {
    db.asks.add({ ...ask, asked });
    db.asks.answer(ask.id, {
      at: at(minutes),
      by: { behavior: result.behavior, name: "Chrome on Linux", via: "page" },
      result,
    });
  };
  const ran = raised(first.id);
  answered(ran, approve("admin_hooks_write", { reason: "Lint on save." }), 20, {
    behavior: "allow",
  });
  db.asks.carried(ran.id, { at: at(21), said: "The hook is set." });
  answered(
    raised(first.id),
    approve("admin_rules_write", { reason: "Hold the release rule." }),
    22,
    { behavior: "allow" }
  );
  answered(
    raised(second.id),
    approve("project_settings", { reason: "Rename the project." }),
    23,
    { behavior: "deny", message: "Keep the name for now." }
  );
  answered(raised(second.id), question, 24, {
    behavior: "allow",
    answers: {
      "How long should the board keep finished tasks?": "90 days",
      "Where should the archive show?": ["Board", "Rail"],
    },
  });
  answered(raised(third.id), question, 25, {
    behavior: "deny",
    message: "",
  });
  answered(raised(third.id), permit("git push origin main"), 26, {
    behavior: "allow",
  });
  answered(raised(third.id), permit("bun run check"), 27, {
    behavior: "allow",
  });
  db.asks.grant(
    third.id,
    (ask) =>
      ask.asked.kind === "permit" &&
      ask.asked.input.command === "bun run check",
    at(28)
  );
  const lapsing = raised(second.id);
  answered(lapsing, permit("rm -rf dist"), 29, { behavior: "allow" });
  db.asks.lapse(second.id, (ask) => ask.id === lapsing.id, at(30));
  const withdrawn = raised(third.id);
  db.asks.add({ ...withdrawn, asked: question });
  db.asks.withdraw(
    withdrawn.id,
    at(31),
    "its session ended before anyone answered"
  );
}

/**
 * Every shape migration 0408 reads an ask's record in that does not read
 * whole, as a hand edit or an older build could leave it: an open one that
 * is not JSON, an answered one that is JSON `null`, one that is a list; and
 * partly readable ones: an allowed permit whose grant's spending is not a
 * time (read as unspent, it would allow the call again), an allowed call
 * started whose end is not a time (read as never ended, it would be told
 * cut short), an open question with no questions, and a denial with no
 * message.
 */
function seedAsksByHand(dbPath: string): void {
  const sqlite = new Database(dbPath);
  const session = firstSession(sqlite);
  if (!session) {
    sqlite.close();
    return;
  }
  const records: [string, string, string][] = [
    ["ask_fixture-hand-1", "open", "asked: permit Bash git push"],
    ["ask_fixture-hand-2", "answered", "null"],
    ["ask_fixture-hand-3", "answered", JSON.stringify([{ kind: "permit" }])],
    [
      "ask_fixture-hand-4",
      "answered",
      JSON.stringify({
        asked: {
          kind: "permit",
          tool: "Bash",
          input: { command: "git push --force" },
        },
        answer: {
          at: ASKED_AT + 40 * MINUTE_MS,
          by: { behavior: "allow", via: "app" },
          result: { behavior: "allow" },
        },
        used: { at: "soon" },
      }),
    ],
    [
      "ask_fixture-hand-5",
      "answered",
      JSON.stringify({
        asked: {
          kind: "approve",
          tool: "admin_hooks_write",
          input: { reason: "Format on save." },
          carry: { by: "hub", tool: "admin_hooks_write" },
        },
        answer: {
          at: ASKED_AT + 41 * MINUTE_MS,
          by: { via: "page" },
          result: { behavior: "allow" },
        },
        carried: { startedAt: ASKED_AT + 41 * MINUTE_MS, endedAt: "later" },
      }),
    ],
    [
      "ask_fixture-hand-6",
      "open",
      JSON.stringify({
        toolUseId: "toolu_fixture_empty",
        asked: {
          kind: "question",
          questions: [],
          blocks: false,
          meanwhile: "Going ahead",
        },
      }),
    ],
    [
      "ask_fixture-hand-7",
      "answered",
      JSON.stringify({
        asked: {
          kind: "approve",
          tool: "admin_rules_write",
          input: { reason: "Drop the rule." },
          carry: { by: "hub", tool: "admin_rules_write" },
        },
        answer: {
          at: ASKED_AT + 42 * MINUTE_MS,
          by: { behavior: "deny", via: "page" },
          result: { behavior: "deny" },
        },
      }),
    ],
  ];
  for (const [index, [askId, askState, record]] of records.entries()) {
    sqlite.run(
      "INSERT INTO asks (id, instance_id, state, raised_at, record) VALUES (?, ?, ?, ?, ?)",
      [askId, session, askState, ASKED_AT + (50 + index) * MINUTE_MS, record]
    );
  }
  sqlite.close();
}

/**
 * Every shape migration 0409 reads a preview pass's scope in, written as
 * an entry writes a pass (preview-access.ts `enter`): the person's, no
 * session, scope never set (it opens every origin); a session's with its
 * origins, one named twice, and one with none; and as a hand edit could
 * leave them: a session's pass with none (it opens every origin, as
 * today), one with no session and a list (it opens that list alone, as
 * today), and scopes that do not read: not JSON, a JSON text, JSON `null`,
 * and a list with an entry that is not text.
 */
function seedPassScopes(dbPath: string): void {
  const sqlite = new Database(dbPath);
  const session = firstSession(sqlite);
  if (!session) {
    sqlite.close();
    return;
  }
  const passes: [string, string | null, string | null][] = [
    ["pass-fixture-person", null, null],
    [
      "pass-fixture-session",
      session,
      JSON.stringify(["art-fixture-1", "art-fixture-2", "art-fixture-1"]),
    ],
    ["pass-fixture-none", session, JSON.stringify([])],
    ["pass-fixture-hand-every", session, null],
    ["pass-fixture-hand-listed", null, JSON.stringify(["art-fixture-3"])],
    ["pass-fixture-hand-text", session, "art-fixture-1"],
    ["pass-fixture-hand-string", session, JSON.stringify("art-fixture-1")],
    ["pass-fixture-hand-null", session, "null"],
    ["pass-fixture-hand-partly", session, JSON.stringify(["art-fixture-1", 7])],
  ];
  for (const [passId, instanceId, scope] of passes) {
    sqlite.run(
      "INSERT INTO preview_passes (id, token_hash, device_id, instance_id, scope, created_at, last_seen_at, expires_at) VALUES (?, ?, NULL, ?, ?, ?, ?, ?)",
      [
        passId,
        `sha256-${passId}`,
        instanceId,
        scope,
        ASKED_AT,
        ASKED_AT,
        Date.UTC(2099, 0, 1),
      ]
    );
  }
  sqlite.close();
}

/** Two accounts as a limit line names them (core `NamedAccount`). */
const WORK = { hue: "amber", id: "acct-work", name: "Work" };
const HOME = { hue: "blue", id: "acct-home", name: "Home" };

/** When the seeded lines say their windows reset and their moves go. */
const RESETS = Date.UTC(2026, 9, 3, 14);

/**
 * Every shape migration 0410 reads a limit line's kind in, on sessions that
 * ended in error: a line of each kind as the hub writes them (core
 * `AccountMove`), and as a hand edit could leave one, a line that is not
 * JSON, JSON `null`, a list, an object with no kind, a kind no line has, a
 * kind that is a number. And compaction plans: a move's, a filing's at the
 * threshold (no move: never set), and a move's whose line is not JSON.
 */
const LIMIT_LINES: string[] = [
  ...[
    {
      kind: "moved",
      from: WORK,
      to: HOME,
      sameOrganization: false,
      tokens: 182_000,
      window: "5-hour limit",
      resetsAt: RESETS,
      compact: "compacted",
      ended: { tasks: 1, wakeups: 0 },
    },
    { kind: "moving", from: WORK, to: HOME, at: RESETS, tokens: 240_000 },
    {
      kind: "waiting",
      account: WORK,
      until: RESETS,
      why: "soon",
      tokens: null,
    },
    {
      kind: "continued",
      from: WORK,
      to: HOME,
      writtenOn: HOME,
      by: "Fix the board's scroll after a reconnect",
      asked: true,
      tokens: 90_000,
      preparedAtPct: null,
    },
    { kind: "stopped", account: WORK, resetsAt: null },
    { kind: "signed-out", account: HOME },
    { kind: "ended", by: { kind: "person" } },
    {
      kind: "unmoved",
      action: "move",
      from: WORK,
      to: HOME,
      step: "start",
      reason: "a background task is still running",
      waits: true,
    },
  ].map((line) => JSON.stringify(line)),
  "moved from Work to Home at its 5-hour limit",
  "null",
  JSON.stringify(["moved", WORK, HOME]),
  JSON.stringify({ from: WORK, to: HOME, tokens: 12_000 }),
  JSON.stringify({ kind: "teleported", from: WORK, to: HOME }),
  JSON.stringify({ kind: 3, account: WORK }),
];

/**
 * Every shape migrations 0410 to 0413 read in the values they lift into
 * columns, beside what the hub wrote: limit lines and compaction plans
 * ({@link LIMIT_LINES}); where workspaces were cut from (a source not
 * landed and one landed, as workspaces.ts `cutFrom` and landing-run.ts
 * `vouchLanded` write them, and not JSON, JSON `null`, a list, `landed`
 * that is text, `commit` missing); work items' blocks (a missing machine
 * and a missing type as work-items.ts `blockIfMissing` writes them, and
 * not JSON, JSON `null`, a kind no block has, `since` that is text); and
 * sends' origins (the person's, a peer's, a keep-alive and the hub's own
 * line, as the hub writes them, beside the seeded sends with none).
 */
function seedLiftedColumns(dbPath: string): void {
  const sqlite = new Database(dbPath);
  const ended = sqlite
    .query<{ id: string }, []>(
      "SELECT id FROM instances WHERE status = 'error' ORDER BY id"
    )
    .all()
    .map((row) => row.id);
  for (const [at, move] of LIMIT_LINES.entries()) {
    sqlite.run(
      "INSERT INTO limit_events (id, instance_id, at, move) VALUES (?, ?, ?, ?)",
      [
        `line-${at.toString().padStart(2, "0")}`,
        ended[at % 4] ?? "",
        RESETS - (LIMIT_LINES.length - at) * 60_000,
        move,
      ]
    );
  }
  const plans: [string | null, string | null, string | null][] = [
    [
      JSON.stringify({
        kind: "moved",
        from: WORK,
        to: HOME,
        sameOrganization: false,
        tokens: 210_000,
        window: "5-hour limit",
        resetsAt: RESETS,
        compact: "filing",
        compactFirst: true,
      }),
      null,
      "compact-0",
    ],
    [null, JSON.stringify({ compactsAt: 200_000, tokens: 176_000 }), null],
    ["moved to Home, compacting first", null, "compact-2"],
  ];
  for (const [at, [move, fill, compactUuid]] of plans.entries()) {
    sqlite.run(
      "INSERT INTO limit_compactions (instance_id, stage, line_id, move, fill, filing_uuid, compact_uuid, compacted, created_at) VALUES (?, 'filing', ?, ?, ?, ?, ?, 0, ?)",
      [
        ended[4 + at] ?? "",
        `line-plan-${at}`,
        move,
        fill,
        `filing-${at}`,
        compactUuid,
        RESETS,
      ]
    );
  }
  const workspaces = sqlite
    .query<{ id: string }, []>("SELECT id FROM workspaces ORDER BY id")
    .all()
    .map((row) => row.id);
  const [source = "", landedSource = ""] = workspaces;
  const sources: string[] = [
    JSON.stringify({
      workspace: source,
      commit: "4f2c9a1e7b3d5c8f0a6e2b9d1c4f7a3e5b8d0c2f",
      landed: false,
    }),
    JSON.stringify({
      workspace: landedSource,
      commit: "9b1d3f5a7c9e1b3d5f7a9c1e3b5d7f9a1c3e5b7d",
      landed: true,
    }),
    "cut from ws-00000 at 4f2c9a1",
    "null",
    JSON.stringify([source, "4f2c9a1e"]),
    JSON.stringify({ workspace: source, commit: "4f2c9a1e", landed: "yes" }),
    JSON.stringify({ workspace: landedSource, landed: false }),
  ];
  for (const [at, cutFrom] of sources.entries()) {
    sqlite.run("UPDATE workspaces SET cut_from = ? WHERE id = ?", [
      cutFrom,
      workspaces[2 + at] ?? "",
    ]);
  }
  const items = sqlite
    .query<{ id: string }, []>(
      "SELECT id FROM work_items WHERE state = 'starting' ORDER BY id"
    )
    .all()
    .map((row) => row.id);
  const blocks: string[] = [
    JSON.stringify({ kind: "machine", name: "quarry", since: RESETS }),
    JSON.stringify({ kind: "type", name: "browser", since: RESETS + 1000 }),
    "blocked: its machine left the fleet",
    "null",
    JSON.stringify({ kind: "printer", name: "office", since: RESETS }),
    JSON.stringify({ kind: "account", name: "Work", since: "yesterday" }),
  ];
  for (const [at, blocked] of blocks.entries()) {
    sqlite.run("UPDATE work_items SET blocked = ? WHERE id = ?", [
      blocked,
      items[at] ?? "",
    ]);
  }
  const live = sqlite
    .query<{ id: string }, []>(
      "SELECT id FROM instances WHERE status = 'starting' ORDER BY id LIMIT 2"
    )
    .all()
    .map((row) => row.id);
  const [peer = "", other = ""] = live;
  const origins = [
    { kind: "human" },
    { kind: "peer", from: other, name: "Fix the board's scroll" },
    { kind: "system", name: "keepalive" },
    { kind: "system", line: "Your work item is still open: continue it." },
  ];
  for (const [at, origin] of origins.entries()) {
    sqlite.run(
      "INSERT INTO sent_messages (uuid, instance_id, accepted_at, body, mode, state) VALUES (?, ?, ?, ?, 'turn', 'read')",
      [
        `send-origin-${at}`,
        peer,
        RESETS + at * 1000,
        JSON.stringify({
          type: "user",
          uuid: `send-origin-${at}`,
          message: {
            role: "user",
            content: "Check the migration on a real database.",
          },
          origin,
        }),
      ]
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
    seedMcpServers(db, projects);
    seedTracker(db, projects);
    seedAsks(db, sessions);
  }
  lifetime.close();
  if (withLists) {
    seedByHand(dbPath, continued);
    seedBudgets(dbPath);
    seedAtLimit(dbPath);
    seedLanded(dbPath);
    seedGatePasses(dbPath);
    seedOutputs(dbPath);
    seedQueued(dbPath);
    seedPlatformsRoutes(dbPath);
    seedTrackerBaselines(dbPath);
    seedAsksByHand(dbPath);
    seedPassScopes(dbPath);
    seedLiftedColumns(dbPath);
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
