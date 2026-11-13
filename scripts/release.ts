/**
 * The release pipeline:
 *   bun scripts/release.ts --commit <sha> --channel stable|nightly --output /absolute/path
 *     [--notes /absolute/notes.md (nightly, required)] [--tag vX.Y.Z] [--publish] [--dry-run]
 *
 * A release names its commit, and is built from exactly that commit: a
 * worktree of it under ~/.worktrees/release-<sha>, on real disk, made here
 * and removed when the build ends, whichever way, that builds and
 * signs. The repository's check (`bun run check --all`) runs only when the
 * hub's merge checks did not pass it on the commit's tree (`GET
 * /api/landing-gate`, hub work-items.ts `gatePassesOn`): then in a second
 * worktree, beside the builds, so it reads no file a build rewrites
 * (SvelteKit's sync writes each route's `$types.d.ts` with a plain
 * writeFileSync on every run, kit 3.1.0 src/core/sync/write_types). The
 * checkout this runs from must be clean (this script and what it imports are
 * read from it), and the commit must be on origin/main; either refuses the
 * run before anything is built. Without --publish nothing is published,
 * tagged or uploaded: the signed artifacts are left in --output.
 *
 * Everything runs at once that can: the steps are a graph (`releaseSteps`,
 * release-graph.ts), each starting as soon as the steps it needs have ended.
 * `--dry-run` prints that graph, with each step's expected time, and runs
 * nothing. What waits on what, and why:
 * - the check (when it runs) and the live database's migration check gate
 *   promotion and each darwin archive.
 * - The info build (the binary build-info is asked of, which gives the manifest its protocol) comes before the
 *   `run` check of each linux archive. The container tests are not a release step: `bun run test:binary`
 *   (scripts/binary-tests.ts) runs them for any commit.
 * - The four targets compile at once, from assets prepared once; each linux
 *   archive is made at once, each darwin bundle signed
 *   on this host (rcodesign, sign-agent-bundle.ts) at once with the other.
 * - With --publish, a draft release is made once the version is known, and
 *   each archive goes up to it as soon as it is made, while the other targets build.
 * - Promotion (the manifest signed and uploaded, the draft published) waits
 *   for every target; then the hub is told to look.
 * Only the run itself is one at a time: the lock below (no two release runs
 * at once) and its queue of one.
 */
import { existsSync } from "node:fs";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import type { Subprocess } from "bun";
import { hubClient, unwrap } from "../packages/agent/src/hub-client";
import { machineFetch } from "../packages/agent/src/machine-fetch";
import { readInstallation } from "../packages/core/src/binary-installation";
import { readWithin } from "../packages/core/src/bounded";
import {
  listedPid,
  signalGroup,
  signal as signalPid,
} from "../packages/core/src/signal";
import { PINNED_BUN, TARGETS } from "./build-binary";
import { requireDiskRoom } from "./lib/disk-room";
import { holdAwake } from "./lib/hold-awake";
import { NoAnswer, persist } from "./lib/outside-call";
import { deleteDraft, endCalls } from "./publish-release";
import type { Runner } from "./release/binary-tests";
import { announce } from "./release/steps/announce";
import { archive } from "./release/steps/archive";
import { buildInfo } from "./release/steps/build-info";
import { bundleFiles } from "./release/steps/bundle-files";
import { check } from "./release/steps/check";
import { compile } from "./release/steps/compile";
import { makeDraft } from "./release/steps/draft";
import { infoBuild } from "./release/steps/info-build";
import { liveDatabase } from "./release/steps/live-database";
import { prepare } from "./release/steps/prepare";
import { promoteStep } from "./release/steps/promote";
import { runPublished } from "./release/steps/run";
import {
  isDarwin,
  type Learned,
  type ReleaseSecretsTaken,
  type Request,
  repo,
  stagingOf,
  state,
  step,
  stepContext,
  treesOf,
} from "./release/steps/shared";
import { sign } from "./release/steps/sign";
import { upload } from "./release/steps/upload";
import { version } from "./release/steps/version";
import { ANNOUNCE_MS } from "./release-announce";
import { describeSteps, runSteps, type Step } from "./release-graph";
import {
  missingSecrets,
  takeReleaseSecrets,
  underSigningEnv,
} from "./release-signing";
import { RCODESIGN_VERSION, rcodesignPath } from "./release-tools";

const argv = Bun.argv.slice(2);
function argument(name: string): string | undefined {
  const i = argv.indexOf(name);
  return i < 0 ? undefined : argv[i + 1];
}
const commitInput = argument("--commit");
const channel = argument("--channel");
const output = argument("--output");
const publishing = argv.includes("--publish");
if (
  !(commitInput && output && isAbsolute(output)) ||
  (channel !== "stable" && channel !== "nightly")
) {
  console.error(
    "Usage: bun scripts/release.ts --commit <sha> --channel stable|nightly --output /absolute/path [--notes /absolute/notes.md (nightly, required)] [--tag vX.Y.Z] [--publish] [--dry-run]"
  );
  process.exit(2);
}
/** A refusal before anything is built: its reason, and exit 2. */
const refuse = (why: string): never => {
  console.error(`Release refused: ${why}`);
  process.exit(2);
};

/** The merge check a release takes as its check (gate.md). */
const LANDING_CHECK = "bun run check --all";

/**
 * Whether the hub's merge checks passed {@link LANDING_CHECK} on the tree
 * `commit` holds: the hub on this host is asked (`GET /api/landing-gate`,
 * as this machine). No hub, no answer, or no such pass: the release runs
 * the check itself, and says why.
 */
const gatePassed = async (commit: string): Promise<boolean> => {
  const read = Bun.spawnSync(["git", "rev-parse", `${commit}^{tree}`], {
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const tree = read.stdout.toString().trim();
  const installation = await readInstallation();
  if (read.exitCode !== 0 || !installation?.hubUrl) {
    console.log(
      read.exitCode === 0
        ? "This host has no CawCo installation naming a hub: the release runs its own check"
        : `git could not name the tree of ${commit}: the release runs its own check`
    );
    return false;
  }
  const { hubUrl } = installation;
  const asked = await readWithin(ANNOUNCE_MS, (signal) =>
    hubClient(hubUrl, (url, init) =>
      machineFetch(url, { ...init, signal })
    ).api["landing-gate"].get({ query: { tree } })
  );
  if (asked.kind === "unanswered" || asked.value.error) {
    console.log(
      `The hub at ${hubUrl} ${asked.kind === "unanswered" ? `did not answer within ${ANNOUNCE_MS / 1000} s` : `answered ${asked.value.status}`} on the merge checks of tree ${tree.slice(0, 12)}: the release runs its own check`
    );
    return false;
  }
  const { passed } = unwrap(asked.value, () => new Error("unreachable"));
  const ok = passed.includes(LANDING_CHECK);
  console.log(
    ok
      ? `The merge checks passed \`${LANDING_CHECK}\` on tree ${tree.slice(0, 12)}: the release checks it no more`
      : `The merge checks passed no \`${LANDING_CHECK}\` on tree ${tree.slice(0, 12)}: the release runs it`
  );
  return ok;
};

/**
 * Every step of one build of `current`, and what each waits for: the graph
 * `runSteps` runs and `--dry-run` prints. Nothing runs while it is made.
 */
const releaseSteps = (
  current: Request,
  publish: boolean,
  run: Runner,
  learned: Learned,
  secrets: ReleaseSecretsTaken,
  /** Holds a GitHub call from starting while a stop is clearing the run: it never returns then. */
  notStopped: () => Promise<void>,
  /** The merge checks passed the check on this commit's tree ({@link gatePassed}). */
  gated: boolean
): Step[] => {
  const context = stepContext(
    current,
    publish,
    run,
    learned,
    secrets,
    notStopped
  );
  const { trees } = context;
  const tree = (which: keyof typeof trees): Step[] => [
    // The release records (shipped.ts): the check's wire check (openapi:check) and the frame
    // read below hold this build to what is in people's hands, as tagged now.
    step(`tree ${which}`, ["fetch"], 1.5, () =>
      run(["git", "worktree", "add", "--detach", trees[which], current.commit])
    ),
    step(`install ${which}`, [`tree ${which}`], 0.4, () =>
      run([process.execPath, "install", "--frozen-lockfile"], trees[which])
    ),
  ];
  const targetSteps = (target: string): Step[] => {
    const compileStep = step(
      `compile ${target}`,
      ["prepare", "version"],
      4.7,
      () => compile(context, target)
    );
    const uploadStep: Step[] = publish
      ? [
          step(`upload ${target}`, [`archive ${target}`, "draft"], 5, () =>
            upload(context, target)
          ),
        ]
      : [];
    if (!isDarwin(target)) {
      return [
        compileStep,
        step(`archive ${target}`, [`compile ${target}`], 7.2, () =>
          archive(context, target)
        ),
        step(`run ${target}`, [`compile ${target}`, "build-info"], 3, () =>
          runPublished(
            run,
            target,
            join(context.staging, target, "cawco"),
            context.infoHome,
            context.manifest()
          )
        ),
        ...uploadStep,
      ];
    }
    // A darwin build ships as its own CawCo Agent.app, signed with the team's
    // Developer ID, all on this host
    // (sign-agent-bundle.ts), with its Info.plist from this commit.
    return [
      compileStep,
      step(`sign ${target}`, [`compile ${target}`, "bundle files"], 3.3, () =>
        sign(context, target)
      ),
      step(`archive ${target}`, [`sign ${target}`, "gate"], 8, () =>
        archive(context, target)
      ),
      ...uploadStep,
    ];
  };
  const promotion = [
    "gate",
    ...TARGETS.flatMap((target) => [
      `archive ${target}`,
      ...(isDarwin(target) ? [] : [`run ${target}`]),
      ...(publish ? [`upload ${target}`] : []),
    ]),
  ];
  return [
    step("fetch", [], 2, () =>
      fetchOrigin(async () => {
        if (stopped) {
          await stopped;
        }
        if (abandoned) {
          throw abandoned;
        }
      })
    ),
    ...tree("build"),
    // The check reads its own tree, beside the builds; it gates the darwin archives
    // and promotion, never the builds. None when the merge checks passed it
    // on this tree.
    ...(gated
      ? []
      : [
          ...tree("check"),
          step("check", ["install check"], 30, () => check(context)),
        ]),
    step("live database", ["install build"], 15, () =>
      liveDatabase(run, trees.build, context.staging)
    ),
    step(
      "gate",
      gated ? ["live database"] : ["check", "live database"],
      0,
      async () => {
        // Nothing to run: what the darwin archives and promotion wait for.
      }
    ),
    step("version", ["install build"], 1, () => version(context)),
    // The dashboard and every target-independent asset, once, for all seven compiles.
    step("prepare", ["install build"], 36, () => prepare(context)),
    step("info build", ["prepare", "version"], 4.7, () => infoBuild(context)),
    step("build-info", ["info build"], 0.8, () => buildInfo(context)),
    step("bundle files", ["install build"], 0.3, () => bundleFiles(context)),
    ...(publish
      ? [step("draft", ["version"], 2, () => makeDraft(context))]
      : []),
    ...TARGETS.flatMap(targetSteps),
    step("promote", promotion, 5, () => promoteStep(context)),
    ...(publish
      ? [step("announce", ["promote"], 1, () => announce(context))]
      : []),
  ];
};

if (argv.includes("--dry-run")) {
  const commit = commitInput.padEnd(12, "0");
  const dry: Runner = () => Promise.resolve("");
  console.log(
    `bun scripts/release.ts --channel ${channel}${publishing ? " --publish" : ""}: the step graph (nothing is run)\n`
  );
  console.log(
    describeSteps(
      releaseSteps(
        {
          channel,
          commit,
          id: "dry-run",
          output,
          notes: "dry run",
          tag: argument("--tag"),
        },
        publishing,
        dry,
        {},
        {},
        () => Promise.resolve(),
        // As when the hub has no pass for the tree: the whole graph.
        false
      )
    )
  );
  process.exit(0);
}

const git = (...args: string[]) =>
  Bun.spawnSync(["git", ...args], {
    env: process.env,
    cwd: repo,
    stdout: "pipe",
    stderr: "pipe",
  });
// This script and everything it imports are read from this checkout.
const dirty = git("status", "--porcelain");
if (dirty.exitCode !== 0 || dirty.stdout.toString().trim()) {
  refuse(
    `the checkout it runs from (${repo}) must be clean, and it holds:\n${dirty.stdout.toString().trimEnd() || dirty.stderr.toString().trim()}`
  );
}
/**
 * `git fetch --quiet --tags origin` here, asked again on any failure (each
 * attempt after `before`): git's exit says only that it failed (128 for a
 * dropped connection and a refusal alike), and a refusal fails the same way
 * every time, so asking again costs only the bounded wait. Git's own retry
 * does not cover a drop: "Maximum number of times to retry after receiving
 * HTTP 429 (Too Many Requests) responses" (git-scm.com/docs/git-config
 * `http.maxRetries`). The last failure quotes git's stderr.
 */
const fetchOrigin = (before: () => Promise<void> = async () => undefined) =>
  persist("git fetch origin", async () => {
    await before();
    const child = Bun.spawn(["git", "fetch", "--quiet", "--tags", "origin"], {
      cwd: repo,
      stdout: "ignore",
      stderr: "pipe",
      env: { ...process.env },
    });
    const [stderr, status] = await Promise.all([
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (status !== 0) {
      throw new NoAnswer(`git fetch exited ${status}: ${stderr.trim()}`);
    }
  });
await fetchOrigin().catch((error: unknown) =>
  refuse(error instanceof Error ? error.message : String(error))
);
const resolved = git("rev-parse", "--verify", `${commitInput}^{commit}`);
if (resolved.exitCode !== 0) {
  refuse(`${commitInput} is not a commit here`);
}
const requestedCommit = resolved.stdout.toString().trim();
/**
 * The repository every worktree of this one shares (its main checkout, or the
 * bare repository): a run's trees are removed and pruned from there, and a
 * stop runs from there, never from the checkout this script runs from, which
 * ship.sh made (its runner) and may be gone by then. A spawn whose cwd is gone
 * fails before it starts: nightly 5186's stop said "ENOENT: no such file or
 * directory, posix_spawn 'git'" and left its trees' records.
 */
const commonDir = git("rev-parse", "--path-format=absolute", "--git-common-dir")
  .stdout.toString()
  .trim();
const mainRepo = commonDir.endsWith("/.git") ? dirname(commonDir) : commonDir;
/** proof-sweep.sh as it is now, read once: a stop runs it whether or not this checkout is still on the disk. */
const SWEEP_SCRIPT = await readFile(
  join(import.meta.dir, "binary", "proof-sweep.sh"),
  "utf8"
);
if (
  git("merge-base", "--is-ancestor", requestedCommit, "origin/main")
    .exitCode !== 0
) {
  refuse(`${requestedCommit} is not on origin/main`);
}
await underSigningEnv(import.meta.path, argv);
// A nightly's notes are written for the person updating; see docs/releases/README.md.
const notesFile = argument("--notes");
if (channel === "nightly" && !(notesFile && isAbsolute(notesFile))) {
  refuse("nightly builds need end-user notes: --notes <file>");
}
const nightlyNotes = notesFile ? await readFile(notesFile, "utf8") : undefined;
if (channel === "nightly" && !nightlyNotes?.trim()) {
  refuse("the nightly's end-user release notes are empty");
}
if (Bun.version !== PINNED_BUN) {
  refuse(
    `the release pipeline requires Bun ${PINNED_BUN}, and this is ${Bun.version}: bash scripts/release-setup.sh installs it`
  );
}
const releaseSecrets = takeReleaseSecrets();
// What the build cannot do without, before anything is queued or built.
const missing = missingSecrets(releaseSecrets);
if (missing.length > 0) {
  refuse(
    `${missing.join(", ")} missing from the release env: bash scripts/release-setup.sh --check says what is missing, and --import-secrets writes them`
  );
}
const rcodesignSays = (await Bun.file(rcodesignPath()).exists())
  ? Bun.spawnSync([rcodesignPath(), "--version"], {
      env: process.env,
      stdout: "pipe",
      stderr: "ignore",
    }).stdout.toString()
  : "";
if (!rcodesignSays.includes(`apple-codesign ${RCODESIGN_VERSION}`)) {
  refuse(
    `rcodesign ${RCODESIGN_VERSION} is not at ${rcodesignPath()}: bash scripts/release-setup.sh installs it`
  );
}

/** A process named so a reused pid is never taken for it: pid and start time. */
interface Proc {
  pid: number;
  started: string;
}
/** Who holds the build lock and what it is building, for whoever finds it dead. */
interface Holder extends Proc {
  /** The trees it builds and checks in. */
  checkouts?: string[];
  /** The process groups of the commands it is running (many run at once): everything it started. */
  groups?: Proc[];
  staging?: string;
}
const WHITESPACE = /\s+/u;
/** A process's start time (`ps -o lstart=`), or undefined once it is gone. */
async function startedOf(pid: number): Promise<string | undefined> {
  const ps = Bun.spawn(["ps", "-o", "lstart=", "-p", String(pid)], {
    env: process.env,
    stdout: "pipe",
    stderr: "ignore",
  });
  const text = (await new Response(ps.stdout).text()).trim();
  await ps.exited;
  return text || undefined;
}
const alive = async (proc: Proc): Promise<boolean> =>
  (await startedOf(proc.pid)) === proc.started;
const ownStart = await startedOf(process.pid);
if (!ownStart) {
  throw new Error("Release pipeline could not read its own start time");
}
const me: Holder = { pid: process.pid, started: ownStart };
/** The lock generation this run holds, once it holds one. */
let mine: string | undefined;
/** The holder record's last write: steps run at once, so writes wait in line on one temp file. */
let holderWritten: Promise<void> = Promise.resolve();
/** Records what this holder is building now, in the lock it holds; each write records `me` as it is when its turn comes. */
function writeHolder(): Promise<void> {
  const write = holderWritten
    .catch(() => undefined)
    .then(async () => {
      if (!mine) {
        return;
      }
      const temp = join(mine, `holder.json.${process.pid}`);
      await writeFile(temp, JSON.stringify(me));
      await rename(temp, join(mine, "holder.json"));
    });
  holderWritten = write;
  return write;
}
async function groupMembers(group: number): Promise<number[]> {
  const ps = Bun.spawn(["ps", "-eo", "pid=,pgid="], {
    env: process.env,
    stdout: "pipe",
    stderr: "ignore",
  });
  const text = await new Response(ps.stdout).text();
  await ps.exited;
  return text
    .split("\n")
    .map((line) => line.trim().split(WHITESPACE).map(Number))
    .filter(([pid, pgid]) => pgid === group && pid !== group)
    .map(([pid]) => pid as number);
}
/**
 * Sends `sig` to the group `group` names: through its leader while `ps`
 * lists its pid with the start recorded, else, the leader gone, to each
 * member `ps` lists in its group. A leader pid listed with another start is
 * another process's now, and nothing is sent.
 */
const signalGroupOf = async (
  group: Proc,
  sig: NodeJS.Signals
): Promise<void> => {
  const leader = await startedOf(group.pid);
  if (leader === group.started) {
    signalGroup(listedPid(group.pid), sig);
    return;
  }
  if (leader !== undefined) {
    return;
  }
  for (const member of await groupMembers(group.pid)) {
    // Gone since the reading, it is nothing to signal.
    signalPid(listedPid(member), sig);
  }
};
/**
 * How long a stopped command has to end before its group is killed: the
 * container tests' own cleanup (smoke-test.sh `finish`, e2e-test.sh
 * `rig_done`) removes every rig's containers through its podman instance and
 * then its vfs storage, which takes tens of seconds; a group killed while it
 * did left its containers, pasta and aardvark-dns running (obelisk,
 * 2026-10-15, at 5 s). A command with nothing to clean ends at once.
 */
const STOP_GRACE_MS = 180_000;
/** Whether the group `group` names has ended, leader and members. */
const groupEnded = async (group: Proc): Promise<boolean> =>
  !(await startedOf(group.pid)) && (await groupMembers(group.pid)).length === 0;
/**
 * Ends a command and everything it started: each command runs as the leader
 * of its own process group. A leader pid now held by another process means the
 * group ended long ago and the pid was reused; that process is left alone.
 * While any member lives, the kernel does not reuse the group's id.
 */
async function endGroup(group: Proc | undefined): Promise<void> {
  if (!group) {
    return;
  }
  const leader = await startedOf(group.pid);
  if (leader !== undefined && leader !== group.started) {
    return;
  }
  await signalGroupOf(group, "SIGTERM");
  const deadline = performance.now() + STOP_GRACE_MS;
  while (performance.now() < deadline) {
    if (await groupEnded(group)) {
      return;
    }
    await Bun.sleep(250);
  }
  console.error(
    `[release] command group ${group.pid} still running ${STOP_GRACE_MS / 1000}s after SIGTERM: killed`
  );
  await signalGroupOf(group, "SIGKILL");
}
/** Ends every command in `groups`, at once: a holder's, or this run's own. */
const endGroups = async (groups: Proc[] | undefined): Promise<void> => {
  await Promise.all((groups ?? []).map(endGroup));
};

/** The commands this run is waiting on (many run at once), so a stop can end them too. */
const running = new Set<Subprocess>();
/** Set once a SIGTERM or SIGINT has begun stopping this run. */
let stopped: Promise<never> | undefined;
/** Set while a failed build's steps are being stopped: no command starts then. */
let abandoned: Error | undefined;
const runCommand: Runner = async (command, at, captured, extra, limit) => {
  const cwd = at ?? repo;
  const capture = captured ?? false;
  const env = extra ?? {};
  if (stopped) {
    await stopped;
  }
  if (abandoned) {
    throw abandoned;
  }
  const started = performance.now();
  const child = Bun.spawn(command, {
    cwd,
    stdout: capture ? "pipe" : "inherit",
    stderr: "inherit",
    detached: true,
    // The live environment, always: Bun hands a child the one this process
    // started with otherwise ("Defaults to process.env as it was when the
    // current Bun process launched", bun.com/reference/bun/Spawn/SpawnOptions/env).
    env: { ...process.env, ...env },
  });
  running.add(child);
  const group = { pid: child.pid, started: (await startedOf(child.pid)) ?? "" };
  me.groups = [...(me.groups ?? []), group];
  await writeHolder();
  // Past its limit the command's whole group ends (a `bun run` and the
  // script it started alike), and the step fails with why the limit is
  // there: a process spinning on its own thread never reaches a timer of
  // its own.
  let overran = false;
  const deadline =
    limit &&
    setTimeout(() => {
      overran = true;
      endGroup(group).catch((error: unknown) => {
        console.error(
          `[release] ${command.join(" ")} did not end at its limit: ${error instanceof Error ? error.message : String(error)}`
        );
      });
    }, limit.seconds * 1000);
  try {
    const text = capture
      ? await new Response(child.stdout as ReadableStream).text()
      : "";
    const status = await child.exited;
    if (overran && limit) {
      throw new Error(
        `Release command ran past its ${limit.seconds}s limit and was stopped: ${command.join(" ")}. ${limit.why}`
      );
    }
    if (status !== 0) {
      // Killed by a stop: the stop finishes the run, not a failure path.
      if (stopped) {
        await stopped;
      }
      // Its own output went to this run's stdout and stderr as it ran.
      throw new Error(
        `Release command failed with exit status ${status}: ${command.join(" ")}`
      );
    }
    return text.trim();
  } finally {
    clearTimeout(deadline);
    running.delete(child);
    me.groups = me.groups?.filter((one) => one !== group);
    logStep(command.join(" "), started);
  }
};
/** One line per command with its seconds, so a slow release says where the time went. */
function logStep(what: string, started: number): void {
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  const label = what.length > 140 ? `${what.slice(0, 137)}...` : what;
  console.log(`[release] ${seconds}s ${label}`);
}

await mkdir(state, { recursive: true });
const queued = join(state, "queued.json");
/** The id of the last queued request a holder finished, built or failed. */
const finished = join(state, "finished.json");
const request: Request = {
  id: crypto.randomUUID(),
  commit: requestedCommit,
  channel,
  notes: channel === "nightly" ? nightlyNotes : undefined,
  tag: argument("--tag"),
  output,
};

// THE QUEUE. One request waits: the newest. A request for a commit that a
// pending one descends from leaves that one in place; whichever run holds the
// lock builds what the queue says when it gets there. An entry stays pending
// until a holder finishes it, so one whose holder died is built by the next
// run to take the lock, and one already finished supersedes nothing.
const readJson = async <T>(path: string): Promise<T | undefined> =>
  (await Bun.file(path)
    .json()
    .catch(() => undefined)) as T | undefined;
const writeJson = async (path: string, value: unknown): Promise<void> => {
  const temp = `${path}.${process.pid}`;
  await writeFile(temp, JSON.stringify(value));
  await rename(temp, path);
};
const pending = async (): Promise<Request | undefined> => {
  const entry = await readJson<Request>(queued);
  const done = await readJson<{ id: string }>(finished);
  return entry && entry.id !== done?.id ? entry : undefined;
};
const previous = await pending();
let superseded = false;
if (previous && previous.commit !== requestedCommit) {
  const ancestry = Bun.spawn(
    ["git", "merge-base", "--is-ancestor", requestedCommit, previous.commit],
    { env: process.env, cwd: repo, stdout: "ignore", stderr: "ignore" }
  );
  superseded = (await ancestry.exited) === 0;
}
if (!superseded) {
  await writeJson(queued, request);
}

// THE LOCK: no two release runs at once. It names its holder by pid and that
// process's start time (`ps -o lstart=`), so a pid reused by another process
// after the holder died is not mistaken for it, plus what the holder is
// building, so a run that finds it dead can clear what it left.
//
// The lock is a line of generations, `build-lock/<n>`, and only the newest
// one counts. A run claims generation n+1 by renaming a directory already
// holding its record onto that name, which fails when the name exists, so
// of the runs that find generation n released or its holder dead exactly
// one wins. Nothing is ever replaced in place: breaking a stale lock by
// renaming it away would race a second run doing the same, and remove the
// lock the first one had just taken. A released generation keeps a marker
// file, so no claim can land on it either.
const locks = join(state, "build-lock");
const GENERATION = /^\d+$/u;
await mkdir(locks, { recursive: true });
const readHolder = async (dir: string): Promise<Holder | undefined> =>
  (await Bun.file(join(dir, "holder.json"))
    .json()
    .catch(() => undefined)) as Holder | undefined;
const generations = async (): Promise<number[]> =>
  (await readdir(locks))
    .filter((name) => GENERATION.test(name))
    .map(Number)
    .sort((a, b) => a - b);
/** Lets the lock go: the generation stays, marked released, never empty. */
const release = async (): Promise<void> => {
  if (!mine) {
    return;
  }
  await holderWritten.catch(() => undefined);
  await rename(join(mine, "holder.json"), join(mine, "released.json")).catch(
    () => undefined
  );
  mine = undefined;
};
/**
 * Ends what container proofs left (scripts/binary/proof-sweep.sh): every
 * process naming one of `dirs` or a proof run dir one of them records (conmon
 * and its container, pasta, aardvark-dns), their mounts in podman's rootless
 * mount namespace, and the dirs themselves; with `stale`, also every proof run
 * dir whose owner is gone. Not a `run`: a stop runs it after its commands have
 * ended. Answers how many processes it ended and dirs it removed.
 */
const sweep = async (
  dirs: string[],
  stale: boolean
): Promise<{ ended: number; removed: number }> => {
  const args = [...(stale ? ["--stale"] : []), ...dirs];
  const child = Bun.spawn(
    ["bash", "-c", SWEEP_SCRIPT, "proof-sweep.sh", ...args],
    { env: process.env, cwd: mainRepo, stdout: "pipe", stderr: "inherit" }
  );
  const said = await new Response(child.stdout).text();
  process.stdout.write(said);
  const status = await child.exited;
  if (status !== 0) {
    throw new Error(
      `The proof sweep failed with exit status ${status}: proof-sweep.sh ${args.join(" ")}`
    );
  }
  const count = (prefix: string): number =>
    said.split("\n").filter((line) => line.startsWith(prefix)).length;
  return {
    ended: count("proof-sweep: ended pid "),
    removed: count("proof-sweep: removed "),
  };
};
/** A git command run in {@link mainRepo}, its status and output. */
const gitMain = async (
  ...args: string[]
): Promise<{ out: string; status: number }> => {
  const child = Bun.spawn(["git", "-C", mainRepo, ...args], {
    env: process.env,
    cwd: mainRepo,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, status] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { out: out || err, status };
};
/** The worktrees git records now, by path. */
const recordedTrees = async (): Promise<Set<string>> => {
  const listed = await gitMain("worktree", "list", "--porcelain");
  if (listed.status !== 0) {
    throw new Error(`git worktree list failed: ${listed.out.trim()}`);
  }
  return new Set(
    listed.out
      .split("\n")
      .filter((line) => line.startsWith("worktree "))
      .map((line) => line.slice("worktree ".length))
  );
};
/**
 * The trees and staging a build left: each tree removed as a worktree and
 * from the disk, the records of any whose folder went another way pruned,
 * then the staging with everything its proofs left (`sweep`, by the run dirs
 * its proofs recorded). Throws when a tree's record outlives it. Answers what
 * it cleared, in words.
 */
const clear = async (
  checkouts: string[],
  staging?: string
): Promise<string[]> => {
  const recorded = await recordedTrees();
  const trees = checkouts.filter(
    (checkout) => recorded.has(checkout) || existsSync(checkout)
  );
  await Promise.all(
    trees.map(async (checkout) => {
      await gitMain("worktree", "remove", "--force", checkout);
      await rm(checkout, { recursive: true, force: true });
    })
  );
  if (trees.length > 0) {
    const pruned = await gitMain("worktree", "prune");
    if (pruned.status !== 0) {
      throw new Error(`git worktree prune failed: ${pruned.out.trim()}`);
    }
    const left = [...(await recordedTrees())].filter((path) =>
      checkouts.includes(path)
    );
    if (left.length > 0) {
      throw new Error(`git still records ${left.join(", ")}`);
    }
  }
  const staged = staging !== undefined && existsSync(staging);
  const { ended, removed } = await sweep(staging ? [staging] : [], false);
  return [
    ...(trees.length > 0 ? [`${trees.length} worktree(s)`] : []),
    ...(staged ? ["its staging"] : []),
    ...(ended > 0 ? [`${ended} proof process(es)`] : []),
    ...(removed > (staged ? 1 : 0)
      ? [`${removed - (staged ? 1 : 0)} proof run dir(s)`]
      : []),
  ];
};
/**
 * Every staging no live build holds (by the holder records in the lock's
 * generations): an earlier run's, left when it was killed or crashed.
 */
const unheldStagings = async (): Promise<string[]> => {
  const held = new Set<string>();
  const holders = await Promise.all(
    (await generations()).map((n) => readHolder(join(locks, String(n))))
  );
  const live = await Promise.all(
    holders.map((holder) => (holder ? alive(holder) : false))
  );
  holders.forEach((holder, at) => {
    if (holder?.staging && live[at]) {
      held.add(holder.staging);
    }
  });
  return (await readdir(state))
    .filter((name) => name.startsWith("staging-"))
    .map((name) => join(state, name))
    .filter((path) => !held.has(path));
};
/**
 * Takes the lock, or says it is held by a live build. A lock whose holder
 * is gone (killed, crashed, the machine rebooted) is stale: one run takes it
 * over, atomically, and clears the dead build's trees and staging first.
 */
const acquire = async (): Promise<boolean> => {
  for (;;) {
    const seen = await generations();
    const top = seen.at(-1) ?? 0;
    const holder = top ? await readHolder(join(locks, String(top))) : undefined;
    if (holder && (await alive(holder))) {
      return false;
    }
    const temp = join(locks, `.claim-${process.pid}`);
    await rm(temp, { recursive: true, force: true });
    await mkdir(temp);
    await writeFile(join(temp, "holder.json"), JSON.stringify(me));
    const claim = join(locks, String(top + 1));
    try {
      await rename(temp, claim);
    } catch (error) {
      await rm(temp, { recursive: true, force: true });
      const { code } = error as NodeJS.ErrnoException;
      if (code !== "EEXIST" && code !== "ENOTEMPTY") {
        throw error;
      }
      continue;
    }
    // A run that read the line before a newer generation was claimed can
    // land below it, on a number already cleared away: it backs out.
    if (((await generations()).at(-1) ?? 0) !== top + 1) {
      await rm(claim, { recursive: true, force: true });
      continue;
    }
    mine = claim;
    if (holder) {
      console.log(
        `Took over a stale build lock: holder pid ${holder.pid}, started ${holder.started}, is gone`
      );
      // What it was running outlives it and still writes into its trees
      // and staging, which a build of the same commit uses again.
      await endGroups(holder.groups);
      await clear(holder.checkouts ?? [], holder.staging);
    }
    await Promise.all(
      seen.map((n) =>
        rm(join(locks, String(n)), { recursive: true, force: true })
      )
    );
    return true;
  }
};

/** What the build running now has learned: its draft, for a stop to remove. */
let learnedNow: Learned | undefined;
/**
 * The lock being taken, once it is asked for: a stop waits for it to settle,
 * so it never lets go of a lock before the claim lands (the claim would then
 * outlive the run, a holder.json for the next run's stale takeover) and never
 * leaves a stale generation half taken over.
 */
let acquiring: Promise<boolean> | undefined;
const said = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
// A stop (SIGTERM from a unit stop, which ship.sh hands on, or SIGINT) is the
// one owner of the run's cleanup: it ends the commands and GitHub calls it
// waits on, removes this run's draft release by its tag, clears its trees,
// staging and proofs, says in one line what it cleared, and lets the lock go.
// Nothing starts after it: `run` and every GitHub step wait on it instead, and
// a build that fails under it leaves the cleanup to it.
const stop = async (signal: "SIGTERM" | "SIGINT"): Promise<never> => {
  console.log(`Release build stopped by ${signal}: clearing its work`);
  // Every spawn from here runs from the main checkout, whatever became of this one.
  process.chdir(mainRepo);
  // A lock still being taken is taken, or refused, before anything is let go;
  // whatever it holds then, `release` below lets go of.
  await acquiring?.catch(() => false);
  await Promise.all([endGroups(me.groups), endCalls()]);
  await Promise.all([...running].map((child) => child.exited));
  const cleared: string[] = [];
  const failed: string[] = [];
  const draft = learnedNow?.draft;
  if (draft) {
    await draft.created.catch(() => undefined);
    try {
      if (await deleteDraft(draft.tag)) {
        cleared.push(`draft release ${draft.tag}`);
      }
    } catch (error) {
      failed.push(`draft release ${draft.tag} (${said(error)})`);
    }
  }
  try {
    cleared.push(...(await clear(me.checkouts ?? [], me.staging)));
  } catch (error) {
    // The next run's sweep ends what this one could not.
    failed.push(`its trees and staging (${said(error)})`);
  }
  const line = `Release build stopped by ${signal}: cleared ${cleared.join(", ") || "nothing it had made"}`;
  if (failed.length > 0) {
    console.error(`${line}; could not clear ${failed.join("; ")}`);
  } else {
    console.log(line);
  }
  await release();
  process.exit(signal === "SIGINT" ? 130 : 143);
};
process.on("SIGTERM", () => {
  stopped ??= stop("SIGTERM");
});
process.on("SIGINT", () => {
  stopped ??= stop("SIGINT");
});
acquiring = acquire();
const acquired = await acquiring.catch(async (error: unknown) => {
  // A claim that failed under a stop is the stop's to finish: it exits.
  if (stopped) {
    await stopped;
  }
  throw error;
});
// Stopped while the lock was being taken: the stop clears and lets it go.
if (stopped) {
  await stopped;
}
if (!acquired) {
  console.log(
    superseded
      ? `Superseded by newer queued commit ${previous?.commit}; one build is already running`
      : `Queued ${requestedCommit}; one build is already running`
  );
  process.exit(0);
}
// Every run starts by ending what an earlier one left: a run killed outright
// (SIGKILL, a crash, a reboot) never reached its own cleanup.
try {
  await sweep(await unheldStagings(), true);
} catch (error) {
  await release();
  throw error;
}

/**
 * One commit, built, signed and (unless a newer one is queued) promoted. It
 * starts at once, beside whatever else runs, with room on the disk
 * (lib/disk-room.ts), the machine held awake from then on (lib/hold-awake.ts);
 * its steps run as their graph says.
 */
const build = async (current: Request): Promise<void> => {
  requireDiskRoom(`The release of ${current.commit.slice(0, 12)}`);
  holdAwake(`The release of ${current.commit.slice(0, 12)}`);
  const building = performance.now();
  const trees = treesOf(current.commit);
  const staging = stagingOf(current.commit);
  const gated = await gatePassed(current.commit);
  const checkouts = gated ? [trees.build] : Object.values(trees);
  me.checkouts = checkouts;
  me.staging = staging;
  await writeHolder();
  await mkdir(staging, { recursive: true });
  const learned: Learned = {};
  learnedNow = learned;
  let failedClear: unknown;
  try {
    await runSteps(
      releaseSteps(
        current,
        publishing,
        runCommand,
        learned,
        releaseSecrets,
        async () => {
          if (stopped) {
            await stopped;
          }
        },
        gated
      ),
      {
        say: (line) => console.log(line),
        failed: async () => {
          abandoned = new Error(
            "Not started: another step of this build failed"
          );
          await endGroups(me.groups);
        },
      }
    );
    logStep(`build of ${current.commit.slice(0, 12)}, in all`, building);
  } catch (error) {
    // A step that failed under a stop (a command or gh call it ended) is the
    // stop's to clear, in its order: nightly 5186's upload failed beside its
    // stop and the two cleared at once.
    if (stopped) {
      await stopped;
    }
    const { draft } = learned;
    if (draft) {
      // A build that did not promote leaves no draft behind it.
      await draft.created.catch(() => undefined);
      await deleteDraft(draft.tag).catch((cleanup: unknown) =>
        console.error(
          `Removing the draft release ${draft.tag} failed: ${said(cleanup)}`
        )
      );
    }
    throw error;
  } finally {
    abandoned = undefined;
    // The Apple secrets' files go first, whatever becomes of the rest of the staging.
    await rm(join(staging, "apple"), { recursive: true, force: true });
    // A build that failed fails with its own error; the sweep's, if it fails too, is said beside it.
    await clear(checkouts, staging).catch((error: unknown) => {
      console.error(
        `Clearing the build of ${current.commit} failed: ${error instanceof Error ? error.message : String(error)}`
      );
      failedClear = error;
    });
    me.checkouts = undefined;
    me.staging = undefined;
    learnedNow = undefined;
    await writeHolder();
  }
  if (failedClear) {
    throw failedClear;
  }
};

// The holder builds what the queue says, then looks again: a request queued
// while it built (or one a dead holder left) is built next, whether the build
// before it succeeded or failed. Each is finished once, either way.
try {
  let failure: unknown;
  for (let current = await pending(); current; current = await pending()) {
    if (current.id !== request.id) {
      console.log(`Building queued ${current.commit}`);
    }
    failure = undefined;
    try {
      await build(current);
    } catch (error) {
      failure = error;
      console.error(
        `Release build of ${current.commit} failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    await writeJson(finished, { id: current.id });
  }
  if (failure) {
    throw failure;
  }
} finally {
  await release();
}
