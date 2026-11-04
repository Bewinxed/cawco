import {
  type GeneratedImage,
  IMAGE_GENERATION_TIMEOUT_MS,
  IMAGE_PROVIDERS,
  type ImageFormat,
  type ImageProviderId,
} from "../image-generation";
import { unhandled } from "../unhandled";
import { configurePage } from "./configure";

/**
 * What `generate_image` says (agent image-generation.ts and its providers
 * under image-providers/): the call's own refusals, each provider's
 * refusals before and after its request, and the line its result reads as.
 */

/** Each provider by the name a person knows it by, and what it runs on. */
const PROVIDER_NAMES: Readonly<Record<ImageProviderId, string>> = {
  chatgpt: "ChatGPT (this machine's ChatGPT login)",
};

/** A provider's short name, for a sentence. */
const SHORT_NAMES: Readonly<Record<ImageProviderId, string>> = {
  chatgpt: "ChatGPT",
};

const FORMAT_NAMES: Readonly<Record<ImageFormat, string>> = {
  png: "PNG",
  jpeg: "JPEG",
};

/**
 * How to ask for each provider but `id`, said after any refusal of `id`'s:
 * the call is never moved to another provider by itself.
 */
const others = (id: ImageProviderId): string => {
  const rest = IMAGE_PROVIDERS.filter((one) => one !== id);
  return rest.length
    ? `\nTo make it through another provider instead, call generate_image again with ${rest
        .map((one) => `provider "${one}" (${PROVIDER_NAMES[one]})`)
        .join(" or ")}.`
    : "";
};

/** How a ChatGPT login comes to be held by a CawCo account. */
const SIGN_IN = `Run \`opencode auth login\` and choose OpenAI → ChatGPT (CawCo moves that login into a ChatGPT account), or add a ChatGPT account in ${configurePage("accounts")}.`;

/** Where a ChatGPT plan is changed. */
const PLANS = "https://chatgpt.com/pricing";

/** Why one held ChatGPT login cannot make an image, said before any request. */
type ImageBlock =
  | { kind: "free" }
  | { kind: "renew"; error: string }
  | { kind: "gone" }
  | { kind: "rejected" };

/** One held login that cannot make an image: who it is, its plan, and why. */
export interface BlockedLogin {
  block: ImageBlock;
  /** The login's email, or null when its token names none. */
  email: string | null;
  plan: string | null;
}

const why = (block: ImageBlock): string => {
  switch (block.kind) {
    case "free":
      return `the Free plan can't generate images. Upgrade it at ${PLANS}, or sign in with a paid ChatGPT account.`;
    case "renew":
      return `its login couldn't be renewed (${block.error}). Sign in to it again.`;
    case "gone":
      return "its sign-in is gone from this machine. Sign in to it again.";
    case "rejected":
      return "ChatGPT rejected its login (401). Sign in to it again.";
    default:
      return unhandled("block", block);
  }
};

export const imageGenerationWords = {
  /** A provider's refusal (before its request or of it), with how to ask for each other provider. */
  refused: (id: ImageProviderId, reason: string) => `${reason}${others(id)}`,
  /** `model` named on a provider that offers one model. */
  noModelChoice: (id: ImageProviderId, model: string) =>
    `${SHORT_NAMES[id]} makes images on one model, ${model}; leave model out. No image was generated.`,
  /** `model` named that the provider does not offer. */
  unknownModel: (id: ImageProviderId, asked: string, models: string[]) =>
    `${SHORT_NAMES[id]} offers no model ${asked}; it offers ${models.join(", ")}. No image was generated.`,
  /** More reference images than the provider takes; none taken at all when `most` is 0. */
  tooManyReferences: (id: ImageProviderId, most: number) =>
    most === 0
      ? `${SHORT_NAMES[id]} takes no reference images, so nothing was uploaded and no image was generated.`
      : `${SHORT_NAMES[id]} takes at most ${most} reference images, so nothing was uploaded and no image was generated.`,
  /** A reference the inputs' gate refused. */
  referenceRefused: (cause: string) =>
    `reference_images: ${cause}. Nothing was uploaded and no image was generated.`,
  referenceTooBig: () =>
    "References must be image files of at most 50 MiB each and 100 MiB combined. Nothing was uploaded and no image was generated.",
  referenceNotImage: () =>
    "Unsupported reference image. Use a PNG, JPEG, WebP, or GIF file. Nothing was uploaded and no image was generated.",
  invalidSize: () =>
    "Invalid size. Use auto or WIDTHxHEIGHT (e.g. 1024x1536): multiples of 16, max side 3840, max aspect ratio 3:1, 655360–8294400 pixels.",
  /** `output_path` outside a workspace, not a .png. */
  notPng: () =>
    "output_path must end in .png, for example assets/illustration.png. A provider that makes another format saves it beside that path under its own extension.",
  /** `output_path` refused by the workspace's placing rule. */
  outputRefused: (cause: string) =>
    `output_path ${cause}. No image was generated.`,
  outputExists: (path: string) =>
    `output_path already exists: ${path}. Choose a new filename; existing images are never overwritten. No image was generated.`,
  /** The image was made in a format whose path beside `output_path` is taken. */
  formatPathTaken: (path: string) =>
    `The image was made, but ${path}, where its format puts it, already exists, so nothing was saved; existing images are never overwritten. Ask again with a new output_path.`,
  alreadyRunning: (path: string) =>
    `Image generation is already running for ${path}. Wait for that request; do not submit a duplicate.`,
  timedOut: (id: ImageProviderId) =>
    `${SHORT_NAMES[id]} did not answer within ${IMAGE_GENERATION_TIMEOUT_MS / 60_000} minutes. No image was saved and no automatic retry was submitted.`,
  /** The provider's bytes are no image CawCo keeps. */
  notAnImage: (id: ImageProviderId) =>
    `${SHORT_NAMES[id]} answered with bytes that are neither a PNG nor a JPEG; no image was saved.`,
  /** `generate_image`'s result: where it is, how big, in what format, through what, and what the provider said. */
  saved: (image: GeneratedImage) =>
    [
      `Saved ${image.width} × ${image.height} ${FORMAT_NAMES[image.format]} at ${image.path}`,
      image.asked
        ? ` (asked for ${image.asked}; ${SHORT_NAMES[image.provider]} makes ${FORMAT_NAMES[image.format]}, so it carries that extension)`
        : "",
      `, made by ${SHORT_NAMES[image.provider]} on ${image.model}; show it with show_image.`,
      ...(image.notes ?? []).map((note) => `\n${note}`),
    ].join(""),

  /** No CawCo account on the machine holds a ChatGPT sign-in. */
  noLogin: () =>
    `No CawCo account on this machine holds a ChatGPT login, so no image request was sent. ${SIGN_IN} API keys are not accepted.`,
  /** Every held login is blocked: each named with its plan, what stops it and its fix. */
  noUsableLogin: (blocked: BlockedLogin[]) =>
    [
      "No ChatGPT login on this machine can generate images, so no image request was sent:",
      ...blocked.map(
        (one) =>
          `- ${one.email ?? "a login with no email"} (${one.plan ? `${one.plan} plan` : "plan unknown"}): ${why(one.block)}`
      ),
      SIGN_IN,
    ].join("\n"),
  /** The image request itself met a 401: the login was revoked after the check. */
  requestRejected: (detail: string) =>
    `ChatGPT rejected this machine's login (401: ${detail}). Sign in again: ${SIGN_IN} No image was saved and no API-key request was made.`,
  /** Any other refusal of the image request, in the server's words. */
  requestRefused: (status: number, detail: string) =>
    `ChatGPT image generation refused the request (${status}): ${detail} No image was saved, no API-key request was made and no retry was submitted.`,
  /** ChatGPT answered without an image. */
  noImage: () =>
    "ChatGPT returned no image. No file was saved. Do not automatically retry an uncertain generation.",
};
