/**
 * The stage's own page's entry (`by=stage`, host.ts serves it as
 * `cawco:stage/reader.js`): the canvas page (runtime.ts) with its reader
 * (rig.ts), which reads each states file for the render report and posts
 * it. The daemon's headless page of a canvas is the one page that loads it
 * (agent stage-render.ts); every page a person uses loads runtime.ts's
 * `boot`, which reads nothing. This is the one module that imports rig.ts
 * (biome.jsonc bans the import anywhere else).
 */
import type { BootOptions } from "./page";
import { readerOf } from "./rig";
import { bootPage } from "./runtime";

/** The stage's own page: drawn as any canvas page is, and read for the report. */
export function boot(options: BootOptions): void {
  bootPage(options, readerOf);
}
