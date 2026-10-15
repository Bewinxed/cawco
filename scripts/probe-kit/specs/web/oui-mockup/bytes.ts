/**
 * The binary files a made-up shop's design holds, as the mockup probes
 * write them into its folder (web/oui-mockup.ts by the folder's write,
 * folder-bytes.ts by Caw's folder_write): a font and a photo, each its own
 * bytes, so what the hub serves back can be compared byte for byte.
 */
import { join } from "node:path";
import { PNG } from "pngjs";
import { ROOT } from "../../../kit";

/** A font the dashboard ships, given to the made-up shop under a name of its own. */
export const FONT = join(
  ROOT,
  "apps/dashboard/node_modules/@fontsource/fredoka/files/fredoka-latin-400-normal.woff2"
);

/** A small photo: what the shop keeps as `design/assets/catch.png`. */
export const photo = (): Buffer => {
  const png = new PNG({ width: 24, height: 16 });
  for (let at = 0; at < png.data.length; at += 4) {
    const pixel = at / 4;
    png.data[at] = 30 + (pixel % 24) * 8;
    png.data[at + 1] = 120;
    png.data[at + 2] = 150;
    png.data[at + 3] = 255;
  }
  return PNG.sync.write(png);
};
