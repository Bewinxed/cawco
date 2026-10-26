/**
 * The git door's environment for a clone's origin outside the hub (agent
 * hub-git.ts `hostOriginGitEnv`), printed as JSON for the host-lfs spec. It
 * runs as a child so the environment it reads is the one it is given: inside
 * a workspace, the spec leaves out the workspace's own git config.
 *
 *   bun host-origin-git-env-child.ts ORIGIN
 */
import { hostOriginGitEnv } from "../../packages/agent/src/hub-git";

const [origin] = process.argv.slice(2);
if (!origin) {
  console.error("usage: bun host-origin-git-env-child.ts ORIGIN");
  process.exit(2);
}
console.log(JSON.stringify(await hostOriginGitEnv(origin)));
