/**
 * The image settings (Component Story Format 3, live components): the panel
 * someone uses to set the colour and size of an image they're about to
 * generate, in every state its code reaches, at a side panel's width. The
 * meta's args are every story's; a story's own args are what it changes.
 */
import ImageSettings from "./ImageSettings.svelte";

const COMING = { colour: "oklch(0.645 0.175 33)", width: 1280, height: 720 };

export default {
  title: "Bench/Image settings",
  component: ImageSettings,
  args: {
    colour: "coral",
    customColour: "",
    preset: "1:1",
    width: "1024",
    height: "1024",
    locked: false,
    applied: null,
    pending: false,
    disabled: false,
    eyeDropper: true,
  },
  parameters: { viewport: 390 },
};

/** Coral at 1024 × 1024, nothing applied yet: Apply is ready. */
export const Default = {};

/** The 16:9 preset picked: 1280 × 720, its ratio and megapixels said. */
export const PresetPicked = {
  args: { preset: "16:9", width: "1280", height: "720" },
};

/** A long oklch typed in the custom field: drawn, named Custom, and its value wraps. */
export const CustomColourValid = {
  args: { colour: "custom", customColour: "oklch(0.6271 0.2577 29.23)" },
};

/** An unfinished oklch: rejected with why and how to fix it, the typed words kept. */
export const CustomColourInvalid = {
  args: { colour: "custom", customColour: "oklch(0.6271 0.2577" },
};

/** The aspect lock on at 3:2: a new width brings its height with it. */
export const SizeLocked = {
  args: { preset: "3:2", width: "1248", height: "832", locked: true },
};

/** Width over 4096 and height under 256: each flagged with the nearest size offered. */
export const SizeOutOfRange = {
  args: { preset: "custom", width: "5000", height: "200" },
};

/** A browser with no EyeDropper: the field stands alone, no dead picker. */
export const EyeDropperUnsupported = { args: { eyeDropper: false } };

/** Apply sent and running: its spinner and Applying…, presses swallowed. */
export const Applying = {
  args: { preset: "16:9", width: "1280", height: "720", pending: true },
};

/** Apply finished: the check, then "Applied to the next image" and Apply at rest. */
export const Applied = {
  args: {
    preset: "16:9",
    width: "1280",
    height: "720",
    applied: COMING,
  },
  from: "Applying",
  play: async ({
    update,
  }: {
    update: (next: Record<string, unknown>) => Promise<void>;
  }) => {
    await update({ pending: false, applied: COMING });
  },
};

/** Apply's sender failed: why, in crimson beside Apply, every value kept for another try. */
export const ApplyFailed = {
  args: {
    onapply: () => Promise.reject(new Error("the generator stopped answering")),
  },
  from: "Default",
  play: async ({
    canvas,
    userEvent,
  }: {
    canvas: { getByText: (text: string) => HTMLElement };
    userEvent: { click: (element: HTMLElement) => Promise<void> };
  }) => {
    await userEvent.click(canvas.getByText("Apply settings"));
  },
};

/** Locked while an image generates: every control faded and still. */
export const Disabled = { args: { disabled: true } };

/** At a desk side panel's width, the long oklch and an off-step width together. */
export const DeskPanel = {
  args: {
    colour: "custom",
    customColour: "oklch(0.6271 0.2577 29.23)",
    preset: "custom",
    width: "1001",
    height: "768",
  },
  parameters: { viewport: 420 },
};
