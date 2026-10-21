/**
 * The layer a hanging card stands in, given by whatever draws the card's
 * screen: the Shell's (as wide as the window, on the floating layer), or a
 * states frame's (its own box). It is a `shell` container (HangCard's frame
 * rules read its width, `@max-phone/shell`, `100cqi`), and says its height
 * as `--shell-h`, which a container query can't, so it has to say it
 * itself: the window's `100dvh` in the Shell, the frame's own height in a
 * frame. A card portaled out of where it is mounted (the session card,
 * PaneTabs) is portaled into it (`to`), and the room it is placed in is the
 * layer's box (`room`), never the window. A unique selector each, so a
 * canvas's frames each keep their own.
 */
import { getContext, setContext } from "svelte";

export interface HangLayer {
  /** The attribute value that marks the layer's element (`data-hang-layer`). */
  readonly id: string;
  /** The room a card is placed in: the layer's box, on the screen. */
  room: () => DOMRect;
  /** The layer's selector: a portal's `to`. */
  readonly to: string;
}

const KEY = Symbol("hang-layer");

/** Gives the components under this one the layer marked `data-hang-layer={id}`. */
export function provideHangLayer(id: string): HangLayer {
  const to = `[data-hang-layer="${id}"]`;
  const layer: HangLayer = {
    id,
    to,
    room: () => {
      const element = document.querySelector(to);
      if (!element) {
        throw new Error(`The hang layer ${to} is not drawn.`);
      }
      return element.getBoundingClientRect();
    },
  };
  setContext(KEY, layer);
  return layer;
}

/** The layer this component's hanging cards stand in. */
export function hangLayer(): HangLayer {
  const layer = getContext<HangLayer | undefined>(KEY);
  if (!layer) {
    throw new Error("A hanging card needs a hang layer above it.");
  }
  return layer;
}
