/**
 * The kit's Toaster (Component Story Format 3, live components) in a frame
 * of its own (sonner-frame): a toast with its undo, and two stacked. The
 * meta's args are every story's; a story's own args are what it changes.
 */
import SonnerFrame from "./sonner-frame.svelte";

export default {
  title: "Kit/Toast",
  component: SonnerFrame,
  args: {
    toasts: [{ words: "Archived “Fix tray chip overflow”", action: "Undo" }],
    height: 140,
  },
};

/** One toast, with its undo. */
export const WithUndo = {};

/** Two toasts stacked. */
export const Stacked = {
  args: {
    toasts: [
      {
        words: "studio-mac joined the fleet",
        line: "It runs macOS 16 and the latest daemon.",
      },
      { words: "Copied the pairing command" },
    ],
    height: 220,
  },
};
