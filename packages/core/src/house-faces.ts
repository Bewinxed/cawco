/**
 * The house faces every decision page draws in (DESIGN.md: "Figtree for the
 * product, JetBrains Mono for code, paths and IDs"), each served whole: the
 * variable file the Apple app ships (CawCoDesign's Resources/Fonts), so a
 * page draws every character the font holds, not only a web subset's. The
 * Figtree file is Google Fonts' `ofl/figtree/Figtree[wght].ttf` (2.002),
 * the file Fontsource cuts its latin and latin-ext subsets from; the
 * JetBrains Mono file is JetBrains' own `fonts/variable/JetBrainsMono[wght].ttf`
 * (2.305). Neither is patched.
 *
 * - The decision host serves them on every preview origin (decision-host.ts):
 *   `faces.css`, a rule per face ({@link faceRule}) pointing at its file
 *   under a name of its content's hash. A program's page links it; an HTML
 *   page's `{{KIT_CSS}}` imports it (hub decision-page.ts).
 * - What each face draws is kept as data in `house-faces.json`: each file's
 *   own cmap (fontkit). `bun run faces` in packages/core writes it
 *   (scripts/house-faces.ts); `faces:check` says when it is stale.
 * - A program's words are drawn in the sans face, so {@link undrawn} reads
 *   them against its coverage; the hub refuses a program with a character
 *   it lacks (hub decision-program.ts).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import coverage from "./house-faces.json" with { type: "json" };

/** Which role a face plays: words, or code, paths and IDs. */
export type FaceRole = "sans" | "mono";

/** A house face: its family as a page's CSS names it, its file and its weight axis. */
export interface HouseFace {
  family: string;
  /** Its file in {@link FONTS_DIR}. */
  file: string;
  role: FaceRole;
  /** Its `wght` axis as `font-weight` takes it, `300 900`; the faces script holds it to the file's own axis. */
  weight: string;
}

/** The faces, upright, each one variable file. */
export const HOUSE_FACES: readonly HouseFace[] = [
  {
    role: "sans",
    family: "Figtree Variable",
    file: "Figtree.ttf",
    weight: "300 900",
  },
  {
    role: "mono",
    family: "JetBrains Mono Variable",
    file: "JetBrainsMono.ttf",
    weight: "100 800",
  },
];

/** Where the faces' files are kept: the Apple app's, the one copy in the repository. */
export const FONTS_DIR = new URL(
  "../../../apps/apple/Packages/CawCoKit/Sources/CawCoDesign/Resources/Fonts/",
  import.meta.url
).pathname;

/** One house face with its file's bytes. */
export interface FaceFile extends HouseFace {
  bytes: Uint8Array<ArrayBuffer>;
}

/** Every face of {@link HOUSE_FACES} with its file; throws when a file is missing, so a move fails the build that reads it. */
export const readHouseFaces = (): FaceFile[] =>
  HOUSE_FACES.map((face) => ({
    ...face,
    bytes: new Uint8Array(readFileSync(join(FONTS_DIR, face.file))),
  }));

/** A face's `@font-face` rule, its file at `url`: the whole file, no `unicode-range`. */
export const faceRule = (face: HouseFace, url: string): string =>
  `@font-face {
  font-family: '${face.family}';
  font-style: normal;
  font-display: swap;
  font-weight: ${face.weight};
  src: url(${url}) format('truetype');
}`;

/** What one face draws, as the data file keeps it. */
export interface FaceCoverage {
  family: string;
  /** Inclusive code point pairs, ascending and apart. */
  ranges: number[][];
}

/** The data file's shape: each face's coverage by role, and each file's own version string. */
export interface HouseCoverage {
  faces: Record<FaceRole, FaceCoverage>;
  from: Record<string, string>;
}

const COVERAGE: HouseCoverage = coverage;

/** Whether `ranges` hold `point`. */
const holds = (ranges: number[][], point: number): boolean =>
  ranges.some(([from = 0, to = -1]) => point >= from && point <= to);

/** Line breaks and tabs, which lay out rather than draw, and code points a browser draws nothing for (Unicode's Default_Ignorable_Code_Point: a joiner, a variation selector). */
const LAYOUT_ONLY = /[\t\n\r]|\p{Default_Ignorable_Code_Point}/u;

/** The sans face's family name, as a page's CSS names it. */
export const SANS_FAMILY = COVERAGE.faces.sans.family;

/** The characters of `text` the sans face can't draw, each once, in the order they first stand. */
export const undrawn = (text: string): string[] => [
  ...new Set(
    [...text].filter(
      (char) =>
        !(
          LAYOUT_ONLY.test(char) ||
          holds(COVERAGE.faces.sans.ranges, char.codePointAt(0) ?? 0)
        )
    )
  ),
];

/** A character as a person reads it in a fault: itself and its code point, `⎘ (U+2398)`. */
export const named = (char: string): string =>
  `${char} (U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")})`;
