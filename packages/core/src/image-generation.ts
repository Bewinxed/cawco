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
  "Generate one PNG, or a reference-guided edit, on the owner's ChatGPT subscription whatever model or harness calls it: the machine's OpenCode ChatGPT login, never API-key billing or another provider. " +
  "For requested photos, illustrations, textures and raster assets; for SVGs, icons or code-native graphics, edit source instead. " +
  "Saves on the calling session's machine and returns the absolute path and actual dimensions; show it with show_image.";
