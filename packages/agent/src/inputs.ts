/**
 * A delegate's inputs (core `CONTROL_INPUTS_ADMIT`, `CONTROL_INPUTS_COPY`,
 * `CONTROL_INPUTS_READ`, `CONTROL_INPUTS_WRITE`): files its parent names by
 * path on its own machine, which no boundary lets the delegate read where
 * they are (a journal excerpt, a log, a transcript). Admitted on the
 * parent's machine, refused there in words when one may not leave it, and
 * written into the delegate's `$TMPDIR/inputs/` before the brief that names
 * them: copied there by this machine when the workspace is on it too, read
 * here and written by the workspace's machine when it is on another.
 */
import { lstat, mkdir, readFile, realpath, rm, stat } from "node:fs/promises";
import { basename, isAbsolute, join } from "node:path";
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
import { inputDenial } from "@cawco/core/workspace-policy";
import { isWorkspaceRef } from "./workflow-command";

/** Inputs one delegation may name (the outputs' limit, work-items.ts `OUTPUTS_LIMIT`). */
const INPUTS_COUNT_LIMIT = 50;
const MIB = 1024 * 1024;

const within = (path: string, root: string): boolean =>
  path === root || path.startsWith(`${root}/`);

/** A name an input may land under in `inputs/`: one path component. */
const nameProblem = (name: string): boolean =>
  !name || name === "." || name === ".." || name.includes("/");

/** One input that may go, before its bytes are read. */
interface Admitted {
  mode: number;
  name: string;
  named: string;
  real: string;
}

/**
 * Why `named` may not go as an input, or what it is when it may: a file
 * that exists, outside what every boundary hides (workspace-policy.ts
 * `inputDenial`), and, for a parent that runs in a workspace, inside its own
 * clone or scratch dir (`roots`): it hands on only what it reads itself.
 */
const admit = async (
  named: string,
  roots: string[] | undefined
): Promise<Admitted | string> => {
  if (!isAbsolute(named)) {
    return `${named} is not an absolute path; name each input by its absolute path on your machine`;
  }
  const real = await realpath(named).catch(() => undefined);
  if (!real) {
    return `${named} is not on your machine`;
  }
  const denied = inputDenial(named, real);
  if (denied) {
    return denied;
  }
  if (roots && !roots.some((root) => within(real, root))) {
    return `${named} is outside your clone and your $TMPDIR; you run inside a workspace's boundary, so you hand on only files of your own`;
  }
  const info = await stat(real);
  if (!info.isFile()) {
    return `${named} is ${info.isDirectory() ? "a folder; name the files in it" : "not a file"}`;
  }
  // biome-ignore lint/suspicious/noBitwiseOperators: a mode's permission bits
  return { named, real, name: basename(named), mode: info.mode & 0o777 };
};

/**
 * Each of `paths` admitted, or the first reason one may not go ({@link
 * admit}), two that would land under one name, or more than {@link
 * INPUTS_LIMIT_BYTES} together. `bound` is the workspace the parent runs in,
 * when it runs in one. The one place every input is judged: at delegate
 * time, and again where it is read or copied.
 */
const admitAll = async (
  paths: unknown,
  bound: unknown
): Promise<Admitted[] | string> => {
  if (!(
    Array.isArray(paths) && paths.every((one) => typeof one === "string")
  )) {
    throw new Error("inputs must be a list of absolute paths");
  }
  if (paths.length > INPUTS_COUNT_LIMIT) {
    return `inputs names ${paths.length} files; it stops at ${INPUTS_COUNT_LIMIT}`;
  }
  const roots = isWorkspaceRef(bound)
    ? await Promise.all(
        [bound.path, workspaceScratchDir(bound.id)].map((root) =>
          realpath(root).catch(() => root)
        )
      )
    : undefined;
  const admitted: Admitted[] = [];
  const named = new Map<string, string>();
  let total = 0;
  for (const path of paths as string[]) {
    // biome-ignore lint/performance/noAwaitInLoops: one input at a time, the first refusal is the answer
    const one = await admit(path, roots);
    if (typeof one === "string") {
      return one;
    }
    const twin = named.get(one.name);
    if (twin) {
      return `${twin} and ${one.named} would both land as ${one.name} in $TMPDIR/inputs/; copy one to another name`;
    }
    named.set(one.name, one.named);
    total += (await stat(one.real)).size;
    if (total > INPUTS_LIMIT_BYTES) {
      return `the inputs come to more than ${INPUTS_LIMIT_BYTES / MIB} MiB together, the most one delegation carries; hand larger data on through git or a check with machine`;
    }
    admitted.push(one);
  }
  return admitted;
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
  bound: unknown
): Promise<InputsAdmitted> => {
  const admitted = await admitAll(paths, bound);
  return typeof admitted === "string"
    ? { refused: admitted }
    : { files: admitted.map(namedOf) };
};

/** {@link CONTROL_INPUTS_READ}: each of `paths` admitted ({@link admitAll}), then read whole. */
export const readInputs = async (
  paths: unknown,
  bound: unknown
): Promise<InputsRead> => {
  const admitted = await admitAll(paths, bound);
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
  ref: unknown
): Promise<InputsAdmitted> => {
  const admitted = await admitAll(paths, bound);
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
 * Each input written into the workspace's scratch dir under {@link
 * INPUTS_DIR}, replacing one of its name, and readable by its owner at
 * least. The workspace writes its scratch dir, so nothing there is followed:
 * a link at `inputs` is taken away, the folder's real path is checked before
 * each file, and each file is written to a new name and renamed over the old
 * one (state-file.ts).
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
    await writeStateFile(
      join(dir, file.name),
      await file.bytes(),
      // biome-ignore lint/suspicious/noBitwiseOperators: its own bits, and its owner's read and write
      { inPlace: true, mode: (file.mode & 0o777) | 0o600 }
    );
  }
  console.info(
    `[inputs] workspace ${ref.id}: ${files.length} input(s) written to ${dir}`
  );
};
