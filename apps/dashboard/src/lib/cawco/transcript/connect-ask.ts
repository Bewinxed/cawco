/**
 * A connect ask: an agent asks the person to sign the hub in to a service
 * (an MCP URL-mode elicitation, modelcontextprotocol.io/specification/
 * 2025-11-25/client/elicitation), so its running session gets the service's
 * tools. The person reads which agent asks and why, sees the whole sign-in
 * address before anything opens, signs in on the provider's page, and the
 * hub keeps the credential.
 *
 * Drawn only by its states files until the hub raises one, three ways:
 * A, the gate in the composer's grown shape with the access as a choice
 * (ConnectAskGate.stories.ts); B, a pick among the accounts the hub keeps
 * (ConnectAskPick.stories.ts); C, a card in the transcript that becomes
 * its record where it stands (ConnectAskCard.stories.ts). Nothing in the
 * app makes a `ConnectAsk`, so no live surface reaches these branches yet.
 * The words are the design advisor's; the one picked moves into core's
 * `askWords` with the build.
 */

/** Where an ask stands while it is open. */
export type ConnectStage =
  /** Asked: the address shown, nothing opened yet. */
  | "asking"
  /** Connect pressed: the provider's page is open in a tab of its own. */
  | "waiting"
  /** The hub said signed in: a beat in the card before it folds. */
  | "done"
  /** The sign-in did not come back. */
  | "failed";

/** Why a sign-in did not come back. */
export type ConnectFault =
  /** Its tab closed before the hub heard back (McpSignIn's `signInClosed`). */
  | { kind: "closed" }
  /** The hub refused to start it, in its own words (`failureWords`). */
  | { kind: "refused"; reason: string }
  /** The provider's authorization page ran out while it waited. */
  | { kind: "expired" };

/** An account the hub keeps for a service (option B). */
export interface ConnectAccount {
  /** As the provider names it. */
  email: string;
  /** Kept credential lapsed: picking it signs in again. */
  expired?: boolean;
  /** What it already holds there, in the provider's words. */
  scopes: string;
  /** His own, or the project's, which its delegates all use. */
  whose: "yours" | "project";
}

export interface ConnectAsk {
  /** Option B: the accounts the hub keeps for the service, in its order. */
  accounts?: ConnectAccount[];
  /** A sign-in that lapsed: the agent asks again, its choice held. */
  again?: boolean;
  /** As whom the hub signed in: the done beat's words. */
  as?: string;
  fault?: ConnectFault;
  /** Option B: the account pressed, or `ADD` for a new one. */
  picked?: string;
  /** Whose page the sign-in is on ("Google" for Google Drive). */
  provider: string;
  /** Option A: the access picked, of `scopes`. */
  scope?: string;
  /**
   * Option A: the access the connector offers. Two or more are a choice;
   * one is a line in code type where the choice would be.
   */
  scopes?: string[];
  /** The MCP server the record links to, as the MCP page names it. */
  server: string;
  /** The service, as Configure › MCP names it. */
  service: string;
  stage: ConnectStage;
  /** The sign-in address, whole: shown before consent, opened only on Connect. */
  url: string;
  /** The agent's why: the elicitation's `message`, in its own words. */
  why: string;
}

/** Option B's pick that adds an account instead of using a kept one. */
export const ADD = "\u0000add";

/** How an ask settled, as the transcript keeps it. */
export type ConnectOutcome =
  | {
      kind: "connected";
      service: string;
      server: string;
      /** As whom, when the provider said. */
      as: string | null;
      /** The access granted, when it was a choice. */
      scope?: string;
      /** Option B: a kept account used, and whose it is. */
      used?: "yours" | "project";
    }
  | { kind: "declined"; service: string; server: string; words: string }
  | {
      kind: "expired";
      service: string;
      server: string;
      /** Option B: the account whose sign-in lapsed. */
      as?: string;
    };

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

/** Where a sign-in path may break: after one of these, never inside a run. */
const BREAK_AFTER = /(?<=[./&=?])/;
/** A last run shorter than this joins the run before it, so no line holds a few characters alone. */
const TAIL_MIN = 12;

/**
 * An address's path and query as the runs it breaks between: each run ends
 * after a dot, a slash, `&`, `=` or `?`, and a short last run (`k2Jx9` of
 * `state=k2Jx9`) is held to the runs before it until it is no orphan.
 */
export function addressRuns(rest: string): string[] {
  const runs = rest.split(BREAK_AFTER).filter((run) => run !== "");
  while (runs.length > 1 && (runs.at(-1)?.length ?? 0) < TAIL_MIN) {
    const tail = runs.pop() ?? "";
    runs[runs.length - 1] += tail;
  }
  return runs;
}

/** What a sign-in that did not come back says, over Connect. */
export function faultWords(fault: ConnectFault, provider: string): string {
  switch (fault.kind) {
    case "closed":
      return `The ${provider} tab closed before it finished.`;
    case "refused":
      return `Couldn't start the ${provider} sign-in. ${fault.reason}`;
    case "expired":
      return `${provider}'s sign-in page expired before it finished.`;
  }
}

export const connectWords = {
  /** The card's title, as a screen reader names it. */
  askFrom: (who: string) => `Connect ask from ${who}`,
  againFrom: (who: string) => `Reconnect ask from ${who}`,
  /** A's detail line: who keeps it, and for how long. */
  detail: (service: string) =>
    `The hub keeps the sign-in. This session gets ${service} until you disconnect it on the MCP page. No agent sees a password.`,
  /** B's detail line. */
  detailPick: (service: string) =>
    `This session reads ${service} as the account you pick, through the hub, until you disconnect it on the MCP page.`,
  /** C's span line. */
  detailCard: (service: string) =>
    `The hub keeps the sign-in. This session gets ${service} until you disconnect it on the MCP page.`,
  /** A reconnect's held access. */
  asBefore: (scope: string) => `${scope}, as before.`,
  connect: "Connect",
  reconnect: "Reconnect",
  notNow: "Not now",
  decliningNow: "Declining…",
  /** The wait, over the pair. */
  waiting: (provider: string) =>
    `Finish in the ${provider} tab. This card waits for it.`,
  signingIn: (provider: string) => `Signing in to ${provider}…`,
  /** The done beat, before the shape folds. */
  connectedAs: (who: string) => `Connected as ${who}`,
  offline: "Machine offline — can't connect yet.",
  /** B's pick. */
  useAccount: "Use this account",
  addAnAccount: "Add an account",
  addAccount: (provider: string) => `Add ${provider} account`,
  reconnectAccount: (email: string) => `Reconnect ${email}`,
  whose: { yours: "yours", project: "project" },
  expiredAccount: "expired · signs in again",
  /** C's card. */
  cardTitle: (service: string) => `Connect ${service} to Caw&Co`,
  cardTitleAgain: (service: string) => `Reconnect ${service} to Caw&Co`,
  connectService: (service: string) => `Connect ${service}`,
  reconnectService: (service: string) => `Reconnect ${service}`,
  needsYou: (n: number) => `${n} needs you`,
  /** The record the transcript keeps. */
  recordConnected: (service: string, who: string | null) =>
    who ? `Connected ${service} as ${who}` : `Connected ${service}`,
  recordUsing: (service: string, who: string, whose: "yours" | "project") =>
    `Using ${service} as ${who} (${whose})`,
  recordDeclined: (service: string) => `${service} not connected`,
  recordExpired: "sign-in expired",
  /** The parked ask's bar, and how a screen reader names it. */
  bar: (who: string, service: string) => `${who} asks to connect ${service}`,
  showAsk: (who: string, service: string) =>
    `Show the connect ask from ${who}: ${service}`,
  minimize: "Minimize connect ask",
};
