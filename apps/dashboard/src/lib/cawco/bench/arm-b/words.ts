/**
 * The image settings' words, written to DESIGN.md's Voice. They stand beside
 * the component rather than in packages/core/src/words: the bench's brief
 * keeps every change inside bench/arm-b and its dev route.
 */
import type { ColourFault, SizeFault } from "./image-settings.js";

const count = new Intl.NumberFormat();

export const imageSettingsWords = {
  title: "Image settings",
  colour: "Colour",
  colourField: "Colour value, hex or oklch",
  colourPlaceholder: "#E65D46 or oklch(…)",
  customColour: "Custom colour",
  pickFromScreen: "Pick from screen",
  pickFromScreenHint: "Take a colour from anywhere on your screen",
  swatches: "House colours",
  size: "Size",
  presets: "Size presets",
  custom: "Custom",
  anySize: "any size from 256 to 4,096 px",
  anySizeShort: "256–4096",
  width: "Width",
  height: "Height",
  px: "px",
  keepRatio: "Keep aspect ratio",
  megapixels: (mp: string) => `${mp} MP`,
  pixels: (width: number, height: number) =>
    `${count.format(width)} × ${count.format(height)} px`,
  use: (px: number) => `Use ${count.format(px)}`,
  useFor: (dimension: string, px: number) =>
    `Use ${count.format(px)} px for the ${dimension.toLowerCase()}`,
  apply: "Apply settings",
  applying: "Applying…",
  applied: "Applied",
  applyFailed: (reason: string) =>
    `Settings weren't applied (${reason}). Your values are kept; Apply settings again.`,
  colourFault: {
    empty: "Enter a colour: a hex like #E65D46 or oklch(0.62 0.18 33).",
    "hex-digits":
      "A hex colour takes 3 or 6 digits from 0–9 and A–F, like #E65D46.",
    "oklch-shape":
      "oklch takes three numbers, lightness, chroma and hue, like oklch(0.62 0.18 33).",
    lightness: "Lightness runs from 0 to 1, or 0% to 100%.",
    chroma: "Chroma runs from 0 to 0.5.",
    hue: "Hue runs from 0 to 360.",
    format:
      "Enter a hex like #E65D46 or an oklch value like oklch(0.62 0.18 33).",
  } satisfies Record<ColourFault, string>,
  sizeFault: (dimension: string, fault: SizeFault): string => {
    switch (fault) {
      case "empty":
        return `Enter the ${dimension.toLowerCase()} in pixels.`;
      case "not-number":
        return `${dimension} takes a whole number of pixels.`;
      case "below":
        return `${dimension} starts at 256 px.`;
      case "above":
        return `${dimension} stops at ${count.format(4096)} px.`;
      case "step":
        return `${dimension} goes in steps of 8 px.`;
      default:
        return fault satisfies never;
    }
  },
};
