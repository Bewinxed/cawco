/**
 * Each session's preview as the hub keeps it (`preview` frames, and the
 * board's list of them), the shows this page brought forward, and the
 * fleet's preview mode the board carries.
 */
import type { FramePayload } from "@cawco/core/frames";
import type { PreviewSettings } from "@cawco/core/preview/routes";
import { heardFrame } from "../heard";
import type { BoardFrame, FrameOf } from "../hub/frames";
import { closedHere, closeHere } from "../preview/closed-here";
import { boardState } from "./board.svelte";
import { equal } from "./same";

export const previewsState = $state<{
  previews: Record<
    string,
    Extract<FramePayload, { kind: "preview" }> & {
      title?: string;
      path?: string;
      /** The page's capture in each scheme (PageThumb draws the reader's). */
      thumbnail?: import("../preview/wire").PageThumbnail;
      /** The revision the thumbnail was taken of. */
      thumbnailRevision?: string;
      /** A transcript card that shows the thumbnail is on screen (ToolGroup): the pane takes one. */
      thumbnailWanted?: boolean;
    }
  >;
  previewRequests: Record<string, number>;

  /**
   * The fleet's preview mode, from the board: a switch moves every preview
   * origin, so a page loaded on its own (decisions PageFrame) loads again.
   */
  previewSettings: PreviewSettings | null;
}>({
  previews: {},
  previewRequests: {},
  previewSettings: null,
});

export function takePreview(frame: FrameOf<"preview">): void {
  heardFrame(`preview:${frame.instanceId}`);
  const previous = previewsState.previews[frame.instanceId];
  const sameRevision = previous?.revision === frame.revision;
  // A show this tab closed stays closed here (closed-here.ts).
  const drawn = closedHere(frame.instanceId, frame);
  const next = {
    ...(sameRevision ? previous : {}),
    ...drawn,
  };
  if (!equal(previous, next)) {
    previewsState.previews[frame.instanceId] = next;
  }
  // A show: one opened, or moved on, after the page's first read of the
  // fleet. What that read finds open was open before the page came, and is
  // no show to bring forward (ProjectConversation's Preview, ProjectPage's
  // Decisions, SideSheet's snap all follow `previewRequests`).
  if (
    boardState.liveRead &&
    drawn.state === "open" &&
    (previous?.state !== "open" || !sameRevision)
  ) {
    revealPreview(frame.instanceId);
  }
}

/** The previews the board lists; one it no longer lists is closed. */
export function takeBoardPreviews(frame: BoardFrame): void {
  if (!frame.previews) {
    return;
  }
  const current = new Set(frame.previews.map((preview) => preview.instanceId));
  for (const [id, preview] of Object.entries(previewsState.previews)) {
    if (!current.has(id) && preview.state !== "closed") {
      heardFrame(`preview:${id}`);
      previewsState.previews[id] = { ...preview, state: "closed" };
    }
  }
  for (const preview of frame.previews) {
    takePreview(preview);
  }
}

/** The fleet's preview mode, as the board carries it. */
export function takePreviewSettings(frame: BoardFrame): void {
  if (
    frame.previewSettings &&
    !equal(previewsState.previewSettings, frame.previewSettings)
  ) {
    previewsState.previewSettings = frame.previewSettings;
  }
}

/**
 * Asks the session's preview to be brought into view: a phone's sheet comes
 * back to its middle snap from wherever the reader left it, Caw's panel comes
 * to Preview. Said for a show heard after the page's first read, and for a
 * card of it pressed; never for what was open as the page came.
 */
export function revealPreview(instanceId: string): void {
  previewsState.previewRequests[instanceId] =
    (previewsState.previewRequests[instanceId] ?? 0) + 1;
}

/**
 * Closes the session's panel in this tab alone (closed-here.ts): every other
 * tab and device keeps it open, and the agent's next show opens it here
 * again.
 */
export function closePreview(instanceId: string): void {
  const previous = previewsState.previews[instanceId];
  if (previous?.state !== "open") {
    return;
  }
  closeHere(instanceId, previous.show);
  previewsState.previews[instanceId] = { ...previous, state: "closed" };
}

/** Each session's preview, the shows asked for since the page came, and the fleet's preview mode. */
export const previewsStore = {
  get previews() {
    return previewsState.previews;
  },
  get previewRequests() {
    return previewsState.previewRequests;
  },
  /** The fleet's preview mode, as the board last carried it; null before the first board. */
  get previewSettings(): PreviewSettings | null {
    return previewsState.previewSettings;
  },
};
