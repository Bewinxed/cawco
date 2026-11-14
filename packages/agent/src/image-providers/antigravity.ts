import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir, hostname, platform, tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { signalGroup, spawnedPid } from "@cawco/core/signal";
import { toolSpec } from "@cawco/core/tools";
import { cutShort, lastLines } from "@cawco/core/words/helpers";
import { imageGenerationWords } from "@cawco/core/words/image-generation";
import { systemProgram } from "@cawco/core/workspace-needs";
import { z } from "zod";
import {
  heardUntilSignedOut,
  probeToolStatus,
  toolBinary,
  toolEnv,
} from "../tools";
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

/**
 * What agy is asked: one image through its own `generate_image` tool, with
 * the references (`paths`, numbered as the job's prompt names them) as that
 * call's `ImagePaths`, and the saved path as the answer. agy 1.5.1's main
 * agent hands images to its built-in `image-generator` subagent ("it now
 * hands image requests to a built-in `image-generator` subagent", agy
 * changelog 1.2.16) and, asked to call `generate_image` itself, answered
 * that it has none ("image generation is only exposed through the
 * `image-generator` subagent via `invoke_subagent`", stream-json run on
 * obelisk, 2026-11-05); that subagent "Pass[es] source or reference images
 * via ImagePaths" and makes "at most 3 attempts per image" (its system
 * prompt, in the agy 1.5.1 binary). So the image's brief is written once,
 * to go word for word to whichever of them calls the tool, and holds it to
 * one call.
 */
const promptOf = (job: ImageJob, paths: string[]): string => {
  const ratio = ratioOf(job.size);
  const brief = [
    `The image: ${job.prompt}`,
    ...(ratio ? [`Aspect ratio: ${ratio}.`] : []),
    ...(paths.length
      ? [
          [
            "Reference images, numbered as the image above names them:",
            ...paths.map((path, index) => `Image ${index + 1}: ${path}`),
          ].join("\n"),
          `Pass them as generate_image's ImagePaths, exactly these paths in this order: ${JSON.stringify(paths)}.`,
        ]
      : []),
    "Call generate_image once and do not retry, then give the absolute path of the saved image.",
  ];
  return [
    "Make exactly one image with generate_image, then stop. If you have no generate_image tool of your own, hand the image to your image-generator subagent with one invoke_subagent call whose brief is the text between the two --- lines, word for word.",
    "---",
    ...brief,
    "---",
    "Do not edit files, run commands or make anything else. Wait until the image is saved, then answer with the absolute path of the saved image file.",
  ].join("\n\n");
};

/** The extension each reference type is written under, for agy to read it by. */
const REFERENCE_EXTENSIONS: Readonly<Record<string, string>> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

/**
 * Each reference written into the run's own folder, as
 * `reference-<n>.<ext>` in the job's order, and its absolute path: agy's
 * workspace is that folder, so it reads them where it works, and the bytes
 * it reads are the ones the orchestration admitted and checked.
 */
const writeReferences = async (
  cwd: string,
  references: ImageJob["references"]
): Promise<string[]> =>
  await Promise.all(
    references.map(async (reference, index) => {
      const path = join(
        cwd,
        `reference-${index + 1}${REFERENCE_EXTENSIONS[reference.mime] ?? ""}`
      );
      await writeFile(path, reference.bytes, { mode: 0o600 });
      return path;
    })
  );

/** The JSON envelope print mode ends on (headless doc "JSON"): the fields read here. */
const envelopeSchema = z.looseObject({
  conversation_id: z.string().optional(),
  status: z.string().optional(),
  error: z.string().optional(),
  /** The agent's own answer in words: why, when it made no image. */
  response: z.string().optional(),
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

/**
 * The image the run made, its bytes: an image file written since the run
 * started in its conversation's folder or the run's own folder, the path
 * it answered first, then the newest; never one whose bytes are a
 * reference's. agy writes its image in its conversation's folder, not
 * where it is asked
 * (`~/.gemini/antigravity-cli/brain/<conversation_id>/<name>_<time>.jpg`,
 * measured on agy 1.5.0, 2026-11-04), and CawCo writes the references in
 * the run's own folder ({@link writeReferences}) after the run's start: a
 * run that made nothing would otherwise answer one of them back as its
 * image (a reference's pixels returned when agy's tool call failed,
 * measured on agy 1.5.1, 2026-11-05). So what counts as agy's is decided
 * by its bytes, which no name, folder or copy of agy's changes.
 */
const madeImage = async (
  envelope: Envelope | undefined,
  cwd: string,
  since: number,
  references: ImageJob["references"]
): Promise<Buffer | undefined> => {
  const id = envelope?.conversation_id;
  const conversation = id ? join(brainDir(), id) : undefined;
  const places = [conversation, cwd].filter(
    (place): place is string => place !== undefined
  );
  const found = (
    await Promise.all(places.map((place) => imagesUnder(place, since)))
  ).flat();
  const answered = envelope?.structured_output?.path;
  const named = answered ? resolve(answered) : undefined;
  const ordered =
    named && found.includes(named)
      ? [named, ...found.filter((path) => path !== named)]
      : found;
  for (const path of ordered) {
    const bytes = await readFile(path).catch(() => undefined);
    if (
      bytes &&
      !references.some((reference) => reference.bytes.equals(bytes))
    ) {
      return bytes;
    }
  }
  return undefined;
};

/** What agy says when it is out of quota, and failed inside Google's service (measured on Plus). */
const QUOTA = /RESOURCE_EXHAUSTED|code 429/u;
const INTERNAL = /INTERNAL \(code 500\)|\b500 INTERNAL\b/u;

/** The last lines of what agy said on its errors, for a sentence. */
const tailOf = (text: string): string =>
  cutShort(lastLines(Bun.stripANSI(text).trim().split("\n"), 4, " / "), 600);

/**
 * A run that ended with no image, as a refusal in words, by what agy said:
 * its error, its answer and the tail of its stderr, so a limit of agy's
 * own (a tool call it refused) reaches the person in its words. One that
 * said it is signed out never gets here: it ends where it says so
 * ({@link runAgy}).
 */
const noImage = (envelope: Envelope | undefined, stderr: string): Error => {
  const error = envelope?.error ?? "";
  const said = [tailOf(envelope?.response ?? ""), tailOf(stderr)]
    .filter(Boolean)
    .join(" / ");
  const all = `${error}\n${said}`;
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

/**
 * One print-mode run of `bin` in a folder of its own, the job's references
 * written in it ({@link writeReferences}): its prompt asks for one image and
 * its path; the image is found where agy wrote it
 * ({@link madeImage}), whatever the run's exit, and a run that ended in an
 * error after writing it is said in a note (agy 1.5.0 on Pro ended
 * `NOT_FOUND (code 404)` after its image, measured).
 */
const runAgy = async (
  bin: string,
  signedOut: readonly string[],
  job: ImageJob,
  signal: AbortSignal
): Promise<MadeImage> => {
  const cwd = await mkdtemp(join(tmpdir(), "cawco-agy-image-"));
  const since = Date.now() - 1000;
  try {
    const paths = await writeReferences(cwd, job.references);
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
        promptOf(job, paths),
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
        {
          env: process.env,
          stdin: "ignore",
          stdout: "ignore",
          stderr: "ignore",
        }
      );
    };
    signal.addEventListener("abort", stop, { once: true });
    // Read as every run of agy is (tools.ts `heardUntilSignedOut`): signed
    // out, it says so and then waits a minute for a login, so the run ends
    // where it says it, and that line is the refusal's reason.
    const ended = await heardUntilSignedOut(child, signedOut);
    if ("line" in ended) {
      stop();
      throw new Error(imageGenerationWords.agySignedOut(ended.line));
    }
    const { code, out, err } = ended;
    const envelope = envelopeOf(out);
    const bytes = await madeImage(envelope, cwd, since, job.references);
    if (!bytes) {
      throw noImage(envelope, err);
    }
    const notes =
      code === 0 && envelope?.status === "SUCCESS"
        ? []
        : [
            imageGenerationWords.agyEndedAfterImage(
              envelope?.error ?? `exit ${code}`
            ),
          ];
    return { bytes, notes };
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
      const made = await runAgy(bin, spec.signin?.signedOut ?? [], job, signal);
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

/**
 * The most references agy's `generate_image` tool takes: its `ImagePaths`
 * holds at most 3, under the 14 its model takes on the Gemini API. A call
 * with 14 came back from agy 1.5.1 as "Error invalid tool call: invalid
 * arguments: - at '/ImagePaths': maxItems: got 14, want 3" (its
 * image-generator subagent's transcript, obelisk, 2026-11-05).
 */
const AGY_MAX_REFERENCES = 3;

/**
 * Gemini through this machine's Antigravity CLI: one model, Nano Banana 2
 * (core `IMAGE_PROVIDER_MODELS`), at most {@link AGY_MAX_REFERENCES}
 * references; JPEG as it makes it.
 */
export const antigravity: ImageProvider = {
  id: "antigravity",
  references: AGY_MAX_REFERENCES,
  readiness,
};
