/**
 * Writes `src/house-faces.json`: what each house face draws (house-faces.ts),
 * read with fontkit from the woff2 pieces every surface serves, which is
 * what a browser takes from them, with each file's own version string.
 * Fails when the pieces don't hold the whole file: a code point of the file
 * in no piece, one other than a combining mark in two, a piece whose
 * `unicode-range` is not what it holds, a piece without the face's `wght`
 * axis, or a glyph text can reach in the whole file (HarfBuzz's closure of
 * every code point it holds, through every layout feature the face keeps:
 * all of Figtree's) that no piece holds; and when a face's declared weight
 * range is not its file's.
 *
 *   bun scripts/house-faces.ts          write it
 *   bun scripts/house-faces.ts --check  fail when it is stale
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one face at a time, each held to its own file
import { readFileSync, writeFileSync } from "node:fs";
import { create, type Font } from "fontkit";
import subsetFont from "subset-font";
import { formatText, formattedAlike } from "../../../scripts/fmt";
import {
  cutHouseFaces,
  type FaceCoverage,
  type FacePiece,
  type FaceRole,
  featuresOf,
  type HouseCoverage,
  heldBy,
  houseFacePieces,
  isMark,
  pairsOf,
  readHouseFaces,
  subsetOptions,
} from "../src/house-faces";

const OUT = new URL("../src/house-faces.json", import.meta.url).pathname;

const fail = (line: string): never => {
  console.error(`house faces: ${line}`);
  process.exit(1);
};

const fontOf = (bytes: Uint8Array): Font => create(Buffer.from(bytes)) as Font;

/** Each glyph's name in `font`. */
const glyphNames = (font: Font): Set<string> => {
  const names = new Set<string>();
  for (let id = 0; id < font.numGlyphs; id += 1) {
    names.add(font.getGlyph(id).name);
  }
  return names;
};

const axisOf = (font: Font): string => {
  const axis = font.variationAxes.wght;
  return axis ? `${axis.min} ${axis.max}` : "missing";
};

const piecesOf = (pieces: FacePiece[], file: string) =>
  pieces.filter((piece) => piece.file === file);

const [served, named] = await Promise.all([
  houseFacePieces(),
  cutHouseFaces({ glyphNames: true }),
]);

const faces: Partial<Record<FaceRole, FaceCoverage>> = {};
const from: Record<string, string> = {};
const sizes: string[] = [];
for (const face of readHouseFaces()) {
  const whole = fontOf(face.bytes);
  if (axisOf(whole) !== face.weight) {
    fail(
      `${face.file}'s wght axis is ${axisOf(whole)}, not the ${face.weight} house-faces.ts gives it.`
    );
  }
  const drawn = new Map<number, string>();
  const pieces = piecesOf(served, face.file);
  for (const piece of pieces) {
    const font = fontOf(piece.bytes);
    if (axisOf(font) !== face.weight) {
      fail(
        `${face.file}'s ${piece.cut} piece has wght ${axisOf(font)}, not ${face.weight}.`
      );
    }
    const held = heldBy(font);
    if (JSON.stringify(pairsOf(held)) !== JSON.stringify(piece.range)) {
      fail(
        `${face.file}'s ${piece.cut} piece holds other code points than its unicode-range names.`
      );
    }
    for (const point of held) {
      const twice = drawn.get(point);
      if (twice && !isMark(point)) {
        fail(
          `U+${point.toString(16)} stands in ${face.file}'s ${twice} and ${piece.cut} pieces.`
        );
      }
      drawn.set(point, twice ?? piece.cut);
    }
  }
  const missing = heldBy(whole).filter((point) => !drawn.has(point));
  if (missing.length > 0) {
    fail(
      `${face.file}'s pieces leave out ${missing.map((point) => `U+${point.toString(16)}`).join(", ")}.`
    );
  }
  // The same cut with each glyph's name kept, against the whole file cut
  // as one: every glyph text reaches in the file through the features the
  // face keeps stands in a piece, the alternates those features reach
  // included. A glyph nothing reaches (Figtree's `.null`) stands in neither.
  const glyphs = new Set(
    piecesOf(named, face.file).flatMap((piece) => [
      ...glyphNames(fontOf(piece.bytes)),
    ])
  );
  const reachedWith = async (keep: string[]) =>
    glyphNames(
      fontOf(
        await subsetFont(
          Buffer.from(face.bytes),
          String.fromCodePoint(...heldBy(whole)),
          subsetOptions(keep, true)
        )
      )
    );
  // @types/fontkit leaves out the layout tables fontkit reads.
  const every = featuresOf(whole as Parameters<typeof featuresOf>[0]);
  const reached = await reachedWith(
    every.filter((tag) => !face.leaves.includes(tag))
  );
  const dropped = [...reached].filter((name) => !glyphs.has(name));
  if (dropped.length > 0) {
    fail(
      `${face.file}'s pieces leave out ${dropped.length} glyphs text reaches: ${dropped.join(", ")}.`
    );
  }
  // What the features it leaves out reach alone; the sans face, whose
  // coverage decides what a decision page may say, leaves out none.
  const onlyLeft = [...(await reachedWith(every))].filter(
    (name) => !reached.has(name)
  );
  if (face.role === "sans" && onlyLeft.length > 0) {
    fail(
      `${face.file} leaves out ${face.leaves.join(", ")}, and with them ${onlyLeft.join(", ")}; the sans face keeps every glyph.`
    );
  }
  faces[face.role] = { family: face.family, ranges: pairsOf(drawn.keys()) };
  // The name table's version string, "Version 2.002" (@types/fontkit says a number).
  from[face.file] = String(whole.version);
  sizes.push(
    `${drawn.size} code points and ${reached.size} of ${whole.numGlyphs} glyphs in ${face.family}, ${onlyLeft.length} reached only by ${face.leaves.length} features it leaves out (${pieces
      .map((piece) => `${piece.cut} ${piece.bytes.length} B`)
      .join(", ")})`
  );
}
const { sans, mono, wordmark } = faces;
if (!(sans && mono && wordmark)) {
  throw new Error("house faces: a sans, a mono and a wordmark face, each once");
}

const coverage: HouseCoverage = { faces: { sans, mono, wordmark }, from };
// Formatted as the repository's formatter writes it; the check formats the committed file alike.
const text = await formatText(OUT, `${JSON.stringify(coverage)}\n`);

if (process.argv.includes("--check")) {
  const kept = (() => {
    try {
      return readFileSync(OUT, "utf8");
    } catch {
      return "";
    }
  })();
  if (!(await formattedAlike(OUT, kept, text))) {
    fail(
      "src/house-faces.json is stale; run `bun run faces` in packages/core."
    );
  }
  console.log(
    `house faces: src/house-faces.json is current; ${sizes.join("; ")}.`
  );
} else {
  writeFileSync(OUT, text);
  console.log(
    `house faces: ${sizes.join("; ")}, from ${Object.entries(from)
      .map(([file, version]) => `${file} ${version}`)
      .join(", ")}.`
  );
}
