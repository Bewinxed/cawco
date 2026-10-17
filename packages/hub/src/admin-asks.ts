/**
 * Admin writes ask the person (Projects spec §5.3: "admin tools split
 * read/write and writes ask you"). Whatever door an `admin_*_write` call
 * comes in by — MCP from any harness, the REST door, `cawco tool` — the hub
 * parks it as the calling session's ask: a `permission_request` naming the
 * exact tool and arguments, through the same pending ledger, dashboards
 * and push that a session's own asks and a workflow's questions go
 * through. The call waits, as a parked permission does. Approved, it runs
 * once, with the arguments that were shown; denied, the caller gets the
 * refusal with the person's reason; withdrawn (the session ended, the hub
 * let it go), the caller hears that.
 *
 * The ask is kept across a hub restart, as a session's own asks are: it
 * stays pending on every screen. The call that waited on it ended with the
 * hub that held it, so an answer given after the restart is carried out by
 * the hub — approved, the write runs once with the arguments that were
 * shown; denied, nothing runs — and the calling session is told either way.
 *
 * Only the person answers it: a parent's `answer_delegate` is refused
 * (server.ts), and no session mode answers it for them — the ask never
 * reaches the harness, so Full Send has nothing to answer.
 */
import type {
  Envelope,
  InstanceRow,
  PermissionResult,
  SourceFacts,
} from "@cawco/core";

const ADMIN_WRITE = /^admin_[a-z_]+_write$/;

/**
 * Why a write is refused before anyone is asked: an `admin_*_write` with no
 * `reason`, which the person reads first on the approval. Undefined when it
 * may ask.
 */
export const askRefusal = (
  name: string,
  input: Record<string, unknown>
): string | undefined => {
  if (!ADMIN_WRITE.test(name)) {
    return;
  }
  return typeof input.reason === "string" && input.reason.trim()
    ? undefined
    : `${name} needs a \`reason\`: one sentence on why, for which task. The person reads it on the approval; nothing was asked.`;
};

export interface AdminAsksDeps {
  /**
   * Parks an ask for the person, kept across a hub restart: the pending
   * ledger, every dashboard, push.
   */
  readonly park: (envelope: Envelope) => void;
  /** The parked ask by request id, while it is pending (kept ones included). */
  readonly parked: (requestId: string) => Envelope | undefined;
  /** Runs an approved write as the hub for the session that asked; answers what the tool said. */
  readonly run: (
    name: string,
    input: Record<string, unknown>,
    instanceId: string
  ) => Promise<string>;
  /** Takes a settled ask off the pending ledger. */
  readonly settle: (requestId: string) => void;
  /**
   * What an install's or a link's source is (source-facts.ts), read before
   * the ask parks so the card shows it; undefined for any other call.
   */
  readonly sourceFacts: (
    name: string,
    input: Record<string, unknown>
  ) => Promise<SourceFacts> | undefined;
  /** Says something to a session, as the hub. */
  readonly tell: (instanceId: string, text: string) => void;
  /** The thread a project's Caw asks in (caw.ts `askThread`); undefined for any other session. */
  readonly threadOf: (actor: InstanceRow) => string | undefined;
}

interface Waiter {
  /** The tool the ask is for. */
  name: string;
  reject: (error: Error) => void;
  resolve: () => void;
}

/** What an admin ask's payload carries for the hub: the tool, by its own name. */
interface AdminPayload {
  adminWrite?: unknown;
  input?: unknown;
}

/** What the ask was for, in the refusal's words: a relay opens a public path, everything else is a fleet setting. */
const askedFor = (name: string) => {
  if (name === "relay_create") {
    return "opening this relay";
  }
  if (name === "update_machines") {
    return "installing this build";
  }
  return name === "project_settings"
    ? "this project-settings change"
    : "this fleet-settings change";
};

const refusalText = (result: PermissionResult, name: string): string => {
  const reason = result.behavior === "deny" ? result.message.trim() : "";
  return `The person declined ${askedFor(name)}${reason ? `: ${reason}` : "."}`;
};

export const createAdminAsks = ({
  park,
  parked,
  run,
  settle,
  sourceFacts,
  tell,
  threadOf,
}: AdminAsksDeps) => {
  /** Calls waiting on the person, by the ask's request id. */
  const waiting = new Map<string, Waiter>();

  /** A kept admin ask whose call ended with the hub before it: its tool, input and caller. */
  const kept = (
    requestId: string
  ):
    | { input: Record<string, unknown>; instanceId: string; name: string }
    | undefined => {
    const envelope = parked(requestId);
    const payload = envelope?.payload as AdminPayload | undefined;
    if (!(envelope?.instanceId && typeof payload?.adminWrite === "string")) {
      return;
    }
    return {
      name: payload.adminWrite,
      instanceId: envelope.instanceId,
      input: (payload.input ?? {}) as Record<string, unknown>,
    };
  };

  /** An answer to a kept ask: run once when approved, and the caller told. */
  const carryOut = (
    requestId: string,
    ask: NonNullable<ReturnType<typeof kept>>,
    result: PermissionResult
  ): void => {
    settle(requestId);
    if (result.behavior !== "allow") {
      tell(
        ask.instanceId,
        `${refusalText(result, ask.name)} (${ask.name}, which you asked for before the hub restarted; nothing ran.)`
      );
      return;
    }
    console.log(
      `[admin-asks] ${ask.name} (${requestId}) approved after a hub restart; the hub runs it for ${ask.instanceId}`
    );
    run(ask.name, ask.input, ask.instanceId).then(
      (said) =>
        tell(
          ask.instanceId,
          `The person approved ${ask.name}, which you asked for before the hub restarted. The hub ran it once with the arguments shown; it said:\n\n${said}`
        ),
      (error: unknown) =>
        tell(
          ask.instanceId,
          `The person approved ${ask.name}, which you asked for before the hub restarted, and it failed when the hub ran it: ${error instanceof Error ? error.message : String(error)}`
        )
    );
  };

  return {
    /**
     * Parks `name(input)` from `actor` as the person's ask and waits for the
     * answer: resolves once approved, rejects with the refusal when denied or
     * withdrawn. A project's Caw asks in his thread: the ask carries it, and
     * the tool call it gates (`toolUseId`, Claude Code's `_meta`), so it is
     * drawn and answered there. An install or a link without a reason is
     * refused before anything parks ({@link askRefusal}); one with a reason
     * parks with its source's facts.
     */
    async ask(
      actor: InstanceRow,
      name: string,
      input: Record<string, unknown>,
      toolUseId?: string
    ): Promise<void> {
      const refusal = askRefusal(name, input);
      if (refusal) {
        throw new Error(refusal);
      }
      const facts = await sourceFacts(name, input);
      const requestId = crypto.randomUUID();
      const answered = new Promise<void>((resolve, reject) => {
        waiting.set(requestId, { name, resolve, reject });
      });
      const threadId = threadOf(actor);
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
          adminWrite: name,
          ...(facts ? { sourceFacts: facts } : {}),
          ...(threadId ? { threadId } : {}),
          ...(toolUseId ? { toolUseId } : {}),
        },
      });
      console.log(
        `[admin-asks] ${actor.id} asks the person to approve ${name} (${requestId})`
      );
      return await answered;
    },

    /** Whether `requestId` is an admin write waiting on the person, one kept across a restart included. */
    has(requestId: string): boolean {
      return waiting.has(requestId) || kept(requestId) !== undefined;
    },

    /**
     * The person's answer, when `requestId` is an admin ask: the waiting call
     * runs (allow) or is refused with their reason (deny), and the ask leaves
     * the ledger; one kept across a restart is carried out by the hub. False
     * for every other ask.
     */
    answer(requestId: string, result: PermissionResult): boolean {
      const waiter = waiting.get(requestId);
      if (!waiter) {
        const ask = kept(requestId);
        if (!ask) {
          return false;
        }
        carryOut(requestId, ask, result);
        return true;
      }
      waiting.delete(requestId);
      settle(requestId);
      if (result.behavior === "allow") {
        waiter.resolve();
      } else {
        waiter.reject(new Error(refusalText(result, waiter.name)));
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
          `The ask for ${askedFor(waiter.name)} was withdrawn before the person answered it; nothing changed.`
        )
      );
    },
  };
};

export type AdminAsks = ReturnType<typeof createAdminAsks>;
