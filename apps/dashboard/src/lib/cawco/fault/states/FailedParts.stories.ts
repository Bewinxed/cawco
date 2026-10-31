/**
 * A failed part's face, in every place it is wired (Component Story Format
 * 3, live components): the real boundary (RegionBoundary), its faces
 * (fault/) and the parts round them, each part throwing as it is built
 * (FailedParts). Try again rebuilds it: on a frame that is not stuck the
 * part comes back; on a stuck one it throws the same way at once and the
 * face turns to Reload page.
 */
import FailedParts from "./FailedParts.svelte";
import { desk, phone } from "./windows";

export default {
  title: "Failure states",
  component: FailedParts,
  args: { place: "side", stuck: false, width: 1540, height: 800 },
};

/** The task beside a conversation, on a desk: its name and Close stand round the face. */
export const SidePanel = desk({ place: "side" });
/** The task beside a conversation, every rebuild throwing: Try again turns to Reload page. */
export const SidePanelStuck = desk({ place: "side", stuck: true });
/** The preview's sheet on a phone: its grabber, name and Close stand round the face. */
export const PreviewSheet = phone({ place: "sheet" });
/** The preview's sheet on a phone, every rebuild throwing. */
export const PreviewSheetStuck = phone({ place: "sheet", stuck: true });
/** A whole page that can't be drawn, under its bar, on a desk. */
export const Page = desk({ place: "page" });
/** A whole page that can't be drawn, on a phone. */
export const PagePhone = phone({ place: "page" });
/** A pane's tabs that can't be drawn, under the phone's bar. */
export const TabsPhone = phone({ place: "tabs" });
/** The composer that can't be drawn, in its pill's place, on a phone. */
export const ComposerPhone = phone({ place: "composer" });
