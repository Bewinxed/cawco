/**
 * The `fs` verb (NEW.md §6): directory listings for the cwd picker and small
 * text reads/writes for editing a repo's markdown. Deliberately not a file
 * transfer — anything bigger belongs in a session, not in this tunnel.
 */

import { lstat, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join, resolve } from "node:path";
import type { FsEntry, FsImage, FsPayload } from "@cawco/core";

/**
 * `~` is the shell's, not a path: anything handed a literal `~` — a spawn's
 * working directory, a probe for a binary an installer left in a home
 * directory — is pointed at somewhere that does not exist.
 */
export const expandHome = (path: string): string => {
  if (path === "~") {
    return homedir();
  }
  return path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
};

/** A read past this is a file transfer, which this verb is not for. */
const MAX_READ_BYTES = 512 * 1024;

/**
 * CawCo is a single-user tool on a trusted network (NEW.md §6), so this is a
 * guard against a mistyped path reaching kernel and system state, not an
 * attacker: the whole rest of the machine is deliberately reachable.
 */
const FORBIDDEN_ROOTS = ["/proc", "/sys", "/etc"];

/** Resolves traversal first — `/home/x/../../etc/shadow` is `/etc/shadow`. */
const safePath = (path: string): string => {
  if (!path.startsWith("/")) {
    throw new Error(`fs paths must be absolute, got ${path}`);
  }
  const resolved = resolve(path);
  if (
    FORBIDDEN_ROOTS.some(
      (root) => resolved === root || resolved.startsWith(`${root}/`)
    )
  ) {
    throw new Error(`${resolved} is off limits`);
  }
  return resolved;
};

const list = async (path: string): Promise<FsEntry[]> => {
  const names = await readdir(path);
  const entries = await Promise.all(
    names.map(async (name): Promise<FsEntry> => {
      const stat = await lstat(join(path, name));
      return {
        name,
        kind: stat.isDirectory() ? "dir" : "file",
        size: stat.isDirectory() ? 0 : stat.size,
      };
    })
  );
  return entries.sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === "dir" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
};

const read = async (path: string): Promise<string> => {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`${path} does not exist`);
  }
  if (file.size > MAX_READ_BYTES) {
    throw new Error(
      `${path} is ${file.size} bytes; fs read stops at ${MAX_READ_BYTES}`
    );
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  // A NUL byte means this is not text, and shipping it as a string would only
  // hand the browser mojibake to render.
  if (bytes.includes(0)) {
    throw new Error(`${path} is a binary file`);
  }
  return new TextDecoder().decode(bytes);
};

/**
 * A picture is the one file the tunnel does carry whole: a screenshot an agent
 * took, or a render it wants looked at, is worth nothing as a path. Bigger
 * than this and it is not something to glance at in a transcript.
 */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/**
 * By extension, not by sniffing — a `.png` that is not one just fails to
 * render. No SVG: opened as a document it is script on the dashboard's origin.
 */
const IMAGE_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
};

const image = async (path: string): Promise<FsImage> => {
  const mediaType = IMAGE_TYPES[extname(path).toLowerCase()];
  if (!mediaType) {
    throw new Error(`${path} is not an image`);
  }
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`${path} does not exist`);
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(
      `${path} is ${file.size} bytes; fs image stops at ${MAX_IMAGE_BYTES}`
    );
  }
  return {
    mediaType,
    base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
  };
};

export const runFs = async ({
  op,
  path,
  content,
}: FsPayload): Promise<unknown> => {
  const target = safePath(expandHome(path));
  switch (op) {
    case "list":
      return await list(target);
    case "read":
      return await read(target);
    case "write":
      return { bytes: await Bun.write(target, content ?? "") };
    case "image":
      return await image(target);
    default:
      throw new Error(`unknown fs op: ${op}`);
  }
};
