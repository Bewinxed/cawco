/**
 * One tooltip for a whole glass (BarGlass), its items' tips its triggers:
 * moving from one item to its neighbour, the open tooltip slides over and
 * says the next one's words, as macOS's toolbar tips do (the owner's pick
 * on the Working area: "Glide within a glass"). bits-ui's own tether
 * (`Tooltip.createTether`, a Root and its detached triggers sharing one
 * open state and a payload) is the primitive: the glass holds the Root
 * (glide-tip.svelte), and each item's Tip is a trigger of it carrying its
 * words. Entering the glass, the tooltip fades in as every tooltip does
 * (DESIGN.md, Tooltip); only moving along it glides, its place, size and
 * words together (glide-tip.svelte).
 */
import { Tooltip as TooltipPrimitive } from "bits-ui";
import { createContext } from "svelte";

/** What one item's tip says: its words, the strong line over them, its keys, and the side it stands on. */
export interface GlideWords {
  keys?: string;
  label: string;
  side: "top" | "right" | "bottom" | "left";
  title?: string;
}

export type Glide = TooltipPrimitive.Tether<GlideWords>;

const [glideOf, setGlide] = createContext<Glide>();

/** The glass's one tooltip, its items' tips tethered to it. */
export const provideGlide = (): Glide => {
  const tether = TooltipPrimitive.createTether<GlideWords>();
  setGlide(tether);
  return tether;
};

/** The glass's tooltip an item's tip joins; none outside a glass. */
export const glideHere = (): Glide | null => {
  try {
    return glideOf();
  } catch {
    return null;
  }
};
