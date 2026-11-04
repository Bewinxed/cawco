import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { homedir, hostname, platform, tmpdir } from "node:os";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { toolSpec } from "@cawco/core";
import { signalGroup, spawnedPid } from "@cawco/core/signal";
import { imageGenerationWords } from "@cawco/core/words/image-generation";
import { systemProgram } from "@cawco/core/workspace-needs";
import { z } from "zod";
import { probeToolStatus, toolBinary, toolEnv } from "../tools";
import { ratioOf } from "./aspect";
import type { ImageJob, ImageProvider, MadeImage } from "./provider";

/**
 * Gemini through the Antigravity CLI on this machine (`agy`), on the
 * person's own Google AI subscription there. CawCo only runs the `agy`
 * binary in print mode and reads what it prints and the files it writes: it
 * makes no request to Google of its own, which Antigravity's terms §6 would
 * make a breach ("Using third party software, tools, or services to access
 * the Service … is a breach", https://antigravity.google/terms), and it
 * never reads or holds the CLI's login. Print mode is documented for this
 * ("Run Antigravity CLI non-interactively to script agent tasks",
 * https://antigravity.google/docs/cli/headless/).
 */

/** Where agy keeps each conversation's files (`--gemini-dir` `.gemini`, `--app-data-dir` `antigravity-cli`, their defaults). */
const brainDir = (): string =>
  join(homedir(), ".gemini", "antigravity-cli", "brain");

/** The answer the run is held to: the saved image's path (`--json-schema`). */
const ANSWER_SCHEMA = JSON.stringify({
  type: "object",
  properties: { path: { type: "string" } },
  required: ["path"],
});

/**
 * agy's own limit on the run, under the orchestration's ten minutes, so the
 * CLI ends itself and says so before CawCo stops waiting.
 */
const PRINT_TIMEOUT = "9m";

/** What agy is asked: one image through its image tool, and its saved path as the answer. */
const promptOf = (job: ImageJob): string => {
  const ratio = ratioOf(job.size);
  return [
    "Make exactly one image with your image generation tool, then stop.",
    `The image: ${job.prompt}`,
    ...(ratio ? [`Aspect ratio: ${ratio}.`] : []),
    "Do not edit files, run commands or make anything else. Wait until the image generation tool has saved the image, then answer with the absolute path of the saved image file.",
  ].join("\n\n");
};

/** The JSON envelope print mode ends on (headless doc "JSON"): the fields read here. */
const envelopeSchema = z.looseObject({
  conversation_id: z.string().optional(),
  status: z.string().optional(),
  error: z.string().optional(),
  structured_output: z.looseObject({ path: z.string().optional() }).optional(),
});
type Envelope = z.infer<typeof envelopeSchema>;

/** The last line of `out` that is the envelope, if any. */
const envelopeOf = (out: string): Envelope | undefined => {
  for (const line of out.trim().split("\n").reverse()) {
    try {
      const read = envelopeSchema.safeParse(JSON.parse(line));
      if (read.success) {
        return read.data;
      }
    } catch {
      // Not the envelope: agy printed something else on this line.
    }
  }
  return undefined;
};

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg"]);

/** Each image file under `dir`, written since `since` (ms epoch), newest first. */
const imagesUnder = async (dir: string, since: number): Promise<string[]> => {
  const names = await readdir(dir, { recursive: true }).catch(() => []);
  const found: { mtime: number; path: string }[] = [];
  for (const name of names) {
    const path = join(dir, name);
    if (!IMAGE_EXTENSIONS.has(extname(path).toLowerCase())) {
      continue;
    }
    const info = await stat(path).catch(() => undefined);
    if (info?.isFile() && info.mtimeMs >= since) {
      found.push({ path, mtime: info.mtimeMs });
    }
  }
  return found.sort((a, b) => b.mtime - a.mtime).map((one) => one.path);
};

/** Whether `path` is inside `dir`. */
const inside = (dir: string, path: string): boolean => {
  const rel = relative(dir, resolve(path));
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
};

/**
 * The image the run made: the path it answered when that is a file it
 * wrote in its conversation's folder (or the run's own folder) since it
 * started; else the newest image it wrote there. agy writes its image in
 * its conversation's folder, not where it is asked
 * (`~/.gemini/antigravity-cli/brain/<conversation_id>/<name>_<time>.jpg`,
 * measured on agy 1.5.0, 2026-11-04).
 */
const madeImage = async (
  envelope: Envelope | undefined,
  cwd: string,
  since: number
): Promise<string | undefined> => {
  const id = envelope?.conversation_id;
  const conversation = id ? join(brainDir(), id) : undefined;
  const places = [conversation, cwd].filter(
    (place): place is string => place !== undefined
  );
  const answered = envelope?.structured_output?.path;
  if (answered && places.some((place) => inside(place, answered))) {
    const info = await stat(answered).catch(() => undefined);
    if (
      info?.isFile() &&
      info.mtimeMs >= since &&
      IMAGE_EXTENSIONS.has(extname(answered).toLowerCase())
    ) {
      return answered;
    }
  }
  for (const place of places) {
    const [newest] = await imagesUnder(place, since);
    if (newest) {
      return newest;
    }
  }
  return undefined;
};

/** What agy says when it is not signed in (headless doc), out of quota, and failed inside Google's service (measured on Plus). */
const SIGNED_OUT = /authentication required/iu;
const QUOTA = /RESOURCE_EXHAUSTED|code 429/u;
const INTERNAL = /INTERNAL \(code 500\)|\b500 INTERNAL\b/u;

/** A run that ended with no image, as a refusal in words, by what agy said. */
const noImage = (envelope: Envelope | undefined, said: string): Error => {
  const error = envelope?.error ?? "";
  const all = `${error}\n${said}`;
  if (SIGNED_OUT.test(all)) {
    return new Error(imageGenerationWords.agySignedOut(error || said));
  }
  if (QUOTA.test(all)) {
    return new Error(imageGenerationWords.agyQuota(error || said));
  }
  if (INTERNAL.test(all)) {
    return new Error(imageGenerationWords.agyInternal(error || said));
  }
  return new Error(
    imageGenerationWords.agyNoImage(
      envelope?.status ?? "no answer",
      error,
      said
    )
  );
};

/** The last lines of what agy said on its errors, for a sentence. */
const tailOf = (text: string): string =>
  Bun.stripANSI(text).trim().split("\n").slice(-4).join(" / ").slice(0, 600);

/**
 * One print-mode run of `bin` in a folder of its own: its prompt asks for
 * one image and its path; the image is found where agy wrote it
 * ({@link madeImage}), whatever the run's exit, and a run that ended in an
 * error after writing it is said in a note (agy 1.5.0 on Pro ended
 * `NOT_FOUND (code 404)` after its image, measured).
 */
const runAgy = async (
  bin: string,
  job: ImageJob,
  signal: AbortSignal
): Promise<MadeImage> => {
  const cwd = await mkdtemp(join(tmpdir(), "cawco-agy-image-"));
  const since = Date.now() - 1000;
  try {
    // Its whole process tree is ended when the orchestration stops
    // waiting: agy starts a language server of its own beside it. On Linux
    // and macOS it leads a process group of its own, signalled whole; on
    // Windows, which has no process groups, `taskkill /T` ends the process
    // and every process it started.
    const grouped = platform() !== "win32";
    const child = Bun.spawn(
      [
        bin,
        "-p",
        promptOf(job),
        "--output-format",
        "json",
        "--json-schema",
        ANSWER_SCHEMA,
        "--print-timeout",
        PRINT_TIMEOUT,
      ],
      {
        cwd,
        env: toolEnv(),
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        ...(grouped ? { detached: true } : {}),
      }
    );
    const leader = spawnedPid(child);
    const stop = () => {
      if (leader === undefined || child.exitCode !== null) {
        return;
      }
      if (grouped) {
        signalGroup(leader, "SIGTERM");
        return;
      }
      Bun.spawn(
        [systemProgram("taskkill"), "/PID", String(leader), "/T", "/F"],
        { stdin: "ignore", stdout: "ignore", stderr: "ignore" }
      );
    };
    signal.addEventListener("abort", stop, { once: true });
    const [code, out, err] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    const envelope = envelopeOf(out);
    const path = await madeImage(envelope, cwd, since);
    if (!path) {
      throw noImage(envelope, tailOf(err));
    }
    const notes =
      code === 0 && envelope?.status === "SUCCESS"
        ? []
        : [
            imageGenerationWords.agyEndedAfterImage(
              envelope?.error ?? `exit ${code}`
            ),
          ];
    return { bytes: await readFile(path), notes };
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
};

/**
 * The pre-flight, spending nothing: the CLI is here and runs (the tool
 * probe), and its own read says it is signed in. A read that says neither
 * lets the run go on and says so. agy names no plan anywhere it prints
 * (`/usage`, `/credits`, `agy models` on agy 1.5.0, read on obelisk
 * 2026-11-04), so no plan is refused here: a plan that makes no images
 * (Plus, Free) is refused by the run itself, in words ({@link noImage}).
 */
async function readiness(): ReturnType<ImageProvider["readiness"]> {
  const spec = toolSpec("antigravity");
  const bin = spec ? await toolBinary(spec) : undefined;
  if (!(spec && bin)) {
    return {
      ready: false,
      reason: imageGenerationWords.agyMissing(hostname()),
    };
  }
  const status = await probeToolStatus(spec, { fresh: true });
  if (status.state !== "installed") {
    return {
      ready: false,
      reason:
        status.state === "missing"
          ? imageGenerationWords.agyMissing(hostname())
          : imageGenerationWords.agyNotRunnable(status.detail ?? status.state),
    };
  }
  if (status.signin?.state === "signed-out") {
    return {
      ready: false,
      reason: imageGenerationWords.agySignedOut(status.signin.detail ?? ""),
    };
  }
  const notes = [
    ...(status.signin?.state === "unknown"
      ? [imageGenerationWords.agySigninUnread(status.signin.detail ?? "")]
      : []),
    imageGenerationWords.agyPlanUnread,
  ];
  return {
    ready: true,
    notes,
    generate: async (job, signal) => {
      const made = await runAgy(bin, job, signal);
      return {
        bytes: made.bytes,
        notes: [
          ...(job.quality === "auto"
            ? []
            : [
                imageGenerationWords.qualityIgnored("antigravity", job.quality),
              ]),
          ...made.notes,
        ],
      };
    },
  };
}

/** Gemini through this machine's Antigravity CLI: one model, no reference images, JPEG as it makes it. */
export const antigravity: ImageProvider = {
  id: "antigravity",
  references: 0,
  readiness,
};
