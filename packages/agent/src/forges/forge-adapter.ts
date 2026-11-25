/**
 * A forge's sign-in on this machine (docs/forge-adapters.md): where its CLI
 * keeps the host's sign-in. The client a write is made with is the forge's
 * provider's, made from that sign-in (forge.ts `clientWrites`). forge.ts
 * holds the registry of logins; each login reads this file, so imports run
 * one way.
 */
import type { Forge } from "@cawco/core/forge-post";

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

/** One forge's CLI on this machine: the host's sign-in it keeps. */
export interface ForgeLogin {
  readonly forge: Forge;
  /** The host's sign-in for `host`, or why it holds none it can use; undefined when this forge's CLI keeps nothing for it. */
  readonly signIn: (host: string) => Promise<ForgeSignIn | string | undefined>;
}
