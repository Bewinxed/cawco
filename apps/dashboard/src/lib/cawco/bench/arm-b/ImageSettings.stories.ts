/**
 * The image settings panel (Component Story Format 3, live): each story is
 * the working panel opened in one state, its controls live. Every story
 * offers Pick from screen unless it says the browser has no EyeDropper, so
 * the canvas draws the same panel in every engine. Drawn at a phone's width,
 * the panel's narrowest home.
 */
import ImageSettings from "./ImageSettings.svelte";

export default {
  title: "Image settings",
  component: ImageSettings,
  args: { eyeDropper: true },
  parameters: { viewport: 390 },
};

/** Opened fresh: coral, a 1024 × 1024 square, the ratio kept. */
export const Default = {};

/** The 16:9 preset picked: 1280 × 720, its ratio kept. */
export const PresetPicked = { args: { width: "1280", height: "720" } };

/** A custom oklch colour typed in, its long value whole in the field. */
export const CustomColourValid = {
  args: { colour: "oklch(0.6271 0.2577 29.23)" },
};

/** A hex with a letter past F: refused, what was typed kept. */
export const CustomColourInvalid = { args: { colour: "#12G4A0" } };

/** A custom size with its ratio kept: 2048 × 1152, a width change moves the height. */
export const SizeLocked = { args: { width: "2048", height: "1152" } };

/** Both sides out of range, the ratio free: each offers its nearest valid size. */
export const SizeOutOfRange = {
  args: { width: "5000", height: "201", locked: false },
};

/** A browser with no EyeDropper: Pick from screen is not offered. */
export const EyeDropperUnsupported = { args: { eyeDropper: false } };

/** Apply pressed: the settings on their way. */
export const Applying = { args: { applying: true } };

/** Applied and unchanged since: nothing to apply until a value moves. */
export const Applied = {
  args: { applied: { colour: "#E65D46", width: 1024, height: 1024 } },
};

/** The last apply failed: said in the panel, the values kept. */
export const ApplyFailed = {
  args: { failure: "the hub didn't answer in 30 s" },
};

/** Locked while an image generates with these settings. */
export const Disabled = {
  args: {
    disabled: true,
    disabledReason:
      "An image is generating with these settings. They unlock when it's done.",
  },
};

/** On a desk, the panel at its own width beside the page. */
export const Desk = { parameters: { viewport: 1440 } };
