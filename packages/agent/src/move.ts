/**
 * A project move's steps on this machine (core move.ts; the hub drives the
 * job). Each step runs here as git and the tools would run in a terminal,
 * once per job at a time: the hub asking again for a step already running
 * (it restarted, or this machine's socket came back) waits on the same run,
 * and a step that already succeeded answers what it found. A failed step is
 * not kept: asked again, it runs again.
 *
 * The hub's git remote is reached with this machine's credential, which the
 * hub hands over in the register ack and which lives only in this module's
 * memory: git gets it per command through env-only config
 * (`GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_n`/`GIT_CONFIG_VALUE_n`), so nothing is
 * written to disk, and it never reaches a session's environment. Anything a
 * step says back (git's last line) has it removed first.
 */

import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  statfs,
} from "node:fs/promises";
import { homedir, hostname } from "node:os";
import { basename, dirname, join } from "node:path";
import {
  CAWCO_ENV,
  FREE_SPACE_MARGIN,
  LARGE_FILE_BYTES,
  LOCKFILES,
  type MoveCloneRequest,
  type MoveInspection,
  type MoveInstallRequest,
  type MoveLargeFile,
  type MoveLfsObject,
  type MoveLfsRequest,
  type MoveLfsResult,
  type MovePrepareRequest,
  type MoveProgressFrame,
  type MoveRemoteAuth,
  type MoveSnapshotRequest,
  type MoveSnapshotResult,
} from "@cawco/core";
import { cawcoDataDir, isSecretFileName } from "@cawco/core/paths";
import { hostEnvironment } from "@cawco/core/session-env";
import type { Subprocess } from "bun";

// ── The hub's git remote ───────────────────────────────────────────────────

/** This machine's credential for the hub's git remote, from the last register ack. */
let hubCredential: { machineId: string; credential: string } | undefined;

/** Takes the credential a register ack carries; the one before it stops working at the hub. */
export const setHubCredential = (
  machineId: string,
  credential: string | undefined
): void => {
  hubCredential = credential ? { machineId, credential } : undefined;
};

/** Where progress frames go: the daemon's socket. */
let sendProgress: (frame: MoveProgressFrame) => void = () => undefined;
export const setMoveProgress = (
  send: (frame: MoveProgressFrame) => void
): void => {
  sendProgress = send;
};

/** The hub's HTTP origin, from the socket address this daemon is connected on. */
const hubOrigin = (): string => {
  const ws = process.env[CAWCO_ENV.hubUrl];
  if (!ws) {
    throw new Error("This machine is not connected to a hub.");
  }
  const url = new URL(ws);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  return url.origin;
};

/** The project's repository on the hub. */
const hubRepo = (projectId: string): string =>
  `${hubOrigin()}/git/${projectId}.git`;

const basicOf = (): string => {
  if (!hubCredential) {
    throw new Error(
      "This machine has no credential for the hub's git remote yet: it gets one each time it registers."
    );
  }
  const { machineId, credential } = hubCredential;
  return Buffer.from(`${machineId}:${credential}`).toString("base64");
};

/**
 * An outside remote's credentials held by the steps running now
 * ({@link holdingRemote}), each with how many hold it: taken out of
 * anything a step says.
 */
const remoteSecrets = new Map<string, number>();

/** Every form a credential could take in text a tool printed. */
const secretsOf = (): string[] => [
  ...(hubCredential ? [hubCredential.credential, basicOf()] : []),
  ...remoteSecrets.keys(),
];

/**
 * A remote's URL with any credential it carries taken off, and that
 * credential as HTTP Basic (base64 of `user:password`, decoded from the
 * URL's percent-encoding). Only http(s) URLs carry one: `ssh://git@…` and
 * `git@host:…` name an ssh login, not a secret, and stay as they are.
 */
export const remoteWithoutCredential = (
  remote: string
): { url: string; basic?: string } => {
  let parsed: URL;
  try {
    parsed = new URL(remote);
  } catch {
    return { url: remote };
  }
  if (
    !(
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      (parsed.username || parsed.password)
    )
  ) {
    return { url: remote };
  }
  const pair = `${decodeURIComponent(parsed.username)}:${decodeURIComponent(parsed.password)}`;
  parsed.username = "";
  parsed.password = "";
  return {
    url: parsed.toString(),
    basic: Buffer.from(pair).toString("base64"),
  };
};

/**
 * `work` with an outside remote's credential taken out of all it says, for
 * as long as it runs: the Basic value and each part of what it decodes to.
 */
const holdingRemote = async <T>(
  basic: string | undefined,
  work: () => Promise<T>
): Promise<T> => {
  if (!basic) {
    return await work();
  }
  const held = [
    basic,
    ...Buffer.from(basic, "base64")
      .toString()
      .split(":")
      .filter((part) => part.length >= 4),
  ];
  for (const secret of held) {
    remoteSecrets.set(secret, (remoteSecrets.get(secret) ?? 0) + 1);
  }
  try {
    return await work();
  } finally {
    for (const secret of held) {
      const left = (remoteSecrets.get(secret) ?? 1) - 1;
      if (left > 0) {
        remoteSecrets.set(secret, left);
      } else {
        remoteSecrets.delete(secret);
      }
    }
  }
};

const AUTHORIZATION_VALUE = /(authorization:\s*\w+\s+)\S+/gi;

/** `text` with the credential and any `Authorization` value taken out. */
export const withoutCredential = (text: string): string => {
  let clean = text.replace(AUTHORIZATION_VALUE, "$1[hidden]");
  for (const secret of secretsOf()) {
    clean = clean.split(secret).join("[hidden]");
  }
  return clean;
};

/**
 * Config git and git-lfs read from the environment alone, appended after any
 * the daemon already carries. Large-file filters are named so a snapshot's
 * clean filter runs in a repository whose LFS hooks were never installed.
 */
const configEnv = (pairs: [string, string][]): Record<string, string> => {
  const first = Number.parseInt(process.env.GIT_CONFIG_COUNT ?? "0", 10) || 0;
  const env: Record<string, string> = {
    GIT_CONFIG_COUNT: String(first + pairs.length),
  };
  pairs.forEach(([key, value], index) => {
    env[`GIT_CONFIG_KEY_${first + index}`] = key;
    env[`GIT_CONFIG_VALUE_${first + index}`] = value;
  });
  return env;
};

const LFS_FILTERS: [string, string][] = [
  ["filter.lfs.clean", "git-lfs clean -- %f"],
  ["filter.lfs.smudge", "git-lfs smudge -- %f"],
  ["filter.lfs.process", "git-lfs filter-process"],
  ["filter.lfs.required", "true"],
];

/** git's environment for a command that reaches the hub's repository of `projectId`. */
const hubEnv = (
  projectId: string,
  extra: [string, string][] = []
): Record<string, string> => {
  const origin = hubOrigin();
  return {
    ...hostEnvironment(),
    GIT_TERMINAL_PROMPT: "0",
    GIT_OPTIONAL_LOCKS: "0",
    ...configEnv([
      [`http.${origin}/git/.extraHeader`, `Authorization: Basic ${basicOf()}`],
      // git-lfs asks a server about locks before a push and writes what it
      // hears into the repository's config; the hub has no locks.
      [`lfs.${hubRepo(projectId)}/info/lfs.locksverify`, "false"],
      ...extra,
    ]),
  } as Record<string, string>;
};

/**
 * git's environment for anything else. `GIT_OPTIONAL_LOCKS=0`: a read
 * (`git status`) leaves the folder's index as it found it, byte for byte.
 */
const plainEnv = (extra: [string, string][] = []): Record<string, string> =>
  ({
    ...hostEnvironment(),
    GIT_TERMINAL_PROMPT: "0",
    GIT_OPTIONAL_LOCKS: "0",
    ...configEnv(extra),
  }) as Record<string, string>;

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

/** The step running for each job here. */
const runs = new Map<string, Run>();
/** What each job's steps answered, kept so a hub that missed the answer hears it. */
const answered = new Map<string, { at: number; result: unknown }>();
const ANSWER_KEPT_MS = 60 * 60 * 1000;

const runStep = <T>(
  jobId: string,
  stage: string,
  work: (run: Run) => Promise<T>
): Promise<T> => {
  const running = runs.get(jobId);
  const job = jobId.slice(0, 8);
  if (running?.stage === stage) {
    console.info(
      `[move] ${job} ${stage}: asked again, waiting on the run in flight`
    );
    return running.promise as Promise<T>;
  }
  if (running) {
    return Promise.reject(
      new StepFailed(
        `This machine is still at the move's ${running.stage} step.`
      )
    );
  }
  const key = `${jobId}:${stage}`;
  const kept = answered.get(key);
  if (kept && Date.now() - kept.at < ANSWER_KEPT_MS) {
    return Promise.resolve(kept.result as T);
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
      answered.set(key, { at: Date.now(), result });
      console.info(`[move] ${job} ${stage}: done`);
      return result;
    } catch (error) {
      console.warn(
        `[move] ${job} ${stage}: ${run.cancelled ? "cancelled" : `failed: ${withoutCredential(error instanceof Error ? error.message : String(error)).replaceAll("\n", " — ")}`}`
      );
      throw error;
    } finally {
      runs.delete(jobId);
    }
  })();
  run.promise = promise;
  runs.set(jobId, run);
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

const LINE_BREAKS = /[\r\n]+/;

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
  /^version https:\/\/git-lfs\.github\.com\/spec\/v1\n(?:.*\n)*?oid sha256:([0-9a-f]{64})\n(?:.*\n)*?size (\d+)\n?/;
/** A pointer file is about 130 bytes; nothing past this is one. */
const POINTER_MAX = 1024;
const WHITESPACE = /\s+/;

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

const lockfileAt = async (path: string): Promise<string | null> => {
  for (const name of LOCKFILES) {
    // biome-ignore lint/performance/noAwaitInLoops: the first lockfile found picks the install
    if (await exists(join(path, name))) {
      return name;
    }
  }
  return null;
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
  await mkdir(scratch, { recursive: true });
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
 * what is there. `~/…` is under this machine's home.
 */
export const moveInspect = async (asked: string): Promise<MoveInspection> => {
  const path = asked.startsWith("~/") ? join(homedir(), asked.slice(2)) : asked;
  const info = await stat(path).catch(() => undefined);
  const base = {
    path,
    home: homedir(),
    exists: info?.isDirectory() ?? false,
    empty: info?.isDirectory() ? (await readdir(path)).length === 0 : false,
    isGit: false,
    head: null,
    branch: null,
    origin: null,
    originCredential: false,
    pushed: false,
    lockfile: null,
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
  const lockfile = await lockfileAt(path);
  if (!(await exists(join(path, ".git")))) {
    return inspectPlain(path, { ...base, lockfile });
  }
  const [head, branch, remote] = await Promise.all([
    maybe(path, ["rev-parse", "-q", "--verify", "HEAD^{commit}"]),
    maybe(path, ["symbolic-ref", "-q", "--short", "HEAD"]),
    maybe(path, ["remote", "get-url", "origin"]),
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
    branch,
    origin,
    originCredential: bare?.basic !== undefined,
    lockfile,
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
  asked: string
): Promise<MoveRemoteAuth> => {
  const path = asked.startsWith("~/") ? join(homedir(), asked.slice(2)) : asked;
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
 * as it is when it was no repository; its large files tracked by LFS first
 * either way. Ignored files stay out of the commit, as `.gitignore` says,
 * and so do secrets ({@link SECRETS_STAY}).
 */
export const movePrepare = (
  request: MovePrepareRequest
): Promise<{ commit: string | null }> =>
  runStep(request.jobId, "prepare", async (run) => {
    const { path } = request;
    const env = plainEnv(LFS_FILTERS);
    if (request.gitInit) {
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
    if (!request.gitInit) {
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
  });

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

export const moveSnapshot = (
  request: MoveSnapshotRequest
): Promise<MoveSnapshotResult> =>
  runStep(request.jobId, "snapshot", async (run) => {
    const { path, branch } = request;
    const scratch = scratchOf(request.jobId);
    await mkdir(scratch, { recursive: true });
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
      const remote = hubRepo(request.hub.projectId);
      const auth = hubEnv(request.hub.projectId, LFS_FILTERS);
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
        sourceBranch,
        ...(hubLfs ? { hubLfs } : {}),
      };
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  });

// ── Clone ──────────────────────────────────────────────────────────────────

const PROGRESS_BYTES = /(\d+(?:\.\d+)?)\s*(bytes|KiB|MiB|GiB)/g;
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
  const { snapshot, hub } = request;
  if (!fromHub && snapshot.branch) {
    // The snapshot is on the hub, not on the outside remote.
    await must(
      run,
      clone,
      [
        "fetch",
        "-q",
        "--no-tags",
        hubRepo(hub.projectId),
        `+refs/heads/${snapshot.branch}:refs/cawco/move`,
      ],
      "The snapshot could not be fetched from the hub",
      { ...hubEnv(hub.projectId), GIT_LFS_SKIP_SMUDGE: "1" }
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

export const moveClone = (request: MoveCloneRequest): Promise<MoveLfsResult> =>
  holdingRemote(request.remoteBasic, () => cloneStep(request));

/**
 * The clone itself. An outside remote's URL carries no credential, so the
 * clone's `origin` is the bare URL; its credential, when it has one, reaches
 * git through the environment for this one command.
 */
const cloneStep = (request: MoveCloneRequest): Promise<MoveLfsResult> =>
  runStep(request.jobId, "clone", async (run) => {
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
    await mkdir(dirname(path), { recursive: true });
    await enoughSpace(dirname(path), request.bytes, request.machine);
    const fromHub = request.cloneUrl === undefined;
    const feed = throttled(sendProgress);
    let received = 0;
    try {
      const cloned = await exec(
        run,
        [
          "git",
          "clone",
          "--progress",
          "--no-checkout",
          request.cloneUrl ?? hubRepo(request.hub.projectId),
          scratch,
        ],
        {
          cwd: dirname(path),
          env: {
            ...(request.cloneUrl === undefined
              ? hubEnv(request.hub.projectId)
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
      const lfs = await lfsOf(scratch, snapshot.commit);
      await Bun.write(join(scratch, ".git", MARKER), `${jobId}\n`);
      if (info) {
        await rm(path, { recursive: true, force: true });
      }
      await rename(scratch, path);
      const whole = Math.max(received, request.bytes);
      sendProgress({
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
const LFS_PROGRESS_LINE = /^\w+ \d+\/\d+ (\d+)\/(\d+) (.+)$/;

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
 * env-only), which downloads the object into the clone's store, resuming a
 * partial one with `Range` as any git-lfs download does. The content it
 * writes out is not wanted; the pull after checks the file out.
 */
const fromHubLfs = async (
  run: Run,
  cwd: string,
  projectId: string,
  object: MoveLfsObject,
  progressFile: string
): Promise<void> => {
  const ran = await exec(run, ["git", "lfs", "smudge", "--", object.path], {
    cwd,
    discardStdout: true,
    input: `version https://git-lfs.github.com/spec/v1\noid sha256:${object.oid}\nsize ${object.size}\n`,
    env: {
      ...hubEnv(projectId, [["lfs.url", `${hubRepo(projectId)}/info/lfs`]]),
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
export const moveLfs = (request: MoveLfsRequest): Promise<MoveLfsResult> =>
  holdingRemote(request.remoteBasic, () => lfsStep(request));

/** git's environment for the pull: the hub's, or the clone's own `origin` with its credential. */
const pullEnv = async (
  request: MoveLfsRequest
): Promise<Record<string, string>> => {
  if (request.fromHub) {
    return hubEnv(request.hub.projectId);
  }
  const origin = await must(
    undefined,
    request.path,
    ["remote", "get-url", "origin"],
    "The clone has no origin to fetch large files from"
  );
  return outsideEnv(origin.trim(), request.remoteBasic);
};

const lfsStep = (request: MoveLfsRequest): Promise<MoveLfsResult> =>
  runStep(request.jobId, "lfs", async (run) => {
    const { path, jobId, snapshot } = request;
    const wanted = await pointersIn(path, snapshot.commit);
    const stage = total(wanted);
    const before = await fetchedBytes(path, wanted);
    await enoughSpace(path, stage.bytes - before, request.machine);
    const scratch = scratchOf(jobId);
    await mkdir(scratch, { recursive: true });
    const progressFile = join(scratch, "lfs-progress");
    await rm(progressFile, { force: true });
    const env = {
      ...(await pullEnv(request)),
      GIT_LFS_PROGRESS: progressFile,
    };
    const feed = throttled(sendProgress);
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
        // biome-ignore lint/performance/noAwaitInLoops: one download after another, each resumable on its own
        await fromHubLfs(
          run,
          path,
          request.hub.projectId,
          object,
          progressFile
        );
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
      sendProgress({
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

// ── Install ────────────────────────────────────────────────────────────────

/** The dependencies, by the lockfile's own tool; its last line when it fails. */
export const moveInstall = (
  request: MoveInstallRequest
): Promise<{ ok: true }> =>
  runStep(request.jobId, "install", async (run) => {
    let ran: Ran;
    try {
      ran = await exec(run, request.argv, {
        cwd: request.path,
        env: plainEnv(),
      });
    } catch (error) {
      if (error instanceof MoveCancelled) {
        throw error;
      }
      // biome-ignore lint/style/useErrorCause: StepFailed takes the cause as its third argument, after the tool's line
      throw new StepFailed(
        "Installing dependencies failed",
        error instanceof Error ? error.message : String(error),
        { cause: error }
      );
    }
    if (ran.code !== 0) {
      throw new StepFailed(
        "Installing dependencies failed",
        lastLine(ran.stderr) ||
          lastLine(ran.stdout) ||
          `${request.argv[0]} exited ${ran.code}`
      );
    }
    return { ok: true as const };
  });
