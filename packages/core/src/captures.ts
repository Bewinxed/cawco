/**
 * Desk captures on a page: pictures wider than {@link DESK_CAPTURE_WIDTH},
 * which the panel (600px beside the transcript, 390px on a phone) draws at a
 * fraction of their size. Read from each file's header alone (PNG IHDR,
 * JPEG SOF0/SOF2, WebP VP8/VP8L/VP8X), with no decoder: the hub counts them
 * on a built page, the daemon in a folder preview's start page.
 */
import { DESK_CAPTURE_WIDTH } from "./index";

/** Whether `bytes` hold `text`'s characters at `offset`. */
const holds = (bytes: Uint8Array, offset: number, text: string): boolean =>
  [...text].every(
    (char, index) => bytes[offset + index] === char.charCodeAt(0)
  );

const viewOf = (bytes: Uint8Array) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/** PNG: the signature, then IHDR's width, big-endian, at byte 16. */
const pngWidth = (bytes: Uint8Array): number | null =>
  bytes.length >= 24 &&
  bytes[0] === 0x89 &&
  holds(bytes, 1, "PNG") &&
  holds(bytes, 12, "IHDR")
    ? viewOf(bytes).getUint32(16)
    : null;

/** JPEG: the segments walked to the first SOF0 or SOF2, whose width follows its height. */
const jpegWidth = (bytes: Uint8Array): number | null => {
  if (!(bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8)) {
    return null;
  }
  const view = viewOf(bytes);
  let offset = 2;
  while (offset + 9 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1];
    if (marker === 0xc0 || marker === 0xc2) {
      return view.getUint16(offset + 7);
    }
    offset += 2 + view.getUint16(offset + 2);
  }
  return null;
};

/** A 14-bit field's value: the low 14 bits of a 16-bit word. */
const FOURTEEN_BITS = 0x40_00;

/** WebP: RIFF....WEBP, then one of its three chunks (lossy, lossless, extended). */
const webpWidth = (bytes: Uint8Array): number | null => {
  if (!(
    bytes.length >= 30 &&
    holds(bytes, 0, "RIFF") &&
    holds(bytes, 8, "WEBP")
  )) {
    return null;
  }
  const view = viewOf(bytes);
  if (holds(bytes, 12, "VP8 ")) {
    return view.getUint16(26, true) % FOURTEEN_BITS;
  }
  if (holds(bytes, 12, "VP8L")) {
    return (view.getUint16(21, true) % FOURTEEN_BITS) + 1;
  }
  if (holds(bytes, 12, "VP8X")) {
    // A 24-bit little-endian field, less one.
    return view.getUint16(24, true) + (bytes[26] as number) * 0x1_00_00 + 1;
  }
  return null;
};

/** A picture's width in pixels from its header; null when it is none of PNG, JPEG or WebP, or its header is cut. */
export const imageWidth = (bytes: Uint8Array): number | null =>
  pngWidth(bytes) ?? jpegWidth(bytes) ?? webpWidth(bytes);

const IMG_SOURCE = /<img\b[^>]*?\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const DATA_URL = /^data:[^;,]*;base64,(.*)$/s;

/** Each `<img>` source on a page, in order. */
export const imageSources = (html: string): string[] =>
  [...html.matchAll(IMG_SOURCE)].map((match) => match[1] ?? match[2] ?? "");

/** A `data:` URL's bytes when it is base64; null for any other source. */
export const dataUrlBytes = (src: string): Uint8Array | null => {
  const base64 = DATA_URL.exec(src)?.[1];
  return base64 === undefined ? null : Buffer.from(base64, "base64");
};

/**
 * The page's `<img>` whose file is wider than {@link DESK_CAPTURE_WIDTH}:
 * each source read by `bytesOf` (a `data:` URL, or a file beside the page),
 * null when it can't be read.
 */
export async function deskCaptures(
  html: string,
  bytesOf: (src: string) => Promise<Uint8Array | null> | Uint8Array | null
): Promise<number> {
  const read = await Promise.all(
    imageSources(html).map(async (src) => await bytesOf(src))
  );
  return read.filter((bytes) => {
    const width = bytes ? imageWidth(bytes) : null;
    return width !== null && width > DESK_CAPTURE_WIDTH;
  }).length;
}
