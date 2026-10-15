import {
  type MemoryScope,
  scoped,
  scopeWords,
  userLayerLabel,
} from "@cawco/core";
import type { Machine } from "../client.svelte";

/**
 * The main file has no path under memories/, so in a URL it is `CLAUDE.md` —
 * the name it has on disk — and every other file is its path under memories/.
 */
export const MAIN = "CLAUDE.md";

export const fileLabel = (path: string): string =>
  path === MAIN ? userLayerLabel(MAIN) : userLayerLabel("memories", path);

/**
 * A document's name on the page: a linked one by the file it lands at, a
 * scoped one by its path alone, as it lands in no user layer.
 */
export const docLabel = (
  path: string,
  scope: MemoryScope | undefined
): string => (scoped(scope) ? path : fileLabel(path));

/** A document's scope, as {@link scopeWords} says it, projects by their names. */
export const loadedInto = (
  scope: MemoryScope | undefined,
  projects: readonly { id: string; name: string }[]
): string =>
  scopeWords(
    scope,
    (id) =>
      projects.find((project) => project.id === id)?.name ??
      "a project that is gone"
  );

export const fileHref = (path: string): string => `/config/memory/${path}`;

/** A file's per-machine convergence state. */
export const memoryStateOf = (machine: Machine, path: string) =>
  path === MAIN ? machine.fleet?.memory : machine.fleet?.memoryDocs?.[path];

export const byteLength = (text: string): number =>
  new TextEncoder().encode(text).length;
