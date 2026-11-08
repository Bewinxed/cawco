import {
  DEFAULT_IMAGE_PROVIDER,
  type ImageProviderId,
} from "@cawco/core/image-generation";
import { antigravity } from "./antigravity";
import { chatgpt } from "./chatgpt";
import { geminiApi } from "./gemini-api";
import type { ImageProvider } from "./provider";

/** Every provider by its id: a provider is added here and in core's IMAGE_PROVIDERS, and nowhere else. */
const PROVIDERS: Readonly<Record<ImageProviderId, ImageProvider>> = {
  chatgpt,
  antigravity,
  "gemini-api": geminiApi,
};

/** The provider a call asked for, or the default when it named none. */
export const imageProvider = (
  id: ImageProviderId = DEFAULT_IMAGE_PROVIDER
): ImageProvider => PROVIDERS[id];
