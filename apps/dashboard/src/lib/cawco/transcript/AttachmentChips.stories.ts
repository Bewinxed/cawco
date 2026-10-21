/**
 * A draft's attachment chips (Component Story Format 3, live components):
 * the row as the composer draws it over a draft, mounted by CawCo's stage
 * from this file and the real AttachmentChips.svelte. A picture's chip is a
 * mark line: its thumbnail, its name and its remove, the ✕ on the line's
 * middle. The draft is the plain shape the row reads (ComposerDraft's
 * images, texts and files); nothing is uploaded.
 */
import AttachmentChips from "./AttachmentChips.svelte";

/** A 1×1 png, the thumbnail's picture. */
const PIXEL =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const image = (name: string) => ({ data: PIXEL, mediaType: "image/png", name });

export default {
  component: AttachmentChips,
  args: {
    draft: {
      canvas: null,
      files: [],
      images: [image("tray-390.png")],
      texts: [],
    },
  },
};

/** One picture: its chip and its remove. */
export const Picture = { args: {} };

/** Two pictures, one with a name long enough to clip. */
export const Pictures = {
  args: {
    draft: {
      canvas: null,
      files: [],
      images: [
        image("tray-390.png"),
        image("the-delegate-tray-at-a-phone-width-after-the-shelf-opens.png"),
      ],
      texts: [],
    },
  },
};
