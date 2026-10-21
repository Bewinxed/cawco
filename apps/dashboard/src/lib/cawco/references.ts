/**
 * The dashboard's registry of rich references (core references.ts): for
 * each kind a `cawco:` link can name, how the dashboard finds the id it
 * names and the element that draws it. A new kind is added to core's
 * `REFERENCE_KINDS` and here, and nowhere else: the record is keyed by
 * that list, so a kind without its entry fails the type check.
 *
 * What a written link draws as (`referenceOf`): a known kind naming an id
 * the dashboard holds is that kind's element; a `cawco:` link of any other
 * kind, or naming an id the dashboard does not hold, is its label alone;
 * any other destination is a link.
 */
import { parseReference, type ReferenceKind } from "@cawco/core";
import type { Component } from "svelte";
import { cawco } from "./client.svelte";
import SessionReference from "./SessionReference.svelte";
import { threadTabId } from "./thread-tabs";

interface ReferenceElement {
  /** What draws it, given the id `find` answered. */
  readonly element: Component<{ id: string }>;
  /** The id as the dashboard holds it, or null when it holds none by that id. */
  find: (id: string) => string | null;
}

export const REFERENCE_ELEMENTS: Record<ReferenceKind, ReferenceElement> = {
  /**
   * A session, delegate, workflow run or Caw thread: a row of the instance
   * index. A thread is written by its own id (hub caw.ts) and listed by its
   * tab's, `thread:<id>` (thread-tabs.ts).
   */
  session: {
    find: (id) => {
      const rows = cawco.instanceIndex.byId;
      if (rows.has(id)) {
        return id;
      }
      const thread = threadTabId(id);
      return rows.has(thread) ? thread : null;
    },
    // Read when drawn, not when this module loads: the element's own
    // imports reach the markdown that imports this registry.
    get element() {
      return SessionReference;
    },
  },
};

const isKind = (kind: string): kind is ReferenceKind =>
  Object.hasOwn(REFERENCE_ELEMENTS, kind);

export type Drawn =
  | { draw: "link" }
  | { draw: "label" }
  | { draw: "element"; element: Component<{ id: string }>; id: string };

/** What a written link whose destination is `href` draws as. */
export function referenceOf(href: string): Drawn {
  const reference = parseReference(href);
  if (!reference) {
    return href.startsWith("cawco:") ? { draw: "label" } : { draw: "link" };
  }
  if (!isKind(reference.kind)) {
    return { draw: "label" };
  }
  const entry = REFERENCE_ELEMENTS[reference.kind];
  const id = entry.find(reference.id);
  return id
    ? { draw: "element", element: entry.element, id }
    : { draw: "label" };
}
