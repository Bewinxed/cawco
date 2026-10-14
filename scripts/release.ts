/** Local, trigger-free release pipeline. Never publishes, tags or uploads. */
// biome-ignore-all lint/performance/noAwaitInLoops: the owner requires one build at a time, including signing and promotion.
import { createPublicKey } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { freemem, homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { Subprocess } from "bun";
import {
  AGENT_BUNDLE,
  AGENT_BUNDLE_EXECUTABLE,
} from "../packages/core/src/agent-bundle";
import { releaseTag } from "../packages/core/src/binary-distribution";
import {
  type ReleaseManifest,
  signManifest,
  verifyManifest,
} from "../packages/core/src/release-manifest";
import { SESSIOND_V1 } from "../packages/core/src/sessiond";
import { PINNED_BUN, TARGETS } from "./build-binary";
import { publishRelease } from "./publish-release";
import { signingPem, takeSigningKey, underSigningEnv } from "./release-signing";

const repo = resolve(import.meta.dir, "..");
const argv = Bun.argv.slice(2);
await underSigningEnv(import.meta.path, argv);
function argument(name: string): string | undefined {
  const i = argv.indexOf(name);
  return i < 0 ? undefined : argv[i + 1];
}
const commitInput = argument("--commit");
const channel = argument("--channel");
const output = argument("--output");
if (
  !(commitInput && output && isAbsolute(output)) ||
  (channel !== "stable" && channel !== "nightly")
) {
  throw new Error(
    "Usage: bun scripts/release.ts --commit REF --channel stable|nightly --output /absolute/path [--notes /absolute/notes.md (nightly, required)] [--tag vX.Y.Z] [--mac-host mac]"
  );
}
// A nightly's notes are written for the person updating; see docs/releases/README.md.
const notesFile = argument("--notes");
if (channel === "nightly" && !(notesFile && isAbsolute(notesFile))) {
  throw new Error("Nightly builds need end-user notes: --notes <file>");
}
const nightlyNotes = notesFile ? await readFile(notesFile, "utf8") : undefined;
if (channel === "nightly" && !nightlyNotes?.trim()) {
  throw new Error("Nightly end-user release notes are empty");
}
if (Bun.version !== PINNED_BUN) {
  throw new Error(`Release pipeline requires Bun ${PINNED_BUN}`);
}
const signingKeyBase64 = takeSigningKey();

/** A process named so a reused pid is never taken for it: pid and start time. */
interface Proc {
  pid: number;
  started: string;
}
/** Who holds the build lock and what it is building, for whoever finds it dead. */
interface Holder extends Proc {
  checkout?: string;
  /** The process group of the command it is running: everything it started. */
  group?: Proc;
  staging?: string;
}
const WHITESPACE = /\s+/;
/** A process's start time (`ps -o lstart=`), or undefined once it is gone. */
async function startedOf(pid: number): Promise<string | undefined> {
  const ps = Bun.spawn(["ps", "-o", "lstart=", "-p", String(pid)], {
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
/** Records what this holder is building now, in the lock it holds. */
async function writeHolder(): Promise<void> {
  if (!mine) {
    return;
  }
  const temp = join(mine, `holder.json.${process.pid}`);
  await writeFile(temp, JSON.stringify(me));
  await rename(temp, join(mine, "holder.json"));
}
async function groupMembers(group: number): Promise<number[]> {
  const ps = Bun.spawn(["ps", "-eo", "pid=,pgid="], {
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
const signalGroup = (group: number, signal: NodeJS.Signals): void => {
  try {
    process.kill(-group, signal);
  } catch {
    // ESRCH: the group has already ended.
  }
};
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
  signalGroup(group.pid, "SIGTERM");
  for (const _ of Array.from({ length: 50 })) {
    if (
      !(await startedOf(group.pid)) &&
      (await groupMembers(group.pid)).length === 0
    ) {
      return;
    }
    await Bun.sleep(100);
  }
  signalGroup(group.pid, "SIGKILL");
}

/** The command this run is waiting on, so a stop can end it too. */
let running: Subprocess | undefined;
/** Set once a SIGTERM or SIGINT has begun stopping this run. */
let stopped: Promise<never> | undefined;
async function run(
  command: string[],
  cwd = repo,
  capture = false
): Promise<string> {
  if (stopped) {
    await stopped;
  }
  const child = Bun.spawn(command, {
    cwd,
    stdout: capture ? "pipe" : "inherit",
    stderr: "inherit",
    detached: true,
  });
  running = child;
  me.group = { pid: child.pid, started: (await startedOf(child.pid)) ?? "" };
  await writeHolder();
  try {
    const text = capture
      ? await new Response(child.stdout as ReadableStream).text()
      : "";
    const status = await child.exited;
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
    running = undefined;
  }
}
const commit = await run(
  ["git", "rev-parse", `${commitInput}^{commit}`],
  repo,
  true
);
const state = join(homedir(), ".cache", "cawco", "release-pipeline");
await mkdir(state, { recursive: true });
const queued = join(state, "queued.json");
/** The id of the last queued request a holder finished, built or failed. */
const finished = join(state, "finished.json");
interface Request {
  channel: "stable" | "nightly";
  commit: string;
  /** This request, apart from any other for the same commit. */
  id: string;
  macHost: string;
  /** A nightly's end-user notes, carried with the request so a queued one keeps its own. */
  notes?: string;
  output: string;
  tag?: string;
}
const request: Request = {
  id: crypto.randomUUID(),
  commit,
  channel,
  notes: channel === "nightly" ? nightlyNotes : undefined,
  tag: argument("--tag"),
  macHost: argument("--mac-host") ?? "mac",
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
if (previous && previous.commit !== commit) {
  const ancestry = Bun.spawn(
    ["git", "merge-base", "--is-ancestor", commit, previous.commit],
    { cwd: repo, stdout: "ignore", stderr: "ignore" }
  );
  superseded = (await ancestry.exited) === 0;
}
if (!superseded) {
  await writeJson(queued, request);
}

// THE LOCK: one build at a time. It names its holder by pid and that
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
const GENERATION = /^\d+$/;
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
  await rename(join(mine, "holder.json"), join(mine, "released.json")).catch(
    () => undefined
  );
  mine = undefined;
};
/** A checkout and staging a build left: removed, the checkout as a worktree. */
const clear = async (checkout?: string, staging?: string): Promise<void> => {
  if (checkout) {
    await Bun.spawn(["git", "worktree", "remove", "--force", checkout], {
      cwd: repo,
      stdout: "ignore",
      stderr: "ignore",
    }).exited;
    await rm(checkout, { recursive: true, force: true });
    await Bun.spawn(["git", "worktree", "prune"], {
      cwd: repo,
      stdout: "ignore",
      stderr: "ignore",
    }).exited;
  }
  if (staging) {
    await rm(staging, { recursive: true, force: true });
  }
};
/** Where a failed build's proof evidence outlives its staging; the newest few are kept. */
const failedEvidence = join(homedir(), ".cache", "cawco-release");
const KEPT_FAILURES = 5;
/** The proof's own working state: container storage and scratch, not evidence. */
const PROOF_SCRATCH = new Set(["storage", "run", "tmp", "cache", "config"]);
/**
 * Copies the container proof's logs and outputs out of `staging` before it is
 * cleared, and prunes older copies. Undefined when the build never reached it.
 */
const keepEvidence = async (
  commitId: string,
  staging: string
): Promise<string | undefined> => {
  const proof = join(staging, "container-proof");
  if (!(await stat(proof).catch(() => undefined))) {
    return;
  }
  const time = new Date().toISOString().replace(/[:.]/g, "-");
  const kept = join(failedEvidence, `failed-${commitId.slice(0, 12)}-${time}`);
  await cp(proof, kept, {
    recursive: true,
    filter: async (source) => {
      const rel = relative(proof, source);
      if (PROOF_SCRATCH.has(rel)) {
        return false;
      }
      const info = await lstat(source);
      return info.isFile() || info.isDirectory();
    },
  });
  const older = await Promise.all(
    (await readdir(failedEvidence))
      .filter((name) => name.startsWith("failed-"))
      .map(async (name) => {
        const path = join(failedEvidence, name);
        return { path, time: (await stat(path)).mtimeMs };
      })
  );
  older.sort((a, b) => b.time - a.time);
  for (const { path } of older.slice(KEPT_FAILURES)) {
    await rm(path, { recursive: true, force: true });
  }
  return kept;
};
/**
 * Takes the lock, or says it is held by a live build. A lock whose holder
 * is gone (killed, crashed, the machine rebooted) is stale: one run takes it
 * over, atomically, and clears the dead build's checkout and staging first.
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
      // What it was running outlives it and still writes into its checkout
      // and staging, which a build of the same commit uses again.
      await endGroup(holder.group);
      await clear(holder.checkout, holder.staging);
    }
    for (const n of seen) {
      await rm(join(locks, String(n)), { recursive: true, force: true });
    }
    return true;
  }
};

// A stop (SIGTERM from a task stop, SIGINT) ends the command it waits on,
// clears its own checkout and staging, and lets the lock go. Nothing starts
// after it: `run` waits on it instead of spawning.
const stop = async (signal: "SIGTERM" | "SIGINT"): Promise<never> => {
  console.log(`Release build stopped by ${signal}: clearing its work`);
  await endGroup(me.group);
  await running?.exited;
  await clear(me.checkout, me.staging);
  await release();
  process.exit(signal === "SIGINT" ? 130 : 143);
};
process.on("SIGTERM", () => {
  stopped ??= stop("SIGTERM");
});
process.on("SIGINT", () => {
  stopped ??= stop("SIGINT");
});
if (!(await acquire())) {
  console.log(
    superseded
      ? `Superseded by newer queued commit ${previous?.commit}; one build is already running`
      : `Queued ${commit}; one build is already running`
  );
  process.exit(0);
}

/** The version a build carries and the notes that go with it. */
const versionAndNotes = async (
  current: Request,
  checkout: string
): Promise<{ version: string; notes: string }> => {
  const base = (
    await Bun.file(join(checkout, "packages/cli/package.json")).json()
  ).version as string;
  if (current.channel === "stable") {
    if (
      current.tag !== `v${base}` ||
      (await run(
        ["git", "rev-parse", `${current.tag}^{commit}`],
        checkout,
        true
      )) !== current.commit
    ) {
      throw new Error(
        "Stable builds require a matching vX.Y.Z tag at the input commit"
      );
    }
    const notes = await readFile(
      join(checkout, "docs/releases", `${base}.md`),
      "utf8"
    );
    if (!notes.trim()) {
      throw new Error("Stable end-user release notes are empty");
    }
    return { version: base, notes };
  }
  if (!current.notes?.trim()) {
    throw new Error("Nightly builds need end-user notes: --notes <file>");
  }
  const count = await run(
    ["git", "rev-list", "--first-parent", "--count", current.commit],
    checkout,
    true
  );
  return {
    version: `${base}-nightly.${count}+${current.commit.slice(0, 12)}`,
    notes: current.notes,
  };
};

/** One commit, built, signed and (unless a newer one is queued) promoted. */
const build = async (current: Request): Promise<void> => {
  if (freemem() < 4 * 1024 ** 3) {
    throw new Error("Release build refused: less than 4 GiB available memory");
  }
  const checkout = join(state, `checkout-${current.commit.slice(0, 12)}`);
  const staging = join(state, `staging-${current.commit.slice(0, 12)}`);
  me.checkout = checkout;
  me.staging = staging;
  await writeHolder();
  await run(["git", "worktree", "add", "--detach", checkout, current.commit]);
  await mkdir(staging, { recursive: true });
  try {
    await run([process.execPath, "install", "--frozen-lockfile"], checkout);
    await run([process.execPath, "run", "typecheck"], checkout);
    await run([process.execPath, "run", "lint"], checkout);
    const { version, notes } = await versionAndNotes(current, checkout);
    // One compile at a time, sharing only immutable prepared assets.
    const proofBinary = join(staging, "cawco-proof");
    await run(
      [
        process.execPath,
        "scripts/build-binary.ts",
        "linux-x64",
        proofBinary,
        version,
        current.commit,
        "--proof",
      ],
      checkout
    );
    const podman = Bun.which("podman");
    if (podman) {
      await run(
        [
          "bash",
          "scripts/binary/prove-stage1.sh",
          join(staging, "container-proof"),
          proofBinary,
        ],
        checkout
      );
    } else {
      console.log(
        "Container runtime absent: proof must be run by the operator before accepting this build"
      );
    }
    // Only grows: no path installs a build whose sequence is not above the running one.
    const sequence = Number(
      await run(
        ["git", "rev-list", "--first-parent", "--count", current.commit],
        checkout,
        true
      )
    );
    // How many database migrations this build carries; never installed over a newer database.
    const schemaVersion = (
      (await Bun.file(
        join(checkout, "packages/hub/drizzle/meta/_journal.json")
      ).json()) as { entries: unknown[] }
    ).entries.length;
    // The hub ↔ agent contract this build speaks, as the build itself says: a joined machine installs it only when
    // it overlaps its hub's. The proof build runs only under a scratch HOME and an isolated loopback hub
    // (scripts/binary/proof-entry.ts), and inherits no credentials, so build-info is asked under exactly those.
    const infoHome = join(staging, "binary-info-home");
    await mkdir(infoHome, { recursive: true });
    const { protocol } = JSON.parse(
      await run(
        [
          "env",
          "-i",
          `PATH=${process.env.PATH ?? ""}`,
          `HOME=${infoHome}`,
          "HOST=127.0.0.1",
          "CAWCO_HUB_PORT=43456",
          "CAWCO_HUB_URL=http://127.0.0.1:43456",
          proofBinary,
          "build-info",
        ],
        checkout,
        true
      )
    ) as Pick<ReleaseManifest, "protocol">;
    const manifest: ReleaseManifest = {
      version,
      commit: current.commit,
      channel: current.channel,
      sequence,
      schemaVersion,
      protocol,
      sessiondProtocol: SESSIOND_V1,
      notes,
      testSigned: false,
      artifacts: [],
    };
    // A darwin build ships as its own CawCo Agent.app, signed with the team's
    // Developer ID (packages/core/src/agent-bundle.ts,
    // scripts/binary/sign-agent-bundle.sh) on the Mac, in a folder under its
    // home, with its Info.plist from this commit; the Mac tars the bundle as
    // signed, and runs what it tarred, before the archive comes back.
    const mac = current.macHost;
    const macDir = `build/cawco-agent-sign/${current.commit.slice(0, 12)}`;
    const bundleFiles = join(staging, "agent-bundle");
    await mkdir(bundleFiles, { recursive: true });
    await run(
      [
        process.execPath,
        "-e",
        `const { AGENT_INFO_PLIST } = await import(${JSON.stringify(join(checkout, "packages/core/src/agent-bundle.ts"))}); await Bun.write(${JSON.stringify(join(bundleFiles, "Info.plist"))}, AGENT_INFO_PLIST);`,
      ],
      checkout
    );
    await run(["ssh", mac, `rm -rf '${macDir}' && mkdir -p '${macDir}'`]);
    try {
      await run([
        "scp",
        join(bundleFiles, "Info.plist"),
        join(checkout, "scripts/binary/agent.entitlements"),
        join(checkout, "scripts/binary/sign-agent-bundle.sh"),
        `${mac}:${macDir}/`,
      ]);
      for (const target of TARGETS) {
        if (freemem() < 4 * 1024 ** 3) {
          throw new Error(
            "Release build refused: less than 4 GiB available memory"
          );
        }
        const dir = join(staging, target);
        await mkdir(dir, { recursive: true });
        const binary = join(dir, "cawco");
        const darwin = target.startsWith("darwin");
        await run(
          [
            process.execPath,
            "scripts/build-binary.ts",
            target,
            binary,
            version,
            current.commit,
            "--skip-prepare",
          ],
          checkout
        );
        // The tag form, so the file name carries no `+`.
        const archive = `cawco-${releaseTag(manifest)}-${target}.tar.gz`;
        // What the manifest's binarySha256 names: the executable as the installer and the updater find it.
        let executable = binary;
        if (darwin) {
          await run(["scp", binary, `${mac}:${macDir}/cawco`]);
          await run([
            "ssh",
            mac,
            `bash --norc '${macDir}/sign-agent-bundle.sh' '${macDir}' '${target}' '${version}' '${archive}'`,
          ]);
          await run([
            "scp",
            `${mac}:${macDir}/${archive}`,
            join(staging, archive),
          ]);
          await rm(binary);
          // Unpacked here only to hash the signed executable it carries; libarchive's own pax keywords are not GNU tar's.
          await run(
            [
              "tar",
              "--warning=no-unknown-keyword",
              "-xzf",
              join(staging, archive),
              "-C",
              dir,
              AGENT_BUNDLE,
            ],
            checkout
          );
          executable = join(dir, AGENT_BUNDLE_EXECUTABLE);
        } else {
          await run(
            ["tar", "-czf", join(staging, archive), "-C", dir, "cawco"],
            checkout
          );
        }
        const sha256 = new Bun.CryptoHasher("sha256")
          .update(await Bun.file(join(staging, archive)).bytes())
          .digest("hex");
        const binarySha256 = new Bun.CryptoHasher("sha256")
          .update(await Bun.file(executable).bytes())
          .digest("hex");
        manifest.artifacts.push({
          target,
          archive,
          sha256,
          size: (await stat(join(staging, archive))).size,
          binarySha256,
          binarySize: (await stat(executable)).size,
        });
        await writeFile(
          join(staging, `${archive}.sha256`),
          `${sha256}  ${archive}\n`
        );
      }
    } finally {
      await run(["ssh", mac, "rm", "-rf", macDir]);
      // Not an artifact: only the archives and the manifest are published.
      await rm(bundleFiles, { recursive: true, force: true });
    }
    await writeFile(
      join(staging, "SHA256SUMS"),
      manifest.artifacts.map((a) => `${a.sha256}  ${a.archive}\n`).join("")
    );
    const privatePem = signingPem(signingKeyBase64);
    const signature = signManifest(manifest, privatePem);
    verifyManifest(
      manifest,
      signature,
      createPublicKey(privatePem)
        .export({ type: "spki", format: "pem" })
        .toString()
    );
    const manifestText = JSON.stringify(manifest);
    // The installer reads the version off the front of the signed text.
    if (!manifestText.startsWith(`{"version":"${version}",`)) {
      throw new Error("The manifest must begin with its version");
    }
    await writeFile(join(staging, "release.json"), manifestText);
    await writeFile(join(staging, "release.json.sig"), `${signature}\n`);
    const next = await readJson<Request>(queued);
    if (next?.id !== current.id) {
      console.log(
        `Built ${current.commit} was superseded; artifacts are not promoted`
      );
      return;
    }
    await mkdir(current.output, { recursive: true });
    const published = join(current.output, version);
    await rename(staging, published);
    await writeFile(
      join(current.output, "release.json"),
      JSON.stringify(manifest)
    );
    console.log(`Local artifacts ready: ${published}`);
    if (argv.includes("--publish")) {
      await publishRelease(published, manifest);
    }
  } catch (error) {
    const kept = await keepEvidence(current.commit, staging);
    if (!kept) {
      throw error;
    }
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}; proof evidence kept at ${kept}`,
      { cause: error }
    );
  } finally {
    await clear(checkout, staging);
    me.checkout = undefined;
    me.staging = undefined;
    await writeHolder();
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
