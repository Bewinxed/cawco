/**
 * {@link CONTROL_PLACE_REPO}: a project's place made a git repository on its
 * machine, so every workspace is a clone (workspace.ts). The hub asks for it
 * when a place that is a plain folder is first needed (hub place-repo.ts):
 * the person is never asked to run `git init`.
 *
 * The first commit takes the folder as git reads it: every file its own
 * ignore rules leave in (each `.gitignore` in it, and the person's global
 * excludes file), but for any whose text reads as a credential (core
 * secret-text.ts). A folder that is a git repository of its own is not
 * taken, as git takes no file of one. Nothing about a file's name decides
 * it: `Sessions.swift` and `tokens/` are a project's own. A file of
 * {@link LARGE_FILE_BYTES} or more is left out too, never read, and offered
 * to Git LFS by its pattern ({@link lfsRowsOf}); Track with LFS commits it through
 * LFS in a second commit ({@link placeLfs}).
 *
 * What is left out is written into the place's `.gitignore` first, so the
 * owner's own `git status` there stays clean and a later `git add` takes no
 * key. When what is left to commit passes {@link PLACE_REPO_LIMIT_BYTES},
 * nothing is written and the place stays a folder, its heaviest folders
 * named. The plan is read through a scratch git dir outside the place, so
 * a refused place is left as it was; the run then makes `.git`, stages
 * exactly the plan's files, scans what is staged once more, and commits as
 * CawCo.
 * Nothing is pushed and no remote is added. A run that fails after
 * `git init` takes its `.git` and `.gitignore` change back.
 */
import { lstat, mkdtemp, open, readFile, rm, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import {
  credentialIn,
  LARGE_FILE_BYTES,
  PLACE_REPO_LIMIT_BYTES,
  type PlaceLeftOut,
  type PlaceLfsMade,
  type PlaceLfsRow,
  type PlaceRepo,
  WORKSPACE_GIT_TIMEOUT_MS,
} from "@cawco/core";
import { readWithin } from "@cawco/core/bounded";
import { SAFE_GIT_ENV, safeGitArgv } from "@cawco/core/safe-git";
import { hostEnvironment } from "@cawco/core/session-env";
import { writeStateFile } from "@cawco/core/state-file";
import { unhandled } from "@cawco/core/unhandled";
import { refuseShortOfWorkspace } from "@cawco/core/workspace-needs";
import type { Subprocess } from "bun";
import { configEnv } from "./git-credential";
import { LFS_FILTERS } from "./move";

/** Who the first commit is by: CawCo, at an address that takes no mail. */
const AUTHOR = [
  "-c",
  "user.name=CawCo",
  "-c",
  "user.email=noreply@cawco.invalid",
];

/**
 * git's exit for a folder in no repository: `die()` (usage.c) exits 128, and
 * `rev-parse --is-inside-work-tree` dies so when discovery finds none
 * (setup.c). Every other fatal setup error exits the same, so a 128 is read
 * with the folders above the place ({@link gitAbove}).
 */
const NOT_A_REPO_EXIT = 128;

/** git that failed: its argv, its exit status, and its stderr as it said it. */
class GitFailed extends Error {
  readonly code: number;
  constructor(args: readonly string[], code: number, stderr: string) {
    super(`git ${args[0]} failed: ${stderr.trim() || `exit ${code}`}`);
    this.name = "GitFailed";
    this.code = code;
  }
}

/**
 * The nearest `.git` at `root` or above it on its filesystem, when one is
 * there: git's 128 there is a repository it would not read (a damaged one,
 * someone else's), never a folder in none. Discovery stops where git's does,
 * at a filesystem boundary (`GIT_DISCOVERY_ACROSS_FILESYSTEM` unset): a
 * `.git` past it is one git rightly does not look for.
 */
const gitAbove = async (root: string): Promise<string | undefined> => {
  const device = (await stat(root)).dev;
  for (let at = root; ; at = dirname(at)) {
    if ((await stat(at).catch(() => undefined))?.dev !== device) {
      return;
    }
    const dotGit = join(at, ".git");
    if (await lstat(dotGit).then(Boolean, () => false)) {
      return dotGit;
    }
    if (dirname(at) === at) {
      return;
    }
  }
};

/** How much of a file the credential scan reads for a NUL, to tell text from binary. */
const BINARY_PROBE = 8000;

const MB = 1024 * 1024;
const mb = (bytes: number): string => `${(bytes / MB).toFixed(1)} MB`;

/** What a `.gitignore` pattern reads as a glob or a comment, escaped to name a path exactly. */
const IGNORE_SPECIAL = /[\\*?[\]!#]/gu;
const TRAILING_SPACE = / $/u;

/** How many of a place's heaviest folders a refusal names. */
const HEAVIEST = 3;

/** One `.gitignore` line naming `path` exactly, from the root: git's glob and comment characters escaped. */
const ignoreLine = (path: string): string =>
  `/${path.replace(IGNORE_SPECIAL, (char) => `\\${char}`).replace(TRAILING_SPACE, "\\ ")}`;

/** The heading of CawCo's block in the place's `.gitignore`. */
const IGNORE_HEADING =
  "# CawCo left these out of this folder's first commit: each holds what reads as a credential, is a large file, or is a git repository of its own.";

/** The block the place's `.gitignore` gets: every path left out, one line each. */
const ignoreBlock = (leftOut: readonly PlaceLeftOut[]): string =>
  leftOut.length === 0
    ? ""
    : `${IGNORE_HEADING}\n${leftOut
        .map((each) => ignoreLine(each.path))
        .join("\n")}\n`;

/**
 * `work` within what is left of `deadline`, named `what` in the error a
 * late or failed run throws.
 */
const within = async <T>(
  deadline: number,
  what: string,
  work: (signal: AbortSignal) => Promise<T>
): Promise<T> => {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    throw new Error(`git exceeded ${WORKSPACE_GIT_TIMEOUT_MS / 1000}s`);
  }
  const ran = await readWithin(remaining, work);
  switch (ran.kind) {
    case "answered":
      return ran.value;
    case "unanswered":
      throw new Error(
        `${what} did not finish within ${WORKSPACE_GIT_TIMEOUT_MS / 1000}s`
      );
    default:
      unhandled("read", ran);
  }
};

/** What a git run is given beyond its argv: `config` env-only, and whether its pathspecs are literal. */
interface GitSetting {
  config: [string, string][];
  literal: boolean;
}

const PLAIN: GitSetting = { config: [], literal: true };

/**
 * git as `safe-git.ts` says, in `cwd`, with `setting.config` given env-only
 * and pathspecs read literally unless `setting.literal` is false (a file
 * named `*` is that file).
 */
const spawnGit = (
  cwd: string,
  args: readonly string[],
  signal: AbortSignal,
  stdin: "ignore" | Blob = "ignore",
  setting: GitSetting = PLAIN
) =>
  Bun.spawn(safeGitArgv([...args]), {
    cwd,
    env: {
      ...hostEnvironment(),
      ...SAFE_GIT_ENV,
      ...(setting.config.length > 0 ? configEnv(setting.config) : {}),
      ...(setting.literal ? { GIT_LITERAL_PATHSPECS: "1" } : {}),
    },
    stdin,
    stdout: "pipe",
    stderr: "pipe",
    signal,
    killSignal: "SIGKILL",
  });

/** Throws git's own words when it did not end well. */
const failed = (
  args: readonly string[],
  child: Pick<Subprocess, "signalCode">,
  code: number,
  stderr: string
): void => {
  if (child.signalCode) {
    throw new Error(`git ${args[0]} was ended by ${child.signalCode}`);
  }
  if (code !== 0) {
    throw new GitFailed(args, code, stderr);
  }
};

/**
 * git in `cwd`, its stdout as written (never trimmed: a NUL-separated
 * list's first name may start with a space), with `config` given env-only
 * and pathspecs literal unless `literal` is false. git's stderr is the error.
 */
const gitIn =
  (deadline: number, config: [string, string][] = [], literal = true) =>
  (cwd: string, ...args: string[]): Promise<string> =>
    within(deadline, `git ${args[0]}`, async (signal) => {
      const child = spawnGit(cwd, args, signal, "ignore", { config, literal });
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      failed(args, child, code, stderr);
      return stdout;
    });

type Git = ReturnType<typeof gitIn>;

const nulList = (text: string): string[] => text.split("\0").filter(Boolean);

/** How much of a file the credential scan reads at a time. */
const SCAN_READ = 1024 * 1024;
/**
 * How much of what it read last the scan carries into the next read: more
 * than any credential's shape needs to be seen whole (core secret-text.ts),
 * so one across two reads is found.
 */
const SCAN_CARRY = 4096;

/**
 * The credential scan of one file's bytes as they arrive, holding no more
 * than one read and {@link SCAN_CARRY} of the last: a file is never held
 * whole. `found` is what the first credential reads as; a file with a NUL in
 * its first {@link BINARY_PROBE} bytes is binary, and holds none.
 */
class CredentialScan {
  readonly #decoder = new TextDecoder();
  #carry = "";
  #seen = 0;
  found: string | undefined;
  /** Whether more bytes could change what it found: a credential found, or binary. */
  done: boolean;

  constructor() {
    this.done = false;
  }

  feed(bytes: Uint8Array): void {
    if (this.done) {
      return;
    }
    if (
      this.#seen < BINARY_PROBE &&
      bytes.subarray(0, BINARY_PROBE - this.#seen).includes(0)
    ) {
      this.done = true;
      return;
    }
    this.#seen += bytes.length;
    const text = this.#carry + this.#decoder.decode(bytes, { stream: true });
    this.found = credentialIn(text);
    this.done = this.found !== undefined;
    this.#carry = text.slice(-SCAN_CARRY);
  }
}

/** What reads as a credential in the file at `path`, read {@link SCAN_READ} at a time; undefined for binary or for none. */
const credentialInFile = async (path: string): Promise<string | undefined> => {
  const file = await open(path, "r");
  try {
    const scan = new CredentialScan();
    const buffer = new Uint8Array(SCAN_READ);
    for (;;) {
      const { bytesRead } = await file.read(buffer, 0, SCAN_READ, null);
      if (bytesRead === 0 || scan.done) {
        return scan.found;
      }
      scan.feed(buffer.subarray(0, bytesRead));
    }
  } finally {
    await file.close();
  }
};

/**
 * The paths git reads as the place's own and has not yet: untracked and
 * not ignored by any of its ignore rules. A folder listed with a trailing
 * `/` is a git repository of its own. `gitDir` reads a plain folder through
 * a scratch git dir, writing nothing in it.
 */
const untracked = async (
  root: string,
  git: Git,
  gitDir?: string
): Promise<string[]> =>
  nulList(
    await git(
      root,
      ...(gitDir
        ? [
            `--git-dir=${gitDir}`,
            `--work-tree=${root}`,
            "-c",
            "core.bare=false",
          ]
        : []),
      "ls-files",
      "-z",
      "--others",
      "--exclude-standard"
    )
  );

/**
 * What becomes of the paths git listed: the files a commit may take, by
 * path, with their sizes, what is left out and why, and of that what its
 * size alone kept out, with its size.
 */
interface Judged {
  large: Map<string, number>;
  leftOut: PlaceLeftOut[];
  sizes: Map<string, number>;
}

/** Each of `paths` whose text reads as a credential, with what it reads as. */
const credentialHits = async (
  root: string,
  paths: readonly string[]
): Promise<PlaceLeftOut[]> => {
  const hits: PlaceLeftOut[] = [];
  for (const path of paths) {
    const found = await credentialInFile(join(root, path));
    if (found) {
      hits.push({ path, why: `its text holds what reads as ${found}` });
    }
  }
  return hits;
};

/**
 * The paths git listed, judged: a repository of its own is left out, as git
 * takes none of its files; so is a large file (core `LARGE_FILE_BYTES`, the
 * size a move sends separately), never read and offered to Git LFS instead,
 * and a file whose text reads as a credential. A file or link is taken (a
 * link as git takes one: its target's path, never what it leads to);
 * anything else git would not take either.
 */
const judge = async (
  root: string,
  listed: readonly string[]
): Promise<Judged> => {
  const sizes = new Map<string, number>();
  const large = new Map<string, number>();
  const leftOut: PlaceLeftOut[] = [];
  for (const path of listed) {
    if (path.endsWith("/")) {
      leftOut.push({ path, why: "a git repository of its own" });
      continue;
    }
    const full = join(root, path);
    const info = await lstat(full).catch(() => undefined);
    if (info?.isSymbolicLink()) {
      sizes.set(path, 0);
    } else if (info?.isFile() && info.size >= LARGE_FILE_BYTES) {
      leftOut.push({
        path,
        why: `a large file (${mb(info.size)}); a first commit takes none of ${mb(LARGE_FILE_BYTES)} or more`,
      });
      large.set(path, info.size);
    } else if (info?.isFile()) {
      const found = await credentialInFile(full);
      if (found) {
        leftOut.push({ path, why: `its text holds what reads as ${found}` });
      } else {
        sizes.set(path, info.size);
      }
    }
  }
  return {
    sizes,
    large,
    leftOut: leftOut.sort((a, b) => a.path.localeCompare(b.path)),
  };
};

/** A file name's extension, without its dot; none for a dotfile or a name with none. */
const extensionOf = (path: string): string | undefined => {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1) : undefined;
};

/**
 * The large files a first commit left out, by the pattern Git LFS would
 * track each under, in `git lfs migrate info`'s shape (pattern, count,
 * size), biggest first: `*.<ext>` for a file with an extension, its own path
 * for one without. Read here, not by `migrate info` itself, which "summarizes
 * the sizes of file objects present in the Git history"
 * (git-lfs-migrate(1)): these files are in none.
 */
const lfsRowsOf = (large: ReadonlyMap<string, number>): PlaceLfsRow[] => {
  const rows = new Map<string, PlaceLfsRow>();
  for (const [path, bytes] of large) {
    const ext = extensionOf(path);
    const pattern = ext ? `*.${ext}` : path;
    const row = rows.get(pattern) ?? { pattern, count: 0, bytes: 0, paths: [] };
    row.count += 1;
    row.bytes += bytes;
    row.paths.push(path);
    rows.set(pattern, row);
  }
  return [...rows.values()].sort((a, b) => b.bytes - a.bytes);
};

/** A newline, which ends each header `git cat-file --batch` writes. */
const NEWLINE = 10;

/**
 * `git cat-file --batch`'s answer, fed as it arrives: `<oid> <type> <size>`,
 * a newline, the object's bytes and a newline, for each object asked; an
 * `<oid> missing` line for one there is not. Each blob's bytes go through a
 * {@link CredentialScan} as git writes them, and `each` hears what it found:
 * no blob is held whole.
 */
class BatchReader {
  readonly #each: (oid: string, found: string | undefined) => void;
  readonly #decoder = new TextDecoder();
  #header = "";
  #oid = "";
  /** The blob being read; undefined for any other object. */
  #scan: CredentialScan | undefined;
  /** Its bytes still to come; undefined between objects. */
  #left: number | undefined;
  /** Bytes to pass over before the next header: the newline after an object. */
  #skip = 0;

  constructor(each: (oid: string, found: string | undefined) => void) {
    this.#each = each;
  }

  feed(chunk: Uint8Array): void {
    let at = 0;
    while (at < chunk.length) {
      if (this.#skip > 0) {
        this.#skip -= 1;
        at += 1;
      } else if (this.#left === undefined) {
        at = this.#readHeader(chunk, at);
      } else {
        at = this.#fill(chunk, at);
      }
    }
  }

  /** Scans what of the object's bytes `chunk` holds from `at`; answers where it stopped. */
  #fill(chunk: Uint8Array, at: number): number {
    const n = Math.min(this.#left ?? 0, chunk.length - at);
    this.#scan?.feed(chunk.subarray(at, at + n));
    this.#left = (this.#left ?? 0) - n;
    if (this.#left === 0) {
      this.#done();
    }
    return at + n;
  }

  /** Reads what of a header `chunk` holds from `at`, starting its object at the newline; answers where it stopped. */
  #readHeader(chunk: Uint8Array, at: number): number {
    const end = chunk.indexOf(NEWLINE, at);
    if (end === -1) {
      this.#header += this.#decoder.decode(chunk.subarray(at));
      return chunk.length;
    }
    this.#header += this.#decoder.decode(chunk.subarray(at, end));
    const [id = "", type = "", size] = this.#header.split(" ");
    this.#header = "";
    if (size !== undefined) {
      this.#oid = id;
      this.#scan = type === "blob" ? new CredentialScan() : undefined;
      this.#left = Number(size);
      if (this.#left === 0) {
        this.#done();
      }
    }
    return end + 1;
  }

  #done(): void {
    if (this.#scan) {
      this.#each(this.#oid, this.#scan.found);
    }
    this.#scan = undefined;
    this.#left = undefined;
    this.#skip = 1;
  }
}

/**
 * Hands what each blob `oids` name in `root` reads as to `each`, read
 * through one `git cat-file --batch` as git streams it: a history is read
 * whole without holding any of its files whole.
 */
const eachBlob = (
  root: string,
  oids: readonly string[],
  deadline: number,
  each: (oid: string, found: string | undefined) => void
): Promise<void> =>
  within(deadline, "git cat-file", async (signal) => {
    const args = ["cat-file", "--batch"];
    const child = spawnGit(
      root,
      args,
      signal,
      new Blob([oids.map((one) => `${one}\n`).join("")])
    );
    const stderr = new Response(child.stderr).text();
    const reader = new BatchReader(each);
    for await (const chunk of child.stdout) {
      reader.feed(chunk);
    }
    failed(args, child, await child.exited, await stderr);
  });

/**
 * Every path whose text, in any commit HEAD reaches, reads as a credential:
 * what a publish takes is the whole history, so a key a later commit took
 * out is still in it.
 */
const historyHits = async (
  root: string,
  git: Git,
  deadline: number
): Promise<PlaceLeftOut[]> => {
  const [tree, objects] = await Promise.all([
    git(root, "ls-tree", "-r", "-z", "HEAD"),
    git(root, "rev-list", "--objects", "HEAD"),
  ]);
  const inHead = new Set<string>();
  for (const entry of nulList(tree)) {
    // `<mode> <type> <oid>\t<path>`
    const [, type, oid] = entry.slice(0, entry.indexOf("\t")).split(" ");
    if (type === "blob" && oid) {
      inHead.add(oid);
    }
  }
  // `<oid> <path>` for each tree and blob, once, at the first path it is seen at.
  const pathOf = new Map<string, string>();
  for (const line of objects.split("\n")) {
    const space = line.indexOf(" ");
    if (space > 0) {
      pathOf.set(line.slice(0, space), line.slice(space + 1));
    }
  }
  const hits = new Map<string, PlaceLeftOut>();
  await eachBlob(root, [...pathOf.keys()], deadline, (oid, found) => {
    const path = pathOf.get(oid) ?? oid;
    if (found && (inHead.has(oid) || !hits.has(path))) {
      hits.set(path, {
        path,
        why: inHead.has(oid)
          ? `its text holds what reads as ${found}`
          : `an earlier commit's copy holds what reads as ${found}`,
      });
    }
  });
  return [...hits.values()].sort((a, b) => a.path.localeCompare(b.path));
};

/**
 * A place that is already a repository, read for publishing
 * (CONTROL_PLACE_PUSH): `leftOut`, what the first commit's rules keep out
 * of the files it has not committed, with why; `refused`, every path whose
 * text in any commit HEAD reaches reads as a credential, which no publish
 * takes.
 */
export const publishCheck = async (
  root: string,
  deadline: number
): Promise<{ leftOut: PlaceLeftOut[]; refused: PlaceLeftOut[] }> => {
  const git = gitIn(deadline);
  const { leftOut } = await judge(root, await untracked(root, git));
  return { leftOut, refused: await historyHits(root, git, deadline) };
};

/** What a first commit would take, read without writing in the place. */
interface Plan {
  bytes: number;
  leftOut: PlaceLeftOut[];
  /** What of `leftOut` its size alone kept out, offered to Git LFS. */
  lfs: PlaceLfsRow[];
  /** Each file it takes but its `.gitignore`, with its size. */
  sizes: Map<string, number>;
  /** Every file it takes but its `.gitignore`. */
  staged: string[];
}

/**
 * The place's plan: git's own reading of what is untracked and not ignored,
 * through a scratch git dir outside the place, then judged.
 */
const planOf = async (root: string, git: Git): Promise<Plan> => {
  const scratch = await mkdtemp(join(tmpdir(), "cawco-place-"));
  try {
    const gitDir = join(scratch, "probe.git");
    await git(scratch, "init", "-q", "--bare", gitDir);
    const listed = await untracked(root, git, gitDir);
    const { sizes, large, leftOut } = await judge(
      root,
      listed.filter((path) => path !== ".gitignore")
    );
    return {
      sizes,
      leftOut,
      lfs: lfsRowsOf(large),
      staged: [...sizes.keys()].sort(),
      bytes: [...sizes.values()].reduce((sum, size) => sum + size, 0),
    };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
};

/** The place's top-level entries the plan's bytes are most in, heaviest first: `node_modules/ (312.0 MB)`. */
const heaviest = (plan: Plan): string => {
  const byTop = new Map<string, number>();
  for (const [path, bytes] of plan.sizes) {
    const slash = path.indexOf("/");
    const top = slash === -1 ? path : path.slice(0, slash + 1);
    byTop.set(top, (byTop.get(top) ?? 0) + bytes);
  }
  return [...byTop]
    .sort((a, b) => b[1] - a[1])
    .slice(0, HEAVIEST)
    .map(([top, bytes]) => `${top} (${mb(bytes)})`)
    .join(", ");
};

/** The place's `.gitignore` as the first commit has it: the folder's own, then CawCo's block. */
const gitignoreText = (
  own: string | undefined,
  leftOut: readonly PlaceLeftOut[]
): string => {
  const block = ignoreBlock(leftOut);
  if (own === undefined) {
    return block;
  }
  return block
    ? `${own}${own.endsWith("\n") || own === "" ? "" : "\n"}\n${block}`
    : own;
};

/** The first commit's message: what it took and what it left out. */
const messageOf = (plan: Plan): string =>
  `CawCo: this folder's first commit\n\n${plan.staged.length + 1} files, ${mb(plan.bytes)}. ${plan.leftOut.length} paths left out and named in .gitignore: each holds what reads as a credential, is a large file, or is a git repository of its own. Nothing was pushed.`;

/**
 * Makes `root` a repository with the plan's files in one commit; on any
 * failure, its `.git` and the `.gitignore` change are taken back, so the
 * place is the folder it was.
 */
const commitPlan = async (
  root: string,
  plan: Plan,
  git: Git
): Promise<{ commit: string; plan: Plan; ignoreBytes: number }> => {
  const ignorePath = join(root, ".gitignore");
  const own = await readFile(ignorePath, "utf8").catch(
    (error: NodeJS.ErrnoException): string | undefined => {
      if (error.code === "ENOENT") {
        return;
      }
      throw error;
    }
  );
  const scratch = await mkdtemp(join(tmpdir(), "cawco-place-"));
  try {
    await git(root, "init", "-q", "-b", "main");
    let { leftOut, staged } = plan;
    const writeIgnore = () =>
      writeStateFile(ignorePath, gitignoreText(own, leftOut));
    await writeIgnore();
    const pathspecs = join(scratch, "pathspecs");
    await writeStateFile(pathspecs, [...staged, ".gitignore"].join("\0"));
    await git(
      root,
      "add",
      `--pathspec-from-file=${pathspecs}`,
      "--pathspec-file-nul"
    );
    // The staged set, scanned again as git holds it: a file that changed
    // since the plan read it goes back out.
    const index = nulList(await git(root, "ls-files", "-z", "--cached"));
    const { leftOut: hits } = await judge(
      root,
      index.filter((path) => path !== ".gitignore")
    );
    if (hits.length > 0) {
      await writeStateFile(pathspecs, hits.map((each) => each.path).join("\0"));
      await git(
        root,
        "rm",
        "--cached",
        "-q",
        `--pathspec-from-file=${pathspecs}`,
        "--pathspec-file-nul"
      );
      const hit = new Set(hits.map((each) => each.path));
      leftOut = [...leftOut, ...hits].sort((a, b) =>
        a.path.localeCompare(b.path)
      );
      staged = staged.filter((path) => !hit.has(path));
      await writeIgnore();
      await git(root, "add", "--", ".gitignore");
    }
    const taken = new Set(staged);
    const sizes = new Map([...plan.sizes].filter(([path]) => taken.has(path)));
    const kept: Plan = {
      leftOut,
      lfs: plan.lfs,
      staged,
      sizes,
      bytes: [...sizes.values()].reduce((sum, size) => sum + size, 0),
    };
    await git(
      root,
      ...AUTHOR,
      "commit",
      "-q",
      "--no-verify",
      "-m",
      messageOf(kept)
    );
    const commit = (await git(root, "rev-parse", "HEAD")).trim();
    return { commit, plan: kept, ignoreBytes: (await stat(ignorePath)).size };
  } catch (error) {
    await rm(join(root, ".git"), { recursive: true, force: true });
    await (own === undefined
      ? rm(ignorePath, { force: true })
      : writeStateFile(ignorePath, own));
    throw error;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
};

/**
 * Each folder's step in flight that may make it a git repository: this
 * module's first commit, and a move's prepare (move.ts `movePrepare`). They
 * run one at a time per folder, each after the last has finished either
 * way, so no two `git init` one folder at once and each reads the folder
 * the last one left.
 */
const turns = new Map<string, Promise<unknown>>();

/** Runs `step` on the folder at `root` once every step queued on it before has finished. */
export const placeTurn = <T>(
  root: string,
  step: () => Promise<T>
): Promise<T> => {
  const mine = (turns.get(root) ?? Promise.resolve())
    .catch(() => undefined)
    .then(step);
  turns.set(root, mine);
  const forget = () => {
    if (turns.get(root) === mine) {
      turns.delete(root);
    }
  };
  mine.then(forget, forget);
  return mine;
};

/** Resolves once every step queued on the folder at `root` has finished, either way. */
export const placeSettled = async (root: string): Promise<void> => {
  await turns.get(root)?.catch(() => undefined);
};

/** {@link CONTROL_PLACE_REPO}. */
export const placeRepo = (path: unknown): Promise<PlaceRepo> => {
  // A place's path is absolute: the hub stores no other (db placePathOn).
  const root = String(path);
  return placeTurn(root, () => placeRepoNow(root));
};

/** This machine's cache folder: `XDG_CACHE_HOME`, else where the platform keeps one under the home folder. */
const cacheFolder = (): string =>
  resolve(
    process.env.XDG_CACHE_HOME ||
      join(
        homedir(),
        process.platform === "darwin" ? "Library/Caches" : ".cache"
      )
  );

/** Whether `inner` is `outer` or lies in it. */
const isIn = (inner: string, outer: string): boolean =>
  inner === outer || inner.startsWith(outer === "/" ? "/" : `${outer}/`);

/**
 * Why `root` is no project's folder to make a git repository, or nothing:
 * this machine's home folder, a folder that holds it, or its cache folder,
 * one in it or one holding it. Each holds far more than a project (other
 * repositories, caches of models and packages, keys), so a first commit of
 * it is never what the person meant. Read from paths alone: nothing in the
 * folder is read.
 */
export const notAProject = (path: string): string | undefined => {
  const root = resolve(path);
  const home = resolve(homedir());
  const cache = cacheFolder();
  const instead =
    "Make a folder for the project, or pick its repository, and add that as its place instead.";
  if (root === home) {
    return `${root} is the home folder on this machine, which holds far more than one project, so CawCo won't make it a git repository. ${instead}`;
  }
  if (isIn(home, root)) {
    return `${root} holds the home folder ${home} on this machine, so CawCo won't make it a git repository. ${instead}`;
  }
  if (isIn(root, cache)) {
    return `${root} ${root === cache ? "is" : "is in"} this machine's cache folder ${cache}, so CawCo won't make it a git repository. ${instead}`;
  }
  if (isIn(cache, root)) {
    return `${root} holds this machine's cache folder ${cache}, so CawCo won't make it a git repository. ${instead}`;
  }
  return undefined;
};

/**
 * The top of the git checkout `path` is in, or undefined when it is in
 * none. Throws when git can't tell, or when `path` is inside a
 * repository's own directory rather than a checkout of it.
 */
const repoTop = async (path: string, git: Git): Promise<string | undefined> => {
  const couldNotTell = (error: Error): Error =>
    new Error(
      `CawCo couldn't tell whether ${path} is in a git repository: ${error.message}`,
      { cause: error }
    );
  const inside = await git(path, "rev-parse", "--is-inside-work-tree").then(
    (out) => out.trim(),
    (error: Error) => {
      if (error instanceof GitFailed && error.code === NOT_A_REPO_EXIT) {
        return;
      }
      throw couldNotTell(error);
    }
  );
  if (inside === undefined) {
    return undefined;
  }
  if (inside !== "true") {
    throw new Error(
      `${path} is inside a git repository's own directory, not a checkout of it, so CawCo leaves the folder as it is.`
    );
  }
  return await git(path, "rev-parse", "--show-toplevel").then(
    (out) => out.trim(),
    (error: Error) => {
      throw couldNotTell(error);
    }
  );
};

/**
 * {@link CONTROL_REPO_ROOT}: the top of the git checkout the folder at
 * `path` is in, or null when it is in none. Reads only; a folder that is
 * not there is refused. Asked only before a workspace is cut (hub
 * place-repo.ts `beforeCut`), so a machine that lacks what a workspace
 * needs refuses here first, before the folder is read.
 */
export const repoRoot = async (path: unknown): Promise<string | null> => {
  refuseShortOfWorkspace();
  const folder = String(path);
  const info = await stat(folder).catch(() => undefined);
  if (!info?.isDirectory()) {
    throw new Error(`${folder} is not a folder on this machine.`);
  }
  return (
    (await repoTop(folder, gitIn(Date.now() + WORKSPACE_GIT_TIMEOUT_MS))) ??
    null
  );
};

const placeRepoNow = async (root: string): Promise<PlaceRepo> => {
  const info = await stat(root).catch(() => undefined);
  if (!info?.isDirectory()) {
    throw new Error(
      `${root} is not a folder on this machine, so CawCo can't make it a git repository.`
    );
  }
  const git = gitIn(Date.now() + WORKSPACE_GIT_TIMEOUT_MS);
  const top = await repoTop(root, git);
  if (top !== undefined) {
    return { state: "checkout", root: top };
  }
  const refused = notAProject(root);
  if (refused) {
    throw new Error(refused);
  }
  // One git cannot read is someone's, and a failed run would take it back
  // with its own: it is left alone, and so is the place.
  const unread = await gitAbove(root);
  if (unread) {
    throw new Error(
      `${root} is under ${unread}, which git does not read as a repository, so CawCo leaves the folder as it is. Repair or remove that .git, and start the work again.`
    );
  }
  const plan = await planOf(root, git).catch((error: Error) => {
    throw new Error(
      `CawCo couldn't read ${root} to make it a git repository: ${error.message}`,
      {
        cause: error,
      }
    );
  });
  if (plan.bytes > PLACE_REPO_LIMIT_BYTES) {
    throw new Error(
      `${root} holds ${mb(plan.bytes)} its ignore rules leave in, past the ${mb(PLACE_REPO_LIMIT_BYTES)} a place's first commit takes, so it stays a folder and no workspace can be cut from it. Most of it is in ${heaviest(plan)}: name what is not the project's in its .gitignore, or make it a git repository yourself.`
    );
  }
  const made = await commitPlan(root, plan, git).catch((error: Error) => {
    throw new Error(
      `CawCo couldn't make ${root} a git repository: ${error.message}`,
      {
        cause: error,
      }
    );
  });
  console.info(
    `[place-repo] ${root}: a git repository now, first commit ${made.commit.slice(0, 9)} with ${made.plan.staged.length + 1} files; ${made.plan.leftOut.length} paths left out`
  );
  return {
    state: "made",
    root,
    commit: made.commit,
    files: made.plan.staged.length + 1,
    bytes: made.plan.bytes + made.ignoreBytes,
    staged: [...made.plan.staged, ".gitignore"].sort(),
    leftOut: made.plan.leftOut,
    lfs: made.plan.lfs,
  };
};

/** `.gitignore`'s text with CawCo's lines for `paths` taken out, and its heading when none of its lines is left. */
const unignored = (text: string, paths: readonly string[]): string => {
  const gone = new Set(paths.map(ignoreLine));
  const lines = text.split("\n").filter((line) => !gone.has(line));
  const head = lines.indexOf(IGNORE_HEADING);
  if (head >= 0 && !(lines[head + 1] ?? "").startsWith("/")) {
    lines.splice(head, 1);
  }
  return lines.join("\n");
};

/** Whether `path` is `root` or lies inside it. */
const under = (path: string, root: string): boolean =>
  path === root || path.startsWith(`${root}${sep}`);

/**
 * {@link CONTROL_PLACE_LFS}: the large files a place's first commit left out
 * (`rows`, as its offer named them) committed through Git LFS, by
 * git-lfs-migrate(1)'s no-rewrite path: `git lfs track <patterns>`, their
 * lines taken out of CawCo's block in `.gitignore`, then one commit as
 * CawCo of `.gitattributes`, `.gitignore`, those files, and the files
 * already committed that a pattern now covers, cleaned again (`git add
 * --renormalize`). Only those paths are committed (`--only`): whatever else
 * the person has changed or staged is left as it was. Each file is scanned
 * for a credential first, as the first commit's were. git-lfs's filters are
 * named here, whatever this machine's own config names, and set up in the
 * folder's own git as `git lfs install --local` sets them: its filters,
 * then git-lfs's hooks, so the person's own push sends the large files with
 * it. A pre-push hook of the folder's own is left as it is, and said
 * (`hooks` false), as git-lfs itself refuses to overwrite it.
 */
export const placeLfs = async (
  path: unknown,
  rows: unknown
): Promise<PlaceLfsMade> => {
  const root = String(path);
  const offered = (Array.isArray(rows) ? rows : []) as PlaceLfsRow[];
  const patterns = offered.map((row) => row.pattern);
  const files = offered.flatMap((row) => row.paths);
  if (patterns.length === 0) {
    throw new Error("No large files were named to commit through Git LFS.");
  }
  if (!Bun.which("git-lfs")) {
    throw new Error(
      "git-lfs is not installed on this machine, so its large files can't be committed through it. Install git-lfs there and track them again."
    );
  }
  const git = gitIn(Date.now() + WORKSPACE_GIT_TIMEOUT_MS, LFS_FILTERS);
  const top = (await git(root, "rev-parse", "--show-toplevel")).trim();
  if (top !== root) {
    throw new Error(
      `${root} is not the root of a git repository any more, so CawCo commits nothing there.`
    );
  }
  let bytes = 0;
  for (const file of files) {
    const info = await lstat(join(root, file)).catch(() => undefined);
    if (!(info?.isFile() && under(resolve(root, file), root))) {
      throw new Error(
        `${file} is no longer a file in ${root}, so nothing was committed. Its offer named it; track the rest yourself with \`git lfs track\`.`
      );
    }
    bytes += info.size;
  }
  const hits = await credentialHits(root, files);
  if (hits.length > 0) {
    throw new Error(
      `Nothing was committed: ${hits.map((hit) => `${hit.path} (${hit.why})`).join(", ")}.`
    );
  }
  await git(root, "lfs", "track", "--", ...patterns);
  // The folder's own git cleans and smudges what it tracks now, whatever
  // this machine's global config names: without the filters there, every
  // tracked file reads as changed in the person's `git status`.
  await git(root, "lfs", "install", "--local", "--skip-repo");
  const ignorePath = join(root, ".gitignore");
  const ignore = await readFile(ignorePath, "utf8").catch(() => undefined);
  if (ignore !== undefined) {
    await writeStateFile(ignorePath, unignored(ignore, files));
  }
  const covered = nulList(
    await gitIn(Date.now() + WORKSPACE_GIT_TIMEOUT_MS, LFS_FILTERS, false)(
      root,
      "ls-files",
      "-z",
      "--cached",
      "--",
      ...patterns.map((pattern) =>
        pattern.startsWith("*.")
          ? `:(glob)**/${pattern}`
          : `:(literal)${pattern}`
      )
    )
  );
  const scratch = await mkdtemp(join(tmpdir(), "cawco-place-"));
  try {
    const pathspecs = join(scratch, "pathspecs");
    const add = async (...args: string[]) => {
      await git(
        root,
        ...args,
        `--pathspec-from-file=${pathspecs}`,
        "--pathspec-file-nul"
      );
    };
    await writeStateFile(
      pathspecs,
      [
        ".gitattributes",
        ...(ignore === undefined ? [] : [".gitignore"]),
        ...files,
      ].join("\0")
    );
    await add("add");
    const all = [
      ".gitattributes",
      ...(ignore === undefined ? [] : [".gitignore"]),
      ...files,
      ...covered,
    ];
    if (covered.length > 0) {
      await writeStateFile(pathspecs, covered.join("\0"));
      await add("add", "--renormalize");
    }
    await writeStateFile(pathspecs, all.join("\0"));
    await add(
      ...AUTHOR,
      "commit",
      "-q",
      "--no-verify",
      "--only",
      "-m",
      `CawCo: large files through Git LFS\n\n${files.length} ${files.length === 1 ? "file" : "files"}, ${mb(bytes)}, tracked as ${patterns.join(", ")}, by git-lfs-migrate(1)'s no-rewrite path. Nothing was pushed.`
    );
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
  const commit = (await git(root, "rev-parse", "HEAD")).trim();
  const hooks = await git(
    root,
    "-c",
    `core.hooksPath=${await hooksDir(root, git)}`,
    "lfs",
    "install",
    "--local"
  ).then(
    () => true,
    () => false
  );
  console.info(
    `[place-repo] ${root}: ${files.length} large files committed through Git LFS in ${commit.slice(0, 9)}, tracked as ${patterns.join(" ")}${hooks ? "" : "; git-lfs's hooks not installed, the folder has its own"}`
  );
  return { commit, files: files.length, bytes, patterns, hooks };
};

/**
 * Where the folder's own git runs its hooks: its `core.hooksPath` (its own
 * config's, else the person's global one), or `.git/hooks`. Read from those
 * files, not as CawCo's git sees it, which runs none (`safe-git.ts`).
 */
const hooksDir = async (root: string, git: Git): Promise<string> => {
  const named = (scope: string) =>
    git(root, "config", scope, "--get", "core.hooksPath").then(
      (out) => out.trim(),
      () => ""
    );
  const set = (await named("--local")) || (await named("--global"));
  if (!set) {
    return join(root, ".git", "hooks");
  }
  return set.startsWith("~/")
    ? join(homedir(), set.slice(2))
    : resolve(root, set);
};
