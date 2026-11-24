/**
 * The plan's chip on the composer's tray row (Component Story Format 3):
 * how far the plan has got, its ring filling with the tasks done, the live
 * dot while a task is under way. Pressed, it opens the plan (the direction
 * files' live stories show it in its row).
 */
import PlanChip from "./PlanChip.svelte";

export default {
  title: "Plan/Chip",
  component: PlanChip,
  args: { done: 3, total: 11, moving: 3, shown: false, onopen: () => null },
  parameters: { viewport: 390 },
};

/** Three of eleven tasks done, three under way. */
export const Moving = {};

/** Nothing under way: the session is between turns and no delegate is working. */
export const Still = { args: { moving: 0 } };

/** The plan open over the row: the chip pressed. */
export const Open = { args: { shown: true } };

/** Every task done. */
export const Finished = { args: { done: 11, moving: 0 } };
