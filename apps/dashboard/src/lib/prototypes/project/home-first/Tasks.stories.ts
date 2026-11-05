/**
 * Tasks, reached from Home (Option 2): the view switch and saved filters in
 * its first line, the board of the project's stages with the composer at
 * the head of the first. Cawco's eleven tasks in full swing, Cawco-Dev's
 * 238 for a board at a busy code project's size, an empty project, loading,
 * stale and one stage unread, the hub refusing a task, the table view, and
 * a task opened over the board. Each at 1440 and on a phone.
 */

import { ARCHIVE, PROJECT, STAGES, TASKS } from "./fixture";
import { MANY_STAGES, MANY_TASKS } from "./fixture-many";
import { LOADING, moveTo, STALE } from "./play";
import TasksScreen from "./TasksScreen.svelte";

const desk = { viewport: 1440 };
const phone = { viewport: 390 };

const EMPTY_STAGES = STAGES.map((stage) => ({ ...stage, count: 0 }));
const OPENED = "Make the Caw bookend kit for clips";
const TYPED = "Post: what a routine's first run shows you";

export default {
  title: "Home first/Tasks",
  component: TasksScreen,
  args: {
    project: PROJECT,
    stages: STAGES,
    tasks: TASKS,
    archive: ARCHIVE,
    view: "board",
    filter: "all",
    read: "live",
  },
};

/** The board in full swing: nine stages, Your call waiting on you, one stuck in Drafting. */
export const Board = { parameters: desk };

/** On a phone: the stages as a strip, one stage a screen, the composer at the head of Ideas. */
export const BoardPhone = { name: "Board on a phone", parameters: phone };

/** Your call on a phone: the stage meant for you, swiped to. */
export const YourCallPhone = {
  name: "Your call on a phone",
  args: { phoneStage: "your-call" },
  parameters: phone,
  from: "BoardPhone",
  play: moveTo({ phoneStage: "your-call" }),
};

/** From Home's Needs you, See all: the board narrowed to what waits on you. */
export const NeedsYou = {
  name: "Narrowed to Needs you",
  args: { filter: "needs" },
  parameters: desk,
  from: "Board",
  play: moveTo({ filter: "needs" }),
};

/** From Working now, See all: the board narrowed to what is working. */
export const Working = {
  name: "Narrowed to Working",
  args: { filter: "working" },
  parameters: desk,
};

/** Cawco-Dev: 238 tasks, Ready 102 and Done 109, the newest of each drawn. */
export const Many = {
  name: "238 tasks",
  args: {
    project: "Cawco-Dev",
    stages: MANY_STAGES,
    tasks: MANY_TASKS,
    archive: 0,
  },
  parameters: desk,
};

/** Cawco-Dev's 238 on a phone. */
export const ManyPhone = {
  name: "238 tasks on a phone",
  args: {
    project: "Cawco-Dev",
    stages: MANY_STAGES,
    tasks: MANY_TASKS,
    archive: 0,
  },
  parameters: phone,
};

/** The same tasks as a ledger, for a long list to scan. */
export const TableView = {
  name: "Table",
  args: { view: "table" },
  parameters: desk,
  from: "Board",
  play: moveTo({ view: "table" }),
};

/** The ledger on a phone: each row a two-line card. */
export const TableViewPhone = {
  name: "Table on a phone",
  args: { view: "table" },
  parameters: phone,
};

/** A task's card pressed: its pane over the right third, the board live beneath. */
export const TaskOpen = {
  name: "Task open",
  args: { openTask: OPENED },
  parameters: desk,
  from: "Board",
  play: moveTo({ openTask: OPENED }),
};

/** Closed again: the board as it was, the card where it stood. */
export const TaskClosed = {
  name: "Task closed",
  args: { openTask: undefined },
  parameters: desk,
  from: "TaskOpen",
  play: moveTo({ openTask: undefined }),
};

/** A task opened on a phone: a bottom drawer over the stage. */
export const TaskOpenPhone = {
  name: "Task open on a phone",
  args: { openTask: OPENED, phoneStage: "making-media" },
  parameters: phone,
};

/** A project with no task yet: every stage named, the composer open in the first. */
export const Empty = {
  name: "No task yet",
  args: { stages: EMPTY_STAGES, tasks: [], archive: 0 },
  parameters: desk,
};

/** No task yet, on a phone. */
export const EmptyPhone = {
  name: "No task yet on a phone",
  args: { stages: EMPTY_STAGES, tasks: [], archive: 0 },
  parameters: phone,
};

/** The hub refused the task just filed, in its words, under the composer. */
export const Refused = {
  name: "Task refused",
  args: {
    composer: TYPED,
    refusal:
      "The hub refused it: a task can't start in Live. Pick Ideas or Drafting.",
  },
  parameters: desk,
};

/** The hub unreachable since 10:42: the last board kept, marked, moves waiting. */
export const Stale = {
  name: "Hub unreachable",
  args: STALE,
  parameters: desk,
};

/** Hub unreachable on a phone. */
export const StalePhone = {
  name: "Hub unreachable on a phone",
  args: STALE,
  parameters: phone,
};

/** Making media's read failed (502): it says so in its column; the rest are live. */
export const StageUnread = {
  name: "One stage unread",
  args: { failedStage: { id: "making-media", why: "502" } },
  parameters: desk,
};

/** The first read: each stage's cards as skeletons at their size. */
export const Loading = { args: LOADING, parameters: desk };

/** Loading on a phone. */
export const LoadingPhone = {
  name: "Loading on a phone",
  args: LOADING,
  parameters: phone,
};
