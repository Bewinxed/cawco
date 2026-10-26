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
 * origin it first empties the helper list ("If credential.helper is set to
 * the empty string, this resets the helper list to empty", git-config(1)),
 * so a machine's own `credential.helper = store` is never handed the
 * session's credential to keep on disk.
 *
 * The helper is keyed to the hub's origin (protocol and host), not to its
 * `/git/` path: git-lfs asks `git credential fill` with no path (git sends
 * one only under `credential.useHttpPath`), and a path-scoped
 * `credential.<url>` matches no request without one, so git-lfs's uploads
 * and downloads found no helper ("could not read Username").
 */

import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CAWCO_ENV } from "@cawco/core";
import { cawcoDataDir } from "@cawco/core/paths";
import { standalone } from "@cawco/core/runtime";
import { SAFE_GIT_ENV, safeGitArgv } from "@cawco/core/safe-git";
import { writeStateFile } from "@cawco/core/state-file";

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
 * Where the hub's last register ack's git origins are kept, one file per hub:
 * an agent started again knows them before its first ack. Without them its
 * sessions' launch env named fewer origins than the OpenCode server it found
 * running had started with, so it read that server as another's and replaced
 * it, every restart, under every session the server held (agent-loop probe,
 * 2026-10-24: "launch verification failed: started with … GIT_CONFIG_COUNT
 * 15 …, launching with … GIT_CONFIG_COUNT 3").
 */
const originsFile = (): string | undefined => {
  const origin = hubOrigin();
  return origin
    ? join(
        cawcoDataDir(),
        `hub-git-origins-${new URL(origin).host.replaceAll(":", "_")}.json`
      )
    : undefined;
};

/** What `text` names as origins: its strings, nothing else. */
const originsOf = (said: unknown): string[] =>
  Array.isArray(said)
    ? said.filter((one): one is string => typeof one === "string")
    : [];

/** The kept origins of the hub this agent reaches, read once as it starts; none when there are none. */
const keptOrigins = (): string[] => {
  const file = originsFile();
  if (!file) {
    return [];
  }
  try {
    return originsOf(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    return [];
  }
};

/** The hub's own git origins, as its last register ack named them (core `RegisterAckPayload.gitOrigins`). */
let ackOrigins: string[] = keptOrigins();

/** The register ack's `gitOrigins`: what else the hub's git remote answers at, kept for the next start. */
export const setHubGitOrigins = (origins: unknown): void => {
  const next = originsOf(origins);
  const changed = JSON.stringify(next) !== JSON.stringify(ackOrigins);
  ackOrigins = next;
  const file = originsFile();
  if (!(changed && file)) {
    return;
  }
  mkdir(dirname(file), { recursive: true, mode: 0o700 })
    .then(() => writeStateFile(file, JSON.stringify(next), { mode: 0o600 }))
    .catch((error: unknown) =>
      console.warn(
        `[hub-git] the hub's git origins were not kept for the next start: ${error instanceof Error ? error.message : String(error)}`
      )
    );
};

/**
 * Every origin of the hub's git remote this agent knows: the one it reaches
 * the hub by, then each the hub answers at. None while it knows no hub.
 */
export const hubOrigins = (): string[] => {
  const own = hubOrigin();
  return own ? [...new Set([own, ...ackOrigins])] : [];
};

/**
 * The hub origin `url` names one of the hub's repositories under
 * (`<origin>/git/`), whichever of the hub's addresses made it; undefined for
 * any other remote. A clone's origin names the hub as the machine that made
 * it reached the hub, which need not be how this one does.
 */
export const hubOriginOf = (url: string): string | undefined =>
  hubOrigins().find((origin) => url.startsWith(`${origin}/git/`));

/**
 * `cawco git-credential` named in the checkout at `repo`'s own config for
 * the hub origin its `origin` remote is under ({@link hubOriginOf}; the one
 * this agent reaches the hub by, for a remote it is setting up), the helper
 * list reset first, so no helper of the machine's is handed the credential
 * to keep, and LFS lock checks off: a plain `git pull` and `git push` there
 * authenticate to the hub, with the session's credential in a session's
 * shell and the machine's elsewhere (hub-git.ts `serveHubCredential`). Only
 * the helper's name is written; no credential is. Nothing while this agent
 * knows no hub, and nothing when the config says all this already: a
 * workspace's create calls this on its source repository every time, and a
 * rewrite each time met any other writer of that config (another agent on
 * the computer readying it, the owner's own git) at its lock: "could not
 * lock config file .git/config: File exists" (link-under-load, 2026-10-20).
 */
export const useHubCredentialHelper = (repo: string): void => {
  const config = (...args: string[]) =>
    Bun.spawnSync(safeGitArgv(["-C", repo, "config", "--local", ...args]), {
      env: { ...process.env, ...SAFE_GIT_ENV },
      stderr: "pipe",
    });
  const named = config("--get", "remote.origin.url").stdout.toString().trim();
  const origin = hubOriginOf(named) ?? hubOrigin();
  if (!origin) {
    return;
  }
  const remote = `${origin}/git/`;
  const helper = `!${cawcoCommand("git-credential").map(shellWord).join(" ")}`;
  const key = `credential.${origin}.helper`;
  const said = (...args: string[]) => {
    const read = config(...args);
    return read.exitCode === 0 ? read.stdout.toString() : undefined;
  };
  if (
    said("--get-all", key) === `\n${helper}\n` &&
    said("--get-all", `credential.${remote}.helper`) === undefined &&
    said("--get", `lfs.${remote}.locksverify`) === "false\n"
  ) {
    return;
  }
  // Exit 5 when there is none to unset. The `/git/`-scoped key is what an
  // earlier build wrote: it matched none of git-lfs's requests.
  config("--unset-all", key);
  config("--unset-all", `credential.${remote}.helper`);
  for (const args of [
    ["--add", key, ""],
    ["--add", key, helper],
    [`lfs.${remote}.locksverify`, "false"],
  ]) {
    const ran = config(...args);
    if (ran.exitCode !== 0) {
      throw new Error(
        `git config in ${repo} failed: ${ran.stderr.toString().trim()}`
      );
    }
  }
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
  const origins = hubOrigins();
  if (origins.length === 0) {
    return {};
  }
  const pairs: [string, string][] = origins.flatMap(
    (origin): [string, string][] => [
      [`credential.${origin}.helper`, ""],
      [
        `credential.${origin}.helper`,
        `!${cawcoCommand("git-credential").map(shellWord).join(" ")}`,
      ],
      [`lfs.${origin}/git/.locksverify`, "false"],
    ]
  );
  return configEnv(pairs, base);
};

/**
 * Config git and git-lfs read from the environment alone, appended after any
 * `base` (the environment the command starts from) already carries.
 */
export const configEnv = (
  pairs: [string, string][],
  base: Record<string, string | undefined> = process.env
): Record<string, string> => {
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
