/**
 * The Exchange, Who decides: the routing sheet, opened from the project's
 * name in a thread's head. Cawco-Dev keeps one row of its own (tool calls
 * come to him, over the fleet's common practice), which is why "Small
 * fleet calls" asked him four tool questions.
 */
import Exchange from "./Exchange.svelte";
import type { Play } from "./play.js";
import { OPEN, STRIP } from "./records.js";

export default {
  title: "The Exchange/Who decides",
  component: Exchange,
  args: {
    threads: OPEN,
    strip: STRIP,
    view: "thread",
    open: "fleet",
    who: true,
  },
};

/** Before: the thread's head, the project's name a link. */
export const ThreadHead = {
  args: { who: false },
  parameters: { viewport: 1440 },
};

/** From the project's name: each kind and where it goes, beside the live thread. */
export const OpenBeside = {
  from: "ThreadHead",
  parameters: { viewport: 1440 },
  play: (async ({ canvas, userEvent, update }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Cawco-Dev" }));
    await update({ who: true });
  }) satisfies Play,
};

/** In the owner's 1540 window. */
export const OpenWide = { parameters: { viewport: 1540 } };

/** On a phone: a sheet over the thread. */
export const OpenSheet = { parameters: { viewport: 390 } };

/** At 680: a sheet. */
export const OpenTablet = { parameters: { viewport: 680 } };
