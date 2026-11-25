/**
 * Someone GitHub names, as an outside item carries them, and whether GitHub
 * vouches for them on the repository.
 */
import { type InferOutput, nullish, object, string } from "valibot";
import type { ExternalActor, OutsideActor } from "../provider";

/**
 * The standings GitHub gives a person the repository let in: "Author is the
 * owner of the repository", "a member of the organization that owns the
 * repository", "has been invited to collaborate on the repository"
 * (docs.github.com, CommentAuthorAssociation). Anyone else's issue waits
 * for a person, as claude-code-action runs only for "users with write
 * access to the repository" (its docs/security.md).
 */
const VOUCHED: ReadonlySet<string> = new Set([
  "OWNER",
  "MEMBER",
  "COLLABORATOR",
]);

/** Someone as GitHub's REST answers name them. */
export const RawUserSchema = object({
  avatar_url: nullish(string()),
  html_url: nullish(string()),
  login: nullish(string()),
  type: nullish(string()),
});
export type RawUser = InferOutput<typeof RawUserSchema>;

/** Someone GitHub names, as an external item carries them; null when it names no one. */
export const githubActorOf = (
  user: RawUser | null | undefined
): ExternalActor | null =>
  user?.login
    ? {
        source: "github",
        login: user.login,
        name: null,
        avatarUrl: user.avatar_url ?? null,
        url: user.html_url ?? null,
        kind: user.type === "Bot" ? "bot" : "person",
        memberId: null,
      }
    : null;

/** Who someone is to the repository, in words, when GitHub does not vouch for them; null when it does. */
export const unvouchedOf = (name: string, standing = "NONE"): string | null =>
  VOUCHED.has(standing)
    ? null
    : `${name}, no owner, member or collaborator of the repository (GitHub says “${standing}”)`;

/** Someone GitHub names with their standing on the repository; null when it names no one. A standing GitHub leaves out says nothing of them. */
export const outsideActorOf = (
  user: RawUser | null | undefined,
  standing: string | null | undefined
): OutsideActor | null => {
  const actor = githubActorOf(user);
  return actor
    ? {
        ...actor,
        unvouched: standing ? unvouchedOf(actor.login, standing) : null,
      }
    : null;
};
