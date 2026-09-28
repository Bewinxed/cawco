export interface LightboxShot {
  alt: string;
  caption?: string;
  path?: string;
  /** The thumbnail it opened from (`data-share`), which it flies out of and back into. */
  share?: string;
  src: string;
}

let current = $state<LightboxShot | null>(null);

export const lightbox = {
  get current() {
    return current;
  },
  open(shot: LightboxShot) {
    current = shot;
  },
  close() {
    current = null;
  },
};
