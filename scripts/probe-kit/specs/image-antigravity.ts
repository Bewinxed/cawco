/**
 * `generate_image` through the Antigravity provider (agent
 * image-providers/antigravity.ts), driven against a fake `agy` first on the
 * PATH under a scratch HOME (fake-agy.ts), so no Google quota is spent:
 *
 * - a. Signed out: refused before any image run, naming the fix and the
 *   other provider.
 * - b. Reference images: refused before anything is read or run, naming
 *   the API route and the other provider.
 * - c. `model`: refused, agy has one image model.
 * - d. The image written, then `NOT_FOUND (code 404)`, exit 1 (as agy 1.5.0
 *   ended on Pro): the image is taken from agy's conversation folder, kept
 *   as the JPEG it is at the asked path's `.jpg`, and the result says the
 *   exit's words and that the plan wasn't read; the run asked print mode
 *   for JSON, the answer schema, its own timeout and the size's aspect
 *   ratio, and no skipped permissions.
 * - e. A clean run, quality high: saved, and quality said to have no effect.
 * - f. 429 RESOURCE_EXHAUSTED: refused as a spent quota, no file.
 * - g. 500 INTERNAL (every run on Plus): refused naming the plan.
 * - h. SUCCESS with no image written: refused, no file.
 * - i. A run the orchestration stops (its signal): the provider's run is
 *   ended and answers no image.
 *
 *   bun scripts/probe-kit/run.ts image-antigravity
 */
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { generateImage } from "../../../packages/agent/src/image-generation";
import { antigravity } from "../../../packages/agent/src/image-providers/antigravity";
import type { GeneratedImage } from "../../../packages/core/src/image-generation";
import { imageGenerationWords } from "../../../packages/core/src/words/image-generation";
import { fakeAgy } from "../fake-agy";
import type { Kit, Spec } from "../kit";

const NOT_FOUND = "NOT_FOUND (code 404): Requested entity was not found.";
const QUOTA =
  "RESOURCE_EXHAUSTED (code 429): You have exhausted your capacity on this model. Your quota will reset after 3s.";
const INTERNAL = "INTERNAL (code 500): Internal error encountered.";

export default {
  group: "The hub and machines",
  name: "image-antigravity",
  ownHome:
    "it puts a fake agy in ~/.local/bin and its conversation folders under ~/.gemini, which the provider reads from HOME",
  run: async (kit: Kit) => {
    const { check } = kit;
    const agy = await fakeAgy();
    const out = join(kit.out, "images");
    await mkdir(out, { recursive: true });
    /** One generation through antigravity: its result, or its error's words. */
    const attempt = async (
      input: Record<string, unknown>
    ): Promise<
      { ok: true; image: GeneratedImage } | { ok: false; error: string }
    > => {
      await agy.runs();
      try {
        return {
          ok: true,
          image: await generateImage(out, {
            prompt: "a probe",
            provider: "antigravity",
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
    const imageRuns = async () =>
      (await agy.runs()).filter(
        (argv) => argv[0] === "-p" && argv[1] !== "/usage"
      );
    const refused = (reason: string) =>
      imageGenerationWords.refused("antigravity", reason);

    const signedOut = await attempt({ output_path: "a.png" });
    kit.note(`a: ${JSON.stringify(signedOut)}`);
    check(
      "a. signed out: refused before any image run, naming the sign-in and chatgpt",
      !signedOut.ok &&
        signedOut.error ===
          refused(
            imageGenerationWords.agySignedOut("Error: authentication required")
          ) &&
        signedOut.error.includes('provider "chatgpt"') &&
        (await imageRuns()).length === 0,
      JSON.stringify(signedOut)
    );

    await agy.signedIn(true);
    const references = await attempt({
      output_path: "b.png",
      reference_images: ["missing.png"],
    });
    check(
      "b. reference images: refused before anything is read or run, naming the API route and chatgpt",
      !references.ok &&
        references.error ===
          refused(imageGenerationWords.tooManyReferences("antigravity", 0)) &&
        references.error.includes("Gemini API route") &&
        (await agy.runs()).length === 0,
      JSON.stringify(references)
    );

    const model = await attempt({ output_path: "c.png", model: "other" });
    check(
      "c. model: refused, one image model",
      !model.ok &&
        model.error ===
          imageGenerationWords.noModelChoice(
            "antigravity",
            "gemini-3.1-flash-image"
          ),
      JSON.stringify(model)
    );

    await agy.mode("image-then-404");
    await agy.runs();
    const notFound = await attempt({ output_path: "d.png", size: "1536x1024" });
    const [run] = await imageRuns();
    kit.note(`d: ${JSON.stringify(notFound)}`);
    check(
      "d. image then 404: kept as the JPEG at d.jpg, 64 × 48, by antigravity on gemini-3.1-flash-image",
      notFound.ok &&
        notFound.image.path === join(out, "d.jpg") &&
        notFound.image.asked === join(out, "d.png") &&
        notFound.image.format === "jpeg" &&
        notFound.image.width === 64 &&
        notFound.image.height === 48 &&
        notFound.image.provider === "antigravity" &&
        notFound.image.model === "gemini-3.1-flash-image" &&
        existsSync(join(out, "d.jpg")),
      JSON.stringify(notFound)
    );
    check(
      "d. the result says the exit's words and that the plan wasn't read",
      notFound.ok &&
        JSON.stringify(notFound.image.notes) ===
          JSON.stringify([
            imageGenerationWords.agyPlanUnread,
            imageGenerationWords.agyEndedAfterImage(NOT_FOUND),
          ]),
      JSON.stringify(notFound)
    );
    kit.note(`d run: ${JSON.stringify(run)}`);
    check(
      "d. the run: print mode, JSON out, the answer schema, 9m of its own, the size's 3:2, no skipped permissions",
      run !== undefined &&
        run[0] === "-p" &&
        (run[1] ?? "").includes("a probe") &&
        (run[1] ?? "").includes("Aspect ratio: 3:2.") &&
        run.join(" ").includes("--output-format json") &&
        run.includes("--json-schema") &&
        run.join(" ").includes("--print-timeout 9m") &&
        !run.some((arg) => arg.includes("dangerously")),
      JSON.stringify(run)
    );
    if (notFound.ok) {
      kit.note(`d said: ${imageGenerationWords.saved(notFound.image)}`);
    }

    await agy.mode("image");
    const clean = await attempt({ output_path: "e.png", quality: "high" });
    check(
      "e. a clean run, quality high: saved, quality said to have no effect, no exit note",
      clean.ok &&
        existsSync(join(out, "e.jpg")) &&
        JSON.stringify(clean.image.notes) ===
          JSON.stringify([
            imageGenerationWords.agyPlanUnread,
            imageGenerationWords.agyQualityIgnored("high"),
          ]),
      JSON.stringify(clean)
    );

    await agy.mode("quota");
    const quota = await attempt({ output_path: "f.png" });
    check(
      "f. 429: refused as a spent quota, no file",
      !quota.ok &&
        quota.error === refused(imageGenerationWords.agyQuota(QUOTA)) &&
        !existsSync(join(out, "f.jpg")),
      JSON.stringify(quota)
    );

    await agy.mode("internal");
    const internal = await attempt({ output_path: "g.png" });
    check(
      "g. 500 INTERNAL: refused naming the plan, no file",
      !internal.ok &&
        internal.error ===
          refused(imageGenerationWords.agyInternal(INTERNAL)) &&
        !existsSync(join(out, "g.jpg")),
      JSON.stringify(internal)
    );

    await agy.mode("no-image");
    const none = await attempt({ output_path: "h.png" });
    check(
      "h. SUCCESS with no image written: refused, no file",
      !none.ok &&
        none.error ===
          refused(imageGenerationWords.agyNoImage("SUCCESS", "", "")) &&
        !existsSync(join(out, "h.jpg")),
      JSON.stringify(none)
    );

    await agy.mode("hang");
    const ready = await antigravity.readiness();
    if (!ready.ready) {
      check("i. ready before the stopped run", false, ready.reason);
      return;
    }
    const stop = new AbortController();
    const running = ready
      .generate(
        {
          prompt: "a probe",
          model: "gemini-3.1-flash-image",
          quality: "auto",
          size: "auto",
          references: [],
        },
        stop.signal
      )
      .then(
        () => "made",
        (error: unknown) =>
          error instanceof Error ? error.message : String(error)
      );
    // Stopped once agy's run has started.
    while ((await agy.runs()).length === 0) {
      await Bun.sleep(50);
    }
    stop.abort();
    const stopped = await running;
    check(
      "i. a run the orchestration stops: ended, no image",
      stopped !== "made",
      stopped
    );
  },
} satisfies Spec;
