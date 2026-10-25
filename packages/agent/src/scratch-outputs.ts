/**
 * A workspace's `$TMPDIR/outputs/` read on this machine's host (core
 * `CONTROL_WORKSPACE_OUTPUTS`): the files a delegate leaves there, which
 * the hub copies into its project's folder as its item finishes and again
 * before the workspace closes. Read here, outside the boundary, so a
 * workspace whose boundary cannot start (its clone deleted, its accounts
 * record damaged) is read and closes all the same; inside it, the read
 * failed with the boundary's reason, and the close it came before was
 * refused at every sweep (workspace-retire (u), (g), 2026-10-25).
 *
 * The workspace writes its scratch dir, so what this read could be led to
 * is what the boundary kept it to: nothing outside the scratch dir. A link
 * at any depth (`outputs` itself included) is listed, never followed or
 * read; a folder is walked only while its real path is the one under the
 * scratch dir's real path its name says; a file is opened without following
 * a link, and read only when the file opened is the one at that path inside
 * the scratch dir (its device and inode, against its real path's).
 */
import { constants } from "node:fs";
import { lstat, open, readdir, realpath, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  OUTPUTS_DIR,
  type ScratchOutput,
  type ScratchOutputsAsk,
} from "@cawco/core";
import { workspaceScratchDir } from "@cawco/core/paths";
import { isWorkspaceRef } from "./hub-command";

const missing = (error: unknown): boolean =>
  ["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "");

const isAsk = (value: unknown): value is ScratchOutputsAsk =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as ScratchOutputsAsk).read === "boolean" &&
  Number.isInteger((value as ScratchOutputsAsk).limit);

/**
 * The bytes of the file at `abs`, a real path under the scratch dir: opened
 * without following a link, and read only when what was opened is a file,
 * the one at `abs` (its real path `abs`, its device and inode those of what
 * stands there), within `limit` bytes; undefined when it grew past it.
 * Throws when it is not the file at `abs`.
 */
const readOwn = async (
  abs: string,
  limit: number
): Promise<Buffer | undefined> => {
  const handle = await open(
    abs,
    // biome-ignore lint/suspicious/noBitwiseOperators: open(2) takes its flags as one bit set
    constants.O_RDONLY | constants.O_NOFOLLOW
  );
  try {
    const [opened, there, resolved] = await Promise.all([
      handle.stat(),
      stat(abs),
      realpath(abs),
    ]);
    if (
      !opened.isFile() ||
      resolved !== abs ||
      opened.dev !== there.dev ||
      opened.ino !== there.ino
    ) {
      throw new Error(
        `${abs} is no longer a file of the workspace's scratch dir, so it was not read`
      );
    }
    if (opened.size > limit) {
      return;
    }
    return await handle.readFile();
  } finally {
    await handle.close();
  }
};

/** One regular file of the outputs, `path` under them at `abs`: its size, and its bytes when `ask` reads it and it is within the limit. */
const fileOutput = async (
  path: string,
  abs: string,
  size: number,
  ask: ScratchOutputsAsk
): Promise<ScratchOutput> => {
  const bytes =
    ask.read && size <= ask.limit ? await readOwn(abs, ask.limit) : undefined;
  return bytes
    ? {
        path,
        link: false,
        size: bytes.byteLength,
        content: bytes.toString("base64"),
      }
    : { path, link: false, size };
};

/**
 * Every file and link down the folder `rel` under `root` (the outputs'
 * real path), depth first: a folder walked only while its real path is its
 * own under `root`, a link listed, anything else (a socket, a fifo) passed
 * over.
 */
const walkOutputs = async (
  root: string,
  rel: string,
  ask: ScratchOutputsAsk
): Promise<ScratchOutput[]> => {
  const dir = rel ? join(root, rel) : root;
  if ((await realpath(dir)) !== dir) {
    throw new Error(
      `${dir} is no longer inside the workspace's scratch dir, so it was not read`
    );
  }
  const found: ScratchOutput[] = [];
  for (const name of await readdir(dir)) {
    const path = rel ? `${rel}/${name}` : name;
    const abs = join(root, path);
    // biome-ignore lint/performance/noAwaitInLoops: each entry judged by what stands there now, depth first
    const info = await lstat(abs);
    if (info.isSymbolicLink()) {
      found.push({ path, link: true, size: 0 });
    } else if (info.isDirectory()) {
      found.push(...(await walkOutputs(root, path, ask)));
    } else if (info.isFile()) {
      found.push(await fileOutput(path, abs, info.size, ask));
    }
  }
  return found;
};

/**
 * {@link CONTROL_WORKSPACE_OUTPUTS}: every file and link under workspace
 * `ref`'s `$TMPDIR/outputs/`, in path order, each file read when `ask` says
 * so and it holds no more than its limit. None when the scratch dir or
 * `outputs` is not there.
 */
export const scratchOutputs = async (
  ref: unknown,
  ask: unknown
): Promise<ScratchOutput[]> => {
  if (!(isWorkspaceRef(ref) && isAsk(ask))) {
    throw new Error(
      "a workspace's outputs are read for { id, path } with { read, limit }"
    );
  }
  const scratch = workspaceScratchDir(ref.id);
  const top = await lstat(join(scratch, OUTPUTS_DIR)).catch(
    (error: unknown) => {
      if (!missing(error)) {
        throw error;
      }
    }
  );
  if (top?.isSymbolicLink()) {
    return [{ path: ".", link: true, size: 0 }];
  }
  if (!top?.isDirectory()) {
    return [];
  }
  const root = join(await realpath(scratch), OUTPUTS_DIR);
  return (await walkOutputs(root, "", ask)).toSorted((a, b) =>
    a.path < b.path ? -1 : Number(a.path > b.path)
  );
};
