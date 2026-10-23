/**
 * `bun scripts/style-greps.ts` (part of `bun run lint`): the shapes the
 * dashboard never writes, found by grep over apps/dashboard/src
 * (tracked and untracked files):
 *  - `transition-all`: every property the element ever changes would
 *    transition; a transition names its properties.
 *  - `filter` in a transition's property list (`transition-[…filter…]`,
 *    `transition: filter …`, `transition-property: …backdrop-filter`): a
 *    transitioned blur hangs WebKit's web process (specs/web/safari-blurs).
 *  - a class-keyed `has-[.x]`: a `:has()` keyed on a class restyles its
 *    element whenever any descendant's class changes; it is keyed on an
 *    attribute the child carries (`has-data-needs:`).
 *  - a pointer cursor set on an element (`cursor-pointer`, `cursor: pointer`
 *    outside design.css): design.css's one base rule gives every enabled
 *    button and `role="button"` the hand, as Tailwind v4's upgrade guide
 *    gives it (https://tailwindcss.com/docs/upgrade-guide, "Buttons use the
 *    default cursor").
 *  - a house `dur-*` class: it set only `transition-duration`, so Tailwind's
 *    own `transition-[…]` sorted after it reset the duration to the default
 *    through `--tw-duration`. A transition's duration is Tailwind's
 *    `duration-(--dur-*)` (https://tailwindcss.com/docs/transition-duration:
 *    "`transition-duration: var(<custom-property>)`"), which sets both.
 *  - `toast.error` or `toast.warning`: a failure is said on the surface it
 *    happened on, in the error formula, with its way out (RowFault, a
 *    pane's own line, the composer's), never in a toast that leaves on a
 *    timer (DESIGN.md, The Work Outlives Its Surface Rule). The one toast
 *    the dashboard keeps is a delete's Undo (config/undo.ts), on `toast(`.
 * Prints `file:line: text` under the rule each match breaks; exits 1 on any.
 */
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const RULES: {
  name: string;
  pattern: string;
  fixed?: boolean;
  exclude?: string;
}[] = [
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
  {
    name: "a pointer cursor is never set per element: design.css's base rule gives every enabled button the hand",
    pattern:
      "(^|[^-[:alnum:]])cursor-pointer([^-[:alnum:]]|$)|cursor[[:space:]]*:[[:space:]]*pointer",
    exclude: ":!apps/dashboard/src/design.css",
  },
  {
    name: "a dur-* class is banned: a transition's duration is duration-(--dur-*), which sets --tw-duration for a transition-[…] after it",
    pattern: "(^|[^-[:alnum:]])dur-[a-z]",
  },
  {
    name: "a failure is never a toast (DESIGN.md, The Work Outlives Its Surface Rule): say it where it happened, in the error formula, with its way out (RowFault, the pane's line, the composer's)",
    pattern: "(^|[^[:alnum:]_$])toast\\.(error|warning)([^[:alnum:]_$]|$)",
  },
];

const outs = await Promise.all(
  RULES.map((rule) =>
    Bun.$`git grep --untracked -n ${rule.fixed ? "-F" : "-E"} -e ${rule.pattern} -- apps/dashboard/src ${rule.exclude ? [rule.exclude] : []}`
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
    ? "style greps: no transition-all, no filter in a transition list, no has-[.class], no per-element pointer cursor, no dur-* class, no failure toast"
    : `style greps: ${found} match${found === 1 ? "" : "es"}`
);
process.exit(found === 0 ? 0 : 1);
