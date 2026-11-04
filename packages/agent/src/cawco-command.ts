/**
 * This build's own `cawco <verb>`, for what the agent runs in a process of
 * its own: git's credential helper (git-credential.ts), a read of Claude
 * Code's settings (tools.ts `SETTINGS_ENGINES`).
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { standalone } from "@cawco/core/runtime";

/**
 * Defined only in the published package's bundle (scripts/build-binary.ts),
 * where this module is `cli.js` itself.
 */
declare const __CAWCO_RELEASE__: boolean | undefined;

/** This build's `cawco <verb>` as argv, the way the keeper is launched (sessiond-client.ts). */
export const cawcoCommand = (verb: string): string[] => {
  if (standalone) {
    return [process.execPath, verb];
  }
  return [
    process.execPath,
    typeof __CAWCO_RELEASE__ === "boolean"
      ? fileURLToPath(import.meta.url)
      : join(
          dirname(fileURLToPath(import.meta.url)),
          "..",
          "..",
          "cli",
          "src",
          "cli.ts"
        ),
    verb,
  ];
};
