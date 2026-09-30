import type { Envelope, PermissionResult } from "@whiffle/core";
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
  readonly remember: (requestId: string, envelope: Envelope) => void;
  readonly resolve: (requestId: string) => void;
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

const make = (): PendingShape => {
  const requests = new Map<string, Envelope>();

  return {
    remember: (requestId, envelope) => {
      requests.set(requestId, envelope);
    },
    get: (requestId) => requests.get(requestId),
    resolve: (requestId) => {
      requests.delete(requestId);
    },
    forget: (instanceId) => {
      for (const [requestId, envelope] of requests) {
        if (envelope.instanceId === instanceId) {
          requests.delete(requestId);
        }
      }
    },
    list: () => [...requests.values()],
  };
};

export const PendingLayer = Layer.effect(Pending)(Effect.sync(make));
