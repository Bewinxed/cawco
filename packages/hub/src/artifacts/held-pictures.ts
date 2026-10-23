/**
 * The page's pictures of the person's marks (core `MarkPictures`), held for
 * the Send that carries them: on disk, under the artifact's own folder, one
 * PNG per mark (a pin's id or a stroke group's) and the page's address
 * beside them. Each post is written, synced, before the page hears it was
 * held, so a hub restart between the marking and the Send keeps them, and
 * the delivery reads them from here.
 */
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { MarkPictures } from "@cawco/core/comments";
import { writeStateFileSync } from "@cawco/core/state-file";

/** The page's address the marks were made at, beside their pictures. */
const ADDRESS = "address.txt";
const PNG = ".png";

export interface HeldPictures {
  /** Artifact `id`'s marks' pictures and their page's address, now gone from disk. */
  drop: (id: string) => void;
  /** A post's pictures and address, on disk; a later picture of a mark replaces its earlier one. */
  hold: (id: string, body: MarkPictures) => void;
  /** Mark `mark`'s picture, let go once it went or its mark is gone. */
  letGo: (id: string, mark: string) => void;
  /** The marks of artifact `id` with a picture held. */
  marks: (id: string) => string[];
  /** Mark `mark`'s picture as base64 PNG; null when none is held. */
  picture: (id: string, mark: string) => string | null;
  /** The page's address its marks were last made at; undefined when none was said. */
  url: (id: string) => string | undefined;
}

/** The held pictures of every artifact under `root` (the artifacts' folder). */
export function heldPictures(root: string): HeldPictures {
  const folder = (id: string) => join(root, id, "marks");
  // A mark's id is the page's (overlay sync.ts bounds its length): its file name is it, escaped.
  const file = (id: string, mark: string) =>
    join(folder(id), `${encodeURIComponent(mark)}${PNG}`);
  const marks = (id: string): string[] => {
    try {
      return readdirSync(folder(id))
        .filter((name) => name.endsWith(PNG))
        .map((name) => decodeURIComponent(name.slice(0, -PNG.length)));
    } catch {
      return [];
    }
  };
  return {
    drop: (id) => rmSync(folder(id), { recursive: true, force: true }),
    hold: (id, body) => {
      for (const picture of body.pictures) {
        writeStateFileSync(
          file(id, picture.mark),
          Buffer.from(picture.png, "base64")
        );
      }
      if (body.url) {
        writeStateFileSync(join(folder(id), ADDRESS), body.url);
      }
    },
    letGo: (id, mark) => rmSync(file(id, mark), { force: true }),
    marks,
    picture: (id, mark) => {
      try {
        return readFileSync(file(id, mark)).toString("base64");
      } catch {
        return null;
      }
    },
    url: (id) => {
      const at = join(folder(id), ADDRESS);
      return existsSync(at) ? readFileSync(at, "utf8") || undefined : undefined;
    },
  };
}
