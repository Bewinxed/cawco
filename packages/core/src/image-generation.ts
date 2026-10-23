/** One subscription-backed image request, independent of the calling harness. */
export interface ImageGenerationRequest {
  output_path: string;
  prompt: string;
  quality?: "auto" | "low" | "medium" | "high";
  reference_images?: string[];
  size?: string;
}

export interface GeneratedImage {
  billing: "chatgpt_subscription";
  height: number;
  path: string;
  width: number;
}

export const GENERATE_IMAGE = "generateImage";
export const IMAGE_GENERATION_TIMEOUT_MS = 600_000;
export const IMAGE_GENERATION_DESCRIPTION =
  "Generate one PNG, or a reference-guided edit, on the owner's ChatGPT subscription, from any model or harness. " +
  "For photos, illustrations, textures and raster assets; SVGs, icons and code-native graphics are source to edit instead. " +
  "Saved on your machine; show it with show_image.";
