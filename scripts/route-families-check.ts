/**
 * A route family's plugin (`packages/hub/src/routes/<family>.ts`) reads the
 * closure through its own narrow `Pick<HubContext, ...>`: at most
 * {@link MOST_NAMES} names, so a family that needs more is cut before it
 * becomes a second closure.
 *
 * Run by `bun run check`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MOST_NAMES = 20;
const ROUTES = new URL("../packages/hub/src/routes/", import.meta.url).pathname;
const PICK = /Pick<\s*HubContext,\s*([^>]+)>/gu;
const NAME = /"\w+"/gu;

const problems = readdirSync(ROUTES)
  .filter((file) => file.endsWith(".ts"))
  .flatMap((file) => {
    const text = readFileSync(join(ROUTES, file), "utf8");
    return [...text.matchAll(PICK)]
      .map((pick) => pick[1]?.match(NAME)?.length ?? 0)
      .filter((names) => names > MOST_NAMES)
      .map((names) => `${file}: a plugin picks ${names} names of HubContext`);
  });

if (problems.length > 0) {
  console.error(problems.join("\n"));
  console.error(
    `route families: each picks at most ${MOST_NAMES} names (scripts/route-families-check.ts)`
  );
  process.exit(1);
}
console.log(
  "route families: every plugin picks 20 names of HubContext or fewer"
);
