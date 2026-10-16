/**
 * Who's sheet (Component Story Format 3, live components): the speaker line
 * as each turn draws it, mounted by CawCo's stage from this file and the
 * real Who.svelte. The meta's args are every story's; a story's own args
 * are what it changes.
 */
import Who from "./Who.svelte";

export default {
  component: Who,
  args: { name: "Caw", timestamp: "2026-10-16T12:41:00Z" },
};

/** The agent's turn: its mark, its name and its clock. */
export const Agent = { args: {} };

/** The reader's queued message: their mark, and the note in the clock's place. */
export const You = { args: { you: true, name: "You", note: "queued" } };

/** A second turn of the same speaker: no mark and no name on screen, the clock alone. */
export const Grouped = { args: { grouped: true } };
