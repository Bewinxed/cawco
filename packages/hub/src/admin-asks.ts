/**
 * Admin writes ask the person (Projects spec §5.3: "admin tools split
 * read/write and writes ask you"). Whatever door an `admin_*_write` call
 * comes in by — MCP from any harness, the REST door, `cawco tool` — the hub
 * parks it as the calling session's ask: a `permission_request` naming the
 * exact tool and arguments, through the same pending ledger, dashboards,
 * Telegram and push that a session's own asks and a workflow's questions go
 * through. The call waits, as a parked permission does. Approved, it runs
 * once, with the arguments that were shown; denied, the caller gets the
 * refusal with the person's reason; withdrawn (the session ended, the hub
 * let it go), the caller hears that.
 *
 * Only the person answers it: a parent's `answer_delegate` is refused
 * (server.ts), and no session mode answers it for them — the ask never
 * reaches the harness, so Full Send has nothing to answer.
 */
import type { Envelope, InstanceRow, PermissionResult } from "@cawco/core";

export interface AdminAsksDeps {
  /** Parks an ask for the person: the pending ledger, every dashboard, Telegram, push. */
  readonly park: (envelope: Envelope) => void;
  /** Takes a settled ask off the pending ledger. */
  readonly settle: (requestId: string) => void;
}

interface Waiter {
  reject: (error: Error) => void;
  resolve: () => void;
}

export const createAdminAsks = ({ park, settle }: AdminAsksDeps) => {
  /** Calls waiting on the person, by the ask's request id. */
  const waiting = new Map<string, Waiter>();

  return {
    /**
     * Parks `name(input)` from `actor` as the person's ask and waits for the
     * answer: resolves once approved, rejects with the refusal when denied or
     * withdrawn.
     */
    ask(
      actor: InstanceRow,
      name: string,
      input: Record<string, unknown>
    ): Promise<void> {
      const requestId = crypto.randomUUID();
      const answered = new Promise<void>((resolve, reject) => {
        waiting.set(requestId, { resolve, reject });
      });
      park({
        verb: "frames",
        machineId: actor.machineId,
        instanceId: actor.id,
        requestId,
        payload: {
          kind: "permission_request",
          instanceId: actor.id,
          requestId,
          harness: actor.harness ?? "claude",
          requestKind: "tool",
          toolName: `mcp__cawco__${name}`,
          input,
        },
      });
      console.log(
        `[admin-asks] ${actor.id} asks the person to approve ${name} (${requestId})`
      );
      return answered;
    },

    /** Whether `requestId` is an admin write waiting on the person. */
    has(requestId: string): boolean {
      return waiting.has(requestId);
    },

    /**
     * The person's answer, when `requestId` is an admin ask: the waiting call
     * runs (allow) or is refused with their reason (deny), and the ask leaves
     * the ledger. False for every other ask.
     */
    answer(requestId: string, result: PermissionResult): boolean {
      const waiter = waiting.get(requestId);
      if (!waiter) {
        return false;
      }
      waiting.delete(requestId);
      settle(requestId);
      if (result.behavior === "allow") {
        waiter.resolve();
      } else {
        const reason = result.message.trim();
        waiter.reject(
          new Error(
            `The person declined this fleet-settings change${reason ? `: ${reason}` : "."}`
          )
        );
      }
      return true;
    },

    /** An ask left the ledger without an answer (its session ended): the call is refused. */
    withdrawn(requestId: string): void {
      const waiter = waiting.get(requestId);
      if (!waiter) {
        return;
      }
      waiting.delete(requestId);
      waiter.reject(
        new Error(
          "The ask for this fleet-settings change was withdrawn before the person answered it; nothing changed."
        )
      );
    },
  };
};

export type AdminAsks = ReturnType<typeof createAdminAsks>;
