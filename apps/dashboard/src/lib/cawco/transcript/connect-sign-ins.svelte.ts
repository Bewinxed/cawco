/**
 * Where each connect ask's sign-in stands on this tab, by the ask's request
 * id: asked, waiting on the provider's tab, landed, or failed and why. The
 * sign-in is the hub's (fleet.ts `signInToMcp`): this opens its tab and
 * watches it, and the hub's own word that it landed settles the ask, which
 * turns the card (ConnectCard) into its record.
 *
 * Kept in this tab's sessionStorage (The Work Outlives Its Surface Rule): a
 * reload finds the card still waiting on the provider's page until that
 * page runs out, and a failure still said with its way on. The tab a reload
 * leaves open is no longer this one's to watch, so only its expiry is; a
 * landing still reaches the card through the hub.
 */
import type { ConnectAccess } from "@cawco/core";
import { SvelteMap, SvelteSet } from "svelte/reactivity";
import { signInToMcp } from "../fleet";
import { failureWords } from "../hub-read";
import { readJson, writeJson } from "../storage";

type ConnectStage =
  /** Asked: the address shown, nothing opened yet. */
  | "asking"
  /** Connect pressed: the provider's page is open in a tab of its own. */
  | "waiting"
  /** The hub signed in: a beat in the card before it becomes the record. */
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
  /** When a waiting sign-in's page stops taking its answer, epoch ms. */
  expiresAt?: number;
  fault: ConnectFault | null;
  stage: ConnectStage;
}

const ASKING: ConnectSignIn = { stage: "asking", fault: null };
const KEY = "cawco:connect-sign-ins";

/**
 * After the tab closes, how long the hub's word is waited for: the hand-back
 * page closes its own tab as the hub answers (routes/oauth/mcp), and the
 * socket's word can follow the close.
 */
const CLOSE_GRACE_MS = 2000;
/** How often an open tab is looked at. */
const TAB_POLL_MS = 500;

const signIns = new SvelteMap<string, ConnectSignIn>(
  Object.entries(
    readJson<Record<string, ConnectSignIn>>(KEY, {}, "session")
  ).filter(([, kept]) => kept.stage === "waiting" || kept.stage === "failed")
);
/** Each waiting sign-in's watch on its tab and its page's expiry, stopped once it is over. */
const watches = new Map<string, () => void>();

const keep = (): void => {
  writeJson(
    KEY,
    Object.fromEntries([...signIns].filter(([, one]) => one.stage !== "done")),
    "session"
  );
};

const put = (requestId: string, signIn: ConnectSignIn): void => {
  signIns.set(requestId, signIn);
  keep();
};

const stop = (requestId: string): void => {
  watches.get(requestId)?.();
  watches.delete(requestId);
};

const waiting = (requestId: string): boolean =>
  signIns.get(requestId)?.stage === "waiting";

const fail = (requestId: string, fault: ConnectFault): void => {
  if (waiting(requestId)) {
    stop(requestId);
    put(requestId, { stage: "failed", fault });
  }
};

/** Fails `requestId` with its page's expiry at `expiresAt`, unless it is over first. */
const expireAt = (requestId: string, expiresAt: number): (() => void) => {
  const expiry = setTimeout(
    () => fail(requestId, { kind: "expired" }),
    Math.max(0, expiresAt - Date.now())
  );
  return () => clearTimeout(expiry);
};

// What a reload found waiting: its page's expiry still runs.
for (const [requestId, one] of signIns) {
  if (one.stage === "waiting" && one.expiresAt !== undefined) {
    watches.set(requestId, expireAt(requestId, one.expiresAt));
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
    put(requestId, { stage: "waiting", fault: null });
    let opened: Awaited<ReturnType<typeof signInToMcp>>;
    try {
      opened = await signInToMcp(server, access ?? undefined);
    } catch (error) {
      if (waiting(requestId)) {
        put(requestId, {
          stage: "failed",
          fault: { kind: "refused", reason: failureWords(error) },
        });
      }
      return;
    }
    if (!waiting(requestId)) {
      return;
    }
    put(requestId, {
      stage: "waiting",
      fault: null,
      expiresAt: opened.expiresAt,
    });
    let grace: ReturnType<typeof setTimeout> | undefined;
    const poll = setInterval(() => {
      if (!opened.tab.closed || grace !== undefined) {
        return;
      }
      grace = setTimeout(
        () => fail(requestId, { kind: "closed" }),
        CLOSE_GRACE_MS
      );
    }, TAB_POLL_MS);
    const unexpire = expireAt(requestId, opened.expiresAt);
    watches.set(requestId, () => {
      clearInterval(poll);
      clearTimeout(grace);
      unexpire();
    });
  },

  /**
   * The hub signed in while this ask waited on it (its server reads signed
   * in): it is done, and its card holds a beat before it is the record.
   */
  landed(requestId: string): void {
    if (!waiting(requestId)) {
      return;
    }
    stop(requestId);
    put(requestId, { stage: "done", fault: null });
  },

  /** The ask is answered or gone: what was kept of it goes. */
  forget(requestId: string): void {
    stop(requestId);
    if (signIns.delete(requestId)) {
      keep();
    }
  },
};

/**
 * The conversations whose connect card the reader asked to see (the
 * "1 needs you" chip, ConnectNeedsChip): each transcript brings its card
 * into view and takes its id off.
 */
export const connectReveal = new SvelteSet<string>();
