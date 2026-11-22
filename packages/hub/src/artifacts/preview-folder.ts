/**
 * A folder preview's files as the hub keeps them (core preview/protocol.ts
 * `PreviewSource` `dir`): read off the agent's machine at its create and at
 * each `artifact_update` with a `dir` (design-files.ts), written under its
 * artifact's folder (`ARTIFACTS_ROOT/<id>/folder/`) in place, each file
 * only when its bytes changed (design-folder.ts `writeFolderInPlace`), and
 * served from there by the hub's preview server, as they are, on the
 * artifact's own origin (preview-server/serve.ts `serveFolder`). They
 * outlive the agent's folder: a delegate's scratch dir and its workspace's
 * clone go when its item ends, and the preview stays (the owner's pick on
 * 2026-11-20, "one way of serving": no copy of it is frozen, and an update
 * reaches the open panel, which loads again).
 */
import { join, posix } from "node:path";
import { dataUrlBytes, deskCaptures } from "@cawco/core/captures";
import type { FolderWeight } from "@cawco/core/preview/protocol";
import type { FolderLimits } from "./design-files";
import type { DesignFile } from "./design-folder";

/** The folder a folder preview's files stand in, under its artifact's own. */
const PREVIEW_FOLDER = "folder";

/** Where folder preview `id`'s files stand under artifacts root `root`. */
export const previewFolderOf = (root: string, id: string): string =>
  join(root, id, PREVIEW_FOLDER);

/**
 * The most a folder preview holds, ours: a page or a built app with the
 * scripts, styles, fonts and pictures it loads, never a project's tree. The
 * hub reads every byte of it off the agent's machine and keeps it.
 */
export const FOLDER_LIMITS: FolderLimits = {
  bytes: 256 * 1024 * 1024,
  files: 10_000,
};

const QUERY_OR_HASH = /[?#]/u;
const LEADING_SLASHES = /^\/+/u;
/** A source on another origin or scheme: no file of the folder. */
const ELSEWHERE = /^[a-z][a-z0-9+.-]*:|^\/\//iu;
const JS_FILE = /\.[cm]?js$/u;
const WASM_FILE = /\.wasm$/u;

/**
 * The file a request for `pathname` is answered with, by its path from the
 * folder: the file itself, or a folder's index.html for a path that ends
 * at one (`/`, `/docs/`). Query and hash left off.
 */
export const folderFileAt = (pathname: string): string => {
  const at = pathname.split(QUERY_OR_HASH)[0] ?? "/";
  return (at.endsWith("/") ? `${at}index.html` : at).replace(
    LEADING_SLASHES,
    ""
  );
};

/** Why `files` can't be a folder preview that opens at `path`, one sentence the agent acts on; null when they can. */
export const folderProblem = (
  files: readonly DesignFile[],
  path: string | undefined
): string | null => {
  const start = folderFileAt(path ?? "/");
  return files.some((one) => one.path === start)
    ? null
    : `${start} isn't in dir: the preview opens at ${path ?? "/"}, so dir holds that page${path === undefined ? " at its top" : ""}.`;
};

/**
 * What folder preview `files` load at most, and the desk captures on their
 * start page at `path` (core `deskCaptures`): each `<img>` a `data:` URL or
 * a file of the folder, read from its header.
 */
export const folderWeight = async (
  files: readonly DesignFile[],
  path: string | undefined
): Promise<FolderWeight> => {
  const byPath = new Map(files.map((one) => [one.path, one.bytes]));
  const start = folderFileAt(path ?? "/");
  const page = byPath.get(start);
  const captures =
    page === undefined
      ? 0
      : await deskCaptures(new TextDecoder().decode(page), (src) => {
          const inline = dataUrlBytes(src);
          if (inline || ELSEWHERE.test(src)) {
            return inline;
          }
          const file = src.split(QUERY_OR_HASH)[0] ?? "";
          const at = file.startsWith("/")
            ? posix.normalize(file).replace(LEADING_SLASHES, "")
            : posix.normalize(posix.join(posix.dirname(start), file));
          return byPath.get(at) ?? null;
        });
  const weight: FolderWeight = { files: 0, bytes: 0, js: 0, wasm: 0, captures };
  for (const { path: name, bytes } of files) {
    weight.files += 1;
    weight.bytes += bytes.byteLength;
    if (JS_FILE.test(name)) {
      weight.js += bytes.byteLength;
    } else if (WASM_FILE.test(name)) {
      weight.wasm += bytes.byteLength;
    }
  }
  return weight;
};
