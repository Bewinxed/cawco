/**
 * Where script forced layout during a measured move (core stage-measure.ts
 * `ForcedLayout`), from the stack Chrome's trace gives the forced layout or
 * style recalculation: the first frame of the project's own code, its place
 * mapped back through its module's source map to the line written. A
 * stack whose top frame is the stage's own code (its play kit reading a
 * box to press it, its own bookkeeping) is the stage's work, never the
 * component's.
 */

import { unkeyedPath } from "@cawco/core/stage";
import type { ForcedAt, TraceFrame } from "@cawco/core/stage-measure";
import { originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";
import { fileOfPath, notProjects } from "./measure";

/** The stage's own modules: its canvas runtime (stage-host host.ts `VIRTUAL_STAGE`, which Vite serves as `/@id/__x00__cawco:stage/…`) and what it serves under its own prefix. */
const STAGE_OWN = /(?:^|\/)(?:@id\/)?(?:__x00__)?cawco:|^\/@cawco\/(?!m\/)/u;
/** Where a module names its source map: its last `sourceMappingURL` comment. */
const MAP_COMMENT = /\/\/# sourceMappingURL=(\S+)\s*$/u;

/** A library's file from its package's own `node_modules`, wherever the package manager links it (`node_modules/svelte/src/…`). */
const libraryFile = (file: string): string => {
  const at = file.lastIndexOf("node_modules/");
  return at === -1 ? file : file.slice(at);
};

/** Each module's map, by its address, once read; null for one with none. */
const maps = new Map<string, Promise<TraceMap | null>>();

/** The map module `url` names, read once. */
function mapOf(url: string): Promise<TraceMap | null> {
  let kept = maps.get(url);
  if (!kept) {
    kept = (async () => {
      const code = await (await fetch(url)).text();
      const named = code.match(MAP_COMMENT)?.[1];
      if (!named) {
        return null;
      }
      const at = new URL(named, url);
      // Read against its own address, so each source it names is an address on the stage.
      return new TraceMap(await (await fetch(at)).text(), at.href);
    })().catch(() => null);
    maps.set(url, kept);
  }
  return kept;
}

/** A frame's module address, unkeyed; null for one with no address (script the daemon ran). */
const pathOf = (frame: TraceFrame): string | null => {
  if (!frame.url) {
    return null;
  }
  try {
    return unkeyedPath(new URL(frame.url).pathname);
  } catch {
    return null;
  }
};

/**
 * Where `stack` forced layout, `file:line:column` from the toolchain root
 * (`root`, under the page's `base`): its first frame of the project's own
 * code, else its first frame, a library's (`library`), in the source file
 * its module's map names, with the name the map gives the place where it
 * has one; null when its top frame is the stage's own code or none has an
 * address.
 */
export async function forcedPlace(
  stack: readonly TraceFrame[],
  root: string,
  base: string
): Promise<ForcedAt | null> {
  const placed = stack.flatMap((frame) => {
    const path = pathOf(frame);
    return path === null ? [] : [{ frame, path }];
  });
  const [top] = placed;
  if (!top || STAGE_OWN.test(top.path)) {
    return null;
  }
  const project = placed.find((one) => !notProjects(one.path));
  const own = project ?? top;
  const map = await mapOf(own.frame.url);
  const mapped = map
    ? originalPositionFor(map, {
        line: own.frame.line + 1,
        column: own.frame.column,
      })
    : null;
  const line = mapped?.line ?? own.frame.line + 1;
  const column =
    mapped?.column === null || mapped?.column === undefined
      ? own.frame.column + 1
      : mapped.column + 1;
  // A pre-bundled library maps back to its own source file, not the bundle's; a project module is served as its own file.
  const source =
    !project && mapped?.source
      ? pathOf({ ...own.frame, url: mapped.source })
      : null;
  return {
    at: `${libraryFile(fileOfPath(source ?? own.path, root, base))}:${line}:${column}`,
    library: !project,
    ...(mapped?.name ? { name: mapped.name } : {}),
  };
}
