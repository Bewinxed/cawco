/**
 * The overlay's Solar duotone glyphs, read from the Solar set when the
 * overlay is bundled (a Bun macro: `import … with { type: "macro" }`), so
 * the bundle carries the five bodies it draws and nothing else of the set.
 */
import { readFileSync } from "node:fs";
import { z } from "zod";

const NAMES = {
  pen: "pen-bold-duotone",
  pin: "pin-bold-duotone",
  comment: "chat-round-bold-duotone",
  gallery: "gallery-bold-duotone",
  eraser: "eraser-bold-duotone",
} as const;

export type GlyphName = keyof typeof NAMES;

export function solarGlyphs(): Record<GlyphName, string> {
  const set = z
    .object({ icons: z.record(z.string(), z.object({ body: z.string() })) })
    .parse(
      JSON.parse(
        readFileSync(
          Bun.resolveSync("@iconify-json/solar/icons.json", import.meta.dir),
          "utf8"
        )
      )
    );
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
