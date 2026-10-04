import type { Envelope, PermissionResult } from "@cawco/core";
import { Context, Effect, Layer } from "effect";

/**
 * Permission and dialog requests the agent is blocked on, keyed by SDK
 * `requestId`, so a dashboard that connects mid-prompt can still answer it.
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
  readonly onSettled: (
    listener: (envelope: Envelope, outcome: "answered" | "cancelled") => void
  ) => void;
  readonly remember: (requestId: string, envelope: Envelope) => boolean;
  readonly resolve: (
    requestId: string,
    outcome?: "answered" | "cancelled"
  ) => boolean;
}

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

/** The payload field the hub stamps; see `raisedAt` on `permission_request`. */
const raisedAtOf = (envelope: Envelope | undefined): number | undefined => {
  const at = (envelope?.payload as { raisedAt?: unknown } | undefined)
    ?.raisedAt;
  return typeof at === "number" ? at : undefined;
};

const make = (): PendingShape => {
  const requests = new Map<string, Envelope>();
  // A daemon replay must not resurrect a request that already left this ledger.
  const settledIds = new Set<string>();
  let settled:
    | ((envelope: Envelope, outcome: "answered" | "cancelled") => void)
    | undefined;
  const resolve: PendingShape["resolve"] = (
    requestId,
    outcome = "answered"
  ) => {
    const envelope = requests.get(requestId);
    if (!envelope) {
      return false;
    }
    requests.delete(requestId);
    settledIds.add(requestId);
    settled?.(envelope, outcome);
    return true;
  };

  return {
    onSettled: (listener) => {
      settled = listener;
    },
    /**
     * Parks an ask and stamps the moment the hub first saw it onto its
     * payload, before the payload is relayed or replayed from `/api/pending`.
     * A daemon replay of the same request keeps the first stamp, so the wait
     * every device shows is the same wait.
     */
    remember: (requestId, envelope) => {
      if (settledIds.has(requestId)) {
        return false;
      }
      const payload = envelope.payload as Record<string, unknown>;
      payload.raisedAt = raisedAtOf(requests.get(requestId)) ?? Date.now();
      requests.set(requestId, envelope);
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

export const PendingLayer = Layer.effect(Pending)(Effect.sync(make));
