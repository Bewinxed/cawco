/**
 * The design graph's hardening cases (impeccable's harden.md), each a real
 * states file of this repository as an agent would open it, or a states
 * file made for the case where none of the repository's has it:
 * - the longest real text: the stream relay journey, whose states carry
 *   the repository's longest notes (143 characters) and names;
 * - the shortest: Who's sheet, three states of a word each, no notes, and
 *   no title, so the component is named by its file;
 * - one machine: the routine form opened with no machine named, every
 *   state under its own name;
 * - many: Suggestions' thirty states, in one machine;
 * - numbers in the millions: a run's budget filling over 30 minutes, a
 *   move of 1,800,000 ms (RunBudget);
 * - a failed load with a way back: the routine form whose move into Hub
 *   didn't answer presses a button its form no longer has, so the move
 *   fails and Try again plays it again.
 */

// biome-ignore-all lint/performance/noNamespaceImport: a states file is read whole: each of its exports is a story.
import * as RelayStates from "../../relay/RelayJourney.stories";
import relaySource from "../../relay/RelayJourney.stories.ts?raw";
import * as RoutineFormStates from "../../routines/RoutineForm.stories";
import * as SuggestionsStates from "../../suggestions/Suggestions.stories";
import suggestionsSource from "../../suggestions/Suggestions.stories.ts?raw";
import * as WhoStates from "../../turn/Who.stories";
import whoSource from "../../turn/Who.stories.ts?raw";
import type { PlayContext, ReviewInput } from "../model";
import { routineForm } from "../routine-form-review";
import RunBudget from "./RunBudget.svelte";

type Module = ReviewInput["module"];

const PHONE = /Phone$/u;
/** The name a play presses: the form's button was Save before it was Create routine. */
const SAVE = /^Save/u;

/** A states file's stories at another width under the story they draw (`XPhone` under `X`): the agent's `group` for its widths alone. */
const widthsOf = (module: object): Record<string, string> =>
  Object.fromEntries(
    Object.keys(module).flatMap((name) => {
      const parent = name.replace(PHONE, "");
      return parent !== name && parent in module ? [[name, parent]] : [];
    })
  );

export const relay: ReviewInput = {
  file: "apps/dashboard/src/lib/cawco/relay/RelayJourney.stories.ts",
  module: RelayStates as unknown as Module,
  source: relaySource,
  group: widthsOf(RelayStates),
};

export const who: ReviewInput = {
  file: "apps/dashboard/src/lib/cawco/turn/Who.stories.ts",
  module: WhoStates as unknown as Module,
  source: whoSource,
};

export const suggestions: ReviewInput = {
  file: "apps/dashboard/src/lib/cawco/suggestions/Suggestions.stories.ts",
  module: SuggestionsStates as unknown as Module,
  source: suggestionsSource,
};

/** The routine form with its widths paired and no machine named: one machine. */
export const routineFormOneMachine: ReviewInput = {
  ...routineForm,
  group: widthsOf(RoutineFormStates),
};

const BUDGET_SOURCE = `/** The run not started yet: its budget's bar empty. */
export const Waiting = {};

/** The run started: its bar fills over its 30 minutes. */
export const Running = {};
`;

export const runBudget: ReviewInput = {
  file: "apps/dashboard/src/lib/cawco/graph/preview/harden-review.ts",
  module: {
    default: {
      title: "Run budget",
      component: RunBudget as unknown as Module["default"]["component"],
      args: { minutes: 30, running: false },
    },
    Waiting: {},
    Running: {
      args: { running: true },
      from: "Waiting",
      play: async ({ update }: PlayContext) => {
        await update({ running: true });
      },
    },
  },
  source: BUDGET_SOURCE,
};

/** The routine form whose move into Hub didn't answer presses Save, a name its Create button no longer has. */
export const routineFormStalePlay: ReviewInput = {
  ...routineForm,
  module: {
    ...(RoutineFormStates as unknown as Module),
    FailedSave: {
      ...RoutineFormStates.FailedSave,
      play: async ({ canvas, userEvent }: PlayContext) => {
        await userEvent.click(canvas.getByRole("button", { name: SAVE }));
      },
    },
  },
};
