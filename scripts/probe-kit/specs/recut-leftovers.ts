/**
 * A workspace's cut owns what its own workspace made, and no boundary starts
 * in a folder that is not a clone yet. On a scratch fleet (real hub, agent
 * and sessiond; Claude Code against the mock model). This spec delegates,
 * so its fleet cuts workspaces: it runs on the host, outside every boundary.
 *
 * What happened on obelisk on 2026-10-25: a retired workspace's cut again
 * was refused, "it holds 1 entry (node_modules) that a checkout of
 * 98c38e438 did not write", the workspace's own link into the workspaces'
 * cache (agent workspace-modules.ts); then, its folder removed by hand, a
 * boundary started on it and left a sandbox's masks there, all stamped
 * 18:41:14, and the next cut again was refused: "its .git is no repository,
 * and it holds 7 entries (.bash_profile, .bashrc, .opencode, .pi, .vscode,
 * and 2 more)".
 *
 * The project installs with bun (a `bun.lock`) and ignores `node_modules`,
 * so a Linux clone's boundary links its `node_modules` into the cache.
 *
 * - (m) While a workspace's cut is marked under way and not yet checked out
 *   (agent interrupted-cut.ts `CutMark`), no boundary starts on it: its
 *   boundary closed, a command its live delegate runs there starts none, no
 *   mask is made in its folder, and the agent still runs. Once the mark
 *   goes, its boundary starts again on the agent's beat, and the next
 *   command runs in it.
 * - (n) A cut cut short after its checkout (the mark checked out), its
 *   clone holding the checkout, the boundary's stand-ins and `node_modules`
 *   linked into the cache with an install's file in it: the agent's start
 *   finds it its own, and clears it; no "left as it is" line.
 * - (o) A cut cut short before its checkout in a folder a sandbox filled:
 *   an empty `.git`, every root stand-in as the boundary's host makes it
 *   (boundary-host.ts `makeStandIn`), and that `node_modules` link: the
 *   agent's start finds it its own, and clears it; no "left as it is" line.
 *
 *   bun scripts/probe-kit/run.ts recut-leftovers
 */
import { existsSync } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  readlink,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { signal } from "../../../packages/core/src/signal";
import { cloneDenies } from "../../../packages/core/src/workspace-policy";
import { toolWords } from "../../lib/tool-call";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

const LEAF = "PROBE-RECUT-LEAF";
const RUN = "PROBE-RECUT-RUN";
/** What the leaf's command prints, made by the shell, so no request carries it before the command ran. */
const OUT = "RECUT-OUT-42";
const WAIT = "mcp__cawco__wait_item";
/** What wait_item answers once the wait is declared (work-items.ts `waitItem`). */
const WAITING = " is waiting until ";
/** The agent's line for a cut it found someone else's (workspace.ts `clearInterrupted`). */
const LEFT = "is left as it is";
/** The agent's line for a broken law (core invariant.ts). */
const LAW = "[law] Law broken:";

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const useTool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});
/** A deferred tool is found first, then called. */
const found = (request: Seen, name: string, input: object): Reply => {
  if (request.toolNames.includes(name)) {
    return useTool(name, input);
  }
  return request.toolNames.includes("ToolSearch")
    ? useTool("ToolSearch", { query: `select:${name}`, max_results: 1 })
    : text(`${name} is not offered`);
};
const waitAgain = (request: Seen): Reply =>
  found(request, WAIT, { minutes: 60, reason: "the probe's next step" });

/**
 * The leaf: declares a wait and stays at work; each hand-off it runs one
 * command in its clone, then declares its wait again.
 */
const respond = (request: Seen): Reply => {
  if (!(request.tools && request.all.includes(LEAF))) {
    return text("ok");
  }
  if (request.afterTool) {
    return request.last.includes(WAITING)
      ? text("Waiting.")
      : waitAgain(request);
  }
  return request.last.includes(RUN)
    ? useTool("Bash", {
        command: "echo RECUT-OUT-$((40+2))",
        description: "Probe step",
      })
    : waitAgain(request);
};

interface Workspace {
  id: string;
  path: string;
  repo_root: string;
}

/** The keeper's boundary processes of workspace `id`. */
const boundariesOf = async (
  fleet: KitFleet,
  id: string
): Promise<{ pid: number; procId: string }[]> =>
  (await fleet.heldProcs()).filter(({ procId }) =>
    procId.startsWith(`boundary-${id}`)
  );

/** Workspace `id`'s cut mark (agent interrupted-cut.ts `CutMark`), written as a cut under way leaves it. */
const markCut = async (
  home: string,
  workspace: Workspace,
  at: { branch: string; commit: string } | null,
  checkedOut: boolean
): Promise<string> => {
  const mark = join(home, ".cawco", "workspaces", workspace.id, "cut.json");
  await mkdir(dirname(mark), { recursive: true });
  await writeFile(
    mark,
    `${JSON.stringify({
      path: workspace.path,
      source: workspace.repo_root,
      at,
      ...(checkedOut ? { checkedOut: true } : {}),
    })}\n`
  );
  return mark;
};

/** The agent restarted, and the lines its start said of workspace `id`. */
const restartedSays = async (
  fleet: KitFleet,
  id: string
): Promise<string[]> => {
  await fleet.stop("agent");
  const watched = await fleet.logMark("agent");
  fleet.launch("agent");
  await fleet.agentUp();
  // Its start clears what each cut cut short left (workspace.ts `clearInterruptedCuts`).
  await until(
    `the agent's start read workspace ${id.slice(0, 8)}'s cut`,
    async () =>
      (await watched.since())
        .split("\n")
        .some(
          (line) =>
            line.includes(id) &&
            (line.includes(LEFT) || line.includes("archived"))
        ) || undefined,
    Boolean,
    120_000
  ).catch(() => undefined);
  return (await watched.since())
    .split("\n")
    .filter((line) => line.includes(id));
};

/**
 * A folder at `path` as a sandbox fills one whose clone is not there: an
 * empty `.git`, and each root deny path's stand-in as the boundary's host
 * makes it (boundary-host.ts `makeStandIn`): an empty folder (read-only where
 * it says so), or a file of its text.
 */
const maskedFolder = async (path: string): Promise<string[]> => {
  await mkdir(join(path, ".git"), { recursive: true });
  const made: string[] = [];
  for (const { path: deny, empty } of cloneDenies(path)) {
    if (dirname(deny) !== path || empty.kind === "none") {
      continue;
    }
    if (empty.kind === "dir") {
      // biome-ignore lint/performance/noAwaitInLoops: one stand-in at a time, as the host makes them
      await mkdir(deny);
      if (empty.readOnly) {
        await chmod(deny, 0o555);
      }
    } else {
      await writeFile(deny, empty.text, { mode: 0o644 });
    }
    made.push(deny.slice(path.length + 1));
  }
  return made;
};

const spec: Spec = {
  name: "recut-leftovers",
  host: "it delegates, so its fleet cuts workspaces",
  run: async (kit: Kit) => {
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
    const src = join(fleet.sandbox, "src");
    await mkdir(src, { recursive: true });
    await writeFile(
      join(home, ".gitconfig"),
      "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
    );
    await writeFile(join(src, "bun.lock"), "{}\n");
    await writeFile(join(src, ".gitignore"), "node_modules\n");
    await Bun.$`sh -c ${"git init -q -b main && echo recut > README.md && git add -A && git commit -qm 'First commit'"}`
      .cwd(src)
      .env({ ...process.env, HOME: home })
      .quiet();
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: "Recut leftovers",
      machineId: MACHINE,
      cwd: src,
    });
    const parent = await fleet.spawn("claude", "Parent", src, {
      projectId: project.id,
    });
    const session = {
      base: fleet.base,
      id: parent,
      credential: await fleet.sessionCredential(parent),
    };
    const leaf = await fleet.api<{
      instanceId: string;
      workItemId: string;
      workspaceId: string;
    }>("/api/work-items", {
      parentInstanceId: parent,
      title: "Recut leaf",
      prompt: `${LEAF}: wait for the probe.`,
      harness: "claude",
      model: "claude-haiku-4-5",
      cwd: src,
    });
    await until(
      "the leaf's wait declared",
      () =>
        fleet.query<{ wait_until: number | null }>(
          "SELECT wait_until FROM work_items WHERE id = ?",
          leaf.workItemId
        )[0]?.wait_until ?? null,
      (when) => when !== null,
      180_000
    );
    const [workspace] = fleet.query<Workspace>(
      "SELECT id, path, repo_root FROM workspaces WHERE id = ?",
      leaf.workspaceId
    );
    if (!workspace) {
      check("the leaf's workspace is on record", false, leaf.workspaceId);
      return;
    }
    const outs = () =>
      fleet.seen.filter(
        (one) => one.all.includes(LEAF) && one.all.includes(OUT)
      ).length;

    // (m) No boundary while the cut is under way and not checked out.
    const modules = join(workspace.path, "node_modules");
    const linked = await readlink(modules).catch(() => "");
    const mask = join(workspace.path, ".bashrc");
    // A cut again's: at the commit its clone stands at, on main.
    const head = (
      await Bun.$`git -C ${workspace.path} rev-parse HEAD`
        .quiet()
        .nothrow()
        .text()
    ).trim();
    const at = { branch: "main", commit: head };
    const mark = await markCut(home, workspace, at, false);
    const up = await boundariesOf(fleet, workspace.id);
    for (const one of up) {
      signal(one.pid as Parameters<typeof signal>[0], "SIGTERM");
    }
    await until(
      "the leaf's boundary closed",
      async () =>
        (await boundariesOf(fleet, workspace.id)).length === 0 || undefined,
      Boolean,
      60_000
    ).catch(() => undefined);
    await rm(mask, { force: true });
    const agentLog = await fleet.logMark("agent");
    const handed = await toolWords(session, "handoff", {
      target: leaf.instanceId,
      message: `${RUN}-1: run your command.`,
    });
    await Bun.sleep(30_000);
    const during = await boundariesOf(fleet, workspace.id);
    const laws = (await agentLog.since())
      .split("\n")
      .filter((line) => line.includes(LAW));
    check(
      "(m) while its cut is marked under way and not checked out, the leaf's command starts no boundary, makes no mask in its folder, prints nothing, and the agent runs on",
      !handed.refused &&
        up.length > 0 &&
        during.length === 0 &&
        !existsSync(mask) &&
        outs() === 0 &&
        laws.length === 0,
      `${handed.text.slice(0, 200)}; closed ${up.map((one) => one.procId).join(", ") || "none"}; during: ${during.map((one) => one.procId).join(", ") || "none"}; .bashrc ${existsSync(mask) ? "made" : "absent"}; outputs ${outs()}; ${laws.join(" / ") || "no law line"}`
    );
    await rm(mark, { force: true });
    // A session's process with no boundary has it started again on the
    // agent's beat (boundary.ts `revive`), now that its clone is one.
    const revived = await until(
      "the leaf's boundary started again once the mark went",
      async () => (await boundariesOf(fleet, workspace.id)).length || undefined,
      Boolean,
      180_000
    ).catch(() => 0);
    await toolWords(session, "handoff", {
      target: leaf.instanceId,
      message: `${RUN}-2: run your command again.`,
    });
    const ran = await until(
      "the leaf's command ran once the mark went",
      () => outs() || undefined,
      Boolean,
      180_000
    ).catch(() => 0);
    const after = await boundariesOf(fleet, workspace.id);
    check(
      "(m) once the mark goes, its boundary starts again and the leaf's next command runs in it",
      revived > 0 && ran > 0 && after.length > 0,
      `revived ${revived}; outputs ${ran}; boundaries ${after.map((one) => one.procId).join(", ") || "none"}`
    );

    // (n) A cut cut short after its checkout: the clone, its stand-ins and
    // node_modules linked into the cache, an install's file in it.
    const install = join(modules, ".probe-installed");
    await writeFile(install, "installed\n").catch(() => undefined);
    await markCut(home, workspace, at, true);
    const nSaid = await restartedSays(fleet, workspace.id);
    check(
      "(n) a cut cut short after its checkout, holding node_modules linked into the workspace's cache with an install in it, is its own: the agent's start clears it",
      process.platform !== "linux" ||
        (linked !== "" &&
          !existsSync(workspace.path) &&
          !nSaid.some((line) => line.includes(LEFT))),
      `node_modules → ${linked || "no link"}; folder ${existsSync(workspace.path) ? "stands" : "gone"}; ${nSaid.join(" | ") || "nothing said"}`
    );

    // (o) A cut cut short before its checkout, in a folder a sandbox filled.
    await mkdir(workspace.path, { recursive: true });
    const masks = await maskedFolder(workspace.path);
    if (linked) {
      await symlink(linked, modules);
    }
    await markCut(home, workspace, at, false);
    const oSaid = await restartedSays(fleet, workspace.id);
    const left = await lstat(workspace.path).then(
      () => "stands",
      () => "gone"
    );
    check(
      "(o) a cut cut short before its checkout, its folder an empty .git, a sandbox's masks and the node_modules link, is its own: the agent's start clears it",
      masks.length > 0 &&
        left === "gone" &&
        !oSaid.some((line) => line.includes(LEFT)),
      `masks ${masks.join(", ")}; folder ${left}; ${oSaid.join(" | ") || "nothing said"}`
    );
  },
};

export default spec;
