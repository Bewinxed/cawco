/**
 * A failed part's face, in every place it is wired (Component Story Format
 * 3, live components): the real boundary (RegionBoundary), its faces
 * (fault/) and the parts round them, each part throwing as it is built
 * (FailedParts). Try again rebuilds it: on a frame that is not stuck the
 * part comes back; on a stuck one it throws the same way at once and the
 * face turns to Reload page.
 */
import FailedParts from "./FailedParts.svelte";

export default {
  title: "Failure states",
  component: FailedParts,
  args: { place: "side", stuck: false, height: 800 },
};

const DESK = { parameters: { viewport: 1540 } };
const PHONE = { parameters: { viewport: 390 } };

/** The task beside a conversation, on a desk: its name and Close stand round the face. */
export const SidePanel = { ...DESK, args: { place: "side" } };
/** The task beside a conversation, every rebuild throwing: Try again turns to Reload page. */
export const SidePanelStuck = { ...DESK, args: { place: "side", stuck: true } };
/** The preview's sheet on a phone: its grabber, name and Close stand round the face. */
export const PreviewSheet = { ...PHONE, args: { place: "sheet", height: 844 } };
/** The preview's sheet on a phone, every rebuild throwing. */
export const PreviewSheetStuck = {
  ...PHONE,
  args: { place: "sheet", height: 844, stuck: true },
};
/** One comment that can't be drawn fails as one line; the others stand. */
export const OneComment = { ...DESK, args: { place: "comments" } };
/** One comment that can't be drawn, on a phone. */
export const OneCommentPhone = {
  ...PHONE,
  args: { place: "comments", height: 844 },
};
/** A decision card that can't be drawn, in its place on the page, on a desk. */
export const DecisionCard = { ...DESK, args: { place: "decision" } };
/** A decision card that can't be drawn, on a phone. */
export const DecisionCardPhone = {
  ...PHONE,
  args: { place: "decision", height: 844 },
};
/** A whole page that can't be drawn, under its bar, on a desk. */
export const Page = { ...DESK, args: { place: "page" } };
/** A whole page that can't be drawn, on a phone. */
export const PagePhone = { ...PHONE, args: { place: "page", height: 844 } };
/** A pane's tabs that can't be drawn, under the phone's bar. */
export const TabsPhone = { ...PHONE, args: { place: "tabs", height: 844 } };
/** The composer that can't be drawn, in its pill's place, on a phone. */
export const ComposerPhone = {
  ...PHONE,
  args: { place: "composer", height: 844 },
};
