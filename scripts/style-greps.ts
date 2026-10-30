/**
 * `bun scripts/style-greps.ts` (part of `bun run check`): the shapes the
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
 *  - an @keyframes (a stylesheet's, a `<style>`'s) that cuts (`clip-path`)
 *    and moves (`transform`, `translate`, `scale`, `rotate`): Chromium kills
 *    the renderer once a later move displaces such an effect
 *    (scripts/lint/design/clip-move.mjs, which holds scripts to the same).
 *    Read whole, not by line: a block spans lines.
 *  - a `kit-nest` list without `ps-(--nest-pad)`: a nested tree is inset by
 *    the house nesting pad, as SessionTree, WorkTabs and Sidebar write it;
 *    without it a child row stands flush with its parent. Read from each
 *    `class="…"` attribute whole, so it may span lines.
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
/** Each @keyframes in `text` that cuts and moves: its line and its head. */
const KEYFRAMES = /@(?:-webkit-)?keyframes\s+[^{]+\{/gu;
const CUT = /(?<![\w-])clip-path\s*:/u;
const MOVE = /(?<![\w-])(?:transform|translate|scale|rotate)\s*:/u;
function cutsAndMoves(text: string): { head: string; line: number }[] {
  const hits: { head: string; line: number }[] = [];
  for (const head of text.matchAll(KEYFRAMES)) {
    let depth = 1;
    let at = head.index + head[0].length;
    while (depth > 0 && at < text.length) {
      if (text[at] === "{") {
        depth += 1;
      } else if (text[at] === "}") {
        depth -= 1;
      }
      at += 1;
    }
    const body = text.slice(head.index + head[0].length, at);
    if (CUT.test(body) && MOVE.test(body)) {
      hits.push({
        head: head[0].slice(0, -1).trim(),
        line: text.slice(0, head.index).split("\n").length,
      });
    }
  }
  return hits;
}
const styled = (
  await Bun.$`git ls-files -co --exclude-standard -- apps/dashboard/src`
    .cwd(ROOT)
    .quiet()
    .text()
)
  .split("\n")
  .filter((file) => file.endsWith(".css") || file.endsWith(".svelte"));
const keyframeHits = (
  await Promise.all(
    styled.map(async (file) =>
      cutsAndMoves(await Bun.file(resolve(ROOT, file)).text()).map(
        (hit) => `${file}:${hit.line}: ${hit.head}`
      )
    )
  )
).flat();

/** Each class attribute in `text` naming kit-nest without the house inset. */
const CLASS_ATTR = /\bclass="([^"]*)"/gu;
const SPACES = /\s+/u;
function flushNests(text: string): number[] {
  const lines: number[] = [];
  for (const attr of text.matchAll(CLASS_ATTR)) {
    const names = (attr[1] as string).split(SPACES);
    if (names.includes("kit-nest") && !names.includes("ps-(--nest-pad)")) {
      lines.push(text.slice(0, attr.index).split("\n").length);
    }
  }
  return lines;
}
const nestHits = (
  await Promise.all(
    styled
      .filter((file) => file.endsWith(".svelte"))
      .map(async (file) =>
        flushNests(await Bun.file(resolve(ROOT, file)).text()).map(
          (line) => `${file}:${line}`
        )
      )
  )
).flat();

let found = 0;
if (nestHits.length > 0) {
  found += nestHits.length;
  console.log(
    `a kit-nest list is inset by the house nesting pad: give it ps-(--nest-pad) (SessionTree's classes):\n${nestHits.map((hit) => `  ${hit}`).join("\n")}`
  );
}
if (keyframeHits.length > 0) {
  found += keyframeHits.length;
  console.log(
    `an @keyframes never cuts (clip-path) and moves (transform, translate, scale, rotate) at once: animate the cut as its own effect on the same timing:\n${keyframeHits.map((hit) => `  ${hit}`).join("\n")}`
  );
}
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
    ? "style greps: no transition-all, no filter in a transition list, no has-[.class], no per-element pointer cursor, no dur-* class, no failure toast, no @keyframes that cuts and moves, no kit-nest without ps-(--nest-pad)"
    : `style greps: ${found} match${found === 1 ? "" : "es"}`
);
process.exit(found === 0 ? 0 : 1);
