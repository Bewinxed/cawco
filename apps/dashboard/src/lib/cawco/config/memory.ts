import type { Machine } from "../client.svelte";

/**
 * The main file has no path under memories/, so in a URL it is `CLAUDE.md` —
 * the name it has on disk — and every other file is its path under memories/.
 */
export const MAIN = "CLAUDE.md";

export const fileLabel = (path: string): string =>
  path === MAIN ? "~/.claude/CLAUDE.md" : `~/.claude/memories/${path}`;

export const fileHref = (path: string): string => `/config/memory/${path}`;

/** A file's per-machine convergence state. */
export const memoryStateOf = (machine: Machine, path: string) =>
  path === MAIN ? machine.fleet?.memory : machine.fleet?.memoryDocs?.[path];

export const byteLength = (text: string): number =>
  new TextEncoder().encode(text).length;
