/**
 * {@link CONTROL_PLACE_REPO}: a project's place made a git repository on its
 * machine, so every workspace is a clone (workspace.ts). The hub asks for it
 * when a place that is a plain folder is first needed (hub place-repo.ts):
 * the person is never asked to run `git init`.
 *
 * What the first commit never takes, each named in the answer with why:
 *
 * - anything in a folder no one but its owner may open (group and others
 *   have no permission bits: mode 0700), and any file no one but its owner
 *   may read (mode 0600);
 * - files named like secrets (`.env*`, `*.pem`, `*key*`, `id_*`, cookies,
 *   tokens, sessions, credentials, `*.sqlite`, `*.db`), folders so named, and
 *   browser profiles (a folder holding a browser's cookie or login store);
 * - any file over {@link PLACE_REPO_FILE_LIMIT_BYTES};
 * - dependency and build trees (`PACKAGE_TREES`: node_modules, .venv, dist,
 *   build, .next, target and the like);
 * - links that lead outside the place, and folders that are git repositories
 *   of their own;
 * - what the folder's own `.gitignore` files ignore;
 * - any staged file whose text reads as a credential (core secret-text.ts).
 *
 * Everything left out is written into the place's `.gitignore` first, so the
 * owner's own `git status` there stays clean. When what is left to commit
 * passes {@link PLACE_REPO_LIMIT_BYTES}, nothing is written and the place
 * stays a folder. The plan is read through a scratch git dir outside the
 * place, so a dry run writes nothing in it; a real run then makes `.git`,
 * stages exactly the plan's files, scans what is staged once more, and
 * commits as CawCo. Nothing is pushed and no remote is added. A run that
 * fails after `git init` takes its `.git` and `.gitignore` change back.
 */
import {
  lstat,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  realpath,
  rm,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import {
  credentialIn,
  PLACE_REPO_FILE_LIMIT_BYTES,
  PLACE_REPO_LIMIT_BYTES,
  type PlaceLeftOut,
  type PlaceRepo,
  WORKSPACE_GIT_TIMEOUT_MS,
} from "@cawco/core";
import { isSecretFileName } from "@cawco/core/paths";
import { SAFE_GIT_ENV, safeGitArgv } from "@cawco/core/safe-git";
import { hostEnvironment } from "@cawco/core/session-env";
import { writeStateFile } from "@cawco/core/state-file";
import { expandHome } from "./fs";
import { PACKAGE_TREES } from "./workspace";

/** Who the first commit is by: CawCo, at an address that takes no mail. */
const AUTHOR = [
  "-c",
  "user.name=CawCo",
  "-c",
  "user.email=noreply@cawco.invalid",
];

/** git's own words for a folder in no repository (setup.c, every version since 1.x). */
const NOT_A_REPO = /not a git repository/i;

/** Names a browser keeps its cookies and logins under, in a profile folder (Chromium's, Firefox's). */
const BROWSER_STORES = new Set([
  "Cookies",
  "Login Data",
  "Local State",
  "Web Data",
  "cookies.sqlite",
  "key4.db",
  "logins.json",
]);

/** How much of a file the credential scan reads for a NUL, to tell text from binary. */
const BINARY_PROBE = 8000;

const MB = 1024 * 1024;
const mb = (bytes: number): string => `${(bytes / MB).toFixed(1)} MB`;

/** A database file's name, its journals included. */
const DATABASE = /\.(sqlite3?|db)(-wal|-shm|-journal)?$/;
/** What a `.gitignore` pattern reads as a glob or a comment, escaped to name a path exactly. */
const IGNORE_SPECIAL = /[\\*?[\]!#]/g;
const TRAILING_SPACE = / $/;

/** Why a file or folder named `name` is left out by its name; undefined when its name is fine. */
const secretName = (name: string): string | undefined => {
  const lower = name.toLowerCase();
  if (isSecretFileName(name)) {
    return "an environment file, which holds keys";
  }
  if (lower.endsWith(".pem")) {
    return "a certificate or key file";
  }
  if (lower.startsWith("id_")) {
    return "named like an SSH key";
  }
  if (DATABASE.test(lower)) {
    return "a database file";
  }
  for (const [word, why] of [
    ["cookie", "a cookie store"],
    ["token", "named like a token"],
    ["session", "a session store"],
    ["credential", "named like a credential"],
    ["secret", "named like a secret"],
    ["passw", "named like a password store"],
    ["key", "named like a key"],
  ] as const) {
    if (lower.includes(word)) {
      return why;
    }
  }
  return undefined;
};

/** Whether `path` is `root` or lies inside it. */
const within = (path: string, root: string): boolean =>
  path === root || path.startsWith(`${root}${sep}`);

/** What a walk of the place found: the files a commit may take, by path, with their sizes, and what it left out. */
interface Walked {
  candidates: Map<string, number>;
  leftOut: PlaceLeftOut[];
}

/**
 * What becomes of one entry of the place: a file the commit may take (its
 * size; a link takes none), a folder to read on into, or left out and why.
 */
type Verdict =
  | { kind: "take"; bytes: number }
  | { kind: "enter" }
  | { kind: "leave"; why: string };

const leave = (why: string): Verdict => ({ kind: "leave", why });

/** Whether a mode lets no one but its owner in: no group or other bits (0700, 0600). */
const ownerOnly = (mode: number): boolean =>
  // biome-ignore lint/suspicious/noBitwiseOperators: a mode's group and other bits
  (mode & 0o077) === 0;

/** A mode as `ls` and `chmod` write it: `0700`. */
const modeOf = (mode: number): string =>
  // biome-ignore lint/suspicious/noBitwiseOperators: a mode's permission bits
  (mode & 0o777).toString(8).padStart(4, "0");

/** A link: taken when it leads inside the place, followed through every link on the way. */
const linkVerdict = async (
  full: string,
  roots: readonly string[]
): Promise<Verdict> => {
  const target = await readlink(full);
  const landing = await realpath(full).catch(() =>
    resolve(dirname(full), target)
  );
  return roots.some((root) => within(landing, root))
    ? { kind: "take", bytes: 0 }
    : leave(`a link to ${target}, outside the folder`);
};

/** A folder: left out whole by its kind, its mode or its name, else read on into. */
const folderVerdict = async (
  full: string,
  name: string,
  mode: number
): Promise<Verdict> => {
  if (PACKAGE_TREES.has(name)) {
    return leave("dependencies or build output");
  }
  if (await lstat(join(full, ".git")).then(Boolean, () => false)) {
    return leave("a git repository of its own");
  }
  if (ownerOnly(mode)) {
    return leave(
      `a private folder (mode ${modeOf(mode)}): only its owner may open it`
    );
  }
  const named = secretName(name);
  if (named) {
    return leave(named);
  }
  const inside = await readdir(full).catch(() => [] as string[]);
  return inside.some((entry) => BROWSER_STORES.has(entry))
    ? leave("a browser profile, with its cookies and logins")
    : { kind: "enter" };
};

/** A file: left out by its mode, its name or its size, else taken. */
const fileVerdict = (name: string, mode: number, size: number): Verdict => {
  if (ownerOnly(mode)) {
    return leave(
      `a private file (mode ${modeOf(mode)}): only its owner may read it`
    );
  }
  const named = secretName(name);
  if (named) {
    return leave(named);
  }
  return size > PLACE_REPO_FILE_LIMIT_BYTES
    ? leave(
        `${mb(size)}, past the ${mb(PLACE_REPO_FILE_LIMIT_BYTES)} a file in the first commit may be`
      )
    : { kind: "take", bytes: size };
};

/** One entry's {@link Verdict}, read with `lstat`: a link is never followed into. */
const verdictOf = async (
  full: string,
  name: string,
  roots: readonly string[]
): Promise<Verdict> => {
  const info = await lstat(full);
  if (info.isSymbolicLink()) {
    return linkVerdict(full, roots);
  }
  if (info.isDirectory()) {
    return folderVerdict(full, name, info.mode);
  }
  return info.isFile()
    ? fileVerdict(name, info.mode, info.size)
    : leave("not a regular file");
};

/** Reads the place, deciding each entry by the rules above; never follows a link. */
const walk = async (root: string): Promise<Walked> => {
  const candidates = new Map<string, number>();
  const leftOut: PlaceLeftOut[] = [];
  const roots = [root, await realpath(root)];
  const pending = [root];
  for (let dir = pending.pop(); dir !== undefined; dir = pending.pop()) {
    // biome-ignore lint/performance/noAwaitInLoops: one folder at a time keeps the walk's open files to a handful
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (dir === root && entry.name === ".git") {
        continue;
      }
      const full = join(dir, entry.name);
      const rel = relative(root, full).split(sep).join("/");
      // biome-ignore lint/performance/noAwaitInLoops: one entry at a time, in the folder's order
      const verdict = await verdictOf(full, entry.name, roots);
      if (verdict.kind === "enter") {
        pending.push(full);
      } else if (verdict.kind === "take") {
        candidates.set(rel, verdict.bytes);
      } else {
        const folder = entry.isDirectory() ? "/" : "";
        leftOut.push({ path: `${rel}${folder}`, why: verdict.why });
      }
    }
  }
  return { candidates, leftOut };
};

/** One `.gitignore` line naming `path` exactly, from the root: git's glob and comment characters escaped. */
const ignoreLine = (path: string): string =>
  `/${path.replace(IGNORE_SPECIAL, (char) => `\\${char}`).replace(TRAILING_SPACE, "\\ ")}`;

/** The block the place's `.gitignore` gets: every path left out, one line each. */
const ignoreBlock = (leftOut: readonly PlaceLeftOut[]): string =>
  leftOut.length === 0
    ? ""
    : `# CawCo left these out of this folder's first commit: private, secret, large or generated.\n${leftOut
        .map((each) => ignoreLine(each.path))
        .join("\n")}\n`;

/**
 * git as `safe-git.ts` says, in `cwd`, its stdout as written (never trimmed:
 * a NUL-separated list's first name may start with a space). Pathspecs are
 * literal, so a file named `*` is that file. git's stderr is the error.
 */
const gitIn =
  (deadline: number) =>
  async (cwd: string, ...args: string[]): Promise<string> => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new Error(`git exceeded ${WORKSPACE_GIT_TIMEOUT_MS / 1000}s`);
    }
    const child = Bun.spawn(safeGitArgv(args), {
      cwd,
      env: {
        ...hostEnvironment(),
        ...SAFE_GIT_ENV,
        GIT_LITERAL_PATHSPECS: "1",
      },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      timeout: remaining,
      killSignal: "SIGKILL",
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (code !== 0) {
      throw new Error(
        child.signalCode === "SIGKILL"
          ? `git ${args[0]} exceeded ${WORKSPACE_GIT_TIMEOUT_MS / 1000}s`
          : `git ${args[0]} failed: ${stderr.trim() || `exit ${code}`}`
      );
    }
    return stdout;
  };

type Git = ReturnType<typeof gitIn>;

const nulList = (text: string): string[] => text.split("\0").filter(Boolean);

/** The staged files' paths whose text reads as a credential, each with what it found. */
const credentialHits = async (
  root: string,
  paths: readonly string[]
): Promise<PlaceLeftOut[]> => {
  const hits: PlaceLeftOut[] = [];
  for (const path of paths) {
    const full = join(root, path);
    // biome-ignore lint/performance/noAwaitInLoops: one file in memory at a time, each up to the file limit
    const info = await lstat(full).catch(() => undefined);
    if (!info?.isFile()) {
      continue;
    }
    const bytes = await readFile(full);
    if (bytes.subarray(0, BINARY_PROBE).includes(0)) {
      continue;
    }
    const found = credentialIn(bytes.toString("utf8"));
    if (found) {
      hits.push({
        path,
        why: `its text holds what reads as ${found}`,
      });
    }
  }
  return hits;
};

/** Whether `rule` (a file, or a folder ending in `/`) covers `path`. */
const covers = (rule: PlaceLeftOut, path: string): boolean =>
  path === rule.path || (rule.path.endsWith("/") && path.startsWith(rule.path));

/**
 * A place that is already a repository, read for publishing
 * (CONTROL_PLACE_PUSH): `leftOut`, every path the first commit's rules keep
 * out that its commits do not hold, with why; `refused`, every committed
 * path those rules or the credential scan would have kept out, which no
 * publish takes.
 */
export const publishCheck = async (
  root: string,
  tracked: readonly string[]
): Promise<{ leftOut: PlaceLeftOut[]; refused: PlaceLeftOut[] }> => {
  const { leftOut } = await walk(root);
  const refused = tracked.flatMap((path) => {
    const rule = leftOut.find((one) => covers(one, path));
    return rule ? [{ path, why: rule.why }] : [];
  });
  const ruled = new Set(refused.map((one) => one.path));
  const scanned = await credentialHits(
    root,
    tracked.filter((path) => !ruled.has(path))
  );
  return {
    leftOut: leftOut
      .filter((rule) => !tracked.some((path) => covers(rule, path)))
      .sort((a, b) => a.path.localeCompare(b.path)),
    refused: [...refused, ...scanned],
  };
};

/** What a first commit would take, read without writing in the place. */
interface Plan {
  bytes: number;
  leftOut: PlaceLeftOut[];
  /** Every file it takes but its `.gitignore`. */
  staged: string[];
}

/**
 * The place's plan: the walk, then git's own reading of what is untracked
 * and not ignored (every `.gitignore` the folder has, and the block for what
 * the walk left out) through a scratch git dir outside the place, then the
 * credential scan of what is left.
 */
const planOf = async (root: string, git: Git): Promise<Plan> => {
  const { candidates, leftOut } = await walk(root);
  const scratch = await mkdtemp(join(tmpdir(), "cawco-place-"));
  try {
    const gitDir = join(scratch, "probe.git");
    await git(scratch, "init", "-q", "--bare", gitDir);
    const exclude = join(scratch, "exclude");
    await writeStateFile(exclude, ignoreBlock(leftOut));
    const listed = new Set(
      nulList(
        await git(
          root,
          `--git-dir=${gitDir}`,
          `--work-tree=${root}`,
          "-c",
          "core.bare=false",
          "ls-files",
          "-z",
          "--others",
          "--exclude-standard",
          `--exclude-from=${exclude}`
        )
      )
    );
    const kept: string[] = [];
    for (const path of [...candidates.keys()].sort()) {
      if (listed.has(path)) {
        kept.push(path);
      } else if (path !== ".gitignore") {
        leftOut.push({ path, why: "ignored by the folder's own .gitignore" });
      }
    }
    const hits = await credentialHits(root, kept);
    const hit = new Set(hits.map((each) => each.path));
    leftOut.push(...hits);
    const staged = kept.filter(
      (path) => !hit.has(path) && path !== ".gitignore"
    );
    return {
      staged,
      leftOut: leftOut.sort((a, b) => a.path.localeCompare(b.path)),
      bytes: staged.reduce((sum, path) => sum + (candidates.get(path) ?? 0), 0),
    };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
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
  `CawCo: this folder's first commit\n\n${plan.staged.length + 1} files, ${mb(plan.bytes)}. ${plan.leftOut.length} paths left out and named in .gitignore: private, secret, large or generated. Nothing was pushed.`;

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
    const hits = await credentialHits(
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
    const kept: Plan = {
      leftOut,
      staged,
      bytes:
        hits.length > 0 ? plan.bytes - (await sizes(root, hits)) : plan.bytes,
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

/** The sizes of `hits` added up, for a commit that left them out after its plan. */
const sizes = async (
  root: string,
  hits: readonly PlaceLeftOut[]
): Promise<number> =>
  (
    await Promise.all(
      hits.map((each) =>
        lstat(join(root, each.path)).then(
          (info) => info.size,
          () => 0
        )
      )
    )
  ).reduce((sum, size) => sum + size, 0);

/** Each place's run in flight: two starts at once make one repository. */
const making = new Map<string, Promise<PlaceRepo>>();

/** {@link CONTROL_PLACE_REPO}. */
export const placeRepo = (
  path: unknown,
  dryRun?: unknown
): Promise<PlaceRepo> => {
  const root = expandHome(String(path));
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
      `${root} holds ${mb(plan.bytes)} CawCo would commit, past the ${mb(PLACE_REPO_LIMIT_BYTES)} a place's first commit takes, so it stays a folder and no workspace can be cut from it. Move the large files out of it, or make it a git repository yourself.`
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
