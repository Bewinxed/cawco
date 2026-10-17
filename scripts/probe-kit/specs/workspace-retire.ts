/**
 * A workspace lives exactly as long as its work item (hub work-items.ts
 * `settle`, workspace-retire.ts; agent workspace.ts `archiveWorkspace`,
 * scripts/lib/disk-room.sh). On a scratch fleet (real hub, agent and
 * sessiond; Claude Code against the mock model), boundaries included: run it
 * where a workspace boundary can start (not inside another one), as
 * state-records does.
 *
 * Each delegate of one parent commits a file and leaves a folder in its
 * TMPDIR (as a scratch fleet a SIGKILL cut short leaves one); the probe gives
 * L's and K's clones an Apple build root in the workspaces' cache, as
 * build-both.sh makes one (`xdg/cawco-apple.noindex/<clone's folder>` and its lock),
 * as each starts. Each calls finish_item and the hub lands its commit; K
 * calls it blocked, so its item fails with its commit on no remote.
 *
 * (b) L's work lands and its workspace retires with no archive call, once its
 *     session sleeps: its clone, state dir, TMPDIR (the folder left there
 *     with it) and build root with its lock are gone, its row archived, no
 *     boundary or judge of it on the keeper.
 * (c) K's failed item leaves its workspace held: its clone, state dir,
 *     TMPDIR and build root stand, its row held with its holding words ("1
 *     commit on no remote") and size at GET /api/workspaces/K/held, in GET
 *     /api/workspaces/held, and under held in the parent's delegate_list.
 * (e) K given a changed and an untracked file: a dashboard's raw
 *     `workspaceDiscard` control (an archive with a carry) is refused at the
 *     hub's relay; POST /api/workspaces/K/archive answers 409 naming "1
 *     commit on no remote, 2 changed files" and the clone's size, the
 *     clone, its files and its held row stand, and its held words are read
 *     again. With `discard: true` it answers 200 naming a carry in
 *     ~/.cawco/carries that holds the commit (a bundle listing K's branch, a
 *     patch with its file) and the uncommitted diff (both files), then the
 *     clone is gone and the row archived.
 * (r) M lands and retires; a handoff from its parent waits at the hub while
 *     M's clone is cut again at the same path, at the commit it landed, and
 *     the same session goes on there (same work item, same transcript): its
 *     shell reads that path and M's landed file. It finishes again and its
 *     workspace retires again.
 * (q) Q commits a file and a package.json whose typecheck sleeps, then
 *     passes; pushes its commit to origin's `probe-keep-Q` (as the conductor
 *     pushed K1's by hand on 2026-10-17), and calls finish_item; its parent
 *     stops it while its landing gate runs. The stop ends the landing: the
 *     gate passes and nothing is pushed to main all the same. Its workspace
 *     retires once the landing has ended (not under it), and its row records
 *     its head as that commit on `probe-keep-Q`. A handoff cuts its clone
 *     again there, not at main: the same session's shell reads the same path,
 *     HEAD at that commit, not on origin's main, and Q's file; it speeds its
 *     gate up and lands.
 * (o) O commits and finishes, done; in the same turn, on no new word, it
 *     commits again and calls finish_item again: the hub runs the item again
 *     and lands the second commit (its report lists it) rather than
 *     answering the first report.
 * (p) P's workspace, shown in the parent's preview artifact, stays active
 *     after its work lands and its session sleeps, a sweep naming the
 *     artifact; deleting the artifact retires it, with no sweep or archive
 *     call.
 * (u) B's workspace, held by a preview, its boundary killed and its
 *     accounts record damaged so no boundary of it can start (a follow-up
 *     there is refused naming the record): deleting the preview retires it
 *     anyway, no boundary of it started, its clone and state dir gone.
 * (f) Nothing CawCo runs makes anything at a gone clone's path. Three more
 *     delegates H, G and S land and finish, each held by a preview, their
 *     boundaries up. Each clone is deleted under its running sandbox: each
 *     boundary closes and nothing is at any of the three paths; after an
 *     agent restart, still nothing.
 * (g) A husk is retired. G's path refilled as an earlier build left one on
 *     obelisk (cockpit-95d26a37: `.git/hooks`, `.git/modules`, `.vscode`, a
 *     read-only `.opencode`, empty `.bashrc`, `.bash_profile` and
 *     `.ripgreprc`, the stand-in `opencode.json`), S's the same plus a file
 *     of a user's. With the previews deleted, H (gone) and G (its husk gone
 *     too) retire and S is held, "1 entry of its own in a folder that is no
 *     git clone", its file standing. A sweep then changes nothing, and the
 *     hub's log holds no "not retired" line for any of the three and one
 *     "held" line for S.
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
import { readWithin } from "../../../packages/core/src/bounded";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";

/** One request given `ms` to answer: its status and text; one not answered in time throws saying so. */
const requestWithin = async (
  ms: number,
  url: string,
  init: RequestInit
): Promise<{ ok: boolean; status: number; text: string }> => {
  const read = await readWithin(ms, async (signal) => {
    const response = await fetch(url, { ...init, signal });
    return {
      ok: response.ok,
      status: response.status,
      text: await response.text(),
    };
  });
  switch (read.kind) {
    case "answered":
      return read.value;
    case "unanswered":
      throw new Error(
        `${init.method ?? "GET"} ${url} did not answer within ${read.after} ms (${read.reason})`
      );
    default: {
      const unhandled: never = read;
      throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
    }
  }
};

const TAG = /PROBE-RETIRE-([LKMQOPBHGS])/;
/** A size in words (core `sizeWords`), alone and as the 409 places it before the clone's path. */
const SIZE = /^\d+(\.\d)? (GB|MB|KB)$/;
const SIZE_AT = /\(\d+(\.\d)? (GB|MB|KB) at /;
const FINISH = "mcp__cawco__finish_item";
/** The parent's handoff to M once its workspace retired. */
const RECUT = "PROBE-RECUT-M";
/** What M's shell prints in the clone cut again: its folder, its landed file, and a mark the command's own text never holds. */
const RECUT_PWD = /RECUT-PWD=([^\s\\"]+)/;
const RECUT_FILE = /RECUT-FILE:([^\n\\"]*)/;
const RECUT_RAN = "RECUT-42";
/** The parent's handoff to Q once its stopped landing's workspace retired, and what Q's shell prints there. */
const RECUT_Q = "PROBE-RECUT-Q";
const Q_PWD = /Q-PWD=([^\s\\"]+)/;
const Q_HEAD = /Q-HEAD=([0-9a-f]{40})/;
const Q_FILE = /Q-FILE:([^\n\\"]*)/;
const Q_RAN = "Q-RECUT-42";
/** The branch of origin Q pushes its commit to, and the gate its commit carries: it sleeps, then passes, so only the stop keeps it off main. */
const Q_KEEP = "probe-keep-Q";
const Q_GATE = '{"scripts":{"typecheck":"sleep 30"}}';
const Q_ON_MAIN = /Q-ON-MAIN=(yes|no)/;
/** What finish_item answers an item that landed and is done. */
const ITEM_DONE = "The item is done";
/** A free-space threshold no disk meets. */
const UNREACHABLE_GB = "100000";
const REFUSAL = new RegExp(
  `did not start: \\S+ has [0-9.]+ GB free, under the ${UNREACHABLE_GB} GB .*; the biggest folders under CawCo's workspace roots here are .+\\.$`
);
/** How long a workspace takes to settle once its item ends: its session's sleep, then its machine's archive. */
const SETTLE_MS = 120_000;

const COMMIT =
  "git -c user.name=Delegate -c user.email=d@probe.test commit -qm";

/**
 * What each delegate runs in its workspace: a folder left in its TMPDIR, a
 * commit. Q's commit also carries its failing gate, and goes to origin's
 * {@link Q_KEEP} from inside its boundary (hub-git.ts: a session's own push).
 */
const commitCommand = (tag: string) =>
  [
    `mkdir -p "$TMPDIR/scratch-fleet-left-${tag}" && echo left > "$TMPDIR/scratch-fleet-left-${tag}/file"`,
    `echo 'made by ${tag}' > retire-${tag}.txt`,
    ...(tag === "Q" ? [`printf '%s\\n' '${Q_GATE}' > package.json`] : []),
    `git add -A retire-${tag}.txt${tag === "Q" ? " package.json" : ""}`,
    `${COMMIT} 'Delegate commit ${tag}'`,
    ...(tag === "Q" ? [`git push -q origin HEAD:refs/heads/${Q_KEEP}`] : []),
    `echo DONE-COMMIT-${tag}`,
  ].join(" && ");

/** What Q's shell read in its clone cut again. */
const qSeen: { pwd?: string; head?: string; file?: string; onMain?: string } =
  {};

/** Q, handed off after its stopped landing's workspace retired: its shell in the clone cut again, its gate sped up, then finish_item again. */
const qRecutTurn = (
  request: Seen,
  step: { againFinish?: boolean; againSearched?: boolean }
): Reply => {
  if (!request.all.includes(Q_RAN)) {
    return tool("Bash", {
      command: [
        `printf 'Q-PWD=%s\\n' "$(pwd)"`,
        `printf 'Q-HEAD=%s\\n' "$(git rev-parse HEAD)"`,
        `printf 'Q-FILE:%s\\n' "$(cat retire-Q.txt 2>&1)"`,
        "git fetch -q origin main",
        `printf 'Q-ON-MAIN=%s\\n' "$(git merge-base --is-ancestor HEAD origin/main && echo yes || echo no)"`,
        `printf '%s\\n' '{"scripts":{"typecheck":"true"}}' > package.json`,
        "git add package.json",
        `${COMMIT} 'Q gate passes'`,
        "echo Q-RECUT-$((40+2))",
      ].join("; "),
      description: "Where am I, and speed the gate up",
    });
  }
  qSeen.pwd = Q_PWD.exec(request.all)?.[1];
  qSeen.head = Q_HEAD.exec(request.all)?.[1];
  qSeen.file = Q_FILE.exec(request.all)?.[1];
  qSeen.onMain = Q_ON_MAIN.exec(request.all)?.[1];
  return finishing(
    request,
    {
      finished: step.againFinish === true,
      searched: step.againSearched === true,
    },
    () => {
      step.againFinish = true;
    },
    () => {
      step.againSearched = true;
    },
    {
      headline: "Went on in the clone cut again, its gate sped up.",
      summary: "Went on in the clone cut again, its gate sped up.",
    }
  );
};

/** O, its item done: in the same turn a second commit, then finish_item again. */
const followUpTurn = (
  request: Seen,
  step: { againFinish?: boolean }
): Reply => {
  if (!request.all.includes(ITEM_DONE)) {
    return text("done");
  }
  if (!request.all.includes("DONE-COMMIT-O2")) {
    return tool("Bash", {
      command: `echo 'made by O again' > retire-O2.txt && git add retire-O2.txt && ${COMMIT} 'Delegate commit O2' && echo DONE-COMMIT-O2`,
      description: "Commit a follow-up",
    });
  }
  if (!step.againFinish) {
    step.againFinish = true;
    return tool(FINISH, {
      headline: "Committed retire-O2.txt as a follow-up.",
      summary: "Committed retire-O2.txt as a follow-up.",
    });
  }
  return text("done");
};

const steps: Record<
  string,
  {
    finish?: boolean;
    searched?: boolean;
    againFinish?: boolean;
    againSearched?: boolean;
  }
> = {};

/** What M's shell read in its clone cut again. */
const recutSeen: { pwd?: string; file?: string } = {};

const tool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});
const text = (words: string): Reply => ({ everyMs: 5, words: [words] });

/** finish_item once it is offered, after a ToolSearch for it when it is not. */
const finishing = (
  request: Seen,
  state: { finished: boolean; searched: boolean },
  done: () => void,
  searched: () => void,
  input: object
): Reply => {
  if (!state.finished && request.toolNames.includes(FINISH)) {
    done();
    return tool(FINISH, input);
  }
  if (
    !(state.finished || state.searched) &&
    request.toolNames.includes("ToolSearch")
  ) {
    searched();
    return tool("ToolSearch", { query: `select:${FINISH}`, max_results: 1 });
  }
  return text("done");
};

/** M, handed off after its workspace retired: its shell in the clone cut again, then finish_item again. */
const recutTurn = (
  request: Seen,
  step: { againFinish?: boolean; againSearched?: boolean }
): Reply => {
  if (!request.all.includes(RECUT_RAN)) {
    return tool("Bash", {
      command: `printf 'RECUT-PWD=%s\\n' "$(pwd)"; printf 'RECUT-FILE:%s\\n' "$(cat retire-M.txt 2>&1)"; echo RECUT-$((40+2))`,
      description: "Where am I",
    });
  }
  recutSeen.pwd = RECUT_PWD.exec(request.all)?.[1];
  recutSeen.file = RECUT_FILE.exec(request.all)?.[1];
  return finishing(
    request,
    {
      finished: step.againFinish === true,
      searched: step.againSearched === true,
    },
    () => {
      step.againFinish = true;
    },
    () => {
      step.againSearched = true;
    },
    {
      headline: "Went on in the clone cut again.",
      summary: "Went on in the clone cut again.",
    }
  );
};

const respond = (request: Seen): Reply => {
  const tag = request.tools ? TAG.exec(request.all)?.[1] : undefined;
  if (!tag) {
    return text("ok");
  }
  steps[tag] ??= {};
  const step = steps[tag];
  if (!request.all.includes(`DONE-COMMIT-${tag}`)) {
    return tool("Bash", {
      command: commitCommand(tag),
      description: "Commit",
    });
  }
  if (tag === "M" && step.finish && request.all.includes(RECUT)) {
    return recutTurn(request, step);
  }
  if (tag === "Q" && step.finish && request.all.includes(RECUT_Q)) {
    return qRecutTurn(request, step);
  }
  if (tag === "O" && step.finish) {
    return followUpTurn(request, step);
  }
  return finishing(
    request,
    { finished: step.finish === true, searched: step.searched === true },
    () => {
      step.finish = true;
    },
    () => {
      step.searched = true;
    },
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
};

interface Workspace {
  id: string;
  path: string;
  state: string;
  tmp: string | null;
}

interface Held {
  ahead: number;
  bytes: number;
  holds: string;
  machine: string;
  size: string;
  workspaceId: string;
}

interface Sweep {
  failed: { workspaceId: string; reason: string }[];
  held: Held[];
  kept: { workspaceId: string; hold: string }[];
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

/** A delegate this spec started, and how its item ended. */
interface Delegated {
  instanceId: string;
  item: { state: string; error: string | null };
  workItemId: string;
  workspaceId: string;
}

/** What the phases share: the fleet, the parent and the reads every phase makes. */
interface Scene {
  /** An archive asked over HTTP: its status and its answer's text. */
  archiveOver: (
    id: string,
    body?: object
  ) => Promise<{ status: number; text: string }>;
  /** A tool of the parent's, called as the parent: its status and its answer's text. */
  callAsParent: (
    name: string,
    args: object
  ) => Promise<{ status: number; text: string }>;
  /** Deletes the parent's artifact: its status. */
  closePreview: (id: string) => Promise<number>;
  delegate: (
    tag: "L" | "K" | "M" | "O" | "P" | "B" | "H" | "G" | "S",
    onStart?: (workspace: Workspace) => Promise<void> | void
  ) => Promise<Delegated>;
  fleet: Fleet;
  /** The parent's session id. */
  parentId: string;
  /** A preview artifact of the parent's naming the workspace's server: its id. */
  showPreview: (workspace: Workspace, name: string) => string;
  /** The project's repository every delegate is cut from. */
  src: string;
  /** The workspace's row once its state is `state`, or as it stands when that does not come. */
  stateBecomes: (id: string, state: string) => Promise<Workspace>;
  workspaceOf: (id: string) => Workspace;
}

/** Each launch's time from its ask to its session's first model request, for the run's note. */
const launchTimes: string[] = [];

/**
 * Seconds from `asked` to the first model request whose words hold `mark`:
 * how long a launch took to reach its model, its grant included.
 */
const launchSeconds = (fleet: Fleet, asked: number, mark: string): string => {
  const first = fleet.seen.find(
    (one) => one.at >= asked && one.all.includes(mark)
  );
  return first ? `${((first.at - asked) / 1000).toFixed(1)} s` : "never";
};

/**
 * The hub's and agent's lines naming a session, said in the run's output
 * when its item failed where it should not have: the evidence goes with the
 * scratch fleet's sandbox otherwise (a launch whose grant went unanswered,
 * 2026-10-16).
 */
const sayLogs = async (
  kit: Kit,
  fleet: Fleet,
  label: string,
  instanceId: string
): Promise<void> => {
  for (const role of ["hub", "agent"] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: two logs
    const lines = (await fleet.logs(role))
      .split("\n")
      .filter((line) => line.includes(instanceId))
      .slice(-60);
    kit.note(
      `${label} failed: the ${role}'s lines naming ${instanceId}:\n${lines.join("\n") || "(none)"}`
    );
  }
};

/** Whether a boundary or judge of the workspace runs on the keeper. */
const runsOnKeeper = async (fleet: Fleet, id: string): Promise<string[]> =>
  (await fleet.heldProcs())
    .map(({ procId }) => procId)
    .filter(
      (procId) =>
        procId.startsWith(`boundary-${id}`) || procId.startsWith(`judge-${id}`)
    );

/** Nothing of an archived workspace is left on the machine: no boundary or judge of it on the keeper, and no state dir. */
const nothingOfItLeft = async (
  kit: Kit,
  fleet: Fleet,
  label: string,
  workspace: Workspace
): Promise<void> => {
  const left = await until(
    `${label}'s boundary and judge gone from the keeper`,
    () => runsOnKeeper(fleet, workspace.id),
    (procs) => procs.length === 0,
    60_000
  ).catch(() => undefined);
  const stateDir = join(fleet.home, ".cawco", "workspaces", workspace.id);
  kit.check(
    `${label}: no boundary or judge of it runs on the keeper, and its state dir is gone`,
    left !== undefined && !existsSync(stateDir),
    `${left === undefined ? "a boundary or judge still runs" : "none runs"}; state dir ${existsSync(stateDir) ? "stands" : "gone"}`
  );
};

/** (e) No archive deletes unlanded work unless a person discards it, and then a carry holds it. */
const archivePhase = async (
  kit: Kit,
  scene: Scene,
  k: Workspace
): Promise<void> => {
  const { check } = kit;
  const { fleet, workspaceOf, archiveOver } = scene;
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

  const kept = await archiveOver(k.id);
  check(
    "(e) POST archive on K answers 409 naming its commit, its changed files and its size; nothing deleted",
    kept.status === 409 &&
      kept.text.includes("holds 1 commit on no remote, 2 changed files (") &&
      SIZE_AT.test(kept.text) &&
      kept.text.includes(k.path) &&
      kept.text.includes("nothing was deleted"),
    `${kept.status} ${kept.text}`
  );
  const held = await fleet.api<{ holds: string; size: string }>(
    `/api/workspaces/${k.id}/held`
  );
  check(
    "(e) GET held names what K holds now, read again by the refused archive: 1 commit on no remote, 2 changed files, and its size",
    held.holds === "1 commit on no remote, 2 changed files" &&
      SIZE.test(held.size),
    JSON.stringify(held)
  );
  check(
    "(e) after the raw control and the refused POST, K's clone, its commit, its changed files and its held row stand",
    existsSync(join(k.path, "retire-K.txt")) &&
      existsSync(join(k.path, "uncommitted-K.txt")) &&
      (await Bun.file(join(k.path, "README.md")).text()) ===
        "changed by the probe\n" &&
      workspaceOf(k.id).state === "held",
    workspaceOf(k.id).state
  );

  const discarded = await archiveOver(k.id, { discard: true });
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
};

/** (r) A handoff to a retired delegate cuts its clone again at the same path, and the same session goes on there. */
const recutPhase = async (kit: Kit, scene: Scene): Promise<void> => {
  const { check } = kit;
  const { fleet, workspaceOf, stateBecomes, callAsParent } = scene;
  const m = await scene.delegate("M");
  const wm = workspaceOf(m.workspaceId);
  const retired = await stateBecomes(wm.id, "archived");
  check(
    "(r) M's work lands and its workspace retires, its clone gone",
    m.item.state === "done" &&
      retired.state === "archived" &&
      !existsSync(wm.path),
    `${m.item.state} ${m.item.error ?? ""}; ${retired.state}; clone ${existsSync(wm.path) ? "stands" : "gone"}`
  );
  const message = `${RECUT}: go on in your workspace and say where you are.`;
  const asked = Date.now();
  let handed = await callAsParent("handoff", {
    target: m.instanceId,
    message,
  });
  // A cold target is refused once with the cost considerations; the repeat goes.
  if (!handed.text.includes("cutting its clone again")) {
    handed = await callAsParent("handoff", { target: m.instanceId, message });
  }
  check(
    "(r) the handoff waits at the hub while M's clone is cut again, and says so",
    handed.status === 200 && handed.text.includes("cutting its clone again"),
    `${handed.status} ${handed.text.slice(0, 800)}`
  );
  const ended = await until(
    "M's reopened item ended again",
    () =>
      fleet.query<{ state: string; error: string | null }>(
        "SELECT state, error FROM work_items WHERE id = ?",
        m.workItemId
      )[0],
    (row) =>
      row !== undefined &&
      recutSeen.pwd !== undefined &&
      ["done", "failed", "cancelled"].includes(row.state),
    300_000
  ).catch(
    () =>
      fleet.query<{ state: string; error: string | null }>(
        "SELECT state, error FROM work_items WHERE id = ?",
        m.workItemId
      )[0]
  );
  launchTimes.push(`M again ${launchSeconds(fleet, asked, RECUT)}`);
  if (ended?.state !== "done") {
    await sayLogs(kit, fleet, "M again", m.instanceId);
  }
  const items = fleet.query<{ id: string; instance_id: string }>(
    "SELECT id, instance_id FROM work_items WHERE workspace_id = ?",
    wm.id
  );
  check(
    "(r) the same session went on in a clone cut again at the same path: its shell's folder is that path, and it holds M's landed file",
    recutSeen.pwd === wm.path && recutSeen.file === "made by M",
    JSON.stringify({ seen: recutSeen, path: wm.path })
  );
  check(
    "(r) it is the same work item and session, reopened, not a new one; it ended done again",
    items.length === 1 &&
      items[0]?.instance_id === m.instanceId &&
      ended?.state === "done",
    `${JSON.stringify(items)}; ${ended?.state} ${ended?.error ?? ""}`
  );
  const again = await stateBecomes(wm.id, "archived");
  check(
    "(r) with its work over again, the workspace retires again: row archived, clone gone",
    again.state === "archived" && !existsSync(wm.path),
    `${again.state}; clone ${existsSync(wm.path) ? "stands" : "gone"}`
  );
};

/** An item's row as these phases read it. */
interface ItemRow {
  error: string | null;
  landing_since: number | null;
  result: string | null;
  state: string;
}

const itemRow = (fleet: Fleet, id: string): ItemRow | undefined =>
  fleet.query<ItemRow>(
    "SELECT state, error, result, landing_since FROM work_items WHERE id = ?",
    id
  )[0];

/** (q) A landing stopped mid-gate: its workspace retires with its head recorded, and a handoff cuts the clone again there, not at main. */
const stoppedLandingPhase = async (kit: Kit, scene: Scene): Promise<void> => {
  const { check } = kit;
  const { fleet, workspaceOf, stateBecomes, callAsParent } = scene;
  const started = await fleet.api<{
    instanceId: string;
    workItemId: string;
    workspaceId: string;
  }>("/api/work-items", {
    parentInstanceId: scene.parentId,
    title: "Commit and end Q",
    prompt: "PROBE-RETIRE-Q: commit a file.",
    harness: "claude",
    model: "claude-haiku-4-5",
    cwd: scene.src,
  });
  const wq = workspaceOf(started.workspaceId);
  const landing = await until(
    "Q's landing gate running",
    () => itemRow(fleet, started.workItemId),
    (row) => Boolean(row?.landing_since),
    300_000
  ).catch(() => itemRow(fleet, started.workItemId));
  const sha = (
    await Bun.$`git -C ${wq.path} rev-parse HEAD`.quiet().nothrow()
  ).stdout
    .toString()
    .trim();
  const stopped = await callAsParent("stop_delegate", {
    target: started.instanceId,
  });
  const cancelled = await until(
    "Q's item cancelled",
    () => itemRow(fleet, started.workItemId),
    (row) => row?.state === "cancelled",
    60_000
  ).catch(() => itemRow(fleet, started.workItemId));
  check(
    "(q) Q pushed its commit to probe-keep-Q and called finish_item; stopped while its landing gate ran, its item is cancelled",
    Boolean(landing?.landing_since) &&
      stopped.status === 200 &&
      cancelled?.state === "cancelled",
    `${JSON.stringify(landing)}; stop ${stopped.status} ${stopped.text.slice(0, 400)}; ${JSON.stringify(cancelled)}`
  );
  const kept = fleet.query<{ state: string }>(
    "SELECT state FROM workspaces WHERE id = ?",
    wq.id
  )[0]?.state;
  const retired = await stateBecomes(wq.id, "archived");
  const head = JSON.parse(
    fleet.query<{ head: string | null }>(
      "SELECT head FROM workspaces WHERE id = ?",
      wq.id
    )[0]?.head ?? "null"
  ) as { branch: string; commit: string } | null;
  const hub = await fleet.logs("hub");
  check(
    "(q) its workspace stays while the landing runs, then retires: row archived, clone gone, head recorded as Q's commit on probe-keep-Q",
    kept === "active" &&
      retired.state === "archived" &&
      !existsSync(wq.path) &&
      sha.length === 40 &&
      head?.commit === sha &&
      head.branch === Q_KEEP,
    `right after the stop ${kept}; ${retired.state}; clone ${existsSync(wq.path) ? "stands" : "gone"}; HEAD was ${sha}; head ${JSON.stringify(head)}; ${hub
      .split("\n")
      .filter((line) => line.includes(wq.id))
      .slice(-8)
      .join(" | ")}`
  );
  const message = `${RECUT_Q}: go on in your workspace and say where you are.`;
  let handed = await callAsParent("handoff", {
    target: started.instanceId,
    message,
  });
  if (!handed.text.includes("cutting its clone again")) {
    handed = await callAsParent("handoff", {
      target: started.instanceId,
      message,
    });
  }
  check(
    "(q) the handoff waits at the hub while Q's clone is cut again, and says so",
    handed.status === 200 && handed.text.includes("cutting its clone again"),
    `${handed.status} ${handed.text.slice(0, 800)}`
  );
  const ended = await until(
    "Q's reopened item ended again",
    () => itemRow(fleet, started.workItemId),
    (row) =>
      row !== undefined &&
      qSeen.head !== undefined &&
      ["done", "failed"].includes(row.state),
    300_000
  ).catch(() => itemRow(fleet, started.workItemId));
  if (ended?.state !== "done") {
    await sayLogs(kit, fleet, "Q again", started.instanceId);
  }
  check(
    "(q) the same session went on in a clone cut again at Q's commit, not at main: same path, HEAD at that commit, Q's file there",
    qSeen.pwd === wq.path && qSeen.head === sha && qSeen.file === "made by Q",
    JSON.stringify({ seen: qSeen, path: wq.path, sha })
  );
  check(
    "(q) the stop ended Q's landing though its gate passed: its commit is not on origin's main",
    qSeen.onMain === "no",
    JSON.stringify({ seen: qSeen, path: wq.path, sha })
  );
  check(
    "(q) with its gate sped up on top of Q's commit there, Q's reopened item lands on main and is done",
    ended?.state === "done" &&
      (ended.result ?? "").includes("Q gate passes") &&
      (ended.result ?? "").includes("Landed on main"),
    `${ended?.state} ${ended?.error ?? ""} ${(ended?.result ?? "").slice(0, 1200)}`
  );
};

/** (o) A done item's session commits again and calls finish_item: the follow-up lands. */
const followUpPhase = async (kit: Kit, scene: Scene): Promise<void> => {
  const { check } = kit;
  const { fleet } = scene;
  const o = await scene.delegate("O");
  const landed = await until(
    "O's follow-up landed",
    () => itemRow(fleet, o.workItemId),
    (row) =>
      row?.state === "done" &&
      (row.result ?? "").includes("Delegate commit O2"),
    300_000
  ).catch(() => itemRow(fleet, o.workItemId));
  const reran = (await fleet.logs("hub"))
    .split("\n")
    .filter(
      (line) =>
        line.includes(o.workItemId) && line.includes("it runs again to land it")
    );
  check(
    "(o) O's first finish_item lands and it is done",
    o.item.state === "done",
    `${o.item.state} ${o.item.error ?? ""}`
  );
  check(
    "(o) its follow-up commit, made after the item was done, lands on a second finish_item: the item ran again and its report lists the second commit",
    landed?.state === "done" &&
      (landed.result ?? "").includes("Delegate commit O2") &&
      (landed.result ?? "").includes("Landed on main") &&
      reran.length === 1,
    `${landed?.state} ${landed?.error ?? ""}; ${reran.join(" | ") || "no rerun line"}; ${(landed?.result ?? "").slice(0, 1200)}`
  );
};

/** (p) A preview holds a landed workspace; its deletion retires it. */
const previewPhase = async (kit: Kit, scene: Scene): Promise<void> => {
  const { check } = kit;
  const { fleet, workspaceOf, stateBecomes } = scene;
  let artifact = "";
  const p = await scene.delegate("P", (workspace) => {
    artifact = scene.showPreview(workspace, "task-review");
  });
  const wp = workspaceOf(p.workspaceId);
  await until(
    "P's session asleep",
    () => fleet.instance(p.instanceId)?.status,
    (now) => now === "sleeping",
    SETTLE_MS
  ).catch(() => undefined);
  const swept = await fleet.api<Sweep>("/api/workspaces/retire", {});
  const hold = swept.kept.find((one) => one.workspaceId === wp.id)?.hold ?? "";
  check(
    "(p) P's work lands and its session sleeps, and its workspace stays active, the sweep naming the artifact that shows it",
    p.item.state === "done" &&
      fleet.instance(p.instanceId)?.status === "sleeping" &&
      workspaceOf(wp.id).state === "active" &&
      existsSync(wp.path) &&
      hold.includes("task-review"),
    `${p.item.state}; ${fleet.instance(p.instanceId)?.status}; ${workspaceOf(wp.id).state}; ${JSON.stringify(swept)}`
  );
  const status = await scene.closePreview(artifact);
  const retired = await stateBecomes(wp.id, "archived");
  check(
    "(p) the artifact deleted, P's workspace retires on its own: row archived, clone gone",
    status === 200 && retired.state === "archived" && !existsSync(wp.path),
    `DELETE ${status}; ${retired.state}; clone ${existsSync(wp.path) ? "stands" : "gone"}`
  );
};

/** (u) A workspace whose boundary cannot start archives all the same: its boundary is never started to read it. */
const unstartablePhase = async (kit: Kit, scene: Scene): Promise<void> => {
  const { check } = kit;
  const { fleet, workspaceOf, stateBecomes } = scene;
  let artifact = "";
  const b = await scene.delegate("B", (workspace) => {
    artifact = scene.showPreview(workspace, "task-split");
  });
  const wb = workspaceOf(b.workspaceId);
  await until(
    "B's session asleep",
    () => fleet.instance(b.instanceId)?.status,
    (now) => now === "sleeping",
    SETTLE_MS
  ).catch(() => undefined);
  // The record first, so no start after the kill can succeed: every start
  // builds the workspace's policy, which reads it (core workspace-policy.ts
  // `accountLayers`).
  const stateDir = join(fleet.home, ".cawco", "workspaces", wb.id);
  await mkdir(stateDir, { recursive: true });
  await writeFile(join(stateDir, "accounts.json"), '{"damaged":true}\n');
  for (const proc of await fleet.heldProcs()) {
    if (proc.procId.startsWith(`boundary-${wb.id}`)) {
      process.kill(proc.pid, "SIGKILL");
    }
  }
  const down = await until(
    "B's boundary gone",
    async () =>
      (await fleet.heldProcs()).filter(({ procId }) =>
        procId.startsWith(`boundary-${wb.id}`)
      ),
    (procs) => procs.length === 0,
    30_000
  ).catch(() => ["still running"]);
  const followUp = await requestWithin(
    120_000,
    `${fleet.base}/api/work-items`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        parentInstanceId: scene.parentId,
        title: "Go on in B",
        prompt: "PROBE-RETIRE-B: go on.",
        workspace: wb.id,
      }),
    }
  );
  const refusedText = followUp.text;
  check(
    "(u) B's boundary is down and cannot start: a follow-up there is refused naming its damaged accounts record",
    down.length === 0 &&
      !followUp.ok &&
      refusedText.includes("accounts.json") &&
      workspaceOf(wb.id).state === "active",
    `boundaries: ${down.join(", ") || "none"}; follow-up ${followUp.status} ${refusedText.slice(0, 600)}; ${workspaceOf(wb.id).state}`
  );
  const status = await scene.closePreview(artifact);
  const retired = await stateBecomes(wb.id, "archived");
  const started = await runsOnKeeper(fleet, wb.id);
  check(
    "(u) its preview deleted, B archives all the same: row archived, clone and state dir gone, no boundary of it started",
    status === 200 &&
      retired.state === "archived" &&
      !existsSync(wb.path) &&
      !existsSync(stateDir) &&
      started.filter((procId) => procId.startsWith("boundary-")).length === 0,
    `DELETE ${status}; ${retired.state}; clone ${existsSync(wb.path) ? "stands" : "gone"}; state dir ${existsSync(stateDir) ? "stands" : "gone"}; on the keeper: ${started.join(", ") || "nothing"}`
  );
};

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

/** (f) A gone clone stays gone, (g) a husk is retired and anything else in one holds it. */
const huskPhase = async (kit: Kit, scene: Scene): Promise<void> => {
  const { check } = kit;
  const { fleet, workspaceOf, stateBecomes } = scene;
  const previews: string[] = [];
  const hold = (workspace: Workspace) => {
    previews.push(scene.showPreview(workspace, `husk-${previews.length}`));
  };
  const runs = [
    await scene.delegate("H", hold),
    await scene.delegate("G", hold),
    await scene.delegate("S", hold),
  ];
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
    "(f) H, G and S are done, each held by a preview, each with its boundary up",
    runs.every((run) => run.item.state === "done") &&
      three.every(
        (workspace) =>
          workspaceOf(workspace.id).state === "active" &&
          before.some((procId) => procId.startsWith(`boundary-${workspace.id}`))
      ),
    `${runs.map((run) => `${run.item.state} ${run.item.error ?? ""}`).join("; ")}; ${three.map((workspace) => workspaceOf(workspace.id).state).join(", ")}; boundaries: ${before.join(", ")}`
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
  const statuses: number[] = [];
  for (const preview of previews) {
    // biome-ignore lint/performance/noAwaitInLoops: three artifacts
    statuses.push(await scene.closePreview(preview));
  }
  const [h, g, s] = [
    await stateBecomes(wh.id, "archived"),
    await stateBecomes(wg.id, "archived"),
    await stateBecomes(ws.id, "held"),
  ];
  check(
    "(g) with the previews deleted, H (gone) and G (a husk, gone too) retire, and S is held",
    statuses.every((status) => status === 200) &&
      h.state === "archived" &&
      g.state === "archived" &&
      !existsSync(wg.path) &&
      s.state === "held",
    `DELETE ${statuses.join(", ")}; H ${h.state}; G ${g.state} ${existsSync(wg.path) ? "husk stands" : "gone"}; S ${s.state}`
  );
  const heldS = await fleet
    .api<Held>(`/api/workspaces/${ws.id}/held`)
    .catch((error: unknown) => ({ holds: String(error) }) as Held);
  check(
    "(g) S, a husk with a user's file, is held with what it holds, the file standing",
    heldS.holds === "1 entry of its own in a folder that is no git clone" &&
      existsSync(join(ws.path, "notes.txt")),
    JSON.stringify(heldS)
  );
  const again = await fleet.api<Sweep>("/api/workspaces/retire", {});
  const hub = (await fleet.logs("hub"))
    .split("\n")
    .filter((line) => line.includes("[workspaces]"));
  const of = (id: string, words: string) =>
    hub.filter((line) => line.includes(`${id} on `) && line.includes(words))
      .length;
  check(
    '(g) a sweep then changes nothing; the hub\'s log has no "not retired" line for any of the three, and one "held" line for S',
    again.retired.length === 0 &&
      again.held.length === 0 &&
      again.failed.length === 0 &&
      three.every((workspace) => of(workspace.id, ": not retired:") === 0) &&
      of(ws.id, ": held,") === 1,
    `${JSON.stringify(again)}; ${hub.filter((line) => three.some((workspace) => line.includes(workspace.id))).join(" | ")}`
  );
};

/** (b) A landed workspace retires with no archive call; (c) a failed item's workspace is held. */
const landedAndFailed = async (kit: Kit, scene: Scene): Promise<Workspace> => {
  const { check } = kit;
  const { fleet, workspaceOf, stateBecomes } = scene;
  const { home } = fleet;
  const apple = join(
    home,
    ".cawco",
    "workspace-cache",
    "xdg",
    "cawco-apple.noindex"
  );
  // Each clone's Apple build root, as build-both.sh leaves one, as it starts.
  const buildRoot = async (workspace: Workspace) => {
    await mkdir(join(apple, basename(workspace.path), "DerivedData"), {
      recursive: true,
    });
    await writeFile(
      join(apple, basename(workspace.path), "DerivedData", "build.db"),
      "x"
    );
    await mkdir(join(apple, ".locks"), { recursive: true });
    await writeFile(join(apple, ".locks", basename(workspace.path)), "1");
  };
  const l = await scene.delegate("L", buildRoot);
  const k = await scene.delegate("K", buildRoot);
  check(
    "L's item is done, its commit landed; K's failed, blocked",
    l.item.state === "done" && k.item.state === "failed",
    `L ${l.item.state} ${l.item.error ?? ""}; K ${k.item.state} ${k.item.error ?? ""}`
  );
  const wl = workspaceOf(l.workspaceId);
  const wk = workspaceOf(k.workspaceId);
  const owned = (workspace: Workspace, tag: string) => ({
    clone: workspace.path,
    state: join(home, ".cawco", "workspaces", workspace.id),
    tmp: workspace.tmp ?? "",
    left: join(workspace.tmp ?? "", `scratch-fleet-left-${tag}`),
    buildRoot: join(apple, basename(workspace.path)),
    buildLock: join(apple, ".locks", basename(workspace.path)),
  });
  const standing = (workspace: Workspace, tag: string) =>
    Object.entries(owned(workspace, tag))
      .filter(([, path]) => path && existsSync(path))
      .map(([name]) => name);
  const all = Object.keys(owned(wl, "L"));

  // ── (b) landed: retired with no archive call ─────────────────────────
  const retired = await stateBecomes(wl.id, "archived");
  check(
    "(b) L's work landed and its workspace retires with no archive call: its row archived",
    retired.state === "archived",
    retired.state
  );
  check(
    "(b) L's clone, state dir, TMPDIR with the folder left there, build root and its lock are gone",
    standing(wl, "L").length === 0,
    `still there: ${standing(wl, "L").join(", ") || "nothing"}`
  );
  await nothingOfItLeft(kit, fleet, "(b) L", wl);

  // ── (c) failed: held, with its words ─────────────────────────────────
  const held = await stateBecomes(wk.id, "held");
  check(
    "(c) K's item failed with its commit on no remote, and its workspace is held",
    held.state === "held",
    held.state
  );
  check(
    "(c) K's clone, state dir, TMPDIR, left folder and build root all stand",
    standing(wk, "K").length === all.length,
    `standing: ${standing(wk, "K").join(", ")}`
  );
  const words = await fleet
    .api<Held>(`/api/workspaces/${wk.id}/held`)
    .catch((error: unknown) => ({ holds: String(error) }) as Held);
  const { held: list } = await fleet.api<{ held: Held[] }>(
    "/api/workspaces/held"
  );
  check(
    "(c) K's holding words: 1 commit on no remote, its size and machine, at GET held and in GET /api/workspaces/held (K alone)",
    words.holds === "1 commit on no remote" &&
      words.ahead === 1 &&
      SIZE.test(words.size) &&
      words.machine.length > 0 &&
      list.length === 1 &&
      list[0]?.workspaceId === wk.id,
    `${JSON.stringify(words)}; ${JSON.stringify(list)}`
  );
  const said = await scene.callAsParent("delegate_list", {});
  check(
    "(c) the parent's delegate_list lists K under held",
    said.status === 200 &&
      said.text.includes(wk.id) &&
      said.text.includes("1 commit on no remote"),
    `${said.status} ${said.text.slice(0, 1500)}`
  );
  return wk;
};

const spec: Spec = {
  name: "workspace-retire",
  run: async (kit: Kit) => {
    // Each run starts from nothing, however many run in one process.
    for (const tag of Object.keys(steps)) {
      delete steps[tag];
    }
    recutSeen.pwd = undefined;
    recutSeen.file = undefined;
    qSeen.pwd = undefined;
    qSeen.head = undefined;
    qSeen.file = undefined;
    qSeen.onMain = undefined;
    launchTimes.length = 0;
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
    const credential =
      (await Bun.file(`/proc/${await fleet.sessionPid(parent)}/environ`).text())
        .split("\0")
        .find((line) => line.startsWith("CAWCO_SESSION_CREDENTIAL="))
        ?.slice("CAWCO_SESSION_CREDENTIAL=".length) ?? "";

    const workspaceOf = (id: string) =>
      fleet.query<Workspace>(
        "SELECT id, path, state, tmp FROM workspaces WHERE id = ?",
        id
      )[0] as Workspace;
    const scene: Scene = {
      fleet,
      parentId: parent,
      src,
      workspaceOf,
      stateBecomes: (id, state) =>
        until(
          `workspace ${id} ${state}`,
          () => workspaceOf(id),
          (row) => row.state === state,
          SETTLE_MS
        ).catch(() => workspaceOf(id)),
      delegate: async (tag, onStart) => {
        const asked = Date.now();
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
        });
        await onStart?.(workspaceOf(started.workspaceId));
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
        launchTimes.push(
          `${tag} ${launchSeconds(fleet, asked, `PROBE-RETIRE-${tag}:`)}`
        );
        if (item.state !== (tag === "K" ? "failed" : "done")) {
          await sayLogs(kit, fleet, tag, started.instanceId);
        }
        return { ...started, item };
      },
      showPreview: (workspace, name) => {
        const id = crypto.randomUUID();
        const now = Date.now();
        fleet.write(
          "INSERT INTO artifacts (id, instance_id, project_id, kind, name, machine_id, source_port, source_workspace, revision, seq, delivered_seq, created_at, updated_at, shown_at) VALUES (?, ?, ?, 'preview', ?, ?, 5199, ?, 1, 0, 0, ?, ?, ?)",
          id,
          parent,
          project.id,
          name,
          MACHINE,
          workspace.id,
          now,
          now,
          now
        );
        return id;
      },
      closePreview: async (id) =>
        (
          await requestWithin(
            60_000,
            `${fleet.base}/api/instances/${parent}/artifacts/${id}`,
            { method: "DELETE" }
          )
        ).status,
      archiveOver: async (id, body) => {
        const archived = await requestWithin(
          120_000,
          `${fleet.base}/api/workspaces/${id}/archive`,
          {
            method: "POST",
            ...(body && {
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            }),
          }
        );
        return { status: archived.status, text: archived.text };
      },
      callAsParent: async (name, args) => {
        const called = await requestWithin(
          300_000,
          `${fleet.base}/api/delegation/call/${parent}`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              Authorization: `Bearer ${credential}`,
            },
            body: JSON.stringify({ name, arguments: args }),
          }
        );
        return { status: called.status, text: called.text };
      },
    };

    const wk = await landedAndFailed(kit, scene);
    await archivePhase(kit, scene, wk);
    await recutPhase(kit, scene);
    await stoppedLandingPhase(kit, scene);
    await followUpPhase(kit, scene);
    await previewPhase(kit, scene);
    await unstartablePhase(kit, scene);
    await huskPhase(kit, scene);
    await diskPhase(kit);
    kit.note(
      `launch timings, ask to the session's first model request: ${launchTimes.join(", ")}`
    );
  },
};

export default spec;
