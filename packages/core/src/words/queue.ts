/** What a queued command says while it waits. */

import { type CommandQueue, QUEUE_SLOTS } from "../commands/controls";

/** How a status says a {@link CommandQueue}: "queued for the Mac's build slot behind …". */
export const queueWords = (queue: CommandQueue): string =>
  `queued for ${QUEUE_SLOTS[queue.slot]}${queue.holders ? ` behind ${queue.holders}` : ""}`;
