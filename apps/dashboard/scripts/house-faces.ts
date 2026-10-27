/**
 * The house faces as every CawCo web surface serves them (core
 * house-faces.ts): each face's woff2 pieces, cut from the repository's own
 * Figtree, JetBrains Mono and Nunito, and a rule per piece, written into
 * `src/house-faces/` (git-ignored), which app.css imports as `faces.css`.
 * Written only where a file differs, so a dev server's restart reloads
 * nothing.
 *
 * The dashboard inlines its first paint's faces into its stylesheet
 * (vite.config.ts `houseFaces` says why), so each face's latin piece is split
 * (core `firstPaintPieces`): a `first` piece of the characters the
 * dashboard's own text draws in that face, inlined, and the rest of latin
 * by URL, which a page fetches only when it draws one of them (a transcript
 * in French). The text is read here, from the product's words
 * (`packages/core/src/words`) and every source file of the dashboard, never
 * listed by hand, so a new word's character is in the next build's piece:
 * - the sans and mono faces: printable ASCII and every character those files
 *   hold (code and paths are set in mono, words in sans);
 * - the wordmark face: the text of each element the dashboard sets in it
 *   (`font-wordmark`), and a space, which `document.fonts.load` asks for
 *   (app.html).
 *
 * Vite writes them as it starts (vite.config.ts `houseFaces`). Whatever
 * reads app.css without Vite (lint's Tailwind design-system checks:
 * specificity-trap, role-order) needs them first, so
 * `bun apps/dashboard/scripts/house-faces.ts` writes them, first in
 * `bun run check`: a fresh checkout has none.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  type FacePiece,
  type FirstPaintText,
  firstPaintPieces,
  houseFaceSheet,
} from "@cawco/core/house-faces";

export const FACES_DIR = join(import.meta.dirname, "../src/house-faces");

const SOURCE = join(import.meta.dirname, "../src");
const WORDS = join(import.meta.dirname, "../../../packages/core/src/words");
const TEXT_FILE = /\.(?:svelte|ts|html)$/u;
/** Printable ASCII: every word and path is mostly made of it. */
const ASCII = String.fromCharCode(
  ...Array.from({ length: 0x7f - 0x20 }, (_, at) => 0x20 + at)
);
/** An element set in the wordmark face, and the text it holds. */
const WORDMARK = /class="[^"]*\bfont-wordmark\b[^"]*"[^>]*>([^<]*)</gu;
const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
};
const ENTITY = /&(?:amp|lt|gt|quot);/gu;

/** Every source file under `dir`, the faces' own folder aside. */
const sourcesIn = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        TEXT_FILE.test(entry.name) &&
        !entry.parentPath.startsWith(FACES_DIR)
    )
    .map((entry) => join(entry.parentPath, entry.name));

/** The characters the dashboard's first paint may draw in each face, read from its sources. */
const firstPaintText = (): FirstPaintText => {
  const texts = [...sourcesIn(WORDS), ...sourcesIn(SOURCE)].map((file) =>
    readFileSync(file, "utf8")
  );
  const every = [...new Set([...ASCII, ...texts.join("")])].join("");
  const wordmark = texts.flatMap((text) =>
    [...text.matchAll(WORDMARK)].map(([, inner = ""]) =>
      inner.replace(ENTITY, (entity) => ENTITIES[entity] ?? entity)
    )
  );
  return { sans: every, mono: every, wordmark: ` ${wordmark.join("")}` };
};

/** Writes the faces' sheet and pieces into {@link FACES_DIR}, removing what it no longer holds; answers the pieces. */
export async function writeHouseFaces(): Promise<FacePiece[]> {
  const pieces = await firstPaintPieces(firstPaintText());
  const { css, files } = await houseFaceSheet("./", pieces);
  mkdirSync(FACES_DIR, { recursive: true });
  const wanted = new Map<string, string | Uint8Array>([
    ["faces.css", css],
    ...files,
  ]);
  for (const name of readdirSync(FACES_DIR)) {
    if (!wanted.has(name)) {
      rmSync(join(FACES_DIR, name));
    }
  }
  for (const [name, body] of wanted) {
    const path = join(FACES_DIR, name);
    const bytes = typeof body === "string" ? Buffer.from(body) : body;
    if (!(existsSync(path) && readFileSync(path).equals(bytes))) {
      writeFileSync(path, bytes);
    }
  }
  return pieces;
}

if (import.meta.main) {
  const pieces = await writeHouseFaces();
  console.log(
    `house faces: faces.css and ${pieces.length} piece(s) in src/house-faces`
  );
}
