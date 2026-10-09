/**
 * A Claude session's own data on this machine, by the classes core
 * `paths.ts` owns: where it is, the one carry that moves all of it into the
 * dir its session runs in ({@link sessionConfigDir}), and the reads that
 * take it from there.
 *
 * The carry is the only thing that moves a session's data. A launch carries
 * before the CLI starts, the hub orders a carry before a row says another
 * account ({@link CONTROL_CARRY_SESSIONS}), an account dir that goes carries
 * its sessions out first ({@link retireConfigDir}), and the agent's start
 * carries every session the hub names into its row's dir. A carry leaves
 * nothing behind: each entry is moved, and an entry the destination already
 * has keeps the newer copy under its name and the older beside it, set aside
 * the way Claude Code sets a transcript aside (`.superseded-<ms>`).
 */
import type { Dirent } from "node:fs";
import {
  cp,
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  rmdir,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { NeutralTask } from "@cawco/core";
import {
  claudeConfigDirs,
  projectSlug,
  SESSION_ENTRIES,
  type SessionEntry,
  sessionConfigDir,
  sessionTasksDir,
} from "@cawco/core/paths";

/** Claude Code names every session by a UUID; a name that starts with one is that session's. */
const SESSION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** A session or account id as a path segment: a plain token, never `..`. */
const TOKEN = /^(?!\.{1,2}$)[A-Za-z0-9._-]{1,128}$/;

/** What Claude Code puts before an orphaned transcript's session id. */
const ORPHANED = ".orphaned-";

/** One session's entries in one config dir, as paths relative to it. */
type SessionIndex = Map<string, string[]>;

const missing = (error: unknown): boolean =>
  (error as { code?: string } | null)?.code === "ENOENT";

/** A dir's entries; none when it is not there. */
const entriesOf = async (dir: string): Promise<Dirent[]> => {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (missing(error) || (error as { code?: string }).code === "ENOTDIR") {
      return [];
    }
    throw error;
  }
};

const add = (index: SessionIndex, id: string, path: string): void => {
  const list = index.get(id);
  if (list) {
    list.push(path);
  } else {
    index.set(id, [path]);
  }
};

/** The session a name in `projects/<slug>/` belongs to, if it is one's. */
const projectEntryOwner = (entry: Dirent): string | undefined => {
  const { name } = entry;
  if (name.startsWith(ORPHANED)) {
    return SESSION_ID.exec(name.slice(ORPHANED.length))?.[0];
  }
  const id = SESSION_ID.exec(name)?.[0];
  if (!id) {
    return;
  }
  const rest = name.slice(id.length);
  if (entry.isDirectory()) {
    return rest === "" ? id : undefined;
  }
  return rest === ".jsonl" || rest.startsWith(".jsonl.") ? id : undefined;
};

/** The session one name under a per-session root belongs to, if it is one's. */
const rootEntryOwner = (
  entry: Exclude<SessionEntry, { kind: "project" }>,
  item: Dirent
): string | undefined => {
  const { name } = item;
  switch (entry.kind) {
    case "dir":
      return item.isDirectory() ? name : undefined;
    case "file":
      return name.endsWith(entry.suffix) && name.length > entry.suffix.length
        ? name.slice(0, -entry.suffix.length)
        : undefined;
    default: {
      const id = SESSION_ID.exec(name)?.[0];
      return id && name.slice(id.length).startsWith(entry.suffix)
        ? id
        : undefined;
    }
  }
};

/** Every transcript and transcript folder under `projects/`, into `index`. */
const indexProjects = async (
  configDir: string,
  index: SessionIndex
): Promise<void> => {
  const projects = join(configDir, "projects");
  for (const project of await entriesOf(projects)) {
    if (!project.isDirectory()) {
      continue;
    }
    for (const item of await entriesOf(join(projects, project.name))) {
      const id = projectEntryOwner(item);
      if (id) {
        add(index, id, join("projects", project.name, item.name));
      }
    }
  }
};

/** Every per-session entry in one config dir, by session id: one pass over it. */
const indexConfigDir = async (configDir: string): Promise<SessionIndex> => {
  const index: SessionIndex = new Map();
  for (const entry of SESSION_ENTRIES) {
    if (entry.kind === "project") {
      // biome-ignore lint/performance/noAwaitInLoops: each root is read in order into the shared index
      await indexProjects(configDir, index);
      continue;
    }
    for (const item of await entriesOf(join(configDir, entry.root))) {
      const id = rootEntryOwner(entry, item);
      if (id) {
        add(index, id, join(entry.root, item.name));
      }
    }
  }
  return index;
};

/** A rename, or across file systems a copy and then the original gone. */
const relocate = async (from: string, to: string): Promise<void> => {
  try {
    await rename(from, to);
  } catch (error) {
    if ((error as { code?: string }).code !== "EXDEV") {
      throw error;
    }
    await cp(from, to, {
      recursive: true,
      preserveTimestamps: true,
      verbatimSymlinks: true,
    });
    await rm(from, { recursive: true, force: true });
  }
};

/**
 * Moves `from` to `to`. A folder both have is merged entry by entry; a file
 * both have keeps the newer under its name and the older beside it as
 * `<name>.superseded-<ms>`, so nothing either held is lost.
 */
const moveEntry = async (from: string, to: string): Promise<void> => {
  const there = await lstat(to).catch(() => undefined);
  if (!there) {
    await mkdir(dirname(to), { recursive: true });
    await relocate(from, to);
    return;
  }
  const here = await lstat(from);
  if (here.isDirectory() && there.isDirectory()) {
    for (const child of await readdir(from)) {
      // biome-ignore lint/performance/noAwaitInLoops: a merge moves one child at a time into the folder it shares
      await moveEntry(join(from, child), join(to, child));
    }
    await rmdir(from);
    return;
  }
  const aside = `${to}.superseded-${Date.now()}`;
  if (here.mtimeMs > there.mtimeMs) {
    await relocate(to, aside);
    await relocate(from, to);
  } else {
    await relocate(from, aside);
  }
};

/** One session to carry: into the dir its row names. */
export interface CarryRequest {
  /** The account whose dir it runs in; null for {@link claudeHome}. */
  accountId: string | null;
  sessionId: string;
}

/** What one carry did: the dirs it took entries from and how many, or why it stopped. */
export type Carried =
  | { entries: number; from: string[] }
  | { error: string; entries: number; from: string[] };

/** The dirs the sessions in `requests` may be in, each indexed once. */
const indexAll = async (
  requests: readonly CarryRequest[]
): Promise<Map<string, SessionIndex>> => {
  const dirs = new Set(claudeConfigDirs().map((dir) => resolve(dir)));
  for (const request of requests) {
    dirs.add(resolve(sessionConfigDir(request)));
  }
  const indexed = await Promise.all(
    [...dirs].map(async (dir) => [dir, await indexConfigDir(dir)] as const)
  );
  return new Map(indexed);
};

/** Moves the entries `index` holds for `sessionId` in `from` into `into`. */
const carryOne = async (
  from: string,
  into: string,
  sessionId: string,
  entries: readonly string[]
): Promise<void> => {
  for (const entry of entries) {
    // biome-ignore lint/performance/noAwaitInLoops: one entry at a time, each whole before the next
    await moveEntry(join(from, entry), join(into, entry));
  }
  console.info(
    `[claude] session ${sessionId}: ${entries.length} entr${entries.length === 1 ? "y" : "ies"} moved from ${from} to ${into}`
  );
};

/**
 * Carries each session into the dir its row names: every per-session entry
 * any other config dir on this machine holds for it is moved there. A
 * session already whole in its dir is left as it is. One that fails says
 * why and the rest go on. The caller makes sure no process of a session runs
 * while its data moves.
 */
export const carrySessions = async (
  requests: readonly CarryRequest[]
): Promise<Map<string, Carried>> => {
  const results = new Map<string, Carried>();
  const valid = requests.filter((request) => {
    const ok =
      TOKEN.test(request.sessionId) &&
      (!request.accountId || TOKEN.test(request.accountId));
    if (!ok) {
      results.set(request.sessionId, {
        entries: 0,
        from: [],
        error: "not a session and account id to carry",
      });
    }
    return ok;
  });
  const indexes = await indexAll(valid);
  for (const request of valid) {
    const into = resolve(sessionConfigDir(request));
    const carried = { entries: 0, from: [] as string[] };
    // An account's dir is made by its sign-in here, never by a carry: a
    // session cannot run on an account this machine has no dir for.
    // biome-ignore lint/performance/noAwaitInLoops: one stat per request, in the order they are carried
    if (!(await lstat(into).catch(() => undefined))) {
      results.set(request.sessionId, {
        ...carried,
        error: `${into} is not on this machine: its account was never signed in here`,
      });
      continue;
    }
    try {
      for (const [dir, index] of indexes) {
        const entries = dir === into ? undefined : index.get(request.sessionId);
        if (!entries?.length) {
          continue;
        }
        // biome-ignore lint/performance/noAwaitInLoops: one session at a time, its data whole in one dir before the next is touched
        await carryOne(dir, into, request.sessionId, entries);
        index.delete(request.sessionId);
        carried.entries += entries.length;
        carried.from.push(dir);
      }
      results.set(request.sessionId, carried);
    } catch (error) {
      results.set(request.sessionId, {
        ...carried,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
};

/**
 * Carries every session a config dir holds into `into`: the dir is about to
 * go (its account removed, or joined into another), and the sessions that
 * ran there outlive it. Answers how many sessions moved.
 */
export const retireConfigDir = async (
  dir: string,
  into: string
): Promise<number> => {
  const from = resolve(dir);
  const target = resolve(into);
  if (from === target) {
    return 0;
  }
  const index = await indexConfigDir(from);
  for (const [sessionId, entries] of index) {
    // biome-ignore lint/performance/noAwaitInLoops: one session at a time, each whole before the next
    await carryOne(from, target, sessionId, entries);
  }
  return index.size;
};

/**
 * A session's transcript in one config dir: under its cwd's project folder
 * when that resolves, else whichever project folder holds it; null when the
 * dir has none.
 */
export const transcriptIn = async (
  configDir: string,
  sessionId: string,
  cwd?: string
): Promise<string | null> => {
  const projects = join(configDir, "projects");
  const name = `${sessionId}.jsonl`;
  if (cwd) {
    const exact = join(projects, projectSlug(cwd), name);
    if (await lstat(exact).catch(() => undefined)) {
      return exact;
    }
  }
  for (const project of await entriesOf(projects)) {
    if (!project.isDirectory()) {
      continue;
    }
    const candidate = join(projects, project.name, name);
    // biome-ignore lint/performance/noAwaitInLoops: the first project folder that has it wins
    if (await lstat(candidate).catch(() => undefined)) {
      return candidate;
    }
  }
  return null;
};

const statusOf = (raw: unknown): NeutralTask["status"] =>
  raw === "in_progress" || raw === "completed" ? raw : "pending";

const strings = (raw: unknown): string[] =>
  Array.isArray(raw)
    ? raw.filter((one): one is string => typeof one === "string")
    : [];

/** One file of the task list, if it is one. */
const taskOf = (id: string, text: string): NeutralTask | undefined => {
  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    if (typeof raw.subject !== "string") {
      return;
    }
    return {
      id,
      subject: raw.subject,
      status: statusOf(raw.status),
      blocks: strings(raw.blocks),
      blockedBy: strings(raw.blockedBy),
      ...(typeof raw.description === "string" && raw.description.trim()
        ? { description: raw.description }
        : {}),
      ...(typeof raw.owner === "string" ? { owner: raw.owner } : {}),
    };
  } catch {
    // A half-written file is not a reason to lose the list.
  }
};

/**
 * A session's task list, as Claude Code's task tools keep it: one JSON file
 * per task in `tasks/<session>/` of the session's own dir, in id order.
 * None when it never made one.
 */
export const readTaskList = async (
  row: { accountId?: string | null },
  sessionId: string
): Promise<NeutralTask[]> => {
  if (
    !(TOKEN.test(sessionId) && (!row.accountId || TOKEN.test(row.accountId)))
  ) {
    throw new Error(`not a session and account to read: ${sessionId}`);
  }
  const dir = sessionTasksDir(row, sessionId);
  const files = (await entriesOf(dir)).filter(
    (entry) => entry.isFile() && entry.name.endsWith(".json")
  );
  const tasks = await Promise.all(
    files.map(async (file) =>
      taskOf(
        file.name.slice(0, -".json".length),
        await readFile(join(dir, file.name), "utf8").catch(() => "")
      )
    )
  );
  return tasks
    .filter((task): task is NeutralTask => task !== undefined)
    .sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
};
