/**
 * A session loads only the fleet memory that applies to it (core fleet.ts
 * `MemoryScope`). On a scratch fleet (real hub, agent and sessiond; each
 * harness against the mock model) with three projects, A and B (code) and C
 * (not code), each a git checkout on the machine, the fleet keeps:
 *
 * - the user-scope CLAUDE.md, for every session;
 * - `roles/orchestrator.md`, scoped to orchestrators;
 * - `roles/leaf.md`, scoped to leaves;
 * - `projects/a.md`, scoped to project A;
 * - `projects/a-orchestrator.md`, scoped to A's orchestrators;
 * - `coding.md`, scoped to projects A and B: the coding rules, which C is
 *   never handed.
 *
 * 1. A's documents are placed in A's checkout under `.claude/rules/cawco/`,
 *    kept out of its `git status`; `coding.md` is placed in B's too; nothing
 *    is placed in C's.
 * 2. For Claude Code, OpenCode and pi alike, each session's first turn is
 *    read where the harness sent it, at the mock model, which is what the
 *    harness loaded: an orchestrator in A, a leaf in A (`canDelegate: false`,
 *    kept on its row), an orchestrator in B, one in C, and an orchestrator
 *    started in a checkout of A added a moment before (the launch writes its
 *    place's documents before the session starts). Each loads exactly what
 *    applies to it ({@link SESSIONS}).
 * 3. The dashboard's memory editor shows a document's scope and sets it
 *    ({@link editInDashboard}).
 *
 *   bun scripts/probe-kit/run.ts memory-scopes
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { projectClaudeDir } from "../../../packages/core/src/paths";
import {
  HARNESSES,
  type Harness,
  MACHINE,
  type Seen,
  until,
} from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec } from "../kit";

const RUN = crypto.randomUUID().slice(0, 8);
/** One mark per document: a session loaded the document when its first request carries the mark. */
const MARK = {
  user: `MEMSCOPE-USER-${RUN}`,
  orchestrator: `MEMSCOPE-ORCHESTRATOR-${RUN}`,
  leaf: `MEMSCOPE-LEAF-${RUN}`,
  projectA: `MEMSCOPE-PROJECT-A-${RUN}`,
  projectAOrchestrator: `MEMSCOPE-PROJECT-A-ORCHESTRATOR-${RUN}`,
  coding: `MEMSCOPE-CODING-${RUN}`,
} as const;
type Doc = keyof typeof MARK;
const DOCS = Object.keys(MARK) as Doc[];

type ProjectKey = "a" | "b" | "c";
interface Project {
  dir: string;
  id: string;
}

/**
 * The sessions each harness runs, and the documents each must load. `fresh`
 * starts in a checkout of its project added to it just before.
 */
const SESSIONS = [
  {
    name: "orchestrator in A",
    project: "a",
    leaf: false,
    fresh: false,
    loads: [
      "user",
      "orchestrator",
      "projectA",
      "projectAOrchestrator",
      "coding",
    ],
  },
  {
    name: "leaf in A",
    project: "a",
    leaf: true,
    fresh: false,
    loads: ["user", "leaf", "projectA", "coding"],
  },
  {
    name: "orchestrator in B",
    project: "b",
    leaf: false,
    fresh: false,
    loads: ["user", "orchestrator", "coding"],
  },
  {
    name: "orchestrator in C",
    project: "c",
    leaf: false,
    fresh: false,
    loads: ["user", "orchestrator"],
  },
  {
    name: "orchestrator in a checkout of A added just before",
    project: "a",
    leaf: false,
    fresh: true,
    loads: [
      "user",
      "orchestrator",
      "projectA",
      "projectAOrchestrator",
      "coding",
    ],
  },
] as const satisfies readonly {
  name: string;
  project: ProjectKey;
  leaf: boolean;
  fresh: boolean;
  loads: readonly Doc[];
}[];

type Hub = <T>(method: string, path: string, body?: unknown) => Promise<T>;
interface Listed {
  memoryDocs: {
    path: string;
    scope?: { role?: string; projectIds?: string[] };
  }[];
}

const spec: Spec = {
  name: "memory-scopes",
  run: async (kit) => {
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const hub: Hub = async <T>(
      method: string,
      path: string,
      body?: unknown
    ) => {
      const response = await fetch(`${fleet.base}${path}`, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`${method} ${path}: ${response.status} ${text}`);
      }
      return JSON.parse(text) as T;
    };
    const projects = await keepMemory(kit, fleet, hub);
    await checkPlacement(kit, fleet, projects);
    await editInDashboard(kit, fleet, hub, projects);

    // 2. Each harness's sessions, each first turn read where it was sent.
    for (const harness of HARNESSES) {
      for (const one of SESSIONS) {
        const project = projects[one.project];
        const place = one.fresh
          ? // biome-ignore lint/performance/noAwaitInLoops: one session at a time, each read before the next
            await freshPlace(fleet, hub, project, harness)
          : project.dir;
        await readSession(kit, fleet, harness, one, project, place);
      }
    }
  },
};

/** A folder holding a git repository with one commit, as the fleet's owner made it. */
const gitFolder = async (fleet: KitFleet, dir: string): Promise<void> => {
  await mkdir(dir, { recursive: true });
  await Bun.$`sh -c ${"git init -q -b main && echo memory > README.md && git add -A && git commit -qm 'First commit'"}`
    .cwd(dir)
    .env({ ...process.env, HOME: fleet.env.HOME as string })
    .quiet();
};

/** The three projects, and the fleet's memory through the hub's own routes (admin_memory_write's). */
const keepMemory = async (
  kit: Kit,
  fleet: KitFleet,
  hub: Hub
): Promise<Record<ProjectKey, Project>> => {
  await writeFile(
    join(fleet.env.HOME as string, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  const checkout = async (name: ProjectKey): Promise<Project> => {
    const dir = join(fleet.sandbox, `memscope-${name}`);
    await gitFolder(fleet, dir);
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: `Memory ${name.toUpperCase()}`,
      machineId: MACHINE,
      cwd: dir,
    });
    return { dir, id: project.id };
  };
  const projects = {
    a: await checkout("a"),
    b: await checkout("b"),
    c: await checkout("c"),
  };
  await hub("PUT", "/api/fleet/memory", {
    content: `# Fleet\n\n${MARK.user}\n`,
  });
  const put = (path: string, doc: Doc, scope: object) =>
    hub("PUT", "/api/fleet/memory/docs", {
      path,
      content: `# ${doc}\n\n${MARK[doc]}\n`,
      scope,
    });
  await put("roles/orchestrator.md", "orchestrator", { role: "orchestrator" });
  await put("roles/leaf.md", "leaf", { role: "leaf" });
  await put("projects/a.md", "projectA", { projectIds: [projects.a.id] });
  await put("projects/a-orchestrator.md", "projectAOrchestrator", {
    role: "orchestrator",
    projectIds: [projects.a.id],
  });
  await put("coding.md", "coding", {
    projectIds: [projects.a.id, projects.b.id],
  });
  const listed = await hub<Listed>("GET", "/api/fleet");
  const coding = listed.memoryDocs.find((doc) => doc.path === "coding.md");
  kit.check(
    "the hub keeps each document with its scope, coding.md with both A and B",
    [...(coding?.scope?.projectIds ?? [])].sort().join() ===
      [projects.a.id, projects.b.id].sort().join() &&
      listed.memoryDocs.find((doc) => doc.path === "roles/leaf.md")?.scope
        ?.role === "leaf",
    JSON.stringify(
      listed.memoryDocs.map(({ path, scope }) => ({ path, scope }))
    )
  );
  return projects;
};

/** A document's file as placed in a folder's rules, or why not. */
const placedText = (dir: string, ...path: string[]) =>
  until(
    `${path.join("/")} placed in ${dir}`,
    () => readFile(projectClaudeDir(dir, "rules", "cawco", ...path), "utf8"),
    Boolean,
    60_000
  ).catch(() => undefined);

/** 1. What each project's checkout holds, and its git status. */
const checkPlacement = async (
  kit: Kit,
  fleet: KitFleet,
  projects: Record<ProjectKey, Project>
): Promise<void> => {
  const inA = await placedText(projects.a.dir, "projects", "a.md");
  const codingInA = await placedText(projects.a.dir, "coding.md");
  const codingInB = await placedText(projects.b.dir, "coding.md");
  kit.check(
    "1: A's checkout holds projects/a.md and coding.md in its rules; B's holds coding.md",
    inA?.includes(MARK.projectA) === true &&
      codingInA?.includes(MARK.coding) === true &&
      codingInB?.includes(MARK.coding) === true,
    JSON.stringify({ inA, codingInA, codingInB })
  );
  const status = (
    await Bun.$`git -C ${projects.a.dir} status --porcelain`.quiet().nothrow()
  ).stdout
    .toString()
    .trim();
  kit.check(
    "1: the placed documents are kept out of A's git status",
    status === "",
    status || "clean"
  );
  const inC = projectClaudeDir(projects.c.dir, "rules", "cawco");
  kit.check(
    "1: nothing is placed in C's checkout",
    !existsSync(inC),
    existsSync(inC) ? `${inC} exists` : "none"
  );
  // The user-scope CLAUDE.md is on the machine before any session starts.
  await until(
    "the user-scope CLAUDE.md on the machine",
    () =>
      fleet.query<{ fleet: string | null }>(
        "SELECT fleet FROM agents WHERE machine_id = ?",
        MACHINE
      )[0]?.fleet,
    (report) => report?.includes('"memory":{"state":"applied"') === true,
    60_000
  ).catch(() => undefined);
};

/** A new checkout of `project`, added to it as a place now: its folder. */
const freshPlace = async (
  fleet: KitFleet,
  hub: Hub,
  project: Project,
  harness: Harness
): Promise<string> => {
  const dir = join(fleet.sandbox, `memscope-fresh-${harness}`);
  await gitFolder(fleet, dir);
  await hub("POST", `/api/projects/${project.id}/places`, {
    machineId: MACHINE,
    path: dir,
  });
  return dir;
};

/** A document's path for the dashboard's part; it carries no mark, so no session's reading counts it. */
const UI_DOC = "ui/scoped.md";
const SPACES = /\s+/g;
const LOADED_LINE = /^Loaded into:/;

/**
 * 3. The dashboard's memory editor, built and served against the scratch
 * hub: a document scoped to leaves says so on its row and in its editor, and
 * picking projects B and C with the editor's Projects chip and saving stores
 * `{ role: "leaf", projectIds: [B, C] }` at the hub. Read off the DOM and the
 * hub's row, never a picture.
 */
const editInDashboard = async (
  kit: Kit,
  fleet: KitFleet,
  hub: Hub,
  projects: Record<ProjectKey, Project>
): Promise<void> => {
  await hub("PUT", "/api/fleet/memory/docs", {
    path: UI_DOC,
    content: "# A document the dashboard scopes\n",
    scope: { role: "leaf" },
  });
  const base = await fleet.dashboard();
  const page = await kit.page("desk");
  await open(
    page,
    `${base}/config/memory`,
    `a[href="/config/memory/${UI_DOC}"]`
  );
  const row = (
    await page.locator(`li[data-row-name="${UI_DOC}"] .meta`).innerText()
  ).replace(SPACES, " ");
  kit.check(
    "3: the document's row in the memory list says it loads into every leaf session",
    row.includes("Every leaf session"),
    row
  );
  await open(page, `${base}/config/memory/${UI_DOC}`, "[aria-label^='Role:']");
  const chips = async () =>
    await page
      .locator(".picker-chip")
      .evaluateAll((all) => all.map((one) => one.getAttribute("aria-label")));
  const loadedLine = () => page.getByText(LOADED_LINE).first().innerText();
  const before = await chips();
  kit.check(
    "3: its editor's chips read Role: Leaf and Projects: None, and it says who loads it",
    before.includes("Role: Leaf") &&
      before.includes("Projects: None") &&
      (await loadedLine()) === "Loaded into: Every leaf session",
    `${before.join(" | ")} · ${await loadedLine()}`
  );
  // Two picks in the one open list: the chip holds several.
  await page.locator("[aria-label^='Projects:']").click();
  await page.locator("[role='option']", { hasText: "Memory B" }).click();
  await page.locator("[role='option']", { hasText: "Memory C" }).click();
  await page.keyboard.press("Escape");
  const after = await loadedLine();
  kit.check(
    "3: picking projects B and C says it now loads into their leaf sessions",
    after === "Loaded into: Leaf sessions in Memory B and Memory C",
    `${after} · ${(await chips()).join(" | ")}`
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const wanted = [projects.b.id, projects.c.id].sort().join();
  const stored = await until(
    "the editor's scope stored at the hub",
    async () =>
      (await hub<Listed>("GET", "/api/fleet")).memoryDocs.find(
        (doc) => doc.path === UI_DOC
      )?.scope,
    (scope) => [...(scope.projectIds ?? [])].sort().join() === wanted,
    15_000
  ).catch(() => undefined);
  kit.check(
    "3: Save stores the document with role leaf and projects B and C at the hub",
    stored?.role === "leaf" &&
      [...(stored.projectIds ?? [])].sort().join() === wanted,
    JSON.stringify(stored)
  );
};

/**
 * One session's start and first turn: started in `place`, a folder of its
 * project (a leaf with `canDelegate: false`, as a delegate's start is; a work
 * item's would need a workspace boundary, which a probe run inside one cannot
 * start), its row read for its role, and the request its harness sent the
 * model read for which documents it carries.
 */
const readSession = async (
  kit: Kit,
  fleet: KitFleet,
  harness: Harness,
  one: (typeof SESSIONS)[number],
  project: Project,
  place: string
): Promise<void> => {
  const token = `MEMSCOPE-TURN-${harness}-${one.name.replaceAll(" ", "-")}-${RUN}`;
  const session = await fleet.spawn(
    harness,
    `Memory scopes ${harness} ${one.name}`,
    place,
    { projectId: project.id, ...(one.leaf ? { canDelegate: false } : {}) }
  );
  const role = fleet.query<{ can_delegate: number | null }>(
    "SELECT can_delegate FROM instances WHERE id = ?",
    session
  )[0]?.can_delegate;
  kit.check(
    `2: ${harness}, ${one.name}: its row says ${one.leaf ? "it may not delegate" : "nothing against delegating"}`,
    one.leaf ? role === 0 : role !== 0,
    `can_delegate ${role}`
  );
  await fleet.send(session, token);
  const request = await until<Seen>(
    `${harness} ${one.name}: its first turn at the model`,
    () => fleet.seen.find((seen) => seen.tools && seen.all.includes(token)),
    Boolean,
    180_000
  ).catch(() => undefined);
  const loaded = DOCS.filter((doc) => request?.body.includes(MARK[doc]));
  const wanted: readonly Doc[] = one.loads;
  const missing = wanted.filter((doc) => !loaded.includes(doc));
  const extra = loaded.filter((doc) => !wanted.includes(doc));
  kit.check(
    `2: ${harness}, ${one.name}, loads ${wanted.join(", ")} and no other scoped document`,
    request !== undefined && missing.length === 0 && extra.length === 0,
    request
      ? `loaded ${loaded.join(", ") || "none"}; missing ${missing.join(", ") || "none"}; not its own ${extra.join(", ") || "none"}`
      : "no request reached the model"
  );
};

export default spec;
