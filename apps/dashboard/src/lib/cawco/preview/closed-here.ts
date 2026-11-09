/**
 * A session's panel closed in this browser tab alone (the owner's pick,
 * 2026-11-10: "Close hides the panel only in the tab where you pressed it.
 * Other tabs and devices keep showing it, and whatever the agent shows next
 * opens again everywhere"). The hub keeps the session's one show
 * (server.ts `previewTargets`) for every tab; Close keeps that show's
 * identity (core `PreviewFrame.show`) in this tab's sessionStorage, so a
 * reload of the tab stays closed and no other tab or device hears of it.
 * Every show, the agent's or the person's own (`showArtifact`), is a new
 * one, which opens here again. An edit of what it shows is no show (the
 * owner, 2026-11-11: "An agent editing a page it already showed
 * (artifact_update) is not showing something next"): an update's re-show
 * and a republish move the frame's revision and keep its show, so the tab
 * stays closed.
 *
 * The fleet store reads every preview frame through {@link closedHere}
 * (client.svelte.ts). An artifact's own tab shows its own artifact, never
 * the panel (artifact-session.svelte.ts), so nothing there is closed here.
 */
import type { PreviewFrame } from "@cawco/core/frames";
import { store, stored, unstore } from "../../platform/storage";

const closedKey = (instanceId: string) => `cawco-preview-closed:${instanceId}`;

/** This tab closes session `instanceId`'s panel on show `show`. */
export function closeHere(instanceId: string, show: string): void {
  store("session", closedKey(instanceId), show);
}

/**
 * `frame` as this tab draws it: an open show this tab closed reads closed.
 * An open frame of any other show is a new one, and this tab forgets the
 * one it closed.
 */
export function closedHere<F extends Pick<PreviewFrame, "show" | "state">>(
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
  if (closed === frame.show) {
    return { ...frame, state: "closed" };
  }
  unstore("session", closedKey(instanceId));
  return frame;
}
