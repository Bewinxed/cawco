/**
 * Writes `src/house-faces.json`: what each house face draws (house-faces.ts),
 * read from its files' own cmaps with fontkit, each file's characters kept
 * within its rule's `unicode-range`, which is what a browser takes from it.
 *
 *   bun scripts/house-faces.ts          write it
 *   bun scripts/house-faces.ts --check  fail when it is stale
 */
import { readFileSync, writeFileSync } from "node:fs";
import { create, type Font } from "fontkit";
import { formatText } from "../../../scripts/fmt";
import {
  type FaceRole,
  type HouseCoverage,
  readHouseFaces,
} from "../src/house-faces";

const OUT = new URL("../src/house-faces.json", import.meta.url).pathname;

/** `held` as inclusive pairs, ascending and apart. */
const pairsOf = (held: Set<number>): [number, number][] => {
  const ranges: [number, number][] = [];
  for (const point of [...held].sort((a, b) => a - b)) {
    const last = ranges.at(-1);
    if (last && last[1] === point - 1) {
      last[1] = point;
    } else {
      ranges.push([point, point]);
    }
  }
  return ranges;
};

const files = readHouseFaces();
const points: Record<FaceRole, Set<number>> = {
  sans: new Set(),
  mono: new Set(),
};
const families: Partial<Record<FaceRole, string>> = {};
const from: Record<string, string> = {};
for (const face of files) {
  const font = create(Buffer.from(face.bytes)) as Font;
  const inRange = (point: number) =>
    face.unicodeRange.some(([low, high]) => point >= low && point <= high);
  for (const point of font.characterSet) {
    if (inRange(point)) {
      points[face.role].add(point);
    }
  }
  families[face.role] = face.family;
  from[face.file] = face.version;
}

const coverage: HouseCoverage = {
  faces: {
    sans: { family: families.sans ?? "", ranges: pairsOf(points.sans) },
    mono: { family: families.mono ?? "", ranges: pairsOf(points.mono) },
  },
  from,
};
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
    `house faces: ${points.sans.size} characters in ${families.sans}, ${points.mono.size} in ${families.mono}, from ${Object.entries(
      from
    )
      .map(([file, version]) => `${file} ${version}`)
      .join(", ")}.`
  );
}
