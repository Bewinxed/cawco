/**
 * The house faces every CawCo web surface draws in (DESIGN.md: "Figtree for
 * the product, JetBrains Mono for code, paths and IDs", Nunito for the
 * wordmark): the dashboard, the canvas's chrome and every decision page, each
 * from the same files and the same rules. Their one source is the variable
 * file the Apple app ships (CawCoDesign's Resources/Fonts), so a page draws
 * every character the font holds, not only a web subset's. The Figtree file
 * is Google Fonts' `ofl/figtree/Figtree[wght].ttf` (2.002), the file
 * Fontsource cuts its latin and latin-ext subsets from; the JetBrains Mono
 * file is JetBrains' own `fonts/variable/JetBrainsMono[wght].ttf` (2.305);
 * the Nunito file is Nunito 3.602's latin cut (Fontsource's latin subset, as
 * a TTF). None is patched.
 *
 * - Each face is served as woff2 pieces cut from its file when a surface is
 *   built ({@link houseFaceSheet}): Google Fonts' latin range, its latin-ext
 *   range and everything else the face holds, each piece's `unicode-range`
 *   the code points it holds, so a page fetches only the pieces it draws and
 *   together they hold every character of the file and every glyph text
 *   reaches through the layout features the face keeps (all of Figtree's
 *   that a browser can apply; {@link HouseFace.leaves}). The cut is
 *   HarfBuzz's subsetter (subset-font 2.9.0, which keeps the `wght` axis),
 *   the compression Google's woff2 encoder (woff2-encoder 2.0.0), both
 *   WebAssembly.
 * - The decision host serves them on every preview origin (decision-host.ts),
 *   the stage host beside the canvas page (agent stage-host/build.ts), the
 *   dashboard from its own build (its vite.config.ts `houseFaces`).
 * - What each face draws is kept as data in `house-faces.json`, read from
 *   the pieces as served. `bun run faces` in packages/core writes it
 *   (scripts/house-faces.ts), holding the pieces to the whole file;
 *   `faces:check` says when it is stale.
 * - A program's words are drawn in the sans face, so {@link undrawn} reads
 *   them against its coverage; the hub refuses a program with a character
 *   it lacks (hub decision-program.ts).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import coverage from "./house-faces.json" with { type: "json" };

/** Which role a face plays: words, code, paths and IDs, or the wordmark. */
export type FaceRole = "sans" | "mono" | "wordmark";

/** A house face: its family as a page's CSS names it, its file and its weight axis. */
export interface HouseFace {
  family: string;
  /** Its file in {@link FONTS_DIR}. */
  file: string;
  /**
   * The layout features its pieces leave out, and with them any glyph only
   * they reach (the faces script counts them; the sans face may leave none).
   */
  leaves: readonly string[];
  role: FaceRole;
  /** Its `wght` axis as `font-weight` takes it, `300 900`; the faces script holds it to the file's own axis. */
  weight: string;
}

/**
 * `aalt` (Access All Alternates) is for a design app's glyph picker: no
 * browser applies it and CSS has no way to ask for it but
 * `font-feature-settings`, which no house stylesheet writes, and every
 * alternate it lists another feature reaches too.
 */
const PICKER_ONLY = ["aalt"] as const;

/** The faces, upright, each one variable file. */
export const HOUSE_FACES: readonly HouseFace[] = [
  {
    role: "sans",
    family: "Figtree Variable",
    file: "Figtree.ttf",
    weight: "300 900",
    leaves: PICKER_ONLY,
  },
  {
    role: "mono",
    family: "JetBrains Mono Variable",
    file: "JetBrainsMono.ttf",
    weight: "100 800",
    // Its character variants, stylistic sets, case forms and scientific
    // inferiors too: only `font-feature-settings` reaches them (no
    // `font-variant-*` value does), which no house stylesheet writes, and
    // they were 7 KB of the latin piece the dashboard's first paint carries
    // (Fontsource's cut left them out as well).
    leaves: [
      ...PICKER_ONLY,
      ...["case", "sinf"],
      ...["cv01", "cv02", "cv03", "cv04", "cv05", "cv06", "cv07", "cv08"],
      ...["cv09", "cv10", "cv11", "cv12", "cv14", "cv15", "cv16", "cv17"],
      ...["cv18", "cv19", "cv20", "cv99", "ss01", "ss02", "ss19", "ss20"],
    ],
  },
  {
    role: "wordmark",
    family: "Nunito Variable",
    file: "Nunito.ttf",
    weight: "200 1000",
    leaves: PICKER_ONLY,
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

/** Code points as `unicode-range` and the pieces read them: inclusive pairs. */
type Ranges = readonly (readonly [number, number])[];

/**
 * How each face is cut, in order: a code point goes to the first cut whose
 * range holds it. Latin and latin-ext are Google Fonts' ranges (the ones
 * Fontsource's subsets carry), so a page in English fetches one piece per
 * face, as it did from Fontsource; the last cut takes everything else. A
 * cut with `marks` also holds every combining mark the face does
 * ({@link isMark}); the latin piece, which the dashboard's first paint
 * carries, holds only the marks Google's range names.
 */
const CUTS: readonly { name: string; range: Ranges; marks: boolean }[] = [
  {
    name: "latin",
    marks: false,
    range: [
      [0x00_00, 0x00_ff],
      [0x01_31, 0x01_31],
      [0x01_52, 0x01_53],
      [0x02_bb, 0x02_bc],
      [0x02_c6, 0x02_c6],
      [0x02_da, 0x02_da],
      [0x02_dc, 0x02_dc],
      [0x03_04, 0x03_04],
      [0x03_08, 0x03_08],
      [0x03_29, 0x03_29],
      [0x20_00, 0x20_6f],
      [0x20_ac, 0x20_ac],
      [0x21_22, 0x21_22],
      [0x21_91, 0x21_91],
      [0x21_93, 0x21_93],
      [0x22_12, 0x22_12],
      [0x22_15, 0x22_15],
      [0xfe_ff, 0xfe_ff],
      [0xff_fd, 0xff_fd],
    ],
  },
  {
    name: "latin-ext",
    marks: true,
    range: [
      [0x01_00, 0x02_ba],
      [0x02_bd, 0x02_c5],
      [0x02_c7, 0x02_cc],
      [0x02_ce, 0x02_d7],
      [0x02_dd, 0x02_ff],
      [0x1d_00, 0x1d_bf],
      [0x1e_00, 0x1e_9f],
      [0x1e_f2, 0x1e_ff],
      [0x20_20, 0x20_20],
      [0x20_a0, 0x20_ab],
      [0x20_ad, 0x20_c0],
      [0x21_13, 0x21_13],
      [0x2c_60, 0x2c_7f],
      [0xa7_20, 0xa7_ff],
    ],
  },
  { name: "more", marks: true, range: [[0, 0x10_ff_ff]] },
];

/** Whether `ranges` hold `point`. */
const holds = (ranges: Ranges, point: number): boolean =>
  ranges.some(([from, to]) => point >= from && point <= to);

/** `points` as inclusive pairs, ascending and apart. */
export const pairsOf = (points: Iterable<number>): [number, number][] => {
  const ranges: [number, number][] = [];
  for (const point of [...new Set(points)].sort((a, b) => a - b)) {
    const last = ranges.at(-1);
    if (last && last[1] === point - 1) {
      last[1] = point;
    } else {
      ranges.push([point, point]);
    }
  }
  return ranges;
};

/**
 * The code points `font` draws, each once: its cmap's, less any that maps
 * to `.notdef` (a format 4 cmap's closing U+FFFF segment does).
 */
export const heldBy = (font: {
  characterSet: number[];
  hasGlyphForCodePoint: (point: number) => boolean;
}): number[] =>
  [...new Set(font.characterSet)].filter((point) =>
    font.hasGlyphForCodePoint(point)
  );

const MARK = /^\p{M}$/u;

/**
 * Whether `point` is a combining mark. A mark may stand in more than one
 * piece, as Google's latin and latin-ext ranges both hold U+0304, U+0308
 * and U+0329: a browser shapes a letter and its marks in the first piece
 * that holds them all, so a mark in a piece apart from its letter would
 * lose what the two make together (JetBrains Mono's IJ with an acute is
 * one glyph, reached only from both in one font).
 */
export const isMark = (point: number): boolean =>
  MARK.test(String.fromCodePoint(point));

/** One piece of a house face as a surface serves it. */
export interface FacePiece extends HouseFace {
  /** Its woff2 bytes. */
  bytes: Uint8Array<ArrayBuffer>;
  /** The cut it is: `latin`, `latin-ext` or `more`. */
  cut: string;
  /** Its file's name, its content's hash: `face-<hash>.woff2`, kept for good. */
  name: string;
  /** The code points it holds, its `unicode-range`. */
  range: [number, number][];
}

/**
 * Every face cut into its pieces (see {@link CUTS}), a piece per cut that
 * holds any of the face's code points. `glyphNames` keeps each glyph's name
 * in the pieces, for the faces script to hold their glyphs to the file's;
 * a surface serves them without.
 *
 * The tools are loaded here, never at the module's top: this module stands
 * in the hub's runtime (decision-program.ts reads {@link undrawn}), which
 * cuts nothing; the binary carries every surface's pieces prebuilt and
 * leaves the tools out (scripts/build-binary.ts `external`).
 */
export async function cutHouseFaces(
  options: { glyphNames?: boolean } = {}
): Promise<FacePiece[]> {
  const [{ create }, { default: subsetFont }, { compress }] = await Promise.all(
    [import("fontkit"), import("subset-font"), import("woff2-encoder")]
  );
  const pieces: FacePiece[] = [];
  for (const face of readHouseFaces()) {
    const file = Buffer.from(face.bytes);
    const font = create(file) as Parameters<typeof heldBy>[0] &
      Parameters<typeof featuresOf>[0];
    const held = heldBy(font);
    const keep = featuresOf(font).filter((tag) => !face.leaves.includes(tag));
    const marks = held.filter(isMark);
    const placed = new Set<number>();
    for (const { name: cut, range, marks: allMarks } of CUTS) {
      const own = held.filter(
        (point) => !(placed.has(point) || isMark(point)) && holds(range, point)
      );
      if (own.length === 0) {
        continue;
      }
      for (const point of own) {
        placed.add(point);
      }
      const points = [
        ...own,
        ...marks.filter((point) => allMarks || holds(range, point)),
      ];
      const sfnt = await subsetFont(
        file,
        String.fromCodePoint(...points),
        subsetOptions(keep, options.glyphNames ?? false)
      );
      // One at a time: woff2-encoder 2.0.0 can corrupt an output when two
      // compressions run at once (fixed in its 3.0 beta's notes).
      const bytes = new Uint8Array(await compress(sfnt));
      const hash = createHash("sha256").update(bytes).digest("hex");
      pieces.push({
        ...face,
        cut,
        range: pairsOf(points),
        bytes,
        name: `face-${hash.slice(0, 16)}.woff2`,
      });
    }
  }
  return pieces;
}

/** The layout features `font` has, GSUB's and GPOS's. */
export const featuresOf = (font: {
  GPOS?: { featureList: { tag: string }[] };
  GSUB?: { featureList: { tag: string }[] };
}): string[] => [
  ...new Set(
    [...(font.GSUB?.featureList ?? []), ...(font.GPOS?.featureList ?? [])].map(
      (feature) => feature.tag
    )
  ),
];

/**
 * HarfBuzz's subset options: the whole wght axis, the layout features
 * `keep` (subset-font's default keeps every one), and each glyph's name
 * when `glyphNames`. `keepFeatures` and `glyphNames` are subset-font's
 * options its types leave out.
 */
export const subsetOptions = (
  keep: readonly string[],
  glyphNames: boolean
): { targetFormat: "sfnt" } => {
  const options: {
    targetFormat: "sfnt";
    glyphNames: boolean;
    keepFeatures: string[];
  } = { targetFormat: "sfnt", glyphNames, keepFeatures: [...keep] };
  return options;
};

let served: Promise<FacePiece[]> | undefined;

/** The pieces every surface serves, cut once per process; a failure clears the slot so the next call retries. */
export const houseFacePieces = (): Promise<FacePiece[]> => {
  served ??= cutHouseFaces().catch((error: unknown) => {
    served = undefined;
    throw error;
  });
  return served;
};

/** Code point pairs as `unicode-range` writes them: `U+0-FF, U+131`. */
const unicodeRange = (ranges: [number, number][]): string =>
  ranges
    .map(([from, to]) => {
      const hex = (point: number) => point.toString(16).toUpperCase();
      return from === to ? `U+${hex(from)}` : `U+${hex(from)}-${hex(to)}`;
    })
    .join(", ");

/** A piece's `@font-face` rule, its file at `url`. */
export const faceRule = (piece: FacePiece, url: string): string =>
  `@font-face {
  font-family: '${piece.family}';
  font-style: normal;
  font-display: swap;
  font-weight: ${piece.weight};
  src: url(${url}) format('woff2');
  unicode-range: ${unicodeRange(piece.range)};
}`;

/**
 * The house faces as a surface serves them: a rule per piece, its file at
 * `<at><name>`, and each piece's file by its name.
 */
export async function houseFaceSheet(at: string): Promise<{
  css: string;
  files: [name: string, bytes: Uint8Array<ArrayBuffer>][];
}> {
  const pieces = await houseFacePieces();
  return {
    css: `${pieces.map((piece) => faceRule(piece, `${at}${piece.name}`)).join("\n")}\n`,
    files: pieces.map((piece) => [piece.name, piece.bytes]),
  };
}

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
          holds(
            COVERAGE.faces.sans.ranges as [number, number][],
            char.codePointAt(0) ?? 0
          )
        )
    )
  ),
];

/** A character as a person reads it in a fault: itself and its code point, `⎘ (U+2398)`. */
export const named = (char: string): string =>
  `${char} (U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")})`;
