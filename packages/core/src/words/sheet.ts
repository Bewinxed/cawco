import { commonWords } from "./common";

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
  /** The card's title for a states file that isn't there (core `StageError` kind `missing`), before its file. */
  missingTitle: "Not written yet:",
  /** The card's title for a section whose code threw in the page (kind `page`), before its place. */
  pageTitle: "Didn't load:",
  /** The card's foot: how many errors stand besides the first, and what happens next. */
  errorNext: (more: number) =>
    `${more > 0 ? `${more} more besides. ` : ""}The session is told; the sheet redraws once it compiles.`,
  /** The foot under a missing states file, whose own words say what draws it. */
  missingNext: (more: number) =>
    `${more > 0 ? `${more} more besides. ` : ""}The session is told.`,
  /** Under the down card, when the hub's last read couldn't reach the stage (core `StageUnreached`): since when, and why in the hub's words. */
  unreachedSince: (since: string, why: string) =>
    `Not reached since ${since}: ${why}`,
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
  /** The stage's refusal where the machine's PATH has no bun (agent user-bun.ts), and how to get it (bun.com/docs/installation). */
  noBun:
    "A sheet's stage runs on this machine's own bun, and its PATH has none, so it can't start: install it with `curl -fsSL https://bun.com/install | bash` (bun.com/docs/installation), then call again.",
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
  tryAgain: commonWords.tryAgain,
  /** Try again's words while the stage starts again. */
  tryingAgain: "Starting…",
};
