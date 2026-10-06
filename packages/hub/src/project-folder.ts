/**
 * A project's folder on the hub (§5.1 of the Projects spec): the project's own
 * files, kept in a git repository of their own so every change is a commit
 * with an author and a message.
 *
 * ```
 * AGENTS.md   you own it; agents propose
 * tasks/      one file per task
 * stages.md   stages, kinds, moves, views
 * views/  delegates/  routines/  skills/  knowledge/
 * memory/  assets/  design/  decisions/
 * ```
 *
 * The folder is `<data>/projects/<projectId>/`, beside the database. It is
 * made on first use with one commit holding an AGENTS.md stub; every other
 * folder appears when something is first written into it (git keeps no empty
 * folders, and nothing here pretends to).
 *
 * A path a caller names is relative to the folder and is refused when it is
 * absolute, climbs out with `..`, reaches into `.git`, or follows a link out
 * of the folder. Writes and deletes are commits, taken one at a time per
 * project: a promise chain per project keeps two commits from interleaving.
 *
 * Every git call runs with the hub's own identity (`-c user.name/user.email`,
 * never written to any config) and without the machine's global or system git
 * config, so an operator's signing key, hooks or aliases never reach it.
 */
import { randomUUID } from "node:crypto";
import type { Stats } from "node:fs";
import {
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  rmdir,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { devNull } from "node:os";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { Elysia, status, t } from "elysia";
import { DB_PATH } from "./config";

/** Where every project's folder lives: `projects/` beside the database. */
export const PROJECTS_DIR = resolve(dirname(DB_PATH), "projects");
/** A deleted project's folder, kept rather than erased. */
const TRASH_DIR = join(PROJECTS_DIR, ".trash");

/** Reads and writes stop here: the folder holds text read whole. */
export const FOLDER_FILE_LIMIT = 1024 * 1024;
/** Entries one listing answers before it says it stopped. */
const LIST_LIMIT = 2000;
/** Commits one history answers by default, and at most. */
const HISTORY_DEFAULT = 50;
export const HISTORY_LIMIT = 200;
const MESSAGE_LIMIT = 2000;
const PATH_LIMIT = 1024;
const GIT_TIMEOUT_MS = 30_000;

const HUB_NAME = "CawCo hub";
const NO_REPLY = "noreply@cawco.invalid";
const AGENTS_STUB = "# AGENTS.md\n\nOwned by you; agents propose changes.\n";

/** Who a commit is by: you, or the session that asked for it. */
export interface FolderAuthor {
  email?: string;
  name: string;
}

/** The operator: every write the dashboard makes. */
export const YOU: FolderAuthor = { name: "you" };

export interface FolderEntry {
  kind: "file" | "folder" | "link";
  /** From the folder's root, `/` between parts. */
  path: string;
  /** Bytes, for a file. */
  size?: number;
}

export interface FolderListing {
  entries: FolderEntry[];
  /** The folder listed, from the root; `""` is the root. */
  path: string;
  /** True when the listing stopped at its cap before the last entry. */
  truncated: boolean;
}

export interface FolderFile {
  content: string;
  path: string;
  size: number;
}

/** A write or delete as it landed. */
export interface FolderCommit {
  /** False when the content was already what was asked: no commit was made. */
  changed: boolean;
  path: string;
  /** The folder's commit after this change (HEAD). */
  sha: string;
}

export interface FolderChange {
  author: string;
  /** ISO 8601, the author's time. */
  date: string;
  /** The subject line. */
  message: string;
  sha: string;
}

export interface FolderHistory {
  commits: FolderChange[];
  /** The file, or `""` for the whole folder. */
  path: string;
}

export type FolderRefusalStatus =
  | 400
  | 403
  | 404
  | 409
  | 413
  | 415
  | 422
  | 500
  | 503;

/** A folder request the hub turns down, with the status and the words the caller reads. */
export class FolderRefusal extends Error {
  readonly status: FolderRefusalStatus;
  constructor(code: FolderRefusalStatus, message: string) {
    super(message);
    this.status = code;
  }
}

const PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const DRIVE = /^[A-Za-z]:/;
const NAME_UNSAFE = /[<>]/g;
const EMAIL = /^[^\s<>]+@[^\s<>]+$/;
const TRAILING_DOT = /\.$/;
const MIB = 1024 * 1024;

const isMissing = (error: unknown): boolean => {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
};

const noop = (): void => undefined;

const hasControl = (text: string): boolean => {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 32 || code === 127) {
      return true;
    }
  }
  return false;
};

/** `1 MiB`, `1.05 MiB`, `12 KiB`. */
const size = (bytes: number): string =>
  bytes >= MIB
    ? `${Number((bytes / MIB).toFixed(2))} MiB`
    : `${Math.ceil(bytes / 1024)} KiB`;

/**
 * `raw` as a path inside the folder, parts joined by `/`; `""` is the folder
 * itself. Refuses anything that could reach past the folder or into its
 * history. Exported for the tools that name paths before they touch them.
 */
export const folderPath = (raw: string): string => {
  if (raw.length > PATH_LIMIT) {
    throw new FolderRefusal(
      400,
      `The path is ${raw.length} characters long; paths stop at ${PATH_LIMIT}.`
    );
  }
  if (hasControl(raw)) {
    throw new FolderRefusal(
      400,
      "The path holds a control character; name files with printable characters."
    );
  }
  if (raw.includes("\\")) {
    throw new FolderRefusal(
      400,
      `${raw} uses a backslash; separate folders with "/".`
    );
  }
  if (isAbsolute(raw) || DRIVE.test(raw)) {
    throw new FolderRefusal(
      400,
      `${raw} is an absolute path; name a path inside the project folder, like tasks/T-1.md.`
    );
  }
  const parts = raw.split("/").filter((part) => part !== "" && part !== ".");
  if (parts.includes("..")) {
    throw new FolderRefusal(
      400,
      `${raw} climbs out of the project folder with ".."; name a path inside it.`
    );
  }
  if (parts.some((part) => part.toLowerCase() === ".git")) {
    throw new FolderRefusal(
      400,
      `${raw} reaches into .git, the folder's history; only the hub writes there.`
    );
  }
  return parts.join("/");
};

const projectRoot = (projectId: string): string => {
  if (!PROJECT_ID.test(projectId)) {
    throw new FolderRefusal(400, `${projectId} is not a project id.`);
  }
  return join(PROJECTS_DIR, projectId);
};

// --- git -------------------------------------------------------------------

/** The hub's environment without any `GIT_*` it was started with, and without global or system config. */
let gitEnvironment: Record<string, string> | undefined;
const gitEnv = (): Record<string, string> => {
  if (!gitEnvironment) {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined && !key.startsWith("GIT_")) {
        env[key] = value;
      }
    }
    gitEnvironment = {
      ...env,
      GIT_TERMINAL_PROMPT: "0",
      // A path is a path: `*` or `:(glob)` in a file name is not a pattern.
      GIT_LITERAL_PATHSPECS: "1",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: devNull,
    };
  }
  return gitEnvironment;
};

interface GitRun {
  code: number;
  stderr: string;
  stdout: string;
}

/** One git command against a project folder; answers its exit code and output. */
const run = async (root: string, args: string[]): Promise<GitRun> => {
  if (!Bun.which("git")) {
    throw new FolderRefusal(
      503,
      "git is not installed on the hub's machine, so project folders cannot keep their history. Install git there, then try again."
    );
  }
  const child = Bun.spawn(
    [
      "git",
      `--git-dir=${join(root, ".git")}`,
      `--work-tree=${root}`,
      "-c",
      `user.name=${HUB_NAME}`,
      "-c",
      `user.email=${NO_REPLY}`,
      "-c",
      "init.defaultBranch=main",
      "-c",
      "commit.gpgsign=false",
      "-c",
      "core.quotePath=false",
      ...args,
    ],
    {
      cwd: root,
      env: gitEnv(),
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      timeout: GIT_TIMEOUT_MS,
    }
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, stdout, stderr };
};

/** {@link run}, refusing with the first line of git's own words when it fails. */
const git = async (root: string, args: string[]): Promise<string> => {
  const result = await run(root, args);
  if (result.code !== 0) {
    const said = result.stderr.trim().split("\n")[0]?.replace(TRAILING_DOT, "");
    throw new FolderRefusal(
      500,
      `git ${args[0]} failed in the project folder: ${said || `exit ${result.code}`}.`
    );
  }
  return result.stdout;
};

/** A failed commit's refusal, saying the file was put back as it was. */
const putBack = (error: unknown, rel: string): unknown =>
  error instanceof FolderRefusal && error.status === 500
    ? new FolderRefusal(500, `${error.message} ${rel} is as it was.`)
    : error;

const head = async (root: string): Promise<string> =>
  (await git(root, ["rev-parse", "HEAD"])).trim();

/** `Name <email>` git accepts: no angle brackets or control characters in the name. */
const signature = (author: FolderAuthor): string => {
  const name = [...author.name]
    .filter((char) => !hasControl(char))
    .join("")
    .replace(NAME_UNSAFE, "")
    .trim();
  const email =
    author.email && EMAIL.test(author.email) ? author.email : NO_REPLY;
  return `${name || YOU.name} <${email}>`;
};

/** The commit message a caller asked for, trimmed; undefined for none, so the hub names the change. */
const askedMessage = (message: string | undefined): string | undefined => {
  const trimmed = message?.trim();
  if (trimmed && trimmed.length > MESSAGE_LIMIT) {
    throw new FolderRefusal(
      400,
      `The commit message is ${trimmed.length} characters long; messages stop at ${MESSAGE_LIMIT}.`
    );
  }
  return trimmed || undefined;
};

/**
 * Stages `rels` with `stage`, then commits those paths alone. Content that is
 * already what HEAD holds makes no commit and answers HEAD.
 */
const commitPaths = async (
  root: string,
  rels: string[],
  stage: string[],
  message: string,
  author: FolderAuthor
): Promise<{ changed: boolean; sha: string }> => {
  await git(root, stage);
  const staged = await run(root, [
    "diff",
    "--cached",
    "--quiet",
    "--",
    ...rels,
  ]);
  if (staged.code === 0) {
    return { sha: await head(root), changed: false };
  }
  if (staged.code !== 1) {
    throw new FolderRefusal(
      500,
      `git diff failed in the project folder: ${staged.stderr.trim()}`
    );
  }
  await git(root, [
    "commit",
    "-q",
    `--author=${signature(author)}`,
    "-m",
    message,
    "--",
    ...rels,
  ]);
  return { sha: await head(root), changed: true };
};

/** {@link commitPaths} for one path. */
const commit = async (
  root: string,
  rel: string,
  stage: string[],
  message: string,
  author: FolderAuthor
): Promise<FolderCommit> => ({
  path: rel,
  ...(await commitPaths(root, [rel], stage, message, author)),
});

// --- one project at a time ---------------------------------------------------

/**
 * A queue per key: the function it answers runs `work` once every earlier
 * turn on the same key has settled. The folder takes one for its commits; a
 * caller that reads a file, changes it and writes it back (the task files)
 * takes its own, around those writes.
 */
export const turnTaker = () => {
  const turns = new Map<string, Promise<void>>();
  return <T>(key: string, work: () => Promise<T>): Promise<T> => {
    const turn = (turns.get(key) ?? Promise.resolve()).then(work);
    const tail: Promise<void> = turn.then(noop, noop).then(() => {
      if (turns.get(key) === tail) {
        turns.delete(key);
      }
    });
    turns.set(key, tail);
    return turn;
  };
};

/** Runs `work` once every earlier turn on the same project has settled, so commits never interleave. */
const inTurn = turnTaker();
/** Projects whose folder this process has seen made, so a read skips the check. */
const ready = new Set<string>();

/** `lstat`, with undefined for a path that is not there. */
const lstatIfThere = async (path: string): Promise<Stats | undefined> => {
  try {
    return await lstat(path);
  } catch (error) {
    if (isMissing(error)) {
      return;
    }
    throw error;
  }
};

const exists = async (path: string): Promise<boolean> =>
  (await lstatIfThere(path)) !== undefined;

/**
 * Makes the folder on first use: `git init`, then one commit holding the
 * AGENTS.md stub. Idempotent, and finishes a start an earlier run left half
 * done (a repository with no commit yet). Runs inside the project's turn.
 */
const prepare = async (projectId: string, root: string): Promise<void> => {
  if (ready.has(projectId)) {
    return;
  }
  await mkdir(root, { recursive: true });
  if (!(await exists(join(root, ".git")))) {
    await git(root, ["init", "-q"]);
  }
  const started = await run(root, ["rev-parse", "--verify", "-q", "HEAD"]);
  if (started.code !== 0) {
    const agents = join(root, "AGENTS.md");
    if (!(await exists(agents))) {
      await writeFile(agents, AGENTS_STUB);
    }
    await git(root, ["add", "--", "AGENTS.md"]);
    await git(root, [
      "commit",
      "-q",
      `--author=${HUB_NAME} <${NO_REPLY}>`,
      "-m",
      "Start the project folder",
    ]);
  }
  ready.add(projectId);
};

/** The folder's root for a read, made first when this is its first use. */
const forReading = async (projectId: string): Promise<string> => {
  const root = projectRoot(projectId);
  if (!ready.has(projectId)) {
    await inTurn(projectId, () => prepare(projectId, root));
  }
  return root;
};

// --- where a path leads -----------------------------------------------------

const within = (parent: string, child: string): boolean =>
  child === parent || child.startsWith(`${parent}${sep}`);

/** Where `abs` really leads: the real path of its deepest existing part, with the parts not made yet after it. */
const landing = async (abs: string): Promise<string> => {
  try {
    return await realpath(abs);
  } catch (error) {
    const parent = dirname(abs);
    if (!isMissing(error) || parent === abs) {
      throw error;
    }
    return join(await landing(parent), basename(abs));
  }
};

/** For a read: links are followed, and refused when they lead out of the folder or into `.git`. */
const readable = async (root: string, rel: string): Promise<string> => {
  const realRoot = await realpath(root);
  const real = await landing(join(root, rel));
  if (!within(realRoot, real)) {
    throw new FolderRefusal(
      400,
      `${rel} is a link that leads outside the project folder.`
    );
  }
  if (within(join(realRoot, ".git"), real)) {
    throw new FolderRefusal(
      400,
      `${rel} is a link into .git, the folder's history.`
    );
  }
  return real;
};

/**
 * For a write or delete: the file itself is replaced or removed, never
 * followed, and every folder on the way must be a real folder inside (git
 * refuses a path beyond a link, and so does this).
 */
const writable = async (root: string, rel: string): Promise<string> => {
  const realRoot = await realpath(root);
  const abs = join(root, rel);
  const parent = await landing(dirname(abs));
  if (parent !== dirname(join(realRoot, rel))) {
    throw new FolderRefusal(
      400,
      `${rel} passes through a link; name the path it leads to inside the project folder.`
    );
  }
  return abs;
};

const notFound =
  (rel: string) =>
  (error: unknown): never => {
    if (isMissing(error)) {
      throw new FolderRefusal(
        404,
        `${rel || "The folder"} is not in the project folder.`
      );
    }
    throw error;
  };

// --- the folder's surface ---------------------------------------------------

/** The entries of one folder, or of everything under it when `recursive`, in name order, capped. */
export const listFolder = async (
  projectId: string,
  rawPath = "",
  recursive = false
): Promise<FolderListing> => {
  const rel = folderPath(rawPath);
  const root = await forReading(projectId);
  const real = await readable(root, rel);
  const info = await stat(real).catch(notFound(rel));
  if (!info.isDirectory()) {
    throw new FolderRefusal(
      409,
      `${rel} is a file; read it instead of listing it.`
    );
  }
  const entries: FolderEntry[] = [];
  const complete = await walk(real, rel, recursive, entries);
  return { path: rel, entries, truncated: !complete };
};

/**
 * Adds `dir`'s entries (paths under `prefix`) to `entries`, depth first in
 * name order, so a capped listing is the first {@link LIST_LIMIT} paths.
 * The folder's own `.git` is never an entry. Answers false when it stopped at
 * the cap.
 */
const walk = async (
  dir: string,
  prefix: string,
  recursive: boolean,
  entries: FolderEntry[]
): Promise<boolean> => {
  const children = (await readdir(dir, { withFileTypes: true }))
    .filter((child) => prefix !== "" || child.name !== ".git")
    .sort((a, b) => (a.name < b.name ? -1 : Number(a.name > b.name)));
  const sizes = await Promise.all(
    children.map((child) =>
      child.isFile()
        ? lstat(join(dir, child.name)).then((found) => found.size)
        : undefined
    )
  );
  for (const [index, child] of children.entries()) {
    if (entries.length >= LIST_LIMIT) {
      return false;
    }
    const path = prefix ? `${prefix}/${child.name}` : child.name;
    if (child.isDirectory()) {
      entries.push({ path, kind: "folder" });
      if (
        recursive &&
        // biome-ignore lint/performance/noAwaitInLoops: depth first in name order is what makes the cap the first paths
        !(await walk(join(dir, child.name), path, recursive, entries))
      ) {
        return false;
      }
    } else if (child.isSymbolicLink()) {
      entries.push({ path, kind: "link" });
    } else if (child.isFile()) {
      entries.push({ path, kind: "file", size: sizes[index] });
    }
  }
  return true;
};

const decoder = new TextDecoder("utf-8", { fatal: true });

/** The bytes as UTF-8 text, or undefined when they are binary (a NUL early on, as git judges, or not UTF-8). */
const asText = (bytes: Uint8Array): string | undefined => {
  if (bytes.subarray(0, 8000).includes(0)) {
    return undefined;
  }
  try {
    return decoder.decode(bytes);
  } catch {
    return undefined;
  }
};

/** One text file, whole: up to {@link FOLDER_FILE_LIMIT}; a binary file is refused. */
export const readFolderFile = async (
  projectId: string,
  rawPath: string
): Promise<FolderFile> => {
  const rel = folderPath(rawPath);
  if (!rel) {
    throw new FolderRefusal(400, "Name a file to read, like AGENTS.md.");
  }
  const root = await forReading(projectId);
  const real = await readable(root, rel);
  const info = await stat(real).catch(notFound(rel));
  if (info.isDirectory()) {
    throw new FolderRefusal(
      409,
      `${rel} is a folder; list it instead of reading it.`
    );
  }
  if (info.size > FOLDER_FILE_LIMIT) {
    throw new FolderRefusal(
      413,
      `${rel} is ${size(info.size)}; reads stop at ${size(FOLDER_FILE_LIMIT)}.`
    );
  }
  const bytes = await readFile(real);
  const content = asText(bytes);
  if (content === undefined) {
    throw new FolderRefusal(
      415,
      `${rel} is a binary file, so it cannot be read as text.`
    );
  }
  return { path: rel, content, size: bytes.byteLength };
};

export interface FolderWriteOptions {
  /** Who the commit is by; the operator when left out. */
  author?: FolderAuthor;
  /** The commit message; "Add <path>" or "Update <path>" when left out. */
  message?: string;
}

/**
 * Writes one file (its folders made as needed) atomically, then commits it.
 * A write whose content HEAD already holds answers HEAD with `changed: false`.
 * A failed commit puts the file back as it was.
 */
export const writeFolderFile = async (
  projectId: string,
  rawPath: string,
  content: string | Uint8Array,
  options: FolderWriteOptions = {}
): Promise<FolderCommit> => {
  const rel = folderPath(rawPath);
  if (!rel) {
    throw new FolderRefusal(400, "Name a file to write, like tasks/T-1.md.");
  }
  const bytes = typeof content === "string" ? Buffer.from(content) : content;
  if (bytes.byteLength > FOLDER_FILE_LIMIT) {
    throw new FolderRefusal(
      413,
      `The file is ${size(bytes.byteLength)}; writes stop at ${size(FOLDER_FILE_LIMIT)}.`
    );
  }
  const asked = askedMessage(options.message);
  const root = projectRoot(projectId);
  return await inTurn(projectId, async () => {
    await prepare(projectId, root);
    const abs = await writable(root, rel);
    const before = await lstatIfThere(abs);
    if (before?.isDirectory()) {
      throw new FolderRefusal(
        409,
        `${rel} is a folder, so a file cannot be written there.`
      );
    }
    const message = asked ?? `${before ? "Update" : "Add"} ${rel}`;
    const previous = before?.isFile() ? await readFile(abs) : undefined;
    await mkdir(dirname(abs), { recursive: true }).catch((error: unknown) => {
      const { code } = error as NodeJS.ErrnoException;
      if (code === "EEXIST" || code === "ENOTDIR") {
        throw new FolderRefusal(
          409,
          `A file sits where ${dirname(rel)} would be a folder, so ${rel} cannot be written.`
        );
      }
      throw error;
    });
    // Beside the history, on the same disk: the rename is the write.
    const scratch = join(root, ".git", `cawco-write-${randomUUID()}`);
    await writeFile(scratch, bytes);
    try {
      await rename(scratch, abs);
    } catch (error) {
      await unlink(scratch).catch(noop);
      throw error;
    }
    try {
      return await commit(
        root,
        rel,
        ["add", "-A", "--", rel],
        message,
        options.author ?? YOU
      );
    } catch (error) {
      if (previous) {
        await writeFile(abs, previous).catch(noop);
      } else {
        await unlink(abs).catch(noop);
        await pruneEmpty(root, dirname(abs));
      }
      await run(root, ["reset", "-q", "--", rel]).catch(noop);
      throw putBack(error, rel);
    }
  });
};

/** Several files written together, as {@link writeFolderFiles} landed them. */
export interface FolderCommits {
  /** False when every file was already what was asked: no commit was made. */
  changed: boolean;
  paths: string[];
  /** The folder's commit after this change (HEAD). */
  sha: string;
}

/** Files a caller asked to write, each checked and sized as one write is; refused when one cannot be. */
const toWrite = (
  files: { path: string; content: string | Uint8Array }[]
): { rel: string; bytes: Uint8Array }[] => {
  const writes = files.map(({ path, content }) => {
    const rel = folderPath(path);
    if (!rel) {
      throw new FolderRefusal(
        400,
        "Name each file to write, like assets/a.md."
      );
    }
    const bytes = typeof content === "string" ? Buffer.from(content) : content;
    if (bytes.byteLength > FOLDER_FILE_LIMIT) {
      throw new FolderRefusal(
        413,
        `${rel} is ${size(bytes.byteLength)}; writes stop at ${size(FOLDER_FILE_LIMIT)}.`
      );
    }
    return { rel, bytes };
  });
  if (writes.length === 0) {
    throw new FolderRefusal(400, "Name at least one file to write.");
  }
  return writes;
};

/**
 * Puts `bytes` at `rel` (its folders made as needed), atomically, keeping in
 * `before` what the path held first so a failed commit can put it back.
 */
const putFile = async (
  root: string,
  rel: string,
  bytes: Uint8Array,
  before: Map<string, Buffer | undefined>
): Promise<void> => {
  const abs = await writable(root, rel);
  const there = await lstatIfThere(abs);
  if (there?.isDirectory()) {
    throw new FolderRefusal(
      409,
      `${rel} is a folder, so a file cannot be written there.`
    );
  }
  if (!before.has(abs)) {
    before.set(abs, there?.isFile() ? await readFile(abs) : undefined);
  }
  await mkdir(dirname(abs), { recursive: true }).catch((error: unknown) => {
    const { code } = error as NodeJS.ErrnoException;
    if (code === "EEXIST" || code === "ENOTDIR") {
      throw new FolderRefusal(
        409,
        `A file sits where ${dirname(rel)} would be a folder, so ${rel} cannot be written.`
      );
    }
    throw error;
  });
  // Beside the history, on the same disk: the rename is the write.
  const scratch = join(root, ".git", `cawco-write-${randomUUID()}`);
  await writeFile(scratch, bytes);
  try {
    await rename(scratch, abs);
  } catch (error) {
    await unlink(scratch).catch(noop);
    throw error;
  }
};

/** Puts back what {@link putFile} replaced, and unstages the paths. */
const putBackAll = async (
  root: string,
  rels: string[],
  before: Map<string, Buffer | undefined>
): Promise<void> => {
  for (const [abs, previous] of before) {
    if (previous) {
      // biome-ignore lint/performance/noAwaitInLoops: putting files back, one at a time
      await writeFile(abs, previous).catch(noop);
    } else {
      await unlink(abs).catch(noop);
      await pruneEmpty(root, dirname(abs));
    }
  }
  await run(root, ["reset", "-q", "--", ...rels]).catch(noop);
};

/**
 * Writes several files (their folders made as needed) and commits them
 * together, one commit for what one piece of work produced (a work item's
 * outputs). Each is checked and sized as {@link writeFolderFile} checks one.
 * Files HEAD already holds as asked change nothing; when none changed, no
 * commit is made. A failed write or commit puts every file back as it was.
 */
export const writeFolderFiles = async (
  projectId: string,
  files: { path: string; content: string | Uint8Array }[],
  options: FolderWriteOptions & { message: string }
): Promise<FolderCommits> => {
  const asked = askedMessage(options.message);
  if (!asked) {
    throw new FolderRefusal(400, "Say what the files are in a commit message.");
  }
  const writes = toWrite(files);
  const rels = [...new Set(writes.map((write) => write.rel))];
  const root = projectRoot(projectId);
  return await inTurn(projectId, async () => {
    await prepare(projectId, root);
    /** What each path held before, to put back if anything fails. */
    const before = new Map<string, Buffer | undefined>();
    try {
      for (const { rel, bytes } of writes) {
        // biome-ignore lint/performance/noAwaitInLoops: one file at a time, each checked before it is written
        await putFile(root, rel, bytes, before);
      }
      const done = await commitPaths(
        root,
        rels,
        ["add", "-A", "--", ...rels],
        asked,
        options.author ?? YOU
      );
      return { ...done, paths: rels };
    } catch (error) {
      await putBackAll(root, rels, before);
      throw error instanceof FolderRefusal && error.status === 500
        ? new FolderRefusal(
            500,
            `${error.message} ${rels.join(", ")} are as they were.`
          )
        : error;
    }
  });
};

/** Removes the now-empty folders above a deleted file, up to the root. */
const pruneEmpty = async (root: string, dir: string): Promise<void> => {
  if (dir === root || !within(root, dir)) {
    return;
  }
  try {
    await rmdir(dir);
  } catch {
    return;
  }
  await pruneEmpty(root, dirname(dir));
};

/** Deletes one file and commits that. A folder is refused: its files go one by one. */
export const deleteFolderFile = async (
  projectId: string,
  rawPath: string,
  options: FolderWriteOptions = {}
): Promise<FolderCommit> => {
  const rel = folderPath(rawPath);
  if (!rel) {
    throw new FolderRefusal(
      400,
      "Name a file to delete; the folder itself goes when its project does."
    );
  }
  const asked = askedMessage(options.message);
  const root = projectRoot(projectId);
  return await inTurn(projectId, async () => {
    await prepare(projectId, root);
    const abs = await writable(root, rel);
    const info = await lstat(abs).catch(notFound(rel));
    if (info.isDirectory()) {
      throw new FolderRefusal(
        409,
        `${rel} is a folder; delete the files in it one by one.`
      );
    }
    const message = asked ?? `Delete ${rel}`;
    const previous = info.isFile() ? await readFile(abs) : undefined;
    await unlink(abs);
    try {
      const done = await commit(
        root,
        rel,
        ["rm", "-q", "--cached", "--ignore-unmatch", "--", rel],
        message,
        options.author ?? YOU
      );
      await pruneEmpty(root, dirname(abs));
      return done;
    } catch (error) {
      if (previous) {
        await writeFile(abs, previous).catch(noop);
      }
      await run(root, ["reset", "-q", "--", rel]).catch(noop);
      throw putBack(error, rel);
    }
  });
};

/**
 * The commits that changed one file, newest first, following it across
 * renames; with no path, the whole folder's. A path that never existed has
 * no commits.
 */
export const folderHistory = async (
  projectId: string,
  rawPath = "",
  limit = HISTORY_DEFAULT
): Promise<FolderHistory> => {
  const rel = folderPath(rawPath);
  const count = Math.min(Math.max(Math.floor(limit), 1), HISTORY_LIMIT);
  const root = await forReading(projectId);
  const out = await git(root, [
    "log",
    `--max-count=${count}`,
    "--format=%H%x1f%an%x1f%aI%x1f%s%x1e",
    ...(rel ? ["--follow", "--", rel] : []),
  ]);
  const commits = out
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record): FolderChange => {
      const [sha = "", author = "", date = "", message = ""] =
        record.split("\x1f");
      return { sha, author, date, message };
    });
  return { path: rel, commits };
};

/**
 * Every path under `rawDir` that any commit of the folder ever touched,
 * including files deleted since: what keeps a number handed out once from
 * being handed out again.
 */
export const folderPathsInHistory = async (
  projectId: string,
  rawDir: string
): Promise<string[]> => {
  const rel = folderPath(rawDir);
  const root = await forReading(projectId);
  const out = await git(root, [
    "log",
    "--format=",
    "--name-only",
    "--no-renames",
    ...(rel ? ["--", rel] : []),
  ]);
  return [...new Set(out.split("\n").filter(Boolean))];
};

/** Whether the project's folder has been made: a project never written to has none. */
export const hasProjectFolder = (projectId: string): Promise<boolean> =>
  exists(join(projectRoot(projectId), ".git"));

/**
 * Moves a deleted project's folder, history and all, to
 * `<data>/projects/.trash/<projectId>-<time>` (never erased). Answers where it
 * went, or undefined when the project never had a folder.
 */
export const trashProjectFolder = async (
  projectId: string
): Promise<string | undefined> => {
  const root = projectRoot(projectId);
  return await inTurn(projectId, async () => {
    ready.delete(projectId);
    if (!(await exists(root))) {
      return;
    }
    await mkdir(TRASH_DIR, { recursive: true });
    const target = join(
      TRASH_DIR,
      `${projectId}-${new Date().toISOString().replaceAll(":", "-")}`
    );
    await rename(root, target);
    return target;
  });
};

// --- routes ----------------------------------------------------------------

/** A refusal as the route's answer, in its status and words; anything else is thrown on. */
export const refused = (error: unknown) => {
  if (error instanceof FolderRefusal) {
    return status(error.status, error.message);
  }
  throw error;
};

/**
 * The dashboard's routes for a project's folder, under
 * `/api/projects/:id/folder`: list, read, write, delete and history. Writes
 * from here are the operator's ("you"), and `changed` hears of each one (a
 * task file or stages.md may be among them). A standalone Elysia app so
 * `server.ts` mounts it with one `.use()`.
 */
export const projectFolderRoutes = (
  projectExists: (id: string) => boolean,
  changed: (id: string) => void = () => undefined
) => {
  const known = (id: string): void => {
    if (!projectExists(id)) {
      throw new FolderRefusal(404, `The hub keeps no project ${id}.`);
    }
  };
  return new Elysia()
    .get(
      "/api/projects/:id/folder",
      {
        query: t.Object({
          path: t.Optional(t.String()),
          recursive: t.Optional(t.Boolean()),
        }),
      },
      async ({ params, query }) => {
        try {
          known(params.id);
          return await listFolder(
            params.id,
            query.path ?? "",
            query.recursive ?? false
          );
        } catch (error) {
          return refused(error);
        }
      }
    )
    .get(
      "/api/projects/:id/folder/file",
      { query: t.Object({ path: t.String() }) },
      async ({ params, query }) => {
        try {
          known(params.id);
          return await readFolderFile(params.id, query.path);
        } catch (error) {
          return refused(error);
        }
      }
    )
    .put(
      "/api/projects/:id/folder/file",
      {
        body: t.Object({
          path: t.String(),
          content: t.String(),
          message: t.Optional(t.String({ maxLength: MESSAGE_LIMIT })),
        }),
      },
      async ({ params, body }) => {
        try {
          known(params.id);
          const written = await writeFolderFile(
            params.id,
            body.path,
            body.content,
            { author: YOU, message: body.message }
          );
          changed(params.id);
          return written;
        } catch (error) {
          return refused(error);
        }
      }
    )
    .delete(
      "/api/projects/:id/folder/file",
      {
        query: t.Object({
          path: t.String(),
          message: t.Optional(t.String({ maxLength: MESSAGE_LIMIT })),
        }),
      },
      async ({ params, query }) => {
        try {
          known(params.id);
          const deleted = await deleteFolderFile(params.id, query.path, {
            author: YOU,
            message: query.message,
          });
          changed(params.id);
          return deleted;
        } catch (error) {
          return refused(error);
        }
      }
    )
    .get(
      "/api/projects/:id/folder/history",
      {
        query: t.Object({
          path: t.Optional(t.String()),
          limit: t.Optional(t.Integer({ minimum: 1, maximum: HISTORY_LIMIT })),
        }),
      },
      async ({ params, query }) => {
        try {
          known(params.id);
          return await folderHistory(params.id, query.path ?? "", query.limit);
        } catch (error) {
          return refused(error);
        }
      }
    );
};
