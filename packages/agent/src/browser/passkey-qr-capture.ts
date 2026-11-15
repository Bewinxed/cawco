/**
 * The FIDO URI of a passkey QR read off a browser container's X display.
 *
 * Chromium draws a WebAuthn ceremony's hybrid ("use a phone") QR in its own
 * dialog, which is browser chrome: no DOM holds it, and CDP's
 * `Page.captureScreenshot` draws the page alone. The X server holds every
 * window, so the whole screen is read inside the container (`xwd -root`),
 * turned into a binary PPM by ImageMagick there (the browser image carries
 * both, agent browser/Dockerfile), and its QR decoded here with jsQR.
 */
import { readWithin } from "@cawco/core/bounded";
import jsQR from "jsqr";
import { browserRuntime } from "./browsers";

/** Reads of the screen before none is taken to hold a QR. */
const TRIES = 5;
/** Between two reads: the dialog may still be drawing its QR. */
const TRY_GAP_MS = 500;
/** How long one read of the screen may take: a 1920×1080 PPM is ~6 MB. */
const READ_MS = 10_000;

/**
 * The whole X screen as a binary PPM (P6) on stdout. xwd finds the X server
 * by the container's DISPLAY, which neko's image sets (chromium.conf runs
 * Chromium on it).
 */
const SCREEN_CMD = [
  "sh",
  "-c",
  "xwd -root -silent | convert xwd:- -depth 8 ppm:-",
];

/** The URI a hybrid passkey QR carries (`FIDO:/` and digits, CTAP 2.2 §11.5). */
const FIDO_URI = /^FIDO:\//iu;

/** Whitespace in a PPM header, by char code: space, tab, LF, VT, FF, CR. */
const HEADER_SPACE = new Set([0x20, 0x09, 0x0a, 0x0b, 0x0c, 0x0d]);
/** A PPM header's comment mark, `#`. */
const COMMENT = 0x23;
/** A PPM header's line end, LF. */
const LINE_END = 0x0a;

/** The Engine API's stream number for stdout; 2 is stderr. */
const STDOUT = 1;

/**
 * A command's stdout and stderr, from the Engine API's multiplexed stream:
 * an 8-byte header (stream, 0, 0, 0, size as uint32 big-endian) before each
 * frame, while the exec has no TTY.
 */
const streamsOf = (raw: Buffer): { stdout: Buffer; stderr: string } => {
  const out: Buffer[] = [];
  const err: Buffer[] = [];
  let at = 0;
  while (at + 8 <= raw.length) {
    const size = raw.readUInt32BE(at + 4);
    (raw[at] === STDOUT ? out : err).push(raw.subarray(at + 8, at + 8 + size));
    at += 8 + size;
  }
  return {
    stdout: Buffer.concat(out),
    stderr: Buffer.concat(err).toString("utf8").trim(),
  };
};

/**
 * A binary PPM's header: P6, width, height, max value, each after
 * whitespace or a comment line, and where its pixels start (one whitespace
 * byte after the last field).
 */
const headerOf = (ppm: Buffer): { fields: string[]; pixelsAt: number } => {
  const fields: string[] = [];
  let at = 0;
  const skip = (more: (byte: number) => boolean): void => {
    while (at < ppm.length && more(ppm[at] ?? 0)) {
      at += 1;
    }
  };
  while (fields.length < 4 && at < ppm.length) {
    const byte = ppm[at] ?? 0;
    if (HEADER_SPACE.has(byte)) {
      at += 1;
    } else if (byte === COMMENT) {
      skip((next) => next !== LINE_END);
    } else {
      const start = at;
      skip((next) => !HEADER_SPACE.has(next));
      fields.push(ppm.subarray(start, at).toString("latin1"));
    }
  }
  return { fields, pixelsAt: at + 1 };
};

/** A binary PPM's pixels as RGBA, the layout jsQR reads; undefined for anything else. */
const rgbaOf = (
  ppm: Buffer
): { data: Uint8ClampedArray; width: number; height: number } | undefined => {
  const { fields, pixelsAt } = headerOf(ppm);
  const [magic, w, h, max] = fields;
  const width = Number(w);
  const height = Number(h);
  if (magic !== "P6" || max !== "255" || !(width > 0 && height > 0)) {
    return;
  }
  const pixels = ppm.subarray(pixelsAt);
  if (pixels.length < width * height * 3) {
    return;
  }
  const data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p += 1) {
    data[p * 4] = pixels[p * 3] ?? 0;
    data[p * 4 + 1] = pixels[p * 3 + 1] ?? 0;
    data[p * 4 + 2] = pixels[p * 3 + 2] ?? 0;
    data[p * 4 + 3] = 255;
  }
  return { data, width, height };
};

/** One read of container `containerId`'s screen: the PPM, or why there is none. */
const readScreen = async (containerId: string): Promise<Buffer> => {
  const runtime = await browserRuntime();
  if ("missing" in runtime) {
    throw new Error(runtime.missing);
  }
  const read = await readWithin(READ_MS, async (signal) => {
    const exec = await runtime.docker.getContainer(containerId).exec({
      Cmd: SCREEN_CMD,
      AttachStdout: true,
      AttachStderr: true,
    });
    const stream = await exec.start({
      hijack: true,
      stdin: false,
      abortSignal: signal,
    });
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk as Uint8Array));
    }
    const { ExitCode } = await exec.inspect();
    return { raw: Buffer.concat(chunks), code: ExitCode };
  });
  if (read.kind === "unanswered") {
    throw new Error(`The screen was not read within ${READ_MS / 1000} s.`);
  }
  const { stdout, stderr } = streamsOf(read.value.raw);
  if (read.value.code !== 0) {
    throw new Error(
      `xwd | convert exited ${read.value.code}${stderr ? `: ${stderr}` : ""}`
    );
  }
  return stdout;
};

/**
 * The FIDO URI of the passkey QR on browser container `containerId`'s
 * screen, read up to {@link TRIES} times {@link TRY_GAP_MS} apart while the
 * dialog draws; null when no read found one. A read that fails (the
 * container gone, no X server, no xwd) is said by the error it throws.
 */
export async function captureQrFromDisplay(
  containerId: string
): Promise<string | null> {
  for (let tried = 1; tried <= TRIES; tried += 1) {
    const image = rgbaOf(await readScreen(containerId));
    if (!image) {
      throw new Error("The screen read was no 8-bit PPM.");
    }
    const code = jsQR(image.data, image.width, image.height, {
      inversionAttempts: "attemptBoth",
    });
    if (code && FIDO_URI.test(code.data)) {
      return code.data;
    }
    if (tried < TRIES) {
      await Bun.sleep(TRY_GAP_MS);
    }
  }
  return null;
}
