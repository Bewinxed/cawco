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
 * (e) Every archive reads the clone first (hub work-items.ts `archive`,
 *     agent `archiveWorkspace`). K given a changed and an untracked file: a
 *     dashboard's raw `workspaceDiscard` control (an archive with a carry),
 *     is refused at the hub's relay; POST /api/workspaces/K/archive answers
 *     409 naming "1 commit on no remote, 2 changed files" and the clone's
 *     size, and the clone, its files and its row stand. With `discard: true`
 *     it answers 200 naming a carry in ~/.cawco/carries that holds the
 *     commit (a bundle listing K's branch, a patch with its file) and the
 *     uncommitted diff (both files), then the clone is gone and the row
 *     archived. A third delegate M, landed and clean, archives with 200 and
 *     no carry, its clone gone.
 * (f) Nothing CawCo runs makes anything at a gone clone's path. Three more
 *     delegates H, G and S land and finish, their boundaries up. Each clone
 *     is deleted under its running sandbox: each boundary closes and
 *     nothing is at any of the three paths; after an agent restart, still
 *     nothing.
 * (g) A husk is retired. G's path refilled as an earlier build left one on
 *     obelisk (cockpit-95d26a37: `.git/hooks`, `.git/modules`, `.vscode`, a
 *     read-only `.opencode`, empty `.bashrc`, `.bash_profile` and
 *     `.ripgreprc`, the stand-in `opencode.json`), S's the same plus a file
 *     of a user's. Set past the idle hours, a sweep retires H (gone) and G
 *     (its husk gone too) and fails on neither; S is kept and listed, "1
 *     entry of its own in a folder that is no git clone", its file standing.
 *     A second sweep changes nothing, and the hub's log holds no "not
 *     retired" line for any of the three and one "kept" line for S.
 * (d) A heavy run, and build-both.sh, refuse to start below the free-space
 *     threshold (here forced up with CAWCO_MIN_FREE_GB), exit 3, with one
 *     sentence naming the free space and the biggest folders. build-both.sh
 *     builds on the Mac: from a CawCo workspace on Linux it cannot reach it,
 *     and that part is noted, not run.
 *
 *   bun scripts/probe-kit/run.ts workspace-retire
 */
import { existsSync } from "node:fs";
import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";

const TAG = /PROBE-RETIRE-([LKMHGS])/;
/** A size in words (core `sizeWords`), alone and as the 409 places it before the clone's path. */
const SIZE = /^\d+(\.\d)? (GB|MB|KB)$/;
const SIZE_AT = /\(\d+(\.\d)? (GB|MB|KB) at /;
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
      tag === "K"
        ? {
            headline: "Committed retire-K.txt and stopped.",
            summary: "Committed retire-K.txt and stopped.",
            blocked: { command: "probe", error: "K stops here on purpose" },
          }
        : {
            headline: `Committed retire-${tag}.txt.`,
            summary: `Committed retire-${tag}.txt.`,
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

type Fleet = Awaited<ReturnType<Kit["fleet"]>>;

/** An archive asked over HTTP: its status and its answer's text. */
const archiveOver = async (
  fleet: Fleet,
  id: string,
  body?: object
): Promise<{ status: number; text: string }> => {
  const response = await fetch(`${fleet.base}/api/workspaces/${id}/archive`, {
    method: "POST",
    ...(body && {
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    signal: AbortSignal.timeout(120_000),
  });
  return { status: response.status, text: await response.text() };
};

/** (e) No archive deletes unlanded work unless a person discards it, and then a carry holds it. */
const archivePhase = async (
  kit: Kit,
  fleet: Fleet,
  {
    k,
    workspaceOf,
    delegate,
  }: {
    k: Workspace;
    workspaceOf: (id: string) => Workspace;
    delegate: (
      tag: "M"
    ) => Promise<{ workspaceId: string; item: { state: string } }>;
  }
): Promise<void> => {
  const { check } = kit;
  await writeFile(join(k.path, "README.md"), "changed by the probe\n");
  await writeFile(join(k.path, "uncommitted-K.txt"), "dirty K\n");

  // A dashboard's raw control, asking to carry: the hub's relay refuses it.
  await fleet.post({
    verb: "control",
    machineId: MACHINE,
    requestId: crypto.randomUUID(),
    payload: {
      requestId: crypto.randomUUID(),
      method: "workspaceDiscard",
      args: [{ id: k.id, path: k.path, unlanded: "keep" }],
    },
  });

  const held = await fleet.api<{ holds: string; size: string }>(
    `/api/workspaces/${k.id}/held`
  );
  check(
    "(e) GET held names what K holds: 1 commit on no remote, 2 changed files, and its size",
    held.holds === "1 commit on no remote, 2 changed files" &&
      SIZE.test(held.size),
    JSON.stringify(held)
  );
  const kept = await archiveOver(fleet, k.id);
  check(
    "(e) POST archive on K answers 409 naming its commit, its changed files and its size; nothing deleted",
    kept.status === 409 &&
      kept.text.includes("holds 1 commit on no remote, 2 changed files (") &&
      SIZE_AT.test(kept.text) &&
      kept.text.includes(k.path) &&
      kept.text.includes("nothing was deleted"),
    `${kept.status} ${kept.text}`
  );
  check(
    "(e) after the raw control and the refused POST, K's clone, its commit, its changed files and its row stand",
    existsSync(join(k.path, "retire-K.txt")) &&
      existsSync(join(k.path, "uncommitted-K.txt")) &&
      (await Bun.file(join(k.path, "README.md")).text()) ===
        "changed by the probe\n" &&
      workspaceOf(k.id).state === "active",
    workspaceOf(k.id).state
  );

  const discarded = await archiveOver(fleet, k.id, { discard: true });
  const carry =
    discarded.status === 200
      ? ((JSON.parse(discarded.text) as { carry: string | null }).carry ?? "")
      : "";
  check(
    "(e) POST archive on K with discard answers 200 naming a carry in ~/.cawco/carries",
    discarded.status === 200 &&
      carry.startsWith(join(fleet.home, ".cawco", "carries", `${k.id}-`)) &&
      existsSync(carry),
    `${discarded.status} ${discarded.text.slice(0, 600)}`
  );
  const heads = carry
    ? (
        await Bun.$`git bundle list-heads ${join(carry, "commits.bundle")}`
          .quiet()
          .nothrow()
      ).stdout.toString()
    : "";
  const patches = carry
    ? await Array.fromAsync(new Bun.Glob("commits/*.patch").scan(carry))
    : [];
  const patch = patches[0]
    ? await Bun.file(join(carry, patches[0])).text()
    : "";
  check(
    "(e) the carry holds K's commit: a bundle listing its branch, and a patch adding retire-K.txt",
    heads.includes(`refs/heads/ws/${k.id.slice(0, 8)}`) &&
      patches.length === 1 &&
      patch.includes("Delegate commit K") &&
      patch.includes("+made by K"),
    `heads: ${heads.trim()}; patches: ${patches.join(", ")}`
  );
  const diff = carry
    ? await Bun.file(join(carry, "uncommitted.patch"))
        .text()
        .catch(() => "")
    : "";
  check(
    "(e) the carry holds K's uncommitted diff: README.md changed and uncommitted-K.txt added, and a README saying how to take it back",
    diff.includes("+changed by the probe") &&
      diff.includes("+dirty K") &&
      diff.includes("uncommitted-K.txt") &&
      existsSync(join(carry, "README.md")),
    diff.slice(0, 800)
  );
  check(
    "(e) then K's clone is gone and its row archived",
    !existsSync(k.path) && workspaceOf(k.id).state === "archived",
    `${existsSync(k.path) ? "clone stands" : "clone gone"}, ${workspaceOf(k.id).state}`
  );

  const m = await delegate("M");
  const wm = workspaceOf(m.workspaceId);
  const landed = await archiveOver(fleet, wm.id);
  check(
    "(e) M, landed and clean, archives with 200 and no carry; its clone is gone",
    m.item.state === "done" &&
      landed.status === 200 &&
      (JSON.parse(landed.text) as { carry: string | null }).carry === null &&
      !existsSync(wm.path) &&
      workspaceOf(wm.id).state === "archived",
    `${m.item.state}; ${landed.status} ${landed.text.slice(0, 400)}`
  );
};

/** A delegate this spec started, and how its item ended. */
interface Delegated {
  instanceId: string;
  item: { state: string; error: string | null };
  workItemId: string;
  workspaceId: string;
}

/** The text of OpenCode's stand-in config (core workspace-policy.ts `OPENCODE_EMPTY`). */
const OPENCODE_EMPTY = '{"$schema":"https://opencode.ai/config.json"}\n';

/** What an earlier build left at a deleted clone's path (cockpit-95d26a37 on obelisk). */
const makeHusk = async (path: string): Promise<void> => {
  for (const dir of [".git/hooks", ".git/modules", ".vscode", ".opencode"]) {
    // biome-ignore lint/performance/noAwaitInLoops: a few dirs
    await mkdir(join(path, dir), { recursive: true });
  }
  await chmod(join(path, ".opencode"), 0o555);
  for (const name of [".bashrc", ".bash_profile", ".ripgreprc"]) {
    // biome-ignore lint/performance/noAwaitInLoops: a few files
    await writeFile(join(path, name), "", { mode: 0o644 });
  }
  await writeFile(join(path, "opencode.json"), OPENCODE_EMPTY);
};

/** (f) A gone clone stays gone, (g) a husk is retired and anything else in one keeps it. */
const huskPhase = async (
  kit: Kit,
  fleet: Fleet,
  {
    workspaceOf,
    delegate,
  }: {
    workspaceOf: (id: string) => Workspace;
    delegate: (tag: "H" | "G" | "S") => Promise<Delegated>;
  }
): Promise<void> => {
  const { check } = kit;
  const runs = [await delegate("H"), await delegate("G"), await delegate("S")];
  const [wh, wg, ws] = runs.map((run) => workspaceOf(run.workspaceId)) as [
    Workspace,
    Workspace,
    Workspace,
  ];
  const three = [wh, wg, ws];
  const boundaries = async (): Promise<string[]> =>
    (await fleet.heldProcs())
      .map(({ procId }) => procId)
      .filter((procId) =>
        three.some((workspace) => procId.startsWith(`boundary-${workspace.id}`))
      );
  const before = await boundaries();
  check(
    "(f) H, G and S are done, each with its boundary up",
    runs.every((run) => run.item.state === "done") &&
      three.every((workspace) =>
        before.some((procId) => procId.startsWith(`boundary-${workspace.id}`))
      ),
    `${runs.map((run) => `${run.item.state} ${run.item.error ?? ""}`).join("; ")}; boundaries: ${before.join(", ")}`
  );
  const at = () =>
    three.filter((workspace) => existsSync(workspace.path)).map(({ id }) => id);

  for (const workspace of three) {
    // biome-ignore lint/performance/noAwaitInLoops: three clones, each under its running sandbox
    await rm(workspace.path, { recursive: true, force: true });
  }
  // Each host watches its clone and its `.git` (boundary-host.ts
  // `watchClone`): it closes as the deletion lands, after srt's teardown,
  // whose slowest step is a bridge's SIGKILL at 1.5s. 15s is that bound
  // with room for a loaded machine, and no other event is waited for.
  const left = await until(
    "the three boundaries closed",
    boundaries,
    (procs) => procs.length === 0,
    15_000
  ).catch(boundaries);
  check(
    "(f) each clone deleted under its running sandbox: its boundary closes, and nothing is at any of the three paths",
    left.length === 0 && at().length === 0,
    `boundaries: ${left.join(", ") || "none"}; something at: ${at().join(", ") || "none"}`
  );

  // The agent's start-up pass (boundary.ts `rearmHooks`) rewrites each
  // workspace whose boundary runs, and says so once it is done; one with
  // none running, as each of these three is once its boundary closed, waits
  // unarmed for a session there. Its line, counted per launch, is the pass
  // done; no boundary of the three running after it is each known gone.
  const PASS_DONE = "[workspace] boundary hooks written for ";
  const passes = async () =>
    (await fleet.logs("agent")).split(PASS_DONE).length - 1;
  const passesBefore = await passes();
  await fleet.stop("agent");
  fleet.launch("agent");
  await fleet.agentUp();
  const passesAfter = await until(
    "the restarted agent's start-up pass done",
    passes,
    (count) => count > passesBefore,
    60_000
  ).catch(passes);
  const running = await boundaries();
  check(
    "(f) after an agent restart, its start-up pass done, none of the three has a boundary and nothing is at any of their paths",
    passesAfter > passesBefore && running.length === 0 && at().length === 0,
    `start-up passes logged: ${passesBefore} before, ${passesAfter} after; boundaries: ${running.join(", ") || "none"}; something at: ${at().join(", ") || "none"}`
  );

  await makeHusk(wg.path);
  await makeHusk(ws.path);
  await writeFile(join(ws.path, "notes.txt"), "a user's own\n");
  const then = Date.now() - BACKDATE_MS;
  for (const run of runs) {
    fleet.write(
      "UPDATE work_items SET ended_at = ? WHERE id = ?",
      then,
      run.workItemId
    );
    fleet.write(
      "UPDATE instances SET turn_ended_at = ?, last_request_at = ? WHERE id = ?",
      then,
      then,
      run.instanceId
    );
  }
  const swept = await fleet.api<Sweep>("/api/workspaces/retire", {});
  const retired = swept.retired.map(({ workspaceId }) => workspaceId);
  check(
    "(g) the sweep retires H (gone) and G (a husk), fails on none of the three, and leaves S",
    retired.includes(wh.id) &&
      retired.includes(wg.id) &&
      !retired.includes(ws.id) &&
      !swept.failed.some(({ workspaceId }) =>
        three.some((workspace) => workspace.id === workspaceId)
      ),
    JSON.stringify(swept)
  );
  check(
    "(g) G's husk is gone and its row archived, as H's",
    !existsSync(wg.path) &&
      workspaceOf(wg.id).state === "archived" &&
      workspaceOf(wh.id).state === "archived",
    `G ${existsSync(wg.path) ? "husk stands" : "gone"} ${workspaceOf(wg.id).state}; H ${workspaceOf(wh.id).state}`
  );
  const keptS = swept.kept.find((entry) => entry.workspaceId === ws.id);
  check(
    "(g) S, a husk with a user's file, is kept and listed, the file standing",
    keptS?.holds === "1 entry of its own in a folder that is no git clone" &&
      existsSync(join(ws.path, "notes.txt")) &&
      workspaceOf(ws.id).state === "active",
    JSON.stringify(keptS)
  );
  const again = await fleet.api<Sweep>("/api/workspaces/retire", {});
  const hub = (await fleet.logs("hub"))
    .split("\n")
    .filter((line) => line.includes("[workspace-retire]"));
  const of = (id: string, words: string) =>
    hub.filter((line) => line.includes(`${id} on `) && line.includes(words))
      .length;
  check(
    '(g) a second sweep changes nothing; the hub\'s log has no "not retired" line for any of the three, and one "kept" line for S',
    again.retired.length === 0 &&
      again.failed.length === 0 &&
      again.kept.some((entry) => entry.workspaceId === ws.id) &&
      three.every((workspace) => of(workspace.id, ": not retired:") === 0) &&
      of(ws.id, ": kept,") === 1,
    `${JSON.stringify(again)}; ${hub.filter((line) => three.some((workspace) => line.includes(workspace.id))).join(" | ")}`
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
    const delegate = async (
      tag: "L" | "K" | "M" | "H" | "G" | "S"
    ): Promise<Delegated> => {
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

    await archivePhase(kit, fleet, { k: wk, workspaceOf, delegate });
    await huskPhase(kit, fleet, { workspaceOf, delegate });
    await diskPhase(kit);
  },
};

export default spec;
