/**
 * Guide after a reply, option B: activity lines in the thread, the rail as
 * the inbox (Component Story Format 3, live components). The Comments rail
 * (CommentRail) opens by itself on his return at To check: the comments
 * whose elements changed, answered first, each with its activity lines
 * (ActivityLines), then what changed under no comment; a thread card
 * (PinCard) carries the same lines over its reply. The tag stays today's.
 * The screen is the guide fixture (guide/GuideB.svelte) on the advisor's
 * example (the landing-hero page, pins ① and ②, revision 7's three changes).
 */
import GuideB from "./guide/GuideB.svelte";

export default {
  title: "Guide after a reply/B · Activity lines, rail as the inbox",
  component: GuideB,
  args: { scene: "came-back" },
};

/** Back at the desk: the rail's foot sheet opened by itself on To check 3, pin 1 answered, pin 2 changed with no answer. Desk 1440. */
export const CameBack = {
  args: { scene: "came-back" },
  parameters: { viewport: 1440 },
};

/** First stop: pin 1's thread open beside its pill, the headline and button lines over Reply; the rail's sheet stands aside meanwhile. Desk 1440. */
export const StoppedAtHeadline = {
  args: { scene: "stop-1" },
  parameters: { viewport: 1440 },
};

/** The stop on pin 2: its thread holds only your comment, its line says no answer came, with Ask again. Desk 1440. */
export const PinTwoUnanswered = {
  args: { scene: "pin-2" },
  parameters: { viewport: 1440 },
};

/** After a 30-minute run: To check 7, each comment's lines grown per revision, four changes nobody asked for. Desk 1440. */
export const ThirtyMinuteRun = {
  args: { scene: "rollup" },
  parameters: { viewport: 1440 },
};

/** Phone session tab: the rail is the foot sheet inside the panel's sheet, on To check. Phone 390. */
export const PhoneSessionSheet = {
  args: { scene: "phone-session" },
  parameters: { viewport: 390 },
};

/** Phone artifact tab: the rail's foot sheet over the page, on To check. Phone 390. */
export const PhoneArtifactTab = {
  args: { scene: "phone-tab" },
  parameters: { viewport: 390 },
};
