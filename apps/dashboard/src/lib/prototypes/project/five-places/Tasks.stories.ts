/**
 * Tasks, the front door of a project in five places (Component Story
 * Format 3, live components): the whole screen at 1440, 900 and 390 on the
 * hub's own records (records.ts). The meta's args are every story's; a
 * story's own args are what it changes.
 */
import FivePlaces from "./FivePlaces.svelte";
import { EMPTY, QUIET, SWING } from "./records";
import { type Play, press } from "./story-kit";

const TITLE_FIELD = /New task's title/u;

export default {
  title: "Five places/Tasks",
  component: FivePlaces,
  args: { records: SWING, place: "tasks" },
};

/** The same arrival with Caw's pane closed: the board takes the page's width. */
export const NeedsYouWide = {
  args: { place: "tasks", height: 920 },
  parameters: { viewport: 1440 },
};

/** All pressed: every stage with its first cards, Archive last. */
export const All = {
  args: { place: "tasks", height: 920, filter: "all" },
  parameters: { viewport: 1440 },
  from: "NeedsYouWide",
  play: press("tab", /^All/u),
};

/** A card pressed: the task opens as a pane over the right third; the board stays live beneath it. */
export const TaskOpen = {
  args: { place: "tasks", height: 920, task: "tsk-218" },
  parameters: { viewport: 1440 },
  from: "NeedsYouWide",
  play: press("button", /Let start_session choose a harness/u),
};

/** Back from the task: the pane closes and the card stands where it was. */
export const BackToBoard = {
  args: { place: "tasks", height: 920 },
  parameters: { viewport: 1440 },
  from: "TaskOpen",
  play: press("button", /^Back to the board$/u),
};

/** A title typed into Ready and Enter: it files, then stands first in Ready, the field open for the next. */
export const Filing = {
  args: { place: "tasks", height: 920, filter: "all" },
  parameters: { viewport: 1440 },
  from: "All",
  play: async ({ canvas, userEvent }: Play) => {
    const field = canvas.getByRole("textbox", { name: TITLE_FIELD });
    await userEvent.type(field, "Draw the stale line");
    await userEvent.keyboard("Enter");
  },
};

/** The hub refused the title typed: its words stay under the composer. */
export const Refused = {
  args: {
    height: 920,
    filter: "all",
    refusal:
      "A task in Ready already has this title (tsk-240). Rename it or open that one.",
  },
  parameters: { viewport: 1440 },
};

/** The same tasks as a ledger. */
export const Table = {
  args: { place: "tasks", height: 920, view: "table", filter: "all" },
  parameters: { viewport: 1440 },
};

/** What waits on what: each blocked task and the task or decision it waits on. */
export const Dependencies = {
  args: { place: "tasks", height: 920, view: "dependencies", filter: "all" },
  parameters: { viewport: 1440 },
};

/** A quiet project: nothing waits, so the board opens on All; no needs-you line. */
export const Quiet = {
  args: { place: "tasks", height: 920, records: QUIET },
  parameters: { viewport: 1440 },
};

/** A new project: every stage named and empty, the composer open, Ask Caw to plan. */
export const Empty = {
  args: { place: "tasks", height: 920, records: EMPTY },
  parameters: { viewport: 1440 },
};

/** The first read: skeleton columns at the board's real size, the row's marks as skeleton dots. */
export const Loading = {
  args: { place: "tasks", height: 920, read: "loading" },
  parameters: { viewport: 1440 },
};

/** The hub is unreachable: last good cards kept, moves disabled with the reason, no count claimed. */
export const Stale = {
  args: { place: "tasks", height: 920, read: "stale", filter: "all" },
  parameters: { viewport: 1440 },
};

/** Ready's read failed: its last cards kept, the column says so; the rest live. */
export const StageUnread = {
  args: { place: "tasks", height: 920, filter: "all", unreadStages: ["ready"] },
  parameters: { viewport: 1440 },
};

/** 900: the row stays, the filters wrap under the switch, the rail is the shell's sheet. */
export const NeedsYouMid = {
  args: { place: "tasks", height: 920 },
  parameters: { viewport: 900 },
};

/** A phone: the needs-you line on top, the switch and filters, the stage strip over a one-stage pager. */
export const NeedsYouPhone = {
  args: { place: "tasks", height: 844 },
  parameters: { viewport: 390 },
};

/** A phone, a card pressed: the task rises as a drawer; Back returns to the same stage. */
export const TaskOpenPhone = {
  args: { place: "tasks", height: 844, task: "tsk-218" },
  parameters: { viewport: 390 },
  from: "NeedsYouPhone",
  play: press("button", /Let start_session choose a harness/u),
};

/** A phone, a new project: stages in the strip, the composer and Ask Caw to plan. */
export const EmptyPhone = {
  args: { place: "tasks", height: 844, records: EMPTY },
  parameters: { viewport: 390 },
};
