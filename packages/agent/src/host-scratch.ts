/**
 * A host-scope delegate's scratch dir (core protocol.ts
 * `SpawnPayload.hostScratch`): its host workspace's, at the same path a
 * bounded workspace's is (core paths/workspace.ts `workspaceScratchDir`), made on each
 * spawn of its session with `outputs/` in it, and given its commands as
 * `TMPDIR` though they run on the host. What it leaves in `outputs/` is the
 * one way a file of this machine reaches its parent on another: the hub
 * reads it here ({@link CONTROL_HOST_OUTPUTS}) into its project's folder,
 * and once nothing of the session is attached removes the dir
 * ({@link CONTROL_HOST_SCRATCH_REMOVE}).
 */
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  type HostOutputListed,
  OUTPUTS_DIR,
  type WorkspaceOutputs,
} from "@cawco/core/harness";
import {
  forgetWorkspaceTmp,
  linkWorkspaceTmp,
  workspaceScratchDir,
} from "@cawco/core/paths/workspace";
import { workWords } from "@cawco/core/words/work";
import { removeTree } from "./remove-tree";

/** A workspace id as the hub makes one (`crypto.randomUUID()`): nothing else names a folder under the scratch root. */
const WORKSPACE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

/** The host workspace id `asked` names, as a control's `{ id }` or a spawn's string; refused for anything else. */
const hostId = (asked: unknown): string => {
  const id =
    typeof asked === "string"
      ? asked
      : (asked as { id?: unknown } | null | undefined)?.id;
  if (typeof id !== "string" || !WORKSPACE_ID.test(id)) {
    throw new Error(workWords.hostScratchUnnamed);
  }
  return id;
};

/**
 * The scratch dir of host workspace `id` made, `outputs/` in it, owner-only,
 * as its session is spawned: the `TMPDIR` its commands get (on macOS its
 * short name, core paths/workspace.ts `workspaceTmpDir`). Made again for a session
 * spawned after its removal.
 */
export const hostScratchReady = async (asked: unknown): Promise<string> => {
  const id = hostId(asked);
  await mkdir(join(workspaceScratchDir(id), OUTPUTS_DIR), {
    recursive: true,
    mode: 0o700,
  });
  return linkWorkspaceTmp(id);
};

/**
 * The regular files under `<scratch>/outputs/` of workspace `id`, each by its
 * path under it, base64: no link is followed (the folder itself included),
 * as the hub passes one over in what it keeps. None when it is not there.
 */
export const outputsOf = async (id: string): Promise<WorkspaceOutputs> => {
  const files: WorkspaceOutputs["files"] = [];
  for (const one of await outputsListed(id)) {
    if (one.link) {
      continue;
    }
    const handle = await open(
      join(workspaceScratchDir(id), OUTPUTS_DIR, one.path),
      // biome-ignore lint/suspicious/noBitwiseOperators: open(2) takes its flags as one bit set
      constants.O_RDONLY | constants.O_NOFOLLOW
    );
    try {
      files.push({
        path: one.path,
        content: (await handle.readFile()).toString("base64"),
      });
    } finally {
      await handle.close();
    }
  }
  return { files };
};

/**
 * Each regular file and link under `<scratch>/outputs/` of workspace `id`,
 * by its path under it, in path order, with its size (a link's 0), none of
 * their bytes: what hub work-items.ts `SCRATCH_OUTPUTS_LIST` says of a
 * bounded workspace's. A folder is walked, never through a link.
 */
const outputsListed = async (id: string): Promise<HostOutputListed[]> => {
  const root = join(workspaceScratchDir(id), OUTPUTS_DIR);
  const listed: HostOutputListed[] = [];
  const down = async (rel: string): Promise<void> => {
    const entries = await readdir(join(root, rel), {
      withFileTypes: true,
    }).catch(() => []);
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const inner = rel ? join(rel, entry.name) : entry.name;
      if (entry.isDirectory()) {
        await down(inner);
      } else if (entry.isSymbolicLink()) {
        listed.push({ path: inner, link: true, size: 0 });
      } else if (entry.isFile()) {
        const { size } = await lstat(join(root, inner));
        listed.push({ path: inner, link: false, size });
      }
    }
  };
  const top = await lstat(root).catch(() => undefined);
  if (top?.isDirectory()) {
    await down("");
  }
  return listed;
};

/**
 * {@link CONTROL_HOST_OUTPUTS}: what host workspace `{ id }`'s
 * `$TMPDIR/outputs/` holds, as it stands: with `read`, each regular file
 * with its bytes; without, each file and link listed with its size alone.
 */
export const hostOutputs = async (
  asked: unknown
): Promise<WorkspaceOutputs | { listed: HostOutputListed[] }> => {
  const id = hostId(asked);
  return (asked as { read?: unknown }).read === true
    ? await outputsOf(id)
    : { listed: await outputsListed(id) };
};

/** {@link CONTROL_HOST_SCRATCH_REMOVE}: host workspace `{ id }`'s scratch dir gone, its short name on macOS with it. */
export const removeHostScratch = async (asked: unknown): Promise<void> => {
  const id = hostId(asked);
  await removeTree(workspaceScratchDir(id));
  forgetWorkspaceTmp(id);
};
