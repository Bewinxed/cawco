import { DEFAULT_IMAGE_PROVIDER, type ImageProviderId } from "@cawco/core";
import { antigravity } from "./antigravity";
import { chatgpt } from "./chatgpt";
import type { ImageProvider } from "./provider";

/** Every provider by its id: a provider is added here and in core's IMAGE_PROVIDERS, and nowhere else. */
const PROVIDERS: Readonly<Record<ImageProviderId, ImageProvider>> = {
  chatgpt,
  antigravity,
};

/** The provider a call asked for, or the default when it named none. */
export const imageProvider = (
  id: ImageProviderId = DEFAULT_IMAGE_PROVIDER
): ImageProvider => PROVIDERS[id];
