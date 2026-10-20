/**
 * What a `cawco:<kind>/<id>` link in written words draws as (core
 * references.ts): one component per kind, given the id and the link's label.
 * The Markdown renderer asks this of every link it draws, wherever message
 * text is drawn. A kind not here, or a link that is not a `cawco:` one,
 * gets no component; a component whose id names nothing draws the label.
 */
import { parseReference } from "@cawco/core";
import type { Component, Snippet } from "svelte";
import SessionChip from "./SessionChip.svelte";

export type ReferenceView = Component<{ id: string; label: Snippet }>;

/**
 * Each kind's component, read when a link is drawn: the chip's card draws a
 * session's tail, whose messages are drawn by the renderer that reads this,
 * so the modules import each other and none is read as they load.
 */
const VIEWS: Record<string, () => ReferenceView> = {
  session: () => SessionChip,
};

/**
 * A link's destination as a reference: its kind's component and id, the
 * component null for a kind this dashboard does not draw; null when the
 * destination is no `cawco:` URL.
 */
export function referenceOf(
  href: string
): { id: string; view: ReferenceView | null } | null {
  const reference = parseReference(href);
  return reference
    ? { id: reference.id, view: VIEWS[reference.kind]?.() ?? null }
    : null;
}
