/**
 * The `fs` verb (NEW.md §6): directory listings for the cwd picker and small
 * text reads/writes for editing a repo's markdown. Deliberately not a file
 * transfer — anything bigger belongs in a session, not in this tunnel.
 */

import { lstat, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join, resolve } from "node:path";
import type { FsEntry, FsMedia, FsPayload } from "@cawco/core";
import { MEDIA_LIMIT_BYTES } from "@cawco/core";
import { promptWrite, promptWriteReason } from "./prompt-writes";

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
 * By extension, not by sniffing — a `.png` that is not one just fails to
 * render. No SVG: opened as a document it is script on the dashboard's origin.
 * A picture or a video is the one file the tunnel does carry whole: a
 * screenshot or a screen recording an agent made is worth nothing as a path.
 */
const MEDIA_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
};

const megabytes = (bytes: number): string =>
  `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const media = async (path: string): Promise<FsMedia> => {
  const mediaType = MEDIA_TYPES[extname(path).toLowerCase()];
  if (!mediaType) {
    throw new Error(
      `${path} is not an image or video (${Object.keys(MEDIA_TYPES).join(", ")})`
    );
  }
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`${path} does not exist`);
  }
  if (file.size > MEDIA_LIMIT_BYTES) {
    throw new Error(
      `${path} is ${megabytes(file.size)}; the Telegram Bot API takes files up to ${megabytes(MEDIA_LIMIT_BYTES)}`
    );
  }
  return {
    mediaType,
    base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
  };
};

/** Reconnect sync resends definitions; identical bytes neither write nor invalidate. */
const write = async (
  path: string,
  content: string
): Promise<{ bytes: number }> => {
  const next = Buffer.from(content);
  const file = Bun.file(path);
  if (
    (await file.exists()) &&
    Buffer.from(await file.arrayBuffer()).equals(next)
  ) {
    return { bytes: next.byteLength };
  }
  const reason = promptWriteReason(path);
  const mutate = async () => ({ bytes: await Bun.write(path, next) });
  return reason ? await promptWrite(reason, mutate) : await mutate();
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
      return await write(target, content ?? "");
    case "media":
      return await media(target);
    default:
      throw new Error(`unknown fs op: ${op}`);
  }
};
