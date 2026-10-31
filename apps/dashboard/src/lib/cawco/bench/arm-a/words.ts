/**
 * The image settings' words (DESIGN.md, Voice). They stand here, not in
 * packages/core/src/words, because this bench piece may touch nothing
 * outside its own folder and route.
 */
import { SIDE_MAX, SIDE_MIN, SIDE_STEP } from "./image-settings";

type Side = "Width" | "Height";

export const imageSettingsWords = {
  title: "Image settings",
  colour: "Colour",
  accents: "House accents",
  custom: "Custom colour",
  customHint: "Hex or oklch, like #e65d46 or oklch(0.6 0.2 30)",
  customIdle: (swatch: string) =>
    `Not in use while ${swatch} is chosen. Edit it to use it.`,
  pickFromScreen: "Pick from screen",
  picking: "Picking…",
  chosen: "Chosen colour",
  noColour: "No colour chosen",
  size: "Size",
  presets: "Size presets",
  customSize: "Custom",
  width: "Width" as Side,
  height: "Height" as Side,
  px: "px",
  lock: "Keep aspect ratio",
  ratio: "Ratio",
  ratioKept: ", kept",
  megapixels: "MP",
  readoutWaits: "Ratio and megapixels show once the size is valid",
  apply: "Apply settings",
  applying: "Applying…",
  applied: "Applied to the next image",
  fixToApply: "Fix the flagged value to apply",
  applyFailed: (why: string) =>
    `${why.charAt(0).toUpperCase()}${why.slice(1)}, so the settings didn’t apply. They’re kept here: press Apply settings again.`,
  disabled: "Settings are locked while an image generates",
  colourFault: {
    unknown: (typed: string) =>
      `“${typed}” isn’t a colour this panel reads. Enter a hex like #e65d46 or oklch(L C H).`,
    "hex-length": (typed: string, digits: number) =>
      `“${typed}” has ${digits} hex digits. A hex colour has 3 or 6.`,
    lightness: (typed: string) =>
      `“${typed}” has its lightness out of range. Use 0 to 1, or 0% to 100%.`,
    chroma: (typed: string) =>
      `“${typed}” has its chroma out of range. Use 0 to 0.5.`,
  },
  sideFault: {
    empty: (side: Side) =>
      `Enter a ${side.toLowerCase()} from ${SIDE_MIN} to ${SIDE_MAX} px.`,
    nan: (side: Side, typed: string) =>
      `${side} “${typed}” isn’t a whole number of pixels.`,
    low: (side: Side) => `${side} is under ${SIDE_MIN} px.`,
    high: (side: Side) => `${side} is over ${SIDE_MAX} px.`,
    step: (side: Side) => `${side} moves in steps of ${SIDE_STEP} px.`,
  },
  useNearest: (px: number) => `Use ${px}`,
  useNearestFor: (side: Side, px: number) =>
    `Use ${px} px for ${side.toLowerCase()}`,
};
