/**
 * The upstream guard's rules (core upstream-guard.ts), as the hub hands them
 * to every machine with each register and heartbeat ack: the fleet's answer
 * from onboarding (`upstream_settings`), and each project's own
 * (`projects.upstream_posts`), null inheriting the fleet's. Each answer is
 * `off`, `ask` (each post waits for the person, upstream-asks.ts) or `on`.
 * Never answered, sessions may post upstream, as before the choice existed;
 * the dashboard asks once (fleet-choices.ts `upstream`).
 *
 * A project's own repository is its remote (`projects.remote`, the
 * checkout's `origin` as `host/owner/repo`): a write there always runs.
 */
import type {
  UpstreamPosts,
  UpstreamRule,
  UpstreamRules,
} from "@cawco/core/upstream-guard";
import type { DbShape, ProjectRow } from "./db";

/** Whether a project's sessions may post to other repositories: its own answer, else the fleet's, else on. */
export const upstreamPostsOf = (
  project: Pick<ProjectRow, "upstreamPosts">,
  fleet: UpstreamPosts | null
): UpstreamPosts => project.upstreamPosts ?? fleet ?? "on";

export const upstreamRules = (
  db: Pick<DbShape, "listProjects" | "upstreamPosts">
): UpstreamRules => {
  const fleet = db.upstreamPosts();
  return {
    fleet: { posts: fleet ?? "on", remotes: [] },
    projects: Object.fromEntries(
      db.listProjects().map((project) => [
        project.id,
        {
          posts: upstreamPostsOf(project, fleet),
          remotes: project.remote ? [project.remote] : [],
        },
      ])
    ),
  };
};

/** The rule a session goes by: its project's, else the fleet's. */
export const upstreamRuleOf = (
  db: Pick<DbShape, "listProjects" | "upstreamPosts">,
  projectId: string | null | undefined
): UpstreamRule => {
  const rules = upstreamRules(db);
  return (projectId && rules.projects[projectId]) || rules.fleet;
};
