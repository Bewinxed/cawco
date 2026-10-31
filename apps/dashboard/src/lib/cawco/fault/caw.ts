/**
 * The Caw a fault face draws, handed in by its bundle (FaultBoundary's
 * `caw`): the dashboard's is his animated file (home/FaultCaw), a decision
 * page's the kit's still pictures (decisions/host/StillCaw). The faces
 * themselves import neither, so one boundary serves both bundles: the
 * dashboard's Caw cannot load in a decision page's Bun build, whose
 * resolver has no Vite `?url` import (home/Caw.svelte's
 * `@rive-app/canvas/rive.wasm?url`) and no SvelteKit `$app/env`
 * (`#lib/theme.svelte.js`, home/device-ratio.svelte.ts).
 */
import type { Snippet } from "svelte";

export interface FaultCawPose {
  /** The rebuild threw again at once: his `trying` drawing, else `needs-you`. */
  again: boolean;
  /** His head alone, beside a line's words; else the whole of him. */
  head: boolean;
  /** The side of his box, px. */
  size: number;
}

export type FaultCaw = Snippet<[FaultCawPose]>;
