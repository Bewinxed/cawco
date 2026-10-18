/**
 * The house faces (DESIGN.md's type: Figtree for words, JetBrains Mono for
 * ids and numbers) for the host page, from the dashboard's own font
 * packages: each package's @font-face rules for its latin and latin-ext
 * subsets, as the package writes them, each face's file bundled beside the
 * host (core decision-host.ts, a file of its own at a hashed name) so it
 * loads from the page's origin, by unicode-range, and is kept for good.
 */

import figtreeLatinExt from "@fontsource-variable/figtree/files/figtree-latin-ext-wght-normal.woff2";
import figtreeLatin from "@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2";
import figtreeCss from "@fontsource-variable/figtree/index.css" with { type: "text" };
import monoLatinExt from "@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-ext-wght-normal.woff2";
import monoLatin from "@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2";
import monoCss from "@fontsource-variable/jetbrains-mono/index.css" with { type: "text" };

/** Each face's file by its name in the package, to its address beside the host. */
const FILES: Record<string, string> = {
  "figtree-latin-wght-normal.woff2": String(figtreeLatin),
  "figtree-latin-ext-wght-normal.woff2": String(figtreeLatinExt),
  "jetbrains-mono-latin-wght-normal.woff2": String(monoLatin),
  "jetbrains-mono-latin-ext-wght-normal.woff2": String(monoLatinExt),
};

const RULE = /@font-face\s*\{[^}]*\}/g;
const FILE = /url\(\.\/files\/([^)]+)\)/;

/** A package's rules for the faces in {@link FILES}, each pointing at its bundled file. */
const keptFaces = (css: unknown): string[] =>
  [...String(css).matchAll(RULE)].flatMap(([rule]) => {
    const file = FILE.exec(rule)?.[1];
    const at = file ? FILES[file] : undefined;
    return at ? [rule.replace(FILE, `url(${at})`)] : [];
  });

/** The faces' rules, for a style element of the page's. */
export const FACES = [...keptFaces(figtreeCss), ...keptFaces(monoCss)].join(
  "\n"
);
