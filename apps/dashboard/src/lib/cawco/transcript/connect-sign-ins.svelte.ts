/**
 * Where each connect ask's sign-in stands on this device, by the ask's
 * request id: asked, waiting on the provider's tab, landed, or failed and
 * why. Kept here, not in its card, because the card goes while it waits:
 * minimized to its bar (whose words read the wait), or folding as the hub
 * answers. The sign-in itself is the hub's (fleet.ts `signInToMcp`): this
 * opens its tab and watches it, and the hub's own word that it landed
 * settles the ask.
 */
import type { ConnectAccess } from "@cawco/core";
import { askWords } from "@cawco/core/words/asks";
import { SvelteMap } from "svelte/reactivity";
import { signInToMcp } from "../fleet";
import { failureWords } from "../hub-read";

export type ConnectStage =
  /** Asked: the address shown, nothing opened yet. */
  | "asking"
  /** Connect pressed: the provider's page is open in a tab of its own. */
  | "waiting"
  /** The hub signed in: a beat in the card before it folds. */
  | "done"
  /** The sign-in did not come back. */
  | "failed";

/** Why a sign-in did not come back. */
export type ConnectFault =
  /** Its tab closed before the hub heard back. */
  | { kind: "closed" }
  /** The hub refused to start it, in its own words. */
  | { kind: "refused"; reason: string }
  /** The provider's page stopped taking its answer while it waited. */
  | { kind: "expired" };

export interface ConnectSignIn {
  fault: ConnectFault | null;
  stage: ConnectStage;
}

const ASKING: ConnectSignIn = { stage: "asking", fault: null };

/**
 * After the tab closes, how long the hub's word is waited for: the hand-back
 * page closes its own tab as the hub answers (routes/oauth/mcp), and the
 * socket's word can follow the close.
 */
const CLOSE_GRACE_MS = 2000;
/** How often an open tab is looked at. */
const TAB_POLL_MS = 500;

const signIns = new SvelteMap<string, ConnectSignIn>();
/** Each waiting sign-in's watch on its tab and its page's expiry, stopped once it is over. */
const watches = new Map<string, () => void>();

const stop = (requestId: string): void => {
  watches.get(requestId)?.();
  watches.delete(requestId);
};

const waiting = (requestId: string): boolean =>
  signIns.get(requestId)?.stage === "waiting";

/**
 * What a sign-in that did not come back says, over Connect: the reason line,
 * and what the hub said, word for word, under Show details.
 */
export function faultWords(
  fault: ConnectFault,
  server: string
): { details: string | null; reason: string } {
  switch (fault.kind) {
    case "closed":
      return { reason: askWords.connectTabClosed(server), details: null };
    case "refused":
      return { reason: askWords.connectRefused(server), details: fault.reason };
    case "expired":
      return { reason: askWords.connectPageExpired(server), details: null };
    default: {
      const unhandled: never = fault;
      throw new Error(`unhandled fault: ${JSON.stringify(unhandled)}`);
    }
  }
}

export const connectSignIns = {
  /** Where ask `requestId`'s sign-in stands. */
  of(requestId: string): ConnectSignIn {
    return signIns.get(requestId) ?? ASKING;
  },

  /**
   * Connect: the hub's sign-in to `server` with `access`, in a tab of its
   * own, opened in the press itself (a pop-up blocker lets it through). It
   * waits on the hub's word; a tab closed first, a start the hub refused
   * and a provider's page that ran out each fail it, Connect free again.
   */
  async connect(
    requestId: string,
    server: string,
    access: ConnectAccess | null
  ): Promise<void> {
    stop(requestId);
    signIns.set(requestId, { stage: "waiting", fault: null });
    let opened: Awaited<ReturnType<typeof signInToMcp>>;
    try {
      opened = await signInToMcp(server, access ?? undefined);
    } catch (error) {
      if (waiting(requestId)) {
        signIns.set(requestId, {
          stage: "failed",
          fault: { kind: "refused", reason: failureWords(error) },
        });
      }
      return;
    }
    const fail = (fault: ConnectFault) => {
      if (waiting(requestId)) {
        stop(requestId);
        signIns.set(requestId, { stage: "failed", fault });
      }
    };
    let grace: ReturnType<typeof setTimeout> | undefined;
    const poll = setInterval(() => {
      if (!opened.tab.closed || grace !== undefined) {
        return;
      }
      grace = setTimeout(() => fail({ kind: "closed" }), CLOSE_GRACE_MS);
    }, TAB_POLL_MS);
    const expiry = setTimeout(
      () => fail({ kind: "expired" }),
      Math.max(0, opened.expiresAt - Date.now())
    );
    watches.set(requestId, () => {
      clearInterval(poll);
      clearTimeout(grace);
      clearTimeout(expiry);
    });
  },

  /**
   * The hub signed in while this ask waited on it (its server reads signed
   * in): it is done, and its card holds a beat before it folds.
   */
  landed(requestId: string): void {
    if (!waiting(requestId)) {
      return;
    }
    stop(requestId);
    signIns.set(requestId, { stage: "done", fault: null });
  },

  /** Not now: the wait, if any, is over. */
  declined(requestId: string): void {
    stop(requestId);
    signIns.delete(requestId);
  },

  /** The ask is gone from every screen here: what was kept of it goes. */
  forget(requestId: string): void {
    stop(requestId);
    signIns.delete(requestId);
  },
};
