/**
 * Guide after a reply, option C: an update card on the agent's turn plus a
 * Review toast (Component Story Format 3, live components). The agent's
 * turn (Turn) that made a revision carries what it changed (UpdateCard):
 * each element's before → after and the comment it answers or left
 * unanswered, Review opening the panel at the first stop; with the panel
 * closed a toast says an update landed (ReviewToast). The panel, tag,
 * washes and thread card stay today's. The screen is the guide fixture
 * (preview/guide/GuideC.svelte) on the advisor's example (the landing-hero
 * page, pins ① and ②, revision 7's three changes).
 */
import GuideC from "../preview/guide/GuideC.svelte";

export default {
  title: "Guide after a reply/C · Update card on the turn, Review toast",
  component: GuideC,
  args: { scene: "came-back" },
};

/** Back at the desk: the agent's last turn carries the update card, 2 answered and 1 not; the panel as today, so no toast (it stands only while the panel is closed). Desk 1440. */
export const CameBack = {
  args: { scene: "came-back" },
  parameters: { viewport: 1440 },
};

/** First stop after Review: today's stepping, pin 1's thread open beside its pill; the card stays in the turn; no toast, which stands only while the panel is closed. Desk 1440. */
export const StoppedAtHeadline = {
  args: { scene: "stop-1" },
  parameters: { viewport: 1440 },
};

/** The stop on pin 2: today's tag at 3 of 3 with no thread; the card's ! row offers Ask again; no toast, which stands only while the panel is closed. Desk 1440. */
export const PinTwoUnanswered = {
  args: { scene: "pin-2" },
  parameters: { viewport: 1440 },
};

/** After a 30-minute run with the panel closed: one card per update, the newest saying 7 changes across 4 updates, and the toast. Desk 1440. */
export const ThirtyMinuteRun = {
  args: { scene: "rollup" },
  parameters: { viewport: 1440 },
};

/** Phone session tab, sheet closed: the card under the turn and the toast at the top. Phone 390. */
export const PhoneSessionSheet = {
  args: { scene: "phone-session" },
  parameters: { viewport: 390 },
};

/** Phone artifact tab: no conversation, so one line of counts under today's tag. Phone 390. */
export const PhoneArtifactTab = {
  args: { scene: "phone-tab" },
  parameters: { viewport: 390 },
};
