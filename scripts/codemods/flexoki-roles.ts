/**
 * Moves every use of the old colour roles onto Flexoki's model (owner's pick,
 * 2026-11-23: "flexoki without the yellowish base color", Caw coral kept as
 * the one brand colour, no tinted fills). Eight neutral base roles (bg, bg-2,
 * ui, ui-2, ui-3, tx-3, tx-2, tx), Flexoki's eight inks by hue, and coral.
 *
 * A role is matched where a utility or a custom property names it: after a
 * hyphen (`text-ink-muted`, `--color-ink-muted`), so a word in prose or a
 * quoted label is left alone. A variant of the same name (`status-done:`,
 * `group-status-done/chip:`) and the coral hover utility
 * (`bg-accent-surface-hover`) are names of their own and stay. The tinted fills (`*-bg`, `accent-wash`) go to
 * the secondary ground before their inks are renamed.
 *
 *   bun scripts/codemods/flexoki-roles.ts          (writes)
 *   bun scripts/codemods/flexoki-roles.ts --dry    (counts only)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { Glob } from "bun";

/** Old role, then new, in the order they are applied: longest names first. */
const MAP: [string, string][] = [
  ["status-live-bg", "bg-2"],
  ["status-attn-bg", "bg-2"],
  ["status-done-bg", "bg-2"],
  ["status-fail-bg", "bg-2"],
  ["accent-wash", "ui"],
  ["accent-ink", "accent"],
  ["surface-page", "bg"],
  ["surface-raised", "bg"],
  ["surface-recess", "bg-2"],
  ["surface-sunk", "bg-2"],
  ["surface-hover", "ui"],
  ["surface-pressed", "ui-2"],
  ["ink-strong", "tx"],
  ["ink-muted", "tx-2"],
  ["ink-subtle", "tx-2"],
  ["border-hairline", "ui"],
  ["border-control", "ui-2"],
  ["border-strong", "tx-2"],
  ["status-live", "cyan"],
  ["status-attn", "orange"],
  ["status-done", "green"],
  ["status-fail", "red"],
  ["mark-1", "orange"],
  ["mark-2", "yellow"],
  ["mark-3", "green"],
  ["mark-4", "cyan"],
  ["mark-5", "blue"],
  ["mark-6", "purple"],
  ["mark-7", "magenta"],
];

const ROOTS = [
  "apps/dashboard/src",
  "packages",
  "site/src",
  "design",
  "scripts",
];
const SKIP =
  /node_modules|\/dist\/|\.generated\.|\/tokens\/theme\.css$|codemods\//u;
const dry = process.argv.includes("--dry");

const patterns = MAP.map(
  ([from, to]) =>
    [
      new RegExp(`(?<=-)(?<!accent-)${from}(?![\\w-]|:|/[\\w-]+:)`, "gu"),
      to,
      from,
    ] as const
);

let files = 0;
let edits = 0;
for (const root of ROOTS) {
  for (const path of new Glob(
    `${root}/**/*.{svelte,ts,tsx,css,html,md,mjs}`
  ).scanSync(".")) {
    if (SKIP.test(path)) {
      continue;
    }
    const before = readFileSync(path, "utf8");
    let text = before;
    for (const [pattern, to] of patterns) {
      text = text.replace(pattern, () => {
        edits += 1;
        return to;
      });
    }
    if (text !== before) {
      files += 1;
      if (!dry) {
        writeFileSync(path, text);
      }
    }
  }
}
console.log(
  `flexoki-roles: ${edits} uses in ${files} files${dry ? " (dry)" : ""}`
);
