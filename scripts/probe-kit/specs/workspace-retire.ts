/**
 * A machine's disk never fills with spent work (hub workspace-retire.ts,
 * agent workspace.ts `archiveWorkspace`, scripts/lib/disk-room.sh). On a
 * scratch fleet (real hub, agent and sessiond; Claude Code against the mock
 * model), boundaries included: run it where a workspace boundary can start
 * (not inside another one), as state-records does.
 *
 * Two delegates of one parent each commit a file and leave a folder in
 * their TMPDIR (as a scratch fleet a SIGKILL cut short leaves one); the
 * probe gives each clone an Apple build root in the workspaces' cache, as
 * build-both.sh makes one (`xdg/cawco-apple/<clone's folder>` and its lock).
 * L calls finish_item and the hub lands its commit; K calls it blocked, so
 * its item fails with its commit on no remote.
 *
 * (a) Right after both items end, a retirement sweep retires neither: the
 *     rule's two idle hours have not passed.
 * (b) Their items' ends and their sessions' last turns set back three
 *     hours, a sweep retires L: its clone, state dir, TMPDIR (the folder
 *     left there with it) and build root with its lock are gone, its row
 *     archived.
 * (c) K stays: its clone, TMPDIR and build root stand, its row active, and
 *     it is kept and listed, at GET /api/workspaces/kept and in the
 *     parent's delegate_list, with its machine, 1 commit on no remote and
 *     its clone's size.
 * (d) A heavy run, and build-both.sh, refuse to start below the free-space
 *     threshold (here forced up with CAWCO_MIN_FREE_GB), exit 3, with one
 *     sentence naming the free space and the biggest folders. build-both.sh
 *     builds on the Mac: from a CawCo workspace on Linux it cannot reach it,
 *     and that part is noted, not run.
 *
 *   bun scripts/probe-kit/run.ts workspace-retire
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";

const TAG = /PROBE-RETIRE-([LK])/;
const FINISH = "mcp__cawco__finish_item";
/** Past the rule's two idle hours (workspace-retire.ts `RETIRE_IDLE_MS`). */
const BACKDATE_MS = 3 * 3_600_000;
/** A free-space threshold no disk meets. */
const UNREACHABLE_GB = "100000";
const REFUSAL = new RegExp(
  `did not start: \\S+ has [0-9.]+ GB free, under the ${UNREACHABLE_GB} GB .*; the biggest folders under CawCo's workspace roots here are .+\\.$`
);

/** What each delegate runs in its workspace: a folder left in its TMPDIR, a commit. */
const commitCommand = (tag: string) =>
  [
    `mkdir -p "$TMPDIR/scratch-fleet-left-${tag}" && echo left > "$TMPDIR/scratch-fleet-left-${tag}/file"`,
    `echo 'made by ${tag}' > retire-${tag}.txt`,
    `git add retire-${tag}.txt`,
    `git -c user.name=Delegate -c user.email=d@probe.test commit -qm 'Delegate commit ${tag}'`,
    `echo DONE-COMMIT-${tag}`,
  ].join(" && ");

const steps: Record<string, { finish?: boolean; searched?: boolean }> = {};

const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  const tag = request.tools ? TAG.exec(request.all)?.[1] : undefined;
  if (!tag) {
    return text("ok");
  }
  steps[tag] ??= {};
  const step = steps[tag];
  const tool = (name: string, input: object): Reply => ({
    everyMs: 5,
    words: [],
    tool: { name, input },
  });
  if (!request.all.includes(`DONE-COMMIT-${tag}`)) {
    return tool("Bash", {
      command: commitCommand(tag),
      description: "Commit",
    });
  }
  if (!step.finish && request.toolNames.includes(FINISH)) {
    step.finish = true;
    return tool(
      FINISH,
      tag === "L"
        ? { summary: "Committed retire-L.txt." }
        : {
            summary: "Committed retire-K.txt and stopped.",
            blocked: { command: "probe", error: "K stops here on purpose" },
          }
    );
  }
  if (
    !(step.finish || step.searched) &&
    request.toolNames.includes("ToolSearch")
  ) {
    step.searched = true;
    return tool("ToolSearch", {
      query: `select:${FINISH}`,
      max_results: 1,
    });
  }
  return text("done");
};

interface Workspace {
  id: string;
  path: string;
  state: string;
  tmp: string | null;
}

interface Kept {
  ahead: number;
  bytes: number;
  holds: string;
  machine: string;
  workspaceId: string;
}

interface Sweep {
  failed: { workspaceId: string; reason: string }[];
  kept: Kept[];
  retired: { workspaceId: string }[];
}

/** A command's exit code and stderr, run with no heavy-run slot of this process's. */
const refused = async (
  command: string
): Promise<{ code: number; stderr: string }> => {
  // This spec holds a slot; a child that inherits the mark takes none and checks nothing.
  const { CAWCO_HEAVY_RUN_HELD: _held, ...inherited } = process.env;
  const env = { ...inherited, CAWCO_MIN_FREE_GB: UNREACHABLE_GB };
  const ran = await Bun.$`bash -c ${command}`
    .cwd(ROOT)
    .env(env)
    .quiet()
    .nothrow();
  return { code: ran.exitCode, stderr: ran.stderr.toString().trim() };
};

/** (d) Heavy runs and Apple builds refuse to start without room on the disk. */
const diskPhase = async (kit: Kit): Promise<void> => {
  const heavy = await refused(
    "source scripts/lib/heavy-run.sh && heavy_run probe-heavy-run && echo STARTED"
  );
  kit.check(
    "(d) a heavy run refuses below the threshold: exit 3, one sentence, nothing started",
    heavy.code === 3 &&
      REFUSAL.test(heavy.stderr) &&
      heavy.stderr.split("\n").length === 1 &&
      heavy.stderr.startsWith("probe-heavy-run did not start:"),
    `exit ${heavy.code}: ${heavy.stderr}`
  );
  if (process.platform === "linux" && process.env.CAWCO_WORKSPACE) {
    kit.note(
      "(d) build-both.sh not run: it builds on the Mac, which a CawCo workspace on Linux cannot reach; run this spec on the Mac, or from a shell with `ssh mac`"
    );
    return;
  }
  const build = await refused(
    "bash apps/apple/scripts/build-both.sh ios --compile-only"
  );
  const sentence = build.stderr.split("\n").at(-1) ?? "";
  kit.check(
    "(d) build-both.sh refuses below the threshold: exit 3 with the sentence, before any build",
    build.code === 3 &&
      REFUSAL.test(sentence) &&
      sentence.includes("build-both.sh") &&
      !build.stderr.includes("BUILT"),
    `exit ${build.code}: ${build.stderr.slice(-1200)}`
  );
};

const spec: Spec = {
  name: "workspace-retire",
  run: async (kit: Kit) => {
    const { check } = kit;
    const fleet = await kit.fleet(respond);
    const home = fleet.env.HOME as string;
    const apple = join(home, ".cawco", "workspace-cache", "xdg", "cawco-apple");

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
    await Bun.$`sh -c ${"git init -q -b main && echo retire > README.md && git add -A && git commit -qm 'First commit'"}`
      .cwd(src)
      .env({ ...process.env, HOME: home })
      .quiet();
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: "Retire",
      machineId: MACHINE,
      cwd: src,
    });
    const parent = await fleet.spawn("claude", "Parent", src, {
      projectId: project.id,
    });

    const workspaceOf = (id: string) =>
      fleet.query<Workspace>(
        "SELECT id, path, state, tmp FROM workspaces WHERE id = ?",
        id
      )[0] as Workspace;
    const delegate = async (tag: "L" | "K") => {
      const started = await fleet.api<{
        instanceId: string;
        workItemId: string;
        workspaceId: string;
      }>("/api/work-items", {
        parentInstanceId: parent,
        title: `Commit and end ${tag}`,
        prompt: `PROBE-RETIRE-${tag}: commit a file.`,
        harness: "claude",
        model: "claude-haiku-4-5",
        cwd: src,
        checks: [{ name: "Probe check", command: "true" }],
      });
      const item = await until(
        `work item ${tag} ended`,
        () =>
          fleet.query<{ state: string; error: string | null }>(
            "SELECT state, error FROM work_items WHERE id = ?",
            started.workItemId
          )[0],
        (row) =>
          row !== undefined &&
          ["done", "failed", "cancelled"].includes(row.state),
        300_000
      );
      return { ...started, item };
    };
    const [l, k] = [await delegate("L"), await delegate("K")];
    check(
      "L's item is done, its commit landed; K's failed, blocked",
      l.item.state === "done" && k.item.state === "failed",
      `L ${l.item.state} ${l.item.error ?? ""}; K ${k.item.state} ${k.item.error ?? ""}`
    );
    const wl = workspaceOf(l.workspaceId);
    const wk = workspaceOf(k.workspaceId);
    // Each clone's Apple build root, as build-both.sh leaves one.
    for (const clone of [wl.path, wk.path]) {
      // biome-ignore lint/performance/noAwaitInLoops: two folders
      await mkdir(join(apple, basename(clone), "DerivedData"), {
        recursive: true,
      });
      await writeFile(
        join(apple, basename(clone), "DerivedData", "build.db"),
        "x"
      );
      await mkdir(join(apple, ".locks"), { recursive: true });
      await writeFile(join(apple, ".locks", basename(clone)), "1");
    }
    const owned = (workspace: Workspace) => ({
      clone: workspace.path,
      state: join(home, ".cawco", "workspaces", workspace.id),
      tmp: workspace.tmp ?? "",
      left: join(
        workspace.tmp ?? "",
        `scratch-fleet-left-${workspace.id === wl.id ? "L" : "K"}`
      ),
      buildRoot: join(apple, basename(workspace.path)),
      buildLock: join(apple, ".locks", basename(workspace.path)),
    });
    const standing = (workspace: Workspace) =>
      Object.entries(owned(workspace))
        .filter(([, path]) => path && existsSync(path))
        .map(([name]) => name);
    const all = Object.keys(owned(wl));
    check(
      "before: each workspace's clone, state dir, TMPDIR, left folder and build root stand",
      standing(wl).length === all.length && standing(wk).length === all.length,
      `L: ${standing(wl).join(", ")}; K: ${standing(wk).join(", ")}`
    );

    // ── (a) the rule's delay ────────────────────────────────────────────
    const early = await fleet.api<Sweep>("/api/workspaces/retire", {});
    check(
      "(a) a sweep right after the items end retires neither: the two idle hours have not passed",
      early.retired.length === 0 &&
        workspaceOf(wl.id).state === "active" &&
        existsSync(wl.path),
      JSON.stringify(early)
    );

    // ── (b) idle past the rule's delay ──────────────────────────────────
    const then = Date.now() - BACKDATE_MS;
    for (const id of [l.workItemId, k.workItemId]) {
      fleet.write("UPDATE work_items SET ended_at = ? WHERE id = ?", then, id);
    }
    for (const id of [l.instanceId, k.instanceId]) {
      fleet.write(
        "UPDATE instances SET turn_ended_at = ?, last_request_at = ? WHERE id = ?",
        then,
        then,
        id
      );
    }
    const swept = await fleet.api<Sweep>("/api/workspaces/retire", {});
    check(
      "(b) the sweep retires L, and only L",
      swept.retired.length === 1 && swept.retired[0]?.workspaceId === wl.id,
      JSON.stringify(swept)
    );
    check(
      "(b) L's clone, state dir, TMPDIR with the folder left there, build root and its lock are gone",
      standing(wl).length === 0,
      `still there: ${standing(wl).join(", ") || "nothing"}`
    );
    check(
      "(b) L's row is archived",
      workspaceOf(wl.id).state === "archived",
      workspaceOf(wl.id).state
    );

    // ── (c) unlanded work stays, listed ─────────────────────────────────
    check(
      "(c) K's clone, state dir, TMPDIR, left folder and build root all stand",
      standing(wk).length === all.length,
      `standing: ${standing(wk).join(", ")}`
    );
    check(
      "(c) K's row is active",
      workspaceOf(wk.id).state === "active",
      workspaceOf(wk.id).state
    );
    const { kept } = await fleet.api<{ kept: Kept[] }>("/api/workspaces/kept");
    const listed = kept.find((entry) => entry.workspaceId === wk.id);
    check(
      "(c) K is kept and listed: its machine, 1 commit on no remote, its clone's size",
      kept.length === 1 &&
        listed?.ahead === 1 &&
        listed.holds === "1 commit on no remote" &&
        listed.bytes > 0 &&
        listed.machine.length > 0,
      JSON.stringify(kept)
    );
    const credential = (
      await Bun.file(`/proc/${await fleet.sessionPid(parent)}/environ`).text()
    )
      .split("\0")
      .find((line) => line.startsWith("CAWCO_SESSION_CREDENTIAL="))
      ?.slice("CAWCO_SESSION_CREDENTIAL=".length);
    const listing = await fetch(`${fleet.base}/api/delegation/call/${parent}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${credential ?? ""}`,
      },
      body: JSON.stringify({ name: "delegate_list", arguments: {} }),
    });
    const said = await listing.text();
    check(
      "(c) the parent's delegate_list lists K under kept",
      listing.ok &&
        said.includes(wk.id) &&
        said.includes("1 commit on no remote"),
      `${listing.status} ${said.slice(0, 1500)}`
    );

    await diskPhase(kit);
  },
};

export default spec;
