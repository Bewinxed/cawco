import { credentialAccountIds } from "@cawco/core/paths";
import { imageGenerationWords } from "@cawco/core/words/image-generation";
import { ApiError, GoogleGenAI, Modality } from "@google/genai";
import { readHeld } from "../provider-accounts";
import { ratioOf, sizeOf } from "./aspect";
import type { ImageJob, ImageProvider, MadeImage } from "./provider";

/**
 * Gemini on a Gemini API key, the official route billed per image
 * ("Direct use of the Gemini API … is billed and managed separately",
 * https://ai.google.dev/gemini-api/docs/google-ai-plans), through Google's
 * own SDK, `@google/genai`, as published. The key is the one a CawCo
 * Google account holds on this machine (pi-ai's `google` provider, a key
 * account: Configure › Accounts › Google › API key); it never leaves the
 * machine but for Google's API.
 */

/** pi-ai's provider id for a Google key account (pi-ai env-api-keys.js: `google: "GEMINI_API_KEY"`). */
const GOOGLE_PROVIDER = "google";

/** "Up to 14 reference images" (https://ai.google.dev/gemini-api/docs/image-generation). */
const MAX_REFERENCES = 14;

/**
 * Where the SDK sends its requests: Google's own address unless
 * `CAWCO_GEMINI_BASE_URL` names another (a probe's mock), as
 * `CAWCO_CHATGPT_BASE_URL` does for ChatGPT.
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
 * The output size the asked size needs: "1K, 2K, and 4K" (image-generation
 * doc), the smallest whose edge reaches the asked longest side; none for
 * `auto`, which is the model's default, 1K.
 */
const imageSizeOf = (size: string): string | undefined => {
  const asked = sizeOf(size);
  if (!asked) {
    return undefined;
  }
  const longest = Math.max(asked.width, asked.height);
  if (longest <= 1024) {
    return "1K";
  }
  return longest <= 2048 ? "2K" : "4K";
};

/** A 400 that is about the key ("API key not valid. Please pass a valid API key."). */
const BAD_KEY = /API key/iu;

/** The API's own message out of the SDK's error text, which carries the response body: `error.message` when it is JSON. */
const apiWords = (text: string): string => {
  const start = text.indexOf("{");
  try {
    const body = JSON.parse(start >= 0 ? text.slice(start) : text);
    const message = body?.error?.message;
    return typeof message === "string" && message ? message : text;
  } catch {
    return text;
  }
};

/** The SDK's refusal as words: a key refused, a limit met, or the API's own words. */
const refusal = (error: unknown): Error => {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error : new Error(String(error));
  }
  const detail = apiWords(error.message).slice(0, 1000);
  if (error.status === 401 || error.status === 403) {
    return new Error(
      imageGenerationWords.geminiKeyRefused(error.status, detail)
    );
  }
  if (error.status === 400 && BAD_KEY.test(detail)) {
    return new Error(imageGenerationWords.geminiKeyRefused(400, detail));
  }
  if (error.status === 429) {
    return new Error(imageGenerationWords.geminiQuota(detail));
  }
  return new Error(imageGenerationWords.geminiRefused(error.status, detail));
};

/**
 * One `models.generateContent` with the image modality
 * (image-generation doc, "imageConfig: { aspectRatio, imageSize }"): the
 * references first as inline images, then the prompt. The answer's first
 * inline image is the image; none, and the refusal says why the API gave.
 */
const askGemini = async (
  key: string,
  job: ImageJob,
  signal: AbortSignal
): Promise<MadeImage> => {
  const url = baseUrl();
  const ai = new GoogleGenAI({
    apiKey: key,
    // One attempt: a failed image is said, never sent again by itself.
    httpOptions: {
      retryOptions: { attempts: 1 },
      ...(url ? { baseUrl: url } : {}),
    },
  });
  const aspectRatio = ratioOf(job.size);
  const imageSize = imageSizeOf(job.size);
  const response = await ai.models
    .generateContent({
      model: job.model,
      contents: [
        {
          role: "user",
          parts: [
            ...job.references.map((reference) => ({
              inlineData: {
                mimeType: reference.mime,
                data: reference.bytes.toString("base64"),
              },
            })),
            { text: job.prompt },
          ],
        },
      ],
      config: {
        abortSignal: signal,
        responseModalities: [Modality.IMAGE],
        ...(aspectRatio || imageSize
          ? {
              imageConfig: {
                ...(aspectRatio ? { aspectRatio } : {}),
                ...(imageSize ? { imageSize } : {}),
              },
            }
          : {}),
      },
    })
    .catch((error: unknown) => {
      throw refusal(error);
    });
  const [candidate] = response.candidates ?? [];
  const parts = candidate?.content?.parts ?? [];
  const image = parts.find((part) => part.inlineData?.data)?.inlineData?.data;
  if (!image) {
    const text = parts
      .map((part) => part.text ?? "")
      .join(" ")
      .trim()
      .slice(0, 600);
    const reason =
      response.promptFeedback?.blockReason ??
      candidate?.finishReason ??
      "no candidate";
    throw new Error(imageGenerationWords.geminiNoImage(String(reason), text));
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
 * tier makes no images, https://ai.google.dev/gemini-api/docs/pricing), so
 * that is said when the request meets it ({@link refusal}).
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

/** Gemini on a Gemini API key held on this machine: a choice of models, references, PNG. */
export const geminiApi: ImageProvider = {
  id: "gemini-api",
  references: MAX_REFERENCES,
  readiness,
};
