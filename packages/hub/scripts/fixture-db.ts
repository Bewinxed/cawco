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
 * baselines, asks and preview passes, the values migrations 0410 to 0413
 * lift into columns, continuation jobs, project moves, the stream
 * relay's ports and proofs and session plans besides ({@link seedLists},
 * {@link seedBudgets}, {@link seedAtLimit}, {@link seedLanded},
 * {@link seedGatePasses}, {@link seedOutputs}, {@link seedQueued},
 * {@link seedMcpServers}, {@link seedPlatformsRoutes}, {@link seedTracker},
 * {@link seedTrackerBaselines}, {@link seedAsks}, {@link seedAsksByHand},
 * {@link seedPassScopes}, {@link seedLiftedColumns},
 * {@link seedContinuations}, {@link seedContinuationsByHand},
 * {@link seedMoves}, {@link seedMovesByHand}, {@link seedRelayPorts},
 * {@link seedSessionPlans}, {@link seedSessionPlansByHand}, the
 * sealed values migration 0420 opens and places ({@link seedSealedFacts},
 * sealed with the fixtures' key), the owed sends migration 0421 folds
 * into their envelopes ({@link seedOwedSends}), the skills', plugins'
 * and kept versions' files and last fetches migrations 0422 and 0423 move
 * ({@link seedFleetFiles}), the pauses, sign-ins and capabilities 0424
 * moves ({@link seedMachineColumns}), the cold readings, waits, witnesses
 * and heads migrations 0425 to 0428 lift into columns and rows
 * ({@link seedColdWaitsHeads}), and the compaction plans, Who decides
 * settings, tracker cursors and account readings migrations 0429 to 0432
 * lift into columns ({@link seedPlansSettingsCursorsReadings}), the
 * parked asks whose call input migration 0434 seals ({@link seedParkedAsks}),
 * and a transcript line quoting a session credential and a sealed MCP env
 * value, which the known values replace ({@link seedKnownValues},
 * {@link seedKnownLine}), written to fixtures/lists-db.sqlite.gz: the
 * migration check runs over both.
 */
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { hashFiles } from "@cawco/core/file-hash";
import { HARNESSES } from "@cawco/core/harness/kinds";
import { machinePath } from "@cawco/core/machine-path";
import { HOUR_MS, MINUTE_MS } from "@cawco/core/time";
import type { ContinuationAsker } from "../src/db/stored-types";
import {
  KNOWN_CREDENTIAL,
  KNOWN_ENV_NAME,
  KNOWN_ENV_VALUE,
  KNOWN_LINE,
  KNOWN_PATH,
  KNOWN_SERVER,
  PARKED_KEY,
  PARKED_TOKEN,
} from "./fixture-db-values";
import { hubInProcess, writeFixtureKey } from "./hub-in-process";
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
 * 0408, every shape a preview pass's scope took before migration 0409,
 * every shape a limit line, a workspace's source, a work item's block and a
 * send's origin took before migrations 0410 to 0413, every shape a
 * continuation's asker and wait took before migration 0414, every shape a
 * project move's state took before migration 0415, and every shape a relay
 * proof's chips and the relay's ports took before migration 0416, and every
 * shape a connection's sealed value and a fleet MCP server's sign-in under
 * way took before migration 0420, every shape a send's owed envelope
 * took beside its kept one before migration 0421, every shape a skill's,
 * plugin's and kept version's files and last fetch took before migrations
 * 0422 and 0423, every shape a machine's pause, a tool's sign-in and a
 * machine's capabilities took before migration 0424, and every shape a
 * session's cold reading, a work item's waits and witnesses and a retired
 * workspace's head took before migrations 0425 to 0428, and every shape a
 * compaction plan, Who decides' hearing and poses, a tracker's cursor and
 * an account's extra usage and window set took before migrations 0429 to
 * 0432, written here.
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
  // The build this fixture is seeded at keeps no digest on a permit (its
  // type has none, and a write that holds one is refused): migration 0436's
  // step makes it from the input it kept. This build's type has one, so it
  // is here, and left out of what the seeded build writes.
  const permit = (command: string) =>
    Object.defineProperty(
      {
        kind: "permit" as const,
        tool: "Bash",
        input: { command, description: "Run the release proof" },
        digest: "",
      },
      "digest",
      { enumerable: false }
    );
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
  answered(
    raised(third.id),
    permit(`GITHUB_TOKEN=${PARKED_TOKEN} git push origin main`),
    26,
    { behavior: "allow" }
  );
  // An open approval whose call carries a key, as the person was asked it.
  db.asks.add({
    ...raised(first.id),
    asked: approve("admin_mcp_servers_write", {
      action: "add",
      name: "search",
      config: {
        url: "https://search.example/mcp",
        headers: { Authorization: `Bearer ${PARKED_KEY}` },
      },
      reason: "Search the release notes.",
    }),
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

/** When the fixture's continuations, moves and relay proofs were made: 2026-10-03, a minute apart. */
const JOBS_AT = Date.UTC(2026, 9, 3);

/** What a continuation job of `source` was prepared from: a short session, read whole. */
const preparedOf = (source: Seeded) => ({
  compacted: false,
  entries: { live: 42, whole: 42, scope: 42 },
  extracted: {
    artifacts: "",
    asks: ["Ship the retention cut behind a flag."],
    covers: null,
    middle: ["Read the board's archive query.", "Drafted the cut."],
    tail: "The cut is drafted; the flag is next.",
  },
  liveContextTokens: 61_200,
  openingTokens: 4100,
  prompt: "Summarise the session for the next one.",
  source: {
    cwd: fixturePath(`/home/dev/src/${source.projectId}`),
    harness: "claude" as const,
    instanceId: source.id,
    machineId: source.machineId,
    model: "model-a",
    title: "Archive finished tasks",
  },
  summariseInputTokens: 52_800,
});

/** An account a move names. */
const account = (accountId: string, name: string) => ({
  hue: "blue" as const,
  id: accountId,
  name,
});

/**
 * Continuation jobs as the hub's own code writes them
 * (`insertContinuation`), every one migration 0414 places whole: a
 * person's own Continue that started, a session's `continue_session` that
 * failed, a comment on a task that was cancelled, a move from a summary
 * that waited for its source's work in flight and started, and a person's
 * that waits now. {@link seedContinuationsByHand} adds the ones that do not
 * read.
 */
function seedContinuations(db: HubDb, sessions: Seeded[]): void {
  const [first, second, third] = sessions;
  if (!(first && second && third)) {
    return;
  }
  const movedLine = {
    kind: "moved" as const,
    from: account("acct-fixture-a", "Studio"),
    to: account("acct-fixture-b", "Personal"),
    sameOrganization: false,
    tokens: 61_200,
    window: "five_hour",
    resetsAt: JOBS_AT + 3 * HOUR_MS,
    because: { kind: "forecast" as const, runsOutAt: JOBS_AT + HOUR_MS },
  };
  const job = (
    n: number,
    source: Seeded,
    stage: "waiting" | "started" | "failed" | "cancelled",
    askedBy: ContinuationAsker,
    waiting: { from: number; since: number | null; why: string } | null
  ) =>
    db.insertContinuation({
      id: `cont-fixture-${n.toString().padStart(2, "0")}`,
      sourceInstanceId: source.id,
      request: { target: { harness: "claude", model: "model-a" } },
      prepared: preparedOf(source),
      summariserInstanceId: null,
      targetInstanceId: `cont-fixture-target-${n}`,
      openingUuid: `cont-fixture-opening-${n}`,
      summary: null,
      openItems: null,
      stage,
      error: stage === "failed" ? "The summariser's model can't fit it." : null,
      askedBy,
      waiting,
    });
  job(1, first, "started", { kind: "person" }, null);
  job(2, second, "failed", { kind: "session", id: first.id }, null);
  job(3, third, "cancelled", { kind: "task", id: "tsk-12" }, null);
  job(
    4,
    first,
    "started",
    {
      kind: "move",
      line: "limit-fixture-1",
      move: movedLine,
      stopped: "limit",
      to: "acct-fixture-b",
    },
    { from: JOBS_AT, since: JOBS_AT - MINUTE_MS, why: "a background command" }
  );
  job(
    5,
    second,
    "waiting",
    { kind: "person" },
    {
      from: JOBS_AT + MINUTE_MS,
      since: null,
      why: "a one-time wake-up",
    }
  );
}

/**
 * Every shape migration 0414 reads a job's asker and wait in, as a hand
 * edit or an older build could leave them, each beside a request and a
 * prepared transcript copied from a job written whole: an asker never set
 * (the column's default, the person's), and askers that do not read: an
 * open job's that is a JSON text, JSON `null`, a session's with no id, an
 * open move's with only its account; and waits that do not read: not JSON,
 * one with no `since`, JSON `null`. No asker here is other than JSON: the
 * fixture's schema is before migration 0391, whose `json_extract` over
 * every asker stops on one.
 */
function seedContinuationsByHand(dbPath: string): void {
  const sqlite = new Database(dbPath);
  const jobs: [string, string, string | null, string | null][] = [
    ["cont-fixture-hand-default", "started", null, null],
    ["cont-fixture-hand-text", "summarising", JSON.stringify("a person"), null],
    ["cont-fixture-hand-null", "failed", "null", null],
    [
      "cont-fixture-hand-no-id",
      "failed",
      JSON.stringify({ kind: "session" }),
      null,
    ],
    [
      "cont-fixture-hand-move",
      "starting",
      JSON.stringify({ kind: "move", to: "acct-fixture-b" }),
      null,
    ],
    [
      "cont-fixture-hand-wait-text",
      "started",
      JSON.stringify({ kind: "person" }),
      "soon",
    ],
    [
      "cont-fixture-hand-wait-partly",
      "waiting",
      JSON.stringify({ kind: "person" }),
      JSON.stringify({ from: JOBS_AT, why: "a background command" }),
    ],
    [
      "cont-fixture-hand-wait-null",
      "started",
      JSON.stringify({ kind: "task", id: "tsk-12" }),
      "null",
    ],
  ];
  for (const [jobId, stage, askedBy, waiting] of jobs) {
    sqlite.run(
      `INSERT INTO continuations (id, source_instance_id, request, prepared, summariser_instance_id, target_instance_id, opening_uuid, summary, stage, error, created_at, updated_at, open_items${askedBy === null ? "" : ", asked_by"}, waiting) SELECT ?, source_instance_id, request, prepared, NULL, ?, ?, NULL, ?, NULL, ?, ?, NULL${askedBy === null ? "" : ", ?"}, ? FROM continuations WHERE id = 'cont-fixture-01'`,
      [
        jobId,
        `${jobId}-target`,
        `${jobId}-opening`,
        stage,
        JOBS_AT,
        JOBS_AT,
        ...(askedBy === null ? [] : [askedBy]),
        waiting,
      ]
    );
  }
  sqlite.close();
}

/** A move's state as moves.ts keeps it, for project `projectId` from `source` to `target`. */
const moveStateOf = (
  n: number,
  projectId: string,
  source: string,
  target: string
) => ({
  bigFiles: [],
  bytes: 48_300_000,
  from: { kind: "hub" as const },
  ignoredSecrets: [],
  ignores: true,
  promptUuid: `move-fixture-prompt-${n}`,
  snapshotBranch: `cawco/move-fixture-${n}`,
  sourceHome: "/home/dev",
  sourceMachineId: source,
  sourcePath: `/home/dev/src/${projectId}`,
  steps: [
    "approval" as const,
    "snapshot" as const,
    "clone" as const,
    "start" as const,
  ],
  targetHome: "/home/dev",
  targetInstanceId: `move-fixture-session-${n}`,
  targetMachineId: target,
  targetPath: fixturePath(`/home/dev/src/${projectId}`),
});

/**
 * Project moves as the hub's own code writes them (`insertMove`), every one
 * migration 0415 places whole: one waiting on the person's "Move it", its
 * ask parked; one approved that started; one from an outside remote that
 * failed at its clone, its snapshot and progress kept. And the session row
 * a move that does not read names ({@link seedMovesByHand}), held as a move
 * holds it.
 */
function seedMoves(db: HubDb, projects: string[]): void {
  const [first, second, third] = projects;
  if (!(first && second && third)) {
    return;
  }
  const request = {
    machineId: "quarry",
    spawn: { harness: "claude" as const },
  };
  const at = (n: number) => new Date(JOBS_AT + n * MINUTE_MS);
  db.insertMove({
    id: "move-fixture-1",
    projectId: first,
    stage: "approval",
    request,
    state: {
      ...moveStateOf(1, first, "obsidian", "quarry"),
      ask: {
        bigFiles: [],
        details: ["4 uncommitted files go with it."],
        gitInit: false,
        lines: ["Clone it to quarry, then start the session there."],
        title: "Move it to quarry?",
        key: "move-fixture-key-1",
      },
      askId: "move-fixture-ask-1",
    },
  });
  db.insertMove({
    id: "move-fixture-2",
    projectId: second,
    stage: "started",
    request,
    state: {
      ...moveStateOf(2, second, "lumen", "quarry"),
      approved: true,
      moved: "The project is on quarry.",
    },
  });
  db.insertMove({
    id: "move-fixture-3",
    projectId: third,
    stage: "failed",
    request,
    state: {
      ...moveStateOf(3, third, "marlin", "obsidian"),
      from: { kind: "outside", host: "github.com" },
      cloneUrl: "https://github.com/acme/archive.git",
      approved: true,
      snapshot: {
        base: null,
        branch: "cawco/move-fixture-3",
        commit: "4b1f0c2",
        files: 12,
        sourceBranch: "main",
      },
      progress: { bytes: 12_000_000, total: 48_300_000 },
      error: {
        message: "The clone stopped: the remote hung up.",
        stage: "clone",
      },
    },
  });
  db.holdMovingInstance({
    id: "move-fixture-session-hand-partly",
    machineId: "quarry",
    cwd: fixturePath(`/home/dev/src/${first}`),
    projectId: first,
    harness: "claude",
    at: at(10),
  });
}

/**
 * Every shape migration 0415 reads a move's state in, as a hand edit or an
 * older build could leave it, each beside a request copied from a move
 * written whole: an unsettled state that is not JSON (it names no row), a
 * JSON text, one cancelled that is not JSON, and one partly readable: its
 * session's id and its ask there, its steps gone (it holds the row it
 * names, which is marked failed as the hub starts).
 */
function seedMovesByHand(dbPath: string): void {
  const sqlite = new Database(dbPath);
  const project = sqlite
    .query<{ projectId: string }, []>(
      "SELECT project_id AS projectId FROM moves WHERE id = 'move-fixture-1'"
    )
    .get()?.projectId;
  if (!project) {
    sqlite.close();
    return;
  }
  const { steps: _steps, ...partly } = moveStateOf(
    9,
    project,
    "obsidian",
    "quarry"
  );
  const states: [string, string, string][] = [
    ["move-fixture-hand-text", "clone", "cloning"],
    ["move-fixture-hand-string", "snapshot", JSON.stringify("snapshot")],
    ["move-fixture-hand-cancelled", "cancelled", "{"],
    [
      "move-fixture-hand-partly",
      "approval",
      JSON.stringify({
        ...partly,
        targetInstanceId: "move-fixture-session-hand-partly",
        askId: "move-fixture-ask-hand",
      }),
    ],
  ];
  for (const [moveId, stage, stored] of states) {
    sqlite.run(
      "INSERT INTO moves (id, project_id, stage, state, source_machine_id, target_machine_id, stop_on, request, created_at, updated_at) SELECT ?, project_id, ?, ?, source_machine_id, target_machine_id, NULL, request, ?, ? FROM moves WHERE id = 'move-fixture-1'",
      [moveId, stage, stored, JOBS_AT, JOBS_AT]
    );
  }
  sqlite.close();
}

/**
 * Every shape migration 0416 reads a relay proof's chips and the relay's
 * ports in, and the health 0417 drops, as the hub's writers leave them
 * and as a hand edit could: the relay, its ports said, its health asked;
 * proofs from outside (UDP and TLS), from a fleet machine (TCP), and one
 * that answered nothing (never set). And, in rows the hub never reads
 * (the relay is one row, `relay`), ports never said, not JSON and partly
 * readable; and proofs whose chips do not read: not JSON, JSON `null`, a
 * list with an entry that is not text, and a chip no writer makes.
 */
function seedRelayPorts(dbPath: string): void {
  const sqlite = new Database(dbPath);
  const relays: [string, string | null][] = [
    ["relay", JSON.stringify({ udp: true, tcp: true, tls: false })],
    ["relay-fixture-never", null],
    ["relay-fixture-text", "udp,tcp"],
    ["relay-fixture-partly", JSON.stringify({ udp: true, tcp: true })],
  ];
  for (const [relayId, ports] of relays) {
    sqlite.run(
      "INSERT INTO stream_relay (id, machine_id, address, hostname, secret, wanted, state, ports, why, health, checked_at, created_at) VALUES (?, 'lumen', '203.0.113.24', NULL, 'not-sealed', 1, 'live', ?, NULL, ?, ?, ?)",
      [
        relayId,
        ports,
        JSON.stringify([
          { port: "udp 3478", up: true },
          { port: "tcp 3478", up: false, error: "timed out" },
        ]),
        JOBS_AT,
        JOBS_AT,
      ]
    );
  }
  const proofs: [string, string, boolean, string][] = [
    [
      "device-fixture-outside",
      "Chrome on Linux",
      true,
      JSON.stringify(["udp 3478", "tls 5349"]),
    ],
    ["machine:marlin", "marlin", true, JSON.stringify(["tcp 3478"])],
    ["device-fixture-none", "CawCo on iPhone", false, JSON.stringify([])],
    ["device-fixture-text", "Safari on macOS", true, "udp 3478"],
    ["device-fixture-null", "Firefox on Linux", true, "null"],
    [
      "device-fixture-partly",
      "Edge on Windows",
      true,
      JSON.stringify(["udp 3478", 7]),
    ],
    [
      "device-fixture-unknown",
      "Chrome on Android",
      true,
      JSON.stringify(["udp 3479"]),
    ],
  ];
  for (const [n, [deviceId, device, outside, ports]] of proofs.entries()) {
    sqlite.run(
      "INSERT INTO stream_relay_proofs (device_id, device, address, outside, ports, refused, at) VALUES (?, ?, ?, ?, ?, 0, ?)",
      [
        deviceId,
        device,
        outside ? "198.51.100.7" : "203.0.113.24",
        outside ? 1 : 0,
        ports,
        JOBS_AT + n * MINUTE_MS,
      ]
    );
  }
  sqlite.close();
}

/** When the fixture's plans were written and commented on: 2026-10-04. */
const PLANNED_AT = Date.UTC(2026, 9, 4);

/** The person's comment on a step, `minutes` after {@link PLANNED_AT}. */
const planComment = (minutes: number, text: string) => ({
  at: new Date(PLANNED_AT + minutes * MINUTE_MS).toISOString(),
  text,
});

/**
 * Plans as the hub's own code writes them (`putSessionSteps`,
 * `putSessionSpec`), every one migration 0418 places whole as rows: steps
 * nested by depth in every status, with and without a priority, waiting on
 * a pull request, a task and a card, the person's comments on two steps,
 * a plan with orphaned comments in two groups, an empty list written, and
 * a spec written alone (steps never set). {@link seedSessionPlansByHand}
 * adds the ones that do not read.
 */
function seedSessionPlans(db: HubDb, sessions: Seeded[]): void {
  const [first, second, third, fourth, fifth] = sessions.slice(60);
  if (!(first && second && third && fourth && fifth)) {
    throw new Error("the lists fixture's plans need five sessions");
  }
  db.putSessionSteps(first.id, [
    {
      id: "1",
      content: "Read the migration journal and the newest snapshot",
      depth: 0,
      status: "completed",
      comments: [planComment(3, "Start from 0413, not 0410.")],
    },
    {
      id: "2",
      content: "Move the session plans into rows",
      depth: 0,
      status: "in_progress",
      priority: "high",
    },
    {
      id: "2.1",
      content: "Write the migration with nested json_each",
      depth: 1,
      status: "in_progress",
    },
    {
      id: "2.2",
      content: "Rebuild the lists fixture at the pinned commit",
      depth: 1,
      status: "pending",
      priority: "low",
      waitsOn: "https://github.com/example-org/fixture-repo/pull/482",
      comments: [
        planComment(9, "Keep the realistic fixture byte for byte."),
        planComment(14, "And count it with the script afterwards."),
      ],
    },
    {
      id: "td-3",
      content: "Report the counts",
      depth: 0,
      status: "pending",
      waitsOn: "tsk-12",
    },
  ]);
  db.putSessionSteps(
    second.id,
    [
      {
        id: "1",
        content: "Pick the plan panel's stop wording",
        depth: 0,
        status: "pending",
        priority: "medium",
        waitsOn: "6f1c2a9e-3b4d-4e5f-8a7b-9c0d1e2f3a4b#stop-words",
      },
    ],
    [
      {
        step: "Draft three wordings for the stop",
        comments: [
          planComment(21, "Shorter, please."),
          planComment(22, "No exclamation marks."),
        ],
      },
      {
        step: "Ask before building",
        comments: [planComment(30, "Fine to skip this one.")],
      },
    ]
  );
  db.putSessionSteps(third.id, [
    {
      id: "1",
      content: "Wait for the host proofs",
      depth: 0,
      status: "completed",
    },
  ]);
  db.putSessionSteps(fourth.id, []);
  db.putSessionSpec(
    fifth.id,
    "## Goal\n\nMove every stored plan to rows, and say where one does not read."
  );
}

/**
 * Plans 0418 does not read whole, written by hand as no write of the hub's
 * makes them, on sessions the fixture already has: steps that are not JSON,
 * JSON null, a text, a list holding a step with no status, a step whose
 * status no step has, a priority of null, two steps with one id, steps
 * that read beside orphaned comments that do not (a plan partly readable),
 * and orphaned comments that are not JSON.
 */
function seedSessionPlansByHand(dbPath: string): void {
  const sqlite = new Database(dbPath);
  const sessions = sqlite
    .query<{ id: string }, []>(
      "SELECT id FROM instances WHERE id NOT IN (SELECT instance_id FROM session_plans) ORDER BY rowid LIMIT 9 OFFSET 80"
    )
    .all()
    .map((row) => row.id);
  const step = (stepId: string, status: string) => ({
    id: stepId,
    content: `Step ${stepId} of a plan written by hand`,
    depth: 0,
    status,
  });
  const plans: [string, string][] = [
    ["{steps: [", "[]"],
    ["null", "[]"],
    [JSON.stringify("1. read 2. write"), "[]"],
    [
      JSON.stringify([
        step("1", "completed"),
        { id: "2", content: "No status", depth: 0 },
      ]),
      "[]",
    ],
    [JSON.stringify([step("1", "done")]), "[]"],
    [JSON.stringify([{ ...step("1", "pending"), priority: null }]), "[]"],
    [JSON.stringify([step("1", "completed"), step("1", "pending")]), "[]"],
    [
      JSON.stringify([step("1", "in_progress"), step("2", "pending")]),
      JSON.stringify([{ step: "An old step", comments: "Keep this." }]),
    ],
    [JSON.stringify([step("1", "pending")]), "not json"],
  ];
  for (const [n, [steps, orphaned]] of plans.entries()) {
    const instanceId = sessions[n];
    if (!instanceId) {
      throw new Error(
        "the lists fixture's hand-written plans need nine sessions"
      );
    }
    sqlite.run(
      "INSERT INTO session_plans (instance_id, steps, orphaned_comments, updated_at) VALUES (?, ?, ?, ?)",
      [instanceId, steps, orphaned, PLANNED_AT + n * MINUTE_MS]
    );
  }
  sqlite.close();
}

/** When the sealed fixtures were written, and when a sign-in under way they hold lapses. */
const SEALED_AT = Date.UTC(2026, 9, 4);
const SIGN_IN_LAPSES = SEALED_AT + 10 * MINUTE_MS;

/** The client a fleet MCP server's sign-in starts with, as the SDK registers one. */
const FLEET_CLIENT = {
  client_id: "fleet-client-fixture",
  redirect_uris: ["https://cawco.example.invalid/api/fleet/oauth/callback"],
  client_name: "CawCo fleet",
  grant_types: ["authorization_code", "refresh_token"],
  response_types: ["code"],
  token_endpoint_auth_method: "none",
};

/**
 * What migration 0420 moves out of the sealed values, each as the hub kept
 * it at the fixture's commit: what a connection held (`connections.sealed`)
 * and a fleet MCP server's sign-in under way (`fleet_mcp_oauth.pending`),
 * sealed with the fixtures' key (hub-in-process.ts `writeFixtureKey`) as
 * the hub's own box seals them. Connections placed whole: a machine's gh, an
 * installed GitHub App with its organization, a Linear app signed in, a code
 * sign-in under way, an MCP server's OAuth client and tokens, a bearer key,
 * one kept as plain JSON from before secrets were sealed; one never set; and
 * four kept as not read: sealed under another key, not JSON, a gh account
 * without its machine, and tokens without their type. Sign-ins under way: one
 * placed, one never set, one under another key, one without its state. And
 * the trash: a connection put there placed, one not read, and an MCP server
 * put there with its sign-in under way, each through the hub's own trash.
 */
async function seedSealedFacts(db: HubDb, dbPath: string): Promise<void> {
  const { hubSecrets } = await import("../src/secret-box");
  const seal = (value: unknown): string =>
    hubSecrets().seal(JSON.stringify(value));
  /** A value sealed under a key no hub here holds: it does not open. */
  const otherKey = `v1:${Buffer.from(
    Array.from({ length: 48 }, (_, n) => (n * 37 + 11) % 256)
  ).toString("base64url")}`;
  const sqlite = new Database(dbPath);
  const connections: [
    string,
    string,
    string,
    string,
    string | null,
    string,
    string | null,
  ][] = [
    [
      "conn-fixture-gh",
      "github-dev-fixture",
      "github",
      "gh",
      "signed-in",
      "https://api.githubcopilot.com/mcp/",
      seal({
        gh: { machineId: "obsidian", host: "github.com", login: "dev-fixture" },
        key: "gho_fixture000000000000000000000000000001",
      }),
    ],
    [
      "conn-fixture-app",
      "github-app-fixture",
      "github",
      "app",
      "signed-in",
      "https://api.githubcopilot.com/mcp/",
      seal({
        org: "fixture-org",
        app: {
          service: "github",
          appId: "1100231",
          slug: "cawco-fixture-org",
          privateKey:
            "-----BEGIN RSA PRIVATE KEY-----\nfixture-not-a-key\n-----END RSA PRIVATE KEY-----",
          clientId: "Iv23liFixture0001",
          clientSecret: "fixture-client-secret-0001",
          webhookSecret: "fixture-webhook-secret-0001",
          installationId: "58831204",
        },
      }),
    ],
    [
      "conn-fixture-linear",
      "linear-fixture",
      "linear",
      "app",
      "signed-in",
      "https://mcp.linear.app/mcp",
      seal({
        app: {
          service: "linear",
          clientId: "lin-client-fixture-0001",
          clientSecret: "lin-secret-fixture-0001",
        },
        tokens: {
          access_token: "lin_oauth_fixture_access_0001",
          token_type: "Bearer",
          expires_in: 86_399,
          refresh_token: "lin_oauth_fixture_refresh_0001",
          scope: "read,write,app:assignable",
        },
      }),
    ],
    [
      "conn-fixture-device",
      "github-device-fixture",
      "github",
      "device",
      "needs-sign-in",
      "https://api.githubcopilot.com/mcp/",
      seal({
        device: {
          deviceCode: "fixture-device-code-0001",
          userCode: "WDJB-MJHT",
          verificationUri: "https://github.com/login/device",
          expiresAt: SEALED_AT + 15 * MINUTE_MS,
          interval: 5,
        },
      }),
    ],
    [
      "conn-fixture-oauth",
      "notion-fixture",
      "notion",
      "oauth",
      "signed-in",
      "https://mcp.notion.example.invalid/mcp",
      seal({
        client: {
          client_id: "notion-client-fixture",
          redirect_uris: [
            "https://cawco.example.invalid/api/connections/oauth/callback",
          ],
          token_endpoint_auth_method: "none",
        },
        tokens: {
          access_token: "notion_fixture_access_0001",
          token_type: "bearer",
        },
      }),
    ],
    [
      "conn-fixture-bearer",
      "sentry-fixture",
      "sentry",
      "bearer",
      "signed-in",
      "https://mcp.sentry.example.invalid/mcp",
      seal({ key: "sntrys_fixture_0001" }),
    ],
    [
      "conn-fixture-plain",
      "posthog-fixture",
      "posthog",
      "bearer",
      "signed-in",
      "https://mcp.posthog.example.invalid/mcp",
      JSON.stringify({ key: "phx_fixture_plain_0001" }),
    ],
    [
      "conn-fixture-never",
      "docs-fixture",
      "docs",
      "none",
      "signed-in",
      "https://mcp.docs.example.invalid/mcp",
      null,
    ],
    [
      "conn-fixture-other-key",
      "stripe-fixture",
      "stripe",
      "bearer",
      "signed-in",
      "https://mcp.stripe.example.invalid/mcp",
      otherKey,
    ],
    [
      "conn-fixture-not-json",
      "figma-fixture",
      "figma",
      "bearer",
      "signed-in",
      "https://mcp.figma.example.invalid/mcp",
      hubSecrets().seal("figd_fixture_not_json"),
    ],
    [
      "conn-fixture-gh-partly",
      "github-partly-fixture",
      "github",
      "gh",
      "error",
      "https://api.githubcopilot.com/mcp/",
      seal({
        gh: { host: "github.com", login: "partly-fixture" },
        key: "gho_fixture000000000000000000000000000002",
      }),
    ],
    [
      "conn-fixture-tokens-partly",
      "asana-fixture",
      "asana",
      "oauth",
      "signed-in",
      "https://mcp.asana.example.invalid/mcp",
      seal({
        client: { client_id: "asana-client-fixture" },
        tokens: { access_token: "asana_fixture_access_0001" },
      }),
    ],
    [
      "conn-fixture-trashed",
      "github-trashed-fixture",
      "github",
      "bearer",
      "signed-in",
      "https://api.githubcopilot.com/mcp/",
      seal({ key: "github_pat_fixture_trashed_0001" }),
    ],
    [
      "conn-fixture-trashed-unread",
      "slack-trashed-fixture",
      "slack",
      "bearer",
      "signed-in",
      "https://mcp.slack.example.invalid/mcp",
      otherKey,
    ],
  ];
  for (const [
    connectionId,
    name,
    service,
    auth,
    standing,
    url,
    sealed,
  ] of connections) {
    sqlite.run(
      "INSERT INTO connections (id, name, service, account, transport, url, command, args, auth, header, state, reason, sealed, discovery, sign_in_state, sign_in_redirect, sign_in_expires_at, sign_in_url, tokens_expire_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'http', ?, NULL, NULL, ?, NULL, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)",
      [
        connectionId,
        name,
        service,
        `${service} account`,
        url,
        auth,
        standing,
        standing === "needs-sign-in" ? "A sign-in is under way." : null,
        sealed,
        SEALED_AT,
        SEALED_AT,
      ]
    );
  }
  const oauth = (
    name: string,
    pending: string | null,
    tokens: string | null
  ): void => {
    sqlite.run(
      "INSERT INTO fleet_mcp_oauth (name, generation, upstream, resource, issuer, metadata, client, tokens, expires_at, token_client, pending, last_opened_at, ended_at, ended_why, access, identity) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, NULL, NULL, NULL)",
      [
        name,
        `gen-${name}`,
        "https://mcp.example.invalid/mcp",
        JSON.stringify({ resource: "https://mcp.example.invalid/mcp" }),
        "https://auth.example.invalid",
        JSON.stringify({
          issuer: "https://auth.example.invalid",
          authorization_endpoint: "https://auth.example.invalid/authorize",
          token_endpoint: "https://auth.example.invalid/token",
          registration_endpoint: "https://auth.example.invalid/register",
          response_types_supported: ["code"],
          code_challenge_methods_supported: ["S256"],
        }),
        seal(FLEET_CLIENT),
        tokens,
        tokens === null ? null : seal(FLEET_CLIENT),
        pending,
        SEALED_AT,
      ]
    );
  };
  const pendingOf = (signInState: string) =>
    seal({
      client: FLEET_CLIENT,
      redirectUri: FLEET_CLIENT.redirect_uris[0],
      verifier: `fixture-verifier-${signInState}`,
      state: signInState,
      expiresAt: SIGN_IN_LAPSES,
      access: "read",
    });
  oauth("linear-docs", pendingOf("4b0e2a0c-fixture-pending-1"), null);
  oauth(
    "figma-bridge",
    null,
    seal({ access_token: "figma_fleet_fixture_access", token_type: "Bearer" })
  );
  oauth("notes-index", otherKey, null);
  oauth(
    "local-search",
    seal({
      client: FLEET_CLIENT,
      redirectUri: FLEET_CLIENT.redirect_uris[0],
      verifier: "fixture-verifier-no-state",
      expiresAt: SIGN_IN_LAPSES,
    }),
    null
  );
  db.putMcpServer({ name: "trashed-signing-in", config: HTTP_SERVER });
  oauth(
    "trashed-signing-in",
    pendingOf("4b0e2a0c-fixture-pending-trashed"),
    null
  );
  sqlite.close();
  for (const key of ["github-trashed-fixture", "slack-trashed-fixture"]) {
    db.trash.put({ kind: "connection", key }, SEALED_AT);
  }
  db.trash.put({ kind: "mcp", key: "trashed-signing-in" }, SEALED_AT);
}

/** When the fixture's owed sends were accepted: 2026-10-05, a minute apart. */
const OWED_AT = Date.UTC(2026, 9, 5);

/**
 * Pending sends as migration 0421 finds them (`sent_messages.owed` beside
 * `envelope`), written by hand, as the hub writes each: owed with its kept
 * envelope the same (an accepted send held at the hub), owed alone (a
 * record from before envelopes were kept), an envelope alone (a send its
 * machine has), owed differing from its kept envelope (one its machine
 * handed back, the hub's reminder and the person's presence folded into
 * its words), and two owed envelopes that do not read: JSON with no
 * message beside a kept envelope that reads, and one not JSON with none
 * kept.
 */
function seedOwedSends(dbPath: string): void {
  const sqlite = new Database(dbPath);
  const live = sqlite
    .query<{ id: string; machineId: string }, []>(
      "SELECT id, machine_id AS machineId FROM instances WHERE status = 'starting' ORDER BY id LIMIT 2"
    )
    .all();
  const message = (uuid: string, content: string) => ({
    type: "user",
    uuid,
    message: { role: "user", content },
    origin: { kind: "human" },
    reminder: "Sent from the board.",
  });
  const envelopeOf = (
    to: { id: string; machineId: string },
    uuid: string,
    delivery: string,
    content: string
  ) => ({
    verb: "send",
    machineId: to.machineId,
    instanceId: to.id,
    payload: {
      instanceId: to.id,
      delivery,
      message: message(uuid, content),
    },
  });
  const words = "Check the migration on a real database.";
  const handedBack = (to: { id: string; machineId: string }) => {
    const sent = envelopeOf(to, "send-owed-different", "delivery-back", words);
    const { reminder: _reminder, ...rest } = sent.payload.message;
    return {
      ...sent,
      payload: {
        ...sent.payload,
        message: {
          ...rest,
          message: {
            role: "user",
            content: `${words}\n\n<system-reminder>\nSent from the board.\nThe person is on the board.\n</system-reminder>`,
          },
        },
      },
    };
  };
  const [first, second = first] = live;
  if (!(first && second)) {
    throw new Error("seedOwedSends: the fixture has no live session");
  }
  const same = JSON.stringify(
    envelopeOf(first, "send-owed-same", "delivery-same", words)
  );
  /** Each send: its uuid, its session, its owed and kept envelopes as stored, and the hand-off its record names. */
  const sends: [
    string,
    { id: string; machineId: string },
    string | null,
    string | null,
    string,
  ][] = [
    ["send-owed-same", first, same, same, "delivery-same"],
    [
      "send-owed-alone",
      first,
      JSON.stringify(
        envelopeOf(first, "send-owed-alone", "delivery-alone", words)
      ),
      null,
      "delivery-alone",
    ],
    [
      "send-owed-envelope-alone",
      second,
      null,
      JSON.stringify(
        envelopeOf(second, "send-owed-envelope-alone", "delivery-kept", words)
      ),
      "delivery-kept",
    ],
    [
      "send-owed-different",
      second,
      JSON.stringify(handedBack(second)),
      JSON.stringify(
        envelopeOf(second, "send-owed-different", "delivery-back", words)
      ),
      "delivery-back",
    ],
    [
      "send-owed-not-json",
      first,
      '{"verb":"send","machineId":',
      null,
      "delivery-cut",
    ],
    [
      "send-owed-no-message",
      second,
      JSON.stringify({
        verb: "send",
        machineId: second.machineId,
        payload: { instanceId: second.id, delivery: "delivery-gone" },
      }),
      JSON.stringify(
        envelopeOf(second, "send-owed-no-message", "delivery-gone", words)
      ),
      "delivery-gone",
    ],
  ];
  for (const [at, [uuid, to, owed, envelope, delivery]] of sends.entries()) {
    sqlite.run(
      "INSERT INTO sent_messages (uuid, instance_id, accepted_at, body, mode, state, owed, envelope, delivery) VALUES (?, ?, ?, ?, 'turn', 'pending', ?, ?, ?)",
      [
        uuid,
        to.id,
        OWED_AT + at * MINUTE_MS,
        JSON.stringify(message(uuid, words)),
        owed,
        envelope,
        delivery,
      ]
    );
  }
  sqlite.close();
}

/** When the fixture's skills, plugins, pauses and sign-ins were written: 2026-10-06. */
const FLEET_AT = Date.UTC(2026, 9, 6);

/** One file as a skill's `files` held it (core `SkillFile`). */
const skillFile = (path: string, content: Uint8Array, executable = false) => ({
  contentBase64: Buffer.from(content).toString("base64"),
  executable,
  path,
});

/** A skill's files as a fetch stores them: text, an executable script and bytes that are no UTF-8. */
const fetchedFiles = (name: string) => [
  skillFile(
    "SKILL.md",
    new TextEncoder().encode(
      `---\nname: ${name}\nversion: 1.2.0\ndescription: Checks a migration on a copy of a real database.\n---\n\nRun the check, read its counts, say what moved.\n`
    )
  ),
  skillFile(
    "scripts/check.sh",
    new TextEncoder().encode("set -eu\nbun run migrations:check\n"),
    true
  ),
  skillFile(
    "assets/mark.bin",
    Uint8Array.from([0xff, 0xfe, 0x00, 0x80, 0xc3, 0x28, 0x0a, 0x00])
  ),
];

/** A plugin's files as a fetch stores them. */
const pluginFilesOf = (name: string) => [
  skillFile(
    ".claude-plugin/plugin.json",
    new TextEncoder().encode(
      JSON.stringify({ name, version: "0.4.1", description: "Board tidying." })
    )
  ),
  skillFile(
    "hooks/tidy.sh",
    new TextEncoder().encode("set -eu\necho tidy\n"),
    true
  ),
  skillFile("assets/icon.bin", Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0xff])),
];

/** The bytes a list of files holds, decoded. */
const bytesOf = (files: { contentBase64: string }[]): number =>
  files.reduce(
    (total, file) => total + Buffer.byteLength(file.contentBase64, "base64"),
    0
  );

/**
 * Skills, plugins and kept skill versions as migrations 0422 and 0423 read
 * them, written by hand at the columns' shape before them: files that read
 * (text, an executable script and bytes that are no UTF-8), never set, not
 * JSON, partly readable (one file with no bytes), base64 that no one set of
 * bytes encodes to, two files at one path and an empty list; last fetches
 * placed whole and bare, never said, not JSON, an outcome no fetch has and
 * one partly readable (its time a text); a trashed skill and a trashed
 * plugin, one whose files and last fetch read and one whose do not.
 */
function seedFleetFiles(dbPath: string): void {
  const sqlite = new Database(dbPath);
  const refreshed = JSON.stringify({
    at: FLEET_AT,
    outcome: "updated",
    fromHash: "a".repeat(64),
    fromVersion: "1.1.0",
    toHash: "b".repeat(64),
    toVersion: "1.2.0",
  });
  const skillRows: [string, string | null, string | null][] = [
    [
      "migration-check",
      JSON.stringify(fetchedFiles("migration-check")),
      refreshed,
    ],
    [
      "board-scroll",
      JSON.stringify(fetchedFiles("board-scroll")),
      JSON.stringify({ at: FLEET_AT, outcome: "unchanged" }),
    ],
    ["release-proof", null, null],
    [
      "preview-pane",
      '[{"path":"SKILL.md","executable":false,"contentBase64":',
      '{"at":',
    ],
    [
      "queued-ask",
      JSON.stringify([
        fetchedFiles("queued-ask")[0],
        { path: "scripts/answer.sh", executable: true },
      ]),
      JSON.stringify({ at: FLEET_AT, outcome: "maybe" }),
    ],
    [
      "rail-title",
      JSON.stringify([
        { path: "SKILL.md", executable: false, contentBase64: "aGk" },
      ]),
      JSON.stringify({
        at: String(FLEET_AT),
        outcome: "failed",
        error: "timed out",
      }),
    ],
    [
      "canvas-pins",
      JSON.stringify([
        fetchedFiles("canvas-pins")[0],
        fetchedFiles("canvas-pins")[0],
      ]),
      null,
    ],
    ["stage-move", JSON.stringify([]), null],
  ];
  const hashOf = (raw: string | null): string | null => {
    if (raw === null) {
      return null;
    }
    try {
      const files = JSON.parse(raw);
      return Array.isArray(files) &&
        files.every((one) => one?.contentBase64 !== undefined)
        ? hashFiles(files)
        : "c".repeat(64);
    } catch {
      return "c".repeat(64);
    }
  };
  const bytesOfRaw = (raw: string | null): number | null => {
    try {
      const files = raw === null ? null : JSON.parse(raw);
      return Array.isArray(files)
        ? bytesOf(files.filter((one) => typeof one?.contentBase64 === "string"))
        : null;
    } catch {
      return null;
    }
  };
  for (const [n, [name, files, refresh]] of skillRows.entries()) {
    sqlite.run(
      "INSERT INTO skills (name, source, enabled, hash, bytes, error, files, version, last_refresh, created_at) VALUES (?, ?, 1, ?, ?, NULL, ?, ?, ?, ?)",
      [
        name,
        `skills:fixture/skills@${name}`,
        hashOf(files),
        bytesOfRaw(files),
        files,
        files === null ? null : "1.2.0",
        refresh,
        FLEET_AT + n * MINUTE_MS,
      ]
    );
  }
  const pluginRows: [string, string | null, string | null][] = [
    [
      "board-tidy@fixture",
      JSON.stringify(pluginFilesOf("board-tidy")),
      refreshed,
    ],
    ["release-notes@fixture", null, null],
    [
      "canvas-lint@fixture",
      JSON.stringify({ path: "plugin.json" }),
      JSON.stringify({ outcome: "updated" }),
    ],
  ];
  for (const [n, [pluginId, files, refresh]] of pluginRows.entries()) {
    sqlite.run(
      "INSERT INTO plugins (id, enabled, hash, bytes, error, files, version, last_refresh, created_at) VALUES (?, 1, ?, ?, NULL, ?, ?, ?, ?)",
      [
        pluginId,
        hashOf(files),
        bytesOfRaw(files),
        files,
        files === null ? null : "0.4.1",
        refresh,
        FLEET_AT + n * MINUTE_MS,
      ]
    );
  }
  const versions: [string, string][] = [
    [
      "migration-check",
      JSON.stringify(fetchedFiles("migration-check").slice(0, 2)),
    ],
    ["board-scroll", JSON.stringify(fetchedFiles("board-scroll"))],
    ["preview-pane", "SKILL.md"],
  ];
  for (const [n, [name, files]] of versions.entries()) {
    sqlite.run(
      "INSERT INTO fleet_skill_history (name, skill_source, hash, bytes, files, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        name,
        `skills:fixture/skills@${name}`,
        hashOf(files) ?? "c".repeat(64),
        bytesOfRaw(files) ?? 0,
        files,
        n === 1 ? "machine:obsidian" : "fleet",
        FLEET_AT + n * MINUTE_MS,
      ]
    );
  }
  // A trashed skill and a trashed plugin, kept as the trash keeps a row:
  // every column as the driver reads it.
  const trashed: [string, string, string, string | null, string | null][] = [
    [
      "skill",
      "skills",
      "trashed-skill",
      JSON.stringify(fetchedFiles("trashed-skill")),
      refreshed,
    ],
    ["plugin", "plugins", "trashed-plugin@fixture", "[1, 2]", '{"at":"soon"}'],
  ];
  for (const [n, [kind, table, key, files, refresh]] of trashed.entries()) {
    if (kind === "skill") {
      sqlite.run(
        "INSERT INTO skills (name, source, enabled, hash, bytes, files, version, last_refresh, created_at) VALUES (?, ?, 1, ?, ?, ?, '1.2.0', ?, ?)",
        [
          key,
          `skills:fixture/skills@${key}`,
          hashOf(files),
          bytesOfRaw(files),
          files,
          refresh,
          FLEET_AT,
        ]
      );
    } else {
      sqlite.run(
        "INSERT INTO plugins (id, enabled, hash, bytes, files, version, last_refresh, created_at) VALUES (?, 1, ?, NULL, ?, NULL, ?, ?)",
        [key, "d".repeat(64), files, refresh, FLEET_AT]
      );
    }
    const keyColumn = table === "skills" ? "name" : "id";
    const rows = sqlite
      .query<Record<string, string | number | null>, [string]>(
        `SELECT * FROM ${table} WHERE ${keyColumn} = ?`
      )
      .all(key);
    sqlite.run(`DELETE FROM ${table} WHERE ${keyColumn} = ?`, [key]);
    sqlite.run(
      "INSERT INTO config_trash (kind, key, rows, deleted_at) VALUES (?, ?, ?, ?)",
      [kind, key, JSON.stringify([{ table, rows }]), FLEET_AT + n * MINUTE_MS]
    );
  }
  sqlite.close();
}

/**
 * Machines' pauses, tools' sign-ins and machines' capabilities as migration
 * 0424 reads them, written by hand at the columns' shape before it: a pause
 * that read whole, never set, not counts (a text) and partly readable (a
 * kind no pause has); sign-ins that read whole (one in a word this build
 * does not know, one with words), never set, not JSON and partly readable
 * (no time); capabilities naming their os's platform, another, and none.
 */
function seedMachineColumns(dbPath: string): void {
  const sqlite = new Database(dbPath);
  // Far ahead, so the pauses still stand when the migration check's hub starts.
  const until = Date.UTC(2036, 0, 1);
  const pauses: [string, number | null, string | null][] = [
    ["obsidian", until, JSON.stringify({ "merge check": 2, command: 1 })],
    ["lumen", null, null],
    ["quarry", until, JSON.stringify({ "merge check": "two" })],
    ["marlin", until, JSON.stringify({ command: 1, deploy: 3 })],
  ];
  for (const [machineId, pausedUntil, stopped] of pauses) {
    sqlite.run(
      "UPDATE agents SET paused_until = ?, pause_stopped = ? WHERE machine_id = ?",
      [pausedUntil, stopped, machineId]
    );
  }
  const capabilities = (platform?: string) =>
    JSON.stringify({
      at: FLEET_AT,
      items: [
        {
          id: "git",
          available: true,
          installCommand: "",
          version: "2.47.1",
        },
      ],
      ...(platform === undefined ? {} : { platform }),
    });
  const named: [string, string][] = [
    ["obsidian", capabilities("linux")],
    ["marlin", capabilities("linux")],
    ["quarry", capabilities()],
  ];
  for (const [machineId, value] of named) {
    sqlite.run(
      "UPDATE agents SET machine_capabilities = ? WHERE machine_id = ?",
      [value, machineId]
    );
  }
  const signins: [string, string, string | null][] = [
    ["obsidian", "agy", JSON.stringify({ at: FLEET_AT, state: "signed-in" })],
    [
      "lumen",
      "agy",
      JSON.stringify({
        at: FLEET_AT,
        state: "expired",
        detail: "Token expired at 09:00.",
      }),
    ],
    [
      "quarry",
      "agy",
      JSON.stringify({
        at: FLEET_AT,
        state: "unknown",
        detail: "It printed nothing.",
      }),
    ],
    ["marlin", "agy", null],
    ["obsidian", "gemini", "signed-in"],
    ["lumen", "gemini", JSON.stringify({ state: "signed-out" })],
  ];
  for (const [machineId, toolId, signin] of signins) {
    sqlite.run(
      "INSERT INTO agent_tools (machine_id, tool_id, state, version, method, detail, at, signin) VALUES (?, ?, 'installed', '1.0.3', 'npm', NULL, ?, ?)",
      [machineId, toolId, FLEET_AT, signin]
    );
  }
  sqlite.close();
}

/** When the fixture's cold readings, waits and heads were stored: 2026-10-06, a minute apart. */
const KEPT_AT = Date.UTC(2026, 9, 6);

/** Where the waits since a last delivered message are seeded: past the items {@link seedOutputs} gives outputs. */
const FIRST_HISTORY = FIRST_OUTPUTS + 9;

/** Where an attempt's witnesses are seeded: past the items {@link FIRST_HISTORY} gives waits. */
const FIRST_WITNESSED = FIRST_HISTORY + 8;

/**
 * Every shape migrations 0425 to 0428 read in, written by hand as the hub's
 * writers stored each and as a hand edit could, beside rows never set:
 * sessions' cold readings (`instances.cache_cold`, keep-alive.ts
 * `keepAliveResult`: what a ping that missed its cache read, and when),
 * work items' waits since their last delivered message
 * (`work_items.wait_history`, work-items.ts `declareWait`: how many, the
 * last one's end and reason, a copy of the live wait while it lasts),
 * attempts' witnesses (`work_items.waited_on`, dispatch.ts `witnessesOf`:
 * each card or pin with the value it settled with) and retired workspaces'
 * heads (`workspaces.head`, workspaces.ts `closeWorkspace`: a branch and a
 * commit, with a carry or none). Each column has values that read whole,
 * that are not JSON, JSON `null` or another kind, and that read in part.
 */
function seedColdWaitsHeads(dbPath: string): void {
  const sqlite = new Database(dbPath);
  const sessions = sqlite
    .query<{ id: string }, []>(
      "SELECT id FROM instances ORDER BY rowid LIMIT 8 OFFSET 120"
    )
    .all()
    .map((row) => row.id);
  const colds: string[] = [
    JSON.stringify({ reason: "ping read 12%", at: KEPT_AT }),
    JSON.stringify({ reason: "ping reported no cache usage", at: KEPT_AT + 1 }),
    JSON.stringify({ reason: "ping read 4%", at: KEPT_AT + 2, ms: 900 }),
    "ping read 12%",
    "null",
    JSON.stringify(["ping read 12%", KEPT_AT]),
    JSON.stringify({ reason: "ping read 3%" }),
    JSON.stringify({ reason: 12, at: KEPT_AT + 3 }),
  ];
  for (const [n, cold] of colds.entries()) {
    const session = sessions[n];
    if (!session) {
      throw new Error(
        `The fixture has no session ${120 + n} to keep a cold reading on.`
      );
    }
    sqlite.run("UPDATE instances SET cache_cold = ? WHERE id = ?", [
      cold,
      session,
    ]);
  }
  const items = workItemIds(sqlite);
  const live = KEPT_AT + 30 * MINUTE_MS;
  const waiting = "the release proof is running on marlin";
  /** Each item's waits as stored, and the live wait beside them: its end and reason, or none. */
  const histories: [string, number | null, string | null][] = [
    [JSON.stringify({ count: 1, until: live, reason: waiting }), live, waiting],
    [
      JSON.stringify({ count: 3, until: KEPT_AT, reason: "CI is red on main" }),
      null,
      null,
    ],
    [
      JSON.stringify({ count: 2, until: KEPT_AT, reason: "CI is red on main" }),
      live,
      waiting,
    ],
    ["waited 2 times", null, null],
    ["null", null, null],
    [JSON.stringify({ count: 2, until: KEPT_AT }), null, null],
    [
      JSON.stringify({ count: "two", until: live, reason: waiting }),
      live,
      waiting,
    ],
    [JSON.stringify([1, KEPT_AT, waiting]), null, null],
  ];
  for (const [n, [history, until, reason]] of histories.entries()) {
    const item = items[FIRST_HISTORY + n];
    if (!item) {
      throw new Error(
        `The fixture has no work item ${FIRST_HISTORY + n} to keep waits on.`
      );
    }
    sqlite.run(
      "UPDATE work_items SET wait_history = ?, wait_until = ?, wait_reason = ? WHERE id = ?",
      [history, until, reason, item]
    );
  }
  const card = (name: string) => `0b6c41d2-5f1e-4d7a-9c3e-2a8f4e61b0d7#${name}`;
  const pin = "0b6c41d2-5f1e-4d7a-9c3e-2a8f4e61b0d7/3";
  const witness = (target: string, value: string) => ({ target, value });
  const witnesses: string[] = [
    "[]",
    JSON.stringify([witness(card("layout"), "Two columns")]),
    JSON.stringify([
      witness(card("layout"), "Two columns"),
      witness(card("motion"), "Spring, 240ms"),
      witness(pin, "resolved"),
    ]),
    JSON.stringify([
      witness(card("layout"), "Two columns"),
      witness(card("layout"), "Two columns"),
    ]),
    JSON.stringify([{ ...witness(card("copy"), "Short"), at: KEPT_AT }]),
    `${card("layout")}=Two columns`,
    "null",
    JSON.stringify(witness(card("layout"), "Two columns")),
    JSON.stringify([{ target: card("layout") }]),
    JSON.stringify([
      witness(card("layout"), "Two columns"),
      7,
      { target: card("motion") },
      witness(pin, "resolved"),
    ]),
    JSON.stringify([
      witness(card("layout"), "Two columns"),
      witness(card("layout"), "One column"),
      witness(card("motion"), "Spring, 240ms"),
    ]),
  ];
  for (const [n, list] of witnesses.entries()) {
    const item = items[FIRST_WITNESSED + n];
    if (!item) {
      throw new Error(
        `The fixture has no work item ${FIRST_WITNESSED + n} to keep witnesses on.`
      );
    }
    sqlite.run("UPDATE work_items SET waited_on = ? WHERE id = ?", [
      list,
      item,
    ]);
  }
  const workspaces = sqlite
    .query<{ id: string }, []>(
      "SELECT id FROM workspaces ORDER BY rowid LIMIT 8 OFFSET 20"
    )
    .all()
    .map((row) => row.id);
  const commit = gitName("HEAD as the clone retired");
  const carry = "/home/dev/.cawco/carries/7f3e1c20";
  const heads: string[] = [
    JSON.stringify({ branch: "main", commit }),
    JSON.stringify({ branch: "cawco/7f3e1c20", commit, carry }),
    JSON.stringify({ branch: "main", commit, at: KEPT_AT }),
    `main@${commit}`,
    "null",
    JSON.stringify({ branch: "main" }),
    JSON.stringify({ branch: "main", commit, carry: null }),
    JSON.stringify([commit, "main"]),
  ];
  for (const [n, head] of heads.entries()) {
    const workspace = workspaces[n];
    if (!workspace) {
      throw new Error(
        `The fixture has no workspace ${20 + n} to keep a head on.`
      );
    }
    sqlite.run(
      "UPDATE workspaces SET state = 'archived', head = ? WHERE id = ?",
      [head, workspace]
    );
  }
  sqlite.close();
}

/**
 * Every shape migrations 0429 to 0432 read in, written by hand, as the hub
 * writes each and as a hand edit could leave one:
 *
 * - compaction plans beside {@link seedLiftedColumns}'s: a move a person
 *   asked for whose credential was refused, one a forecast moved, a line
 *   that is not a moved one, a moved line missing a field, a filing's
 *   reading whose numbers are text, and one that is JSON `null`;
 * - Who decides' hearing and poses on {@link seedPlatformsRoutes}'s rows:
 *   placed whole, partly readable, never set, an empty object, and ones
 *   that are not JSON or not an object;
 * - three more tracker bindings beside {@link seedTracker}'s: a cursor
 *   that is not JSON, one whose comments do not read, and one with no
 *   comments at all;
 * - six Claude accounts' readings: extra usage placed (on and rejected),
 *   never said, partly readable, not JSON and JSON `null`; a window set
 *   named, never named, empty, with a key named twice, with a key that is
 *   not text, and not JSON.
 */
/**
 * Asks a session's process is parked on, kept across the hub's restarts
 * (`parked_asks`), whose call input migration 0434's step seals: a Bash
 * call whose command carries a credential-shaped token and an MCP call
 * whose input names a key by its field, both as the hub kept them (the
 * envelope whole, its input in it). Each token is made here and holds no
 * real credential.
 */
function seedParkedAsks(dbPath: string): void {
  const sqlite = new Database(dbPath);
  const [session] = sqlite
    .query<{ id: string; machineId: string }, []>(
      "SELECT id, machine_id AS machineId FROM instances WHERE status = 'starting' ORDER BY id LIMIT 1"
    )
    .all();
  if (!session) {
    throw new Error("the lists fixture's parked asks need a session starting");
  }
  const envelope = (requestId: string, payload: object) =>
    JSON.stringify({
      verb: "frames",
      machineId: session.machineId,
      instanceId: session.id,
      requestId,
      payload: {
        kind: "permission_request",
        instanceId: session.id,
        requestId,
        raisedAt: KEPT_AT,
        harness: "claude",
        ...payload,
      },
    });
  const asks: [string, string][] = [
    [
      "parked-bash",
      envelope("parked-bash", {
        toolName: "Bash",
        input: {
          command: `GITHUB_TOKEN=${PARKED_TOKEN} git push origin main`,
          description: "Push the release branch",
        },
        presentation: {
          asker: "Fixture session",
          summary: "Run a command",
          command: `GITHUB_TOKEN=${PARKED_TOKEN} git push origin main`,
          detail: "Push the release branch",
          changes: [],
          fields: [],
        },
      }),
    ],
    [
      "parked-mcp",
      envelope("parked-mcp", {
        toolName: "mcp__search__query",
        input: { apiKey: PARKED_KEY, query: "release notes" },
        presentation: {
          asker: "Fixture session",
          summary: "Use search's query",
          changes: [],
          fields: [{ key: "query", value: "release notes" }],
        },
      }),
    ],
  ];
  for (const [requestId, stored] of asks) {
    sqlite.run(
      "INSERT INTO parked_asks (request_id, instance_id, machine_id, envelope) VALUES (?, ?, ?, ?)",
      [requestId, session.id, session.machineId, stored]
    );
  }
  sqlite.close();
}

/**
 * A fleet MCP server the hub keeps sealed (`mcp_servers.config`), started on
 * the machine with an `env` value under a credential's name, a known value
 * (src/known-values.ts), and one under a path's name, which is not.
 */
function seedKnownValues(db: HubDb): void {
  db.putMcpServer({
    name: KNOWN_SERVER,
    config: {
      command: "npx",
      args: ["-y", "@example/release-notes-mcp"],
      env: { [KNOWN_ENV_NAME]: KNOWN_ENV_VALUE, CHROME_PATH: KNOWN_PATH },
    },
  });
}

/**
 * A session's credential, kept as its hash (`session_identities`, as
 * session-identity.ts `mint` keeps it), and a line the hub keeps in that
 * session's transcript (`session_lines`, fleet watch's) quoting the
 * credential and the MCP server's env values ({@link seedKnownValues}), as
 * it was stored before the known values were replaced where text enters
 * the hub: what migrations:check runs through the known values, and
 * known-values-count counts.
 */
function seedKnownLine(dbPath: string): void {
  const sqlite = new Database(dbPath);
  const [session] = sqlite
    .query<{ id: string }, []>(
      "SELECT id FROM instances WHERE id NOT IN (SELECT instance_id FROM session_identities) ORDER BY id LIMIT 1"
    )
    .all();
  if (!session) {
    throw new Error(
      "the lists fixture's known values need a session with no credential"
    );
  }
  sqlite.run(
    "INSERT INTO session_identities (instance_id, credential_hash, installed_at) VALUES (?, ?, ?)",
    [
      session.id,
      createHash("sha256").update(KNOWN_CREDENTIAL).digest("hex"),
      KEPT_AT,
    ]
  );
  sqlite.run(
    "INSERT INTO session_lines (instance_id, kind, id, at, content, stayed) VALUES (?, 'watch', ?, ?, ?, NULL)",
    [
      session.id,
      KNOWN_LINE,
      KEPT_AT,
      `Fleet watch: this session ran \`${KNOWN_ENV_NAME}=${KNOWN_ENV_VALUE} CHROME_PATH=${KNOWN_PATH} bun run release-notes\` four times, and printed CAWCO_SESSION_CREDENTIAL=${KNOWN_CREDENTIAL} in its tool result.`,
    ]
  );
  sqlite.close();
}

function seedPlansSettingsCursorsReadings(dbPath: string): void {
  const sqlite = new Database(dbPath);
  const sessions = sqlite
    .query<{ id: string }, []>(
      "SELECT id FROM instances WHERE status = 'stopping' ORDER BY id LIMIT 6"
    )
    .all()
    .map((row) => row.id);
  const moved = {
    kind: "moved",
    from: WORK,
    to: HOME,
    sameOrganization: false,
    tokens: 188_000,
    window: "5-hour limit",
    resetsAt: RESETS,
    compact: "compacting",
  };
  const plans: [string | null, string | null, string | null][] = [
    [
      JSON.stringify({
        ...moved,
        asked: true,
        because: { kind: "refused" },
        relaunched: true,
      }),
      null,
      "compact-refused",
    ],
    [
      JSON.stringify({
        ...moved,
        because: { kind: "forecast", runsOutAt: RESETS - 30 * MINUTE_MS },
        cost: { pct: 12, window: "5-hour limit" },
      }),
      null,
      "compact-forecast",
    ],
    [
      JSON.stringify({
        kind: "moving",
        from: WORK,
        to: HOME,
        at: RESETS,
        tokens: 240_000,
      }),
      null,
      "compact-moving",
    ],
    [
      JSON.stringify({ kind: "moved", from: WORK, to: HOME, tokens: 9 }),
      null,
      "compact-partial",
    ],
    [null, JSON.stringify({ compactsAt: "200000", tokens: 181_000 }), null],
    [null, "null", null],
  ];
  for (const [at, [move, fill, compactUuid]] of plans.entries()) {
    sqlite.run(
      "INSERT INTO limit_compactions (instance_id, stage, line_id, move, fill, filing_uuid, compact_uuid, compacted, created_at) VALUES (?, 'compacting', ?, ?, ?, ?, ?, 0, ?)",
      [
        sessions[at] ?? "",
        `line-plan-${3 + at}`,
        move,
        fill,
        `filing-${3 + at}`,
        compactUuid,
        RESETS,
      ]
    );
  }
  const settings: [string, string | null, string | null][] = [
    [
      "decides",
      JSON.stringify({ advisor: "later", practice: 7 }),
      JSON.stringify({ caw: "rocket", advisor: "laptop" }),
    ],
    [
      "fixture-every",
      JSON.stringify({ advisor: "later", practice: "each" }),
      JSON.stringify({
        caw: "dancing",
        advisor: "chart",
        practice: "sheets",
        asker: "done",
      }),
    ],
    ["fixture-unset", null, "{}"],
    ["fixture-unreadable", "advisor: later", "[]"],
  ];
  for (const [row, hear, pictures] of settings) {
    sqlite.run(
      "UPDATE decides_settings SET hear = ?, pictures = ? WHERE id = ?",
      [hear, pictures, row]
    );
  }
  const projects = sqlite
    .query<{ id: string }, []>(
      "SELECT id FROM projects WHERE id NOT IN (SELECT project_id FROM tracker_bindings) ORDER BY id LIMIT 3"
    )
    .all()
    .map((row) => row.id);
  const boundAt = Date.UTC(2026, 9, 1);
  const since = boundAt + 30 * HOUR_MS;
  const cursors = [
    "since 2026-10-02, comments since 2026-10-02",
    JSON.stringify({
      since,
      etag: 'W/"7d1f3a"',
      commentsSince: "yesterday",
      commentsEtag: null,
    }),
    JSON.stringify({ since, etag: null }),
  ];
  for (const [at, cursor] of cursors.entries()) {
    const projectId = projects[at] ?? "";
    sqlite.run(
      "INSERT INTO tracker_bindings (project_id, provider, connection, target, target_name, target_url, bound_at, cursor, state, reason, polled_at, resume_at, github_project, github_project_reason) VALUES (?, 'github', 'github-dev', ?, ?, ?, ?, ?, 'synced', NULL, ?, NULL, NULL, NULL)",
      [
        projectId,
        `dev/${projectId}`,
        `dev/${projectId}`,
        `https://github.com/dev/${projectId}`,
        boundAt,
        cursor,
        since,
      ]
    );
  }
  const readings: [string | null, string | null][] = [
    [
      JSON.stringify({
        inUse: true,
        status: "allowed",
        disabledReason: null,
        resetsAt: "2026-11-01T00:00:00.000Z",
      }),
      JSON.stringify(["five_hour", "seven_day", "seven_day_opus"]),
    ],
    [null, null],
    [JSON.stringify({ inUse: "yes", status: "allowed" }), "[]"],
    ["allowed", JSON.stringify(["five_hour", 7])],
    ["null", "five_hour"],
    [
      JSON.stringify({
        inUse: false,
        status: "rejected",
        disabledReason: "out_of_credits",
        resetsAt: null,
      }),
      JSON.stringify(["five_hour", "five_hour"]),
    ],
  ];
  for (const [at, [overage, windowKinds]] of readings.entries()) {
    const accountId = `acct-reading-${at}`;
    sqlite.run(
      "INSERT INTO accounts (id, provider, kind, label, hue, \"order\", never_backup, created_at, at_plan_limit) VALUES (?, 'claude', 'subscription', ?, ?, ?, 0, ?, 'move')",
      [
        accountId,
        `Claude ${at + 1}`,
        at % 2 === 0 ? "blue" : "violet",
        10 + at,
        boundAt,
      ]
    );
    sqlite.run(
      "INSERT INTO account_readings (account_id, subscription, overage, last_seen_at, window_kinds) VALUES (?, 'max', ?, ?, ?)",
      [accountId, overage, since, windowKinds]
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
    seedContinuations(db, sessions);
    seedMoves(db, projects);
    seedSessionPlans(db, sessions);
    await seedSealedFacts(db, dbPath);
    seedKnownValues(db);
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
    seedContinuationsByHand(dbPath);
    seedMovesByHand(dbPath);
    seedRelayPorts(dbPath);
    seedSessionPlansByHand(dbPath);
    seedOwedSends(dbPath);
    seedFleetFiles(dbPath);
    seedMachineColumns(dbPath);
    seedColdWaitsHeads(dbPath);
    seedPlansSettingsCursorsReadings(dbPath);
    seedParkedAsks(dbPath);
    seedKnownLine(dbPath);
  }
}

const out = flag("--seed");
if (out) {
  const scratch = mkdtempSync(join(tmpdir(), "cawco-fixture-db-"));
  try {
    const dbPath = join(scratch, "hub.db");
    mkdirSync(join(scratch, "home"));
    // The fixtures' key beside it: every value its hub seals opens in the check.
    writeFixtureKey(scratch);
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
  for (const name of [
    "fixture-db.ts",
    "fixture-db-values.ts",
    "hub-in-process.ts",
    "shipped.ts",
  ]) {
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
