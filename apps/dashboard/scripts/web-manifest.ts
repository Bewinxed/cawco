/**
 * Writes the dashboard's web app manifest (static/manifest.webmanifest,
 * linked from app.html), which makes the board installable: a phone adds it
 * to its home screen as Caw&Co and opens it in its own window, with no
 * browser bars. No service worker and no push: an installed board is the
 * same page.
 *
 * - `start_url`, `scope` and `id` are `/`, which a browser resolves against
 *   the manifest's own URL (MDN, "start_url" and "scope"): the board opens on
 *   whichever host and port served it (localhost, cawco.local, a tailnet
 *   name), none written here.
 * - `theme_color` and `background_color` are the light scheme's bar and
 *   ground (surface-raised and surface-recess, the colours app.css gives
 *   `html` and `body`), read from theme.css as the cascade resolves them. A
 *   manifest holds one of each, so the dark scheme's are the page's own:
 *   ScreenEdges keeps `theme-color` on the bar as drawn, in either scheme.
 * - The icons are Caw's app icon, the native app's own art
 *   (apps/apple/CawCo/AppIcon.icon/Assets/caw.png, 1024 px), resampled into
 *   static/icons/: 192 and 512 full bleed for `any`, and the maskable pair
 *   with the art at 92% held on its bottom-left corner over the icon's own
 *   flat fill (spark), so the beak's tip stays inside the 80% circle every
 *   mask keeps (web.dev, "Adaptive icon support with maskable icons"). The
 *   180 px apple-touch-icon beside them is the same full-bleed art; iOS
 *   reads no maskable icon and masks the square itself.
 *
 *   bun run web-manifest
 *   bun scripts/web-manifest.ts --check   (part of `bun run check`: writes
 *     nothing, and fails when the committed manifest is not what the tokens
 *     make)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  clip,
  evaluatorOver,
} from "../../../scripts/codemods/lib/theme-measure";

// Read at run time beyond its imports; check.ts keys the check on them.
export const checkReads = [
  "apps/dashboard/src/lib/tokens/theme.css",
  "apps/dashboard/static/manifest.webmanifest",
];

const here = (path: string) => join(import.meta.dir, "..", path);
const OUT = here("static/manifest.webmanifest");

const ev = evaluatorOver(
  readFileSync(here("src/lib/tokens/theme.css"), "utf8")
);
/** A colour token in the light scheme, as six-digit hex: what every manifest parser reads. */
const lightHex = (token: string) =>
  clip(ev.colourOf(`color.${token}`, "base", token)).toString({
    format: "hex",
    collapse: false,
  });

const icon = (
  size: number,
  purpose: "any" | "maskable",
  file = purpose === "any" ? `icon-${size}` : `icon-maskable-${size}`
) => ({
  src: `/icons/${file}.png`,
  sizes: `${size}x${size}`,
  type: "image/png",
  purpose,
});

const manifest = {
  id: "/",
  name: "Caw&Co",
  short_name: "Caw&Co",
  start_url: "/",
  scope: "/",
  display: "standalone",
  theme_color: lightHex("surface-raised"),
  background_color: lightHex("surface-recess"),
  icons: [
    icon(192, "any"),
    icon(512, "any"),
    icon(192, "maskable"),
    icon(512, "maskable"),
  ],
};

const made = `${JSON.stringify(manifest, null, 2)}\n`;

if (process.argv.includes("--check")) {
  const committed = readFileSync(OUT, "utf8");
  if (committed !== made) {
    console.error(
      "apps/dashboard/static/manifest.webmanifest is not what the tokens make. Run `bun run web-manifest` in apps/dashboard. It should read:\n" +
        made
    );
    process.exit(1);
  }
} else {
  writeFileSync(OUT, made);
}
