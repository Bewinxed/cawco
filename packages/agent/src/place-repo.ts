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
 * it: `Sessions.swift` and `tokens/` are a project's own.
 *
 * What is left out is written into the place's `.gitignore` first, so the
 * owner's own `git status` there stays clean and a later `git add` takes no
 * key. When what is left to commit passes {@link PLACE_REPO_LIMIT_BYTES},
 * nothing is written and the place stays a folder, its heaviest folders
 * named. The plan is read through a scratch git dir outside the place, so a
 * dry run writes nothing in it; a real run then makes `.git`, stages exactly
 * the plan's files, scans what is staged once more, and commits as CawCo.
 * Nothing is pushed and no remote is added. A run that fails after
 * `git init` takes its `.git` and `.gitignore` change back.
 */
import { lstat, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  credentialIn,
  PLACE_REPO_LIMIT_BYTES,
  type PlaceLeftOut,
  type PlaceRepo,
  WORKSPACE_GIT_TIMEOUT_MS,
} from "@cawco/core";
import { readWithin } from "@cawco/core/bounded";
import { SAFE_GIT_ENV, safeGitArgv } from "@cawco/core/safe-git";
import { hostEnvironment } from "@cawco/core/session-env";
import { writeStateFile } from "@cawco/core/state-file";
import type { Subprocess } from "bun";

/** Who the first commit is by: CawCo, at an address that takes no mail. */
const AUTHOR = [
  "-c",
  "user.name=CawCo",
  "-c",
  "user.email=noreply@cawco.invalid",
];

/** git's own words for a folder in no repository (setup.c, every version since 1.x). */
const NOT_A_REPO = /not a git repository/i;

/** How much of a file the credential scan reads for a NUL, to tell text from binary. */
const BINARY_PROBE = 8000;

const MB = 1024 * 1024;
const mb = (bytes: number): string => `${(bytes / MB).toFixed(1)} MB`;

/** What a `.gitignore` pattern reads as a glob or a comment, escaped to name a path exactly. */
const IGNORE_SPECIAL = /[\\*?[\]!#]/g;
const TRAILING_SPACE = / $/;

/** How many of a place's heaviest folders a refusal names. */
const HEAVIEST = 3;

/** One `.gitignore` line naming `path` exactly, from the root: git's glob and comment characters escaped. */
const ignoreLine = (path: string): string =>
  `/${path.replace(IGNORE_SPECIAL, (char) => `\\${char}`).replace(TRAILING_SPACE, "\\ ")}`;

/** The block the place's `.gitignore` gets: every path left out, one line each. */
const ignoreBlock = (leftOut: readonly PlaceLeftOut[]): string =>
  leftOut.length === 0
    ? ""
    : `# CawCo left these out of this folder's first commit: each holds what reads as a credential, or is a git repository of its own.\n${leftOut
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
    default: {
      const unhandled: never = ran;
      throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
    }
  }
};

/** git as `safe-git.ts` says, in `cwd`, with pathspecs read literally (a file named `*` is that file). */
const spawnGit = (
  cwd: string,
  args: readonly string[],
  signal: AbortSignal,
  stdin: "ignore" | Blob = "ignore"
) =>
  Bun.spawn(safeGitArgv([...args]), {
    cwd,
    env: {
      ...hostEnvironment(),
      ...SAFE_GIT_ENV,
      GIT_LITERAL_PATHSPECS: "1",
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
  if (code !== 0) {
    throw new Error(
      child.signalCode
        ? `git ${args[0]} was ended by ${child.signalCode}`
        : `git ${args[0]} failed: ${stderr.trim() || `exit ${code}`}`
    );
  }
};

/**
 * git in `cwd`, its stdout as written (never trimmed: a NUL-separated
 * list's first name may start with a space). git's stderr is the error.
 */
const gitIn =
  (deadline: number) =>
  (cwd: string, ...args: string[]): Promise<string> =>
    within(deadline, `git ${args[0]}`, async (signal) => {
      const child = spawnGit(cwd, args, signal);
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

const utf8 = new TextDecoder();

/** What reads as a credential in `bytes`, when they are text; undefined for binary or for none. */
const credentialOf = (bytes: Uint8Array): string | undefined =>
  bytes.subarray(0, BINARY_PROBE).includes(0)
    ? undefined
    : credentialIn(utf8.decode(bytes));

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

/** What becomes of the paths git listed: the files a commit may take, by path, with their sizes, and what is left out and why. */
interface Judged {
  leftOut: PlaceLeftOut[];
  sizes: Map<string, number>;
}

/**
 * The paths git listed, judged: a repository of its own is left out, as git
 * takes none of its files; so is a file whose text reads as a credential.
 * A file or link is taken (a link as git takes one: its target's path, never
 * what it leads to); anything else git would not take either.
 */
const judge = async (
  root: string,
  listed: readonly string[]
): Promise<Judged> => {
  const sizes = new Map<string, number>();
  const leftOut: PlaceLeftOut[] = [];
  for (const path of listed) {
    if (path.endsWith("/")) {
      leftOut.push({ path, why: "a git repository of its own" });
      continue;
    }
    const full = join(root, path);
    // biome-ignore lint/performance/noAwaitInLoops: one file in memory at a time
    const info = await lstat(full).catch(() => undefined);
    if (info?.isSymbolicLink()) {
      sizes.set(path, 0);
    } else if (info?.isFile()) {
      const found = credentialOf(await readFile(full));
      if (found) {
        leftOut.push({ path, why: `its text holds what reads as ${found}` });
      } else {
        sizes.set(path, info.size);
      }
    }
  }
  return {
    sizes,
    leftOut: leftOut.sort((a, b) => a.path.localeCompare(b.path)),
  };
};

/** A newline, which ends each header `git cat-file --batch` writes. */
const NEWLINE = 10;

/**
 * `git cat-file --batch`'s answer, fed as it arrives: `<oid> <type> <size>`,
 * a newline, the object's bytes and a newline, for each object asked; an
 * `<oid> missing` line for one there is not. Each blob is handed to `each`
 * whole, one at a time.
 */
class BatchReader {
  readonly #each: (oid: string, bytes: Uint8Array) => void;
  readonly #decoder = new TextDecoder();
  #header = "";
  #oid = "";
  #kind = "";
  #body: Uint8Array | undefined;
  #filled = 0;
  /** Bytes to pass over before the next header: the newline after an object. */
  #skip = 0;

  constructor(each: (oid: string, bytes: Uint8Array) => void) {
    this.#each = each;
  }

  feed(chunk: Uint8Array): void {
    let at = 0;
    while (at < chunk.length) {
      if (this.#skip > 0) {
        this.#skip -= 1;
        at += 1;
      } else if (this.#body) {
        at = this.#fill(chunk, at);
      } else {
        at = this.#readHeader(chunk, at);
      }
    }
  }

  /** Copies what of the object's bytes `chunk` holds from `at`; answers where it stopped. */
  #fill(chunk: Uint8Array, at: number): number {
    const body = this.#body as Uint8Array;
    const n = Math.min(body.length - this.#filled, chunk.length - at);
    body.set(chunk.subarray(at, at + n), this.#filled);
    this.#filled += n;
    if (this.#filled === body.length) {
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
      this.#kind = type;
      this.#body = new Uint8Array(Number(size));
      this.#filled = 0;
      if (this.#body.length === 0) {
        this.#done();
      }
    }
    return end + 1;
  }

  #done(): void {
    if (this.#body && this.#kind === "blob") {
      this.#each(this.#oid, this.#body);
    }
    this.#body = undefined;
    this.#skip = 1;
  }
}

/**
 * Hands each blob `oids` name in `root` to `each`, read through one
 * `git cat-file --batch`, a blob at a time: a history is read whole without
 * holding more than its largest file.
 */
const eachBlob = (
  root: string,
  oids: readonly string[],
  deadline: number,
  each: (oid: string, bytes: Uint8Array) => void
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
  await eachBlob(root, [...pathOf.keys()], deadline, (oid, bytes) => {
    const path = pathOf.get(oid) ?? oid;
    const found = credentialOf(bytes);
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
    const { sizes, leftOut } = await judge(
      root,
      listed.filter((path) => path !== ".gitignore")
    );
    return {
      sizes,
      leftOut,
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
  `CawCo: this folder's first commit\n\n${plan.staged.length + 1} files, ${mb(plan.bytes)}. ${plan.leftOut.length} paths left out and named in .gitignore: each holds what reads as a credential, or is a git repository of its own. Nothing was pushed.`;

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

/** Each place's run in flight: two starts at once make one repository. */
const making = new Map<string, Promise<PlaceRepo>>();

/** {@link CONTROL_PLACE_REPO}. */
export const placeRepo = (
  path: unknown,
  dryRun?: unknown
): Promise<PlaceRepo> => {
  // A place's path is absolute: the hub stores no other (db placePathOn).
  const root = String(path);
  if (dryRun === true) {
    return placeRepoNow(root, true);
  }
  const mine = (making.get(root) ?? Promise.resolve())
    .catch(() => undefined)
    .then(() => placeRepoNow(root, false));
  making.set(root, mine);
  const forget = () => {
    if (making.get(root) === mine) {
      making.delete(root);
    }
  };
  mine.then(forget, forget);
  return mine;
};

const placeRepoNow = async (root: string, dry: boolean): Promise<PlaceRepo> => {
  const info = await stat(root).catch(() => undefined);
  if (!info?.isDirectory()) {
    throw new Error(
      `${root} is not a folder on this machine, so CawCo can't make it a git repository.`
    );
  }
  const git = gitIn(Date.now() + WORKSPACE_GIT_TIMEOUT_MS);
  const top = await git(root, "rev-parse", "--show-toplevel").then(
    (out) => out.trim(),
    (error: Error) => {
      if (NOT_A_REPO.test(error.message)) {
        return;
      }
      throw new Error(
        `CawCo couldn't tell whether ${root} is in a git repository: ${error.message}`,
        { cause: error }
      );
    }
  );
  if (top) {
    return { state: "checkout", root: top };
  }
  // One git cannot read is someone's, and a failed run would take it back
  // with its own: it is left alone, and so is the place.
  if (await lstat(join(root, ".git")).then(Boolean, () => false)) {
    throw new Error(
      `${root} has a .git that git does not read as a repository, so CawCo leaves the folder as it is. Repair or remove that .git, and start the work again.`
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
  if (dry) {
    const ignore = Buffer.byteLength(
      gitignoreText(
        await readFile(join(root, ".gitignore"), "utf8").catch(() => undefined),
        plan.leftOut
      )
    );
    return {
      state: "plan",
      root,
      commit: null,
      files: plan.staged.length + 1,
      bytes: plan.bytes + ignore,
      staged: [...plan.staged, ".gitignore"].sort(),
      leftOut: plan.leftOut,
    };
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
  };
};
