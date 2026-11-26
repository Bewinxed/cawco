/**
 * What the commands a harness runs itself get of their session, beyond its
 * account's environment, for a harness whose own process starts them (Codex's
 * app-server, Antigravity's agy).
 */
import { sessionGitEnv } from "../git-credential";
import type { HarnessContext } from "../harness";

/**
 * git reaching the hub's remote as this session (git-credential.ts), its
 * container runtimes through its own doors (session-containers.ts; none in a
 * workspace, whose boundary reaches no runtime), and a host-scope
 * delegate's scratch dir as their `TMPDIR` (host-scratch.ts). A workspace's
 * commands run in its boundary, whose executor gives them its scratch dir as
 * `TMPDIR`.
 */
export const commandEnv = (ctx: HarnessContext): Record<string, string> => ({
  ...sessionGitEnv(),
  ...ctx.containerEnv,
  ...(ctx.hostTmp ? { TMPDIR: ctx.hostTmp } : {}),
});
