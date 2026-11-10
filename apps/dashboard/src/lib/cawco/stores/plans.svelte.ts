/** Each followed session's plan, as the hub's plan messages keep it (plan.ts). */

import type { SessionPlan } from "@cawco/core/plan";
import type { HeldPlan } from "../plan";

export const plansState = $state<{
  /**
   * Each followed session's plan (plan.ts): its steps, its spec, an
   * attempt's to-dos, as the hub's `plan.snapshot` and `plan.delta` keep it.
   */
  plans: Record<string, HeldPlan>;
}>({
  plans: {},
});

/** Each followed session's plan. */
export const plansStore = {
  /** A followed session's plan, live: its steps, its spec, an attempt's to-dos. */
  planOf: (instanceId: string): SessionPlan | undefined =>
    plansState.plans[instanceId]?.plan,
};
