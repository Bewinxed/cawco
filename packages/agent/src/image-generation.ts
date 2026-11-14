import { existsSync } from "node:fs";
import { lstat, readFile, stat } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { readWithin } from "@cawco/core/bounded";
import { makeFolder } from "@cawco/core/folders";
import {
  type GeneratedImage,
  IMAGE_EXTENSIONS,
  IMAGE_GENERATION_TIMEOUT_MS,
  IMAGE_PROVIDER_MODELS,
  IMAGE_PROVIDERS,
  IMAGE_QUALITIES,
  type ImageFormat,
  MAX_REFERENCE_IMAGES,
  offersModelChoice,
} from "@cawco/core/image-generation";
import { unhandled } from "@cawco/core/unhandled";
import { imageGenerationWords } from "@cawco/core/words/image-generation";
import { imageSize } from "image-size";
import { z } from "zod";
import type { AgentPorts } from "./agent-ports";
import { isWorkspaceRef } from "./hub-command";
import type {
  ImageProvider,
  MadeImage,
  ReferenceImage,
} from "./image-providers/provider";
import { imageProvider } from "./image-providers/registry";
import {
  admitFiles,
  type Kept,
  placeInWorkspace,
  unexpandedVariable,
  writeKept,
} from "./inputs";

const requestSchema = z
  .object({
    prompt: z.string().trim().min(1),
    output_path: z.string().min(1),
    reference_images: z
      .array(z.string().min(1))
      .max(MAX_REFERENCE_IMAGES)
      .optional(),
    size: z.string().default("auto"),
    quality: z.enum(IMAGE_QUALITIES).default("auto"),
    provider: z.enum(IMAGE_PROVIDERS).optional(),
    model: z.string().trim().min(1).optional(),
  })
  .strict();
const SIZE = /^(\d+)x(\d+)$/u;
const activeOutputs = new Set<string>();

async function requireNewOutput(output: string): Promise<void> {
  try {
    await lstat(output);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
  throw new Error(imageGenerationWords.outputExists(output));
}

/**
 * `named`, a path the call's `field` names, refused when it names a shell
 * variable ({@link unexpandedVariable}): no shell expands it here, and the
 * session's own value of it is not known here.
 */
function refuseUnexpanded(
  field: "output_path" | "reference_images",
  named: string
): void {
  const variable = unexpandedVariable(named);
  if (variable) {
    throw new Error(imageGenerationWords.unexpanded(field, named, variable));
  }
}

/**
 * Where `output_path` lands, relative from the session's working dir `cwd`:
 * for a session `bound` to a workspace, inside its clone or its $TMPDIR, by
 * the rule every file a workspace's session asks CawCo to write answers to
 * (inputs.ts `placeInWorkspace`), refused in words elsewhere; for a session
 * in no workspace, which no boundary holds, wherever it names, but a path
 * naming a shell variable ({@link refuseUnexpanded}).
 */
function outputOf(cwd: string, named: string, bound: unknown): Kept {
  if (isWorkspaceRef(bound)) {
    const kept = placeInWorkspace(bound, named, cwd);
    if (typeof kept === "string") {
      throw new Error(imageGenerationWords.outputRefused(kept));
    }
    return kept;
  }
  refuseUnexpanded("output_path", named);
  const output = resolve(cwd, named);
  if (extname(output).toLowerCase() !== ".png") {
    throw new Error(imageGenerationWords.notPng());
  }
  return {
    root: dirname(output),
    rel: basename(output),
    said: output,
    shown: output,
    what: "the folder it was asked in",
  };
}

/**
 * `kept` under `format`'s extension: the asked .png path itself for a PNG,
 * else that path with its extension replaced, in the same folder.
 */
function keptAs(kept: Kept, format: ImageFormat): Kept {
  const extension = IMAGE_EXTENSIONS[format];
  const swap = (path: string) =>
    extname(path).toLowerCase() === extension
      ? path
      : `${path.slice(0, -extname(path).length)}${extension}`;
  return {
    ...kept,
    rel: swap(kept.rel),
    said: swap(kept.said),
    shown: swap(kept.shown),
  };
}

function validateSize(size: string): void {
  if (size === "auto") {
    return;
  }
  const match = SIZE.exec(size);
  const width = Number(match?.[1]);
  const height = Number(match?.[2]);
  if (
    !match ||
    width % 16 ||
    height % 16 ||
    Math.max(width, height) > 3840 ||
    Math.max(width, height) > Math.min(width, height) * 3 ||
    width * height < 655_360 ||
    width * height > 8_294_400
  ) {
    throw new Error(imageGenerationWords.invalidSize());
  }
}

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function imageMime(bytes: Buffer): string {
  if (bytes.subarray(0, 8).equals(PNG)) {
    return "image/png";
  }
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    return "image/jpeg";
  }
  if (
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6))) {
    return "image/gif";
  }
  throw new Error(imageGenerationWords.referenceNotImage());
}

/**
 * Each reference read, checked before its bytes are, relative from `cwd`.
 * For a session `bound` to a workspace, only what the inputs' gate admits
 * (inputs.ts `admitFiles`: its clone, its scratch dir, its project's
 * folder) is read, refused in words before anything is uploaded; a session
 * in no workspace reads what it names.
 */
async function referenceImages(
  cwd: string,
  references: string[],
  bound: unknown,
  project: unknown,
  provider: ImageProvider
): Promise<ReferenceImage[]> {
  const named = references.map((reference) => resolve(cwd, reference));
  const paths = isWorkspaceRef(bound)
    ? await admitFiles(
        named,
        bound,
        typeof project === "string" ? project : null
      )
    : named;
  if (typeof paths === "string") {
    throw new Error(imageGenerationWords.referenceRefused(paths));
  }
  const images: ReferenceImage[] = [];
  let total = 0;
  for (const referencePath of paths) {
    const info = await stat(referencePath);
    total += info.size;
    if (
      !info.isFile() ||
      info.size > provider.referenceBytes.each ||
      total > provider.referenceBytes.total
    ) {
      throw refusal(
        provider,
        imageGenerationWords.referenceTooBig(
          provider.id,
          provider.referenceBytes.each,
          provider.referenceBytes.total
        )
      );
    }
    const bytes = await readFile(referencePath);
    images.push({ bytes, mime: imageMime(bytes) });
  }
  return images;
}

/** The model a call runs on: the provider's default, or the one it asked for where the provider offers a choice. */
function modelOf(provider: ImageProvider, asked: string | undefined): string {
  const models = IMAGE_PROVIDER_MODELS[provider.id];
  const [first] = models;
  if (asked === undefined) {
    return first;
  }
  if (!offersModelChoice(provider.id)) {
    throw new Error(imageGenerationWords.noModelChoice(provider.id, first));
  }
  if (!models.includes(asked)) {
    throw new Error(
      imageGenerationWords.unknownModel(provider.id, asked, [...models])
    );
  }
  return asked;
}

/** `error` as a refusal of `provider`'s, naming each other provider and how to ask for it. */
const refusal = (provider: ImageProvider, error: unknown): Error =>
  new Error(
    imageGenerationWords.refused(
      provider.id,
      error instanceof Error ? error.message : String(error)
    )
  );

/** image-size's type of each format CawCo keeps. */
const FORMAT_OF: Readonly<Record<string, ImageFormat>> = {
  png: "png",
  jpg: "jpeg",
};

/** The image's format and size, read from its own header; neither a PNG nor a JPEG is refused. */
function readImage(
  provider: ImageProvider,
  bytes: Buffer
): { format: ImageFormat; height: number; width: number } {
  let read: ReturnType<typeof imageSize> | undefined;
  try {
    read = imageSize(bytes);
  } catch {
    read = undefined;
  }
  const format = read?.type ? FORMAT_OF[read.type] : undefined;
  if (!(read && format && read.width && read.height)) {
    throw refusal(provider, imageGenerationWords.notAnImage(provider.id));
  }
  return { format, width: read.width, height: read.height };
}

/** The provider's run, bounded by the one image timeout. */
async function made(
  provider: ImageProvider,
  run: (signal: AbortSignal) => Promise<MadeImage>
): Promise<MadeImage> {
  const read = await readWithin(IMAGE_GENERATION_TIMEOUT_MS, run);
  switch (read.kind) {
    case "answered":
      return read.value;
    case "unanswered":
      throw new Error(imageGenerationWords.timedOut(provider.id));
    default:
      return unhandled("read", read);
  }
}

/**
 * One image through the provider the call names, else the default. In
 * order: the arguments, the output's place, the provider's model and what it
 * accepts, its pre-flight ({@link ImageProvider.readiness}), the references
 * read, the run under the one timeout, the image's own format and size, and
 * the exclusive write. Nothing is uploaded or requested before the
 * pre-flight passes, and nothing moves the call to another provider.
 * Credentials stay with the provider on this machine; the hub receives only
 * the saved path. `bound`: the workspace the session runs in, or null
 * ({@link outputOf}); `project`: its project's id, or null
 * ({@link referenceImages}).
 */
export async function generateImage(
  ports: Pick<AgentPorts, "borrowAsk">,
  cwd: string,
  input: unknown,
  bound: unknown = null,
  project: unknown = null
): Promise<GeneratedImage> {
  const args = requestSchema.parse(input);
  validateSize(args.size);
  const kept = outputOf(cwd, args.output_path, bound);
  const output = kept.shown;
  const provider = imageProvider(args.provider);
  const model = modelOf(provider, args.model);
  const asked = args.reference_images ?? [];
  for (const reference of asked) {
    refuseUnexpanded("reference_images", reference);
  }
  if (asked.length > provider.references) {
    throw refusal(
      provider,
      imageGenerationWords.tooManyReferences(provider.id, provider.references)
    );
  }
  // Before any reference is read or any image request goes out.
  const readiness = await provider.readiness(ports);
  if (!readiness.ready) {
    throw refusal(provider, readiness.reason);
  }
  const references = await referenceImages(
    cwd,
    asked,
    bound,
    project,
    provider
  );
  if (!isWorkspaceRef(bound)) {
    // A workspace's clone and scratch dir are there; its folders under them are made one at a time as it is written.
    await makeFolder(kept.root);
  }
  await requireNewOutput(output);
  if (activeOutputs.has(output)) {
    throw new Error(imageGenerationWords.alreadyRunning(output));
  }
  activeOutputs.add(output);
  try {
    const image = await made(provider, (signal) =>
      readiness.generate(
        {
          prompt: args.prompt,
          model,
          quality: args.quality,
          size: args.size,
          references,
        },
        signal
      )
    ).catch((error: unknown) => {
      throw refusal(provider, error);
    });
    const { format, width, height } = readImage(provider, image.bytes);
    const saved = keptAs(kept, format);
    if (saved.shown !== output && existsSync(saved.shown)) {
      throw new Error(imageGenerationWords.formatPathTaken(saved.shown));
    }
    // Placed only where nothing is: a concurrent writer's file is never replaced.
    await writeKept(saved, image.bytes, { exclusive: true, mode: 0o600 });
    const notes = [...readiness.notes, ...image.notes];
    return {
      path: saved.shown,
      width,
      height,
      format,
      provider: provider.id,
      model,
      ...(saved.shown === output ? {} : { asked: output }),
      ...(notes.length ? { notes } : {}),
    };
  } finally {
    activeOutputs.delete(output);
  }
}
