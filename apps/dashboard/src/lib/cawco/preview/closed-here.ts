/**
 * A session's panel closed in this browser tab alone (the owner's pick,
 * 2026-11-10: "Close hides the panel only in the tab where you pressed it.
 * Other tabs and devices keep showing it, and whatever the agent shows next
 * opens again everywhere"). The hub keeps the session's one show
 * (server.ts `previewTargets`) for every tab; Close keeps that show's
 * revision in this tab's sessionStorage, so a reload of the tab stays
 * closed and no other tab or device hears of it. Every show, the agent's or
 * the person's own (`showArtifact`), is a new revision, which opens here
 * again.
 *
 * The fleet store reads every preview frame through {@link closedHere}
 * (client.svelte.ts). An artifact's own tab shows its own artifact, never
 * the panel (artifact-session.svelte.ts), so nothing there is closed here.
 */
import type { PreviewFrame } from "@cawco/core/frames";
import { store, stored, unstore } from "../storage";

const closedKey = (instanceId: string) => `cawco-preview-closed:${instanceId}`;

/** This tab closes session `instanceId`'s panel showing `revision`. */
export function closeHere(instanceId: string, revision: string): void {
  store("session", closedKey(instanceId), revision);
}

/**
 * `frame` as this tab draws it: an open show this tab closed reads closed.
 * An open frame of any other revision is a new show, and this tab forgets
 * the one it closed.
 */
export function closedHere<F extends Pick<PreviewFrame, "revision" | "state">>(
  instanceId: string,
  frame: F
): F {
  if (frame.state !== "open") {
    return frame;
  }
  const closed = stored("session", closedKey(instanceId));
  if (closed === null) {
    return frame;
  }
  if (closed === frame.revision) {
    return { ...frame, state: "closed" };
  }
  unstore("session", closedKey(instanceId));
  return frame;
}
