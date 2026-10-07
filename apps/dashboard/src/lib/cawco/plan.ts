/**
 * A session's plan, client side (shapes and rules in core plan.ts): the hub
 * sends each follower a `plan.snapshot` when it subscribes, then
 * `plan.delta`s, RFC 6902 patches applied in sequence. A delta for anything
 * but the revision held is a gap: nothing is applied, and the hub is asked
 * for the plan whole (`plan.resync`), once per gap.
 */
import type { PlanDelta, PlanSnapshot, SessionPlan } from "@cawco/core";
import { applyPatch, type Operation } from "rfc6902";

/** A session's plan as this tab holds it, and the revision it is at. */
export interface HeldPlan {
  plan: SessionPlan;
  rev: number;
}

/** Sessions whose resync is out: one ask per gap, cleared by the snapshot it brings. */
const asked = new Set<string>();

const gap = (instanceId: string, resync: (instanceId: string) => void) => {
  if (!asked.has(instanceId)) {
    asked.add(instanceId);
    resync(instanceId);
  }
};

/**
 * Takes one socket message if it is a plan frame, and says so. `plans` is
 * the store's map, by session; `resync` puts a `plan.resync` on the socket.
 */
export function handlePlanMessage(
  plans: Record<string, HeldPlan>,
  message: unknown,
  resync: (instanceId: string) => void
): boolean {
  if (typeof message !== "object" || message === null) {
    return false;
  }
  const { type } = message as { type?: unknown };
  if (type === "plan.snapshot") {
    const { type: _type, instanceId, rev, ...plan } = message as PlanSnapshot;
    asked.delete(instanceId);
    plans[instanceId] = { rev, plan };
    return true;
  }
  if (type !== "plan.delta") {
    return false;
  }
  const { instanceId, rev, patch } = message as PlanDelta;
  const held = plans[instanceId];
  if (held && rev <= held.rev) {
    return true;
  }
  if (!held || rev !== held.rev + 1) {
    gap(instanceId, resync);
    return true;
  }
  const next = JSON.parse(JSON.stringify(held.plan)) as SessionPlan;
  if (applyPatch(next, patch as Operation[]).some((error) => error !== null)) {
    gap(instanceId, resync);
    return true;
  }
  plans[instanceId] = { rev, plan: next };
  return true;
}
