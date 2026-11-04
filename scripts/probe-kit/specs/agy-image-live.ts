/**
 * One real image through the Antigravity provider (agent
 * image-providers/antigravity.ts) on this machine's own `agy`, signed in to
 * Google in the person's keyring: the proof the fake-agy spec
 * (image-antigravity) cannot give. Spends one image of the plan's quota, so
 * it runs only when named, on the host.
 *
 * - The image is saved at the asked path's `.jpg` (`asked` says the
 *   `.png` asked), as the JPEG agy made, its size read from it.
 * - Noted for the report: the result's words and notes (the exit agy ended
 *   on, the plan unread), the size against the 3:2 asked, and agy's
 *   conversation folder the image came from.
 *
 *   bun scripts/probe-kit/run.ts agy-image-live
 */
import { existsSync } from "node:fs";
import { mkdir, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { generateImage } from "../../../packages/agent/src/image-generation";
import { imageGenerationWords } from "../../../packages/core/src/words/image-generation";
import type { Kit, Spec } from "../kit";

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
      made = await generateImage(out, {
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
    const brain = join(homedir(), ".gemini", "antigravity-cli", "brain");
    const folders = await readdir(brain).catch(() => [] as string[]);
    const fresh: string[] = [];
    for (const folder of folders) {
      const info = await stat(join(brain, folder)).catch(() => undefined);
      if (info && info.mtimeMs >= started) {
        const files = await readdir(join(brain, folder), { recursive: true });
        fresh.push(`${folder}: ${files.join(", ")}`);
      }
    }
    kit.note(
      `agy's conversation folders since the run: ${fresh.join(" | ") || "none"}`
    );
  },
} satisfies Spec;
