/** How hard an image is drawn: `auto` the model's pick, `low` for drafts, `high` for dense text or fine detail. */
export const IMAGE_QUALITIES = ["auto", "low", "medium", "high"] as const;
export type ImageQuality = (typeof IMAGE_QUALITIES)[number];

/**
 * The image providers a machine can make an image through, each on the
 * owner's own sign-in on that machine (agent image-providers/). A call names
 * one with `provider`; none named is {@link DEFAULT_IMAGE_PROVIDER}. A
 * provider that cannot generate is refused before any request, and nothing
 * switches provider by itself.
 */
export const IMAGE_PROVIDERS = [
  "chatgpt",
  "antigravity",
  "gemini-api",
] as const;
export type ImageProviderId = (typeof IMAGE_PROVIDERS)[number];

/** `id` as a provider's id, or none when it names none. */
export const imageProviderOf = (id: string): ImageProviderId | undefined =>
  IMAGE_PROVIDERS.find((one) => one === id);

/** The provider a call goes to when it names none and the fleet's setting names none ({@link ImageSettings}). */
export const DEFAULT_IMAGE_PROVIDER: ImageProviderId = "chatgpt";

/**
 * Each provider's models, its default first. A call's or the setting's
 * `model` is taken only from a provider with more than one.
 * - chatgpt: native Codex's image model (codex-rs/ext/image-generation).
 * - antigravity: the one model Antigravity's image tool runs, "Nano Banana
 *   2 … not customizable" (https://antigravity.google/docs/models/).
 * - gemini-api: the Gemini API's image models, "gemini-nano-banana-2.1"
 *   recommended for new projects
 *   (https://ai.google.dev/gemini-api/docs/image-generation, read
 *   2026-11-04).
 */
export const IMAGE_PROVIDER_MODELS: Readonly<
  Record<ImageProviderId, readonly [string, ...string[]]>
> = {
  chatgpt: ["gpt-image-2"],
  antigravity: ["gemini-3.1-flash-image"],
  "gemini-api": [
    "gemini-nano-banana-2.1",
    "gemini-3.1-flash-image",
    "gemini-3.1-flash-lite-image",
    "gemini-3-pro-image",
  ],
};

/** Whether `provider` offers a choice of model. */
export const offersModelChoice = (provider: ImageProviderId): boolean =>
  IMAGE_PROVIDER_MODELS[provider].length > 1;

/**
 * The fleet's image default (hub `image_settings`, `GET`/`PUT
 * /api/image-settings`): the provider a call that names none goes to, and
 * that provider's model (null: its default). No row reads as
 * {@link DEFAULT_IMAGE_SETTINGS}, which is today's behaviour.
 */
export interface ImageSettings {
  model: string | null;
  provider: ImageProviderId;
}

export const DEFAULT_IMAGE_SETTINGS: ImageSettings = {
  provider: DEFAULT_IMAGE_PROVIDER,
  model: null,
};

/**
 * What a call runs on: the provider it names, else the fleet's setting's;
 * the model it names, else the setting's model when that is the setting's
 * provider, else that provider's default (none said).
 */
export const effectiveImageChoice = (
  asked: { model?: string; provider?: ImageProviderId },
  settings: ImageSettings
): { model?: string; provider: ImageProviderId } => {
  const provider = asked.provider ?? settings.provider;
  const model =
    asked.model ??
    (provider === settings.provider ? settings.model : null) ??
    undefined;
  return { provider, ...(model ? { model } : {}) };
};

/** The formats a provider's image is kept in, as it made it: never re-encoded. */
const IMAGE_FORMATS = ["png", "jpeg"] as const;
export type ImageFormat = (typeof IMAGE_FORMATS)[number];

/** The extension a saved image of each format carries. */
export const IMAGE_EXTENSIONS: Readonly<Record<ImageFormat, string>> = {
  png: ".png",
  jpeg: ".jpg",
};

/** The most reference images any provider takes on one call: the Gemini API's "Up to 14 reference images". */
export const MAX_REFERENCE_IMAGES = 14;

/** One subscription-backed image request, independent of the calling harness. */
export interface ImageGenerationRequest {
  /** A model of the provider's; taken only from a provider that offers a choice. */
  model?: string;
  output_path: string;
  prompt: string;
  /** The provider asked for; {@link DEFAULT_IMAGE_PROVIDER} when none is. */
  provider?: ImageProviderId;
  quality?: ImageQuality;
  reference_images?: string[];
  size?: string;
}

export interface GeneratedImage {
  /**
   * The `output_path` asked for, when the image was saved beside it under
   * its format's extension instead ({@link IMAGE_EXTENSIONS}).
   */
  asked?: string;
  format: ImageFormat;
  height: number;
  /** The provider's model that made it. */
  model: string;
  /** What the provider said of the run that the caller should know, in words. */
  notes?: string[];
  path: string;
  provider: ImageProviderId;
  width: number;
}

export const GENERATE_IMAGE = "generateImage";
export const IMAGE_GENERATION_TIMEOUT_MS = 600_000;
export const IMAGE_GENERATION_DESCRIPTION =
  "Generate one image or reference-guided edit through an image provider on this machine's sign-in (`provider`). " +
  "For photos, illustrations, textures and raster assets; SVGs, icons and code-native graphics are source to edit instead. " +
  "Saved on your machine; show it with show_image.";
