/**
 * `bun scripts/style-greps.ts` (part of `bun run lint`): the three style
 * shapes the dashboard never writes, found by grep over apps/dashboard/src
 * (tracked and untracked files):
 *  - `transition-all`: every property the element ever changes would
 *    transition; a transition names its properties.
 *  - `filter` in a transition's property list (`transition-[…filter…]`,
 *    `transition: filter …`, `transition-property: …backdrop-filter`): a
 *    transitioned blur hangs WebKit's web process (specs/web/safari-blurs).
 *  - a class-keyed `has-[.x]`: a `:has()` keyed on a class restyles its
 *    element whenever any descendant's class changes; it is keyed on an
 *    attribute the child carries (`has-data-needs:`).
 * Prints `file:line: text` under the rule each match breaks; exits 1 on any.
 */
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const RULES: { name: string; pattern: string; fixed?: boolean }[] = [
  {
    name: "transition-all is banned: name the properties (transition-[a,b])",
    pattern: "(^|[^-[:alnum:]])transition-all([^-[:alnum:]]|$)",
  },
  {
    name: "filter is never in a transition's property list (the WebKit filter hang)",
    pattern:
      "transition-\\[[^]]*filter|transition(-property)?[[:space:]]*:[^;{}]*filter",
  },
  {
    name: "has-[.class] is banned: key :has() on an attribute (has-data-x:)",
    pattern: "has-[.",
    fixed: true,
  },
];

const outs = await Promise.all(
  RULES.map((rule) =>
    Bun.$`git grep --untracked -n ${rule.fixed ? "-F" : "-E"} -e ${rule.pattern} -- apps/dashboard/src`
      .cwd(ROOT)
      .nothrow()
      .quiet()
  )
);
let found = 0;
for (const [i, rule] of RULES.entries()) {
  const out = outs[i] as (typeof outs)[number];
  const lines = out.stdout.toString().trim();
  if (out.exitCode === 0 && lines) {
    const hits = lines.split("\n");
    found += hits.length;
    console.log(`${rule.name}:\n${hits.map((hit) => `  ${hit}`).join("\n")}`);
  } else if (out.exitCode > 1) {
    console.error(`git grep failed: ${out.stderr.toString().trim()}`);
    process.exit(2);
  }
}
console.log(
  found === 0
    ? "style greps: no transition-all, no filter in a transition list, no has-[.class]"
    : `style greps: ${found} match${found === 1 ? "" : "es"}`
);
process.exit(found === 0 ? 0 : 1);
