import { tmpdir } from "node:os";
import { join } from "node:path";

/** The source of record, and where i2-exact.ts unpacks its apps/dashboard. */
export const T = "ac7b79de8";
/** The main sha phase 2 merges: a change main made after T is proved against its own rule here. */
export const M = "a7e27322c";
/** Where i2-exact.ts unpacks a sha's apps/dashboard. */
export const treeDir = (sha: string): string =>
  join(tmpdir(), `i2-exact-${sha}`);
export const T_DIR = treeDir(T);
export const M_DIR = treeDir(M);
