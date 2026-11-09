/**
 * An artifact's files under the artifacts' root (`ARTIFACTS_ROOT/<id>/`): a
 * page's HTML (`index.html`), a decision page's program (decision-program.ts
 * `PROGRAM_FILE`) and the pictures it shows (`files/`), a canvas's or a
 * delivered page's latest picture, a page's or preview's thumbnails. The
 * artifact service reads and writes that folder through this alone; a
 * canvas's screen posts its picture through sync.ts `artifactPicture`.
 */
import { cpSync, existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { parseRecord, writeStateFileSync } from "@cawco/core/state-file";
import { ArtifactThumbnailSchema } from "@cawco/core/stored-shapes";
import {
  type BuiltProgram,
  keptImagePaths,
  PROGRAM_FILE,
} from "../decision-program";
import { bytesHash } from "./page-changes";
import { pagePictures } from "./page-pictures";
import type { PageWas } from "./shapes";

/** Where a canvas's latest picture is kept: its folder under the artifacts' root. */
export const picturePath = (root: string, artifactId: string): string =>
  join(root, artifactId, "picture.png");

/** Where a page's or preview's latest thumbnail is kept: a PNG per scheme and `thumbnail.json` naming them. */
const thumbnailPath = (
  root: string,
  artifactId: string,
  part: "light" | "dark" | "json"
): string =>
  join(
    root,
    artifactId,
    part === "json" ? "thumbnail.json" : `thumbnail-${part}.png`
  );

/** The files of every artifact under `root`, by artifact id. */
export const createPageStore = (root: string) => {
  const folder = (id: string) => join(root, id);
  return {
    /** A page's HTML; thrown when it has none. */
    html: (id: string): string =>
      readFileSync(join(folder(id), "index.html"), "utf8"),

    /** A page's HTML as bytes; thrown when it has none. */
    htmlBytes: (id: string): Buffer =>
      readFileSync(join(folder(id), "index.html")),

    /** Whether the artifact has a page's HTML. */
    hasHtml: (id: string): boolean =>
      existsSync(join(folder(id), "index.html")),

    /** A decision page's program as the hub keeps it; undefined when it keeps none. */
    program: (id: string): string | undefined => {
      const file = join(folder(id), PROGRAM_FILE);
      return existsSync(file) ? readFileSync(file, "utf8") : undefined;
    },

    /** A page's files as they stand before a revision writes the next: its HTML and a decision page's program; null before its first. */
    revision: (id: string): PageWas | null => {
      const html = join(folder(id), "index.html");
      if (!existsSync(html)) {
        return null;
      }
      const program = join(folder(id), PROGRAM_FILE);
      // Each picture's file by its address, fingerprinted: what tells one drawn again.
      const files = new Map<string, string>();
      const pictures = join(folder(id), "files");
      if (existsSync(pictures)) {
        for (const name of readdirSync(pictures)) {
          files.set(
            `files/${name}`,
            bytesHash(readFileSync(join(pictures, name)))
          );
        }
      }
      return {
        html: readFileSync(html, "utf8"),
        files,
        ...(existsSync(program)
          ? { program: readFileSync(program, "utf8") }
          : {}),
      };
    },

    /**
     * A page's revision written: its HTML, and a decision page's program and
     * the pictures it shows; a page's files are its revision's alone, so
     * what the last revision kept goes first.
     */
    write: (id: string, html: string, program?: BuiltProgram) => {
      rmSync(join(folder(id), "files"), { recursive: true, force: true });
      rmSync(join(folder(id), PROGRAM_FILE), { force: true });
      writeStateFileSync(join(folder(id), "index.html"), html);
      if (program) {
        writeStateFileSync(join(folder(id), PROGRAM_FILE), program.program);
        for (const file of program.files) {
          writeStateFileSync(join(folder(id), file.path), file.bytes);
        }
      }
    },

    /** The pictures decision page `id` shows, by the name each Image of its kept program `program` gives. */
    shownPictures: (id: string, program: string): Map<string, Uint8Array> => {
      const shown = new Map<string, Uint8Array>();
      for (const [name, path] of keptImagePaths(program)) {
        const file = join(folder(id), path);
        if (existsSync(file)) {
          shown.set(name, new Uint8Array(readFileSync(file)));
        }
      }
      return shown;
    },

    /** The sizes of the pictures a page shows (page-pictures.ts). */
    pictures: (id: string) => pagePictures(folder(id)),

    /** A held next version's files: a copy of `from`'s, when it has any. */
    copy: (from: string, to: string) => {
      if (existsSync(folder(from))) {
        cpSync(folder(from), folder(to), { recursive: true });
      }
    },

    /** A promoted version's files over its artifact's, when it has any: a page's files are its revision's alone (`write`). */
    takeVersion: (version: string, id: string) => {
      if (existsSync(folder(version))) {
        rmSync(join(folder(id), "files"), { recursive: true, force: true });
        rmSync(join(folder(id), PROGRAM_FILE), { force: true });
        cpSync(folder(version), folder(id), { recursive: true, force: true });
      }
    },

    /** Every file of the artifact, gone. */
    remove: (id: string) => {
      rmSync(folder(id), { recursive: true, force: true });
    },

    /** The artifact's latest picture's bytes; thrown when it has none. */
    picture: (id: string): Buffer => readFileSync(picturePath(root, id)),

    /** Keeps `bytes` as the artifact's latest picture. */
    keepPicture: (id: string, bytes: Buffer) => {
      writeStateFileSync(picturePath(root, id), bytes);
    },

    /** A page's or preview's thumbnail record (`thumbnail.json`); thrown when it has none or it is not one. */
    thumbnailRecord: (id: string) => {
      const file = thumbnailPath(root, id, "json");
      return parseRecord(
        file,
        readFileSync(file, "utf8"),
        ArtifactThumbnailSchema
      );
    },

    /** A thumbnail's picture in `part`; thrown when it has none. */
    thumbnail: (id: string, part: "light" | "dark"): Buffer =>
      readFileSync(thumbnailPath(root, id, part)),

    /** Keeps one part of a thumbnail. */
    keepThumbnail: (
      id: string,
      part: "light" | "dark" | "json",
      bytes: Uint8Array | string
    ) => {
      writeStateFileSync(thumbnailPath(root, id, part), bytes);
    },

    /** A thumbnail's dark picture, gone. */
    dropDark: (id: string) => {
      rmSync(thumbnailPath(root, id, "dark"), { force: true });
    },
  };
};
