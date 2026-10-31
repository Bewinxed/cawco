/**
 * The Exchange, Live preview: the thing a decision refers to, live. Here
 * the owner's "When someone you handed choices to decides one for you, when
 * do you hear about it?", which the agent went ahead on, refers to Who
 * decides for Cawco-Dev. On a desk it opens as a third column and stays
 * while the thread scrolls; on a phone it is a sheet.
 */
import Exchange from "./Exchange.svelte";
import type { Play } from "./play.js";
import { OPEN, STRIP } from "./records.js";

export default {
  title: "The Exchange/Live preview",
  component: Exchange,
  args: {
    threads: OPEN,
    strip: STRIP,
    view: "thread",
    open: "notice",
    preview: "ready",
  },
};

/** The picture in its message, before he opens it. */
export const PictureInThread = {
  args: { preview: "closed" },
  parameters: { viewport: 1440 },
};

/** He opens it: the live artifact stands beside the thread, the list narrows to names. */
export const PreviewBeside = {
  from: "PictureInThread",
  parameters: { viewport: 1440 },
  play: (async ({ canvas, userEvent, update }) => {
    await userEvent.click(canvas.getByText("Open the live preview"));
    await update({ preview: "ready" });
  }) satisfies Play,
};

/** In the owner's 1540 window: three columns. */
export const PreviewWide = { parameters: { viewport: 1540 } };

/** On a phone: a sheet over the thread. */
export const PreviewSheet = { parameters: { viewport: 390 } };

/** At 680: a sheet too. */
export const PreviewTablet = { parameters: { viewport: 680 } };

/** Loading: the artifact's own skeleton. */
export const PreviewLoading = {
  args: { preview: "loading" },
  parameters: { viewport: 1440 },
};

/** It didn't load: its own fault line with Reload, the thread beside it unaffected. */
export const PreviewFault = {
  args: { preview: "failed" },
  parameters: { viewport: 1440 },
};
