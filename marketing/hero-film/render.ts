/**
 * Cuts the candidates from the filmed footage (capture/capture.ts):
 * for each, an MP4 (H.264, moov first for fast start), a WebM (VP9) and a
 * poster PNG of frame 0, under out/<candidate>/.
 *
 *   bun render.ts [candidate…]     (all of them when none is named)
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";

const HYPERFRAMES = "hyperframes@0.8.162";

interface Candidate {
  /**
   * Encoder CRF per format, where `delivery` quality would pass 4 MB: a
   * moving camera resamples every pixel of text each frame, and the push
   * came to 17.7 MB at `delivery`. H.264 28 holds it under 4 MB, a little
   * softer mid-move.
   */
  crf?: { mp4: number; webm: number };
  /** index.html's `cut` variable. */
  cut: string;
  /** The take it is cut from. */
  theme: "light" | "dark";
}

const PUSH_CRF = { mp4: 28, webm: 44 };

const CANDIDATES: Record<string, Candidate> = {
  still: { cut: "still", theme: "light" },
  push: { cut: "push", theme: "light", crf: PUSH_CRF },
  close: { cut: "close", theme: "light" },
  // The one also rendered at night: the calmest, the whole board always
  // in frame, nothing softened by a move.
  "still-night": { cut: "still", theme: "dark" },
};

const run = (command: string, args: string[]) =>
  execFileSync(command, args, { cwd: import.meta.dir, stdio: "inherit" });

const megabytes = (path: string) =>
  `${(statSync(join(import.meta.dir, path)).size / 1024 / 1024).toFixed(2)} MB`;

const seconds = (path: string) =>
  execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
    { cwd: import.meta.dir, encoding: "utf8" }
  ).trim();

const names = process.argv.slice(2);
for (const name of names.length > 0 ? names : Object.keys(CANDIDATES)) {
  const candidate = CANDIDATES[name];
  if (!candidate) {
    throw new Error(`no candidate ${name}`);
  }
  const dir = join("out", name);
  mkdirSync(join(import.meta.dir, dir), { recursive: true });
  const variables = JSON.stringify({
    cut: candidate.cut,
    footage: `assets/footage/board-${candidate.theme}.mp4`,
  });
  for (const format of ["mp4", "webm"] as const) {
    const quality = candidate.crf
      ? ["--crf", String(candidate.crf[format])]
      : ["-q", "delivery"];
    run("npx", [
      "--yes",
      HYPERFRAMES,
      "render",
      ".",
      "--quiet",
      "--skill=motion-graphics",
      "--fps",
      "60",
      // UI footage: frames are pulled from it losslessly.
      "--video-frame-format",
      "png",
      ...quality,
      "--format",
      format,
      "--variables",
      variables,
      "-o",
      join(dir, `hero.${format}`),
    ]);
  }
  run("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-i",
    join(dir, "hero.mp4"),
    "-frames:v",
    "1",
    join(dir, "poster.png"),
  ]);
  for (const file of ["hero.mp4", "hero.webm", "poster.png"]) {
    const path = join(dir, file);
    const length = file === "poster.png" ? "" : ` · ${seconds(path)}s`;
    console.log(`[render] ${path}: ${megabytes(path)}${length}`);
  }
}
