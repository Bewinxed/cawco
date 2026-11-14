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
  chatgpt: "ChatGPT, on this machine's ChatGPT login",
  antigravity: "Gemini, through this machine's Antigravity CLI",
  "gemini-api":
    "Gemini, on a Gemini API key held on this machine, billed per image",
};

/** A provider's short name, for a sentence. */
const SHORT_NAMES: Readonly<Record<ImageProviderId, string>> = {
  chatgpt: "ChatGPT",
  antigravity: "Antigravity CLI",
  "gemini-api": "The Gemini API",
};

/** Where the Antigravity CLI is installed and signed in on each machine. */
const AGY_ROW = `its row in ${configurePage("cli-tools")}`;

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
  /** More reference images than the provider takes. */
  tooManyReferences: (id: ImageProviderId, most: number) =>
    `${SHORT_NAMES[id]} takes at most ${most} reference images, so nothing was uploaded and no image was generated.`,
  /** A reference the inputs' gate refused. */
  referenceRefused: (cause: string) =>
    `reference_images: ${cause}. Nothing was uploaded and no image was generated.`,
  referenceTooBig: (id: ImageProviderId, each: number, total: number) =>
    `${SHORT_NAMES[id]} takes reference images that are files of at most ${each / 1_000_000} MB each and ${total / 1_000_000} MB combined. Nothing was uploaded and no image was generated.`,
  referenceNotImage: () =>
    "Unsupported reference image. Use a PNG, JPEG, WebP, or GIF file. Nothing was uploaded and no image was generated.",
  invalidSize: () =>
    "Invalid size. Use auto or WIDTHxHEIGHT (e.g. 1024x1536): multiples of 16, max side 3840, max aspect ratio 3:1, 655360–8294400 pixels.",
  /** `output_path` outside a workspace, not a .png. */
  notPng: () =>
    "output_path must end in .png, for example assets/illustration.png. A provider that makes another format saves it beside that path under its own extension.",
  /** A reference, or `output_path` outside a workspace, names a shell variable, which nothing expands. */
  unexpanded: (
    field: "output_path" | "reference_images",
    path: string,
    variable: string
  ) =>
    `${field} ${path} names ${variable}, a shell variable CawCo doesn't expand. Name the path it stands for, written out. Nothing was uploaded and no image was generated.`,
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

  /** No Antigravity CLI on the machine. */
  agyMissing: (machine: string) =>
    `Antigravity CLI isn't installed on ${machine}, so no image request was sent. Install it in ${configurePage("cli-tools")}, or require it on every machine there.`,
  /** An Antigravity CLI CawCo doesn't run, in the tool probe's words. */
  agyNotRunnable: (detail: string) =>
    `Antigravity CLI on this machine can't run (${detail}), so no image request was sent. See ${AGY_ROW}.`,
  /** Not signed in to Google, by its own read or its run. */
  agySignedOut: (said: string) =>
    `Antigravity CLI on this machine isn't signed in to Google${said ? ` (it said: ${said})` : ""}, so no image was made. Sign it in on ${AGY_ROW}.`,
  /** A note: whether it is signed in couldn't be read, and the run went on. */
  agySigninUnread: (detail: string) =>
    `Whether Antigravity CLI is signed in couldn't be read beforehand (${detail}); the run went ahead.`,
  /** A note: the plan is never readable on this route. */
  agyPlanUnread:
    "Antigravity CLI doesn't say which Google AI plan it is signed in on, so the plan wasn't checked; images need Pro or Ultra.",
  /** A note: quality is not a knob of the provider's. */
  qualityIgnored: (id: ImageProviderId, quality: string) =>
    `${SHORT_NAMES[id]} has no quality setting, so quality ${quality} had no effect.`,
  /** A note: the run ended in an error after the image was written. */
  agyEndedAfterImage: (error: string) =>
    `Antigravity CLI ended with "${error}" after it wrote the image; the image is the one it made.`,
  /** The run's quota is spent. */
  agyQuota: (error: string) =>
    `Google's image quota for this machine's Antigravity sign-in is spent (${error}). No image was saved and no retry was submitted; failed attempts count against the quota too.`,
  /** The image tool failed inside Google's service. */
  agyInternal: (error: string) =>
    `Antigravity CLI's image tool failed (${error}). On Google AI Plus every image run fails this way; Pro or Ultra make images. No image was saved and no retry was submitted.`,
  /** The run ended with no image written. */
  agyNoImage: (status: string, error: string, said: string) =>
    `Antigravity CLI ended (${status}${error ? `: ${error}` : ""}) without writing an image, so nothing was saved and no retry was submitted.${said ? ` It said: ${said}` : ""}`,

  /** No CawCo account on the machine holds a Gemini API key. */
  geminiNoKey: () =>
    `No CawCo account on this machine holds a Gemini API key, so no image request was sent. Add a Google account with an API key from Google AI Studio (https://aistudio.google.com/apikey) in ${configurePage("accounts")}, with this machine among its machines; image output needs billing on the key's project.`,
  /** The key was refused. */
  geminiKeyRefused: (status: number, detail: string) =>
    `The Gemini API refused this machine's key (${status}: ${detail}). Check the Google account's key in ${configurePage("accounts")}. No image was saved and no retry was submitted.`,
  /** A quota, rate or spend limit was met. */
  geminiQuota: (detail: string) =>
    `The Gemini API refused on a quota, rate or spend limit (429: ${detail}). A key on the free tier makes no images: turn billing on for its project. No image was saved and no retry was submitted.`,
  /** Any other refusal, in the API's words. */
  geminiRefused: (status: number, detail: string) =>
    `The Gemini API refused the request (${status}): ${detail} No image was saved and no retry was submitted.`,
  /** An answer with no image in it: blocked, or text alone. */
  geminiNoImage: (reason: string, text: string) =>
    `The Gemini API answered without an image (${reason})${text ? `: ${text}` : "."} No image was saved and no retry was submitted.`,

  /** The image setting names a provider there is none of. */
  noSuchProvider: (id: string) =>
    `There is no image provider ${id}; there are ${IMAGE_PROVIDERS.join(", ")}.`,
  /** The image setting names a model of a provider with one. */
  settingsNoModelChoice: (id: ImageProviderId, model: string) =>
    `${SHORT_NAMES[id]} makes images on one model, ${model}, so the setting takes no model for it.`,
  /** The image setting names a model the provider doesn't offer. */
  settingsUnknownModel: (
    id: ImageProviderId,
    asked: string,
    models: string[]
  ) =>
    `${SHORT_NAMES[id]} offers no model ${asked}; it offers ${models.join(", ")}.`,

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
    "ChatGPT answered without an image it could read, though it may have made and counted one. No file was saved. Do not retry it automatically: a retry may make and count a second image.",
};
