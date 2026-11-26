/**
 * What the commands a harness runs itself get of their session, beyond its
 * account's environment, for a harness whose own process starts them (Codex's
 * app-server, Antigravity's agy).
 */
import { CAWCO_ENV } from "@cawco/core/cawco-env";
import { sessionGitEnv } from "../git-credential";
import type { HarnessContext } from "../harness";

/**
 * git reaching the hub's remote as this session (git-credential.ts), its
 * container runtimes through its own doors (session-containers.ts; none in a
 * workspace, whose boundary reaches no runtime), a host-scope delegate's
 * scratch dir as their `TMPDIR` (host-scratch.ts), and the session's own
 * identity, as a Claude session's shell has it (claude.ts `sessionEnv`):
 * `cawco tool` there acts as this session and sends the credential its CawCo
 * MCP sends. A workspace's commands run in its boundary, whose executor
 * gives them its scratch dir as `TMPDIR` and keeps the caller's identity.
 */
export const commandEnv = (ctx: HarnessContext): Record<string, string> => ({
  ...sessionGitEnv(),
  ...ctx.containerEnv,
  ...(ctx.hostTmp ? { TMPDIR: ctx.hostTmp } : {}),
  [CAWCO_ENV.instanceId]: ctx.instanceId,
  ...(ctx.sessionCredential
    ? { [CAWCO_ENV.sessionCredential]: ctx.sessionCredential }
    : {}),
});
