import { isChatgptPlan, isOpenaiKey, modelOn } from "@cawco/core/accounts";
import type { StallOffer } from "@cawco/core/protocol";
import type { DbShape } from "./db";
import { signedInOn } from "./placement";

/**
 * Whether `instanceId` stopped on a ChatGPT plan (core `isChatgptPlan`):
 * held at that plan's limit, or left on no account by its removal or
 * sign-out. Such a session waits on its plan and is moved to no other.
 */
const stoppedOnPlan = (db: DbShape, instanceId: string): boolean => {
  const held = db.atLimit.hold(instanceId);
  if (held) {
    const plan = db.accounts.get(held.accountId);
    return plan !== undefined && isChatgptPlan(plan);
  }
  const left = db.accounts.strandedOf(instanceId);
  return !!left?.provider && isChatgptPlan({ provider: left.provider });
};

/**
 * What a session stopped on a ChatGPT plan offers the person (core
 * `StallOffer`), or undefined for any other stop: to continue on the
 * OpenAI API-key account signed in on its machine, first by order, on its
 * model as that key opens it, and always on another agent or model.
 * `resolvedModel` names a bare model as its harness resolves it (server.ts).
 */
export const stallOffer = (
  db: DbShape,
  resolvedModel: (
    machineId: string,
    harness: string,
    model: string | null | undefined
  ) => string | null | undefined,
  instanceId: string
): StallOffer | undefined => {
  const [row] = db.getInstancesByIds([instanceId]);
  if (!(row && stoppedOnPlan(db, instanceId))) {
    return;
  }
  const signins = db.accounts.signins();
  const [key] = db.accounts
    .list()
    .filter(
      (one) => isOpenaiKey(one) && signedInOn(signins, one.id, row.machineId)
    )
    .sort((a, b) => a.order - b.order);
  const model = key
    ? modelOn(
        row.harness,
        resolvedModel(row.machineId, row.harness, row.model),
        key.provider
      )
    : undefined;
  return key && model ? { key: { accountId: key.id, model } } : {};
};
