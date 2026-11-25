/**
 * A session's `forge_post`: an issue, a pull or merge request, or a comment
 * on GitHub, GitLab or Gitea, made on the session's machine through that
 * forge's adapter with the machine's own sign-in there (agent
 * forges/forge.ts, docs/forge-adapters.md).
 */

import { ForgeAskSchema } from "./stored-shapes";

/** The forges CawCo posts to through an adapter. */
const FORGES = ["github", "gitlab", "gitea"] as const;
export type Forge = (typeof FORGES)[number];

/** Each forge as a person names it. */
export const FORGE_NAMES: Readonly<Record<Forge, string>> = {
  github: "GitHub",
  gitlab: "GitLab",
  gitea: "Gitea",
};

/**
 * One write to a repository on a forge: an issue, a pull or merge request
 * from `head` into `base`, a comment on an issue's or a pull request's
 * `number` (GitLab numbers its issues and merge requests apart), or an
 * issue once: a comment on the open issue whose body holds `marker`, or a
 * new issue when none does (the hub's usability feedback,
 * usability-feedback.ts).
 */
export type ForgeWrite =
  | { readonly body: string; readonly op: "issue"; readonly title: string }
  | {
      readonly body: string;
      /** Text the issue's body carries, which a repeat is found by. */
      readonly marker: string;
      readonly op: "issue_once";
      /** What the forge's issue search finds the issue by: a word of `marker`. */
      readonly search: string;
      readonly title: string;
    }
  | {
      readonly base: string;
      readonly body: string;
      readonly head: string;
      readonly op: "pull_request";
      readonly title: string;
    }
  | {
      readonly body: string;
      readonly number: number;
      readonly on: "issue" | "pull_request";
      readonly op: "comment";
    };

/**
 * The machine control a session's `forge_post` reaches (agent forges/forge.ts
 * `forgePost`): args `[ForgeAsk]`; answers what the write came to there.
 */
export const CONTROL_FORGE_POST = "forgePost";

/** A session's forge write as the hub sends it: the repository by URL or `host/path`, and the write. */
export interface ForgeAsk {
  readonly repo: string;
  readonly write: ForgeWrite;
}

/** A forge ask read off the wire; undefined when it is none. */
export const readForgeAsk = (value: unknown): ForgeAsk | undefined => {
  const read = ForgeAskSchema.safeParse(value);
  if (!read.success) {
    return undefined;
  }
  const { write } = read.data;
  // A comment names its issue or pull request by its whole number.
  return write.op === "comment" && !Number.isInteger(write.number)
    ? undefined
    : read.data;
};

/**
 * What a session's forge write came to on the machine: made (or the
 * making failed, in its words), or refused before it reached a forge (no
 * repository named, no sign-in there).
 */
export type ForgeVerdict =
  | { readonly kind: "made"; readonly made: PostMade }
  | { readonly kind: "refused"; readonly why: string };

/** What making a post said: whether it went, and what the forge answered; its page when it made or found one. */
interface PostMade {
  /**
   * A pull or merge request that was open already for the same branches, or
   * an `issue_once` that found its open issue and commented there.
   */
  readonly existing?: boolean;
  readonly ok: boolean;
  readonly said: string;
  readonly url?: string;
}
