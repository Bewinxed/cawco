/**
 * Someone GitLab names, as an outside item carries them, and whether GitLab
 * vouches for them on the project: their effective role there, read from
 * "List all members of a project … including inherited members, invited
 * users, and permissions through ancestor groups" for one user
 * (`GET /projects/:id/members/all/:user_id`, docs.gitlab.com/api/project_members;
 * "only their membership with the highest `access_level` is returned").
 *
 * GitLab vouches for someone with the Developer role or above (access level
 * 30: "Push code to non-protected branches, create merge requests, and run
 * CI/CD pipelines", docs.gitlab.com/user/permissions): write access, as
 * claude-code-action runs only for "users with write access to the
 * repository" (its docs/security.md). A Guest, Planner, Reporter or
 * Security Manager ("without code push access"), and anyone who is no
 * member, is someone GitLab does not vouch for.
 */
import { Effect, Schema } from "effect";
import type { ExternalActor, OutsideActor, SourceEvent } from "../provider";
import type { ProviderFailure } from "../read-stop";
import { type GitLabClient, gitlabAsk, isNotFound } from "./client";

/** Someone as GitLab's REST answers and its webhooks name them. */
export const GitLabUserSchema = Schema.Struct({
  avatar_url: Schema.optional(Schema.NullOr(Schema.String)),
  bot: Schema.optional(Schema.NullOr(Schema.Boolean)),
  id: Schema.Number,
  name: Schema.optional(Schema.NullOr(Schema.String)),
  username: Schema.String,
  web_url: Schema.optional(Schema.NullOr(Schema.String)),
});
export type GitLabUser = (typeof GitLabUserSchema)["Type"];

/** Someone GitLab names, as an external item carries them, by the host their page is on. */
export const gitlabActorOf = (
  user: GitLabUser | null | undefined,
  host: string
): ExternalActor | null =>
  user
    ? {
        source: "gitlab",
        login: user.username,
        name: user.name ?? null,
        avatarUrl: user.avatar_url ?? null,
        url: user.web_url ?? `https://${host}/${user.username}`,
        kind: user.bot ? "bot" : "person",
        memberId: null,
      }
    : null;

/** GitLab's roles by access level, as @gitbeaker/core's `AccessLevel` names them. */
const ROLES: Readonly<Record<number, string>> = {
  0: "No access",
  5: "Minimal access",
  10: "Guest",
  15: "Planner",
  20: "Reporter",
  25: "Security Manager",
  30: "Developer",
  40: "Maintainer",
  50: "Owner",
};

/** The least access level GitLab vouches for: Developer. */
const VOUCHED_LEVEL = 30;

/** Who someone is to the project, in words, when GitLab does not vouch for them; null when it does. */
const unvouchedOf = (login: string, level: number | null): string | null => {
  if (level !== null && level >= VOUCHED_LEVEL) {
    return null;
  }
  const role =
    level === null ? "not a member" : (ROLES[level] ?? `level ${level}`);
  return `${login}, no write access (${role})`;
};

const MemberSchema = Schema.Struct({ access_level: Schema.Number });

/** The events that carry their author's own words: whose standing is read. */
const THEIR_WORDS: ReadonlySet<string> = new Set([
  "issue.opened",
  "pr.opened",
  "comment.created",
]);

/**
 * The events with each author of words GitLab names stood beside their
 * standing on project `path`, read once per author: what the outsider rule
 * reads (hub outsiders.ts). A read GitLab refuses is the failure, so
 * nothing is stored without its author's standing.
 */
export const vouchedEvents = (
  client: GitLabClient,
  path: string,
  events: readonly SourceEvent[],
  ids: ReadonlyMap<string, number>,
  requestMs: number
): Effect.Effect<SourceEvent[], ProviderFailure> =>
  Effect.gen(function* () {
    const levels = new Map<number, number | null>();
    const out: SourceEvent[] = [];
    for (const event of events) {
      const login = event.actor?.login;
      const id = login === undefined ? undefined : ids.get(login);
      if (!(event.actor && THEIR_WORDS.has(event.kind) && id !== undefined)) {
        out.push(event);
        continue;
      }
      if (!levels.has(id)) {
        const level: number | null = yield* gitlabAsk(
          requestMs,
          `read ${login}'s role`,
          path,
          () =>
            client.api.ProjectMembers.show(path, id, {
              includeInherited: true,
            }).then(
              (member) =>
                Schema.decodeUnknownSync(MemberSchema)(member).access_level,
              (error: unknown) => {
                if (isNotFound(error)) {
                  return null;
                }
                throw error;
              }
            )
        );
        levels.set(id, level);
      }
      const actor: OutsideActor = {
        ...event.actor,
        unvouched: unvouchedOf(event.actor.login, levels.get(id) ?? null),
      };
      out.push({ ...event, actor });
    }
    return out;
  });
