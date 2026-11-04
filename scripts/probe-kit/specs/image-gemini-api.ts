/**
 * `generate_image` through the Gemini API provider (agent
 * image-providers/gemini-api.ts, on `@google/genai` as published) against a
 * mock of the API at `CAWCO_GEMINI_BASE_URL`, with a Google key account held
 * under a scratch HOME (`ownHome`). Nothing reaches Google and nothing is
 * billed.
 *
 * - a. No Google key account: refused before any request, naming where to
 *   add one.
 * - b. The default: one generateContent on gemini-nano-banana-2.1, the key
 *   in `x-goog-api-key`, the image modality, the size's 3:2 and 2K, the
 *   prompt; a PNG saved at the asked path, by gemini-api.
 * - c. A chosen model and two reference images: the request names that
 *   model, and carries each reference inline, by its type, before the
 *   prompt.
 * - d. A model it doesn't offer: refused before any request.
 * - e. A bad key (400 "API key not valid"): refused naming the key, once.
 * - f. 429: refused naming quota and the free tier, sent once.
 * - g. A blocked prompt (no candidate): refused with the block reason.
 * - h. `model` on chatgpt: refused, it has one; six references on chatgpt:
 *   refused, it takes five.
 *
 *   bun scripts/probe-kit/run.ts image-gemini-api
 */
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generateImage } from "../../../packages/agent/src/image-generation";
import {
  type GeneratedImage,
  IMAGE_PROVIDER_MODELS,
} from "../../../packages/core/src/image-generation";
import { accountCredentialPath } from "../../../packages/core/src/paths";
import { unhandled } from "../../../packages/core/src/unhandled";
import { imageGenerationWords } from "../../../packages/core/src/words/image-generation";
import type { Kit, Spec } from "../kit";

/** A 1×1 PNG. */
const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
/** A JPEG's header to its SOF0, 64 × 48. */
const JPEG_64X48 = "/9j/4AAQSkZJRgABAQAAAQABAAD/wAARCAAwAEADASIAAhEBAxEB/9k=";
const KEY = "AIza-probe-key";
const BAD_KEY = "API key not valid. Please pass a valid API key.";
const QUOTA =
  "You exceeded your current quota, please check your plan and billing details.";

/** What the mock answers next. */
type Answer = "image" | "bad-key" | "quota" | "blocked";

/** One request the mock saw. */
interface Asked {
  body: {
    contents?: { parts?: Record<string, unknown>[] }[];
    generationConfig?: Record<string, unknown>;
  };
  key: string | null;
  path: string;
}

export default {
  group: "The hub and machines",
  name: "image-gemini-api",
  ownHome:
    "it holds a Google key account of its own under ~/.cawco/accounts, which the agent's account store reads from HOME",
  run: async (kit: Kit) => {
    const { check } = kit;
    let answer: Answer = "image";
    const asked: Asked[] = [];
    const server = Bun.serve({
      port: 0,
      fetch: async (request) => {
        asked.push({
          path: new URL(request.url).pathname,
          key: request.headers.get("x-goog-api-key"),
          body: await request.json().catch(() => ({})),
        });
        switch (answer) {
          case "bad-key":
            return Response.json(
              {
                error: {
                  code: 400,
                  message: BAD_KEY,
                  status: "INVALID_ARGUMENT",
                },
              },
              { status: 400 }
            );
          case "quota":
            return Response.json(
              {
                error: {
                  code: 429,
                  message: QUOTA,
                  status: "RESOURCE_EXHAUSTED",
                },
              },
              { status: 429 }
            );
          case "blocked":
            return Response.json({ promptFeedback: { blockReason: "SAFETY" } });
          case "image":
            return Response.json({
              candidates: [
                {
                  content: {
                    role: "model",
                    parts: [
                      { text: "Here it is." },
                      { inlineData: { mimeType: "image/png", data: PNG_1X1 } },
                    ],
                  },
                  finishReason: "STOP",
                },
              ],
            });
          default:
            return unhandled("answer", answer);
        }
      },
    });
    process.env.CAWCO_GEMINI_BASE_URL = `http://127.0.0.1:${server.port}`;
    const out = join(kit.out, "images");
    await mkdir(out, { recursive: true });
    await writeFile(join(out, "ref.png"), Buffer.from(PNG_1X1, "base64"));
    await writeFile(join(out, "ref.jpg"), Buffer.from(JPEG_64X48, "base64"));
    const attempt = async (
      next: Answer,
      input: Record<string, unknown>
    ): Promise<
      { ok: true; image: GeneratedImage } | { ok: false; error: string }
    > => {
      answer = next;
      asked.length = 0;
      try {
        return {
          ok: true,
          image: await generateImage(out, { prompt: "a probe", ...input }),
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    };
    const refused = (reason: string) =>
      imageGenerationWords.refused("gemini-api", reason);
    try {
      const noKey = await attempt("image", {
        provider: "gemini-api",
        output_path: "a.png",
      });
      check(
        "a. no Google key account: refused before any request, naming where to add one",
        !noKey.ok &&
          noKey.error === refused(imageGenerationWords.geminiNoKey()) &&
          asked.length === 0,
        JSON.stringify({ noKey, asked })
      );

      const credential = accountCredentialPath("0-google");
      await mkdir(join(credential, ".."), { recursive: true });
      await writeFile(
        credential,
        JSON.stringify({ google: { type: "api_key", key: KEY } })
      );

      const made = await attempt("image", {
        provider: "gemini-api",
        output_path: "b.png",
        size: "1536x1024",
      });
      const [first] = asked;
      kit.note(`b request: ${JSON.stringify(first)}`);
      check(
        "b. the default: saved at b.png, a PNG by gemini-api on gemini-nano-banana-2.1",
        made.ok &&
          made.image.path === join(out, "b.png") &&
          made.image.format === "png" &&
          made.image.provider === "gemini-api" &&
          made.image.model === "gemini-nano-banana-2.1" &&
          existsSync(join(out, "b.png")),
        JSON.stringify(made)
      );
      check(
        "b. one generateContent on that model, the key in x-goog-api-key, the image modality, 3:2 at 2K, the prompt",
        asked.length === 1 &&
          first?.path.endsWith(
            "/models/gemini-nano-banana-2.1:generateContent"
          ) === true &&
          first.key === KEY &&
          JSON.stringify(first.body.generationConfig) ===
            JSON.stringify({
              responseModalities: ["IMAGE"],
              imageConfig: { aspectRatio: "3:2", imageSize: "2K" },
            }) &&
          JSON.stringify(first.body.contents?.[0]?.parts) ===
            JSON.stringify([{ text: "a probe" }]),
        JSON.stringify(asked)
      );

      const edit = await attempt("image", {
        provider: "gemini-api",
        model: "gemini-3-pro-image",
        output_path: "c.png",
        reference_images: ["ref.png", "ref.jpg"],
      });
      const parts = asked[0]?.body.contents?.[0]?.parts;
      check(
        "c. a chosen model and two references: that model, each reference inline by its type, then the prompt",
        edit.ok &&
          edit.image.model === "gemini-3-pro-image" &&
          asked[0]?.path.endsWith(
            "/models/gemini-3-pro-image:generateContent"
          ) === true &&
          JSON.stringify(parts) ===
            JSON.stringify([
              { inlineData: { mimeType: "image/png", data: PNG_1X1 } },
              { inlineData: { mimeType: "image/jpeg", data: JPEG_64X48 } },
              { text: "a probe" },
            ]),
        JSON.stringify({ edit, parts })
      );

      const unknown = await attempt("image", {
        provider: "gemini-api",
        model: "imagen-9",
        output_path: "d.png",
      });
      check(
        "d. a model it doesn't offer: refused before any request",
        !unknown.ok &&
          unknown.error ===
            imageGenerationWords.unknownModel("gemini-api", "imagen-9", [
              ...IMAGE_PROVIDER_MODELS["gemini-api"],
            ]) &&
          asked.length === 0,
        JSON.stringify(unknown)
      );

      const badKey = await attempt("bad-key", {
        provider: "gemini-api",
        output_path: "e.png",
      });
      check(
        "e. a bad key: refused naming the key, sent once, nothing saved",
        !badKey.ok &&
          badKey.error ===
            refused(imageGenerationWords.geminiKeyRefused(400, BAD_KEY)) &&
          asked.length === 1 &&
          !existsSync(join(out, "e.png")),
        JSON.stringify({ badKey, asked: asked.length })
      );

      const quota = await attempt("quota", {
        provider: "gemini-api",
        output_path: "f.png",
      });
      check(
        "f. 429: refused naming quota and the free tier, sent once",
        !quota.ok &&
          quota.error === refused(imageGenerationWords.geminiQuota(QUOTA)) &&
          asked.length === 1,
        JSON.stringify({ quota, asked: asked.length })
      );

      const blocked = await attempt("blocked", {
        provider: "gemini-api",
        output_path: "g.png",
      });
      check(
        "g. a blocked prompt: refused with the block reason",
        !blocked.ok &&
          blocked.error ===
            refused(imageGenerationWords.geminiNoImage("SAFETY", "")),
        JSON.stringify(blocked)
      );

      const chatgptModel = await attempt("image", {
        provider: "chatgpt",
        model: "gemini-3-pro-image",
        output_path: "h.png",
      });
      const chatgptRefs = await attempt("image", {
        provider: "chatgpt",
        output_path: "h.png",
        reference_images: Array.from({ length: 6 }, () => "ref.png"),
      });
      check(
        "h. model on chatgpt refused (one model); six references on chatgpt refused (five)",
        !chatgptModel.ok &&
          chatgptModel.error ===
            imageGenerationWords.noModelChoice("chatgpt", "gpt-image-2") &&
          !chatgptRefs.ok &&
          chatgptRefs.error ===
            imageGenerationWords.refused(
              "chatgpt",
              imageGenerationWords.tooManyReferences("chatgpt", 5)
            ),
        JSON.stringify({ chatgptModel, chatgptRefs })
      );
    } finally {
      server.stop(true);
      delete process.env.CAWCO_GEMINI_BASE_URL;
    }
  },
} satisfies Spec;
