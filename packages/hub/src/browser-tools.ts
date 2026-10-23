/**
 * `browser_ask` (Projects spec §5.11, "A browser ask"): a session asks the
 * person to take over its project's browser for a step only they may do.
 * The ask parks as the session's `permission_request` for
 * {@link BROWSER_ASK_TOOL}, carrying the browser, the reason and the origin
 * ({@link BrowserAskFrame}), so it lands in Needs you, the transcript and
 * the phone as every ask does, and the call waits.
 *
 * Take over (browsers.ts `/takeover`, or an Approve from an app with no Take
 * over yet) takes the ask off every screen as answered and the call waits
 * on, through the private period, until the person hands back: it answers
 * `{ outcome: "handed_back", origin }` and nothing else of the page. Decline
 * answers `{ outcome: "declined", words }` with the person's words. A
 * session has one browser ask open at a time; one whose session ends before
 * the person took it is withdrawn, and the call refused. A waiting call ends
 * with the hub that held it, so the ask is not kept across a restart.
 */
import type { Envelope, InstanceRow, PermissionResult } from "@cawco/core";
import { BROWSER_ASK_TOOL, type BrowserAskFrame } from "@cawco/core";
import type { BrowserKey } from "@cawco/core/browser";
import { z } from "zod";
import { tool } from "./mcp-tool";

/** The session tools browsers give, by name: what a call is routed by (delegation-mcp.ts). */
export const BROWSER_TOOLS: ReadonlySet<string> = new Set(["browser_ask"]);

/** What a browser ask answers its call with. */
export type BrowserAskAnswer =
  | { outcome: "handed_back"; origin: string | null }
  | { outcome: "declined"; words: string };

/** What the person did with the browser, in words: what the asking agent reads. */
export const browserAnsweredWords = (answer: BrowserAskAnswer): string =>
  answer.outcome === "declined"
    ? `They declined: ${answer.words}`
    : `They handed the browser back${answer.origin ? `, on ${answer.origin}` : "; it did not say which origin it was on"}. Go on in your browser tool.`;

/** The longest reason the person reads. */
const REASON_MAX = 300;

/** Whether `value` is an origin alone: a scheme, a host and perhaps a port, no path, query or fragment. */
const isOrigin = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      url.origin === value
    );
  } catch {
    return false;
  }
};

const DESCRIPTION =
  "Ask the person to take over your browser for what only they may do: a sign-in, a one-time code, a CAPTCHA, a payment, a consent. " +
  "Call it with that page open; it waits for them, and nothing they type or see reaches you.";

/** How browser asks reach the rest of the hub. */
export interface BrowserAsksDeps {
  /**
   * The browser the session uses and its artifact in the session's panel
   * (browsers.ts): its project's on its machine, else its machine's. Throws
   * the sentence when the session has no browser to ask about.
   */
  readonly browserFor: (actor: InstanceRow) => {
    artifactId: string;
    key: BrowserKey;
    machineId: string;
  };
  /** Parks the ask for the person: the pending ledger, every screen, push. */
  readonly park: (envelope: Envelope) => void;
  /** Takes an answered ask off the pending ledger. */
  readonly settle: (requestId: string) => void;
}

interface Waiter {
  ask: BrowserAskFrame;
  instanceId: string;
  reject: (error: Error) => void;
  resolve: (answer: BrowserAskAnswer) => void;
  /** The person took it: it is off every screen, and waits for the hand-back. */
  taken: boolean;
}

export const createBrowserAsks = (deps: BrowserAsksDeps) => {
  /** Calls waiting on the person, by the ask's request id. */
  const waiting = new Map<string, Waiter>();

  const openOf = (instanceId: string): string | undefined =>
    [...waiting].find(([, waiter]) => waiter.instanceId === instanceId)?.[0];

  const asks = {
    /** Parks `actor`'s browser ask and waits for the person's answer. */
    async ask(
      actor: InstanceRow,
      input: { origin: string; reason: string },
      toolUseId?: string
    ): Promise<BrowserAskAnswer> {
      const open = openOf(actor.id);
      if (open) {
        throw new Error(
          `This session already has a browser ask open (${open}); its answer comes back to that call.`
        );
      }
      const { key, machineId, artifactId } = deps.browserFor(actor);
      const requestId = crypto.randomUUID();
      const ask: BrowserAskFrame = {
        artifactId,
        key,
        machineId,
        origin: input.origin,
        reason: input.reason,
      };
      const answered = new Promise<BrowserAskAnswer>((resolve, reject) => {
        waiting.set(requestId, {
          ask,
          instanceId: actor.id,
          resolve,
          reject,
          taken: false,
        });
      });
      deps.park({
        verb: "frames",
        machineId: actor.machineId,
        instanceId: actor.id,
        requestId,
        payload: {
          kind: "permission_request",
          instanceId: actor.id,
          requestId,
          harness: actor.harness,
          requestKind: "tool",
          toolName: BROWSER_ASK_TOOL,
          input,
          browserAsk: ask,
          ...(toolUseId ? { toolUseId } : {}),
        },
      });
      console.log(
        `[browser] ${actor.id} asks the person to take over ${key} on ${input.origin} (${requestId})`
      );
      return await answered;
    },

    /** The open ask `requestId`, while its call waits (taken or not). */
    get(
      requestId: string
    ): (BrowserAskFrame & { instanceId: string }) | undefined {
      const waiter = waiting.get(requestId);
      return waiter && { ...waiter.ask, instanceId: waiter.instanceId };
    },

    /** Whether `requestId` is a browser ask the person has not taken yet: {@link answer}'s to settle. */
    owns(requestId: string): boolean {
      const waiter = waiting.get(requestId);
      return !!waiter && !waiter.taken;
    },

    /**
     * The person's answer from an ask card (`answerPendingPermission`), for
     * an ask {@link owns} holds: a Decline answers the call with their
     * words. An Approve is refused: the person answers a browser ask by
     * taking over (`POST /api/browsers/:key/takeover`), never by approving it.
     */
    answer(requestId: string, result: PermissionResult): Promise<void> {
      const waiter = waiting.get(requestId);
      if (!waiter || waiter.taken) {
        return Promise.reject(new Error("That request is no longer pending."));
      }
      if (result.behavior === "allow") {
        return Promise.reject(
          new Error(
            "A browser ask is answered by taking over the browser, not by approving it. Press Take over on its card, or Decline."
          )
        );
      }
      waiting.delete(requestId);
      deps.settle(requestId);
      waiter.resolve({ outcome: "declined", words: result.message.trim() });
      return Promise.resolve();
    },

    /** The person took ask `requestId`: off every screen, its call waiting for the hand-back. */
    taken(requestId: string): boolean {
      const waiter = waiting.get(requestId);
      if (!waiter) {
        return false;
      }
      if (!waiter.taken) {
        waiter.taken = true;
        deps.settle(requestId);
      }
      return true;
    },

    /**
     * The browser of `key` on `machineId` was handed back: every call waiting
     * on it answers with the page's origin alone. With `requestId`, that ask's
     * call whatever browser it named.
     */
    handedBack(
      machineId: string,
      key: BrowserKey,
      origin: string | null,
      requestId?: string
    ): void {
      for (const [id, waiter] of waiting) {
        const its =
          id === requestId ||
          (waiter.taken &&
            waiter.ask.key === key &&
            waiter.ask.machineId === machineId);
        if (its) {
          waiting.delete(id);
          if (!waiter.taken) {
            deps.settle(id);
          }
          waiter.resolve({ outcome: "handed_back", origin });
        }
      }
    },

    /** An ask left the ledger unanswered (its session ended) before the person took it: the call is refused. */
    withdrawn(requestId: string): void {
      const waiter = waiting.get(requestId);
      if (!waiter || waiter.taken) {
        return;
      }
      waiting.delete(requestId);
      waiter.reject(
        new Error(
          "The browser ask was withdrawn before the person took it; nobody took over the browser."
        )
      );
    },

    /** `browser_ask`, bound to the calling session (none for a listing). */
    tools(actor: InstanceRow | undefined, toolUseId?: string) {
      return [
        tool(
          "browser_ask",
          DESCRIPTION,
          {
            reason: z
              .string()
              .trim()
              .min(1)
              .max(REASON_MAX)
              .describe(
                'One sentence they read: what to do and why, e.g. "Sign in to GitHub to open the release page."'
              ),
            origin: z
              .string()
              .trim()
              .refine(isOrigin, {
                message:
                  "origin is the page's origin alone, scheme and host (and port): https://github.com, never a path or query.",
              })
              .describe("The page's origin, e.g. https://github.com."),
          },
          async (input) => {
            if (!actor) {
              throw new Error("Discovery cannot execute tools");
            }
            return await asks.ask(actor, input, toolUseId);
          },
          browserAnsweredWords
        ),
      ];
    },
  };
  return asks;
};

export type BrowserAsks = ReturnType<typeof createBrowserAsks>;
