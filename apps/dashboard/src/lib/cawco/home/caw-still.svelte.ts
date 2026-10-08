/**
 * Caw's still as a picture: for a place too small or too many for a Caw of
 * its own (a face beside a word, a mark on every row of a list). A row of
 * these must cost nothing, so a picture runs no Rive of its own: each file's
 * still is drawn once for each look it can have (file, size, scheme, device
 * pixels) on the runtime's own renderer (`stageCaw`'s rest, on a canvas
 * nobody shows), kept, and copied by every place that shows it.
 */
import { theme } from "#lib/theme.svelte.js";
import { type CawBox, type CawFile, stageCaw } from "./Caw.svelte";
import { deviceRatio } from "./device-ratio.svelte";

/**
 * How far the picture reaches past his still's box on each side, in CSS px:
 * his dark rim sits a pixel outside the box.
 */
export const CAW_STILL_BLEED = 2;

/**
 * Where his head's circle is centred in the `compacted` still's box, as
 * shares of its side. His beak and note reach out to the right of his head,
 * so the box's own centre is not the head's: a place that sits his head in a
 * circle moves him by (0.5 − this) × his side, and his head, not his box, is
 * what stands centred. Measured on `loops/compacted/body-00.svg`: a circle
 * fitted to his crown and the back of his head, with the beak, the note and
 * the tufts opened away (radius 0.304 of the box).
 */
export const CAW_HEAD_CENTRE = { x: 0.35, y: 0.496 } as const;

/** Each look's picture once it is drawn, and its drawing while it is on its way. */
const pictures = new Map<string, HTMLCanvasElement>();
const drawing = new Map<string, Promise<HTMLCanvasElement>>();

export interface CawStill {
  /** The picture's side in its own pixels: its canvas's width and height. */
  backing: number;
  /** His still's box on that canvas, in its pixels. */
  box: CawBox;
  dark: boolean;
  /** The picture, while it is on its way; it fails if the file does not load. */
  drawn: Promise<HTMLCanvasElement>;
  /** The picture, if it is drawn already: a place can paint it in this frame. */
  picture: HTMLCanvasElement | undefined;
}

/**
 * `status`'s still with its box `px` CSS px square, in the scheme and on the
 * display the page has now, with CAW_STILL_BLEED px of canvas past the box.
 * Read inside an effect or an attachment, it is read again when the scheme
 * or the device pixel ratio changes.
 */
export function cawStill(status: CawFile, px: number): CawStill {
  const dark = theme.resolved === "dark";
  const span = px + 2 * CAW_STILL_BLEED;
  const backing = Math.round(span * deviceRatio.current);
  const scale = backing / span;
  const box = {
    x: CAW_STILL_BLEED * scale,
    y: CAW_STILL_BLEED * scale,
    side: px * scale,
  };
  const key = `${status}:${px}:${dark}:${backing}`;
  return {
    backing,
    box,
    dark,
    picture: pictures.get(key),
    drawn: draw(key, status, backing, box, dark),
  };
}

function draw(
  key: string,
  status: CawFile,
  backing: number,
  box: CawBox,
  dark: boolean
): Promise<HTMLCanvasElement> {
  const known = drawing.get(key);
  if (known) {
    return known;
  }
  const canvas = document.createElement("canvas");
  canvas.width = backing;
  canvas.height = backing;
  const made = stageCaw(status, canvas, box, dark).then((stage) => {
    stage.rest();
    stage.dispose();
    pictures.set(key, canvas);
    return canvas;
  });
  // A drawing that failed is not kept: the next place asks again.
  made.catch(() => drawing.delete(key));
  drawing.set(key, made);
  return made;
}
