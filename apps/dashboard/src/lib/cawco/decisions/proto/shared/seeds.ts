import type { Seed } from "./decision.svelte";

/**
 * Where the prototypes' stories start: three picks made (Deck's entry,
 * which unlocks a question; Folded; Only when it's news), then sent with
 * a note, then the agent's next round back with Deck built as he picked.
 */
const picks = { shape: ["deck"], fold: ["b"], machine: ["b"] };
const notes = { fold: "Fine on the phone; check it at 680." };

export const PICKED: Seed = { picks };
export const SENT: Seed = { picks, notes, sentAt: "10:42" };
export const ROUND: Seed = {
  picks: { ...picks, deck: ["retire"] },
  notes,
  sentAt: "10:42",
  round: 2,
};
