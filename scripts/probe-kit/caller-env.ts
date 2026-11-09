/**
 * The variables that name the session a probe run was started from. A
 * session's shell carries them, inside a workspace or on the host; the host
 * checks' runner carries none. run.ts runs every spec in a process started
 * without them ({@link withoutCaller}), so a spec reads the same environment
 * wherever its run was started. A spec that needs a hub names its own
 * (git-door, landing-faults, host-lfs) or stands one up (a scratch fleet).
 *
 * - CawCo's, which every session's shell carries (core session-env.ts
 *   `SESSION_CAWCO_ENV`): the hub its agent reaches, the session's id and
 *   credential, and in a workspace its tool door (`CAWCO_TOOL_SOCKET`).
 *   Through them, product code a spec runs reaches the live hub as that
 *   session: `gitDoorEnv` rewrites to the live hub (git-door and
 *   landing-faults passed in a workspace and failed on the host, 2026-11-04),
 *   `cawco tool` acts as the session, and the CLI refuses what a session's
 *   shell may not do (cli connections.ts `set-key`).
 * - Claude Code's, in a Claude session's shell: `CLAUDECODE`, every
 *   `CLAUDE_CODE_*` (its `CLAUDE_CODE_SHELL_PREFIX` would run each command of
 *   a Claude Code a spec starts in that session's workspace), and
 *   `CLAUDE_CONFIG_DIR`, the session's account, which core paths/claude.ts
 *   `claudeConfigDirs` reads as one of the machine's Claude dirs, its
 *   credentials included.
 *
 * A spec that runs inside a workspace's boundary (kit.ts `Spec.workspace`)
 * keeps them: its subject is that session's own boundary, tool door and
 * identity included (boundary-proxy calls `artifact_browse` as the session).
 *
 * What else differs between a workspace and the host stays, as what a spec
 * needs to run there at all: the boundary's proxy (`HTTPS_PROXY` and its
 * kin, `NODE_USE_ENV_PROXY`), `TMPDIR`, the caches and XDG dirs, the
 * session's container doors (`DOCKER_HOST`, `CONTAINER_HOST`), and
 * `CAWCO_WORKSPACE`, by which the kit runs a spec where it can run. The
 * workspace's git and gh settings go for a spec that stands up its own git
 * (kit.ts `ENCLOSING_GIT_ENV`).
 *
 * Bun starts a child (`Bun.spawn`, `Bun.spawnSync`) with no `env` given in
 * the environment its process started with, whatever `process.env` was
 * changed to since, so a variable is left out of a process as it starts,
 * never deleted from one that runs.
 */
import { CAWCO_ENV } from "../../packages/core/src/cawco-env";
import { SESSION_CAWCO_ENV } from "../../packages/core/src/session-env";

const CALLER_CAWCO: ReadonlySet<string> = new Set([
  ...SESSION_CAWCO_ENV,
  CAWCO_ENV.toolSocket,
]);
const CALLER_CLAUDE = /^(?:CLAUDECODE|CLAUDE_CODE_\w+|CLAUDE_CONFIG_DIR)$/u;

/** Whether `name` names the session the run was started from. */
const isCaller = (name: string): boolean =>
  CALLER_CAWCO.has(name) || CALLER_CLAUDE.test(name);

/** The names in `env` of the session the run was started from. */
export const callerNames = (
  env: Readonly<Record<string, string | undefined>>
): string[] =>
  Object.keys(env).filter((name) => env[name] !== undefined && isCaller(name));

/** `env` without the session the run was started from. */
export const withoutCaller = (
  env: Readonly<Record<string, string | undefined>>
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && !isCaller(entry[0])
    )
  );
