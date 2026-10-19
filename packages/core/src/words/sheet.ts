/**
 * What a sheet's pane says of its stage (live components, core stage.ts):
 * the project's own dev toolchain (Vite, Astro or Nuxt), which the daemon
 * runs in the workspace. The
 * dashboard's preview pane and the app's preview read these; `bun run words`
 * writes them into the app as `Words.Sheet` (CawCoCore/Words.generated.swift).
 */
export const sheetWords = {
  /** The loading cover's line while the stage first starts. */
  starting: (dir: string) => `Starting the dev server in ${dir}…`,
  /** The cover's line while a sleeping stage starts again. */
  waking: "Waking…",
  /** The cover's line while the stage serves and the page has not said it is ready. */
  compiling: "Compiling…",
  /** The compile error card's title, before the error's `file:line:column`. */
  errorTitle: "Doesn't compile:",
  /** The card's foot: how many errors stand besides the first, and what happens next. */
  errorNext: (more: number) =>
    `${more > 0 ? `${more} more besides. ` : ""}The session is told; the sheet redraws once it compiles.`,
  /** Where the page would be, when the stage did not start or failed its restarts. */
  downTitle: (dir: string) => `The stage for ${dir} didn't start`,
  /** Each dev toolchain a sheet's stage runs (core stage.ts `StageToolchain`), by its own name. */
  toolchains: { vite: "Vite", astro: "Astro", nuxt: "Nuxt" },
  /** The line under it, in plain words, its toolchain by its name in `toolchains`; the stage's own words stand under Show details. */
  downLine: (toolchain: string) =>
    `${toolchain} stopped before it served the canvas. Try again starts it again.`,
  /** A workspace preview's server (`serve`), run the same way: the cover's line while it starts. */
  serverStarting: "Starting the server…",
  /** Where its page would be, when the server did not start or stopped. */
  serverDownTitle: (port: number) => `The server on port ${port} isn't running`,
  /** The line under it, in plain words; the server's own words stand under Show details. */
  serverDownLine: "It stopped before it answered. Try again starts it again.",
  /** Where the page would be, when the stage stood on its way past the time it is given to serve (core `STAGE_READY_MS`) and the canvas never drew. */
  neverDrawnTitle: "The canvas couldn't be drawn",
  /** The line under it, in plain words: how long it was given, then the two ways out; the stage's own words stand under Show details. */
  neverDrawnLine: (seconds: number) =>
    `The stage never answered within ${seconds}s. Try again starts it again, or remove the canvas.`,
  /** The way out besides Try again: the canvas leaves the panel, once asked in place. */
  remove: "Remove",
  removeTitle: (name: string) => `Remove ${name}?`,
  removeBody:
    "It leaves the panel, with its pins. Its states file stays, and the session can open it again.",
  removeConfirm: "Remove canvas",
  removing: "Removing…",
  tryAgain: "Try again",
  /** Try again's words while the stage starts again. */
  tryingAgain: "Starting…",
};
