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
  /** The line under it: the stage's own reason, or, when it gave none, that its toolchain (its name in `toolchains`) ended. */
  downLine: (message: string | null, toolchain: string) =>
    `${message ?? `${toolchain} ended before it served the sheet.`} Try again starts it again.`,
  /** A workspace preview's server (`serve`), run the same way: the cover's line while it starts. */
  serverStarting: "Starting the server…",
  /** Where its page would be, when the server did not start or stopped. */
  serverDownTitle: (port: number) => `The server on port ${port} isn't running`,
  serverDownLine: (message: string | null) =>
    `${message ?? "It ended before it answered."} Try again starts it again.`,
  tryAgain: "Try again",
  /** Try again's words while the stage starts again. */
  tryingAgain: "Starting…",
};
