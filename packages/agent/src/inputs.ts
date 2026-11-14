/**
 * A delegate's inputs (core `CONTROL_INPUTS_ADMIT`, `CONTROL_INPUTS_COPY`,
 * `CONTROL_INPUTS_READ`, `CONTROL_INPUTS_ROOM`, `CONTROL_INPUTS_WRITE`,
 * `CONTROL_INPUTS_CLEAR`): files and folders its
 * parent names by path on its own machine (a folder lands as its tree),
 * which no boundary lets the delegate read where they are (a journal
 * excerpt, a log, a transcript). Admitted on the
 * parent's machine, refused there in words when one may not leave it, and
 * written into the delegate's `$TMPDIR/inputs/` before the brief that names
 * them: copied there by this machine when the workspace is on it too, read
 * here and written by the workspace's machine when it is on another. Its
 * writer also keeps a picture `artifact_read` drew where the session asks
 * (core `CONTROL_WORKSPACE_SAVE`).
 */
import { constants, type Stats } from "node:fs";
import {
  access,
  lstat,
  open,
  readdir,
  readlink,
  realpath,
  rename,
  rm,
  rmdir,
  stat,
} from "node:fs/promises";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { readRange } from "@cawco/core/file-range";
import { makeFolder } from "@cawco/core/folders";
import { freeBytes } from "@cawco/core/free-bytes";
import {
  sessionScratchDir,
  workspaceClaudeTmpDir,
  workspaceScratchDir,
  workspaceTmpDir,
} from "@cawco/core/paths/workspace";
import { writeStateFile } from "@cawco/core/state-file";
import { workWords } from "@cawco/core/words/work";
import {
  INPUTS_DIR,
  INPUTS_PIECE_BYTES,
  type InputNamed,
  type InputsAdmitted,
  type InputsLanded,
  type InputsRead,
  type InputsRoom,
  inputBatches,
  type WorkspaceRef,
  type WorkspaceSaved,
} from "@cawco/core/workspace/controls";
import {
  inputDenial,
  projectFolderOf,
  resolveAsFar,
} from "@cawco/core/workspace-policy";
import { z } from "zod";
import { isWorkspaceRef } from "./hub-command";
import { cloneHolding } from "./workspace-records";

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
  /** Its bytes, as {@link resolved} found them. */
  size: number;
}

/**
 * Where the caller may name inputs from: `opened`, its project's folder on
 * the hub's machine as its boundaries read it (workspace-policy.ts
 * `projectFolderOf`), and, for a parent bound to a workspace, `roots`: its
 * clone, its scratch dir and `opened`.
 */
interface Reach {
  /** The temp root its Claude Code CLIs run with (core `workspaceClaudeTmpDir`), for a parent bound to a workspace. */
  cliTmp?: string;
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
  { cliTmp, opened, roots }: Reach
): string | undefined => {
  const denied = inputDenial(named, real, opened);
  if (denied || !roots || roots.some((root) => within(real, root))) {
    return denied;
  }
  // The harness's own copy of a picture sent to the session (Claude Code's
  // `[Image: source: …]`): the picture goes by the name its turn gave it.
  return cliTmp && within(real, cliTmp)
    ? `${named} is your harness's own copy, which only your session reads; hand a picture you were sent on by the name its "Attached picture:" line gives it, as { attachment: "<name>" }`
    : `${named} is outside your clone and your $TMPDIR; you run inside a workspace's boundary, so you hand on only files of your own`;
};

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

/**
 * Whether the file's mode bits alone keep this process from reading it: the
 * owner's bits for its owner, the group's for a member, the others' else
 * (inode(7), "The file mode"). Where they let it read and the read is still
 * refused, something beside the mode said no (an ACL, a security module, a
 * folder above it), which is not read here.
 */
const modeDeniesRead = (info: Stats): boolean => {
  // The owner's, group's and others' digits of the mode, each 4 or more
  // where it grants read.
  const [owner = 0, group = 0, others = 0] = permissionDigits(info);
  const uid = process.getuid?.();
  if (uid === 0) {
    return false;
  }
  if (uid === info.uid) {
    return owner < 4;
  }
  if ((process.getgroups?.() ?? []).includes(info.gid)) {
    return group < 4;
  }
  return others < 4;
};

/** A mode's permission digits as `ls -l` reads them: owner, group, others. */
const permissionDigits = (info: Stats): number[] =>
  (info.mode % 0o1000).toString(8).padStart(3, "0").split("").map(Number);

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
    const mode = `0${permissionDigits(info).join("")}`;
    return modeDeniesRead(info)
      ? `${named} exists but its mode (${mode}) does not let you read it; make it readable (chmod), or copy it somewhere you can read and name the copy`
      : `${named} exists, and its mode (${mode}) lets you read it, but the system refused the read (access(2) said EACCES); copy it somewhere you can read and name the copy`;
  }
  return { named, real, name, mode: info.mode % 0o1000, size: info.size };
};

/**
 * Every file of folder `named` (at `real`), at any depth, added to `tally`
 * as it is found, landing at `<folder's name>/<its path in it>`: each judged
 * as a file named alone is ({@link resolved}, so a link in it to what the
 * boundary hides is refused as that file would be), a folder in it walked, a
 * link in it to a folder refused. The walk stops at the first file refused,
 * {@link landsOnce} too; refused when it holds no file. Answers why it may
 * not go.
 */
const admitFolder = async (
  named: string,
  real: string,
  reach: Reach,
  tally: Tally
): Promise<string | undefined> => {
  const before = tally.admitted.length;
  const walk = async (rel: string): Promise<string | undefined> => {
    const entries = (
      await readdir(join(real, rel), { withFileTypes: true })
    ).toSorted((a, b) => (a.name < b.name ? -1 : Number(a.name > b.name)));
    for (const entry of entries) {
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      const why = entry.isDirectory()
        ? await walk(path)
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
    const one = await resolved(file, reach);
    if (typeof one === "string") {
      return one;
    }
    if (!one.info.isFile()) {
      return `${file} is ${one.info.isDirectory() ? "a link to a folder; name the folder it leads to" : "not a file"}`;
    }
    const admitted = await readableFile(file, one.real, one.info, name);
    return typeof admitted === "string" ? admitted : landsOnce(tally, admitted);
  };
  const why = await walk("");
  if (why) {
    return why;
  }
  return tally.admitted.length > before
    ? undefined
    : `${named} is a folder with no file in it at any depth`;
};

/**
 * Why `named` may not go as an input, or nothing when it may, the files it
 * is added to `tally`: a file, or a folder's files ({@link admitFolder}),
 * that exist, outside what
 * every boundary hides but its project's folder (workspace-policy.ts
 * `inputDenial`), and, for a parent that runs in a workspace, inside its
 * own clone, scratch dir or project folder (`roots`): it hands on only what
 * it reads itself.
 */
const admit = async (
  named: string,
  reach: Reach,
  tally: Tally
): Promise<string | undefined> => {
  if (!isAbsolute(named)) {
    return `${named} is not an absolute path; name each input by its absolute path on your machine`;
  }
  const one = await resolved(named, reach);
  if (typeof one === "string") {
    return one;
  }
  if (one.info.isDirectory()) {
    return admitFolder(named, one.real, reach, tally);
  }
  if (!one.info.isFile()) {
    return `${named} is not a file or a folder`;
  }
  const file = await readableFile(named, one.real, one.info, basename(named));
  return typeof file === "string" ? file : landsOnce(tally, file);
};

/**
 * `named` admitted alone as {@link admit} admits a file, or why it may not
 * go: how each range of an input is judged again where it is read.
 */
const admitFile = async (
  named: string,
  reach: Reach
): Promise<Admitted | string> => {
  if (!isAbsolute(named)) {
    return `${named} is not an absolute path; name each input by its absolute path on your machine`;
  }
  const one = await resolved(named, reach);
  if (typeof one === "string") {
    return one;
  }
  if (!one.info.isFile()) {
    return `${named} is not a file`;
  }
  return readableFile(named, one.real, one.info, basename(named));
};

/**
 * Where a caller may name files from ({@link Reach}): `bound`, the
 * workspace it runs in, when it runs in one; `project`, its project, when
 * it belongs to one.
 */
const reachOf = async (bound: unknown, project: unknown): Promise<Reach> => {
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
  return {
    opened,
    roots,
    ...(isWorkspaceRef(bound)
      ? { cliTmp: resolveAsFar(workspaceClaudeTmpDir(bound.id)) }
      : {}),
  };
};

/**
 * Each of `paths` (absolute) as the real path of the file it is, judged as
 * an input is ({@link resolved}, {@link readableFile}) for a session bound
 * to workspace `bound` (its clone, its scratch dir, its project's folder);
 * or the first reason one may not be read, in words. THE ONE READER of a
 * file a workspace's session hands a tool CawCo runs on its host:
 * `generate_image`'s `reference_images`.
 */
export const admitFiles = async (
  paths: string[],
  bound: WorkspaceRef,
  project: string | null
): Promise<string[] | string> => {
  const reach = await reachOf(bound, project);
  const reals: string[] = [];
  for (const named of paths) {
    const one = await resolved(named, reach);
    if (typeof one === "string") {
      return one;
    }
    if (!one.info.isFile()) {
      return `${named} is not a file`;
    }
    const file = await readableFile(named, one.real, one.info, basename(named));
    if (typeof file === "string") {
      return file;
    }
    reals.push(file.real);
  }
  return reals;
};

/** The list of paths a control hands over. */
const PATHS = z.array(z.string());

const OFFSET = z.number().int().nonnegative();

/** The ranges {@link CONTROL_INPUTS_READ} is asked for. */
const WANTS = z.array(
  z.object({ at: OFFSET, from: z.string(), length: OFFSET, size: OFFSET })
);

/** The pieces {@link CONTROL_INPUTS_WRITE} hands over: the fields a write reads. */
const PIECES = z.array(
  z.object({
    at: OFFSET,
    content: z.string(),
    last: z.boolean(),
    mode: z.number(),
    name: z.string(),
  })
);

/** The names {@link CONTROL_INPUTS_CLEAR} takes out. */
const NAMES = z.array(z.string());

/** A session's place: the session and the folder it works in. */
const SESSION_PLACE = z.object({ cwd: z.string(), session: z.string() });

/**
 * Each of `paths` admitted, or the first reason one may not go ({@link
 * admit}), or two that would land under one name, of any size and count
 * together. `bound` is the workspace the parent runs in,
 * when it runs in one; `project` the project the parent belongs to, when it
 * belongs to one. The one place every input is judged: at delegate time, and
 * again where it is read or copied.
 */
const admitAll = async (
  paths: unknown,
  bound: unknown,
  project: unknown
): Promise<Admitted[] | string> => {
  const listed = PATHS.safeParse(paths);
  if (!listed.success) {
    throw new Error("inputs must be a list of absolute paths");
  }
  const reach = await reachOf(bound, project);
  const tally: Tally = { admitted: [], named: new Map() };
  for (const path of listed.data) {
    const why = await admit(path, reach, tally);
    if (why) {
      return why;
    }
  }
  return tally.admitted;
};

/** The inputs admitted so far, across every path named: the files, each by where it lands. */
interface Tally {
  admitted: Admitted[];
  named: Map<string, string>;
}

/**
 * `one` added to `tally`, or why it may not go: two that would land under
 * one name. Run on each file as it is found.
 */
const landsOnce = (tally: Tally, one: Admitted): string | undefined => {
  const twin = tally.named.get(one.name);
  if (twin) {
    return `${twin} and ${one.named} would both land as ${one.name} in the inputs folder; copy one to another name`;
  }
  tally.named.set(one.name, one.named);
  tally.admitted.push(one);
};

const namedOf = ({ name, named, mode, size }: Admitted): InputNamed => ({
  name,
  from: named,
  mode,
  size,
});

/**
 * `length` bytes from `at` of input `one`, admitted at `size` (core
 * `readRange`), or a throw in words when it ends short of them, having
 * shrunk since.
 */
const inputRange = async (
  one: { named: string; real: string; size: number },
  at: number,
  length: number
): Promise<Buffer> => {
  const range = await readRange(one.real, at, length);
  if (range.length < length) {
    throw new Error(
      workWords.inputChanged(one.named, one.size, at + range.length)
    );
  }
  return range;
};

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

/**
 * {@link CONTROL_INPUTS_READ}: each range `wants` asks for, read from its
 * file once that file is admitted again alone ({@link admitFile}) at the
 * size it was admitted at; or the first reason one may not go. At most
 * {@link INPUTS_PIECE_BYTES} together, as core `inputBatches` plans them.
 */
export const readInputs = async (
  bound: unknown,
  project: unknown,
  wants: unknown
): Promise<InputsRead> => {
  const listed = WANTS.safeParse(wants);
  if (!listed.success) {
    throw new Error("inputs are read as a list of { from, at, length, size }");
  }
  const asked = listed.data.reduce((sum, want) => sum + want.length, 0);
  if (asked > INPUTS_PIECE_BYTES) {
    throw new Error(
      `one read of inputs asks ${INPUTS_PIECE_BYTES} bytes at most, and this asks ${asked}`
    );
  }
  const reach = await reachOf(bound, project);
  const contents: string[] = [];
  for (const want of listed.data) {
    const file = await admitFile(want.from, reach);
    if (typeof file === "string") {
      return { refused: file };
    }
    if (file.size !== want.size) {
      return {
        refused: workWords.inputChanged(want.from, want.size, file.size),
      };
    }
    contents.push(
      (await inputRange(file, want.at, want.length)).toString("base64")
    );
  }
  return { contents };
};

/**
 * {@link CONTROL_INPUTS_COPY}: each of `paths` admitted ({@link admitAll})
 * and copied into the inputs folder of `place`, one file at a time, range by
 * range as core `inputBatches` plans them, as {@link writeInputs} writes
 * them. A copy that fails partway throws; the hub takes out what had landed
 * (core `CONTROL_INPUTS_CLEAR`).
 */
export const copyInputs = async (
  paths: unknown,
  bound: unknown,
  place: unknown,
  project: unknown
): Promise<InputsAdmitted> => {
  const admitted = await admitAll(paths, bound, project);
  if (typeof admitted === "string") {
    return { refused: admitted };
  }
  const { named, under } = await inputsUnder(place);
  for (const batch of inputBatches(admitted)) {
    for (const { file, at, length, last } of batch) {
      await writePiece(under, {
        name: file.name,
        mode: file.mode,
        at,
        last,
        bytes: await inputRange(file, at, length),
      });
    }
  }
  console.info(
    `[inputs] ${under.what}: ${admitted.length} input(s) copied to ${under.dir}`
  );
  return { files: admitted.map(namedOf), folder: named };
};

/**
 * {@link CONTROL_INPUTS_ROOM}: the inputs folder of `place` made
 * ({@link inputsUnder}), and the bytes free on its disk (move.ts
 * `freeBytes`).
 */
export const roomInputs = async (place: unknown): Promise<InputsRoom> => {
  const { named, under } = await inputsUnder(place);
  return { folder: named, free: await freeBytes(under.own) };
};

/**
 * {@link CONTROL_INPUTS_WRITE}: each piece of inputs read on another
 * machine, or held by the hub, written into the inputs folder of `place`
 * ({@link writePiece}).
 */
export const writeInputs = async (
  place: unknown,
  pieces: unknown
): Promise<InputsLanded> => {
  const listed = PIECES.safeParse(pieces);
  if (!listed.success) {
    throw new Error("inputs are written as a list of pieces");
  }
  const { named, under } = await inputsUnder(place);
  for (const piece of listed.data) {
    await writePiece(under, {
      name: piece.name,
      mode: piece.mode,
      at: piece.at,
      last: piece.last,
      bytes: Buffer.from(piece.content, "base64"),
    });
  }
  return { folder: named };
};

/**
 * {@link CONTROL_INPUTS_CLEAR}: each of `names`, and its part, taken out of
 * the inputs folder of `place`, then each folder they leave empty; a folder
 * on the way that is no longer the inputs' own is left as it is.
 */
export const clearInputs = async (
  place: unknown,
  names: unknown
): Promise<void> => {
  const listed = NAMES.safeParse(names);
  if (!listed.success) {
    throw new Error("inputs are cleared by a list of names");
  }
  const { under } = await inputsUnder(place);
  for (const name of listed.data) {
    if (nameProblem(name)) {
      continue;
    }
    let folder = join(under.own, dirname(name));
    if ((await realpath(folder).catch(() => undefined)) !== folder) {
      continue;
    }
    await rm(join(folder, basename(name)), { force: true });
    await rm(partOf(folder, name), { force: true });
    while (folder !== under.own) {
      const emptied = await rmdir(folder).then(
        () => true,
        () => false
      );
      if (!emptied) {
        break;
      }
      folder = dirname(folder);
    }
  }
  console.info(
    `[inputs] ${under.what}: ${listed.data.length} input(s) cleared from ${under.dir}`
  );
};

/**
 * What stands where a written file's folder goes and is none (a file, a
 * link): `clear` takes it away first, in a folder only CawCo writes (the
 * inputs); `refuse` says so and writes nothing, in a folder the session
 * keeps its own work in (its clone, its scratch dir).
 */
type Strays = "clear" | "refuse";

/**
 * The folder `rel` (a file's folders, `.` for none) under `own`, the
 * written folder's real path, made one folder at a time, so no folder is
 * made through a link ({@link Strays}).
 */
const ownFolder = async (
  own: string,
  rel: string,
  strays: Strays
): Promise<string> => {
  let at = own;
  for (const component of rel === "." ? [] : rel.split("/")) {
    at = join(at, component);
    const found = await lstat(at).catch(() => undefined);
    if (found?.isDirectory()) {
      continue;
    }
    if (found && strays === "refuse") {
      throw new Error(
        `${at} is ${found.isSymbolicLink() ? "a link" : "a file"}, not a folder, so nothing was written under it; name a path whose folders are folders`
      );
    }
    if (found) {
      await rm(at, { force: true });
    }
    await makeFolder(at, { mode: 0o700, exclusive: true });
  }
  return at;
};

/** Where {@link writeUnder} writes: `dir` as named, `own` its real path, `what` it is in words. */
interface Under {
  dir: string;
  own: string;
  strays: Strays;
  what: string;
}

/**
 * Each file written under `dir`, at its name (a path when it keeps its
 * folders), replacing one there, and readable by its owner at least. The
 * workspace writes `dir`, so nothing there is followed: `dir`'s real path
 * and each file's folder's are checked before it is written ({@link
 * folderUnder}), and each file is written to a new name and renamed over the
 * old one (state-file.ts). THE ONE WRITER of a whole file CawCo puts where a
 * session asks: a picture `artifact_read` keeps ({@link savePicture}) and an
 * image `generate_image` makes ({@link writeKept}); its inputs go in pieces
 * ({@link writePiece}).
 */
const writeUnder = async (
  under: Under,
  files: {
    bytes: () => Promise<Buffer>;
    /** Placed only where nothing is (state-file.ts `exclusive`). */
    exclusive?: true;
    mode: number;
    name: string;
  }[]
): Promise<void> => {
  for (const file of files) {
    const folder = await folderUnder(under, file.name);
    await writeStateFile(
      join(folder, basename(file.name)),
      await file.bytes(),
      {
        inPlace: true,
        mode: ownMode(file.mode),
        ...(file.exclusive ? { exclusive: true } : {}),
      }
    );
  }
};

/**
 * The folder file `name` goes in under `under`, made one folder at a time
 * ({@link ownFolder}), once `under`'s real path and the folder's are what
 * they were: the checks {@link writeUnder} and {@link writePiece} make
 * before each file, as the workspace writes `dir` too.
 */
const folderUnder = async (
  { dir, own, strays, what }: Under,
  name: string
): Promise<string> => {
  if (nameProblem(name)) {
    throw new Error(`"${name}" is not a file name`);
  }
  if ((await realpath(dir)) !== own) {
    throw new Error(
      `${dir} is no longer ${what}, so nothing more was written there`
    );
  }
  const folder = await ownFolder(own, dirname(name), strays);
  if ((await realpath(folder)) !== folder) {
    throw new Error(
      `${folder} is no longer inside ${what}, so nothing more was written there`
    );
  }
  return folder;
};

/** A written file's mode: its own permission bits, and its owner's read and write. */
const ownMode = (mode: number): number =>
  // biome-ignore lint/suspicious/noBitwiseOperators: its own bits, and its owner's read and write
  (mode & 0o777) | 0o600;

/** Where file `name` in `folder` is written before its last piece is in. */
const partOf = (folder: string, name: string): string =>
  join(folder, `.${basename(name)}.cawco-part`);

/**
 * One piece of an input appended to its file's part in its folder under
 * `under` ({@link folderUnder}): the first makes the part where nothing is,
 * each later one must start where the part ends, and the last flushes it
 * and renames it over the file of its name. A link put at the part's name
 * is refused, never written through. THE ONE WRITER of inputs, copied here
 * or carried from another machine.
 */
const writePiece = async (
  under: Under,
  piece: {
    at: number;
    bytes: Buffer;
    last: boolean;
    mode: number;
    name: string;
  }
): Promise<void> => {
  const folder = await folderUnder(under, piece.name);
  const part = partOf(folder, piece.name);
  if (piece.at === 0) {
    await rm(part, { force: true });
  }
  // open(2)'s flags as one bit set: each its own bit, so their sum is it.
  const handle = await open(
    part,
    constants.O_WRONLY +
      constants.O_NOFOLLOW +
      (piece.at === 0
        ? constants.O_CREAT + constants.O_EXCL
        : constants.O_APPEND),
    0o600
  );
  try {
    const { size } = await handle.stat();
    if (size !== piece.at) {
      throw new Error(
        `${piece.name}'s part holds ${size} bytes where a piece at ${piece.at} goes, so it was not written whole`
      );
    }
    await handle.writeFile(piece.bytes);
    if (piece.last) {
      await handle.chmod(ownMode(piece.mode));
      await handle.sync();
    }
  } finally {
    await handle.close();
  }
  if (piece.last) {
    await rename(part, join(folder, basename(piece.name)));
  }
};

/** A session id as the hub makes one: nothing else names a folder under the scratch root. */
const SESSION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

/**
 * Where `place`'s inputs land (core `InputsPlace`): the scratch dir they go
 * under, the folder as the receiving session names it, and what it is in
 * words. A work item's workspace's is its scratch dir, its `TMPDIR`. A
 * session with no work item that works inside a workspace's clone runs in
 * that clone's boundary (session.ts `#sessionContext`), so it reads that
 * workspace's; any other has its own (core `sessionScratchDir`), named by
 * its absolute path, as its `TMPDIR` is none of CawCo's.
 */
const inputsHome = async (
  place: unknown
): Promise<{ named: string; scratch: string; what: string }> => {
  const inTmp = `$TMPDIR/${INPUTS_DIR}/`;
  if (isWorkspaceRef(place)) {
    return {
      scratch: workspaceScratchDir(place.id),
      named: inTmp,
      what: `workspace ${place.id}'s own inputs folder`,
    };
  }
  const sessionPlace = SESSION_PLACE.safeParse(place);
  if (!(sessionPlace.success && SESSION_ID.test(sessionPlace.data.session))) {
    throw new Error(
      "inputs are written for a workspace, { id, path }, or a session, { session, cwd }"
    );
  }
  const asked = sessionPlace.data;
  const held = await cloneHolding(asked.cwd);
  if (held) {
    return {
      scratch: workspaceScratchDir(held.id),
      named: inTmp,
      what: `workspace ${held.id}'s own inputs folder`,
    };
  }
  const scratch = sessionScratchDir(asked.session);
  return {
    scratch,
    named: `${join(scratch, INPUTS_DIR)}/`,
    what: `session ${asked.session}'s own inputs folder`,
  };
};

/**
 * The inputs folder of `place` ({@link inputsHome}), {@link INPUTS_DIR}
 * under its scratch dir, made, a link or a file at `inputs` taken away
 * first: where its pieces are written ({@link writePiece}), and the folder
 * as its session names it.
 */
const inputsUnder = async (
  place: unknown
): Promise<{ named: string; under: Under }> => {
  const { named, scratch, what } = await inputsHome(place);
  const dir = join(scratch, INPUTS_DIR);
  const found = await lstat(dir).catch(() => undefined);
  if (found && !found.isDirectory()) {
    await rm(dir, { force: true });
  }
  await makeFolder(dir, { mode: 0o700 });
  return {
    named,
    under: {
      dir,
      own: join(await realpath(scratch), INPUTS_DIR),
      strays: "clear",
      what,
    },
  };
};

/** How a session names its scratch dir in a path it hands a tool, which no shell expands. */
const TMPDIR_NAME = "$TMPDIR/";

/** `$NAME` or `${NAME}`, as a POSIX shell names a variable. */
const SHELL_VARIABLE = /\$(?:\{[A-Za-z_]\w*\}|[A-Za-z_]\w*)/u;

/**
 * The shell variable `path` names unexpanded (`$TMPDIR`, `${HOME}`), if
 * any: a path a session hands a tool reaches CawCo as written, and no shell
 * expands it there, so it is refused rather than taken as a folder of that
 * name. `$TMPDIR/` at the start of a workspace's path is the one name
 * CawCo gives a meaning ({@link placeInWorkspace}).
 */
export const unexpandedVariable = (path: string): string | undefined =>
  SHELL_VARIABLE.exec(path)?.[0];

/** A .png a session named for CawCo to write: the folder it lands under, its path there, its absolute path, that folder in words, and its path in the session's own terms. */
export interface Kept {
  rel: string;
  root: string;
  /** In the session's own terms: `$TMPDIR/…` in its scratch dir, else the absolute path. */
  said: string;
  shown: string;
  what: string;
}

/**
 * Where `named`, a .png, lands in workspace `ref`: its clone or its scratch
 * dir, and its path there; or why not, in words. Relative: from `from` (the
 * clone, or a session's working dir in it). `$TMPDIR/…` or an absolute path
 * inside the scratch dir (by either of its names, core `workspaceTmpDir`):
 * there. An absolute path inside the clone: there. Any other shell variable
 * ({@link unexpandedVariable}): refused. THE ONE RULE for a file
 * a workspace's session asks CawCo to write: `artifact_read`'s `save` and
 * `generate_image`'s `output_path`.
 */
export const placeInWorkspace = (
  ref: WorkspaceRef,
  named: string,
  from: string = ref.path
): Kept | string => {
  const scratch = workspaceScratchDir(ref.id);
  const tmp = workspaceTmpDir(ref.id);
  const inScratch = named.startsWith(TMPDIR_NAME);
  const variable = unexpandedVariable(
    inScratch ? named.slice(TMPDIR_NAME.length) : named
  );
  if (variable) {
    return `${named} names ${variable}, a shell variable nothing expands here; name the path it stands for, or one like $TMPDIR/outputs/<name>.png`;
  }
  const asked = inScratch
    ? join(tmp, named.slice(TMPDIR_NAME.length))
    : resolve(from, named);
  const place = [
    { root: ref.path, shown: ref.path, what: "clone" },
    { root: scratch, shown: tmp, what: "scratch dir" },
    { root: scratch, shown: scratch, what: "scratch dir" },
  ].find(({ shown }) => asked.startsWith(`${shown}/`));
  if (!place) {
    return `${named} is outside your clone and your $TMPDIR; name a .png path in either, like $TMPDIR/outputs/<name>.png`;
  }
  const rel = relative(place.shown, asked);
  if (extname(rel).toLowerCase() !== ".png" || nameProblem(rel)) {
    return `${named} names no .png file; name one, like $TMPDIR/outputs/<name>.png`;
  }
  return {
    root: place.root,
    rel,
    said:
      place.root === scratch ? `${TMPDIR_NAME}${rel}` : join(place.shown, rel),
    shown: join(place.shown, rel),
    what: `workspace ${ref.id}'s own ${place.what}`,
  };
};

/**
 * `bytes` written at `kept` ({@link writeUnder}), a link or a file where a
 * folder goes refused; `exclusive`, only where nothing is.
 */
export const writeKept = async (
  kept: Kept,
  bytes: Buffer,
  { exclusive, mode }: { exclusive?: true; mode: number }
): Promise<void> =>
  writeUnder(
    {
      dir: kept.root,
      own: await realpath(kept.root),
      strays: "refuse",
      what: kept.what,
    },
    [
      {
        name: kept.rel,
        mode,
        bytes: () => Promise.resolve(bytes),
        ...(exclusive ? { exclusive } : {}),
      },
    ]
  );

/**
 * Core `CONTROL_WORKSPACE_SAVE`: the picture `artifact_read` drew, base64
 * `png`, kept at `named` in workspace `ref` ({@link placeInWorkspace},
 * {@link writeKept}), replacing one there. Answers the path written in the
 * session's own terms (`$TMPDIR/outputs/x.png`).
 */
export const savePicture = async (
  ref: unknown,
  named: unknown,
  png: unknown
): Promise<WorkspaceSaved> => {
  if (!(
    isWorkspaceRef(ref) &&
    typeof named === "string" &&
    typeof png === "string"
  )) {
    throw new Error(
      "a picture is saved as [{ id, path }, its path, its base64 PNG]"
    );
  }
  const kept = placeInWorkspace(ref, named);
  if (typeof kept === "string") {
    return { refused: kept };
  }
  await writeKept(kept, Buffer.from(png, "base64"), { mode: 0o644 });
  return { path: kept.said };
};
