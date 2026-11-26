/**
 * Writes the bundled pricing snapshot from models.dev, through the same filter
 * the agents' daily refresh uses, so the two never disagree.
 *
 *   bun run pricing   (in packages/core)
 */
import { join } from "node:path";
import { filterModelsDev, MODEL_ALIASES } from "../src/usage/pricing";
import previous from "../src/usage/pricing-snapshot.json";

const URL = "https://models.dev/api.json";

const response = await fetch(URL);
if (!response.ok) {
  throw new Error(`${URL} answered ${response.status}`);
}
const { models, skippedTiers = [] } = filterModelsDev(await response.json());

/**
 * Every alias target stays priced offline. A target models.dev no longer lists
 * keeps the price the previous snapshot held for it, as the agents' daily
 * refresh keeps it (`refreshPricing` lays models.dev over the snapshot); a
 * target no catalog prices refuses the write.
 */
const carried: string[] = [];
for (const [alias, target] of Object.entries(MODEL_ALIASES)) {
  for (const [id, rates] of Object.entries(previous.models)) {
    if (id.endsWith(`/${target}`) && !(id in models)) {
      models[id] = rates;
      carried.push(id);
    }
  }
  if (!Object.keys(models).some((id) => id.endsWith(`/${target}`))) {
    throw new Error(
      `pricing: alias ${alias} names ${target}, which no provider prices; snapshot not written`
    );
  }
}
const sorted = Object.fromEntries(
  Object.keys(models)
    .sort()
    .map((id) => [id, models[id]])
);
const path = join(import.meta.dir, "../src/usage/pricing-snapshot.json");
await Bun.write(
  path,
  `${JSON.stringify({ generatedAt: new Date().toISOString(), models: sorted, source: URL }, null, 2)}\n`
);
const tiered = Object.values(sorted).filter((m) => m.tiers).length;
console.log(
  `pricing: ${Object.keys(sorted).length} models, ${tiered} with context tiers → ${path}`
);
for (const id of carried) {
  console.log(
    `pricing: ${id} kept from the previous snapshot (alias target models.dev no longer lists)`
  );
}
for (const skipped of skippedTiers) {
  console.log(`pricing: tier skipped, ${skipped}`);
}
