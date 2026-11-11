/**
 * One side of a change to a starting set, on its approval (Component Story
 * Format 3, live components): the table the hub's rows fill (core
 * `setTablesOf`). What leaves a set, at a Monday run's size and at a small
 * one; what joins one, at the size of the set Caw proposes while he sets a
 * project up. The asks that carry them, whole, are Prompt.stories.ts's
 * Trim, NewSet and TypeSetChange.
 */
import SetChangeTable from "./SetChangeTable.svelte";
import { NEW_SET_TABLE, UNLISTED, UNLISTED_SHORT } from "./set-change-fixture";

export default {
  title: "Transcript/Ask/A starting set's change",
  component: SetChangeTable,
  args: { table: UNLISTED },
  parameters: { viewport: 400 },
};

/** Monday's run asks to unlist Cawco-Dev's unused items. */
export const MondayRun = {};

/** Two items leave a delegate type's starting set. */
export const Short = { args: { table: UNLISTED_SHORT } };

/** Caw proposes Harbourline Bakery's starting set at setup. */
export const SetupProposal = { args: { table: NEW_SET_TABLE } };
