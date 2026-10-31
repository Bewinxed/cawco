/**
 * The scale a picture was taken at: how many of its pixels stand for one CSS
 * px of the screen it shows. A 390px phone screen taken at a device scale
 * of 2 is 780 pixels wide, and draws at 390 CSS px (decision host
 * Image.svelte: its own size over its scale).
 *
 * The record is the PNG's own `pHYs` chunk, its physical pixel density
 * (PNG 3rd edition, 11.3.5.3: pixels per unit on each axis, unit 1 the
 * metre), on Apple's convention that 72 pixels per inch is a scale of 1: a
 * Retina Mac's screenshot carries 144 (5669 pixels per metre). A capture
 * the house takes at a device scale records it here ({@link withPngScale},
 * agent frame-picture.ts); the hub reads it as it serves a page's
 * pictures ({@link pngScale}, hub page-pictures.ts). A picture with no `pHYs`, or one in a unit
 * other than the metre (an aspect ratio alone), says nothing, and stands at
 * a scale of 1.
 */
import { crc32 } from "node:zlib";

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;
/** Pixels per inch at a scale of 1 (Apple's convention). */
const PPI_AT_ONE = 72;
const METRES_PER_INCH = 0.0254;
/** A chunk's length, type and CRC around its data. */
const CHUNK_FRAME = 12;
/** The signature, then IHDR: its frame and 13 bytes of data. */
const AFTER_IHDR = SIGNATURE.length + CHUNK_FRAME + 13;

const isPng = (bytes: Uint8Array): boolean =>
  bytes.length >= AFTER_IHDR &&
  SIGNATURE.every((byte, index) => bytes[index] === byte);

const typeAt = (bytes: Uint8Array, at: number): string =>
  String.fromCharCode(...bytes.subarray(at + 4, at + 8));

/** Each chunk's start and type, up to IDAT (pHYs stands before it, PNG 5.6). */
function* chunksBeforeData(
  bytes: Uint8Array
): Generator<{ at: number; length: number; type: string }> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = SIGNATURE.length;
  while (at + CHUNK_FRAME <= bytes.length) {
    const length = view.getUint32(at);
    const type = typeAt(bytes, at);
    if (type === "IDAT" || type === "IEND") {
      return;
    }
    yield { at, length, type };
    at += CHUNK_FRAME + length;
  }
}

/** The scale `bytes` records: its `pHYs` density over 72 per inch, a whole number from 1; 1 for a PNG that records none, or anything not a PNG. */
export const pngScale = (bytes: Uint8Array): number => {
  if (!isPng(bytes)) {
    return 1;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (const chunk of chunksBeforeData(bytes)) {
    if (chunk.type !== "pHYs" || chunk.length !== 9) {
      continue;
    }
    const perMetre = view.getUint32(chunk.at + 8);
    const metre = bytes[chunk.at + 16] === 1;
    if (!metre || perMetre === 0) {
      return 1;
    }
    return Math.max(1, Math.round((perMetre * METRES_PER_INCH) / PPI_AT_ONE));
  }
  return 1;
};

/** `png` recording `scale`: its `pHYs` written at 72 × `scale` per inch, in metres, any it had taken out. */
export const withPngScale = (png: Uint8Array, scale: number): Uint8Array => {
  if (!isPng(png)) {
    throw new Error("Only a PNG records its scale.");
  }
  const perMetre = Math.round((PPI_AT_ONE * scale) / METRES_PER_INCH);
  const chunk = new Uint8Array(CHUNK_FRAME + 9);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4);
  view.setUint32(8, perMetre);
  view.setUint32(12, perMetre);
  chunk[16] = 1;
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  const old = [...chunksBeforeData(png)].find((one) => one.type === "pHYs");
  const parts = old
    ? [png.subarray(0, old.at), png.subarray(old.at + CHUNK_FRAME + old.length)]
    : [png.subarray(0, AFTER_IHDR), png.subarray(AFTER_IHDR)];
  const head = parts[0] ?? new Uint8Array();
  const tail = parts[1] ?? new Uint8Array();
  const out = new Uint8Array(head.length + chunk.length + tail.length);
  out.set(head, 0);
  out.set(chunk, head.length);
  out.set(tail, head.length + chunk.length);
  return out;
};
