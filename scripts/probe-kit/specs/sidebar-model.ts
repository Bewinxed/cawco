/**
 * The sidebar lists, per project, the sessions the person started and that
 * project's unarchived Caw threads; delegates, Caw's sessions and agents'
 * checks only nest under the session that started them; every session
 * appears under exactly one project, its own (owner, on Cawco-Dev's rail:
 * "looks like many delegate sessions show up instead of actual sessions";
 * "also many sessions of cawco-dev show up under other projects like
 * hyucksfield").
 *
 *   bun scripts/probe-kit/run.ts sidebar-model
 *
 * A scratch fleet (real hub, agent and sessiond, Claude Code against the
 * mock model) with three projects whose folders nest as the owner's do: one
 * at the fleet's home (`~`, his HyucksField), one at `~/cockpit` and one at
 * `~/anbar`. In them:
 *
 *  - a person's session in each (P and P2 in cockpit, H at home, A in anbar);
 *  - a delegate tree three deep under P (host-scope delegates, no boundary,
 *    each in the home folder, so a rule walking outward from its folder
 *    would place it at home);
 *  - a delegate F under P whose work item ends (finish_item), then asleep;
 *  - a delegate E under P2 that keeps working while P2 ended long ago;
 *  - a delegate X under P whose parent is then deleted;
 *  - P's `start_session` check C, in the home folder;
 *  - a start from a page marked as P's, as P's DevTools gate marks every
 *    page P opens in its project's browser (`sidebar-gated` drives the gate
 *    itself, on the host): G, in the home folder, naming no parent and no
 *    project;
 *  - the person's own start N under P, in the home folder, naming the home
 *    project: listed under P, so P's project's;
 *  - two Caw threads in cockpit, T1 and T2, and a session K Caw's turn in
 *    T2 started.
 *
 * P2 ends before E starts under it, and F is put to sleep. Then a day
 * passes: the hub starts again on a clock 25 hours on (clock-ahead.ts, a
 * preload), reading every row as it would a day later; X's parent row is
 * gone meanwhile. Asserted on the hub (rows, the board) and on the built
 * dashboard, on Chromium and WebKit at 1440 and at 390:
 *
 *  - every origin and project as stamped at the start, never the folder's;
 *  - each row appears exactly once, under its own project;
 *  - only person sessions and unarchived threads are top-level;
 *  - E nests under P2, its listed ancestor, which the board carries;
 *  - F leaves a day after its item ended, though asleep; X is listed
 *    nowhere, never promoted;
 *  - Archive from T2's row menu takes T2 and K off the rail; Unarchive
 *    from Caw's panel, its Archived filter, brings both back; a new
 *    message in an archived thread unarchives it;
 *  - forgetting the home project stops H alone: no session of cockpit.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gatedPageScript } from "../../../packages/core/src/browser-gate";
import { sidebarWords, threadWords } from "../../../packages/core/src/index";
import {
  MACHINE,
  MODEL,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec } from "../kit";
import { startsWith } from "../words";

const START_TOOL = "mcp__cawco__start_session";
const FINISH_TOOL = "mcp__cawco__finish_item";
/** P's prompt: start the check. */
const START = "SIDEBAR: start the check.";
/** F's brief: end its item. */
const FINISH = "SIDEBAR: finish now.";
/** A brief that keeps its session working until its file is there. */
const KEEP = /SIDEBAR keep working until (\S+)\./;
/** The home folder, as the check is started in it (set as the fleet stands). */
let home = "";
/** Caw's seat on cockpit's page: what opens his panel. */
const CAW_SEAT = /^Caw, lead of Cockpit/;
/** P has called start_session: it is called once. */
let checkCalled = false;

const HOUR = 60 * 60 * 1000;

/** A turn that works until `flag` is there. */
const waitFor = (flag: string): Reply => ({
  everyMs: 5,
  words: ["waiting"],
  tool: {
    name: "Bash",
    input: {
      command: `until [ -e ${flag} ]; do sleep 0.2; done`,
      description: "Wait",
      timeout: 600_000,
    },
  },
});

const respond = (request: Seen): Reply => {
  const flag = KEEP.exec(request.all)?.[1];
  if (flag && !request.afterTool) {
    return waitFor(flag);
  }
  if (
    request.last.includes(FINISH) &&
    !request.afterTool &&
    request.toolNames.includes(FINISH_TOOL)
  ) {
    return {
      everyMs: 5,
      words: ["Done."],
      tool: {
        name: FINISH_TOOL,
        input: { headline: "Done.", summary: "Nothing to land." },
      },
    };
  }
  // start_session is deferred in Claude Code: found through ToolSearch
  // first, then called once it is offered.
  if (request.all.includes(START) && !checkCalled) {
    if (request.toolNames.includes(START_TOOL)) {
      checkCalled = true;
      return {
        everyMs: 5,
        words: ["Starting it."],
        tool: {
          name: START_TOOL,
          input: {
            cwd: home,
            prompt: "SIDEBAR check child: rest.",
            title: "Check child",
          },
        },
      };
    }
    if (!request.afterTool && request.toolNames.includes("ToolSearch")) {
      return {
        everyMs: 5,
        words: [],
        tool: {
          name: "ToolSearch",
          input: { query: `select:${START_TOOL}`, max_results: 1 },
        },
      };
    }
  }
  return { everyMs: 5, words: ["ok"] };
};

interface Row {
  end_intent: string | null;
  id: string;
  origin: string;
  parent_instance_id: string | null;
  project_id: string | null;
  status: string;
}

/** A host-scope delegate under `parent`, filed as `delegate` files it; its session's id. */
const delegate = async (
  fleet: KitFleet,
  parent: string,
  title: string,
  prompt: string,
  canDelegate = false
): Promise<{ instanceId: string; workItemId: string }> => {
  const started = await fleet.api<{ instanceId: string; workItemId: string }>(
    "/api/work-items",
    {
      parentInstanceId: parent,
      title,
      prompt,
      harness: "claude",
      model: MODEL.claude,
      host: true,
      ...(canDelegate ? { canDelegate: true } : {}),
    }
  );
  await until(
    `${title}'s session`,
    () => fleet.instance(started.instanceId)?.status,
    (status) => status === "running" || status === "sleeping",
    180_000
  );
  return started;
};

/**
 * A session started from a page that carries an agent's mark, as the
 * agent's DevTools gate marks every page the agent opens in its project's
 * browser (gate.ts `#mark`: core `gatedPageScript`, the gate id that owns
 * it, defined in every document). The page is the kit's Chromium with the
 * same script on it: the gate's own browser needs user namespaces for its
 * sandbox, which a workspace's boundary refuses, so the gate itself marking
 * the page runs in `sidebar-gated`, on the host. From the dashboard's own
 * socket, which names the mark, a New session start that names neither
 * parent nor project, in the home folder. Its id.
 */
async function markedStart(
  kit: Kit,
  fleet: KitFleet,
  base: string,
  owner: string
): Promise<string> {
  const page = await kit.page("desk");
  await page.addInitScript(gatedPageScript(owner));
  await open(page, `${base}/session`, "body", 120_000);
  await page.waitForFunction(
    () =>
      (globalThis as { __cawcoSocket?: WebSocket }).__cawcoSocket
        ?.readyState === 1,
    undefined,
    { timeout: 90_000 }
  );
  const instanceId = crypto.randomUUID();
  const envelope = {
    verb: "spawn",
    machineId: MACHINE,
    instanceId,
    requestId: crypto.randomUUID(),
    payload: {
      instanceId,
      cwd: home,
      harness: "claude",
      model: MODEL.claude,
      title: "Gated start",
      permissionMode: "bypassPermissions",
    },
  };
  await page.evaluate((message) => {
    (globalThis as { __cawcoSocket?: WebSocket }).__cawcoSocket?.send(message);
  }, JSON.stringify(envelope));
  await until(
    "the marked page's start",
    () => fleet.instance(instanceId)?.status,
    (status) => status === "running" || status === "sleeping",
    180_000
  );
  await page.close();
  return instanceId;
}

/** Each project's rows in the rail, each with the row it hangs under (null: the project's top). */
type Rail = Record<string, { id: string; parent: string | null }[]>;

const readRail = (page: import("playwright-core").Page): Promise<Rail> =>
  page.evaluate(() => {
    const out: Record<string, { id: string; parent: string | null }[]> = {};
    for (const item of document.querySelectorAll(
      'li[data-sidebar="menu-item"]'
    )) {
      const link = item.querySelector('a[href^="/project/"]');
      if (!link) {
        continue;
      }
      const id = decodeURIComponent(
        (link.getAttribute("href") ?? "").slice("/project/".length)
      );
      out[id] = [...item.querySelectorAll("li[data-session-row]")].map(
        (row) => {
          const up = row.parentElement?.closest("li[data-session-row]");
          return {
            id: row.getAttribute("data-session-row") ?? "",
            parent:
              up && item.contains(up)
                ? up.getAttribute("data-session-row")
                : null,
          };
        }
      );
    }
    return out;
  });

/** Opens every folded tree in the rail's projects, one mark at a time. */
async function unfold(page: import("playwright-core").Page): Promise<void> {
  const closed = page.locator(
    '[data-sidebar="menu-sub"] [data-slot="hit"][aria-expanded="false"]'
  );
  for (let round = 0; round < 12; round += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: one fold at a time, each opening the rows under it
    const count = await closed.count();
    if (count === 0) {
      return;
    }
    await closed.first().click();
    await page
      .waitForFunction(
        (before) =>
          document.querySelectorAll(
            '[data-sidebar="menu-sub"] [data-slot="hit"][aria-expanded="false"]'
          ).length !== before ||
          document.querySelectorAll(
            '[data-sidebar="menu-sub"] [data-slot="hit"][aria-expanded="true"]'
          ).length > 0,
        count,
        { timeout: 10_000 }
      )
      .catch(() => undefined);
  }
}

/** The rail in front: on a phone, the sheet its burger opens. */
async function showRail(
  page: import("playwright-core").Page,
  phone: boolean
): Promise<void> {
  if (phone) {
    const burger = page.getByRole("button", {
      name: sidebarWords.openNavigation,
    });
    if (await burger.isVisible().catch(() => false)) {
      await burger.click();
    }
  }
  await page.waitForSelector(
    'li[data-sidebar="menu-item"] a[href^="/project/"]',
    {
      timeout: 60_000,
    }
  );
}

interface Expected {
  /** Ids that must stand nowhere in the rail. */
  absent: string[];
  /** Each row the rail must hold: its project and the row it hangs under (null: top). */
  rows: Record<string, { parent: string | null; project: string }>;
}

/** Holds the rail to the model: each row once, under its own project, tops only a person's or a thread. */
function holdRail(
  kit: Kit,
  where: string,
  rail: Rail,
  want: Expected,
  tops: Set<string>
): void {
  const seen = new Map<string, { parent: string | null; project: string }[]>();
  for (const [project, rows] of Object.entries(rail)) {
    for (const row of rows) {
      seen.set(row.id, [
        ...(seen.get(row.id) ?? []),
        { project, parent: row.parent },
      ]);
    }
  }
  const misplaced = Object.entries(want.rows).flatMap(([id, at]) => {
    const found = seen.get(id) ?? [];
    return found.length === 1 &&
      found[0]?.project === at.project &&
      found[0]?.parent === at.parent
      ? []
      : [
          `${id.slice(0, 13)}: wanted ${JSON.stringify(at)}, found ${JSON.stringify(found)}`,
        ];
  });
  kit.check(
    `${where}: each row appears exactly once, under its own project and its own parent`,
    misplaced.length === 0,
    misplaced.join("; ")
  );
  const twice = [...seen].filter(([, found]) => found.length > 1);
  kit.check(
    `${where}: no row stands in two places`,
    twice.length === 0,
    JSON.stringify(twice)
  );
  const strayTops = Object.values(rail)
    .flat()
    .filter((row) => row.parent === null && !tops.has(row.id))
    .map((row) => row.id);
  kit.check(
    `${where}: only person sessions and unarchived threads are top-level`,
    strayTops.length === 0,
    `tops besides them: ${JSON.stringify(strayTops)}`
  );
  const shown = want.absent.filter((id) => seen.has(id));
  kit.check(
    `${where}: ${want.absent.length} row(s) whose chain ends at no top stand nowhere`,
    shown.length === 0,
    JSON.stringify(shown)
  );
}

/** The fleet's three projects, their folders nesting as the owner's do. */
interface Projects {
  anbarDir: string;
  anbarId: string;
  cockpitDir: string;
  cockpitId: string;
  homeId: string;
}

/** Every session the spec starts, by the letter its doc names it. */
interface Sessions {
  A: string;
  C: string;
  D1: string;
  D2: string;
  D3: string;
  E: string;
  F: { instanceId: string; workItemId: string };
  G: string;
  H: string;
  K: string;
  N: string;
  P: string;
  P2: string;
  X: string;
}

/** The fleet, and its projects at `~`, `~/cockpit` and `~/anbar`. */
async function standUp(kit: Kit): Promise<{ fleet: KitFleet; ids: Projects }> {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  ({ home } = fleet);
  const cockpitDir = join(home, "cockpit");
  const anbarDir = join(home, "anbar");
  for (const dir of [cockpitDir, anbarDir]) {
    // biome-ignore lint/performance/noAwaitInLoops: one repository at a time
    await mkdir(dir, { recursive: true });
    await Bun.$`git init -q -b main && echo code > README.md && git -c user.name=O -c user.email=o@probe.test add -A && git -c user.name=O -c user.email=o@probe.test commit -qm 'First commit'`
      .cwd(dir)
      .quiet();
  }
  const project = async (name: string, cwd: string) =>
    (
      await fleet.api<{ id: string }>("/api/projects", {
        name,
        machineId: MACHINE,
        cwd,
        caw: false,
      })
    ).id;
  // The home project first: the oldest, as the owner's HyucksField is.
  const homeId = await project("Home folder", home);
  const cockpitId = await project("Cockpit", cockpitDir);
  const anbarId = await project("Anbar", anbarDir);
  return {
    fleet,
    ids: { homeId, cockpitId, anbarId, cockpitDir, anbarDir },
  };
}

/** Every session of the doc's list, started as each is started in the product. */
async function startAll(
  kit: Kit,
  fleet: KitFleet,
  ids: Projects,
  base: string,
  keep: string
): Promise<Sessions> {
  const person = (title: string, cwd: string, projectId: string) =>
    fleet.spawn("claude", title, cwd, { projectId });
  const P = await person("Person in cockpit", ids.cockpitDir, ids.cockpitId);
  const P2 = await person("Person who ended", ids.cockpitDir, ids.cockpitId);
  const H = await person("Person at home", home, ids.homeId);
  const A = await person("Person in anbar", ids.anbarDir, ids.anbarId);
  // A delegate tree three deep under P, each in the home folder.
  const D1 = await delegate(fleet, P, "Depth one", keep, true);
  const D2 = await delegate(fleet, D1.instanceId, "Depth two", keep, true);
  const D3 = await delegate(fleet, D2.instanceId, "Depth three", keep);
  // F: its item ends.
  const F = await delegate(fleet, P, "Finished delegate", FINISH);
  await until(
    "F's item done",
    () =>
      fleet.query<{ state: string }>(
        "SELECT state FROM work_items WHERE id = ?",
        F.workItemId
      )[0]?.state,
    (state) => state === "done",
    120_000
  );
  // P2 ends (the person's Stop) before E starts under it, so E works on.
  await fleet.stopSession(P2);
  await until(
    "P2 stopped",
    () =>
      fleet.query<{ end_confirmed_at: number | null; status: string }>(
        "SELECT status, end_confirmed_at FROM instances WHERE id = ?",
        P2
      )[0],
    (p2) => p2?.status === "stopped" && p2.end_confirmed_at !== null,
    120_000
  );
  const E = await delegate(fleet, P2, "Still working", keep);
  // X: its parent row goes. K: what Caw's turn in T2 started.
  const X = await delegate(fleet, P, "Orphaned delegate", keep);
  const K = await delegate(fleet, P, "Caw's work", keep);
  // C: P's start_session, in the home folder.
  await fleet.send(P, START);
  const [check] = await until(
    "P's check",
    () =>
      fleet.query<Row>(
        "SELECT id, origin, project_id, parent_instance_id, status, end_intent FROM instances WHERE parent_instance_id = ? AND work_item_id IS NULL",
        P
      ),
    (found) => found.length === 1,
    180_000
  );
  // G: started from a page marked as P's, as P's gate marks its pages.
  const G = await markedStart(kit, fleet, base, P);
  // N: the person's own start under P, in the home folder, naming the home
  // project: it is listed under P, so it is P's project's.
  const N = await fleet.spawn("claude", "Person's under P", home, {
    projectId: ids.homeId,
    parent: { instanceId: P },
  });
  return {
    N,
    P,
    P2,
    H,
    A,
    D1: D1.instanceId,
    D2: D2.instanceId,
    D3: D3.instanceId,
    F,
    E: E.instanceId,
    X: X.instanceId,
    K: K.instanceId,
    C: check?.id ?? "",
    G,
  };
}

/** A thread with cockpit's Caw, as his panel lists it; its id. */
const threadIn = (fleet: KitFleet, projectId: string, title: string) => {
  const id = crypto.randomUUID();
  const at = Date.now();
  fleet.write(
    "INSERT INTO project_threads (id, project_id, title, setup, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
    id,
    projectId,
    title,
    at,
    at
  );
  fleet.write(
    "INSERT INTO thread_messages (id, thread_id, author, body, created_at) VALUES (?, ?, 'you', ?, ?)",
    crypto.randomUUID(),
    id,
    title,
    at
  );
  return id;
};

/** Each row's origin, project and parent, as the hub stamped them at its start. */
function holdStamps(
  kit: Kit,
  fleet: KitFleet,
  ids: Projects,
  s: Sessions
): void {
  const all = [
    s.P,
    s.P2,
    s.H,
    s.A,
    s.D1,
    s.D2,
    s.D3,
    s.F.instanceId,
    s.E,
    s.C,
    s.G,
    s.N,
  ];
  const rows = new Map(
    fleet
      .query<Row>(
        `SELECT id, origin, project_id, parent_instance_id, status, end_intent FROM instances WHERE id IN (${all.map(() => "?").join(", ")})`,
        ...all
      )
      .map((row) => [row.id, row])
  );
  const stamped = (
    id: string,
    origin: string,
    projectId: string,
    parent: string | null
  ) => {
    const row = rows.get(id);
    return (
      row?.origin === origin &&
      row.project_id === projectId &&
      row.parent_instance_id === parent
    );
  };
  const { cockpitId } = ids;
  kit.check(
    "the hub: each person's session is `person`, in the project it was started in",
    stamped(s.P, "person", cockpitId, null) &&
      stamped(s.P2, "person", cockpitId, null) &&
      stamped(s.H, "person", ids.homeId, null) &&
      stamped(s.A, "person", ids.anbarId, null),
    JSON.stringify([s.P, s.P2, s.H, s.A].map((id) => rows.get(id)))
  );
  kit.check(
    "the hub: each delegate is `delegate`, in its parent's project though it runs in the home folder",
    stamped(s.D1, "delegate", cockpitId, s.P) &&
      stamped(s.D2, "delegate", cockpitId, s.D1) &&
      stamped(s.D3, "delegate", cockpitId, s.D2) &&
      stamped(s.F.instanceId, "delegate", cockpitId, s.P) &&
      stamped(s.E, "delegate", cockpitId, s.P2),
    JSON.stringify(
      [s.D1, s.D2, s.D3, s.F.instanceId, s.E].map((id) => rows.get(id))
    )
  );
  kit.check(
    "the hub: P's start_session in the home folder is `check`, under P, in cockpit",
    stamped(s.C, "check", cockpitId, s.P),
    JSON.stringify(rows.get(s.C))
  );
  kit.check(
    "the hub: a start from a page marked as P's, naming no parent or project, is P's `check` in cockpit",
    stamped(s.G, "check", cockpitId, s.P),
    JSON.stringify(rows.get(s.G))
  );
  kit.check(
    "the hub: the person's start under P, naming the home project in the home folder, is `person` in P's project, cockpit",
    stamped(s.N, "person", cockpitId, s.P),
    JSON.stringify(rows.get(s.N))
  );
}

/** The board's row ids, as `/api/instances` answers them. */
const boardOf = async (fleet: KitFleet): Promise<Set<string>> =>
  new Set(
    (await fleet.api<{ id: string }[]>("/api/instances")).map((row) => row.id)
  );

/**
 * A day on: F, its item done, put to sleep at rest; then the hub starts
 * again on a clock 25 hours on (clock-ahead.ts), as the same hub would
 * read its rows a day later. X's parent row is gone meanwhile, and K is
 * made what Caw's turn in T2 started.
 */
async function dayOn(
  kit: Kit,
  fleet: KitFleet,
  s: Sessions,
  T2: string
): Promise<void> {
  kit.check(
    "the board: F is listed the day its item ended",
    (await boardOf(fleet)).has(s.F.instanceId),
    "F missing from /api/instances"
  );
  await fleet.control(s.F.instanceId, "sleep");
  await until(
    "F asleep",
    () => fleet.instance(s.F.instanceId)?.status,
    (status) => status === "sleeping",
    120_000
  );
  await fleet.stop("hub");
  fleet.write(
    "UPDATE instances SET parent_instance_id = ? WHERE id = ?",
    "00000000-0000-4000-8000-00000000dead",
    s.X
  );
  fleet.write(
    "UPDATE instances SET origin = 'caw', thread_id = ? WHERE id = ?",
    T2,
    s.K
  );
  fleet.launch("hub", [], {
    BUN_OPTIONS: `--preload ${join(import.meta.dir, "..", "clock-ahead.ts")}`,
    CAWCO_PROBE_CLOCK_AHEAD_MS: String(25 * HOUR),
  });
  await fleet.hubUp();
  // Back at the hub once its machine has said what runs: P running again.
  await until(
    "the agent back at the hub",
    () => fleet.instance(s.P)?.status,
    (status) => status === "running",
    120_000
  );
  const after = await boardOf(fleet);
  kit.check(
    "the board: F is gone a day after its item ended, asleep as it is",
    !after.has(s.F.instanceId),
    "F still on /api/instances"
  );
  kit.check(
    "the board: E comes with P2, its ancestor, which ended a day ago and is listed no more itself",
    after.has(s.E) && after.has(s.P2),
    `E ${after.has(s.E)}, P2 ${after.has(s.P2)}`
  );
  kit.check(
    "the board: X, whose parent row is gone, is dropped, not promoted",
    !after.has(s.X),
    "X still on /api/instances"
  );
}

/** What one page's pass reads the rail against. */
interface Leg {
  base: string;
  cockpitId: string;
  fleet: KitFleet;
  K: string;
  /** Session ids a rail of the fleet shows first, which it waits for. */
  ready: string[];
  T2: string;
  tops: Set<string>;
  want: Expected;
}

/** T2's archive, as the hub keeps it. */
const archivedOf = (fleet: KitFleet, T2: string) =>
  fleet.query<{ archived_at: number | null }>(
    "SELECT archived_at FROM project_threads WHERE id = ?",
    T2
  )[0]?.archived_at ?? null;

/** The rail on its page, every tree opened. */
async function railOn(
  page: import("playwright-core").Page,
  leg: Leg,
  phone: boolean,
  shown: string
): Promise<Rail> {
  await open(page, `${leg.base}/session`, "body", 120_000);
  await showRail(page, phone);
  await page.waitForSelector(shown, { timeout: 60_000 }).catch(() => undefined);
  await unfold(page);
  return readRail(page);
}

/** Archive, from T2's row menu in the rail. */
async function archiveFromRail(
  kit: Kit,
  page: import("playwright-core").Page,
  where: string,
  leg: Leg
): Promise<void> {
  const thread2 = `thread:${leg.T2}`;
  await page
    .locator(`a[data-session-row-row][href="/session/${thread2}"]`)
    .first()
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: threadWords.archive }).click();
  const archived = await until(
    `${where}: T2 archived on the hub`,
    () => archivedOf(leg.fleet, leg.T2),
    (at) => at !== null,
    30_000
  ).catch(() => null);
  const gone = await page
    .waitForFunction(
      ([t, k]) =>
        !(
          document.querySelector(`li[data-session-row="${t}"]`) ||
          document.querySelector(`li[data-session-row="${k}"]`)
        ),
      [thread2, leg.K] as const,
      { timeout: 30_000 }
    )
    .then(
      () => true,
      () => false
    );
  kit.check(
    `${where}: Archive from the thread's menu takes it and K, the session under it, off the rail`,
    archived !== null && gone,
    `archived_at ${archived}, gone from the rail ${gone}`
  );
}

/** Caw's panel on cockpit's page, open on his hero, where the thread list stands. */
async function openThreadList(
  page: import("playwright-core").Page,
  leg: Leg
): Promise<import("playwright-core").Locator> {
  await open(
    page,
    `${leg.base}/project/${leg.cockpitId}`,
    '[data-slot="caw-seat"]',
    120_000
  );
  const panel = page.locator("[data-caw-panel]");
  for (let tries = 0; tries < 3; tries += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: one press, then its panel or the next press
    if ((await panel.count()) > 0) {
      break;
    }
    await page.getByRole("button", { name: CAW_SEAT }).first().click();
    await panel
      .first()
      .waitFor({ timeout: 5000 })
      .catch(() => undefined);
  }
  const fresh = panel.getByRole("button", { name: threadWords.newThread });
  if ((await fresh.count()) > 0) {
    await fresh.first().click();
  }
  return panel;
}

/** The Earlier | Archived filter and the archived rows, inside the thread list. */
const filterFit = (page: import("playwright-core").Page) =>
  page.evaluate(() => {
    const section = document.querySelector(
      '[data-caw-panel] [data-slot="earlier"]'
    );
    const tabs = section?.querySelector('[role="tablist"]');
    if (!(section && tabs)) {
      return null;
    }
    const edge = section.getBoundingClientRect();
    const within = (rect: DOMRect) =>
      rect.left >= edge.left - 0.5 && rect.right <= edge.right + 0.5;
    const items = [
      ...section.querySelectorAll('[data-thread-list="archived"] li'),
    ];
    return {
      width: Math.round(edge.width),
      tabsInside: within(tabs.getBoundingClientRect()),
      rows: items.length,
      rowsInside: items.every((item) => within(item.getBoundingClientRect())),
      spills:
        section.scrollWidth > section.clientWidth + 1 ||
        tabs.scrollWidth > tabs.clientWidth + 1,
    };
  });

/** Unarchive, from Caw's panel's Archived filter; then the rail again. */
async function unarchiveFromFilter(
  kit: Kit,
  page: import("playwright-core").Page,
  where: string,
  phone: boolean,
  leg: Leg
): Promise<void> {
  const thread2 = `thread:${leg.T2}`;
  const panel = await openThreadList(page, leg);
  await panel
    .getByRole("tab", { name: startsWith(threadWords.archived) })
    .click();
  // The filter and the archived rows stand inside the thread list, at the
  // list's own inset, nothing spilling past its edge.
  const fit = await filterFit(page);
  kit.check(
    `${where}: the Earlier | Archived filter and its archived row stand inside the thread list, nothing spilling`,
    !!fit && fit.tabsInside && fit.rows > 0 && fit.rowsInside && !fit.spills,
    JSON.stringify(fit)
  );
  await page
    .locator(
      `[data-thread-list="archived"] a[href="/session/${encodeURIComponent(thread2)}"], [data-thread-list="archived"] a[href="/session/${thread2}"]`
    )
    .first()
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: threadWords.unarchive }).click();
  const back = await until(
    `${where}: T2 back on the hub`,
    () => archivedOf(leg.fleet, leg.T2),
    (at) => at === null,
    30_000
  ).catch(() => "still archived");
  const again = await railOn(
    page,
    leg,
    phone,
    `li[data-session-row="${thread2}"]`
  );
  const backOn = (again[leg.cockpitId] ?? []).map((one) => one.id);
  kit.check(
    `${where}: Unarchive from the Archived filter brings T2 and K back to the rail`,
    back === null && backOn.includes(thread2) && backOn.includes(leg.K),
    `archived_at ${back}, rail holds T2 ${backOn.includes(thread2)}, K ${backOn.includes(leg.K)}`
  );
  holdRail(kit, `${where}, after Unarchive`, again, leg.want, leg.tops);
}

/** One engine at one size: the rail held to the model, then archive and unarchive. */
async function pageLeg(
  kit: Kit,
  engine: "chromium" | "webkit",
  view: "desk" | "phone",
  leg: Leg
): Promise<void> {
  const where = `${engine} ${view === "desk" ? "1440" : "390"}`;
  const page = await kit.page(view, { engine });
  const phone = view === "phone";
  const rail = await railOn(
    page,
    leg,
    phone,
    leg.ready.map((id) => `li[data-session-row="${id}"]`).join(", ")
  );
  holdRail(kit, where, rail, leg.want, leg.tops);
  await archiveFromRail(kit, page, where, leg);
  await unarchiveFromFilter(kit, page, where, phone, leg);
  await page.close();
}

/** A new message in an archived thread brings it back. */
async function messageUnarchives(
  kit: Kit,
  fleet: KitFleet,
  cockpitId: string,
  T2: string
): Promise<void> {
  await fleet.api(`/api/projects/${cockpitId}/threads/${T2}/archive`, {});
  kit.check(
    "the hub: the archive route archives T2",
    archivedOf(fleet, T2) !== null
  );
  await fleet
    .api(`/api/projects/${cockpitId}/threads/${T2}/messages`, {
      body: "One more thing.",
    })
    .catch(() => undefined);
  kit.check(
    "the hub: a new message in an archived thread unarchives it",
    archivedOf(fleet, T2) === null,
    `archived_at ${archivedOf(fleet, T2)}`
  );
}

/** Forgetting the home project stops H alone, and no session of cockpit's. */
async function forgetHome(
  kit: Kit,
  fleet: KitFleet,
  ids: Projects,
  s: Sessions
): Promise<void> {
  const running = await fleet.api<{ sessions: { id: string }[] }>(
    `/api/projects/${ids.homeId}/running`
  );
  const named = running.sessions.map((one) => one.id);
  kit.check(
    "forget: the home project's running sessions are H's alone, no session of cockpit's",
    named.length === 1 && named[0] === s.H,
    JSON.stringify(named)
  );
  await fleet.api(`/api/projects/${ids.homeId}/stop`, { instanceIds: named });
  await until(
    "H stopped",
    () =>
      fleet.query<{ end_confirmed_at: number | null }>(
        "SELECT end_confirmed_at FROM instances WHERE id = ?",
        s.H
      )[0]?.end_confirmed_at ?? null,
    (at) => at !== null,
    120_000
  );
  const forgot = await fetch(`${fleet.base}/api/projects/${ids.homeId}`, {
    method: "DELETE",
  });
  const cockpitLive = [s.P, s.D1, s.D2, s.D3, s.C, s.G, s.N, s.E];
  const left = fleet.query<Row>(
    `SELECT id, origin, project_id, parent_instance_id, status, end_intent FROM instances WHERE id IN (${cockpitLive.map(() => "?").join(", ")})`,
    ...cockpitLive
  );
  kit.check(
    "forget: the home project is forgotten, and every cockpit session it held under its folder runs on",
    forgot.ok &&
      left.length === cockpitLive.length &&
      left.every(
        (one) =>
          one.end_intent === null &&
          (one.status === "running" || one.status === "sleeping") &&
          one.project_id === ids.cockpitId
      ),
    `${forgot.status} ${await forgot.text()}: ${JSON.stringify(left)}`
  );
}

const run = async (kit: Kit): Promise<void> => {
  const { fleet, ids } = await standUp(kit);
  // Every delegate but F works until the spec ends: its item stays live.
  const flag = join(fleet.sandbox, "release.flag");
  const base = await fleet.dashboard();
  const s = await startAll(
    kit,
    fleet,
    ids,
    base,
    `SIDEBAR keep working until ${flag}.`
  );
  const T1 = threadIn(fleet, ids.cockpitId, "Plan the release");
  const T2 = threadIn(fleet, ids.cockpitId, "Archive me");
  holdStamps(kit, fleet, ids, s);
  await dayOn(kit, fleet, s, T2);

  const thread1 = `thread:${T1}`;
  const thread2 = `thread:${T2}`;
  const { cockpitId } = ids;
  const leg: Leg = {
    base,
    cockpitId,
    fleet,
    K: s.K,
    ready: [s.G, s.P],
    T2,
    tops: new Set([s.P, s.P2, s.H, s.A, thread1, thread2]),
    want: {
      rows: {
        [s.P]: { project: cockpitId, parent: null },
        [s.P2]: { project: cockpitId, parent: null },
        [thread1]: { project: cockpitId, parent: null },
        [thread2]: { project: cockpitId, parent: null },
        [s.D1]: { project: cockpitId, parent: s.P },
        [s.D2]: { project: cockpitId, parent: s.D1 },
        [s.D3]: { project: cockpitId, parent: s.D2 },
        [s.C]: { project: cockpitId, parent: s.P },
        [s.G]: { project: cockpitId, parent: s.P },
        [s.N]: { project: cockpitId, parent: s.P },
        [s.E]: { project: cockpitId, parent: s.P2 },
        [s.K]: { project: cockpitId, parent: thread2 },
        [s.H]: { project: ids.homeId, parent: null },
        [s.A]: { project: ids.anbarId, parent: null },
      },
      absent: [s.F.instanceId, s.X],
    },
  };
  for (const engine of ["chromium", "webkit"] as const) {
    for (const view of ["desk", "phone"] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: one page at a time, each through the whole flow
      await pageLeg(kit, engine, view, leg);
    }
  }
  await messageUnarchives(kit, fleet, cockpitId, T2);
  await forgetHome(kit, fleet, ids, s);
  await writeFile(flag, "");
};

export default { name: "sidebar-model", run } satisfies Spec;
