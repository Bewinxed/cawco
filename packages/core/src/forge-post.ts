/**
 * A session's `forge_post`: an issue, a pull or merge request, or a comment
 * on GitHub, GitLab or Gitea, made on the session's machine through that
 * forge's adapter with the machine's own sign-in there (agent
 * forges/forge.ts, docs/forge-adapters.md).
 */

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
 * from `head` into `base`, or a comment on an issue's or a pull request's
 * `number` (GitLab numbers its issues and merge requests apart).
 */
export type ForgeWrite =
  | { readonly body: string; readonly op: "issue"; readonly title: string }
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
  const ask = value as { repo?: unknown; write?: unknown } | null;
  return ask &&
    typeof ask === "object" &&
    typeof ask.repo === "string" &&
    isForgeWrite(ask.write)
    ? { repo: ask.repo, write: ask.write }
    : undefined;
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
  /** A pull or merge request that was open already for the same branches. */
  readonly existing?: boolean;
  readonly ok: boolean;
  readonly said: string;
  readonly url?: string;
}

/** Whether a value read off the wire is a forge write the adapters make. */
const isForgeWrite = (value: unknown): value is ForgeWrite => {
  const write = value as Record<string, unknown> | null;
  if (!write || typeof write !== "object") {
    return false;
  }
  switch (write.op) {
    case "issue":
      return typeof write.title === "string" && typeof write.body === "string";
    case "pull_request":
      return (
        typeof write.title === "string" &&
        typeof write.body === "string" &&
        typeof write.base === "string" &&
        typeof write.head === "string"
      );
    case "comment":
      return (
        typeof write.body === "string" &&
        Number.isInteger(write.number) &&
        (write.on === "issue" || write.on === "pull_request")
      );
    default:
      return false;
  }
};
