/**
 * The house faces as every CawCo web surface serves them (core
 * house-faces.ts): each face's woff2 pieces, cut from the repository's own
 * Figtree, JetBrains Mono and Nunito, and a rule per piece, written into
 * `src/house-faces/` (git-ignored), which app.css imports as `faces.css`.
 * Written only where a file differs, so a dev server's restart reloads
 * nothing.
 *
 * Vite writes them as it starts (vite.config.ts `houseFaces`). Whatever
 * reads app.css without Vite (lint's Tailwind design-system checks:
 * specificity-trap, class-collision, role-order) needs them first, so
 * `bun apps/dashboard/scripts/house-faces.ts` writes them, first in
 * `bun run lint`: a fresh checkout has none.
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
  houseFacePieces,
  houseFaceSheet,
} from "@cawco/core/house-faces";

export const FACES_DIR = join(import.meta.dirname, "../src/house-faces");

/** Writes the faces' sheet and pieces into {@link FACES_DIR}, removing what it no longer holds; answers the pieces. */
export async function writeHouseFaces(): Promise<FacePiece[]> {
  const [{ css, files }, pieces] = await Promise.all([
    houseFaceSheet("./"),
    houseFacePieces(),
  ]);
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
