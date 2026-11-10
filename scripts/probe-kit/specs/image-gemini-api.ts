/**
 * `generate_image` through the Gemini API provider (agent
 * image-providers/gemini-api.ts, on `@google/genai` as published, its
 * `interactions.create`) against a mock of the Interactions API at
 * `CAWCO_GEMINI_BASE_URL`, answering the documented shapes
 * (https://aistudio.google.com/api-reference/interactions-api/create-interaction.md,
 * https://aistudio.google.com/docs/api-errors.md), with a Google key account
 * held under a scratch HOME (`ownHome`). Nothing reaches Google and nothing
 * is billed.
 *
 * - a. No Google key account: refused before any request, naming where to
 *   add one.
 * - b. The default: one POST /v1beta/interactions on
 *   gemini-nano-banana-2.1, the key in `x-goog-api-key`, the prompt as text,
 *   `response_format` an image at the size's 3:2 and 2K, `store: false`; the
 *   answer's model output image (not its thought image) saved at the asked
 *   path, a PNG by gemini-api.
 * - c. A chosen model and two reference images: the request names that
 *   model, and carries the prompt then each reference as an image, by its
 *   type.
 * - d. A model it doesn't offer: refused before any request.
 * - e. A bad key (401 `authentication`): refused naming the key, sent once.
 * - f. 429 `quota_exceeded`: refused naming quota and the free tier, sent
 *   once.
 * - g. A blocked image: a 200 interaction `failed` with `image_safety` in its
 *   errors, and a 400 `image_safety`: each refused with the code and the
 *   API's words.
 * - h. `model` on chatgpt: refused, it has one; six references on chatgpt:
 *   refused, it takes five.
 * - i. gemini-3.1-flash-lite-image asked for 3840x2160: 16:9 at 1K, its one
 *   size, where the other models are asked 4K.
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
import { accountCredentialPath } from "../../../packages/core/src/paths/claude";
import { unhandled } from "../../../packages/core/src/unhandled";
import { imageGenerationWords } from "../../../packages/core/src/words/image-generation";
import type { Kit, Spec } from "../spec";

/** This probe's machine has no hub: a borrowed sign-in's ask goes nowhere. */
const NO_HUB = { borrowAsk: (): void => undefined };

/** A 1×1 PNG. */
const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
/** A JPEG's header to its SOF0, 64 × 48. */
const JPEG_64X48 = "/9j/4AAQSkZJRgABAQAAAQABAAD/wAARCAAwAEADASIAAhEBAxEB/9k=";
const KEY = "AIza-probe-key";
const BAD_KEY = "API key not valid. Please pass a valid API key.";
const QUOTA = "You have exceeded your daily quota.";
const BLOCKED = "Safety violations blocked image generation.";

/** What the mock answers next. */
type Answer = "image" | "bad-key" | "quota" | "blocked-failed" | "blocked-400";

/** One request the mock saw. */
interface Asked {
  body: {
    input?: Record<string, unknown>[];
    model?: string;
    response_format?: Record<string, unknown>;
  };
  key: string | null;
  path: string;
}

/** An interaction as create-interaction.md's Interaction resource has it. */
const interaction = (fields: Record<string, unknown>) => ({
  id: "v1_probe",
  object: "interaction",
  model: "gemini-nano-banana-2.1",
  created: "2026-11-05T12:00:00Z",
  updated: "2026-11-05T12:00:05Z",
  ...fields,
});

/** api-errors.md's error body: "an `error` object containing a `code` and `message`". */
const apiError = (status: number, code: string, message: string) =>
  Response.json({ error: { code, message } }, { status });

const spec: Spec = {
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
            return apiError(401, "authentication", BAD_KEY);
          case "quota":
            return apiError(429, "quota_exceeded", QUOTA);
          case "blocked-400":
            return apiError(400, "image_safety", BLOCKED);
          case "blocked-failed":
            return Response.json(
              interaction({
                status: "failed",
                steps: [],
                errors: [{ code: "image_safety", message: BLOCKED }],
              })
            );
          case "image":
            return Response.json(
              interaction({
                status: "completed",
                steps: [
                  {
                    type: "thought",
                    summary: [
                      {
                        type: "image",
                        mime_type: "image/jpeg",
                        data: JPEG_64X48,
                      },
                    ],
                  },
                  {
                    type: "model_output",
                    content: [
                      { type: "image", mime_type: "image/png", data: PNG_1X1 },
                    ],
                  },
                ],
              })
            );
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
          image: await generateImage(NO_HUB, out, {
            prompt: "a probe",
            ...input,
          }),
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
        "b. one POST /v1beta/interactions on that model, the key in x-goog-api-key, the prompt as text, an image at 3:2 and 2K, store false",
        asked.length === 1 &&
          first?.path === "/v1beta/interactions" &&
          first.key === KEY &&
          JSON.stringify(first.body) ===
            JSON.stringify({
              model: "gemini-nano-banana-2.1",
              input: [{ type: "text", text: "a probe" }],
              response_format: {
                type: "image",
                aspect_ratio: "3:2",
                image_size: "2K",
              },
              store: false,
            }),
        JSON.stringify(asked)
      );

      const edit = await attempt("image", {
        provider: "gemini-api",
        model: "gemini-3-pro-image",
        output_path: "c.png",
        reference_images: ["ref.png", "ref.jpg"],
      });
      const input = asked[0]?.body.input;
      check(
        "c. a chosen model and two references: that model, the prompt, then each reference as an image by its type",
        edit.ok &&
          edit.image.model === "gemini-3-pro-image" &&
          asked[0]?.body.model === "gemini-3-pro-image" &&
          JSON.stringify(input) ===
            JSON.stringify([
              { type: "text", text: "a probe" },
              { type: "image", mime_type: "image/png", data: PNG_1X1 },
              { type: "image", mime_type: "image/jpeg", data: JPEG_64X48 },
            ]) &&
          JSON.stringify(asked[0]?.body.response_format) ===
            JSON.stringify({ type: "image" }),
        JSON.stringify({ edit, input })
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
        "e. a bad key (401 authentication): refused naming the key, sent once, nothing saved",
        !badKey.ok &&
          badKey.error ===
            refused(imageGenerationWords.geminiKeyRefused(401, BAD_KEY)) &&
          asked.length === 1 &&
          !existsSync(join(out, "e.png")),
        JSON.stringify({ badKey, asked: asked.length })
      );

      const quota = await attempt("quota", {
        provider: "gemini-api",
        output_path: "f.png",
      });
      check(
        "f. 429 quota_exceeded: refused naming quota and the free tier, sent once",
        !quota.ok &&
          quota.error === refused(imageGenerationWords.geminiQuota(QUOTA)) &&
          asked.length === 1,
        JSON.stringify({ quota, asked: asked.length })
      );

      const blocked = await attempt("blocked-failed", {
        provider: "gemini-api",
        output_path: "g.png",
      });
      const blocked400 = await attempt("blocked-400", {
        provider: "gemini-api",
        output_path: "g.png",
      });
      const saidBlocked = refused(
        imageGenerationWords.geminiNoImage("image_safety", BLOCKED)
      );
      check(
        "g. a blocked image, as a failed interaction and as a 400: each refused with image_safety and the API's words, sent once",
        !blocked.ok &&
          blocked.error === saidBlocked &&
          !blocked400.ok &&
          blocked400.error === saidBlocked &&
          asked.length === 1 &&
          !existsSync(join(out, "g.png")),
        JSON.stringify({ blocked, blocked400 })
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

      const lite = await attempt("image", {
        provider: "gemini-api",
        model: "gemini-3.1-flash-lite-image",
        output_path: "i.png",
        size: "3840x2160",
      });
      const [liteAsked] = asked;
      kit.note(`i request: ${JSON.stringify(liteAsked?.body)}`);
      const pro = await attempt("image", {
        provider: "gemini-api",
        model: "gemini-3-pro-image",
        output_path: "i-pro.png",
        size: "3840x2160",
      });
      check(
        "i. gemini-3.1-flash-lite-image at 3840x2160: asked 16:9 at 1K, its one size; gemini-3-pro-image at the same size is asked 4K",
        lite.ok &&
          lite.image.model === "gemini-3.1-flash-lite-image" &&
          liteAsked?.body.model === "gemini-3.1-flash-lite-image" &&
          JSON.stringify(liteAsked.body.response_format) ===
            JSON.stringify({
              type: "image",
              aspect_ratio: "16:9",
              image_size: "1K",
            }) &&
          pro.ok &&
          JSON.stringify(asked[0]?.body.response_format) ===
            JSON.stringify({
              type: "image",
              aspect_ratio: "16:9",
              image_size: "4K",
            }),
        JSON.stringify({ lite, liteAsked, pro, proAsked: asked[0] })
      );
    } finally {
      server.stop(true);
      delete process.env.CAWCO_GEMINI_BASE_URL;
    }
  },
};

export default spec;
