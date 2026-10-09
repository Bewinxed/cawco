/**
 * How a session's git reaches the hub's git remote (hub git-remote.ts): git
 * asks a credential helper (git-credential(1)) and gets the session's own
 * `instanceId:sessionCredential`, which the remote takes as HTTP Basic. The
 * helper is this build's `cawco git-credential`, reading both from the
 * session's environment, where every harness already puts them for
 * `cawco tool`.
 *
 * The config is env-only (`GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_n`/
 * `GIT_CONFIG_VALUE_n`, appended after any the environment already carries),
 * so nothing is written to the session's repository or home. For the hub's
 * `/git/` URLs it first empties the helper list ("If credential.helper is
 * set to the empty string, this resets the helper list to empty",
 * git-config(1)), so a machine's own `credential.helper = store` is never
 * handed the session's credential to keep on disk.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CAWCO_ENV } from "@cawco/core";
import { standalone } from "@cawco/core/runtime";

/**
 * Defined only in the published package's bundle (scripts/build-binary.ts),
 * where this module is `cli.js` itself.
 */
declare const __CAWCO_RELEASE__: boolean | undefined;

/** One argument as sh reads it back unchanged. */
const shellWord = (word: string): string =>
  `'${word.replaceAll("'", "'\\''")}'`;

/** This build's `cawco <verb>` as argv, the way the keeper is launched (sessiond-client.ts). */
const cawcoCommand = (verb: string): string[] => {
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

/** The hub's HTTP origin, from the socket address this agent is connected on. */
const hubOrigin = (): string | undefined => {
  const ws = process.env[CAWCO_ENV.hubUrl];
  if (!ws) {
    return undefined;
  }
  const url = new URL(ws);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  return url.origin;
};

/**
 * The env-only git config a session runs with, appended after what `base`
 * (the environment it starts from) already carries: the hub remote's
 * credential helper, and LFS lock checks off (the hub has none, and git-lfs
 * would otherwise ask on every push). Empty while this agent knows no hub.
 */
export const sessionGitEnv = (
  base: Record<string, string | undefined> = process.env
): Record<string, string> => {
  const origin = hubOrigin();
  if (!origin) {
    return {};
  }
  const remote = `${origin}/git/`;
  const pairs: [string, string][] = [
    [`credential.${remote}.helper`, ""],
    [
      `credential.${remote}.helper`,
      `!${cawcoCommand("git-credential").map(shellWord).join(" ")}`,
    ],
    [`lfs.${remote}.locksverify`, "false"],
  ];
  const first = Number.parseInt(base.GIT_CONFIG_COUNT ?? "0", 10) || 0;
  const env: Record<string, string> = {
    GIT_CONFIG_COUNT: String(first + pairs.length),
  };
  pairs.forEach(([key, value], index) => {
    env[`GIT_CONFIG_KEY_${first + index}`] = key;
    env[`GIT_CONFIG_VALUE_${first + index}`] = value;
  });
  return env;
};
