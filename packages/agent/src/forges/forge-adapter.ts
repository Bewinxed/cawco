/**
 * The contract every forge adapter meets (docs/forge-adapters.md): the host's
 * sign-in, the writes a client makes, and the adapter that finds one and
 * makes the other. forge.ts holds the registry of adapters; each adapter
 * reads this file, so imports run one way.
 */
import type { Forge, ForgeWrite } from "@cawco/core/forge-post";

/** The host's own sign-in on a forge's host, as that forge's CLI keeps it. */
export interface ForgeSignIn {
  /** Where the forge's API answers: `https://api.github.com`, `https://gitlab.example.com`. */
  readonly api: string;
  /** Where it came from, in words: "gh's sign-in", "glab's config". */
  readonly from: string;
  readonly host: string;
  /** A unix socket the API is reached through, as the CLI's config names one (gh's `http_unix_socket`). */
  readonly socket?: string;
  readonly token: string;
}

/** What a forge made, or found already open. */
export interface ForgeMade {
  /** A pull or merge request that was open already for the same branches. */
  readonly existing?: boolean;
  readonly url: string;
}

/** One repository on one forge, signed in: the writes every forge has. */
export interface ForgeClient {
  /** The login it posts as. */
  readonly account: () => Promise<string>;
  readonly comment: (
    write: Extract<ForgeWrite, { op: "comment" }>
  ) => Promise<ForgeMade>;
  readonly issue: (
    write: Extract<ForgeWrite, { op: "issue" }>
  ) => Promise<ForgeMade>;
  /** The open pull or merge request from `head` into `base`, or a new one. */
  readonly pullRequest: (
    write: Extract<ForgeWrite, { op: "pull_request" }>
  ) => Promise<ForgeMade>;
}

/** One forge: where its CLI keeps the host's sign-in, and a client for one repository. */
export interface ForgeAdapter {
  /** A client for the repository at `path` (`owner/repo`, `group/sub/project`) on the sign-in's host. */
  readonly client: (signIn: ForgeSignIn, path: string) => ForgeClient;
  readonly forge: Forge;
  /** The host's sign-in for `host`, or why it holds none it can use; undefined when this forge's CLI keeps nothing for it. */
  readonly signIn: (host: string) => Promise<ForgeSignIn | string | undefined>;
}
