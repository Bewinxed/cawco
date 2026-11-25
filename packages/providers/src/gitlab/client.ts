/**
 * GitLab's client through @gitbeaker/rest, "A Typed GitLab SDK for
 * Browsers, Node.js, and Deno" (github.com/jdalrymple/gitbeaker), made here
 * for every caller (provider spec §2.2): a hub connection's (its access
 * token, on gitlab.com or the self-managed host the connection names, hub
 * connections.ts `gitlabClient`) and a machine's (glab's sign-in, the
 * host's `token` and where its API answers: agent forges, "`token`: Your
 * GitLab access token … Scoped per host", docs.gitlab.com/cli/config).
 *
 * {@link gitlabAsk} is one request as an Effect within the hub's deadline,
 * GitLab's refusal read into its kind and words.
 */
import { Gitlab } from "@gitbeaker/rest";
import { type ProviderRefused, refusedWith, request } from "../read-stop";

/** A client signed in to one GitLab host. */
export interface GitLabClient {
  api: Gitlab<false>;
}

/** Gitbeaker's own deadline on a request, past which it gives up (its default is five minutes). Our choice: past the hub's own deadline. */
const QUERY_TIMEOUT_MS = 120_000;

/** A client for `api` (`https://gitlab.example.com`), signed in with `token`. */
export const gitlabClient = (signIn: {
  api: string;
  token: string;
}): GitLabClient => ({
  api: new Gitlab({
    host: signIn.api,
    token: signIn.token,
    queryTimeout: QUERY_TIMEOUT_MS,
  }),
});

/** What an event route's source pattern matches of a project: `gitlab:<path>` on gitlab.com, `gitlab:<host>/<path>` on a self-managed host. */
export const gitlabSource = (host: string, path: string): string =>
  `gitlab:${host === "gitlab.com" ? "" : `${host}/`}${path.toLowerCase()}`;

/** GitLab's answer as gitbeaker throws it (`GitbeakerRequestError`'s `cause.response`): its status, its headers, and its words. */
const answerOf = (
  error: unknown
): { headers: Headers | null; said: string; status: number | null } => {
  const said = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error ? error.cause : undefined;
  const response =
    typeof cause === "object" &&
    cause !== null &&
    "response" in cause &&
    cause.response instanceof Response
      ? cause.response
      : null;
  return {
    status: response?.status ?? null,
    headers: response?.headers ?? null,
    said: said.length > 300 ? `${said.slice(0, 300)}…` : said,
  };
};

/** When GitLab's rate limit lets the next request go, ms (`RateLimit-Reset`: "Unix time-formatted time when the request quota is reset", docs.gitlab.com/administration/settings/user_and_ip_rate_limits). */
const resetOf = (headers: Headers | null, now: number): number => {
  const reset = Number(headers?.get("ratelimit-reset"));
  if (Number.isFinite(reset) && reset > 0) {
    return reset * 1000;
  }
  const retry = Number(headers?.get("retry-after"));
  return Number.isFinite(retry) && retry > 0 ? now + retry * 1000 : now;
};

/** What GitLab's refusal of `what` on `path` says, in its words and with what the connection needs. */
const gitlabRefusal = (
  error: unknown,
  what: string,
  path: string
): ProviderRefused => {
  const { status, headers, said } = answerOf(error);
  if (status === null) {
    // Gitbeaker gives up a 429 after its own retries, unanswered.
    return error instanceof Error && error.name === "GitbeakerRetryError"
      ? refusedWith(
          `GitLab rate-limited the request to ${what}: ${said}`,
          "rate",
          resetOf(null, Date.now()) + 60_000
        )
      : refusedWith(
          `Could not reach GitLab to ${what}: ${said}`,
          "unreachable"
        );
  }
  if (status === 401) {
    return refusedWith(`GitLab refused sign-in: ${said}`, "sign-in");
  }
  if (status === 429) {
    const at = resetOf(headers, Date.now());
    return refusedWith(
      `GitLab rate-limited requests until ${new Date(at).toISOString()}.`,
      "rate",
      at
    );
  }
  if (status === 403) {
    return refusedWith(
      `GitLab refused to ${what} on ${path}: ${said}. The token needs the api or read_api scope and a role with permission.`,
      "scope"
    );
  }
  // "A resource couldn't be accessed. For example, an ID for a resource
  // couldn't be found, or the user isn't authorized to access the
  // resource." (docs.gitlab.com/api/rest/troubleshooting, `404 Not Found`)
  if (status === 404) {
    return refusedWith(
      `GitLab failed to ${what} on ${path} (404)${said ? `: ${said}` : ""}. Check the path and token access.`,
      "scope"
    );
  }
  return refusedWith(
    `GitLab failed to ${what} on ${path} (${status})${said ? `: ${said}` : ""}`
  );
};

/** One request to GitLab within `requestMs`, its refusal read by {@link gitlabRefusal}. */
export const gitlabAsk = <A>(
  requestMs: number,
  what: string,
  path: string,
  run: () => Promise<A>
) =>
  request(
    "GitLab",
    requestMs,
    () => run(),
    (error) => gitlabRefusal(error, what, path)
  );

/** Whether gitbeaker's failure was GitLab's 404. */
export const isNotFound = (error: unknown): boolean =>
  answerOf(error).status === 404;
