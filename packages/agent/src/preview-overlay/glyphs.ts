/**
 * The overlay's Solar duotone glyphs, read from the Solar set when the
 * overlay is bundled (a Bun macro: `import … with { type: "macro" }`), so
 * the bundle carries the five bodies it draws and nothing else of the set.
 */
import { readFileSync } from "node:fs";

const NAMES = {
  pen: "pen-bold-duotone",
  pin: "pin-bold-duotone",
  comment: "chat-round-dots-bold-duotone",
  gallery: "gallery-bold-duotone",
  eraser: "eraser-bold-duotone",
} as const;

export type GlyphName = keyof typeof NAMES;

export function solarGlyphs(): Record<GlyphName, string> {
  const set = JSON.parse(
    readFileSync(
      Bun.resolveSync("@iconify-json/solar/icons.json", import.meta.dir),
      "utf8"
    )
  ) as { icons: Record<string, { body: string }> };
  return Object.fromEntries(
    Object.entries(NAMES).map(([name, icon]) => {
      const found = set.icons[icon];
      if (!found) {
        throw new Error(`Solar has no ${icon}`);
      }
      return [name, found.body];
    })
  ) as Record<GlyphName, string>;
}
