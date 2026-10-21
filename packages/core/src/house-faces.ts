/**
 * The house faces every decision page draws in (DESIGN.md: "Figtree for the
 * product, JetBrains Mono for code, paths and IDs"), from the dashboard's
 * own font packages: each package's latin and latin-ext files, with the
 * `@font-face` rule the package writes for each.
 *
 * - The decision host serves them on every preview origin (decision-host.ts):
 *   `faces.css`, those rules pointing at each file under a name of its
 *   content's hash. A program's page links it; an HTML page's `{{KIT_CSS}}`
 *   imports it (hub decision-page.ts).
 * - What each face draws is kept as data in `house-faces.json`: each file's
 *   own cmap (fontkit) within its rule's `unicode-range`, which is what a
 *   browser takes from that file. `bun run faces` in packages/core writes it
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

/** A house face: its package and the files of it a page loads. */
export interface HouseFace {
  files: readonly string[];
  package: string;
  role: FaceRole;
}

/** The faces and their files: the latin and latin-ext subsets, upright, the variable weight axis. */
export const HOUSE_FACES: readonly HouseFace[] = [
  {
    role: "sans",
    package: "@fontsource-variable/figtree",
    files: [
      "figtree-latin-wght-normal.woff2",
      "figtree-latin-ext-wght-normal.woff2",
    ],
  },
  {
    role: "mono",
    package: "@fontsource-variable/jetbrains-mono",
    files: [
      "jetbrains-mono-latin-wght-normal.woff2",
      "jetbrains-mono-latin-ext-wght-normal.woff2",
    ],
  },
];

/** The dashboard, whose dependencies the font packages are. */
const DASHBOARD_DIR = new URL("../../../apps/dashboard/", import.meta.url)
  .pathname;

const RULE = /@font-face\s*\{[^}]*\}/g;
const FILE = /url\(\.\/files\/([^)]+)\)/;
const FAMILY = /font-family:\s*'([^']+)'/;
const RANGE = /unicode-range:\s*([^;]+);/;
const CODE_POINT = /^U\+/i;
const HEX = /^[0-9a-f]+$/i;

/** One file of a house face, as its package ships it. */
export interface FaceFile {
  bytes: Uint8Array<ArrayBuffer>;
  family: string;
  file: string;
  role: FaceRole;
  /** The package's `@font-face` rule for it, its `src` as the package writes it (`./files/<file>`). */
  rule: string;
  /** Its rule's `unicode-range`, as inclusive code point pairs. */
  unicodeRange: [number, number][];
  version: string;
}

/** A `unicode-range` value as inclusive code point pairs: `U+0131`, `U+0000-00FF`. */
const rangesOf = (value: string): [number, number][] =>
  value.split(",").map((part) => {
    const [from, to = from] = part.trim().replace(CODE_POINT, "").split("-");
    if (!(from && HEX.test(from) && HEX.test(to))) {
      throw new Error(`house faces: a unicode-range part reads "${part}"`);
    }
    return [Number.parseInt(from, 16), Number.parseInt(to, 16)];
  });

/**
 * Every file of {@link HOUSE_FACES}, read from the dashboard's installed
 * packages; throws when a package lacks a file or its rule, so a package
 * update that renames one fails the build that reads it.
 */
export const readHouseFaces = (): FaceFile[] =>
  HOUSE_FACES.flatMap((face) => {
    const root = join(
      Bun.resolveSync(`${face.package}/package.json`, DASHBOARD_DIR),
      ".."
    );
    const { version } = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8")
    ) as { version: string };
    const rules = new Map(
      [...readFileSync(join(root, "index.css"), "utf8").matchAll(RULE)].map(
        ([rule]) => [FILE.exec(rule)?.[1] ?? "", rule]
      )
    );
    return face.files.map((file) => {
      const rule = rules.get(file);
      const family = rule && FAMILY.exec(rule)?.[1];
      const range = rule && RANGE.exec(rule)?.[1];
      if (!(rule && family && range)) {
        throw new Error(
          `house faces: ${face.package} ${version} has no @font-face rule with a family and a unicode-range for ${file}`
        );
      }
      return {
        role: face.role,
        family,
        file,
        rule,
        version,
        unicodeRange: rangesOf(range),
        bytes: new Uint8Array(readFileSync(join(root, "files", file))),
      };
    });
  });

/** What one face draws, as the data file keeps it. */
export interface FaceCoverage {
  family: string;
  /** Inclusive code point pairs, ascending and apart. */
  ranges: number[][];
}

/** The data file's shape: each face's coverage by role, and the packages it was read from. */
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
