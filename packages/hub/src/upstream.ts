/**
 * The upstream guard's rules (core upstream-guard.ts), as the hub hands them
 * to every machine with each register and heartbeat ack: the fleet's answer
 * from onboarding (`upstream_settings`), and each project's own
 * (`projects.upstream_posts`), null inheriting the fleet's. Never answered,
 * sessions may post upstream, as before the choice existed; the dashboard
 * asks once (fleet-choices.ts `upstream`).
 *
 * A project's own repository is its remote (`projects.remote`, the
 * checkout's `origin` as `host/owner/repo`): a write there always runs.
 */
import type { UpstreamRules } from "@cawco/core/upstream-guard";
import type { DbShape, ProjectRow } from "./db";

/** Whether a project's sessions may post to other repositories: its own answer, else the fleet's, else yes. */
export const upstreamPostsOf = (
  project: Pick<ProjectRow, "upstreamPosts">,
  fleet: boolean | null
): boolean => project.upstreamPosts ?? fleet ?? true;

export const upstreamRules = (
  db: Pick<DbShape, "listProjects" | "upstreamPosts">
): UpstreamRules => {
  const fleet = db.upstreamPosts();
  return {
    fleet: { guarded: fleet === false, remotes: [] },
    projects: Object.fromEntries(
      db.listProjects().map((project) => [
        project.id,
        {
          guarded: !upstreamPostsOf(project, fleet),
          remotes: project.remote ? [project.remote] : [],
        },
      ])
    ),
  };
};
