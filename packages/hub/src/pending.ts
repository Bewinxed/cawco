import type { Envelope, PermissionResult } from "@cawco/core";
import { Context, Effect, Layer } from "effect";
import { Db, type DbShape } from "./db";

/**
 * Permission and dialog requests the agent is blocked on, keyed by SDK
 * `requestId`, so a dashboard that connects mid-prompt can still answer it.
 *
 * A session's own asks outlive this hub, as the process blocked on them does:
 * they are kept in the database and read back as it boots, so the hub that
 * comes back holds them before any agent has replayed its own, and every
 * screen that reads `/api/pending` meanwhile still shows them. An ask the hub
 * raised itself (a workflow's question, an admin write) is answered by a
 * waiter in this process, and goes with it.
 */
export interface PendingShape {
  /** A relaunch or a death answers every question its process had open. */
  readonly forget: (instanceId: string) => void;
  /** The parked ask itself, for whoever answers it away from a dashboard. */
  readonly get: (requestId: string) => Envelope | undefined;
  readonly list: () => Envelope[];
  /**
   * The one place an ask's end is heard: called for every parked ask that
   * leaves, by `resolve` or `forget`, whichever path settled it. Set once by
   * the server, which tells every dashboard.
   */
  readonly onSettled: (listener: SettledListener) => void;
  /**
   * Set once by the server: stamps what an ask says on every surface (its
   * `presentation`, ask-presentation.ts) onto its payload. Every ask already
   * held, the ones kept across a restart included, is stamped at once, and
   * every ask parked after it as it parks.
   */
  readonly presentWith: (present: Presenter) => void;
  /**
   * `outlivesHub` marks a session process's own ask, which is kept across
   * this hub's restart; one the hub raised for itself is not.
   */
  readonly remember: (
    requestId: string,
    envelope: Envelope,
    outlivesHub?: boolean
  ) => boolean;
  /**
   * `why` is said with a cancellation the hub can explain: an ask it could
   * not show anyone (`askRefusal` in server.ts).
   */
  readonly resolve: (
    requestId: string,
    outcome?: "answered" | "cancelled",
    why?: string
  ) => boolean;
}

/** Hears every parked ask that leaves, with why when the hub could say. */
export type SettledListener = (
  envelope: Envelope,
  outcome: "answered" | "cancelled",
  why?: string
) => void;

/** Stamps a parked ask's presentation onto its payload. */
export type Presenter = (envelope: Envelope) => void;

const isPermissionAsk = (envelope: Envelope): boolean =>
  (envelope.payload as { kind?: unknown } | undefined)?.kind ===
  "permission_request";

export class Pending extends Context.Service<Pending, PendingShape>()(
  "Pending"
) {}

const workflowAnswers = new WeakMap<
  PendingShape,
  (id: string, result: PermissionResult) => boolean
>();
export const onWorkflowAnswer = (
  pending: PendingShape,
  handler: (id: string, result: PermissionResult) => boolean
) => workflowAnswers.set(pending, handler);
/**
 * Whether `id` was a workflow's question, which this answer then settles.
 * Throws, with the reason, when the question cannot take the answer — a typed
 * question given a reply that is not its JSON — and the question stays open.
 */
export const answerWorkflow = (
  pending: PendingShape,
  id: string,
  result: PermissionResult
): boolean => workflowAnswers.get(pending)?.(id, result) ?? false;

type AnswerHandler = (
  instanceId: string,
  requestId: string,
  result: PermissionResult
) => Promise<void>;
const permissionAnswers = new WeakMap<PendingShape, AnswerHandler>();
export const onPermissionAnswer = (
  pending: PendingShape,
  handler: AnswerHandler
) => permissionAnswers.set(pending, handler);
/** Every device waits for the same delivered-and-settled receipt. */
export const answerPermission = (
  pending: PendingShape,
  instanceId: string,
  requestId: string,
  result: PermissionResult
): Promise<void> => {
  const handler = permissionAnswers.get(pending);
  if (!handler) {
    return Promise.reject(new Error("Permission answering is not ready."));
  }
  return handler(instanceId, requestId, result);
};

/**
 * The run a workflow's question belongs to (runtime.ts `parkAsk`), or
 * undefined for any other ask: a session's own, or an admin write's.
 */
export const workflowRunOf = (envelope: Envelope): string | undefined => {
  const runId = (envelope.payload as { workflowRunId?: unknown } | undefined)
    ?.workflowRunId;
  return typeof runId === "string" ? runId : undefined;
};

/** The payload field the hub stamps; see `raisedAt` on `permission_request`. */
const raisedAtOf = (envelope: Envelope | undefined): number | undefined => {
  const at = (envelope?.payload as { raisedAt?: unknown } | undefined)
    ?.raisedAt;
  return typeof at === "number" ? at : undefined;
};

const make = (kept: DbShape["parkedAsks"]): PendingShape => {
  // What the hub held parked when it last stopped, by request id.
  const requests = new Map<string, Envelope>(
    kept
      .list()
      .flatMap((envelope) =>
        envelope.requestId ? [[envelope.requestId, envelope] as const] : []
      )
  );
  // A daemon replay must not resurrect a request that already left this ledger.
  const settledIds = new Set<string>();
  let settled: SettledListener | undefined;
  let present: Presenter | undefined;
  const resolve: PendingShape["resolve"] = (requestId, outcome, why) => {
    const envelope = requests.get(requestId);
    if (!envelope) {
      return false;
    }
    requests.delete(requestId);
    kept.drop(requestId);
    settledIds.add(requestId);
    settled?.(envelope, outcome ?? "answered", why);
    return true;
  };

  return {
    onSettled: (listener) => {
      settled = listener;
    },
    presentWith: (presenter) => {
      present = presenter;
      for (const envelope of requests.values()) {
        if (isPermissionAsk(envelope)) {
          presenter(envelope);
        }
      }
    },
    /**
     * Parks an ask and stamps the moment the hub first saw it onto its
     * payload, before the payload is relayed or replayed from `/api/pending`.
     * A daemon replay of the same request keeps the first stamp, so the wait
     * every device shows is the same wait, a replay after this hub restarted
     * included. An ask the hub raises itself may carry its own first stamp
     * (a workflow's question, re-parked off its step on boot), which stands.
     */
    remember: (requestId, envelope, outlivesHub = false) => {
      if (settledIds.has(requestId)) {
        return false;
      }
      if (isPermissionAsk(envelope)) {
        if (!present) {
          throw new Error(
            "An ask was parked before the hub could say what it asks."
          );
        }
        present(envelope);
      }
      const payload = envelope.payload as Record<string, unknown>;
      payload.raisedAt =
        raisedAtOf(requests.get(requestId)) ??
        raisedAtOf(envelope) ??
        Date.now();
      requests.set(requestId, envelope);
      if (outlivesHub) {
        kept.save(requestId, envelope);
      }
      return true;
    },
    get: (requestId) => requests.get(requestId),
    resolve,
    forget: (instanceId) => {
      for (const [requestId, envelope] of requests) {
        if (envelope.instanceId === instanceId) {
          resolve(requestId, "cancelled");
        }
      }
    },
    list: () => [...requests.values()],
  };
};

export const PendingLayer = Layer.effect(Pending)(
  Effect.gen(function* () {
    const db = yield* Db;
    return make(db.parkedAsks);
  })
);
