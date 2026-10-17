/**
 * Writes the bundled pricing snapshot from models.dev, through the same filter
 * the agents' daily refresh uses, so the two never disagree.
 *
 *   bun run pricing   (in packages/core)
 */
import { join } from "node:path";
import { filterModelsDev } from "../src/usage/pricing";

const URL = "https://models.dev/api.json";

const response = await fetch(URL);
if (!response.ok) {
  throw new Error(`${URL} answered ${response.status}`);
}
const { models, skippedTiers = [] } = filterModelsDev(await response.json());
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
for (const skipped of skippedTiers) {
  console.log(`pricing: tier skipped, ${skipped}`);
}
