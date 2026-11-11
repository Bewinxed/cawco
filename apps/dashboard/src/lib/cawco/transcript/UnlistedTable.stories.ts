/**
 * What a trim takes out of a starting set, on its approval (Component Story
 * Format 3, live components): the table the hub's rows fill (core
 * `unlistedOf`), at a Monday run's size and at a small one. The ask that
 * carries it, whole, is Prompt.stories.ts's Trim.
 */
import UnlistedTable from "./UnlistedTable.svelte";
import { UNLISTED, UNLISTED_SHORT } from "./unlisted-fixture";

export default {
  title: "Transcript/Ask/What leaves a starting set",
  component: UnlistedTable,
  args: { table: UNLISTED },
  parameters: { viewport: 400 },
};

/** Cawco-Dev's Monday run: 41 skills and 2 servers no session called in 30 days. */
export const MondayRun = {};

/** A delegate type's set: two items, one called before the window. */
export const Short = { args: { table: UNLISTED_SHORT } };
