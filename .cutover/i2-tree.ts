import { tmpdir } from "node:os";
import { join } from "node:path";

/** The source of record, and where i2-exact.ts unpacks its apps/dashboard. */
export const T = "ac7b79de8";
export const T_DIR = join(tmpdir(), `i2-exact-${T}`);
