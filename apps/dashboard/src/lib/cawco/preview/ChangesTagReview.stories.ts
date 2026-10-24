/**
 * Guide after a reply, option A: the review strip on the tag bar (Component
 * Story Format 3, live components). The Changed since you looked tag
 * (ChangesTag) counts what answers him and what went unanswered; each step
 * opens the review strip (ReviewStrip) under it with the element's from →
 * to, his comment, the agent's reply and Reply / Looks right. The screen is
 * the guide fixture (guide/GuideA.svelte): the real panel, rail, turns and
 * composer, on the advisor's example (the landing-hero page, pins ① and ②,
 * revision 7's three changes).
 */
import GuideA from "./guide/GuideA.svelte";

export default {
  title: "Guide after a reply/A · Review strip on the tag bar",
  component: GuideA,
  args: { scene: "came-back" },
};

/** Back at the desk: the tag counts 3 changed, 2 that answer you, 1 unanswered; nothing opened yet. Desk 1440. */
export const CameBack = {
  args: { scene: "came-back" },
  parameters: { viewport: 1440 },
};

/** First stop: the strip shows the headline's before → after, your pin 1 and the agent's reply. Desk 1440. */
export const StoppedAtHeadline = {
  args: { scene: "stop-1" },
  parameters: { viewport: 1440 },
};

/** Third stop: the screenshot block changed under your pin 2 and the agent never answered it; Ask again. Desk 1440. */
export const PinTwoUnanswered = {
  args: { scene: "pin-2" },
  parameters: { viewport: 1440 },
};

/** After a 30-minute run: 7 stops, one per element; the headline's strip says it changed 4 times. Desk 1440. */
export const ThirtyMinuteRun = {
  args: { scene: "rollup" },
  parameters: { viewport: 1440 },
};

/** Phone session tab: the panel's sheet over the conversation, the strip under the tag. Phone 390. */
export const PhoneSessionSheet = {
  args: { scene: "phone-session" },
  parameters: { viewport: 390 },
};

/** Phone artifact tab: no conversation, the tag and strip over the page. Phone 390. */
export const PhoneArtifactTab = {
  args: { scene: "phone-tab" },
  parameters: { viewport: 390 },
};
