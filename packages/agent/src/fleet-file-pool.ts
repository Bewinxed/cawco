/**
 * The fleet's file pool: each file of a fleet item this machine holds (a
 * skill's, a plugin's), and each such item's tree (fleet-ledger.ts), stored
 * once in one folder (core paths/fleet.ts `fleetFilePoolDir`), named by the
 * SHA-256 of its bytes. The ledger names each item's tree by its hash, and
 * the tree each file, so an item that moved writes only its tree and the
 * files the pool did not hold, and items carrying the same file hold it
 * once.
 *
 * Its rules:
 *
 * - a file is written whole and durably, under a temporary name first
 *   (core state-file.ts `writeStateFile`), before the ledger that names
 *   it; one already there is not written again: its name is its content;
 * - it is written and collected by the ledger alone, one turn at a time
 *   (fleet-ledger.ts `#writing`), so nothing is written while a collection
 *   runs;
 * - a file no item names, held or in the ledger on disk, goes at the next
 *   collection ({@link collectPool}), after a converge and as the agent
 *   starts; so does whatever else is in the pool (a temporary file a write
 *   cut short left).
 *
 * The workspaces' object pools (object-pool.ts) cannot hold these files:
 * they are bare git repositories, one per origin, that workspace clones
 * borrow objects from, and nothing in them is ever removed, since an object
 * pruned there is gone from every clone that reached it. Fleet files have
 * no origin and no borrower, and go when no item names them.
 */
import { readFileSync } from "node:fs";
import { lstat, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { isGone } from "@cawco/core/absent";
import { writeStateFile } from "@cawco/core/state-file";

/** A file's name in the pool: the SHA-256 of its bytes, in hex. */
export const contentHashOf = (bytes: Uint8Array): string =>
  new Bun.CryptoHasher("sha256").update(bytes).digest("hex");

const CONTENT_HASH = /^[0-9a-f]{64}$/u;

/** Where the file of content hash `hash` lies in pool `pool`. */
const pooledPath = (pool: string, hash: string): string => join(pool, hash);

/** The bytes of content `hash` in pool `pool`, read now; throws when the pool does not hold it. */
export const readPooled = (pool: string, hash: string): Buffer =>
  readFileSync(pooledPath(pool, hash));

/** Whether pool `pool` holds content `hash` whole: its file there, at `size` bytes. */
export const holdsWhole = async (
  pool: string,
  hash: string,
  size: number
): Promise<boolean> => {
  const found = await lstat(pooledPath(pool, hash)).catch((error: unknown) => {
    if (isGone(error)) {
      return;
    }
    throw error;
  });
  return found?.isFile() === true && found.size === size;
};

/** How many files a write into the pool has in flight at once: fsyncs in parallel share the journal's commits. */
const WRITES_AT_ONCE = 32;

/**
 * Each of `contents` written into pool `pool` that it does not hold whole
 * already, {@link WRITES_AT_ONCE} at a time. Answers how many it wrote and
 * their bytes.
 */
export const poolContents = async (
  pool: string,
  contents: ReadonlyMap<string, Uint8Array>
): Promise<{ bytes: number; files: number }> => {
  const owed: [string, Uint8Array][] = [];
  for (const [hash, bytes] of contents) {
    if (!(await holdsWhole(pool, hash, bytes.byteLength))) {
      owed.push([hash, bytes]);
    }
  }
  for (let at = 0; at < owed.length; at += WRITES_AT_ONCE) {
    await Promise.all(
      owed
        .slice(at, at + WRITES_AT_ONCE)
        .map(([hash, bytes]) => writeStateFile(pooledPath(pool, hash), bytes))
    );
  }
  return {
    files: owed.length,
    bytes: owed.reduce((sum, [, bytes]) => sum + bytes.byteLength, 0),
  };
};

/**
 * Every file in pool `pool` that `named` does not name taken away. Answers
 * how many went and their bytes.
 */
export const collectPool = async (
  pool: string,
  named: ReadonlySet<string>
): Promise<{ bytes: number; files: number }> => {
  let files = 0;
  let bytes = 0;
  for (const name of await readdir(pool).catch(() => [])) {
    if (CONTENT_HASH.test(name) && named.has(name)) {
      continue;
    }
    const path = join(pool, name);
    bytes += (await lstat(path).catch(() => undefined))?.size ?? 0;
    await rm(path, { recursive: true, force: true });
    files += 1;
  }
  return { files, bytes };
};
