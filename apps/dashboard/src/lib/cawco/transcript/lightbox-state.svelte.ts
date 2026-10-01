/** One picture in an image view: what PhotoSwipe draws and zooms out of. */
export interface LightboxShot {
  alt: string;
  caption?: string;
  /** Drawn cropped (`object-fit: cover`), so the zoom opens out of the crop. */
  cropped?: boolean;
  /** The thumbnail on the page it zooms out of and back into. */
  element?: HTMLElement;
  height: number;
  path?: string;
  src: string;
  width: number;
}

/**
 * What the lightbox shows: the pictures of one message, swiped between, or
 * one pasted document, read.
 */
export type LightboxView =
  | { kind: "image"; shots: LightboxShot[]; index: number }
  | {
      kind: "text";
      name: string;
      content: string;
      /** The DocThumb it opened from (`data-share`), which it flies out of and back into. */
      share?: string;
    };

let current = $state<LightboxView | null>(null);

export const lightbox = {
  get current() {
    return current;
  },
  open(view: LightboxView) {
    current = view;
  },
  close() {
    current = null;
  },
};
