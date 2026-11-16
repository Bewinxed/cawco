/**
 * The one GitHub REST API version every CawCo client calls: the hub's
 * connections, trackers, pollers, publisher and source reads, the agent's
 * forge and provider-account reads, the release reads and the install
 * script's. A call that names
 * no version is served `2022-11-28`, which GitHub retires on 2028-03-10
 * (docs.github.com/en/rest/about-the-rest-api/api-versions). Each read is
 * written to what this version answers (its breaks:
 * .../breaking-changes#version-2026-03-10).
 */
import { Octokit } from "@octokit/rest";

/** Named in `X-GitHub-Api-Version` on every REST call. */
export const GITHUB_API_VERSION = "2026-03-10";

/** The header that names it, as a `fetch` takes it. */
export const GITHUB_API_VERSION_HEADER = {
  "x-github-api-version": GITHUB_API_VERSION,
} as const;

/**
 * Octokit with {@link GITHUB_API_VERSION} named on every REST request it
 * makes, an auth strategy's own (an app's installation token) among them:
 * those go through the same `request` hook. GraphQL has no REST version.
 */
export class GitHubOctokit extends Octokit {
  constructor(options?: ConstructorParameters<typeof Octokit>[0]) {
    super(options);
    this.hook.before("request", (request) => {
      if (request.url !== "/graphql") {
        request.headers["x-github-api-version"] = GITHUB_API_VERSION;
      }
    });
  }
}
