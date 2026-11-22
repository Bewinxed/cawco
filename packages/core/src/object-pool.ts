/**
 * A workspace clone's object pool, as the policy and the agent read it: one
 * bare repository per origin under `~/.cawco/object-pools/` (paths/workspace.ts
 * `objectPoolsDir`), whose objects every clone of that origin borrows through
 * one line in its `.git/objects/info/alternates`, and which no sandbox can
 * write. A clone stores only the objects it makes itself. The agent makes,
 * fetches into and repacks each pool (agent object-pool.ts); this module
 * names a pool and reads which one a workspace's record says it borrows.
 *
 * Which pool a clone borrows is read from its `create.json` alone, a record
 * in its state dir that nothing inside its boundary writes, never from its
 * alternates file: a command in the clone could otherwise widen what it may
 * read by naming another store there.
 */
import { createHash } from "node:crypto";
import { basename, dirname, isAbsolute, join } from "node:path";
import { z } from "zod";
import { objectPoolsDir, workspaceCreateFile } from "./paths/workspace";
import { readRecord, readRecordSync } from "./state-file";

/**
 * A cut's record in its state dir, `create.json`: the clone's path, written
 * before anything is at it; the pool it borrows from, written in that same
 * first write, before anything borrows; and once the clone is made the URL of
 * `origin` it was cut from, as the host read it from the source. A clone cut
 * before pools has no `pool` until the agent converts it (agent
 * object-pool.ts `borrowFromPool`). A stage clone or pin (agent
 * stage-clone.ts `cut`) has no `origin`, and its `pool` once the cut has
 * found one that lends, before it borrows; a folder's layer has neither. A
 * stage clone or pin of a folder in no repository (agent stage-clone.ts
 * `copyCut`) is a copy of that folder, no clone: its record names the folder
 * (`copies`) in its first write, before its boundary starts, and it is held
 * as a plain folder ({@link copiedFolderSync}).
 */
export const CreateRecordSchema = z.object({
  /** The folder in no repository this tree is a copy of, as a real path. */
  copies: z.string().optional(),
  origin: z.string().optional(),
  path: z.string().optional(),
  pool: z.string().optional(),
});
export type CreateRecord = z.infer<typeof CreateRecordSchema>;

/** A pool's folder name: {@link poolKey}'s hex, and `.git`. */
const POOL_NAME = /^[0-9a-f]{32}\.git$/u;

/**
 * The key of the pool for `origin` in object format `format`: one pool per
 * origin, never one per machine, since any borrower reads any object in its
 * pool by name, and a pool shared across origins would let one project's
 * delegates read another's. The format is in it so a SHA-256 repository has
 * a pool of its own.
 */
const poolKey = (format: string, origin: string): string =>
  createHash("sha256")
    .update(`${format}\n${origin}`)
    .digest("hex")
    .slice(0, 32);

/** The pool every clone of `origin` in object format `format` borrows from. */
export const poolAt = (format: string, origin: string): string =>
  join(objectPoolsDir(), `${poolKey(format, origin)}.git`);

/** Whether `path` is a pool's folder as {@link poolAt} names one: nothing else is ever granted or borrowed. */
export const isPoolPath = (path: string): boolean =>
  isAbsolute(path) &&
  dirname(path) === objectPoolsDir() &&
  POOL_NAME.test(basename(path));

/** The objects dir of `pool`: what a borrowing clone's alternates file names. */
const poolObjects = (pool: string): string => join(pool, "objects");

/** A clone's whole alternates file when it borrows from `pool`. */
export const alternatesText = (pool: string): string =>
  `${poolObjects(pool)}\n`;

/** Workspace `id`'s `create.json`; nothing when it has none. A damaged one throws. */
export const createRecordOf = (id: string): Promise<CreateRecord | undefined> =>
  readRecord(workspaceCreateFile(id), CreateRecordSchema);

/**
 * The pool workspace `id`'s clone borrows from, as its `create.json` records
 * it, when that names a pool's folder ({@link isPoolPath}); nothing for a
 * clone or stage clone that borrows none, a place or a folder's layer. A
 * damaged record throws: what reads it does not guess.
 */
export const recordedPool = async (id: string): Promise<string | undefined> => {
  const pool = (await createRecordOf(id))?.pool;
  return pool && isPoolPath(pool) ? pool : undefined;
};

/**
 * The folder workspace `id`'s tree is a copy of, as its `create.json`
 * records it ({@link CreateRecordSchema} `copies`), read synchronously:
 * a stage clone or pin of a folder in no repository, which its boundary
 * holds as a plain folder, as a design folder is (agent boundary/plan.ts
 * `kindEnv`, workspace-policy.ts `workspaceDenies`, agent layer.ts
 * `layerOf`). Nothing for every other tree. A damaged record throws: what
 * reads it does not guess.
 */
export const copiedFolderSync = (id: string): string | undefined =>
  readRecordSync(workspaceCreateFile(id), CreateRecordSchema)?.copies;
