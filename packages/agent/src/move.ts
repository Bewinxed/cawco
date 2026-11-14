/**
 * A project move's steps on this machine (core move.ts; the hub drives the
 * job). Each step runs here as git and the tools would run in a terminal,
 * once per job at a time: the hub asking again for a step already running
 * (it restarted, or this machine's socket came back) waits on the same run,
 * and a step that already succeeded answers what it found. A failed step is
 * not kept: asked again, it runs again.
 *
 * The hub's git remote is reached with this machine's credential
 * (git/hub-credential.ts). Anything a step says back (git's last line) has it
 * removed first.
 */

import {
  copyFile,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  statfs,
} from "node:fs/promises";
import { homedir, hostname } from "node:os";
import { basename, dirname, join } from "node:path";
import { makeFolder } from "@cawco/core/folders";
import { type HubRepoKey, hubRepoOfUrl } from "@cawco/core/hub-repo";
import {
  FREE_SPACE_MARGIN,
  LARGE_FILE_BYTES,
  type MoveCloneRequest,
  type MoveInspection,
  type MoveLargeFile,
  type MoveLfsObject,
  type MoveLfsRequest,
  type MoveLfsResult,
  type MovePrepareRequest,
  type MoveProgressFrame,
  type MoveRemoteAuth,
  type MoveSnapshotRequest,
  type MoveSnapshotResult,
} from "@cawco/core/move";
import { isSecretFileName } from "@cawco/core/paths/host-policy";
import { cawcoDataDir } from "@cawco/core/paths/roots";
import { GIT_LOCALE } from "@cawco/core/safe-git";
import { hostEnvironment } from "@cawco/core/session-env";
import { writeStateFile } from "@cawco/core/state-file";
import { HOUR_MS } from "@cawco/core/time";
import { WORKSPACE_GIT_TIMEOUT_MS } from "@cawco/core/workspace/controls";
import type { Subprocess } from "bun";
import type { AgentPorts } from "./agent-ports";
import { holdingRemote, withoutCredential } from "./git/hub-credential";
import { hubGitEnv, hubRepo, hubRepoOf } from "./git/hub-remote";
import { LFS_FILTERS } from "./git/lfs";
import { configEnv, useHubCredentialHelper } from "./git-credential";
import { notAProject, placeSettled, placeTurn } from "./place-repo";
import { remoteWithoutCredential } from "./remote-credential";

// ── The hub's git remote ───────────────────────────────────────────────────

/** git's environment for a command that reaches the hub's repository `key`. */
const hubEnv = (
  key: HubRepoKey,
  extra: [string, string][] = []
): Record<string, string> => ({
  ...hubGitEnv(hubRepo(key), extra),
  GIT_OPTIONAL_LOCKS: "0",
});

/**
 * git's environment for anything else. `GIT_OPTIONAL_LOCKS=0`: a read
 * (`git status`) leaves the folder's index as it found it, byte for byte.
 */
const plainEnv = (extra: [string, string][] = []): Record<string, string> => ({
  ...hostEnvironment(),
  ...GIT_LOCALE,
  GIT_TERMINAL_PROMPT: "0",
  GIT_OPTIONAL_LOCKS: "0",
  ...configEnv(extra),
});

/**
 * git's environment for a command that reaches the outside remote at `url`
 * (no credential in it): with `basic`, the remote's credential as an
 * `Authorization` header for every request to its host, env-only as the
 * hub's is. git-lfs reads the same key for its own requests
 * (`c.uc.GetAll("http", u.String(), "extraHeader")`, lfshttp/client.go,
 * since git-lfs 2.1.0).
 */
const outsideEnv = (
  url: string,
  basic: string | undefined
): Record<string, string> =>
  plainEnv(
    basic
      ? [
          [
            `http.${new URL(url).origin}/.extraHeader`,
            `Authorization: Basic ${basic}`,
          ],
        ]
      : []
  );

/** Who a commit CawCo makes is by: CawCo, on this machine. */
const CAWCO_IDENTITY = (): Record<string, string> => {
  const email = `cawco@${hostname().toLowerCase()}`;
  return {
    GIT_AUTHOR_NAME: "CawCo",
    GIT_AUTHOR_EMAIL: email,
    GIT_COMMITTER_NAME: "CawCo",
    GIT_COMMITTER_EMAIL: email,
  };
};

// ── Runs ───────────────────────────────────────────────────────────────────

/** A step that stopped because the job was cancelled. */
class MoveCancelled extends Error {
  constructor() {
    super("The move was cancelled.");
  }
}

/**
 * A step's failure as the hub reads it: its own words on the first line, the
 * tool's last line after it.
 */
class StepFailed extends Error {
  constructor(message: string, detail?: string, options?: ErrorOptions) {
    super(
      withoutCredential(
        detail?.trim() ? `${message}\n${detail.trim()}` : message
      ),
      options
    );
  }
}

interface Run {
  cancelled: boolean;
  children: Set<Subprocess>;
  promise: Promise<unknown>;
  stage: string;
}

/**
 * One kind of step a move runs here, by its name, with what it answers
 * (`T`) and, per job, the run in flight and the answer kept so a hub that
 * missed the answer hears it.
 */
class Step<T> {
  readonly answered = new Map<string, { at: number; result: T }>();
  readonly flights = new Map<string, Promise<T>>();
  readonly stage: string;

  constructor(stage: string) {
    this.stage = stage;
  }
}

const PREPARE = new Step<{ commit: string | null }>("prepare");
const SNAPSHOT = new Step<MoveSnapshotResult>("snapshot");
const CLONE = new Step<MoveLfsResult>("clone");
const LFS = new Step<MoveLfsResult>("lfs");

/** The step running for each job here. */
const runs = new Map<string, Run>();
const ANSWER_KEPT_MS = HOUR_MS;

const runStep = <T>(
  { stage, answered, flights }: Step<T>,
  jobId: string,
  work: (run: Run) => Promise<T>
): Promise<T> => {
  const running = runs.get(jobId);
  const job = jobId.slice(0, 8);
  const inFlight = flights.get(jobId);
  if (inFlight) {
    console.info(
      `[move] ${job} ${stage}: asked again, waiting on the run in flight`
    );
    return inFlight;
  }
  if (running) {
    return Promise.reject(
      new StepFailed(
        `This machine is still at the move's ${running.stage} step.`
      )
    );
  }
  const kept = answered.get(jobId);
  if (kept && Date.now() - kept.at < ANSWER_KEPT_MS) {
    return Promise.resolve(kept.result);
  }
  const run: Run = {
    stage,
    cancelled: false,
    children: new Set(),
    promise: Promise.resolve(),
  };
  const promise = (async () => {
    console.info(`[move] ${job} ${stage}: started`);
    try {
      const result = await work(run);
      if (run.cancelled) {
        throw new MoveCancelled();
      }
      answered.set(jobId, { at: Date.now(), result });
      console.info(`[move] ${job} ${stage}: done`);
      return result;
    } catch (error) {
      console.warn(
        `[move] ${job} ${stage}: ${run.cancelled ? "cancelled" : `failed: ${withoutCredential(error instanceof Error ? error.message : String(error)).replaceAll("\n", " — ")}`}`
      );
      throw error;
    } finally {
      runs.delete(jobId);
      flights.delete(jobId);
    }
  })();
  run.promise = promise;
  runs.set(jobId, run);
  flights.set(jobId, promise);
  return promise;
};

/** Stops the job's step running here: its processes end, and it answers cancelled. */
export const moveCancel = async (
  jobId: string
): Promise<{ stopped: boolean; stage?: string }> => {
  const run = runs.get(jobId);
  if (!run) {
    return { stopped: false };
  }
  run.cancelled = true;
  for (const child of run.children) {
    child.kill("SIGTERM");
  }
  const late = setTimeout(() => {
    for (const child of run.children) {
      child.kill("SIGKILL");
    }
  }, 5000);
  await run.promise.catch(() => undefined);
  clearTimeout(late);
  return { stopped: true, stage: run.stage };
};

interface Ran {
  code: number;
  stderr: string;
  stdout: string;
}

const LINE_BREAKS = /[\r\n]+/u;

const lastLine = (text: string): string =>
  text
    .split(LINE_BREAKS)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1) ?? "";

/**
 * Runs `argv` in `cwd` as part of `run`: a Cancel kills it. stdout is kept
 * whole (git's answers are small); stderr's tail is kept, and each chunk is
 * handed to `onStderr` as it arrives (git's progress).
 */
const exec = async (
  run: Run | undefined,
  argv: string[],
  options: {
    cwd: string;
    /** What the command writes is not wanted (a smudge writes a whole large file). */
    discardStdout?: boolean;
    env?: Record<string, string>;
    input?: string;
    onStderr?: (text: string) => void;
  }
): Promise<Ran> => {
  if (run?.cancelled) {
    throw new MoveCancelled();
  }
  const child = Bun.spawn(argv, {
    cwd: options.cwd,
    env: options.env ?? plainEnv(),
    stdin: options.input === undefined ? "ignore" : new Blob([options.input]),
    stdout: options.discardStdout ? "ignore" : "pipe",
    stderr: "pipe",
  });
  run?.children.add(child);
  const decoder = new TextDecoder();
  let stderr = "";
  const reading = (async () => {
    for await (const chunk of child.stderr) {
      const text = decoder.decode(chunk, { stream: true });
      stderr = (stderr + text).slice(-8000);
      options.onStderr?.(text);
    }
  })();
  const stdout = child.stdout ? await new Response(child.stdout).text() : "";
  await reading;
  const code = await child.exited;
  run?.children.delete(child);
  if (run?.cancelled) {
    throw new MoveCancelled();
  }
  return { code, stdout, stderr };
};

/** git's stdout, or the step fails with `message` and git's last line. */
const must = async (
  run: Run | undefined,
  cwd: string,
  args: string[],
  message: string,
  env?: Record<string, string>
): Promise<string> => {
  const ran = await exec(run, ["git", ...args], { cwd, env });
  if (ran.code !== 0) {
    throw new StepFailed(message, lastLine(ran.stderr) || lastLine(ran.stdout));
  }
  return ran.stdout;
};

/** git's trimmed stdout, or null when it exits non-zero. */
const maybe = async (cwd: string, args: string[]): Promise<string | null> => {
  const ran = await exec(undefined, ["git", ...args], { cwd });
  return ran.code === 0 ? ran.stdout.trim() : null;
};

const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false
  );

/** A job's own scratch folder on this machine. */
const scratchOf = (jobId: string): string =>
  join(cawcoDataDir(), "moves", jobId);

const gb = (bytes: number): string => {
  if (bytes >= 1024 ** 3) {
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
};

/** Fails the step when `folder`'s disk holds less than `needed` bytes and the margin. */
const enoughSpace = async (
  folder: string,
  needed: number,
  machine: string
): Promise<void> => {
  const disk = await statfs(folder);
  const free = disk.bavail * disk.bsize;
  const want = Math.ceil(needed * (1 + FREE_SPACE_MARGIN));
  if (free < want) {
    throw new StepFailed(
      `disk full on ${machine}: ${gb(free)} free, ${gb(want)} needed`
    );
  }
};

/** Throttles a progress feed to a few frames a second, the last always sent. */
const throttled = (send: (frame: MoveProgressFrame) => void) => {
  let last = 0;
  let pending: MoveProgressFrame | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    timer = undefined;
    if (pending) {
      send(pending);
      pending = undefined;
      last = Date.now();
    }
  };
  return {
    push(frame: MoveProgressFrame) {
      pending = frame;
      const wait = 250 - (Date.now() - last);
      if (wait <= 0) {
        flush();
      } else if (!timer) {
        timer = setTimeout(flush, wait);
      }
    },
    end() {
      if (timer) {
        clearTimeout(timer);
      }
      flush();
    },
  };
};

// ── Large-file pointers ────────────────────────────────────────────────────

/** git's `-z` output as its entries. */
const entries = (text: string): string[] => text.split("\0").filter(Boolean);

const POINTER =
  /^version https:\/\/git-lfs\.github\.com\/spec\/v1\n(?:.*\n)*?oid sha256:([0-9a-f]{64})\n(?:.*\n)*?size (\d+)\n?/u;
/** A pointer file is about 130 bytes; nothing past this is one. */
const POINTER_MAX = 1024;
const WHITESPACE = /\s+/u;

/**
 * The contents of `shas`, read in one `git cat-file --batch`. Its output is
 * `<sha> <type> <size>\n<content>\n` per object, sizes in bytes, so it is
 * read as bytes: a blob that is not ASCII must not shift the ones after it.
 */
const blobsOf = async (cwd: string, shas: string[]): Promise<string[]> => {
  const child = Bun.spawn(["git", "cat-file", "--batch"], {
    cwd,
    env: plainEnv(),
    stdin: new Blob([`${shas.join("\n")}\n`]),
    stdout: "pipe",
    stderr: "ignore",
  });
  const bytes = new Uint8Array(await new Response(child.stdout).arrayBuffer());
  await child.exited;
  const decoder = new TextDecoder();
  const contents: string[] = [];
  let at = 0;
  while (at < bytes.length) {
    const newline = bytes.indexOf(10, at);
    if (newline < 0) {
      break;
    }
    const size = Number(
      decoder.decode(bytes.subarray(at, newline)).split(" ")[2]
    );
    if (!Number.isSafeInteger(size)) {
      // `<sha> missing`: no content follows; its place in the answer stays.
      contents.push("");
      at = newline + 1;
      continue;
    }
    contents.push(
      decoder.decode(bytes.subarray(newline + 1, newline + 1 + size))
    );
    at = newline + 1 + size + 1;
  }
  return contents;
};

/** A large file a tree points at: its size, and a path it is checked out at. */
interface Pointed {
  path: string;
  size: number;
}

/** The LFS objects `treeish`'s tree points at, each once by oid. */
const pointersIn = async (
  cwd: string,
  treeish: string
): Promise<Map<string, Pointed>> => {
  const listed = await must(
    undefined,
    cwd,
    ["ls-tree", "-r", "-l", "-z", treeish],
    "git could not list the tree"
  );
  const small = entries(listed).flatMap((entry) => {
    const [meta, path] = entry.split("\t");
    const [, type, sha, size] = meta.split(WHITESPACE);
    return type === "blob" && Number(size) <= POINTER_MAX
      ? [{ sha, path }]
      : [];
  });
  const found = new Map<string, Pointed>();
  if (small.length === 0) {
    return found;
  }
  const contents = await blobsOf(
    cwd,
    small.map((blob) => blob.sha)
  );
  contents.forEach((content, index) => {
    const pointer = POINTER.exec(content);
    if (pointer && !found.has(pointer[1])) {
      found.set(pointer[1], {
        size: Number(pointer[2]),
        path: small[index].path,
      });
    }
  });
  return found;
};

const total = (pointed: Map<string, Pointed>): MoveLfsResult => ({
  files: pointed.size,
  bytes: [...pointed.values()].reduce((sum, one) => sum + one.size, 0),
});

// ── Inspect ────────────────────────────────────────────────────────────────

/** The size of each of `paths` under `root`; a path that is gone is left out. */
const sizes = async (
  root: string,
  paths: string[]
): Promise<{ path: string; bytes: number }[]> => {
  const found = await Promise.all(
    paths.map(async (path) => {
      const info = await stat(join(root, path)).catch(() => undefined);
      return info?.isFile() ? { path, bytes: info.size } : undefined;
    })
  );
  return found.filter((one) => one !== undefined);
};

/** Which of `paths` LFS tracks (their `filter` attribute is `lfs`). */
const lfsTracked = async (
  cwd: string,
  paths: string[],
  gitDir: string[] = []
): Promise<Set<string>> => {
  if (paths.length === 0) {
    return new Set();
  }
  const ran = await exec(
    undefined,
    ["git", ...gitDir, "check-attr", "-z", "--stdin", "filter"],
    { cwd, input: `${paths.join("\0")}\0` }
  );
  const parts = entries(ran.stdout);
  const tracked = new Set<string>();
  for (let i = 0; i + 2 < parts.length; i += 3) {
    if (parts[i + 2] === "lfs") {
      tracked.add(parts[i]);
    }
  }
  return tracked;
};

/**
 * Secrets never move, ignored or not: a commit CawCo makes (the first one of
 * a folder, a snapshot) leaves out every file core's `SECRET_FILE_NAME`
 * names (`.env*`, `*.env`, `*.env.*`), at any depth. A secret the folder's
 * history already holds is the history's.
 */
const SECRETS_STAY = [
  ":(exclude,glob)**/.env*",
  ":(exclude,glob)**/*.env",
  ":(exclude,glob)**/*.env.*",
];

const isSecretPath = (path: string): boolean =>
  isSecretFileName(basename(path));

/**
 * What stays behind at the root: whether anything is ignored, and the
 * secrets there, ignored or left out ({@link SECRETS_STAY}).
 */
const stayingAtRoot = (
  ignored: string,
  leftOut: string[]
): { ignores: boolean; ignoredSecrets: string[] } => {
  const names = new Set(
    [...entries(ignored), ...leftOut].map((path) => path.split("/")[0] ?? path)
  );
  return {
    ignores: [...names].some((name) => !isSecretFileName(name)),
    ignoredSecrets: [...names].filter((name) => isSecretFileName(name)).sort(),
  };
};

/** A folder that is no repository, read through a throwaway one. */
const inspectPlain = async (
  path: string,
  base: Omit<
    MoveInspection,
    "bigFiles" | "bytes" | "lfs" | "uncommitted" | "ignores" | "ignoredSecrets"
  >
): Promise<MoveInspection> => {
  const scratch = join(
    cawcoDataDir(),
    "moves",
    `inspect-${crypto.randomUUID()}`
  );
  await makeFolder(scratch);
  try {
    await must(
      undefined,
      scratch,
      ["init", "-q", "--bare", "repo"],
      "git init failed"
    );
    const gitDir = [
      `--git-dir=${join(scratch, "repo")}`,
      `--work-tree=${path}`,
    ];
    const [listed, ignored] = await Promise.all([
      must(
        undefined,
        path,
        [...gitDir, "ls-files", "-o", "--exclude-standard", "-z"],
        "git could not list the folder"
      ),
      must(
        undefined,
        path,
        [
          ...gitDir,
          "ls-files",
          "-o",
          "-i",
          "--exclude-standard",
          "--directory",
          "-z",
        ],
        "git could not list the folder"
      ),
    ]);
    const all = entries(listed);
    const files = await sizes(
      path,
      all.filter((file) => !isSecretPath(file))
    );
    const big = files.filter((file) => file.bytes >= LARGE_FILE_BYTES);
    const tracked = await lfsTracked(
      path,
      big.map((file) => file.path),
      gitDir
    );
    const bigFiles = big.filter((file) => !tracked.has(file.path));
    return {
      ...base,
      bigFiles,
      bytes: files
        .filter((file) => file.bytes < LARGE_FILE_BYTES)
        .reduce((sum, file) => sum + file.bytes, 0),
      lfs: {
        files: big.length,
        bytes: big.reduce((sum, file) => sum + file.bytes, 0),
      },
      uncommitted: files.length,
      ...stayingAtRoot(ignored, all.filter(isSecretPath)),
    };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
};

/**
 * A folder as a move reads it: on the source what would move, on the target
 * what is there. `path` is absolute: the hub sends only a MachinePath.
 */
export const moveInspect = async (path: string): Promise<MoveInspection> => {
  // Read once no step that may make it a repository is under way in it.
  await placeSettled(path);
  const info = await stat(path).catch(() => undefined);
  const base = {
    path,
    home: homedir(),
    exists: info?.isDirectory() ?? false,
    empty: info?.isDirectory() ? (await readdir(path)).length === 0 : false,
    isGit: false,
    head: null,
    root: null,
    branch: null,
    origin: null,
    originCredential: false,
    pushed: false,
  };
  const none = {
    ...base,
    bigFiles: [],
    bytes: 0,
    lfs: { files: 0, bytes: 0 },
    uncommitted: 0,
    ignores: false,
    ignoredSecrets: [],
  };
  if (!base.exists || base.empty) {
    return none;
  }
  if (!(await exists(join(path, ".git")))) {
    return inspectPlain(path, base);
  }
  const [head, branch, remote, root] = await Promise.all([
    maybe(path, ["rev-parse", "-q", "--verify", "HEAD^{commit}"]),
    maybe(path, ["symbolic-ref", "-q", "--short", "HEAD"]),
    maybe(path, ["remote", "get-url", "origin"]),
    maybe(path, ["rev-list", "--max-parents=0", "--first-parent", "HEAD"]),
  ]);
  // A credential in the URL stays here ({@link moveRemoteCredential}).
  const bare = remote ? remoteWithoutCredential(remote) : undefined;
  const origin = bare?.url ?? null;
  const [status, ignored, counted, onRemote] = await Promise.all([
    must(
      undefined,
      path,
      ["status", "--porcelain=v1", "-z", "-uall", "--no-renames"],
      "git status failed"
    ),
    must(
      undefined,
      path,
      ["ls-files", "-o", "-i", "--exclude-standard", "--directory", "-z"],
      "git could not list ignored files"
    ),
    must(
      undefined,
      path,
      ["count-objects", "-v"],
      "git could not count objects"
    ),
    head && origin
      ? maybe(path, ["branch", "-r", "--contains", head, "--format=%(refname)"])
      : Promise.resolve(null),
  ]);
  const listedChanges = entries(status).map((entry) => entry.slice(3));
  const changed = listedChanges.filter((file) => !isSecretPath(file));
  // `git count-objects -v`: `size` (loose) and `size-pack`, in KiB.
  const counts = new Map(
    counted
      .split("\n")
      .map((line) => line.split(": "))
      .filter((pair): pair is [string, string] => pair.length === 2)
  );
  const bytes =
    (Number(counts.get("size-pack") ?? 0) + Number(counts.get("size") ?? 0)) *
    1024;
  const files = await sizes(path, changed);
  const big = files.filter((file) => file.bytes >= LARGE_FILE_BYTES);
  const tracked = await lfsTracked(
    path,
    big.map((file) => file.path)
  );
  const committed = head
    ? await pointersIn(path, head)
    : new Map<string, Pointed>();
  const bigFiles: MoveLargeFile[] = big.filter(
    (file) => !tracked.has(file.path)
  );
  return {
    ...base,
    isGit: true,
    head,
    root: root || null,
    branch,
    origin,
    originCredential: bare?.basic !== undefined,
    pushed: (onRemote ?? "")
      .split("\n")
      .some((ref) => ref.startsWith("refs/remotes/origin/")),
    bytes,
    bigFiles,
    lfs: {
      files: committed.size + big.length,
      bytes:
        total(committed).bytes + big.reduce((sum, file) => sum + file.bytes, 0),
    },
    uncommitted: changed.length,
    ...stayingAtRoot(ignored, listedChanges.filter(isSecretPath)),
  };
};

/**
 * The credential `path`'s `origin` URL carries, as HTTP Basic, read now for
 * one step on the target ({@link CONTROL_MOVE_REMOTE_CREDENTIAL}). A URL
 * that carries none any more fails: the step it was read for would fail
 * against the remote without it.
 */
export const moveRemoteCredential = async (
  path: string
): Promise<MoveRemoteAuth> => {
  const remote = await maybe(path, ["remote", "get-url", "origin"]);
  const basic = remote ? remoteWithoutCredential(remote).basic : undefined;
  if (!basic) {
    throw new StepFailed(
      `${basename(path)}'s origin no longer carries the credential it had when the move began.`
    );
  }
  return { remoteBasic: basic };
};

// ── Prepare (the approval's "Move it") ─────────────────────────────────────

/**
 * What "Move it" runs on the source: `git init` and one commit of the folder
 * as it is when it is no repository; its large files tracked by LFS first
 * either way. Ignored files stay out of the commit, as `.gitignore` says,
 * and so do secrets ({@link SECRETS_STAY}). It takes the folder's turn
 * (place-repo.ts `placeTurn`), so it never runs beside the place's own first
 * commit, and whether it inits is read from the folder in that turn, as
 * {@link moveInspect} reads it: a place made a repository since the plan
 * gets no second `git init` and no second first commit.
 */
export const movePrepare = (
  request: MovePrepareRequest
): Promise<{ commit: string | null }> =>
  runStep(PREPARE, request.jobId, (run) =>
    placeTurn(request.path, () => prepareNow(run, request))
  );

const prepareNow = async (
  run: Run,
  request: MovePrepareRequest
): Promise<{ commit: string | null }> => {
  const { path } = request;
  const env = plainEnv(LFS_FILTERS);
  const gitInit = !(await exists(join(path, ".git")));
  if (gitInit) {
    // The rule every first commit keeps (place-repo.ts): no home or cache folder.
    const refused = notAProject(path);
    if (refused) {
      throw new StepFailed(refused);
    }
    await must(run, path, ["init", "-q"], "git init failed", env);
  }
  if (request.bigFiles.length > 0) {
    const tracking = await exec(
      run,
      ["git", "lfs", "track", "--filename", "--", ...request.bigFiles],
      { cwd: path, env }
    );
    if (tracking.code !== 0) {
      throw new StepFailed(
        "Git LFS could not track the large files",
        lastLine(tracking.stderr) || lastLine(tracking.stdout)
      );
    }
    await must(
      run,
      path,
      ["lfs", "install", "--local"],
      "Git LFS could not be set up in the folder",
      env
    );
  }
  if (!gitInit) {
    return { commit: null };
  }
  await must(
    run,
    path,
    ["add", "-A", "--", ".", ...SECRETS_STAY],
    "git add failed",
    env
  );
  await must(
    run,
    path,
    [
      "commit",
      "-q",
      "--no-verify",
      "-m",
      "The folder as it was when CawCo first moved it",
    ],
    "git commit failed",
    { ...env, ...CAWCO_IDENTITY() }
  );
  return { commit: await maybe(path, ["rev-parse", "HEAD"]) };
};

// ── Snapshot ───────────────────────────────────────────────────────────────

/**
 * The source's work, committed off to the side and pushed to the hub as
 * `branch`, without touching its working tree or index: a copy of its index
 * (`GIT_INDEX_FILE`) takes every tracked change and every untracked file
 * that is not ignored, `write-tree`, `commit-tree -p HEAD`. Nothing
 * uncommitted: the snapshot is HEAD itself. For a project the hub is the
 * remote of, its large files go to the hub's LFS first.
 */
/** The tree of everything that moves, written through a copy of the folder's index. */
const snapshotTree = async (
  run: Run,
  path: string,
  index: string,
  base: string | null
): Promise<string> => {
  const realIndex = (
    await must(
      run,
      path,
      ["rev-parse", "--path-format=absolute", "--git-path", "index"],
      "git could not find the index"
    )
  ).trim();
  await rm(index, { force: true });
  // A copy keeps the index's stat cache, so unchanged files are not hashed again.
  await copyFile(realIndex, index).catch(() => undefined);
  const env = { ...plainEnv(LFS_FILTERS), GIT_INDEX_FILE: index };
  if (base && !(await exists(realIndex))) {
    await must(run, path, ["read-tree", base], "git read-tree failed", env);
  }
  await must(
    run,
    path,
    ["add", "-A", "--", ".", ...SECRETS_STAY],
    "git could not take the work in the folder",
    env
  );
  return (
    await must(run, path, ["write-tree"], "git write-tree failed", env)
  ).trim();
};

/** The snapshot commit over `base` and how many files it changes; `base` itself when nothing did. */
const snapshotCommit = async (
  run: Run,
  path: string,
  tree: string,
  base: string | null
): Promise<{ commit: string; files: number }> => {
  const baseTree = base
    ? await maybe(path, ["rev-parse", `${base}^{tree}`])
    : null;
  if (base && tree === baseTree) {
    return { commit: base, files: 0 };
  }
  const commit = (
    await must(
      run,
      path,
      [
        "commit-tree",
        tree,
        ...(base ? ["-p", base] : []),
        "-m",
        `CawCo move snapshot of ${basename(path)}`,
      ],
      "git commit-tree failed",
      { ...plainEnv(), ...CAWCO_IDENTITY() }
    )
  ).trim();
  const changed = await must(
    run,
    path,
    base
      ? ["diff", "--name-only", "-z", "--no-renames", base, commit]
      : ["ls-tree", "-r", "--name-only", "-z", commit],
    "git diff failed"
  );
  return { commit, files: entries(changed).length };
};

/**
 * The large files `commit` points at that its folder's `origin` does not
 * have: those not in the tree of the newest commit `origin` holds of this
 * history (`git merge-base HEAD <origin's refs>`: the best common ancestor
 * of HEAD and every branch of `origin`, git-merge-base(1)). Every one, when
 * `origin` holds none of it.
 */
const outsideNewLfs = async (
  path: string,
  commit: string
): Promise<MoveLfsObject[]> => {
  const refs = entries(
    (await maybe(path, [
      "for-each-ref",
      "--format=%(objectname)%00",
      "refs/remotes/origin/",
    ])) ?? ""
  ).map((ref) => ref.trim());
  const pushed =
    refs.length > 0 ? await maybe(path, ["merge-base", "HEAD", ...refs]) : null;
  const [mine, theirs] = await Promise.all([
    pointersIn(path, commit),
    pushed
      ? pointersIn(path, pushed)
      : Promise.resolve(new Map<string, Pointed>()),
  ]);
  return [...mine]
    .filter(([oid]) => !theirs.has(oid))
    .map(([oid, { size, path: file }]) => ({ oid, size, path: file }));
};

/**
 * The hub repository a snapshot of the folder at `path` goes to: the one its
 * `origin` names when that is the hub's, else the one the folder is in
 * project `projectId` (git/hub-remote.ts {@link hubRepoOf}), so an unrelated
 * repository's snapshot never lands among the main one's branches.
 */
const snapshotRepo = async (
  path: string,
  projectId: string
): Promise<HubRepoKey> => {
  const origin = await maybe(path, ["remote", "get-url", "origin"]);
  const named = origin ? hubRepoOfUrl(origin) : undefined;
  return (
    named ??
    (await hubRepoOf(path, projectId, Date.now() + WORKSPACE_GIT_TIMEOUT_MS))
  );
};

/** The hub repository a move's commit is on; a move from an outside remote with no snapshot has none. */
const hubOf = (snapshot: MoveSnapshotResult): HubRepoKey => {
  if (!snapshot.hub) {
    throw new StepFailed(
      "Nothing of this move is on the hub: its commit is on the folder's own remote."
    );
  }
  return snapshot.hub;
};

export const moveSnapshot = (
  request: MoveSnapshotRequest
): Promise<MoveSnapshotResult> =>
  runStep(SNAPSHOT, request.jobId, async (run) => {
    const { path, branch } = request;
    const scratch = scratchOf(request.jobId);
    await makeFolder(scratch);
    try {
      const [base, sourceBranch] = await Promise.all([
        maybe(path, ["rev-parse", "-q", "--verify", "HEAD^{commit}"]),
        maybe(path, ["symbolic-ref", "-q", "--short", "HEAD"]),
      ]);
      const tree = await snapshotTree(run, path, join(scratch, "index"), base);
      const { commit, files } = await snapshotCommit(run, path, tree, base);
      if (!base && files === 0) {
        throw new StepFailed(
          `${basename(path)} has no commits and no files to move.`
        );
      }
      const hub = await snapshotRepo(path, request.hub.projectId);
      const remote = hubRepo(hub);
      const auth = hubEnv(hub, LFS_FILTERS);
      const hubLfs =
        request.remote === "outside"
          ? await outsideNewLfs(path, commit)
          : undefined;
      // The hub's own project: its large files with their history. An
      // outside remote's: only the ones the snapshot adds.
      const lfsPush = hubLfs
        ? [
            "git",
            "lfs",
            "push",
            "--object-id",
            remote,
            ...hubLfs.map((object) => object.oid),
          ]
        : ["git", "lfs", "push", remote, commit];
      if (!hubLfs || hubLfs.length > 0) {
        const pushed = await exec(run, lfsPush, { cwd: path, env: auth });
        if (pushed.code !== 0) {
          throw new StepFailed(
            "The large files could not go to the hub",
            lastLine(pushed.stderr) || lastLine(pushed.stdout)
          );
        }
      }
      // `--no-verify`: the folder's own pre-push hooks are for its own pushes.
      await must(
        run,
        path,
        [
          "push",
          "--no-verify",
          "-q",
          remote,
          `+${commit}:refs/heads/${branch}`,
        ],
        "The snapshot could not be pushed to the hub",
        auth
      );
      return {
        base,
        branch,
        commit,
        files,
        hub,
        sourceBranch,
        ...(hubLfs ? { hubLfs } : {}),
      };
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  });

// ── Clone ──────────────────────────────────────────────────────────────────

const PROGRESS_BYTES = /(\d+(?:\.\d+)?)\s*(bytes|KiB|MiB|GiB)/gu;
const UNIT: Record<string, number> = {
  bytes: 1,
  KiB: 1024,
  MiB: 1024 ** 2,
  GiB: 1024 ** 3,
};

/** The marker a finished clone carries, so a hub that missed the answer finds it done. */
const MARKER = "cawco-move";

/** The place the clone is made before it takes its name. */
const cloneScratch = (path: string, jobId: string): string =>
  join(dirname(path), `.${basename(path)}.cawco-move-${jobId.slice(0, 8)}`);

/**
 * Leaves the clone as the source stood: on the source's branch at its HEAD,
 * the snapshot's changes uncommitted and its new files untracked.
 */
const uncommit = async (
  run: Run | undefined,
  cwd: string,
  snapshot: MoveSnapshotResult
): Promise<void> => {
  const env = { ...plainEnv(), GIT_LFS_SKIP_SMUDGE: "1" };
  if (snapshot.base) {
    await must(
      run,
      cwd,
      ["reset", "-q", "--mixed", snapshot.base],
      "git reset failed",
      env
    );
    return;
  }
  // The source had no commit yet: an unborn branch, every file untracked.
  await must(
    run,
    cwd,
    ["update-ref", "-d", "HEAD"],
    "git update-ref failed",
    env
  );
  await must(
    run,
    cwd,
    ["rm", "-r", "-q", "--cached", "--ignore-unmatch", "--", "."],
    "git rm failed",
    env
  );
};

/** The clone's large files: what the snapshot's tree points at. */
const lfsOf = (cwd: string, commit: string): Promise<MoveLfsResult> =>
  pointersIn(cwd, commit).then(total);

/**
 * The clone on the target: the free space checked, then `git clone
 * --no-checkout` from the project's remote (large files left as pointers),
 * its progress forwarded in bytes; the snapshot checked out as the source
 * stood. It is made beside the destination and takes its name when whole,
 * so a retry removes only this job's partial clone.
 */
/** git's clone progress as bytes received: "Receiving objects:  42% (3812/9071), 140.00 MiB | …". */
const receivedBytes = (text: string): number | undefined => {
  let bytes: number | undefined;
  for (const line of text.split("\r")) {
    if (line.includes("Receiving objects")) {
      const [first] = line.matchAll(PROGRESS_BYTES);
      if (first) {
        bytes = Math.round(Number(first[1]) * (UNIT[first[2]] ?? 1));
      }
    }
  }
  return bytes;
};

/**
 * The clone checked out as the source stood: the snapshot fetched from the
 * hub when it is not on the clone's remote, the source's branch at the
 * snapshot, LFS's filters when large files follow, then the snapshot's
 * changes left uncommitted.
 */
const checkOut = async (
  run: Run,
  clone: string,
  request: MoveCloneRequest,
  fromHub: boolean
): Promise<void> => {
  const { snapshot } = request;
  if (!fromHub && snapshot.branch) {
    // The snapshot is on the hub, not on the outside remote.
    await must(
      run,
      clone,
      [
        "fetch",
        "-q",
        "--no-tags",
        hubRepo(hubOf(snapshot)),
        `+refs/heads/${snapshot.branch}:refs/cawco/move`,
      ],
      "The snapshot could not be fetched from the hub",
      { ...hubEnv(hubOf(snapshot)), GIT_LFS_SKIP_SMUDGE: "1" }
    );
  }
  const quiet = { ...plainEnv(), GIT_LFS_SKIP_SMUDGE: "1" };
  await must(
    run,
    clone,
    snapshot.sourceBranch
      ? ["checkout", "-q", "-B", snapshot.sourceBranch, snapshot.commit]
      : ["checkout", "-q", "--detach", snapshot.commit],
    "git checkout failed",
    quiet
  );
  if (snapshot.sourceBranch) {
    // It tracks its remote's branch of the same name, as a clone's first
    // branch does, so a plain `git pull` there works once the remote has it
    // (the hub's remote gets it when a workspace is first cut from here).
    for (const [key, value] of [
      [`branch.${snapshot.sourceBranch}.remote`, "origin"],
      [
        `branch.${snapshot.sourceBranch}.merge`,
        `refs/heads/${snapshot.sourceBranch}`,
      ],
    ]) {
      await must(
        run,
        clone,
        ["config", key, value],
        "git config failed",
        quiet
      );
    }
  }
  if (request.lfs) {
    await must(
      run,
      clone,
      ["lfs", "install", "--local"],
      "Git LFS could not be set up in the clone",
      quiet
    );
  }
  await uncommit(run, clone, snapshot);
};

/** The destination is this job's finished clone already (a hub that missed the answer asks again). */
const clonedBefore = async (path: string, jobId: string): Promise<boolean> =>
  (
    await readFile(join(path, ".git", MARKER), "utf8").catch(() => "")
  ).trim() === jobId;

export const moveClone = (
  request: MoveCloneRequest,
  ports: Pick<AgentPorts, "moveProgress">
): Promise<MoveLfsResult> =>
  holdingRemote(request.remoteBasic, () => cloneStep(request, ports));

/**
 * The clone itself. An outside remote's URL carries no credential, so the
 * clone's `origin` is the bare URL; its credential, when it has one, reaches
 * git through the environment for this one command.
 */
const cloneStep = (
  request: MoveCloneRequest,
  { moveProgress }: Pick<AgentPorts, "moveProgress">
): Promise<MoveLfsResult> =>
  runStep(CLONE, request.jobId, async (run) => {
    const { path, jobId, snapshot } = request;
    if (await clonedBefore(path, jobId)) {
      return lfsOf(path, snapshot.commit);
    }
    const info = await stat(path).catch(() => undefined);
    if (info && !(info.isDirectory() && (await readdir(path)).length === 0)) {
      throw new StepFailed(
        `${request.display} on ${request.machine} is already a different folder. Pick another path.`
      );
    }
    const scratch = cloneScratch(path, jobId);
    await rm(scratch, { recursive: true, force: true });
    await makeFolder(dirname(path));
    await enoughSpace(dirname(path), request.bytes, request.machine);
    const fromHub = request.cloneUrl === undefined;
    const feed = throttled(moveProgress);
    let received = 0;
    try {
      const cloned = await exec(
        run,
        [
          "git",
          "clone",
          "--progress",
          "--no-checkout",
          request.cloneUrl ?? hubRepo(hubOf(snapshot)),
          scratch,
        ],
        {
          cwd: dirname(path),
          env: {
            ...(request.cloneUrl === undefined
              ? hubEnv(hubOf(snapshot))
              : outsideEnv(request.cloneUrl, request.remoteBasic)),
            GIT_LFS_SKIP_SMUDGE: "1",
          },
          onStderr: (text) => {
            received = receivedBytes(text) ?? received;
            feed.push({
              kind: "move_progress",
              jobId,
              stage: "clone",
              bytes: received,
              total: Math.max(request.bytes, received),
            });
          },
        }
      );
      feed.end();
      if (cloned.code !== 0) {
        throw new StepFailed(
          fromHub ? "Cloning from the hub failed" : "Fetching failed",
          lastLine(cloned.stderr)
        );
      }
      await checkOut(run, scratch, request, fromHub);
      if (fromHub) {
        // Its origin is the hub: a plain `git pull` there authenticates.
        useHubCredentialHelper(scratch);
      }
      const lfs = await lfsOf(scratch, snapshot.commit);
      await writeStateFile(join(scratch, ".git", MARKER), `${jobId}\n`);
      if (info) {
        await rm(path, { recursive: true, force: true });
      }
      await rename(scratch, path);
      const whole = Math.max(received, request.bytes);
      moveProgress({
        kind: "move_progress",
        jobId,
        stage: "clone",
        bytes: whole,
        total: whole,
      });
      return lfs;
    } catch (error) {
      // A partial clone cannot be resumed; it goes, on a failure or a Cancel alike.
      await rm(scratch, { recursive: true, force: true });
      throw error;
    }
  });

// ── Large files ────────────────────────────────────────────────────────────

/** Bytes of `oids` already in the clone's LFS store. */
const fetchedBytes = async (
  cwd: string,
  wanted: Map<string, Pointed>
): Promise<number> => {
  const lfsDir = (
    await must(
      undefined,
      cwd,
      ["rev-parse", "--path-format=absolute", "--git-path", "lfs/objects"],
      "git could not find the LFS store"
    )
  ).trim();
  const present = await Promise.all(
    [...wanted].map(async ([oid, { size }]) =>
      (await exists(join(lfsDir, oid.slice(0, 2), oid.slice(2, 4), oid)))
        ? size
        : 0
    )
  );
  return present.reduce((sum, size) => sum + size, 0);
};

/** One `GIT_LFS_PROGRESS` line: `<direction> <current>/<total files> <downloaded>/<total> <name>`. */
const LFS_PROGRESS_LINE = /^\w+ \d+\/\d+ (\d+)\/(\d+) (.+)$/u;

/**
 * Follows git-lfs's progress file from where it was last read: each file's
 * latest `<downloaded>/<total>`, by name.
 */
const progressTail = (progressFile: string) => {
  const files = new Map<string, { bytes: number; total: number }>();
  let offset = 0;
  let carry = "";
  return {
    files,
    async read(): Promise<void> {
      const file = Bun.file(progressFile);
      const size = await file.exists().then((there) => (there ? file.size : 0));
      if (size <= offset) {
        return;
      }
      const lines = (carry + (await file.slice(offset, size).text())).split(
        "\n"
      );
      offset = size;
      carry = lines.pop() ?? "";
      for (const line of lines) {
        const match = LFS_PROGRESS_LINE.exec(line.trim());
        if (match) {
          files.set(match[3], {
            bytes: Number(match[1]),
            total: Number(match[2]),
          });
        }
      }
    },
  };
};

/** The largest file of at least {@link LARGE_FILE_BYTES} still in flight, as the pane names it. */
const largestInFlight = (
  files: Map<string, { bytes: number; total: number }>
): MoveProgressFrame["file"] => {
  const [largest] = [...files]
    .filter(
      ([, file]) => file.bytes < file.total && file.total >= LARGE_FILE_BYTES
    )
    .sort((a, b) => b[1].total - a[1].total);
  return largest
    ? { file: largest[0], bytes: largest[1].bytes, total: largest[1].total }
    : undefined;
};

/**
 * One large file fetched from the hub's LFS store into the clone's own:
 * `git lfs smudge` of its pointer with the hub as the LFS server (`lfs.url`,
 * env-only, {@link hubGitEnv}), which downloads the object into the clone's store, resuming a
 * partial one with `Range` as any git-lfs download does. The content it
 * writes out is not wanted; the pull after checks the file out.
 */
const fromHubLfs = async (
  run: Run,
  cwd: string,
  hub: HubRepoKey,
  object: MoveLfsObject,
  progressFile: string
): Promise<void> => {
  const ran = await exec(run, ["git", "lfs", "smudge", "--", object.path], {
    cwd,
    discardStdout: true,
    input: `version https://git-lfs.github.com/spec/v1\noid sha256:${object.oid}\nsize ${object.size}\n`,
    env: {
      ...hubEnv(hub),
      GIT_LFS_PROGRESS: progressFile,
    },
  });
  if (ran.code !== 0) {
    throw new StepFailed(
      `Downloading ${object.path} from the hub failed`,
      lastLine(ran.stderr)
    );
  }
};

/**
 * The large files: free space checked against what is still to fetch, then
 * `git lfs pull` with `GIT_LFS_PROGRESS` pointed at a file in the job's
 * scratch folder, tailed and forwarded as bytes. Objects already fetched
 * stay, and a file cut off part way resumes where it stopped (git-lfs asks
 * with `Range`). The snapshot is checked out for the pull, so its new large
 * files come too, and the clone is left as the source stood after. For an
 * outside remote's project, the files its snapshot added are on the hub,
 * not on that remote: they come from the hub first, and the pull from the
 * remote finds them already here.
 */
export const moveLfs = (
  request: MoveLfsRequest,
  ports: Pick<AgentPorts, "moveProgress">
): Promise<MoveLfsResult> =>
  holdingRemote(request.remoteBasic, () => lfsStep(request, ports));

/** git's environment for the pull: the hub's, or the clone's own `origin` with its credential. */
const pullEnv = async (
  request: MoveLfsRequest
): Promise<Record<string, string>> => {
  if (request.fromHub) {
    return hubEnv(hubOf(request.snapshot));
  }
  const origin = await must(
    undefined,
    request.path,
    ["remote", "get-url", "origin"],
    "The clone has no origin to fetch large files from"
  );
  return outsideEnv(origin.trim(), request.remoteBasic);
};

const lfsStep = (
  request: MoveLfsRequest,
  { moveProgress }: Pick<AgentPorts, "moveProgress">
): Promise<MoveLfsResult> =>
  runStep(LFS, request.jobId, async (run) => {
    const { path, jobId, snapshot } = request;
    const wanted = await pointersIn(path, snapshot.commit);
    const stage = total(wanted);
    const before = await fetchedBytes(path, wanted);
    await enoughSpace(path, stage.bytes - before, request.machine);
    const scratch = scratchOf(jobId);
    await makeFolder(scratch);
    const progressFile = join(scratch, "lfs-progress");
    await rm(progressFile, { force: true });
    const env = {
      ...(await pullEnv(request)),
      GIT_LFS_PROGRESS: progressFile,
    };
    const feed = throttled(moveProgress);
    const progress = progressTail(progressFile);
    const tail = async () => {
      await progress.read();
      const done = [...progress.files.values()].reduce(
        (sum, one) => sum + one.bytes,
        0
      );
      const file = largestInFlight(progress.files);
      feed.push({
        kind: "move_progress",
        jobId,
        stage: "lfs",
        bytes: Math.min(stage.bytes, before + done),
        total: stage.bytes,
        ...(file ? { file } : {}),
      });
    };
    const ticker = setInterval(() => {
      tail().catch(() => undefined);
    }, 250);
    try {
      // The snapshot's tree, so its new large files are pulled and checked out too.
      await must(
        run,
        path,
        ["reset", "-q", "--mixed", snapshot.commit],
        "git reset failed",
        { ...plainEnv(), GIT_LFS_SKIP_SMUDGE: "1" }
      );
      for (const object of snapshot.hubLfs ?? []) {
        await fromHubLfs(run, path, hubOf(snapshot), object, progressFile);
      }
      const pulled = await exec(run, ["git", "lfs", "pull"], {
        cwd: path,
        env,
      });
      clearInterval(ticker);
      await tail();
      feed.end();
      if (pulled.code !== 0) {
        throw new StepFailed(
          "Downloading large files failed",
          lastLine(pulled.stderr) || lastLine(pulled.stdout)
        );
      }
      moveProgress({
        kind: "move_progress",
        jobId,
        stage: "lfs",
        bytes: stage.bytes,
        total: stage.bytes,
      });
      return stage;
    } finally {
      clearInterval(ticker);
      await uncommit(undefined, path, snapshot).catch(() => undefined);
      await rm(scratch, { recursive: true, force: true });
    }
  });
