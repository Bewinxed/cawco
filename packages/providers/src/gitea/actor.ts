/**
 * Someone Gitea names, as an outside item carries them, and whether Gitea
 * vouches for them on the repository.
 *
 * gitea-mcp has no tool that reads one user's permission on a repository
 * (its tools, gitea.com/gitea/gitea-mcp `operation/`). What it reads is the
 * repository's assignee candidates (`issue_read`, method
 * `get_assignee_candidates`: Gitea's `GET /repos/{owner}/{repo}/assignees`),
 * which Gitea defines as "all users that have write access and can be
 * assigned to issues or pull-requests of the repository", with the teams of
 * an owning organization that reach its issues or pull requests
 * (go-gitea/gitea models/repo/user_repo.go `GetRepoAssignees`). Gitea
 * vouches for an author among them: write access, as claude-code-action
 * runs only for "users with write access to the repository" (its
 * docs/security.md). Anyone else, a reader of a public repository among
 * them, is someone Gitea does not vouch for.
 */
import { Effect, Result, Schema } from "effect";
import type { ExternalActor, OutsideActor, SourceEvent } from "../provider";
import { type ProviderFailure, refusedWith } from "../read-stop";
import { type GiteaClient, giteaJson, repoArgs } from "./client";

/** Someone as a Gitea webhook's payload names them (Gitea's API `User`). */
export const GiteaUserSchema = Schema.Struct({
  avatar_url: Schema.optional(Schema.NullOr(Schema.String)),
  full_name: Schema.optional(Schema.NullOr(Schema.String)),
  html_url: Schema.optional(Schema.NullOr(Schema.String)),
  login: Schema.String,
});
type GiteaUser = (typeof GiteaUserSchema)["Type"];

/** Someone Gitea names, by their login alone (gitea-mcp's answers) or whole (a webhook's), as an external item carries them. */
export const giteaActorOf = (
  user: GiteaUser | string | null | undefined,
  host: string
): ExternalActor | null => {
  if (!user) {
    return null;
  }
  const whole = typeof user === "string" ? { login: user } : user;
  return {
    source: "gitea",
    login: whole.login,
    name: ("full_name" in whole ? whole.full_name : null) || null,
    avatarUrl: ("avatar_url" in whole ? whole.avatar_url : null) || null,
    url:
      ("html_url" in whole ? whole.html_url : null) ||
      `https://${host}/${whole.login}`,
    kind: "person",
    memberId: null,
  };
};

/** The assignee candidates as gitea-mcp answers them. */
const CandidatesSchema = Schema.Array(Schema.Struct({ login: Schema.String }));

/** The events that carry their author's own words: whose standing is read. */
const THEIR_WORDS: ReadonlySet<string> = new Set([
  "issue.opened",
  "pr.opened",
  "comment.created",
]);

/**
 * The events with each author of words beside their standing on
 * `repo`: the repository's assignee candidates, read once when any event
 * needs them. A read gitea-mcp refuses is the failure, so nothing is
 * stored without its author's standing.
 */
export const vouchedEvents = (
  client: GiteaClient,
  repo: string,
  events: readonly SourceEvent[],
  requestMs: number
): Effect.Effect<SourceEvent[], ProviderFailure> =>
  Effect.gen(function* () {
    if (!events.some((event) => event.actor && THEIR_WORDS.has(event.kind))) {
      return [...events];
    }
    const answer = yield* giteaJson(
      client,
      "issue_read",
      { method: "get_assignee_candidates", ...repoArgs(repo) },
      requestMs
    );
    const read = Schema.decodeUnknownResult(CandidatesSchema)(answer ?? []);
    if (Result.isFailure(read)) {
      return yield* refusedWith(
        `gitea-mcp's assignee candidates of ${repo} did not read as a list of users.`
      );
    }
    const writers = new Set(read.success.map((one) => one.login.toLowerCase()));
    return events.map((event): SourceEvent => {
      if (!(event.actor && THEIR_WORDS.has(event.kind))) {
        return event;
      }
      const actor: OutsideActor = {
        ...event.actor,
        unvouched: writers.has(event.actor.login.toLowerCase())
          ? null
          : `${event.actor.login}, no write access`,
      };
      return { ...event, actor };
    });
  });
