/**
 * `generate_image` through the Antigravity provider (agent
 * image-providers/antigravity.ts), driven against a fake `agy` first on the
 * PATH under a scratch HOME (fake-agy.ts), so no Google quota is spent:
 *
 * - a. Signed out: refused before any image run, naming the fix and the
 *   other provider, in the line agy said it with.
 * - l. Signed in by its own read, and its image run says it is signed out:
 *   refused within a few seconds, in the line agy said it with. agy says
 *   it and then waits 60 s for a login (fake-agy.ts, as agy 1.5.2 does);
 *   the run ends where it is said (agent tools.ts `heardUntilSignedOut`).
 * - b. Two reference images (a PNG, a JPEG): saved; each is written into
 *   agy's own working folder as `reference-<n>` by its type, the bytes the
 *   call named, before agy starts; the prompt numbers them as the call's
 *   prompt names them and asks for them as generate_image's `ImagePaths` in
 *   order; the folder is gone after the run. A reference that is no image:
 *   refused before any image run, by the one check every provider shares.
 * - c. `model`: refused, agy has one image model.
 * - d. The image written, then `NOT_FOUND (code 404)`, exit 1 (as agy 1.5.0
 *   ended on Pro): the image is taken from agy's conversation folder, kept
 *   as the JPEG it is at the asked path's `.jpg`, and the result says the
 *   exit's words and that the plan wasn't read; the run asked print mode
 *   for JSON, the answer schema, its own timeout and the size's aspect
 *   ratio, no references, and no skipped permissions.
 * - e. A clean run, quality high: saved, and quality said to have no effect.
 * - f. 429 RESOURCE_EXHAUSTED: refused as a spent quota, no file.
 * - g. 500 INTERNAL (every run on Plus): refused naming the plan.
 * - h. SUCCESS with no image written: refused, no file.
 * - i. A run the orchestration stops (its signal): the provider's run is
 *   ended and answers no image.
 * - j. A reference is never agy's image: a run that writes none with the
 *   references left in its folder is refused, not answered with one, as
 *   is a run that answers a reference's path; and agy's answer saying why
 *   reaches the refusal in its words.
 * - k. Four references, one over agy's tool's three: refused before any
 *   image run, naming three.
 *
 *   bun scripts/probe-kit/run.ts image-antigravity
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { generateImage } from "../../../packages/agent/src/image-generation";
import {
  antigravity,
  promptOf,
} from "../../../packages/agent/src/image-providers/antigravity";
import type { GeneratedImage } from "../../../packages/core/src/image-generation";
import { imageGenerationWords } from "../../../packages/core/src/words/image-generation";
import { fakeAgy } from "../fake-agy";
import type { Kit, Spec } from "../kit";

/** This probe's machine has no hub: a borrowed sign-in's ask goes nowhere. */
const NO_HUB = { borrowAsk: (): void => undefined };

/** A 1×1 PNG. */
const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
/** A JPEG's header to its SOF0, 32 × 24: a reference, other bytes than the image fake agy makes, which a reference's never count as. */
const JPEG_32X24 = "/9j/4AAQSkZJRgABAQAAAQABAAD/wAARCAAYACADASIAAhEBAxEB/9k=";
const sha = (base64: string): string =>
  createHash("sha256").update(Buffer.from(base64, "base64")).digest("hex");

/** The line agy 1.5.2 says it is signed out with (fake-agy.ts). */
const SIGNED_OUT_LINE =
  "Authentication required. Please visit the URL to log in:";
/**
 * How long a signed-out image run may take: agy says it at once and then
 * waits 60 s for a login, so a run that ends where it is said answers in
 * well under this.
 */
const SIGNED_OUT_RUN_MS = 5000;

const NOT_FOUND = "NOT_FOUND (code 404): Requested entity was not found.";
const QUOTA =
  "RESOURCE_EXHAUSTED (code 429): You have exhausted your capacity on this model. Your quota will reset after 3s.";
const INTERNAL = "INTERNAL (code 500): Internal error encountered.";
const TOOL_REFUSED =
  "Error invalid tool call: invalid arguments: - at '/ImagePaths': maxItems: got 14, want 3";

/** The prompt of the run with references, naming each by its number. */
const PALETTE_PROMPT =
  "Image 1: the palette to follow. Image 2: the subject to keep.";

type Attempt = (
  input: Record<string, unknown>
) => Promise<
  { ok: true; image: GeneratedImage } | { ok: false; error: string }
>;

/** b: two references reach agy as files in its folder and as ImagePaths in its prompt; a reference that is no image is refused before any run. */
const referencesRun = async (
  kit: Kit,
  agy: Awaited<ReturnType<typeof fakeAgy>>,
  attempt: Attempt,
  imageRuns: () => Promise<string[][]>
): Promise<void> => {
  const { check } = kit;
  const out = join(kit.out, "images");
  await agy.seen();
  const references = await attempt({
    prompt: PALETTE_PROMPT,
    output_path: "b.png",
    reference_images: ["ref.png", "ref.jpg"],
  });
  const [referenceRun] = await imageRuns();
  const seen = await agy.seen();
  const said = referenceRun?.[1] ?? "";
  const [first, second] = [...seen.keys()];
  kit.note(`b run: ${JSON.stringify(referenceRun)}`);
  kit.note(`b seen: ${JSON.stringify([...seen])}`);
  check(
    "b. two references: saved at b.jpg",
    references.ok && existsSync(join(out, "b.jpg")),
    JSON.stringify(references)
  );
  check(
    "b. each written in agy's own folder as reference-<n> by its type, the bytes named, before it ran",
    seen.size === 2 &&
      first?.endsWith("/reference-1.png") === true &&
      second === join(dirname(first), "reference-2.jpg") &&
      seen.get(first) === sha(PNG_1X1) &&
      seen.get(second) === sha(JPEG_32X24),
    JSON.stringify([...seen])
  );
  check(
    "b. the prompt numbers them and asks for them as ImagePaths, in order, under the call's own prompt",
    first !== undefined &&
      second !== undefined &&
      said ===
        promptOf(
          {
            prompt: PALETTE_PROMPT,
            model: "gemini-3.1-flash-image",
            quality: "auto",
            size: "auto",
            references: [],
          },
          [first, second]
        ) &&
      said.includes(PALETTE_PROMPT) &&
      said.includes(`Image 1: ${first}\nImage 2: ${second}`) &&
      said.includes(JSON.stringify([first, second])),
    said
  );
  check(
    "b. agy's folder, references and all, is gone after the run",
    first !== undefined && !existsSync(dirname(first)),
    first ?? "no reference seen"
  );

  const notImage = await attempt({
    output_path: "b2.png",
    reference_images: ["notes.png"],
  });
  check(
    "b. a reference that is no image: refused before any image run",
    !notImage.ok &&
      notImage.error === imageGenerationWords.referenceNotImage() &&
      (await imageRuns()).length === 0,
    JSON.stringify(notImage)
  );
};

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
    await writeFile(join(out, "ref.png"), Buffer.from(PNG_1X1, "base64"));
    await writeFile(join(out, "ref.jpg"), Buffer.from(JPEG_32X24, "base64"));
    await writeFile(join(out, "notes.png"), "text");
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
          image: await generateImage(NO_HUB, out, {
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
          refused(imageGenerationWords.agySignedOut(SIGNED_OUT_LINE)) &&
        signedOut.error.includes('provider "chatgpt"') &&
        (await imageRuns()).length === 0,
      JSON.stringify(signedOut)
    );

    await agy.signedIn(true);
    await agy.mode("signed-out");
    const asked = performance.now();
    const runSignedOut = await attempt({ output_path: "l.png" });
    const tookMs = performance.now() - asked;
    kit.note(`l: ${JSON.stringify(runSignedOut)}`);
    check(
      `l. an image run that says it is signed out: refused within ${SIGNED_OUT_RUN_MS / 1000} s, in agy's line, no file`,
      !runSignedOut.ok &&
        runSignedOut.error ===
          refused(imageGenerationWords.agySignedOut(SIGNED_OUT_LINE)) &&
        tookMs < SIGNED_OUT_RUN_MS &&
        !existsSync(join(out, "l.jpg")),
      `${(tookMs / 1000).toFixed(2)} s: ${JSON.stringify(runSignedOut)}`
    );
    await agy.mode("image");
    await referencesRun(kit, agy, attempt, imageRuns);

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
      "d. the run: print mode, JSON out, the answer schema, 9m of its own, the size's 3:2, no references, no skipped permissions",
      run !== undefined &&
        run[0] === "-p" &&
        (run[1] ?? "").includes("a probe") &&
        (run[1] ?? "").includes("Aspect ratio: 3:2.") &&
        run.join(" ").includes("--output-format json") &&
        run.includes("--json-schema") &&
        !(run[1] ?? "").includes("ImagePaths") &&
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
            imageGenerationWords.qualityIgnored("antigravity", "high"),
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

    await agy.mode("no-image");
    const twoRefs = { reference_images: ["ref.png", "ref.jpg"] };
    const leftBehind = await attempt({ output_path: "j.png", ...twoRefs });
    check(
      "j. no image written, the references left in agy's folder: refused, no file",
      !leftBehind.ok &&
        leftBehind.error ===
          refused(imageGenerationWords.agyNoImage("SUCCESS", "", "")) &&
        !existsSync(join(out, "j.png")) &&
        !existsSync(join(out, "j.jpg")),
      JSON.stringify(leftBehind)
    );
    await agy.mode("answers-reference");
    const answeredRef = await attempt({ output_path: "j2.png", ...twoRefs });
    check(
      "j. a run answering a reference's path as its image: refused, no file",
      !answeredRef.ok &&
        answeredRef.error ===
          refused(imageGenerationWords.agyNoImage("SUCCESS", "", "")) &&
        !existsSync(join(out, "j2.png")) &&
        !existsSync(join(out, "j2.jpg")),
      JSON.stringify(answeredRef)
    );
    await agy.mode("tool-refused");
    const toolRefused = await attempt({ output_path: "j3.png", ...twoRefs });
    check(
      "j. agy's answer saying why: carried in the refusal's words",
      !toolRefused.ok &&
        toolRefused.error ===
          refused(imageGenerationWords.agyNoImage("SUCCESS", "", TOOL_REFUSED)),
      JSON.stringify(toolRefused)
    );

    await agy.mode("image");
    const four = await attempt({
      output_path: "k.png",
      reference_images: ["ref.png", "ref.jpg", "ref.png", "ref.jpg"],
    });
    check(
      "k. four references: refused before any image run, naming three",
      !four.ok &&
        four.error ===
          refused(imageGenerationWords.tooManyReferences("antigravity", 3)) &&
        antigravity.references === 3 &&
        (await imageRuns()).length === 0 &&
        !existsSync(join(out, "k.jpg")),
      JSON.stringify(four)
    );

    await agy.mode("hang");
    const ready = await antigravity.readiness(NO_HUB);
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
