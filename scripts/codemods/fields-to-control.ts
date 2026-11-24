/**
 * Moves every hand-drawn field onto the control surface (theme.css `control`
 * and `control-field`; owner's pick, 2026-11-23: one surface, no control
 * writes its own edge, fill or states). A field drawn by hand is marked by
 * the retired `field-edge` utility: in each class string that holds it, the
 * classes the surface now owns (its border, ground, shadow, transition and
 * invalid edge) go, and `control control-field` stands in their place.
 *
 *   bun scripts/codemods/fields-to-control.ts          (writes)
 *   bun scripts/codemods/fields-to-control.ts --dry    (counts only)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { Glob } from "bun";

const OWNED = new Set([
  "field-edge",
  "border",
  "bg-bg",
  "shadow-sm",
  "transition-control",
  "aria-invalid:border-red",
  "dark:aria-invalid:border-red/50",
]);
const STRING = /(["'`])((?:(?!\1)[^\\\n]|\\.)*)\1/gu;
const SPACE = /\s+/u;
const dry = process.argv.includes("--dry");

let strings = 0;
let files = 0;
for (const path of new Glob("apps/dashboard/src/**/*.svelte").scanSync(".")) {
  const before = readFileSync(path, "utf8");
  const after = before.replace(STRING, (whole, quote: string, body: string) => {
    const classes = body.split(SPACE).filter(Boolean);
    if (!classes.includes("field-edge")) {
      return whole;
    }
    strings += 1;
    const kept = classes.filter((one) => !OWNED.has(one));
    return `${quote}${["control", "control-field", ...kept].join(" ")}${quote}`;
  });
  if (after !== before) {
    files += 1;
    if (!dry) {
      writeFileSync(path, after);
    }
  }
}
console.log(
  `fields-to-control: ${strings} class strings in ${files} files${dry ? " (dry)" : ""}`
);
