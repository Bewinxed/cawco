/**
 * Every piece's captured bones (`bun run bones`, scripts/bones.ts), by the
 * piece's name: `<name>.bones.json` beside this file, and a list's empty
 * state, drawn where it last held no rows, as `<name>.empty.bones.json`.
 */

import type { PieceBones } from "./draw.js";

const files = import.meta.glob<PieceBones>("./*.bones.json", {
  eager: true,
  import: "default",
});

const pieces = new Map<string, PieceBones>(
  Object.entries(files).map(([path, bones]) => [
    path.slice("./".length, -".bones.json".length),
    bones,
  ])
);

/** The piece's bones; a name with no capture is a fault in the screen that names it. */
export function bonesOf(name: string): PieceBones {
  const bones = pieces.get(name);
  if (!bones) {
    throw new Error(
      `No bones are captured for "${name}": draw its fixture on /dev/bones and run \`bun run bones\``
    );
  }
  return bones;
}

/** A list's empty state's bones, where it has them. */
export function emptyBonesOf(name: string): PieceBones | undefined {
  return pieces.get(`${name}.empty`);
}
