/**
 * A delegate's inputs (core `CONTROL_INPUTS_ADMIT`, `CONTROL_INPUTS_COPY`,
 * `CONTROL_INPUTS_READ`, `CONTROL_INPUTS_WRITE`): files and folders its
 * parent names by path on its own machine (a folder lands as its tree),
 * which no boundary lets the delegate read where they are (a journal
 * excerpt, a log, a transcript). Admitted on the
 * parent's machine, refused there in words when one may not leave it, and
 * written into the delegate's `$TMPDIR/inputs/` before the brief that names
 * them: copied there by this machine when the workspace is on it too, read
 * here and written by the workspace's machine when it is on another.
 */
import { constants, type Stats } from "node:fs";
import {
  access,
  lstat,
  mkdir,
  readdir,
  readFile,
  readlink,
  realpath,
  rm,
  stat,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import {
  INPUTS_DIR,
  INPUTS_LIMIT_BYTES,
  type InputFile,
  type InputNamed,
  type InputsAdmitted,
  type InputsRead,
} from "@cawco/core";
import { workspaceScratchDir } from "@cawco/core/paths";
import { writeStateFile } from "@cawco/core/state-file";
import {
  inputDenial,
  projectFolderOf,
  resolveAsFar,
} from "@cawco/core/workspace-policy";
import { isWorkspaceRef } from "./hub-command";

/** Inputs one delegation may name (the outputs' limit, work-items.ts `OUTPUTS_LIMIT`). */
const INPUTS_COUNT_LIMIT = 50;
const MIB = 1024 * 1024;

const within = (path: string, root: string): boolean =>
  path === root || path.startsWith(`${root}/`);

/**
 * A name an input may land under in `inputs/`: a relative path of one or
 * more components (an item's assets keep their folders), none empty, `.` or
 * `..`.
 */
const nameProblem = (name: string): boolean =>
  !name ||
  name.includes("\\") ||
  name
    .split("/")
    .some((component) => !component || component === "." || component === "..");

/** One input that may go, before its bytes are read. */
interface Admitted {
  mode: number;
  name: string;
  named: string;
  real: string;
}

/**
 * Where the caller may name inputs from: `opened`, its project's folder on
 * the hub's machine as its boundaries read it (workspace-policy.ts
 * `projectFolderOf`), and, for a parent bound to a workspace, `roots`: its
 * clone, its scratch dir and `opened`.
 */
interface Reach {
  opened: string[];
  roots: string[] | undefined;
}

/**
 * The policy refusal for `named` resolving to `real`, or nothing when the
 * caller may name it: outside what every boundary hides but its project's
 * folder (workspace-policy.ts `inputDenial`) and, for a parent bound to a
 * workspace, inside its `roots`.
 */
const gate = (
  named: string,
  real: string,
  { opened, roots }: Reach
): string | undefined =>
  inputDenial(named, real, opened) ??
  (roots && !roots.some((root) => within(real, root))
    ? `${named} is outside your clone and your $TMPDIR; you run inside a workspace's boundary, so you hand on only files of your own`
    : undefined);

/**
 * Why `realpath(named)` failed, from its error code: no file there, a link
 * to nothing, a folder on the way that can't be entered, or a link loop.
 * Said only of a path the caller may name ({@link gate}); any other gets the
 * refusal it would get if it existed, so a refusal tells no one whether a
 * path they may not read exists, nor where a link outside their reach leads.
 */
const unresolved = async (
  named: string,
  error: NodeJS.ErrnoException,
  reach: Reach
): Promise<string> => {
  const denied = gate(named, resolveAsFar(named), reach);
  if (denied) {
    return denied;
  }
  if (error.code === "ENOENT") {
    const link = await lstat(named).then(
      (info) => info.isSymbolicLink(),
      () => false
    );
    if (link) {
      const target = await readlink(named);
      const deniedTarget = gate(
        named,
        resolveAsFar(resolve(resolveAsFar(dirname(named)), target)),
        reach
      );
      return (
        deniedTarget ??
        `${named} is a link to ${target}, which doesn't exist; name the file itself, or point the link at a file that exists`
      );
    }
    return `there's no file at ${named}; check the path, or write the file before naming it`;
  }
  const why: Record<string, string> = {
    ENOTDIR: `there's no file at ${named}: part of its path is a file, not a folder; check the path`,
    EACCES: `${named} can't be reached: a folder on its path doesn't let you in (permission denied); name a file in a folder you can read`,
    ELOOP: `${named} goes through links that loop back on themselves; name the file itself`,
  };
  return (
    why[error.code ?? ""] ??
    `${named} can't be resolved (${error.code ?? error.message}); check the path`
  );
};

/** `named` resolved and gated ({@link gate}), with what it is; or why it may not go. */
const resolved = async (
  named: string,
  reach: Reach
): Promise<{ info: Stats; real: string } | string> => {
  const real = await realpath(named).catch(
    (error: NodeJS.ErrnoException) => error
  );
  if (typeof real !== "string") {
    return unresolved(named, real, reach);
  }
  return gate(named, real, reach) ?? { real, info: await stat(real) };
};

/** A file `named` (at `real`) admitted under `name`, or why its permissions keep it. */
const readableFile = async (
  named: string,
  real: string,
  info: Stats,
  name: string
): Promise<Admitted | string> => {
  const unreadable = await access(real, constants.R_OK).then(
    () => false,
    (error: NodeJS.ErrnoException) => error.code === "EACCES"
  );
  if (unreadable) {
    return `${named} exists but its permissions don't let you read it; make it readable (chmod u+r), or copy it somewhere you can read and name the copy`;
  }
  // biome-ignore lint/suspicious/noBitwiseOperators: a mode's permission bits
  return { named, real, name, mode: info.mode & 0o777 };
};

/**
 * Every file of folder `named` (at `real`), at any depth, landing at
 * `<folder's name>/<its path in it>`: each judged as a file named alone is
 * ({@link resolved}, so a link in it to what the boundary hides is refused
 * as that file would be), a folder in it walked, a link in it to a folder
 * refused. Stops past {@link INPUTS_COUNT_LIMIT} files; refused when it
 * holds none.
 */
const admitFolder = async (
  named: string,
  real: string,
  reach: Reach
): Promise<Admitted[] | string> => {
  const files: Admitted[] = [];
  const walk = async (rel: string): Promise<string | undefined> => {
    const entries = (
      await readdir(join(real, rel), { withFileTypes: true })
    ).toSorted((a, b) => (a.name < b.name ? -1 : Number(a.name > b.name)));
    for (const entry of entries) {
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      const why = entry.isDirectory()
        ? // biome-ignore lint/performance/noAwaitInLoops: depth first in name order, the first refusal the answer
          await walk(path)
        : await inFolder(join(named, path), `${basename(named)}/${path}`);
      if (why) {
        return why;
      }
    }
  };
  const inFolder = async (
    file: string,
    name: string
  ): Promise<string | undefined> => {
    if (files.length >= INPUTS_COUNT_LIMIT) {
      return `${named} holds more than ${INPUTS_COUNT_LIMIT} files, the most one delegation carries; name the files or a narrower folder`;
    }
    const one = await resolved(file, reach);
    if (typeof one === "string") {
      return one;
    }
    if (!one.info.isFile()) {
      return `${file} is ${one.info.isDirectory() ? "a link to a folder; name the folder it leads to" : "not a file"}`;
    }
    const admitted = await readableFile(file, one.real, one.info, name);
    if (typeof admitted === "string") {
      return admitted;
    }
    files.push(admitted);
  };
  const why = await walk("");
  if (why) {
    return why;
  }
  return files.length > 0
    ? files
    : `${named} is a folder with no file in it at any depth`;
};

/**
 * Why `named` may not go as an input, or the files it is when it may: a
 * file, or a folder's files ({@link admitFolder}), that exist, outside what
 * every boundary hides but its project's folder (workspace-policy.ts
 * `inputDenial`), and, for a parent that runs in a workspace, inside its
 * own clone, scratch dir or project folder (`roots`): it hands on only what
 * it reads itself.
 */
const admit = async (
  named: string,
  reach: Reach
): Promise<Admitted[] | string> => {
  if (!isAbsolute(named)) {
    return `${named} is not an absolute path; name each input by its absolute path on your machine`;
  }
  const one = await resolved(named, reach);
  if (typeof one === "string") {
    return one;
  }
  if (one.info.isDirectory()) {
    return admitFolder(named, one.real, reach);
  }
  if (!one.info.isFile()) {
    return `${named} is not a file or a folder`;
  }
  const file = await readableFile(named, one.real, one.info, basename(named));
  return typeof file === "string" ? file : [file];
};

/**
 * Each of `paths` admitted, or the first reason one may not go ({@link
 * admit}), two that would land under one name, or more than {@link
 * INPUTS_LIMIT_BYTES} together. `bound` is the workspace the parent runs in,
 * when it runs in one; `project` the project the parent belongs to, when it
 * belongs to one. The one place every input is judged: at delegate time, and
 * again where it is read or copied.
 */
const admitAll = async (
  paths: unknown,
  bound: unknown,
  project: unknown
): Promise<Admitted[] | string> => {
  if (!(
    Array.isArray(paths) && paths.every((one) => typeof one === "string")
  )) {
    throw new Error("inputs must be a list of absolute paths");
  }
  if (paths.length > INPUTS_COUNT_LIMIT) {
    return `inputs names ${paths.length} paths; it stops at ${INPUTS_COUNT_LIMIT}`;
  }
  if (!(project === null || typeof project === "string")) {
    throw new Error("an inputs' project is a project id or null");
  }
  const opened = project ? await projectFolderOf(project) : [];
  const roots = isWorkspaceRef(bound)
    ? [
        ...(await Promise.all(
          [bound.path, workspaceScratchDir(bound.id)].map((root) =>
            realpath(root).catch(() => root)
          )
        )),
        ...opened,
      ]
    : undefined;
  const reach = { opened, roots };
  const tally: Tally = { admitted: [], named: new Map(), bytes: 0 };
  for (const path of paths as string[]) {
    // biome-ignore lint/performance/noAwaitInLoops: one input at a time, the first refusal is the answer
    const files = await admit(path, reach);
    const why = typeof files === "string" ? files : await counted(tally, files);
    if (why) {
      return why;
    }
  }
  return tally.admitted;
};

/** What the inputs admitted so far come to: the files, each by where it lands, and their bytes. */
interface Tally {
  admitted: Admitted[];
  bytes: number;
  named: Map<string, string>;
}

/**
 * `files` added to `tally` one by one (a folder's each counts), or why one
 * may not go: two that would land under one name, more than {@link
 * INPUTS_COUNT_LIMIT} files or {@link INPUTS_LIMIT_BYTES} together.
 */
const counted = async (
  tally: Tally,
  files: Admitted[]
): Promise<string | undefined> => {
  for (const one of files) {
    const twin = tally.named.get(one.name);
    if (twin) {
      return `${twin} and ${one.named} would both land as ${one.name} in $TMPDIR/inputs/; copy one to another name`;
    }
    tally.named.set(one.name, one.named);
    if (tally.named.size > INPUTS_COUNT_LIMIT) {
      return `the inputs come to more than ${INPUTS_COUNT_LIMIT} files together, the most one delegation carries; name fewer files or a narrower folder`;
    }
    // biome-ignore lint/performance/noAwaitInLoops: the running total refuses at the first file past it
    tally.bytes += (await stat(one.real)).size;
    if (tally.bytes > INPUTS_LIMIT_BYTES) {
      return `the inputs come to more than ${INPUTS_LIMIT_BYTES / MIB} MiB together, the most one delegation carries; hand larger data on through git or a check with machine`;
    }
    tally.admitted.push(one);
  }
};

const namedOf = ({ name, named, mode }: Admitted): InputNamed => ({
  name,
  from: named,
  mode,
});

/**
 * {@link CONTROL_INPUTS_ADMIT}: the inputs `paths` names, admitted
 * ({@link admitAll}), by name and where each is: none of their bytes.
 */
export const admitInputs = async (
  paths: unknown,
  bound: unknown,
  project: unknown
): Promise<InputsAdmitted> => {
  const admitted = await admitAll(paths, bound, project);
  return typeof admitted === "string"
    ? { refused: admitted }
    : { files: admitted.map(namedOf) };
};

/** {@link CONTROL_INPUTS_READ}: each of `paths` admitted ({@link admitAll}), then read whole. */
export const readInputs = async (
  paths: unknown,
  bound: unknown,
  project: unknown
): Promise<InputsRead> => {
  const admitted = await admitAll(paths, bound, project);
  if (typeof admitted === "string") {
    return { refused: admitted };
  }
  const files = await Promise.all(
    admitted.map(async (one): Promise<InputFile> => ({
      ...namedOf(one),
      content: (await readFile(one.real)).toString("base64"),
    }))
  );
  return { files };
};

/**
 * {@link CONTROL_INPUTS_COPY}: each of `paths` admitted ({@link admitAll})
 * and copied into the workspace `ref`'s inputs, as {@link writeInputs}
 * writes them, one file read at a time.
 */
export const copyInputs = async (
  paths: unknown,
  bound: unknown,
  ref: unknown,
  project: unknown
): Promise<InputsAdmitted> => {
  const admitted = await admitAll(paths, bound, project);
  if (typeof admitted === "string") {
    return { refused: admitted };
  }
  await writeInto(
    ref,
    admitted.map((one) => ({
      name: one.name,
      mode: one.mode,
      bytes: () => readFile(one.real),
    }))
  );
  return { files: admitted.map(namedOf) };
};

/**
 * {@link CONTROL_INPUTS_WRITE}: each input's bytes, read on another machine,
 * written into the workspace's inputs ({@link writeInto}).
 */
export const writeInputs = async (
  ref: unknown,
  files: unknown
): Promise<void> => {
  if (!Array.isArray(files)) {
    throw new Error("inputs must be a list of files");
  }
  await writeInto(
    ref,
    (files as InputFile[]).map((file) => ({
      name: file.name,
      mode: file.mode,
      bytes: () => Promise.resolve(Buffer.from(file.content, "base64")),
    }))
  );
};

/**
 * The folder `rel` (an input's folders, `.` for none) under `own`, the
 * inputs folder's real path, made one folder at a time: what stands where a
 * folder goes and is none (a file, a link) is taken away first, so no
 * folder is made through a link.
 */
const ownFolder = async (own: string, rel: string): Promise<string> => {
  let at = own;
  for (const component of rel === "." ? [] : rel.split("/")) {
    at = join(at, component);
    // biome-ignore lint/performance/noAwaitInLoops: each folder stands inside the one before it
    const found = await lstat(at).catch(() => undefined);
    if (found?.isDirectory()) {
      continue;
    }
    if (found) {
      await rm(at, { force: true });
    }
    await mkdir(at, { mode: 0o700 });
  }
  return at;
};

/**
 * Each input written into the workspace's scratch dir under {@link
 * INPUTS_DIR}, at its name (a path when it keeps its folders), replacing
 * one there, and readable by its owner at least. The workspace writes its
 * scratch dir, so nothing there is followed: a link at `inputs` or at any
 * folder under it is taken away, each file's folder's real path is checked
 * before it is written, and each file is written to a new name and renamed
 * over the old one (state-file.ts).
 */
const writeInto = async (
  ref: unknown,
  files: { bytes: () => Promise<Buffer>; mode: number; name: string }[]
): Promise<void> => {
  if (!isWorkspaceRef(ref)) {
    throw new Error("inputs are written into a workspace: { id, path }");
  }
  const scratch = workspaceScratchDir(ref.id);
  const dir = join(scratch, INPUTS_DIR);
  const found = await lstat(dir).catch(() => undefined);
  if (found && !found.isDirectory()) {
    await rm(dir, { force: true });
  }
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const own = join(await realpath(scratch), INPUTS_DIR);
  for (const file of files) {
    if (nameProblem(file.name)) {
      throw new Error(`"${file.name}" is not a file name`);
    }
    // biome-ignore lint/performance/noAwaitInLoops: one file at a time, each into the folder checked just before it
    if ((await realpath(dir)) !== own) {
      throw new Error(
        `${dir} is no longer workspace ${ref.id}'s own inputs folder, so nothing more was written there`
      );
    }
    const folder = await ownFolder(own, dirname(file.name));
    if ((await realpath(folder)) !== folder) {
      throw new Error(
        `${folder} is no longer inside workspace ${ref.id}'s own inputs folder, so nothing more was written there`
      );
    }
    await writeStateFile(
      join(folder, basename(file.name)),
      await file.bytes(),
      // biome-ignore lint/suspicious/noBitwiseOperators: its own bits, and its owner's read and write
      { inPlace: true, mode: (file.mode & 0o777) | 0o600 }
    );
  }
  console.info(
    `[inputs] workspace ${ref.id}: ${files.length} input(s) written to ${dir}`
  );
};
