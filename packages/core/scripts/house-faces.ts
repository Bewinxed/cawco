/**
 * Writes `src/house-faces.json`: what each house face draws (house-faces.ts),
 * read from its whole file's own cmap with fontkit, which is what a browser
 * takes from it, with the file's own version string. Fails when a face's
 * declared weight range is not its file's `wght` axis.
 *
 *   bun scripts/house-faces.ts          write it
 *   bun scripts/house-faces.ts --check  fail when it is stale
 */
import { readFileSync, writeFileSync } from "node:fs";
import { create, type Font } from "fontkit";
import { formatText } from "../../../scripts/fmt";
import {
  type FaceCoverage,
  type FaceRole,
  type HouseCoverage,
  readHouseFaces,
} from "../src/house-faces";

const OUT = new URL("../src/house-faces.json", import.meta.url).pathname;

/** `held` as inclusive pairs, ascending and apart. */
const pairsOf = (held: Iterable<number>): [number, number][] => {
  const ranges: [number, number][] = [];
  for (const point of [...new Set(held)].sort((a, b) => a - b)) {
    const last = ranges.at(-1);
    if (last && last[1] === point - 1) {
      last[1] = point;
    } else {
      ranges.push([point, point]);
    }
  }
  return ranges;
};

const faces: Partial<Record<FaceRole, FaceCoverage>> = {};
const from: Record<string, string> = {};
const sizes: string[] = [];
for (const face of readHouseFaces()) {
  const font = create(Buffer.from(face.bytes)) as Font;
  const axis = font.variationAxes.wght;
  if (!axis || `${axis.min} ${axis.max}` !== face.weight) {
    console.error(
      `house faces: ${face.file}'s wght axis is ${axis ? `${axis.min} ${axis.max}` : "missing"}, not the ${face.weight} house-faces.ts gives it.`
    );
    process.exit(1);
  }
  faces[face.role] = {
    family: face.family,
    ranges: pairsOf(font.characterSet),
  };
  // The name table's version string, "Version 2.002" (@types/fontkit says a number).
  from[face.file] = String(font.version);
  sizes.push(`${new Set(font.characterSet).size} in ${face.family}`);
}
const { sans, mono } = faces;
if (!(sans && mono)) {
  throw new Error("house faces: a sans and a mono face, each once");
}

const coverage: HouseCoverage = { faces: { sans, mono }, from };
// Formatted as the repository's formatter writes it, so the check compares bytes.
const text = await formatText(OUT, `${JSON.stringify(coverage)}\n`);

if (process.argv.includes("--check")) {
  const kept = (() => {
    try {
      return readFileSync(OUT, "utf8");
    } catch {
      return "";
    }
  })();
  if (kept !== text) {
    console.error(
      "house faces: src/house-faces.json is stale; run `bun run faces` in packages/core."
    );
    process.exit(1);
  }
  console.log("house faces: src/house-faces.json is current.");
} else {
  writeFileSync(OUT, text);
  console.log(
    `house faces: ${sizes.join(", ")}, from ${Object.entries(from)
      .map(([file, version]) => `${file} ${version}`)
      .join(", ")}.`
  );
}
