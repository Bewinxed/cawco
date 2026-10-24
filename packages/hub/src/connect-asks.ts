/**
 * `connect_ask`: a session asks the person to sign the hub in to one of the
 * fleet's MCP servers that signs in with OAuth (Configure › MCP, hub
 * fleet-mcp.ts), so its tools reach the session. The ask parks as the
 * session's `permission_request` for {@link CONNECT_ASK_TOOL}, carrying the
 * server, the reason, the provider's page and the access it offers
 * ({@link ConnectAskFrame}), so it stands on the session's composer, in
 * Needs you and on the phone as every ask does, and the call waits.
 *
 * Connect is the hub's own sign-in for that server (`POST
 * /api/fleet/mcp/:name/sign-in`, the access picked): the hub keeps the
 * credential, sealed, and every session with the server gets its tools.
 * The sign-in landing ({@link ConnectAsks.signedIn}) answers every call
 * waiting on that server with as whom and with what access; Not now
 * answers it with the person's words. A server the hub is signed in to
 * already is answered at once. A session has one connect ask open at a
 * time; one whose session ends before it is answered is withdrawn, and the
 * call refused. A waiting call ends with the hub that held it.
 */
import type {
  ConnectAnswer,
  ConnectAskFrame,
  Envelope,
  InstanceRow,
  PermissionResult,
} from "@cawco/core";
import { CONNECT_ASK_TOOL, connectAnsweredWords } from "@cawco/core";
import { z } from "zod";
import type { AskFacts } from "./fleet-mcp";
import { tool } from "./mcp-tool";

/** The session tools connect asks give, by name: what a call is routed by (delegation-mcp.ts). */
export const CONNECT_TOOLS: ReadonlySet<string> = new Set(["connect_ask"]);

/** The longest reason the person reads. */
const REASON_MAX = 300;

const DESCRIPTION =
  "Ask the person to sign in to one of the fleet's MCP servers that needs a sign-in, when you need its tools and they are missing or refused for want of one. " +
  "It waits for them; once they connect, its tools reach this session. No credential reaches you.";

/** How connect asks reach the rest of the hub. */
export interface ConnectAsksDeps {
  /** What an ask for the server says (fleet-mcp.ts `askFacts`); throws the sentence the agent reads. */
  readonly facts: (server: string) => AskFacts;
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
}

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

export const createConnectAsks = (deps: ConnectAsksDeps) => {
  /** Calls waiting on the person, by the ask's request id. */
  const waiting = new Map<string, Waiter>();

  const openOf = (instanceId: string): string | undefined =>
    [...waiting].find(([, waiter]) => waiter.instanceId === instanceId)?.[0];

  const asks = {
    /** Parks `actor`'s connect ask and waits for the person's answer. */
    async ask(
      actor: InstanceRow,
      input: { reason: string; server: string },
      toolUseId?: string
    ): Promise<ConnectAnswer> {
      const server = serverNamed(input.server, deps.servers(actor));
      const facts = deps.facts(server);
      if (facts.signedIn) {
        return {
          outcome: "connected",
          server,
          as: facts.as,
          access: facts.held,
        };
      }
      const open = openOf(actor.id);
      if (open) {
        throw new Error(
          `This session already has a connect ask open (${open}); its answer comes back to that call.`
        );
      }
      const requestId = crypto.randomUUID();
      const held = facts.ended ? facts.held : null;
      const ask: ConnectAskFrame = {
        again: facts.ended,
        held,
        // Asked again with its access held: the access is not asked again.
        offers: held ? [] : facts.offers,
        reason: input.reason,
        server,
        url: facts.url,
      };
      const answered = new Promise<ConnectAnswer>((resolve, reject) => {
        waiting.set(requestId, {
          instanceId: actor.id,
          resolve,
          reject,
          server,
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
          toolName: CONNECT_ASK_TOOL,
          input: { ...input, server },
          connectAsk: ask,
          ...(toolUseId ? { toolUseId } : {}),
        },
      });
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
      if (!waiter) {
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

    /** The hub signed in to `server`: every call waiting on it is answered with as whom and the access. */
    signedIn(server: string): void {
      const mine = [...waiting].filter(
        ([, waiter]) => waiter.server === server
      );
      if (mine.length === 0) {
        return;
      }
      const facts = deps.facts(server);
      for (const [requestId, waiter] of mine) {
        waiting.delete(requestId);
        deps.settle(requestId);
        waiter.resolve({
          outcome: "connected",
          server,
          as: facts.as,
          access: facts.held,
        });
      }
    },

    /** An ask left the ledger unanswered (its session ended): the call is refused. */
    withdrawn(requestId: string): void {
      const waiter = waiting.get(requestId);
      if (!waiter) {
        return;
      }
      waiting.delete(requestId);
      waiter.reject(
        new Error(
          `The connect ask was withdrawn before the person answered it; ${waiter.server} was not connected.`
        )
      );
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
