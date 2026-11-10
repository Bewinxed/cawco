/**
 * `generate_image`'s one orchestration (agent image-generation.ts) over its
 * provider seam (image-providers/), driven through the ChatGPT provider
 * against a mock of ChatGPT's backend, so what the orchestration does with
 * a provider's answer is read on the real path:
 *
 * - a. A PNG answered: saved at the asked path as a PNG, its size read from
 *   it, the result naming the provider and its model; the generations
 *   request carries the prompt, model, quality and size and no images.
 * - b. A JPEG answered: kept as made, at the asked path with `.jpg` for
 *   `.png`; the result says the asked path and the format, and nothing is
 *   at the asked `.png`.
 * - c. Bytes that are no image: refused in words, nothing saved.
 * - d. An output path that exists: refused before any request.
 * - e. A reference image: the request goes to edits, the reference as a
 *   data URL of its sniffed type.
 * - f. A reference that is no image: refused before any image request.
 * - g. `model` named on a provider with one model: refused before any
 *   request reaches the mock.
 * - h. The `.jpg` a JPEG would take already there: refused in words, the
 *   file there untouched.
 * - i. An output path naming a shell variable (`$TMPDIR/i.png`, as a
 *   session with no TMPDIR sent it): refused before any request, no folder
 *   named `$TMPDIR` made.
 * - j. A reference naming a shell variable (`$HOME/ref.png`): refused in
 *   the same words before any request.
 *
 * One ChatGPT sign-in is held under a scratch HOME (`ownHome`), far from
 * expiry; `CAWCO_CHATGPT_BASE_URL` points at the mock. Nothing reaches
 * ChatGPT.
 *
 *   bun scripts/probe-kit/run.ts image-providers
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generateImage } from "../../../packages/agent/src/image-generation";
import type { GeneratedImage } from "../../../packages/core/src/image-generation";
import { accountCredentialPath } from "../../../packages/core/src/paths/claude";
import { DAY_MS } from "../../../packages/core/src/time";
import { imageGenerationWords } from "../../../packages/core/src/words/image-generation";
import type { Kit, Spec } from "../spec";

/** This probe's machine has no hub: a borrowed sign-in's ask goes nowhere. */
const NO_HUB = { borrowAsk: (): void => undefined };

/** A 1×1 PNG. */
const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
/** A JPEG's header to its SOF0, 64 × 48: what the size read needs. */
const JPEG_64X48 = "/9j/4AAQSkZJRgABAQAAAQABAAD/wAARCAAwAEADASIAAhEBAxEB/9k=";

/** An unsigned JWT carrying the claims a Plus ChatGPT access token has. */
const token = (): string => {
  const part = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "none" })}.${part({
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acct-probe",
      chatgpt_plan_type: "plus",
    },
    "https://api.openai.com/profile": { email: "plus@probe.test" },
  })}.sig`;
};

/** One request the mock saw: its path and JSON body. */
interface Asked {
  body: Record<string, unknown>;
  path: string;
}

const spec: Spec = {
  group: "The hub and machines",
  name: "image-providers",
  ownHome:
    "it holds a CawCo account of its own under ~/.cawco/accounts, which the agent's account store reads from HOME",
  run: async (kit: Kit) => {
    const { check } = kit;
    const credential = accountCredentialPath("0-plus");
    await mkdir(join(credential, ".."), { recursive: true });
    await writeFile(
      credential,
      JSON.stringify({
        "openai-codex": {
          type: "oauth",
          access: token(),
          refresh: "refresh",
          expires: Date.now() + DAY_MS,
          accountId: "acct-probe",
        },
      })
    );
    let answer = PNG_1X1;
    const asked: Asked[] = [];
    const server = Bun.serve({
      port: 0,
      fetch: async (request) => {
        const path = new URL(request.url).pathname;
        const body = await request.json().catch(() => ({}));
        asked.push({ path, body });
        if (path === "/wham/usage") {
          return Response.json({ plan_type: "plus" });
        }
        if (path.startsWith("/codex/images/")) {
          return Response.json({ data: [{ b64_json: answer }] });
        }
        return new Response("not found", { status: 404 });
      },
    });
    process.env.CAWCO_CHATGPT_BASE_URL = `http://127.0.0.1:${server.port}`;
    const out = join(kit.out, "images");
    await mkdir(out, { recursive: true });
    const imageAsks = () =>
      asked.filter((one) => one.path.startsWith("/codex/images/"));
    /** One generation answering `bytes`: its result, or its error's words. */
    const attempt = async (
      bytes: string,
      input: Record<string, unknown>
    ): Promise<
      { ok: true; image: GeneratedImage } | { ok: false; error: string }
    > => {
      answer = bytes;
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
    try {
      const png = await attempt(PNG_1X1, {
        output_path: "a.png",
        quality: "low",
        size: "1024x1024",
      });
      kit.note(`a: ${JSON.stringify(png)}`);
      check(
        "a. a PNG: saved at the asked path, 1 × 1, by chatgpt on gpt-image-2, no asked path said",
        png.ok &&
          png.image.path === join(out, "a.png") &&
          png.image.format === "png" &&
          png.image.width === 1 &&
          png.image.height === 1 &&
          png.image.provider === "chatgpt" &&
          png.image.model === "gpt-image-2" &&
          png.image.asked === undefined &&
          existsSync(join(out, "a.png")),
        JSON.stringify(png)
      );
      const [generation] = imageAsks();
      check(
        "a. the request: generations, with prompt, model, quality and size, no images",
        imageAsks().length === 1 &&
          generation?.path === "/codex/images/generations" &&
          generation.body.prompt === "a probe" &&
          generation.body.model === "gpt-image-2" &&
          generation.body.quality === "low" &&
          generation.body.size === "1024x1024" &&
          !("images" in generation.body),
        JSON.stringify(asked)
      );
      if (png.ok) {
        kit.note(`a said: ${imageGenerationWords.saved(png.image)}`);
      }

      const jpeg = await attempt(JPEG_64X48, { output_path: "b.png" });
      check(
        "b. a JPEG: kept as made at b.jpg, 64 × 48, the asked b.png said, nothing at b.png",
        jpeg.ok &&
          jpeg.image.path === join(out, "b.jpg") &&
          jpeg.image.asked === join(out, "b.png") &&
          jpeg.image.format === "jpeg" &&
          jpeg.image.width === 64 &&
          jpeg.image.height === 48 &&
          !existsSync(join(out, "b.png")) &&
          (await readFile(join(out, "b.jpg"))).equals(
            Buffer.from(JPEG_64X48, "base64")
          ),
        JSON.stringify(jpeg)
      );
      if (jpeg.ok) {
        const said = imageGenerationWords.saved(jpeg.image);
        kit.note(`b said: ${said}`);
        check(
          "b. the result's words name the JPEG and the asked path",
          said.includes("JPEG") && said.includes(join(out, "b.png")),
          said
        );
      }

      const garbage = await attempt(
        Buffer.from("no image").toString("base64"),
        {
          output_path: "c.png",
        }
      );
      check(
        "c. bytes that are no image: refused in words, nothing saved",
        !garbage.ok &&
          garbage.error ===
            imageGenerationWords.refused(
              "chatgpt",
              imageGenerationWords.notAnImage("chatgpt")
            ) &&
          !existsSync(join(out, "c.png")) &&
          !existsSync(join(out, "c.jpg")),
        JSON.stringify(garbage)
      );

      const exists = await attempt(PNG_1X1, { output_path: "a.png" });
      check(
        "d. an output path that exists: refused, no image request",
        !exists.ok &&
          exists.error ===
            imageGenerationWords.outputExists(join(out, "a.png")) &&
          imageAsks().length === 0,
        JSON.stringify({ exists, asked })
      );

      const edit = await attempt(PNG_1X1, {
        output_path: "e.png",
        reference_images: ["a.png"],
      });
      const images = imageAsks()[0]?.body.images as
        { image_url: string }[] | undefined;
      check(
        "e. a reference: the request goes to edits, the reference a PNG data URL",
        edit.ok &&
          imageAsks()[0]?.path === "/codex/images/edits" &&
          images?.length === 1 &&
          images[0]?.image_url === `data:image/png;base64,${PNG_1X1}`,
        JSON.stringify({ edit, asked })
      );

      await writeFile(join(out, "not-an-image.png"), "text");
      const badReference = await attempt(PNG_1X1, {
        output_path: "f.png",
        reference_images: ["not-an-image.png"],
      });
      check(
        "f. a reference that is no image: refused, no image request",
        !badReference.ok &&
          badReference.error === imageGenerationWords.referenceNotImage() &&
          imageAsks().length === 0,
        JSON.stringify({ badReference, asked })
      );

      const model = await attempt(PNG_1X1, {
        output_path: "g.png",
        model: "gpt-image-1",
      });
      check(
        "g. model on a provider with one: refused, nothing reached the mock",
        !model.ok &&
          model.error ===
            imageGenerationWords.noModelChoice("chatgpt", "gpt-image-2") &&
          asked.length === 0,
        JSON.stringify({ model, asked })
      );

      await writeFile(join(out, "h.jpg"), "kept");
      const taken = await attempt(JPEG_64X48, { output_path: "h.png" });
      check(
        "h. the .jpg already there: refused in words, the file untouched",
        !taken.ok &&
          taken.error ===
            imageGenerationWords.formatPathTaken(join(out, "h.jpg")) &&
          (await readFile(join(out, "h.jpg"), "utf8")) === "kept" &&
          !existsSync(join(out, "h.png")),
        JSON.stringify(taken)
      );

      const unexpanded = await attempt(PNG_1X1, {
        output_path: "$TMPDIR/i.png",
      });
      check(
        "i. $TMPDIR/i.png outside a workspace: refused naming $TMPDIR, no request, no $TMPDIR folder",
        !unexpanded.ok &&
          unexpanded.error ===
            imageGenerationWords.unexpanded(
              "output_path",
              "$TMPDIR/i.png",
              "$TMPDIR"
            ) &&
          asked.length === 0 &&
          !existsSync(join(out, "$TMPDIR")),
        JSON.stringify({ unexpanded, asked })
      );

      const unexpandedRef = await attempt(PNG_1X1, {
        output_path: "j.png",
        reference_images: ["a.png", "$HOME/ref.png"],
      });
      check(
        "j. a reference naming $HOME: refused naming $HOME, no request, nothing saved",
        !unexpandedRef.ok &&
          unexpandedRef.error ===
            imageGenerationWords.unexpanded(
              "reference_images",
              "$HOME/ref.png",
              "$HOME"
            ) &&
          asked.length === 0 &&
          !existsSync(join(out, "j.png")),
        JSON.stringify({ unexpandedRef, asked })
      );
    } finally {
      server.stop(true);
      delete process.env.CAWCO_CHATGPT_BASE_URL;
    }
  },
};

export default spec;
