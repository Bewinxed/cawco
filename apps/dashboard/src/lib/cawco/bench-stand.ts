/**
 * A motion bench's page stood up as a reached hub draws it (dev only,
 * routes/(app)/motion): the scheme its `?theme=` names, the shell's hub
 * stood in with nothing running, and the bench's machines on the board.
 */
import { theme } from "#lib/theme.svelte.js";
import type { Machine } from "./stores/board.svelte";

export function standBench(scheme: string | null, machines: Machine[]): void {
  if (scheme === "dark" || scheme === "light") {
    theme.set(scheme);
  }
  window.__cawcoDebug.standHub(() => undefined);
  window.__cawcoDebug.boardState.machines = machines;
}
