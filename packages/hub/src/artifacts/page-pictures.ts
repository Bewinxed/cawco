/**
 * The sizes of a decision page's pictures, as the hub serves the page
 * (service.ts `programServed`, preview.ts `servePage`): each file the page
 * keeps under `files/` (decision-program.ts `buildProgram`), by its address
 * beside the page, at its own pixels as it draws (image-size, an EXIF
 * quarter turn taken as a browser takes it) and the scale it records (core
 * picture-scale.ts). The host reserves each picture's box from it before
 * the picture loads, and draws it at the size of the screen it was taken
 * on (Image.svelte). Read as the page is served, so a page built before
 * pictures carried their size has them too. A file no reader knows is left
 * out, and the page says it didn't load.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { PictureSize } from "@cawco/core/decisions-library";
import { pngScale } from "@cawco/core/picture-scale";
import { imageSize } from "image-size";

/** EXIF orientations that turn a picture a quarter (5 to 8): it draws its height across. */
const QUARTER_TURNS = new Set([5, 6, 7, 8]);

/** `bytes`'s size as it draws and the scale it records; null when no reader knows it. */
const pictureSize = (bytes: Uint8Array): PictureSize | null => {
  let size: ReturnType<typeof imageSize>;
  try {
    size = imageSize(bytes);
  } catch {
    return null;
  }
  const turned = QUARTER_TURNS.has(size.orientation ?? 1);
  return {
    width: turned ? size.height : size.width,
    height: turned ? size.width : size.height,
    scale: pngScale(bytes),
  };
};

/** Each file read, by its path, its size and when it was written: a page served again reads none of them again. */
const read = new Map<
  string,
  { mtimeMs: number; bytes: number; size: PictureSize | null }
>();

/** The pictures under `folder`'s `files/` (an artifact's), by their addresses beside its page. */
export const pagePictures = (folder: string): Record<string, PictureSize> => {
  const dir = join(folder, "files");
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return {};
  }
  const sizes: Record<string, PictureSize> = {};
  for (const name of names) {
    const path = join(dir, name);
    const stat = statSync(path, { throwIfNoEntry: false });
    if (!stat?.isFile()) {
      continue;
    }
    let kept = read.get(path);
    if (!(kept?.mtimeMs === stat.mtimeMs && kept.bytes === stat.size)) {
      kept = {
        mtimeMs: stat.mtimeMs,
        bytes: stat.size,
        size: pictureSize(readFileSync(path)),
      };
      read.set(path, kept);
    }
    if (kept.size) {
      sizes[`files/${name}`] = kept.size;
    }
  }
  return sizes;
};
