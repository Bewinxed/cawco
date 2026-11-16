/**
 * A session's sends and starts through its MCP tools (delegation-mcp.ts):
 * the caller's row read fresh, then the hub's one send path (sends.ts
 * `sessionSend`), the one step that writes a send's inputs and sends it
 * (work-items.ts `handOff`), or a start held until the session is in place
 * (spawns.ts `spawnSession`). delegation-mcp.ts and delegation-actions.ts
 * type their deps from these.
 */

import type { PermissionMode } from "@cawco/core/harness/kinds";
import type {
  Envelope,
  InstanceRow,
  SendPayload,
  SpawnPayload,
} from "@cawco/core/protocol";
import { ElysiaStatus, problem } from "elysia";
import type { DbShape } from "./db";
import type { createSends } from "./sends";
import { type createSpawns, peekParent } from "./spawns";
import {
  type HandoffInputs,
  mayStartRefusal,
  type WorkItems,
} from "./work-items";

export interface DelegationSendsDeps {
  db: Pick<DbShape, "getInstancesByIds">;
  handOff: WorkItems["handOff"];
  sessionSend: ReturnType<typeof createSends>["sessionSend"];
  spawnSession: ReturnType<typeof createSpawns>["spawnSession"];
}

export const createDelegationSends = (deps: DelegationSendsDeps) => {
  /** The row of the session whose tool call this is, read fresh: its permission may have changed mid-call; the problem when the hub has none. */
  const caller = (actor: InstanceRow) => {
    const [requester] = deps.db.getInstancesByIds([actor.id]);
    if (!requester) {
      return problem(400, {
        code: "delegation-caller-unknown",
        detail: "Unknown calling CawCo instanceId",
      });
    }
    return requester;
  };

  return {
    caller,

    /**
     * Hands a session's send to the hub's one send path now, and answers
     * what became of it; a send that does not go answers the hub's problem.
     */
    deliver: (envelope: Envelope<SendPayload>, actor: InstanceRow) => {
      const requester = caller(actor);
      return Promise.resolve(
        requester instanceof ElysiaStatus
          ? requester
          : deps.sessionSend(envelope, requester)
      );
    },

    /**
     * A handoff with inputs: written and sent in one step of the receiver's
     * workspace's turn (work-items.ts `handOff`).
     */
    handOff: async (
      target: string,
      inputs: unknown[],
      compose: (landed: HandoffInputs) => Envelope<SendPayload>,
      actor: InstanceRow
    ) => {
      const requester = caller(actor);
      if (requester instanceof ElysiaStatus) {
        return requester;
      }
      return await deps.handOff(target, requester.id, inputs, (landed) => {
        const sent = deps.sessionSend(compose(landed), requester);
        return sent instanceof ElysiaStatus
          ? sent
          : { ...sent, ...(landed.cut ? { cut: true as const } : {}) };
      });
    },

    /**
     * A session's start_session: the caller's own machine unless it named
     * one, refused to a leaf (one that may not start any type), held until
     * in place. Answers the folder it runs in as the hub settled it.
     */
    spawn: async (
      envelope: Envelope<
        SpawnPayload & { fallbackPermissionMode?: PermissionMode }
      >,
      actor: InstanceRow
    ) => {
      const requester = caller(actor);
      if (requester instanceof ElysiaStatus) {
        return requester;
      }
      const refused = mayStartRefusal(requester, null);
      if (refused) {
        return problem(403, {
          code: "work-item-may-not-start",
          detail: refused,
        });
      }
      const { fallbackPermissionMode, ...asked } = envelope.payload;
      // The agent's check, nested under the agent whatever its call named.
      const { parentToolUseId } = peekParent(asked);
      const payload: SpawnPayload = {
        ...asked,
        parent: {
          instanceId: requester.id,
          ...(parentToolUseId ? { toolUseId: parentToolUseId } : {}),
        },
      };
      return await deps.spawnSession(
        envelope.machineId || requester.machineId,
        payload,
        "check",
        fallbackPermissionMode
      );
    },
  };
};

export type DelegationSends = ReturnType<typeof createDelegationSends>;
