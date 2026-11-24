/**
 * Moves every use of the eight hue-named inks onto roles (owner's pick,
 * 2026-11-24: two layers, after Emil Kowalski's post on primitives and
 * semantic tokens). theme.css holds the palette's raw steps outside @theme
 * and the roles in it; a component names a role, never a hue.
 *
 * - A status: red is `danger` (a failure, an error, a destructive act),
 *   orange `caution` (it needs you, it asks, it warns), green `success`
 *   (done), cyan `live` (working).
 * - A hue that marks a thing, picked for it and saved with it (an account's,
 *   a project column's, a section tile's, a chart series', a stage guide's):
 *   `label-<hue>`. Yellow, blue, purple and magenta are never a status, so
 *   they are always a label.
 *
 * A use is a label where its line names a hue (`hue=`, `hue:`, `HUE`), where
 * it is an entry of a list of hues (a line that is only the quoted token),
 * where its file holds nothing but marks (WHOLE), or where a file's own hue
 * is decorative (BY_FILE). Everything else on the four status hues is its
 * status. The tokens matched are as flexoki-roles.ts matched them: after a
 * hyphen (`text-red`, `--color-red`), never a variant (`status-red:`) or a
 * longer name (`--red-47`, the palette's).
 *
 *   bun scripts/codemods/ink-roles.ts          (writes)
 *   bun scripts/codemods/ink-roles.ts --dry    (counts only)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { Glob } from "bun";

type Hue =
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "cyan"
  | "blue"
  | "purple"
  | "magenta";

const STATUS: Partial<Record<Hue, string>> = {
  red: "danger",
  orange: "caution",
  green: "success",
  cyan: "live",
};
const HUES: Hue[] = [
  "red",
  "orange",
  "yellow",
  "green",
  "cyan",
  "blue",
  "purple",
  "magenta",
];

/** Files that hold nothing but marks: every hue in them is a label. */
const WHOLE = [
  "lib/cawco/tasks/stage-look.ts",
  "lib/cawco/project/new-project.ts",
  "lib/components/ui/machine-row/index.ts",
  "lib/components/ui/machine-row/machine-row.stories.ts",
  "lib/components/ui/section-header/section-header.stories.ts",
  "lib/cawco/config/models/ImageDefault.stories.ts",
  "lib/cawco/address/Confetti.svelte",
  "lib/cawco/graph/ClipBar.svelte",
  "lib/cawco/graph/MoveFace.svelte",
  "lib/components/features/tool-cards/descriptors.ts",
  "routes/(app)/motion/chosen-hover/+page.svelte",
  "routes/(app)/motion/breath-floor/+page.svelte",
  "routes/(app)/motion/echo/+page.svelte",
  "lib/cawco/spawn/glide-popover-frame.svelte",
  "lib/cawco/spawn/LifetimeChip.svelte",
  "lib/cawco/spawn/ContextChip.svelte",
  "lib/cawco/connect/ways.ts",
];

/** A file's own decorative hues (a folder glyph, a stage guide), and one status kept. */
const BY_FILE: Record<string, Partial<Record<Hue, string>>> = {
  "lib/cawco/spawn/LocationChip.svelte": { orange: "label-orange" },
  "lib/cawco/spawn/ProjectChip.svelte": { orange: "label-orange" },
  "lib/cawco/spawn/ToolChips.svelte": { orange: "label-orange" },
  "lib/cawco/spawn/LocationSection.svelte": { orange: "label-orange" },
  "lib/cawco/spawn/NewSessionForm.svelte": {
    orange: "label-orange",
    cyan: "label-cyan",
  },
  "lib/cawco/graph/StagePane.svelte": { green: "label-green" },
  "packages/agent/src/stage-host/canvas/page-style.ts": {
    cyan: "label-cyan",
    green: "label-green",
    orange: "label-orange",
  },
  "packages/agent/src/canvas-host/canvas.css": { green: "label-green" },
  "packages/agent/src/canvas-host/changes.tsx": { green: "label-green" },
  "packages/preview/src/overlay/changes.ts": { green: "label-green" },
  "packages/preview/src/overlay/page.ts": { green: "label-green" },
  // A risky permission mode's tile: it warns.
  "lib/cawco/spawn/permission-look.ts": { orange: "caution" },
};

const ROOTS = ["apps/dashboard/src", "packages", "site/src", "scripts"];
const SKIP =
  /node_modules|\/dist\/|\.generated\.|\/tokens\/theme\.css$|\/tokens\/libraries\.css$|design-board\/Colour\.svelte$|codemods\//u;
const MARKS = /\bhue\b|\bHUES?\b|SWATCH/u;
/** A line that is only a quoted colour token: an entry of a list of hues. */
const LIST_ENTRY = /^\s*["'`]var\(--color-[a-z]+\)["'`],?\s*$/u;
const DASHBOARD_SRC = /^apps\/dashboard\/src\//u;
const dry = process.argv.includes("--dry");

/** A matched name as its hue: the pattern matches only HUES' names. */
const toHue = (name: string): Hue => {
  const hue = HUES.find((each) => each === name);
  if (hue === undefined) {
    throw new Error(`ink-roles: ${name} is not a hue`);
  }
  return hue;
};

const pattern = new RegExp(
  `(?<=-)(${HUES.join("|")})(?![\\w-]|:|/[\\w-]+:)`,
  "gu"
);

/** The path below the dashboard's src, or the repository's, to key the tables on. */
const keyOf = (path: string) => path.replace(DASHBOARD_SRC, "");

const roleOf = (path: string, line: string, hue: Hue): string => {
  const key = keyOf(path);
  const own = BY_FILE[key]?.[hue];
  if (own) {
    return own;
  }
  const status = STATUS[hue];
  if (
    status === undefined ||
    WHOLE.includes(key) ||
    MARKS.test(line) ||
    LIST_ENTRY.test(line)
  ) {
    return `label-${hue}`;
  }
  return status;
};

let files = 0;
let edits = 0;
const tally = new Map<string, number>();
for (const root of ROOTS) {
  for (const path of new Glob(
    `${root}/**/*.{svelte,ts,tsx,css,html,mjs}`
  ).scanSync(".")) {
    if (SKIP.test(path)) {
      continue;
    }
    const before = readFileSync(path, "utf8");
    const text = before
      .split("\n")
      .map((line) =>
        line.replace(pattern, (hue) => {
          const role = roleOf(path, line, toHue(hue));
          edits += 1;
          tally.set(
            `${hue} → ${role}`,
            (tally.get(`${hue} → ${role}`) ?? 0) + 1
          );
          return role;
        })
      )
      .join("\n");
    if (text !== before) {
      files += 1;
      if (!dry) {
        writeFileSync(path, text);
      }
    }
  }
}
for (const [move, count] of [...tally].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${count}\t${move}`);
}
console.log(`ink-roles: ${edits} uses in ${files} files${dry ? " (dry)" : ""}`);
