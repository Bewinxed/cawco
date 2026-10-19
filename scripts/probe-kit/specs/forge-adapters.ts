/**
 * Every forge through one adapter interface (docs/forge-adapters.md): GitHub
 * on Octokit signed in as the real gh, GitLab on @gitbeaker/rest signed in
 * from glab's config, Gitea through gitea-mcp signed in from tea's config,
 * each against a stand-in of that forge's documented API and its git over
 * http on the loopback (forge-legs.ts names the legs).
 *
 *   bun scripts/probe-kit/run.ts forge-adapters
 *
 * GitHub and GitLab run every leg. Gitea runs its pushes, its refusal and its
 * held card here; its writes are made by gitea-mcp, which the host runs only
 * from where no workspace writes, so the spec forge-adapters-gitea (host)
 * makes them. Then, on one host, GitHub and GitLab both signed in: an
 * ambiguous forge_post is refused, asking for the repository's URL
 * (forge-legs.ts (g)). And the hub's GitHub poller reads through Octokit
 * against a stand-in of GitHub's API (github-poll.ts (p)).
 */
import { ambiguousLeg, forgeLegs, forgeScratch } from "../forge-legs";
import { githubPollLeg } from "../github-poll";
import type { Spec } from "../kit";

const spec: Spec = {
  name: "forge-adapters",
  async run(kit) {
    // Each forge on a HOME of its own: the stand-ins share the loopback's
    // name, and a project's remote names no port.
    for (const [forge, made] of [
      ["github", true],
      ["gitlab", true],
      ["gitea", false],
    ] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: one forge's stand-ins at a time
      const scratch = await forgeScratch();
      try {
        await forgeLegs(kit, scratch, forge, made);
      } finally {
        scratch.stop();
      }
    }
    const shared = await forgeScratch();
    try {
      await ambiguousLeg(kit, shared);
    } finally {
      shared.stop();
    }
    await githubPollLeg(kit);
  },
};

export default spec;
