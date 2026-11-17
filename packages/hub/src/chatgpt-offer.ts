import {
  isChatgptPlan,
  isOpenaiKey,
  modelOn,
  providersOpenedBy,
} from "@cawco/core/accounts";
import { type HarnessKind, harnessNamed } from "@cawco/core/harness/kinds";
import { type ModelListing, modelAdmitted } from "@cawco/core/model-names";
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
 * OpenAI API-key account signed in on its machine, first by order, and
 * always on another agent or model. The key's model is the session's own
 * as that key opens it, where its harness lists it there; else the first
 * model of the key's provider the harness lists. With none listed, the key
 * can't run it there, and only another agent or model is offered.
 * `resolvedModel` names a bare model as its harness resolves it, `listing`
 * is what the harness lists on a machine (server.ts).
 */
export const stallOffer = (
  db: DbShape,
  how: {
    listing: (machineId: string, harness: HarnessKind) => ModelListing;
    resolvedModel: (
      machineId: string,
      harness: string,
      model: string | null | undefined
    ) => string | null | undefined;
  },
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
  const harness = harnessNamed(row.harness);
  if (!(key && harness)) {
    return {};
  }
  const listing = how.listing(row.machineId, harness);
  const own = modelOn(
    harness,
    how.resolvedModel(row.machineId, harness, row.model),
    key.provider
  );
  const [opened] = providersOpenedBy(harness, key.provider);
  const model =
    own && modelAdmitted(harness, own, listing)
      ? own
      : (listing.read ? listing.rows : []).find((one) =>
          one.value.startsWith(`${opened}/`)
        )?.value;
  return model ? { key: { accountId: key.id, model } } : {};
};
