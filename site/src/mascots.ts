/**
 * Every picture of Caw on the page, by the slot it fills.
 *
 * `origin` says where each picture came from, and the build writes it onto the
 * image as `data-origin`, so the page itself can be asked.
 *
 * - `generated`: a pose drawn for this page with the image generator, from
 *   Caw's pose sheet. The files here are the generator's output trimmed to the
 *   crow, resized and saved as WebP.
 * - `repo-still`: one of the product's own stills from `assets/mascot/stills/`.
 *   The four here are the outlined dark-background stills, used on purpose
 *   inside the ink stage, where an unoutlined black crow would disappear.
 *
 * Alt text is written where each picture is used, in `index.html`.
 */
export type MascotOrigin = 'generated' | 'repo-still';

export interface Mascot {
  /** File under `src/assets/caw/`. */
  file: string;
  origin: MascotOrigin;
  width: number;
  height: number;
}

export const MASCOTS = {
  /** Presenting, one wing raised, mid-caw. */
  hero: { file: 'hero.webp', origin: 'generated', width: 800, height: 745 },
  /** On lookout, a wing shading his eye. */
  board: { file: 'lookout.webp', origin: 'generated', width: 420, height: 420 },
  /** Tapping a phone with his beak. */
  phone: { file: 'phone.webp', origin: 'generated', width: 330, height: 420 },
  /** Peering through a magnifying glass. */
  rules: { file: 'inspector.webp', origin: 'generated', width: 420, height: 308 },
  /** Handing a note to a smaller crow. */
  delegates: { file: 'handoff.webp', origin: 'generated', width: 520, height: 260 },
  /** Carrying a parcel. */
  sync: { file: 'courier.webp', origin: 'generated', width: 297, height: 420 },
  statusWorking: { file: 'dark-working.webp', origin: 'repo-still', width: 160, height: 114 },
  statusNeedsYou: { file: 'dark-needs-you.webp', origin: 'repo-still', width: 123, height: 160 },
  statusIdle: { file: 'dark-idle.webp', origin: 'repo-still', width: 119, height: 160 },
  statusDone: { file: 'dark-done.webp', origin: 'repo-still', width: 160, height: 128 },
} satisfies Record<string, Mascot>;

export type MascotSlot = keyof typeof MASCOTS;
