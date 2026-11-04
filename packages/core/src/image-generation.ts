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
export const IMAGE_PROVIDERS = ["chatgpt", "antigravity"] as const;
export type ImageProviderId = (typeof IMAGE_PROVIDERS)[number];

/** The provider a call that names none goes to. */
export const DEFAULT_IMAGE_PROVIDER: ImageProviderId = "chatgpt";

/** The formats a provider's image is kept in, as it made it: never re-encoded. */
export const IMAGE_FORMATS = ["png", "jpeg"] as const;
export type ImageFormat = (typeof IMAGE_FORMATS)[number];

/** The extension a saved image of each format carries. */
export const IMAGE_EXTENSIONS: Readonly<Record<ImageFormat, string>> = {
  png: ".png",
  jpeg: ".jpg",
};

/** The most reference images any provider takes on one call. */
export const MAX_REFERENCE_IMAGES = 5;

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
  "Generate one image or reference-guided edit through an image provider on this machine's sign-in (ChatGPT unless `provider` says otherwise), from any model or harness. " +
  "For photos, illustrations, textures and raster assets; SVGs, icons and code-native graphics are source to edit instead. " +
  "Saved on your machine; show it with show_image.";
