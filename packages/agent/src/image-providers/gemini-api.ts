import { credentialAccountIds } from "@cawco/core/paths/claude";
import { cutShort } from "@cawco/core/words/helpers";
import { imageGenerationWords } from "@cawco/core/words/image-generation";
import { GoogleGenAI } from "@google/genai";
import { readHeld } from "../provider-accounts";
import { ratioOf, sizeOf } from "./aspect";
import type { ImageJob, ImageProvider, MadeImage } from "./provider";

/**
 * Gemini on a Gemini API key, the official route billed per image
 * ("Direct use of the Gemini API … is billed and managed separately",
 * https://ai.google.dev/gemini-api/docs/google-ai-plans), through Google's
 * own SDK, `@google/genai`, as published, on the Interactions API: "Use the
 * Interactions API (`client.interactions`) as the default across all
 * workflows. `generateContent` is still supported for existing
 * integrations, but is considered a legacy API"
 * (https://aistudio.google.com/llms.txt, read 2026-11-05). The key is the
 * one a CawCo Google account holds on this machine (pi-ai's `google`
 * provider, a key account: Configure › Accounts › Google › API key); it
 * never leaves the machine but for Google's API.
 */

/** pi-ai's provider id for a Google key account (pi-ai env-api-keys.js: `google: "GEMINI_API_KEY"`). */
const GOOGLE_PROVIDER = "google";

/**
 * "Nano Banana models allow you to mix up to 14 reference images"
 * (https://aistudio.google.com/docs/image-generation.md, "Use up to 14
 * reference images", read 2026-11-05).
 */
const MAX_REFERENCES = 14;

/** An `image_size` value, by its nominal longest edge in pixels. */
interface ImageSize {
  edge: number;
  value: "1K" | "2K" | "4K";
}

const K1: ImageSize = { value: "1K", edge: 1024 };
const K2: ImageSize = { value: "2K", edge: 2048 };
const K4: ImageSize = { value: "4K", edge: 4096 };

/**
 * The `image_size` values each model makes, from image-generation.md's
 * per-model tables and the model pages (read 2026-11-05); every model takes
 * the ten ratios of `ratioOf` (aspect.ts).
 * - gemini-nano-banana-2.1: 1K, 2K and 4K ("Nano Banana 2.1" table); 512px
 *   is "not supported on Gemini Nano Banana 2.1".
 * - gemini-3.1-flash-image: 512px, 1K, 2K and 4K ("3.1 Flash Image" table).
 *   512px is never asked: the image page spells it "512px (05.K)" while the
 *   API reference's `image_size` value is `512`, and 1K, the default, is the
 *   floor here.
 * - gemini-3.1-flash-lite-image: "Supported `image_size` values: `1024px`
 *   (1K). *(Note: 2K and 4K are unsupported).*"
 *   (https://aistudio.google.com/docs/models/gemini-3.1-flash-lite-image.md).
 * - gemini-3-pro-image: 1K, 2K and 4K ("3 Pro Image" table).
 */
const MODEL_SIZES: Readonly<Record<string, readonly ImageSize[]>> = {
  "gemini-nano-banana-2.1": [K1, K2, K4],
  "gemini-3.1-flash-image": [K1, K2, K4],
  "gemini-3.1-flash-lite-image": [K1],
  "gemini-3-pro-image": [K1, K2, K4],
};

/**
 * Where the SDK sends its requests: Google's own address unless
 * `CAWCO_GEMINI_BASE_URL` names another (a probe's mock), as
 * `CAWCO_CHATGPT_BASE_URL` does for ChatGPT. The interactions client takes
 * it from the client's `httpOptions.baseUrl` (SDK
 * `getGoogleGenAIServerURL`).
 */
const baseUrl = (): string | undefined =>
  process.env.CAWCO_GEMINI_BASE_URL || undefined;

/** The Gemini API keys CawCo accounts on this machine hold. */
const heldKeys = (): string[] =>
  credentialAccountIds().flatMap((accountId) => {
    const held = readHeld(accountId);
    return held?.provider === GOOGLE_PROVIDER &&
      held.credential.type === "api_key" &&
      held.credential.key
      ? [held.credential.key]
      : [];
  });

/**
 * The `image_size` the asked size needs on `sizes`: the smallest whose edge
 * reaches the asked longest side, else the model's largest; none for
 * `auto`, which is the model's default ("Gemini 3 image models generate 1K
 * images by default", image-generation.md). "You must use an uppercase 'K'".
 */
const imageSizeOf = (
  size: string,
  sizes: readonly ImageSize[]
): ImageSize["value"] | undefined => {
  const asked = sizeOf(size);
  if (!asked) {
    return undefined;
  }
  const longest = Math.max(asked.width, asked.height);
  return (sizes.find((one) => one.edge >= longest) ?? sizes.at(-1))?.value;
};

/**
 * The codes that say the model's output was blocked or made no image
 * (https://aistudio.google.com/docs/api-errors.md, "Generation blocked
 * codes" and `no_image`, read 2026-11-05): said as an answer without an
 * image, with the API's words.
 */
const NO_IMAGE_CODES: ReadonlySet<string> = new Set([
  "safety",
  "recitation",
  "language",
  "prohibited_content",
  "spii",
  "blocklist",
  "image_safety",
  "image_prohibited_content",
  "image_recitation",
  "image_other",
  "content_blocked",
  "no_image",
]);

/**
 * The SDK's error for an HTTP refusal: `status` the HTTP status and `error`
 * the response body, "an `error` object containing a `code` and `message`"
 * (api-errors.md). The SDK's interactions `APIError` is not exported by
 * name, so it is read by shape.
 */
const httpRefusal = (
  error: unknown
): { code: string; message: string; status: number } | null => {
  if (!(error instanceof Error && "status" in error)) {
    return null;
  }
  const { status } = error;
  if (typeof status !== "number") {
    return null;
  }
  const body = "error" in error ? error.error : undefined;
  const said =
    body && typeof body === "object" && "error" in body ? body.error : body;
  const field = (name: "code" | "message"): string => {
    const value =
      said && typeof said === "object" && name in said
        ? Reflect.get(said, name)
        : undefined;
    return typeof value === "string" ? value : "";
  };
  return {
    status,
    code: field("code"),
    message: cutShort(field("message") || error.message, 1000),
  };
};

/**
 * The SDK's refusal as words, by api-errors.md's codes: a block or no image;
 * 401 `authentication` or 403 `permission_denied`, the key refused; 429
 * (`rate_limit_exceeded`, `quota_exceeded`, `too_many_requests`), a limit
 * met; anything else in the API's own words. Not an HTTP refusal (an abort,
 * a connection lost) passes as it is.
 */
const refusal = (error: unknown): Error => {
  const refused = httpRefusal(error);
  if (!refused) {
    return error instanceof Error ? error : new Error(String(error));
  }
  const { status, code, message } = refused;
  if (NO_IMAGE_CODES.has(code)) {
    return new Error(imageGenerationWords.geminiNoImage(code, message));
  }
  if (status === 401 || status === 403) {
    return new Error(imageGenerationWords.geminiKeyRefused(status, message));
  }
  if (status === 429) {
    return new Error(imageGenerationWords.geminiQuota(message));
  }
  return new Error(imageGenerationWords.geminiRefused(status, message));
};

/**
 * One `interactions.create`, as image-generation.md's samples make it: the
 * prompt as text then the references as images in `input`, and
 * `response_format` `{type: "image", aspect_ratio, image_size}`, an image
 * format alone so the answer is the image without conversational text
 * ("You can configure the response to return only the generated images …
 * by specifying an image format in the `response_format` parameter"), and
 * `store: false` so Google keeps neither the prompt nor the images. Not
 * streamed and not in the background, the call returns the finished
 * interaction. Its image is the SDK's `output_image`, "the last generated
 * image block" of the model's output (thought images are not output); none,
 * and the refusal says the interaction's error codes or status.
 */
const askGemini = async (
  key: string,
  job: ImageJob,
  signal: AbortSignal
): Promise<MadeImage> => {
  const url = baseUrl();
  const ai = new GoogleGenAI({
    apiKey: key,
    ...(url ? { httpOptions: { baseUrl: url } } : {}),
  });
  const sizes = MODEL_SIZES[job.model];
  if (!sizes) {
    throw new Error(`gemini-api has no image sizes for ${job.model}`);
  }
  const aspectRatio = ratioOf(job.size);
  const imageSize = imageSizeOf(job.size, sizes);
  const interaction = await ai.interactions
    .create(
      {
        model: job.model,
        input: [
          { type: "text", text: job.prompt },
          ...job.references.map((reference) => ({
            type: "image" as const,
            mime_type: reference.mime,
            data: reference.bytes.toString("base64"),
          })),
        ],
        response_format: {
          type: "image",
          ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
          ...(imageSize ? { image_size: imageSize } : {}),
        },
        // Kept nowhere: "By default, the API stores all Interaction objects
        // (`store=true`)", 55 days on the Paid Tier; "you can set
        // `store=false` in your request … `store=false` is incompatible with
        // background execution and prevents using `previous_interaction_id`
        // for subsequent turns"
        // (https://aistudio.google.com/docs/interactions-overview.md, "Data
        // storage and retention", read 2026-11-05), neither of which this
        // one synchronous call uses. The SDK's automatic continuation still
        // runs: with `store: false` it resends the input with the
        // `continuation_token` (`continuationBody`).
        store: false,
      },
      // One attempt: a failed image is said, never sent again by itself.
      // The interactions client retries 408, 409, 429 and 5XX four times
      // unless told otherwise, and does not read `httpOptions.retryOptions`.
      { retries: { strategy: "none" }, signal }
    )
    .catch((error: unknown) => {
      throw refusal(error);
    });
  const image = interaction.output_image?.data;
  if (!image) {
    const [fault] = interaction.errors ?? [];
    const text = cutShort(
      [interaction.output_text ?? "", fault?.message ?? ""].join(" ").trim(),
      600
    );
    throw new Error(
      imageGenerationWords.geminiNoImage(
        fault?.code || interaction.status,
        text
      )
    );
  }
  return {
    bytes: Buffer.from(image, "base64"),
    notes:
      job.quality === "auto"
        ? []
        : [imageGenerationWords.qualityIgnored("gemini-api", job.quality)],
  };
};

/**
 * The pre-flight, spending nothing: a Google account on this machine holds
 * a key. Nothing cheap says whether its project has billing on (the free
 * tier makes no images: "Not available" in each image model's Free Tier
 * column, https://aistudio.google.com/docs/pricing.md), so that is said
 * when the request meets it ({@link refusal}).
 */
const readiness: ImageProvider["readiness"] = () => {
  const [key] = heldKeys();
  return Promise.resolve(
    key
      ? {
          ready: true,
          notes: [],
          generate: (job, signal) => askGemini(key, job, signal),
        }
      : { ready: false, reason: imageGenerationWords.geminiNoKey() }
  );
};

/** Gemini on a Gemini API key held on this machine: a choice of models, references, an image. */
export const geminiApi: ImageProvider = {
  id: "gemini-api",
  references: MAX_REFERENCES,
  readiness,
};
