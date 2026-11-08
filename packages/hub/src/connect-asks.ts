/**
 * `connect_ask`: a session asks the person to sign the hub in to one of the
 * fleet's MCP servers that signs in with OAuth (Configure › MCP, hub
 * fleet-mcp.ts), so its tools reach the session. The ask parks as the
 * session's `permission_request` for {@link CONNECT_ASK_TOOL}, carrying the
 * server, the reason, the provider's page and the access it signs in with
 * ({@link ConnectAskFrame}), so it stands as a card in the session's
 * transcript at the call, in Needs you and on the phone, and the call waits.
 *
 * Connect is the hub's own sign-in for that server (`POST
 * /api/fleet/mcp/:name/sign-in`, with the ask's access): the hub keeps the
 * credential, sealed, and every session with the server gets its tools.
 * The sign-in landing ({@link ConnectAsks.signedIn}) takes the card down;
 * the call is answered once the asking session has taken the sign-in
 * ({@link ConnectAsks.taking}: its machine's fleet sync wrote it, and its
 * harness redialled the server), with as whom and with what access when
 * the server's tools are in its tool list, and with its harness's words
 * when they are not. Not now answers it as declined. A server the hub is
 * signed in to already raises no card: the session is asked whether it
 * holds the server's tools, taking it again where it holds it broken
 * ({@link ConnectAsksDeps.heal}), and its answer is read the same way. So
 * "connected" is said only of a server the session holds. A session has
 * one connect ask open at a time; one whose session ends before it is
 * answered is refused with it ({@link ConnectAsks.ended}). A waiting call
 * ends with the hub that held it.
 *
 * A session whose denied tools cover every tool of the server (its
 * delegate type's, or the fleet baseline's) is refused at once, before any
 * card, in words that say which: a sign-in would bring it nothing.
 */

import { CONNECT_ASK_TOOL } from "@cawco/core/ask-tools";
import { connectAnsweredWords } from "@cawco/core/connect-ask";
import { mcpServerDeniedBy } from "@cawco/core/delegate-types";
import type {
  ConnectAccess,
  ConnectAccessSet,
  ConnectAnswer,
  ConnectAskFrame,
} from "@cawco/core/frames";
import type {
  FleetMcpChange,
  FleetMcpTaken,
  PermissionResult,
} from "@cawco/core/harness";
import type { Envelope, InstanceRow } from "@cawco/core/protocol";
import { askWords } from "@cawco/core/words/asks";
import { z } from "zod";
import type { AskFacts } from "./fleet-mcp";
import { tool } from "./mcp-tool";
import { parkedToolAsk, refuseSecondAsk } from "./parked-ask";

/** The session tools connect asks give, by name: what a call is routed by (delegation-mcp.ts). */
export const CONNECT_TOOLS: ReadonlySet<string> = new Set(["connect_ask"]);

/** The longest reason the person reads. */
const REASON_MAX = 300;

const DESCRIPTION =
  "Ask the person to sign in to one of the fleet's MCP servers that needs a sign-in, when you need its tools and they are missing or refused for want of one. " +
  "It waits for them; once they connect, its tools reach this session. No credential reaches you.";

/** What a session is denied, by where each denial comes from. */
export interface SessionDenials {
  /** The fleet baseline, which every session is denied. */
  readonly fleet: readonly string[];
  /** Its delegate type's own, when it was started as one. */
  readonly type?: { name: string; denyTools: readonly string[] };
}

/** What a session's take of fleet MCP changes came to: its harness's answer, or none in time. */
export type FleetMcpTook =
  { kind: "taken"; servers: readonly FleetMcpTaken[] } | { kind: "unanswered" };

/** How connect asks reach the rest of the hub. */
export interface ConnectAsksDeps {
  /** What `actor`'s session is denied, as its spawn resolved it. */
  readonly denials: (actor: InstanceRow) => SessionDenials;
  /** What an ask for the server says (fleet-mcp.ts `askFacts`); throws the sentence the agent reads. */
  readonly facts: (server: string) => AskFacts;
  /**
   * Asks `actor`'s session whether it holds `server`'s tools, taking the
   * server again where it holds it broken (core `CONTROL_MCP_FLEET_HEAL`,
   * named): its harness's answer, or none in time. Never rejects.
   */
  readonly heal: (actor: InstanceRow, server: string) => Promise<FleetMcpTook>;
  /** Parks the ask for the person: the pending ledger, every screen, push. */
  readonly park: (envelope: Envelope) => void;
  /** The fleet's MCP servers that sign in with OAuth and reach `actor`'s sessions, by name. */
  readonly servers: (actor: InstanceRow) => string[];
  /** Takes an answered ask off the pending ledger. */
  readonly settle: (requestId: string) => void;
}

interface Waiter {
  instanceId: string;
  reject: (error: Error) => void;
  resolve: (answer: ConnectAnswer) => void;
  server: string;
  /** The hub signed in to the server: the card is down, and the call waits for the session's take. */
  signedIn: boolean;
}

/**
 * The access an ask signs in with: a reconnect's held one; else the one the
 * agent named, when the server offers it; else the server's one, or
 * read-only of two (the least that lets an agent work, CawCo's own call);
 * null when the server names no scopes.
 */
const accessOf = (
  offers: readonly ConnectAccessSet[],
  named: ConnectAccess | undefined,
  held: ConnectAccess | null
): ConnectAccess | null => {
  if (held) {
    return held;
  }
  const offered = (access: ConnectAccess | undefined) =>
    offers.find((offer) => offer.access === access)?.access;
  return offered(named) ?? offered("read") ?? offers[0]?.access ?? null;
};

/** The server `asked` names among `servers`, matched without regard to case; throws the sentence the agent reads. */
const serverNamed = (asked: string, servers: readonly string[]): string => {
  const found = servers.find(
    (one) => one.toLowerCase() === asked.trim().toLowerCase()
  );
  if (found) {
    return found;
  }
  throw new Error(
    servers.length === 0
      ? "No MCP server of the fleet's that signs in with OAuth reaches this session. The person adds one on the MCP page first."
      : `No MCP server named ${asked} signs in with OAuth here. The ones that do: ${servers.join(", ")}.`
  );
};

/** Throws the sentence the agent reads when `denials` cover every tool of `server`. */
const refuseDenied = (server: string, denials: SessionDenials): void => {
  if (mcpServerDeniedBy(denials.fleet, server)) {
    throw new Error(askWords.connectDeniedByFleet(server));
  }
  if (denials.type && mcpServerDeniedBy(denials.type.denyTools, server)) {
    throw new Error(askWords.connectDeniedByType(server, denials.type.name));
  }
};

/**
 * A signed-in ask's call answered by its session's take: connected when the
 * server's tools are in the session's tool list, else refused in its
 * harness's words, or because its machine did not say.
 */
const answerFromTake = (
  waiter: Waiter,
  took: FleetMcpTook,
  facts: ConnectAsksDeps["facts"]
): void => {
  const { server } = waiter;
  const taken =
    took.kind === "taken"
      ? took.servers.find((one) => one.name === server)
      : undefined;
  if (!taken) {
    waiter.reject(new Error(askWords.connectTakeUnanswered(server)));
  } else if (taken.holds) {
    const now = facts(server);
    waiter.resolve({
      outcome: "connected",
      server,
      as: now.as,
      access: now.held,
    });
  } else {
    const said = `${taken.status}${taken.error ? `, ${taken.error}` : ""}`;
    waiter.reject(new Error(askWords.connectNotTaken(server, said)));
  }
};

export const createConnectAsks = (deps: ConnectAsksDeps) => {
  /** Calls waiting on the person, by the ask's request id. */
  const waiting = new Map<string, Waiter>();

  /** `requestId`'s call, if it still waits, answered from its session's take ({@link answerFromTake}). */
  const answerOne = (requestId: string, took: FleetMcpTook): void => {
    const waiter = waiting.get(requestId);
    if (waiter) {
      waiting.delete(requestId);
      answerFromTake(waiter, took, deps.facts);
    }
  };

  const asks = {
    /** Parks `actor`'s connect ask and waits for the person's answer. */
    async ask(
      actor: InstanceRow,
      input: { access?: ConnectAccess; reason: string; server: string },
      toolUseId?: string
    ): Promise<ConnectAnswer> {
      const server = serverNamed(input.server, deps.servers(actor));
      refuseDenied(server, deps.denials(actor));
      refuseSecondAsk(waiting, actor.id, "connect");
      const facts = deps.facts(server);
      const requestId = crypto.randomUUID();
      const answered = new Promise<ConnectAnswer>((resolve, reject) => {
        waiting.set(requestId, {
          instanceId: actor.id,
          resolve,
          reject,
          server,
          signedIn: facts.signedIn,
        });
      });
      if (facts.signedIn) {
        // Signed in already: no card, and the session's own reading of the
        // server answers, as a sign-in's take does ({@link taking}).
        console.log(
          `[connect] ${actor.id} asks for ${server}, signed in already: its session says whether it holds it (${requestId})`
        );
        answerOne(requestId, await deps.heal(actor, server));
        return await answered;
      }
      const ask: ConnectAskFrame = {
        access: accessOf(
          facts.offers,
          input.access,
          facts.ended ? facts.held : null
        ),
        again: facts.ended,
        reason: input.reason,
        server,
        url: facts.url,
      };
      deps.park(
        parkedToolAsk(
          actor,
          requestId,
          CONNECT_ASK_TOOL,
          { reason: input.reason, server, access: ask.access },
          {
            connectAsk: ask,
            ...(toolUseId ? { toolUseId } : {}),
          }
        )
      );
      console.log(
        `[connect] ${actor.id} asks the person to connect ${server}${ask.again ? " again" : ""} (${requestId})`
      );
      return await answered;
    },

    /** Whether `requestId` is a connect ask still waiting: {@link answer}'s to settle. */
    owns(requestId: string): boolean {
      return waiting.has(requestId);
    },

    /**
     * The person's answer from an ask card (`answerPendingPermission`): Not
     * now answers the call with their words. An Approve is refused: a
     * connect ask is answered by signing in (Connect on its card).
     */
    answer(requestId: string, result: PermissionResult): Promise<void> {
      const waiter = waiting.get(requestId);
      if (!waiter || waiter.signedIn) {
        return Promise.reject(new Error("That request is no longer pending."));
      }
      if (result.behavior === "allow") {
        return Promise.reject(
          new Error(
            "A connect ask is answered by signing in. Press Connect on its card, or Not now."
          )
        );
      }
      waiting.delete(requestId);
      deps.settle(requestId);
      waiter.resolve({
        outcome: "declined",
        server: waiter.server,
        words: result.message.trim(),
      });
      return Promise.resolve();
    },

    /**
     * The hub signed in to `server`: every card asking for it comes down.
     * Each call waits on, for its session to take the sign-in
     * ({@link taking}): the session's tools are not the hub's to answer for.
     */
    signedIn(server: string): void {
      for (const [requestId, waiter] of waiting) {
        if (waiter.server === server && !waiter.signedIn) {
          waiter.signedIn = true;
          deps.settle(requestId);
        }
      }
    },

    /**
     * `instanceId`'s session is sent `changes` to take (hub server.ts
     * `sendMcpChanges`, after its machine's fleet sync wrote them): the
     * answer to each of its calls whose sign-in landed before, on a server
     * the changes name, is what that take comes to. Called as the take is
     * sent, so a take sent before the sign-in answers nothing.
     */
    taking(
      instanceId: string,
      changes: readonly FleetMcpChange[]
    ): ((took: FleetMcpTook) => void) | undefined {
      const named = new Set(changes.map(({ name }) => name));
      const mine = [...waiting].filter(
        ([, waiter]) =>
          waiter.instanceId === instanceId &&
          waiter.signedIn &&
          named.has(waiter.server)
      );
      if (mine.length === 0) {
        return;
      }
      return (took) => {
        for (const [requestId] of mine) {
          answerOne(requestId, took);
        }
      };
    },

    /**
     * `instanceId`'s session ended (hub server.ts `forgetPending`): each of
     * its calls still waiting is refused, its card with it, so none
     * outlives its session.
     */
    ended(instanceId: string): void {
      for (const [requestId, waiter] of waiting) {
        if (waiter.instanceId !== instanceId) {
          continue;
        }
        waiting.delete(requestId);
        waiter.reject(
          new Error(
            waiter.signedIn
              ? askWords.connectTakeUnanswered(waiter.server)
              : `The connect ask was withdrawn before the person answered it; ${waiter.server} was not connected.`
          )
        );
      }
    },

    /** `connect_ask`, bound to the calling session (none for a listing). */
    tools(actor: InstanceRow | undefined, toolUseId?: string) {
      return [
        tool(
          "connect_ask",
          DESCRIPTION,
          {
            server: z
              .string()
              .trim()
              .min(1)
              .describe("The server's name as the MCP page lists it."),
            reason: z
              .string()
              .trim()
              .min(1)
              .max(REASON_MAX)
              .describe(
                'One sentence they read: what you need it for, e.g. "Import the Settings page design from Figma."'
              ),
            access: z
              .enum(["read", "write"])
              .optional()
              .describe(
                "What you need to do there: read (look only) or write (change things too). Ask for read unless the work changes something there."
              ),
          },
          async (input) => {
            if (!actor) {
              throw new Error("Discovery cannot execute tools");
            }
            return await asks.ask(actor, input, toolUseId);
          },
          connectAnsweredWords
        ),
      ];
    },
  };
  return asks;
};

export type ConnectAsks = ReturnType<typeof createConnectAsks>;
