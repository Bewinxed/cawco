/**
 * A handoff to a retired workspace's session reaches it across its machine's
 * agent restarting (agent workspace.ts `clearOwnCut`, `clearInterruptedCuts`,
 * interrupted-cut.ts; hub work-items.ts `recutWaitsForAgent`). On 2026-10-23
 * the nightly install's restart at 12:47 cut two recuts short, leaving a
 * `.git` alone (1.4 GB) and a partial checkout, and every later handoff to
 * their sessions was refused, "something is there already"; the same day a
 * handoff sent as an agent restarted for an update failed, "The agent is
 * restarting", while one to a live session there was queued. On a scratch
 * fleet (real hub, agent and sessiond; Claude Code against the mock model),
 * boundaries included: it delegates, so it runs on the host, outside every
 * workspace.
 *
 * The project's repository holds `zz-hold.bin` under a smudge filter the
 * fleet's own git config defines: while the spec's arm file stands, its
 * smudge writes the checkout's pid to a file and waits, so a cut's checkout
 * stops there with `.git` made and the files before it written, as the
 * restart left cockpit-d7496975.
 *
 * (1) M commits a file, finishes, lands, and its workspace retires, its
 *     clone gone. Armed, the parent hands off to it: the send is kept at the
 *     hub while the clone is cut again, and the cut stops in its checkout,
 *     its mark (`cut.json`) in the workspace's state dir, `.git` and the
 *     files before `zz-hold.bin` at the path, and no file in its
 *     `.git/objects` sharing an inode with the repository's (the husks of
 *     2026-10-23 held 4,342, which broke cockpit's Caw: place-deny-bound).
 * (2) The agent is SIGKILLed, and its checkout with it, as a service stop
 *     ends the whole group; the husk stands. The agent starts again, and its
 *     start-up pass clears the cut its last process left under way, and says
 *     so. The kept handoff reaches the same session (same work item) in a
 *     clone cut whole: its shell reads the same path, HEAD at the commit the
 *     workspace retired at, no tracked file changed or missing, `zz-hold.bin`
 *     whole; the cut's mark is gone. It finishes and the workspace retires.
 * (3) A second handoff reaches the session in a clone cut whole, as in (2).
 * (4) A husk as a build before the mark left one (cockpit-6f1f0c3c): the
 *     workspace's `create.json` naming the path, and at the path a `git
 *     clone --no-checkout` of the repository, a `.git` alone. A handoff
 *     clears it and reaches the session in a clone cut whole.
 * (5) The agent raises its restart fence, as `cawco service restart agent`
 *     does before it restarts: a handoff then is kept at the hub, not
 *     failed, the hub saying the cut waits for the agent. The agent is
 *     stopped, and a handoff sent while it is down is kept too. The agent
 *     starts again: the clone is cut and both reach the session, in a clone
 *     cut whole.
 * (6) Someone else's folder at the path once it retires again, a file and a
 *     folder of theirs and no record of a cut: a handoff fails, its reason
 *     naming both entries and how to clear the path, and both stand.
 *
 *   bun scripts/probe-kit/run.ts recut-interrupted
 */
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AGENT_RESTARTING } from "../../../packages/core/src/binary-updates";
import { listedPid } from "../../../packages/core/src/signal";
import { toolWords } from "../../lib/tool-call";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const FINISH = "mcp__cawco__finish_item";
const TAG = "PROBE-CUT-M";
const COMMIT =
  "git -c user.name=Delegate -c user.email=d@probe.test commit -qm";
/** What `zz-hold.bin` holds, as the repository has it. */
const HELD_TEXT = "held while the agent dies";
/** How long a workspace takes to settle once its item ends: its session's sleep, then its machine's archive. */
const SETTLE_MS = 120_000;
const PID = /^\d+$/;

/** The handoffs to M, by mark: each reaching it has its shell report and its finish. */
const SHORT = "PROBE-CUT-SHORT-1";
const AGAIN = "PROBE-CUT-AGAIN-2";
const LEGACY = "PROBE-CUT-LEGACY-3";
const FENCED = "PROBE-CUT-FENCED-4";
const DOWN = "PROBE-CUT-DOWN-5";
const REFUSED = "PROBE-CUT-REFUSED-6";
const REPORTING = [SHORT, AGAIN, LEGACY, FENCED, DOWN] as const;
type Mark = (typeof REPORTING)[number];

/** What M's shell read in a clone cut again, by handoff mark. */
interface Report {
  head?: string;
  hold?: string;
  pwd?: string;
  status?: string;
}
const reports = new Map<string, Report>();
const step = { finished: new Set<string>(), searched: new Set<string>() };

const tool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});
const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
/** A handoff's message, by its mark. */
const said = (mark: string): string =>
  `${mark}: go on in your workspace and say where you are.`;

/** The last capture of `pattern` in `all`. */
const lastOf = (all: string, pattern: RegExp): string | undefined =>
  [...all.matchAll(pattern)].at(-1)?.[1];

/** finish_item once it is offered, after a ToolSearch for it when it is not, once per `mark`. */
const finishing = (request: Seen, mark: string): Reply => {
  if (!step.finished.has(mark) && request.toolNames.includes(FINISH)) {
    step.finished.add(mark);
    return tool(FINISH, {
      headline: `Went on in the clone (${mark.toLowerCase()}).`,
      summary: `Went on in the clone (${mark.toLowerCase()}).`,
    });
  }
  if (
    !(step.finished.has(mark) || step.searched.has(mark)) &&
    request.toolNames.includes("ToolSearch")
  ) {
    step.searched.add(mark);
    return tool("ToolSearch", { query: `select:${FINISH}`, max_results: 1 });
  }
  return text("done");
};

/** M's shell report in the clone it is handed `mark` in, then its finish. */
const reportTurn = (request: Seen, mark: Mark): Reply => {
  const n = mark.at(-1);
  if (!request.all.includes(`CUT-RAN-${n}-42`)) {
    return tool("Bash", {
      command: [
        `printf 'CUT-PWD-${n}=%s\\n' "$(pwd)"`,
        `printf 'CUT-HEAD-${n}=%s\\n' "$(git rev-parse HEAD)"`,
        `printf 'CUT-STATUS-${n}=%s\\n' "$(git status --porcelain --untracked-files=no | wc -l | tr -d ' ')"`,
        `printf 'CUT-HOLD-${n}:%s\\n' "$(cat zz-hold.bin 2>&1)"`,
        `echo CUT-RAN-${n}-$((40+2))`,
      ].join("; "),
      description: "Where am I",
    });
  }
  reports.set(mark, {
    pwd: lastOf(request.all, new RegExp(`CUT-PWD-${n}=([^\\s\\\\"]+)`, "g")),
    head: lastOf(request.all, new RegExp(`CUT-HEAD-${n}=([0-9a-f]{40})`, "g")),
    status: lastOf(request.all, new RegExp(`CUT-STATUS-${n}=(\\d+)`, "g")),
    hold: lastOf(request.all, new RegExp(`CUT-HOLD-${n}:([^\\n\\\\"]*)`, "g")),
  });
  return finishing(request, mark);
};

const respond = (request: Seen): Reply => {
  if (!(request.tools && request.all.includes(TAG))) {
    return text("ok");
  }
  if (!request.all.includes("DONE-COMMIT-M")) {
    return tool("Bash", {
      command: `echo 'made by M' > retire-M.txt && git add retire-M.txt && ${COMMIT} 'Delegate commit M' && echo DONE-COMMIT-M`,
      description: "Commit",
    });
  }
  const mark = REPORTING.findLast((one) => request.all.includes(said(one)));
  return mark ? reportTurn(request, mark) : finishing(request, "first");
};

interface Workspace {
  id: string;
  path: string;
  state: string;
}

interface SendRow {
  owed: string | null;
  reason: string | null;
  state: string;
}

type Fleet = Awaited<ReturnType<Kit["fleet"]>>;

/** What the phases share. */
interface Scene {
  fleet: Fleet;
  /** A handoff to M as its parent, a cold target's one refusal asked again: its answer and its send's row. */
  handOff: (
    mark: string
  ) => Promise<{ row?: SendRow; status: number; text: string }>;
  /** The commit M's workspace retired at. */
  head: { branch: string; commit: string } | null;
  home: string;
  instanceId: string;
  itemId: string;
  markFile: string;
  repoRoot: string;
  sendOf: (mark: string) => SendRow | undefined;
  stateBecomes: (state: string) => Promise<Workspace>;
  stateDir: string;
  workspace: Workspace;
  workspaceOf: () => Workspace;
}

/** A send kept at the hub: owed, not failed. */
const kept = (row: SendRow | undefined): boolean =>
  row !== undefined && row.owed !== null && row.state !== "failed";

/** The handoff `mark` reached M in a clone cut whole; its item ends done and the workspace retires again. */
const reached = async (
  kit: Kit,
  scene: Scene,
  label: string,
  marks: readonly Mark[]
): Promise<void> => {
  const { fleet, workspace } = scene;
  const item = () =>
    fleet.query<{ state: string; error: string | null }>(
      "SELECT state, error FROM work_items WHERE id = ?",
      scene.itemId
    )[0];
  const reporter = () => marks.findLast((one) => reports.has(one));
  const ended = await until(
    `M's item ended after ${marks.join(", ")}`,
    item,
    (row) => {
      const last = reporter();
      return (
        row !== undefined &&
        last !== undefined &&
        step.finished.has(last) &&
        ["done", "failed", "cancelled"].includes(row.state)
      );
    },
    300_000
  ).catch(item);
  const mark = reporter();
  const seen = (mark && reports.get(mark)) || {};
  const handed = marks.filter((one) =>
    fleet.seen.some(
      (request) => request.all.includes(TAG) && request.all.includes(said(one))
    )
  );
  const items = fleet.query<{ instance_id: string }>(
    "SELECT instance_id FROM work_items WHERE workspace_id = ?",
    workspace.id
  );
  kit.check(
    `${label} ${marks.join(" and ")} reach the same session in a clone cut whole at the same path: HEAD at the commit it retired at, no tracked file changed or missing, zz-hold.bin whole`,
    handed.length === marks.length &&
      items.length === 1 &&
      items[0]?.instance_id === scene.instanceId &&
      seen.pwd === workspace.path &&
      scene.head !== null &&
      seen.head === scene.head.commit &&
      seen.status === "0" &&
      seen.hold === HELD_TEXT,
    JSON.stringify({
      handed,
      mark,
      seen,
      head: scene.head,
      path: workspace.path,
      items,
    })
  );
  const again = await scene.stateBecomes("archived");
  kit.check(
    `${label} once whole, the cut's mark is gone; the item ends done and the workspace retires again`,
    ended?.state === "done" &&
      !existsSync(scene.markFile) &&
      again.state === "archived" &&
      !existsSync(workspace.path),
    `${ended?.state} ${ended?.error ?? ""}; mark ${existsSync(scene.markFile) ? "stands" : "gone"}; ${again.state}; clone ${existsSync(workspace.path) ? "stands" : "gone"}`
  );
};

/** (1) and (2): a cut stopped in its checkout, the agent killed, its own cut cleared at its start, and the kept handoff delivered. */
const cutShortPhase = async (kit: Kit, scene: Scene): Promise<void> => {
  const { fleet, workspace } = scene;
  const arm = join(fleet.sandbox, "hold-armed");
  const hit = join(fleet.sandbox, "hold-hit");
  await writeFile(arm, "");
  const handed = await scene.handOff(SHORT);
  const held = await until(
    "the cut's checkout held at zz-hold.bin",
    async () =>
      existsSync(hit) ? (await readFile(hit, "utf8")).trim() : undefined,
    (pid) => PID.test(pid),
    300_000
  ).catch(() => undefined);
  const husk = existsSync(workspace.path)
    ? (await readdir(workspace.path)).sort()
    : [];
  kit.check(
    "(1) the handoff is kept at the hub while the clone is cut again, and the cut stops in its checkout: its mark in the state dir, .git and the files before zz-hold.bin at the path",
    handed.status === 200 &&
      kept(handed.row) &&
      held !== undefined &&
      existsSync(scene.markFile) &&
      husk.includes(".git") &&
      husk.includes("README.md") &&
      !husk.includes("zz-hold.bin"),
    `${handed.status} ${handed.text.slice(0, 300)}; send ${JSON.stringify(handed.row ?? "none")}; held by pid ${held ?? "none"}; mark ${existsSync(scene.markFile) ? "there" : "missing"}; at the path: ${husk.join(", ") || "nothing"}`
  );
  // git's local clone linked the source's object files (`--local`); the cut
  // gave each its own inode before its checkout (workspace.ts
  // `createWorkspace`, boundary.ts `ownInodes`), so a cut cut short leaves no
  // file the source's place would deny.
  const objects = join(workspace.path, ".git", "objects");
  const listed = (await Bun.$`find ${objects} -type f`.quiet().nothrow().text())
    .split("\n")
    .filter(Boolean).length;
  const shared = (
    await Bun.$`find ${objects} -type f -links +1`.quiet().nothrow().text()
  )
    .split("\n")
    .filter(Boolean);
  kit.check(
    "(1) the cut held in its checkout shares no object file's inode with the repository it was cut from",
    listed > 0 && shared.length === 0,
    `${listed} object files, ${shared.length} sharing an inode${shared.length > 0 ? `: ${shared.slice(0, 3).join(", ")}` : ""}`
  );

  await fleet.stop("agent", "SIGKILL");
  if (held) {
    await fleet.killTree(listedPid(Number(held)), "SIGKILL");
  }
  await rm(arm, { force: true });
  const left = existsSync(workspace.path)
    ? (await readdir(workspace.path)).sort()
    : [];
  kit.check(
    "(2) with the agent and its checkout SIGKILLed, the husk stands at the path and the handoff is still kept",
    left.includes(".git") && kept(scene.sendOf(SHORT)),
    `at the path: ${left.join(", ") || "nothing"}; send ${JSON.stringify(scene.sendOf(SHORT) ?? "none")}`
  );
  const restarted = await fleet.logMark("agent");
  fleet.launch("agent");
  await fleet.agentUp();
  const cleared = `[workspace] ${workspace.id}: its cut at ${workspace.path}, cut short when this agent's last process ended, is cleared`;
  const since = await until(
    "the restarted agent cleared the cut",
    async () => await restarted.since(),
    (logged) => logged.includes(cleared),
    120_000
  ).catch(() => restarted.since());
  kit.check(
    "(2) the restarted agent's start-up pass clears the cut its last process left under way, and says so",
    since.includes(cleared),
    since
      .split("\n")
      .filter((line) => line.includes(workspace.id))
      .slice(-12)
      .join(" | ") || "no line naming the workspace"
  );
  await reached(kit, scene, "(2)", [SHORT]);
};

/** (4) A husk a build before the mark left: create.json and a `.git` alone. */
const legacyPhase = async (kit: Kit, scene: Scene): Promise<void> => {
  const { workspace, stateDir } = scene;
  await mkdir(stateDir, { recursive: true });
  await writeFile(
    join(stateDir, "create.json"),
    JSON.stringify({ path: workspace.path })
  );
  await Bun.$`git clone --quiet --no-checkout ${scene.repoRoot} ${workspace.path}`
    .env({ ...process.env, HOME: scene.home })
    .quiet();
  const there = (await readdir(workspace.path)).join(", ");
  kit.check(
    "(4) a husk as a build before the mark left one: create.json naming the path, a .git alone there",
    there === ".git" &&
      existsSync(join(stateDir, "create.json")) &&
      !existsSync(scene.markFile),
    there
  );
  const handed = await scene.handOff(LEGACY);
  kit.check(
    "(4) the handoff is kept at the hub while the clone is cut again",
    handed.status === 200 && handed.row !== undefined,
    `${handed.status} ${handed.text.slice(0, 300)}; send ${JSON.stringify(handed.row ?? "none")}`
  );
  await reached(kit, scene, "(4)", [LEGACY]);
};

/** (5) A handoff behind the agent's restart fence, and one while it is down: both kept, both delivered once it is back. */
const restartPhase = async (kit: Kit, scene: Scene): Promise<void> => {
  const { fleet } = scene;
  const fence = await fetch(
    `http://127.0.0.1:${fleet.env.CAWCO_MCP_PORT}/restart/fence`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ms: 300_000 }),
    }
  );
  const fenced = (await fence.json().catch(() => ({}))) as {
    fenced?: boolean;
  };
  const hub = await fleet.logMark("hub");
  const fencedHanded = await scene.handOff(FENCED);
  /** The hub's line that the cut waits, naming the session and the agent's refusal. */
  const waitLine = (logged: string) =>
    logged
      .split("\n")
      .find(
        (line) =>
          line.includes(scene.instanceId) && line.includes(AGENT_RESTARTING)
      );
  const hubSaid = await until(
    "the hub's word that the cut waits for the agent",
    async () => await hub.since(),
    (logged) => waitLine(logged) !== undefined,
    60_000
  ).catch(() => hub.since());
  kit.check(
    "(5) behind the agent's restart fence, a handoff is kept at the hub, not failed, and the hub says the cut waits for the agent",
    fenced.fenced === true &&
      fencedHanded.status === 200 &&
      waitLine(hubSaid) !== undefined &&
      kept(scene.sendOf(FENCED)),
    `fence ${JSON.stringify(fenced)}; ${fencedHanded.status} ${fencedHanded.text.slice(0, 300)}; send ${JSON.stringify(scene.sendOf(FENCED) ?? "none")}; ${
      hubSaid
        .split("\n")
        .filter((line) => line.includes(scene.instanceId))
        .join(" | ") || "no hub line naming the session"
    }`
  );
  await fleet.stop("agent");
  const downHanded = await scene.handOff(DOWN);
  kit.check(
    "(5) with the agent down, a handoff is kept at the hub too",
    downHanded.status === 200 && kept(scene.sendOf(DOWN)),
    `${downHanded.status} ${downHanded.text.slice(0, 300)}; send ${JSON.stringify(scene.sendOf(DOWN) ?? "none")}`
  );
  fleet.launch("agent");
  await fleet.agentUp();
  await reached(kit, scene, "(5)", [FENCED, DOWN]);
};

/** (6) Someone else's folder at the path refuses the cut, naming what is there. */
const strangerPhase = async (kit: Kit, scene: Scene): Promise<void> => {
  const { workspace } = scene;
  await mkdir(join(workspace.path, "draft"), { recursive: true });
  await writeFile(join(workspace.path, "notes.txt"), "a person's own\n");
  await writeFile(join(workspace.path, "draft", "plan.md"), "theirs too\n");
  const refusal = `cannot be cut again at ${workspace.path}: this machine's agent has no record of cutting workspace ${workspace.id} there, and it holds 2 entries (draft, notes.txt), so it is left as it is. Move it away or delete it (rm -rf`;
  const handed = await scene.handOff(REFUSED);
  const row = await until(
    "the refused handoff failed",
    () => scene.sendOf(REFUSED),
    (one) => one.state === "failed",
    120_000
  ).catch(() => scene.sendOf(REFUSED));
  kit.check(
    "(6) someone else's folder at the path refuses the cut: the handoff fails, its reason naming both entries and how to clear the path, and both stand",
    handed.status === 200 &&
      row?.state === "failed" &&
      (row.reason ?? "").includes(refusal) &&
      existsSync(join(workspace.path, "notes.txt")) &&
      existsSync(join(workspace.path, "draft", "plan.md")) &&
      scene.workspaceOf().state === "archived",
    `${handed.status} ${handed.text.slice(0, 300)}; send ${JSON.stringify(row ?? "none")}`
  );
};

/** The fleet, its project and parent, and M delegated, landed and retired: (1)'s first half. */
const setUp = async (kit: Kit): Promise<Scene> => {
  const fleet = await kit.fleet(respond);
  const home = fleet.env.HOME as string;
  const arm = join(fleet.sandbox, "hold-armed");
  const hit = join(fleet.sandbox, "hold-hit");

  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();

  // The fleet's own git config: its smudge holds a checkout while armed.
  await writeFile(
    join(home, ".gitconfig"),
    [
      "[user]",
      "\tname = Owner",
      "\temail = owner@probe.test",
      '[filter "probe-hold"]',
      `\tsmudge = "if [ -e '${arm}' ]; then echo $PPID > '${hit}'; while [ -e '${arm}' ]; do sleep 0.2; done; fi; cat"`,
      "\tclean = cat",
      "",
    ].join("\n")
  );
  const src = join(fleet.sandbox, "src");
  await mkdir(src, { recursive: true });
  await writeFile(join(src, "README.md"), "recut\n");
  await writeFile(
    join(src, ".gitattributes"),
    "zz-hold.bin filter=probe-hold\n"
  );
  await writeFile(join(src, "zz-hold.bin"), `${HELD_TEXT}\n`);
  await Bun.$`sh -c ${"git init -q -b main && git add -A && git commit -qm 'First commit'"}`
    .cwd(src)
    .env({ ...process.env, HOME: home })
    .quiet();
  const repoRoot = (
    await Bun.$`git rev-parse --show-toplevel`.cwd(src).quiet().text()
  ).trim();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Recut",
    machineId: MACHINE,
    cwd: src,
  });
  const parent = await fleet.spawn("claude", "Parent", src, {
    projectId: project.id,
  });
  const credential =
    (await Bun.file(`/proc/${await fleet.sessionPid(parent)}/environ`).text())
      .split("\0")
      .find((line) => line.startsWith("CAWCO_SESSION_CREDENTIAL="))
      ?.slice("CAWCO_SESSION_CREDENTIAL=".length) ?? "";

  const started = await fleet.api<{
    instanceId: string;
    workItemId: string;
    workspaceId: string;
  }>("/api/work-items", {
    parentInstanceId: parent,
    title: "Commit and end M",
    prompt: `${TAG}: commit a file.`,
    harness: "claude",
    model: "claude-haiku-4-5",
    cwd: src,
  });
  const workspaceOf = () =>
    fleet.query<Workspace>(
      "SELECT id, path, state FROM workspaces WHERE id = ?",
      started.workspaceId
    )[0] as Workspace;
  const stateBecomes = (state: string) =>
    until(
      `workspace ${started.workspaceId} ${state}`,
      workspaceOf,
      (row) => row.state === state,
      SETTLE_MS
    ).catch(workspaceOf);
  const first = await until(
    "M's item ended",
    () =>
      fleet.query<{ state: string; error: string | null }>(
        "SELECT state, error FROM work_items WHERE id = ?",
        started.workItemId
      )[0],
    (row) =>
      row !== undefined && ["done", "failed", "cancelled"].includes(row.state),
    300_000
  );
  const workspace = workspaceOf();
  const retired = await stateBecomes("archived");
  kit.check(
    "(1) M's work lands and its workspace retires, its clone gone",
    first.state === "done" &&
      retired.state === "archived" &&
      !existsSync(workspace.path),
    `${first.state} ${first.error ?? ""}; ${retired.state}; clone ${existsSync(workspace.path) ? "stands" : "gone"}`
  );
  const head = JSON.parse(
    fleet.query<{ head: string | null }>(
      "SELECT head FROM workspaces WHERE id = ?",
      workspace.id
    )[0]?.head ?? "null"
  ) as Scene["head"];
  const sendOf = (mark: string) =>
    fleet.query<SendRow>(
      "SELECT owed, reason, state FROM sent_messages WHERE instance_id = ? AND body LIKE ? ORDER BY accepted_at DESC",
      started.instanceId,
      `%${said(mark)}%`
    )[0];
  const stateDir = join(home, ".cawco", "workspaces", workspace.id);
  return {
    fleet,
    head,
    home,
    instanceId: started.instanceId,
    itemId: started.workItemId,
    markFile: join(stateDir, "cut.json"),
    repoRoot,
    sendOf,
    stateBecomes,
    stateDir,
    workspace,
    workspaceOf,
    handOff: async (mark) => {
      const ask = () =>
        toolWords({ base: fleet.base, id: parent, credential }, "handoff", {
          target: started.instanceId,
          message: said(mark),
        });
      let handed = await ask();
      // A cold target is refused once with the cost considerations, and no send is made; the repeat goes.
      if (!sendOf(mark)) {
        handed = await ask();
      }
      return { status: handed.status, text: handed.text, row: sendOf(mark) };
    },
  };
};

const spec: Spec = {
  name: "recut-interrupted",
  host: "it delegates, so its fleet cuts workspaces",
  run: async (kit: Kit) => {
    reports.clear();
    step.finished.clear();
    step.searched.clear();
    const scene = await setUp(kit);
    await cutShortPhase(kit, scene);
    const again = await scene.handOff(AGAIN);
    kit.check(
      "(3) a second handoff is kept at the hub while the clone is cut again",
      again.status === 200 && again.row !== undefined,
      `${again.status} ${again.text.slice(0, 300)}`
    );
    await reached(kit, scene, "(3)", [AGAIN]);
    await legacyPhase(kit, scene);
    await restartPhase(kit, scene);
    await strangerPhase(kit, scene);
  },
};

export default spec;
