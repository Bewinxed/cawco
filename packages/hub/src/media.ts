/**
 * Images leave the hub as references, never as bytes inside a transcript.
 *
 * A session that takes screenshots carries them as base64 image blocks, and a
 * 160-message tail of one such session was 5MB of JSON — 91% of it image data
 * the reader had not asked to see. Every tab opened, parsed and held all of it.
 *
 * So everything the hub relays to a dashboard passes through
 * {@link externalizeImages}: each base64 image block is written once to a
 * content-addressed file beside the database and replaced with the API's own
 * URL source shape, `{ type: "url", url, media_type }`. The browser fetches
 * the bytes only when an image is on screen, and caches them forever — the
 * address is the hash of the bytes, so it can never point at anything else.
 *
 * Paths that answer a session or a tool (a route awaiting a control, the
 * agent-facing tools) are not rewritten: they get what the machine sent.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { writeStateFile } from "@cawco/core/state-file";
import { DB_PATH } from "./config";

export const MEDIA_DIR = join(dirname(DB_PATH), "media");

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

/** `<sha256>.<ext>` — the only names {@link mediaFilePath} will resolve. */
const MEDIA_NAME = /^[a-f0-9]{64}\.(png|jpg|gif|webp)$/u;

let ready = false;

/**
 * Pictures on their way to their files, by name: what a read of one answers
 * until its file lands. The write is the store's own (whole, synced), off the
 * loop: written in line, a window of a session's screenshots held the hub's
 * loop for each one's fsync (80 ms for one window of a real session, 860 ms
 * on a loaded machine).
 */
const writing = new Map<string, Buffer>();

/** The name a picture's bytes are kept under: `<sha256>.<ext>`. */
const nameOf = (type: string, bytes: Buffer): string =>
  `${createHash("sha256").update(bytes).digest("hex")}.${EXTENSIONS[type]}`;

/**
 * The name a picture is kept under ({@link MEDIA_NAME}), base64 as a send
 * carries it, whether or not it is stored yet; undefined for a type the
 * store does not keep.
 */
export function mediaNameOf(type: string, data: string): string | undefined {
  return type in EXTENSIONS
    ? nameOf(type, Buffer.from(data, "base64"))
    : undefined;
}

function store(type: string, data: string): string {
  const bytes = Buffer.from(data, "base64");
  const name = nameOf(type, bytes);
  const path = join(MEDIA_DIR, name);
  if (!ready) {
    mkdirSync(MEDIA_DIR, { recursive: true });
    ready = true;
  }
  // Whole or not at all: a name that is there is its hash's bytes.
  if (!(writing.has(name) || existsSync(path))) {
    writing.set(name, bytes);
    writeStateFile(path, bytes)
      .catch((error: unknown) =>
        console.error(
          `[media] ${name} could not be kept: ${error instanceof Error ? error.message : String(error)}`
        )
      )
      .finally(() => writing.delete(name));
  }
  return `/api/media/${name}`;
}

/** A picture's bytes while its write is under way ({@link writing}); undefined once its file is there. */
export function mediaWriting(name: string): Buffer | undefined {
  return writing.get(name);
}

/** A stored picture's bytes by its name, its write still under way or done; undefined for a name this store never minted or a file gone. */
export function mediaBytes(name: string): Uint8Array | undefined {
  const path = mediaFilePath(name);
  if (!path) {
    return;
  }
  return (
    writing.get(name) ?? (existsSync(path) ? readFileSync(path) : undefined)
  );
}

interface Base64Image {
  source: { type: "base64"; media_type: string; data: string };
  type: "image";
}

const isBase64Image = (
  value: Record<string, unknown>
): value is Base64Image & Record<string, unknown> => {
  if (value.type !== "image") {
    return false;
  }
  const source = value.source as Record<string, unknown> | undefined;
  return (
    source?.type === "base64" &&
    typeof source.data === "string" &&
    typeof source.media_type === "string" &&
    source.media_type in EXTENSIONS
  );
};

/**
 * Swaps every base64 image block in `value` for a stored reference, in place.
 * The payloads it is given are freshly parsed per message, so nothing else
 * holds them.
 */
export function externalizeImages<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const item of value) {
      externalizeImages(item);
    }
    return value;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (isBase64Image(record)) {
      const { media_type, data } = record.source;
      record.source = {
        type: "url",
        url: store(media_type, data),
        media_type,
      } as unknown as Base64Image["source"];
      return value;
    }
    for (const child of Object.values(record)) {
      externalizeImages(child);
    }
  }
  return value;
}

/**
 * One picture into the store, as {@link externalizeImages} keeps each: its
 * address, or undefined for a type the store does not keep.
 */
export function storeImage(
  mediaType: string,
  data: string
): string | undefined {
  return mediaType in EXTENSIONS ? store(mediaType, data) : undefined;
}

/** The file behind a media name, or undefined for any name this store never minted. */
export function mediaFilePath(name: string): string | undefined {
  return MEDIA_NAME.test(name) ? join(MEDIA_DIR, name) : undefined;
}

/**
 * The bytes behind a reference {@link externalizeImages} made, base64, as a
 * machine is handed an image; undefined when it is no such reference or its
 * file is gone.
 */
export function mediaBase64(url: string): string | undefined {
  const bytes = mediaBytes(url.replace(MEDIA_URL_PREFIX, ""));
  return bytes ? Buffer.from(bytes).toString("base64") : undefined;
}

const MEDIA_URL_PREFIX = /^\/api\/media\//u;

/**
 * Files the reader attaches that are neither a picture nor text: stored as
 * they came, by the hash of their bytes, until a machine fetches one to put
 * beside the session it was sent to.
 */
const FILES_DIR = join(MEDIA_DIR, "files");

/** The most one attached file may weigh. */
export const FILE_LIMIT_BYTES = 100 * 1024 * 1024;

const FILE_HASH = /^[a-f0-9]{64}$/u;

/** Stores `bytes` once under their hash, and answers that hash. */
export async function storeFile(bytes: Uint8Array): Promise<string> {
  const hash = createHash("sha256").update(bytes).digest("hex");
  const path = join(FILES_DIR, hash);
  mkdirSync(FILES_DIR, { recursive: true });
  if (!existsSync(path)) {
    await writeStateFile(path, bytes);
  }
  return hash;
}

/** The file behind a hash, or undefined for anything that is not one. */
export function storedFilePath(hash: string): string | undefined {
  return FILE_HASH.test(hash) ? join(FILES_DIR, hash) : undefined;
}

export function mediaContentType(name: string): string {
  const ext = name.slice(name.lastIndexOf(".") + 1);
  return (
    Object.entries(EXTENSIONS).find(([, e]) => e === ext)?.[0] ??
    "application/octet-stream"
  );
}
