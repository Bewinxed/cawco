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
const { models } = filterModelsDev(await response.json());
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
console.log(`pricing: ${Object.keys(sorted).length} models → ${path}`);
