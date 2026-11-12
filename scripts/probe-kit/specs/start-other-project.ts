/**
 * A session's `start_session` into another project's folder opens its row
 * in that project (tsk-355): on a scratch fleet, a real hub, agent and
 * sessiond, Claude Code sessions against the mock model, each tool called
 * as its session through the hub's tool door.
 *
 *   bun scripts/probe-kit/run.ts start-other-project
 *
 * Seen 2026-11-12: Hujooz's Caw started a session in Cawco-Dev's folder on
 * the hub to file tasks there; its row opened in Hujooz, which has no
 * stages, and its `task_create` was refused. The rule (server.ts
 * `projectOfStart`, `projectAtFolder`): a start's row opens in the project
 * it names, else its parent's, else the one holding its folder; and
 * `start_session` names the project holding the folder it starts in, a
 * project's folder on the hub included.
 *
 * Project A has a checkout and no stages; project B has a checkout and the
 * code stages. Session S runs in A's checkout, in A.
 * (a) S starts a session in B's folder on the hub: its row is in B, under
 *     S, and its `task_create` files into B.
 * (b) The same with B's checkout as its folder.
 * (c) S starts a session in a folder no project holds: its row is in A.
 * (d) A delegate of (a)'s session opens in B; a delegate of S in A.
 * (e) (a)'s session hands off to S, its starter.
 * (f) S starts a session in B's checkout named under `~`: its row is in B.
 * (g) With a project H whose checkout is the home folder, S starts a
 *     session in a delegate workspace's clone under `~/.worktrees` whose
 *     work is B's: its row is in B, not H.
 */
import { mkdir } from "node:fs/promises";
import { join, relative } from "node:path";
import {
  hubRequest,
  type Sending,
  type ToolArgs,
  type ToolName,
} from "../../../packages/core/src/hub-request";
import { toolWords } from "../../lib/tool-call";
import { MACHINE, type Reply, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

/** A CawCo tool called as session `as`, through the door its MCP server and the CLI share: its words. */
const callAs = async <N extends ToolName, const A>(
  fleet: KitFleet,
  as: string,
  name: N,
  args: Sending<A, ToolArgs<N>>
): Promise<{ isError: boolean; text: string }> => {
  const said = await toolWords(
    {
      base: fleet.base,
      id: as,
      credential: await fleet.sessionCredential(as),
    },
    name,
    args
  );
  return { isError: said.refused, text: said.text };
};

/** A session's row: its project and its parent. */
interface Placed {
  id: string;
  parent: string | null;
  project: string | null;
}

/** The row of the session titled `title`, once it is written. */
const rowTitled = (fleet: KitFleet, title: string): Promise<Placed | null> =>
  until(
    `the row of "${title}"`,
    () =>
      fleet.query<Placed>(
        "SELECT id, project_id AS project, parent_instance_id AS parent FROM instances WHERE title = ?",
        title
      )[0],
    Boolean,
    60_000
  ).catch(() => null);

/** The row of the first delegate `parent` started, once it is written. */
const delegateOf = (fleet: KitFleet, parent: string): Promise<Placed | null> =>
  until(
    "a delegate's row",
    () =>
      fleet.query<Placed>(
        "SELECT id, project_id AS project, parent_instance_id AS parent FROM instances WHERE parent_instance_id = ? AND work_item_id IS NOT NULL",
        parent
      )[0],
    Boolean,
    120_000
  ).catch(() => null);

/** A git repository at `dir` with one commit, as a project's checkout. */
const repoAt = async (dir: string, home: string): Promise<void> => {
  await mkdir(dir, { recursive: true });
  await Bun.$`sh -c ${"git init -q -b main && echo probe > README.md && git add -A && git commit -qm 'First commit'"}`
    .cwd(dir)
    .env({ ...process.env, HOME: home })
    .quiet();
};

const run = async (kit: Kit) => {
  const { check } = kit;
  const fleet = await kit.fleet(respond);
  const home = fleet.env.HOME as string;
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  await Bun.write(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  // B's checkout under the home folder, so (f) can name it under `~`; A's
  // and the loose folder outside it.
  const aDir = join(fleet.sandbox, "project-a");
  const bDir = join(home, "code", "project-b");
  const loose = join(fleet.sandbox, "loose");
  await repoAt(aDir, home);
  await repoAt(bDir, home);
  await mkdir(loose, { recursive: true });
  const projectAt = (name: string, cwd: string) =>
    fleet.api<{ id: string }>(
      hubRequest("POST /api/projects", {
        body: { name, machineId: MACHINE, cwd },
      })
    );
  const a = await projectAt("Hujooz", aDir);
  const b = await projectAt("Cawco-Dev", bDir);
  // B's stages, which make its folder on the hub; A has none, as Hujooz had.
  await fleet.api(
    hubRequest("POST /api/projects/:id/stages/template", {
      path: { id: b.id },
      body: { template: "code" },
    })
  );
  // B's folder on the hub: `projects/` beside its database (core paths.ts `hubProjectsDir`).
  const bHub = join(fleet.sandbox, "hub", "projects", b.id);
  await mkdir(bHub, { recursive: true });
  const starter = await fleet.spawn("claude", "Starter in A", aDir, {
    projectId: a.id,
  });

  /** `start_session` called as the starter, and the row it opened. */
  const startIn = async (cwd: string, title: string) => {
    const said = await callAs(fleet, starter, "start_session", {
      cwd,
      title,
      prompt: "Say ok.",
    });
    return { said, row: await rowTitled(fleet, title) };
  };

  // (a) B's folder on the hub.
  const hubStart = await startIn(bHub, "File tasks in B");
  const filed = hubStart.row
    ? await callAs(fleet, hubStart.row.id, "task_create", {
        title: "Hub stores every skill",
      })
    : { isError: true, text: "no row" };
  const listed = await fleet.api<unknown>(
    hubRequest("GET /api/projects/:id/tasks", {
      path: { id: b.id },
      query: { q: "Hub stores every skill" },
    })
  );
  check(
    "(a) start_session in B's folder on the hub opens a row in B under its starter, and its task_create files into B",
    !hubStart.said.isError &&
      hubStart.row?.project === b.id &&
      hubStart.row.parent === starter &&
      !filed.isError &&
      JSON.stringify(listed).includes("Hub stores every skill"),
    JSON.stringify({ start: hubStart, filed, listed })
  );

  // (b) B's checkout.
  const checkoutStart = await startIn(bDir, "Work in B's checkout");
  check(
    "(b) start_session in B's checkout opens a row in B under its starter",
    !checkoutStart.said.isError &&
      checkoutStart.row?.project === b.id &&
      checkoutStart.row.parent === starter,
    JSON.stringify(checkoutStart)
  );

  // (c) A folder no project holds.
  const looseStart = await startIn(loose, "Work in a loose folder");
  check(
    "(c) start_session in a folder no project holds keeps its starter's project",
    !looseStart.said.isError &&
      looseStart.row?.project === a.id &&
      looseStart.row.parent === starter,
    JSON.stringify(looseStart)
  );

  // (d) Delegates keep their parent's project.
  const fromB = hubStart.row
    ? await callAs(fleet, hubStart.row.id, "delegate", {
        cwd: bDir,
        lands: "none",
        prompt: "Say ok.",
        title: "Delegate of B's session",
      })
    : { isError: true, text: "no row" };
  const fromA = await callAs(fleet, starter, "delegate", {
    cwd: aDir,
    lands: "none",
    prompt: "Say ok.",
    title: "Delegate of A's session",
  });
  const bDelegate = hubStart.row
    ? await delegateOf(fleet, hubStart.row.id)
    : null;
  const aDelegate = await delegateOf(fleet, starter);
  check(
    "(d) a delegate of the session started in B opens in B; a delegate of the starter opens in A",
    bDelegate?.project === b.id && aDelegate?.project === a.id,
    JSON.stringify({ fromB, fromA, bDelegate, aDelegate })
  );

  // (e) The started session still reaches its starter.
  const handed = hubStart.row
    ? await callAs(fleet, hubStart.row.id, "handoff", {
        target: starter,
        message: "Filed the task in B.",
      })
    : { isError: true, text: "no row" };
  check(
    "(e) the session started in B hands off to its starter in A",
    !handed.isError,
    JSON.stringify(handed)
  );

  // (f) B's checkout named under `~`.
  const tildeStart = await startIn(
    `~/${relative(home, bDir)}`,
    "Work in B under home"
  );
  check(
    "(f) start_session in B's checkout named under ~ opens a row in B",
    !tildeStart.said.isError &&
      tildeStart.row?.project === b.id &&
      tildeStart.row.parent === starter,
    JSON.stringify(tildeStart)
  );

  // (g) A home-folder project does not claim a workspace's clone under it.
  const h = await projectAt("Home", home);
  const workspace = crypto.randomUUID();
  const clone = join(home, ".worktrees", `project-b-${workspace.slice(0, 8)}`);
  await mkdir(clone, { recursive: true });
  const now = Date.now();
  fleet.write(
    "INSERT INTO workspaces (id, machine_id, repo_root, path, branch, state, created_by_instance_id, created_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)",
    workspace,
    MACHINE,
    bDir,
    clone,
    `ws/${workspace.slice(0, 8)}`,
    starter,
    now
  );
  fleet.write(
    "INSERT INTO work_items (id, workspace_id, parent_instance_id, instance_id, brief, title, harness, state, project_id, created_at) VALUES (?, ?, ?, ?, ?, ?, 'claude', 'done', ?, ?)",
    crypto.randomUUID(),
    workspace,
    starter,
    crypto.randomUUID(),
    "Work in B.",
    "B's work",
    b.id,
    now
  );
  const cloneStart = await startIn(clone, "Work in B's clone");
  check(
    "(g) start_session in a workspace's clone under ~/.worktrees opens a row in the workspace's project, not the home-folder project's",
    !cloneStart.said.isError &&
      cloneStart.row?.project === b.id &&
      cloneStart.row.project !== h.id,
    JSON.stringify({ home: h.id, ...cloneStart })
  );
};

const spec: Spec = {
  group: "The hub and machines",
  host: "its sessions delegate, which starts workspace boundaries, and no boundary starts inside another",
  name: "start-other-project",
  run,
};
export default spec;
