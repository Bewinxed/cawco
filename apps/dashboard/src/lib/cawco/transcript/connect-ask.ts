/**
 * A connect ask: an agent asks the person to sign the hub in to a service
 * (an MCP URL-mode elicitation, modelcontextprotocol.io/specification/
 * 2025-11-25/client/elicitation), so its running session gets the service's
 * tools. The person reads which agent asks and why, sees the whole sign-in
 * address before anything opens, signs in on the provider's page, and the
 * hub keeps the key.
 *
 * Drawn only by its states files (ConnectAsk, ConnectCard, ConnectStrip
 * .stories.ts) until the hub raises one: nothing in the app makes a
 * `ConnectAsk`, so no live surface reaches these branches yet. The words
 * here are the drawing's proposal; the one picked moves into core's
 * `askWords` with the build.
 *
 * What the session hears, every option alike: Not now sends `decline`
 * with the Other line's words; putting the ask away (minimizing, the
 * strip's ✕ before it opens) sends nothing; a session that ends with the
 * ask open sends `cancel`.
 */

import { commonWords } from "@cawco/core";

/** Where an ask stands while it is open. */
export type ConnectStage =
  /** Asked: the address shown, nothing opened yet. */
  | "asking"
  /** Connect pressed: the provider's page is open in a tab of its own. */
  | "waiting"
  /** The sign-in did not come back (its tab closed, or the hub refused the start). */
  | "failed";

export interface ConnectAsk {
  /** A sign-in that ran out on the service's side: the card asks again. */
  again?: boolean;
  /** What went wrong, said, and word for word under Show details. */
  fault?: { said: string; details: string };
  /** What it may do there, in plain words, when the hub knows the scopes. */
  scopes?: string[];
  /** The service, as Configure › Connections names it. */
  service: string;
  stage: ConnectStage;
  /** The sign-in address, whole: shown before consent, opened only on Connect. */
  url: string;
  /** The agent's why: the elicitation's `message`, in its own words. */
  why: string;
}

/** How an ask settled, as the transcript keeps it. */
export type ConnectOutcome =
  | { kind: "connected"; service: string; account: string | null }
  | { kind: "declined"; service: string; words: string }
  | { kind: "expired"; service: string; account: string | null };

/** A sign-in address: its scheme, its host, and the rest. */
const ADDRESS = /^(https?:\/\/)([^/?#]+)(.*)$/i;

/** The address split for reading: its host in strong ink, the rest muted. */
export function addressParts(url: string): {
  head: string;
  host: string;
  rest: string;
} {
  const at = ADDRESS.exec(url);
  return at
    ? { head: at[1], host: at[2], rest: at[3] }
    : { head: "", host: url, rest: "" };
}

/** The address's host alone: what a strip or a row has room for. */
export const hostOf = (url: string): string => addressParts(url).host;

/** The yes of an ask: Try again once it failed, Reconnect once it lapsed, else Connect. */
export function connectYes(failed: boolean, again: boolean): string {
  if (failed) {
    return commonWords.tryAgain;
  }
  return again ? connectWords.reconnect : connectWords.connect;
}

export const connectWords = {
  /** The card's title, as a screen reader names it. */
  askFrom: (who: string) => `Connect ask from ${who}`,
  /** The line the ask is made on. */
  lede: (service: string) => `Sign in to ${service}`,
  ledeAgain: (service: string) => `${service} signed CawCo out`,
  /** What pressing Connect does, before it is pressed. */
  detail: (service: string, who: string) =>
    `${service}'s page opens in a new tab. The hub keeps the key, and ${who} never sees it.`,
  connect: "Connect",
  connecting: "Waiting for sign-in…",
  reconnect: "Reconnect",
  notNow: "Not now",
  decliningNow: "Declining…",
  /** The wait, and the way back to the page. */
  waiting: (service: string) =>
    `${service}'s sign-in is open in a new tab; this turns connected when you finish there.`,
  openSignIn: "Open sign-in",
  /** The failure, in the error formula. */
  failedTitle: (service: string) => `${service}'s sign-in didn't finish`,
  failedNext: (who: string) =>
    `Nothing was connected, and ${who} is still waiting. Try again to open the sign-in.`,
  /** The record the transcript keeps. */
  connectedAs: (service: string, account: string) =>
    `Connected to ${service} as ${account}`,
  connected: (service: string) => `Connected to ${service}`,
  declined: (service: string) => `${service} not connected`,
  signedOut: "signed out",
  manage: "Manage",
  /** The parked ask's bar, and how a screen reader names it. */
  bar: (who: string, service: string) => `${who} asks to connect ${service}`,
  showAsk: (who: string, service: string) =>
    `Show the connect ask from ${who}: ${service}`,
  minimize: "Minimize connect ask",
  /** Option B's consent step. */
  continueTo: (host: string) => `Continue to ${host}`,
  back: "Back",
  /** Option C's strip. */
  needs: (who: string, service: string) => `${who} needs ${service}`,
};
