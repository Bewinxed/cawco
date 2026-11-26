/**
 * The pictures of a send, read before agy takes them. agy keeps whatever a
 * prompt carried in its conversation and sends that history again with
 * every later request, so a picture Google cannot read fails each turn
 * after it, on any model (tsk-340, item 3's probe). So a picture goes to
 * agy only when its bytes decode whole as the type it names, and it is
 * within the limits of every model agy runs:
 *
 * - **Decode**: `Bun.Image` (libspng, libjpeg-turbo, libwebp) decodes every
 *   pixel; its format must be the one the send names.
 * - **Whole**: the file ends as its format ends, since the decoders read a
 *   cut one: libspng decodes a PNG with no `IEND`, which Google refuses
 *   ("Unable to process input image", the fix's host probe), and
 *   libjpeg-turbo one missing its end marker. A PNG ends with its `IEND`
 *   chunk, a JPEG holds its `EOI` marker, a WebP is as long as its RIFF
 *   header says.
 * - **Each picture**: at most 10 MB as base64, and 8000 pixels a side, the
 *   limits for Claude on Google Cloud, which agy runs ("The maximum
 *   dimensions for each image are 8000x8000 px"; "10 MB (base64-encoded)
 *   on … Claude Models on Google Cloud", platform.claude.com/docs/en/
 *   build-with-claude/vision). Gemini's are wider (Agent Platform: 256 MB
 *   inline parts, docs.cloud.google.com/vertex-ai/generative-ai/docs/
 *   multimodal/image-understanding).
 * - **The send**: its pictures and words at most 20 MB, the Gemini API's
 *   inline request limit ("Inline image data limits your total request size
 *   (text prompts, system instructions, and inline bytes) to 20MB",
 *   ai.google.dev/gemini-api/docs/image-understanding).
 *
 * The types themselves are held where a send enters (core harness/agy.ts
 * `pictureTypes`, the hub's send route).
 */
import type { TurnImage } from "@cawco/core/attachments";
import { agyWords } from "@cawco/core/words/agy";
import { Effect } from "effect";
import { fromPromise } from "../rejected";

const MB = 1024 * 1024;
/** Each picture's base64, at most (Claude on Google Cloud). */
const PICTURE_BYTES = 10 * MB;
/** Each side, at most (Claude's). */
const PICTURE_SIDE = 8000;
/** A send's pictures and words, at most (the Gemini API's inline request). */
const SEND_BYTES = 20 * MB;
/** Base64 as a send carries it: no `data:` prefix, no line breaks. */
const BASE64 =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;

/** What `Bun.Image` names each type agy takes (core harness/agy.ts). */
const FORMAT_OF: Readonly<Record<string, string>> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
};
/** How a refusal names each type. */
const TYPE_NAME: Readonly<Record<string, string>> = {
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WebP",
};

/** A PNG's last chunk: `IEND`, empty, and its CRC. */
const PNG_END = Buffer.from("0000000049454e44ae426082", "hex");
/** A JPEG's end of image marker. */
const JPEG_END = Buffer.from([0xff, 0xd9]);

/** Whether `bytes` end as their `format` ends (a file cut short does not). */
const whole = (bytes: Buffer, format: string): boolean => {
  switch (format) {
    case "png":
      return bytes.subarray(-PNG_END.length).equals(PNG_END);
    case "jpeg":
      return bytes.includes(JPEG_END, 2);
    case "webp":
      return bytes.length >= 12 && bytes.readUInt32LE(4) + 8 === bytes.length;
    default:
      return false;
  }
};

/** A picture's header as `Bun.Image` reads it, before any pixel is held; none when it reads none. */
const header = (image: Bun.Image) =>
  fromPromise(() => image.metadata()).pipe(Effect.option);

/** Whether every pixel of a picture decodes. */
const decodes = (image: Bun.Image) =>
  fromPromise(() => image.bytes()).pipe(
    Effect.as(true),
    Effect.orElseSucceed(() => false)
  );

/** Why picture `at` of `of` can't go to agy, if it can't. */
const pictureRefusal = Effect.fnUntraced(function* (
  picture: TurnImage,
  at: number,
  of: number
) {
  const named = agyWords.picture(at, of);
  const type = TYPE_NAME[picture.mediaType] ?? picture.mediaType;
  if (picture.data.length > PICTURE_BYTES) {
    return agyWords.pictureTooBig(named, "10 MB");
  }
  if (!BASE64.test(picture.data)) {
    return agyWords.pictureUnreadable(named, type);
  }
  const bytes = Buffer.from(picture.data, "base64");
  const format = FORMAT_OF[picture.mediaType] ?? "";
  const image = new Bun.Image(bytes);
  const read = yield* header(image);
  if (
    read._tag === "None" ||
    read.value.format !== format ||
    !whole(bytes, format)
  ) {
    return agyWords.pictureUnreadable(named, type);
  }
  if (read.value.width > PICTURE_SIDE || read.value.height > PICTURE_SIDE) {
    return agyWords.pictureTooWide(named, PICTURE_SIDE);
  }
  if (!(yield* decodes(image))) {
    return agyWords.pictureUnreadable(named, type);
  }
});

/** Why a send of `images` and `text` can't go to agy, in words naming the picture; none when it can. */
export const sendRefusal = Effect.fnUntraced(function* (
  images: readonly TurnImage[],
  text: string
) {
  const size = images.reduce(
    (sum, image) => sum + image.data.length,
    Buffer.byteLength(text)
  );
  if (size > SEND_BYTES) {
    return agyWords.sendTooBig("20 MB");
  }
  for (const [at, image] of images.entries()) {
    const refused = yield* pictureRefusal(image, at, images.length);
    if (refused) {
      return refused;
    }
  }
});
