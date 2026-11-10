/**
 * One real image through the Antigravity provider (agent
 * image-providers/antigravity.ts) on this machine's own `agy`, signed in to
 * Google in the person's keyring: the proof the fake-agy spec
 * (image-antigravity) cannot give. Spends two images of the plan's quota,
 * so it runs only when named, on the host.
 *
 * - The image is saved at the asked path's `.jpg` (`asked` says the
 *   `.png` asked), as the JPEG agy made, its size read from it.
 * - With one reference image (`AGY_LIVE_REFERENCE`, else the design kit's
 *   brand board at `~/cawco-design-kit/04-brand-board.png`): saved, and
 *   agy's transcripts of the run hold exactly one `generate_image` call,
 *   its `ImagePaths` the one reference CawCo wrote in agy's folder.
 * - Noted for the report: the result's words and notes (the exit agy ended
 *   on, the plan unread), the size against the 3:2 asked, agy's
 *   conversation folders the image came from, and which of them called
 *   `invoke_subagent` and `generate_image`.
 *
 *   bun scripts/probe-kit/run.ts agy-image-live
 */
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { generateImage } from "../../../packages/agent/src/image-generation";
import { imageGenerationWords } from "../../../packages/core/src/words/image-generation";
import type { Kit, Spec } from "../kit";

/** This probe's machine has no hub: a borrowed sign-in's ask goes nowhere. */
const NO_HUB = { borrowAsk: (): void => undefined };

/** The one reference as the provider writes it in agy's own folder. */
const WRITTEN_REFERENCE = /\/cawco-agy-image-[^/]+\/reference-1\.png$/u;

/** Where agy keeps each conversation's files. */
const brain = join(homedir(), ".gemini", "antigravity-cli", "brain");

/** Each of agy's conversation folders written since `since`. */
const freshFolders = async (since: number): Promise<string[]> => {
  const fresh: string[] = [];
  for (const folder of await readdir(brain).catch(() => [] as string[])) {
    const info = await stat(join(brain, folder)).catch(() => undefined);
    if (info && info.mtimeMs >= since) {
      fresh.push(folder);
    }
  }
  return fresh;
};

/**
 * Every object anywhere in `value` that carries `ImagePaths`, the argument
 * agy's `generate_image` takes its references by: a JSON string inside is
 * read too, as a tool call's arguments may be logged as one.
 */
const imageCalls = (value: unknown): Record<string, unknown>[] => {
  if (typeof value === "string") {
    if (!value.trimStart().startsWith("{")) {
      return [];
    }
    try {
      return imageCalls(JSON.parse(value));
    } catch {
      return [];
    }
  }
  if (Array.isArray(value)) {
    return value.flatMap(imageCalls);
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return [
      ...(Array.isArray(record.ImagePaths) ? [record] : []),
      ...Object.values(record).flatMap(imageCalls),
    ];
  }
  return [];
};

/** What one conversation folder's transcripts (`*.jsonl` under it) say of the run. */
const transcriptOf = async (
  folder: string
): Promise<{ calls: Record<string, unknown>[]; subagent: boolean }> => {
  const dir = join(brain, folder);
  const files = (await readdir(dir, { recursive: true })).filter((name) =>
    name.endsWith(".jsonl")
  );
  const calls: Record<string, unknown>[] = [];
  let subagent = false;
  for (const file of files) {
    for (const line of (await readFile(join(dir, file), "utf8")).split("\n")) {
      subagent ||= line.includes("invoke_subagent");
      try {
        calls.push(...imageCalls(JSON.parse(line)));
      } catch {
        // Not a JSON line.
      }
    }
  }
  return { calls, subagent };
};

export default {
  group: "The hub and machines",
  name: "agy-image-live",
  host: "it runs the machine's own agy, signed in to Google in the person's keyring, which no workspace boundary reaches, and spends one image of that plan's quota",
  run: async (kit: Kit) => {
    const { check } = kit;
    const out = join(kit.out, "live");
    await mkdir(out, { recursive: true });
    const started = Date.now();
    let made: Awaited<ReturnType<typeof generateImage>> | undefined;
    try {
      made = await generateImage(NO_HUB, out, {
        prompt:
          "A small ceramic crow figurine on a wooden desk beside a coffee mug, soft morning window light, photographic.",
        output_path: "agy-live.png",
        provider: "antigravity",
        size: "1536x1024",
      });
    } catch (error) {
      kit.note(`refused: ${error instanceof Error ? error.message : error}`);
    }
    kit.note(`took ${Math.round((Date.now() - started) / 1000)} s`);
    if (made) {
      kit.note(`result: ${JSON.stringify(made)}`);
      kit.note(`said: ${imageGenerationWords.saved(made)}`);
      kit.note(
        `ratio ${(made.width / made.height).toFixed(3)} for 3:2 (1.500) asked`
      );
    }
    check(
      "the image is saved at the asked path's .jpg, a JPEG with its size",
      made !== undefined &&
        made.provider === "antigravity" &&
        made.format === "jpeg" &&
        made.path === join(out, "agy-live.jpg") &&
        made.asked === join(out, "agy-live.png") &&
        made.width > 0 &&
        made.height > 0 &&
        existsSync(made.path),
      JSON.stringify(made)
    );
    const fresh: string[] = [];
    for (const folder of await freshFolders(started)) {
      const files = await readdir(join(brain, folder), { recursive: true });
      fresh.push(`${folder}: ${files.join(", ")}`);
    }
    kit.note(
      `agy's conversation folders since the run: ${fresh.join(" | ") || "none"}`
    );

    const reference =
      process.env.AGY_LIVE_REFERENCE ??
      join(homedir(), "cawco-design-kit", "04-brand-board.png");
    const guidedStart = Date.now();
    let guided: Awaited<ReturnType<typeof generateImage>> | undefined;
    try {
      guided = await generateImage(NO_HUB, out, {
        prompt:
          "Image 1: the brand board whose style to follow: its flat chunky shapes, thick ink-black outlines, and only its colours (ink black, ivory, vermilion #E65D46, butter #F2D36B). A crow mascot perched on a stack of three books, square, on an ivory ground, no text.",
        output_path: "agy-live-guided.png",
        provider: "antigravity",
        size: "1024x1024",
        reference_images: [reference],
      });
    } catch (error) {
      kit.note(
        `guided refused: ${error instanceof Error ? error.message : error}`
      );
    }
    kit.note(
      `guided took ${Math.round((Date.now() - guidedStart) / 1000)} s, reference ${reference}`
    );
    if (guided) {
      kit.note(`guided said: ${imageGenerationWords.saved(guided)}`);
    }
    check(
      "with a reference: the image is saved at the asked path's .jpg",
      guided !== undefined &&
        guided.path === join(out, "agy-live-guided.jpg") &&
        existsSync(guided.path),
      JSON.stringify(guided)
    );
    const calls: Record<string, unknown>[] = [];
    for (const folder of await freshFolders(guidedStart)) {
      const read = await transcriptOf(folder);
      kit.note(
        `${folder}: invoke_subagent ${read.subagent ? "called" : "not called"}; generate_image calls ${JSON.stringify(read.calls)}`
      );
      calls.push(...read.calls);
    }
    // One call may be logged more than once (as asked and as done, or in
    // the parent's and the subagent's transcripts): counted by what it asked.
    const distinct = new Map(
      calls.map((call) => [
        JSON.stringify([call.Prompt, call.ImagePaths]),
        call.ImagePaths,
      ])
    );
    const paths = [...distinct.values()];
    check(
      "with a reference: one generate_image call, its ImagePaths the one reference CawCo wrote in agy's folder",
      paths.length === 1 &&
        Array.isArray(paths[0]) &&
        paths[0].length === 1 &&
        WRITTEN_REFERENCE.test(String(paths[0][0])),
      JSON.stringify(paths)
    );
  },
} satisfies Spec;
