/**
 * A question an agent asked on a pin (Component Story Format 3, live
 * components; shaping tsk-521): its reply in the pin's thread carries the
 * question card, options, Other and Answer, as Needs you and the session
 * draw it. The thread, its card and the question card are the product's;
 * the routines page's pin is pin-question-live.svelte's.
 */
import { hubAs } from "../hub-stand-in";
import PinQuestionLive from "./pin-question-live.svelte";

export default {
  title: "Needs you/A question on a pin",
  component: PinQuestionLive,
  args: { asking: true, said: null },
  decorators: [hubAs("connected")],
  parameters: { viewport: "desk" },
};

/** Pin 3's thread: his comment, the agent's reply, and the question it asks him under it. */
export const OnPin = {};
