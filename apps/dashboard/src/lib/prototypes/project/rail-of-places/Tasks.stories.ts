/**
 * Tasks, in "Places down the side" (Component Story Format 3, live
 * components): the view switch and the narrowing on its first line, then
 * the board (the inline composer at the top of its first stage, Archive
 * last), the ledger, or what waits on what. Cawco's nine stages in full
 * swing; Cawco-Dev's 238 tasks as a busy board, a table and its chains; a
 * project just made; reading; the hub unreachable; one stage unread. Each
 * at 1440 and 390. The meta's args are every story's.
 */
import { CAWCO_IN_SWING } from "./cawco-in-swing";
import { CAWCO_DEV_BUSY, JUST_MADE, LOADING, STALE } from "./fixtures";
import { LIVE } from "./model";
import ProjectScreen from "./ProjectScreen.svelte";
import { type Play, press } from "./play";

export default {
  title: "Rail of places/Tasks",
  component: ProjectScreen,
  args: { project: CAWCO_IN_SWING, read: LIVE, place: "tasks" },
};

/** Cawco's board: five posts in Your call, two drafting, two stuck, the stages it doesn't use yet named and empty. */
export const BoardInFullSwing = { parameters: { viewport: 1440 } };

/** On a phone: one stage per screen, swiped, under the strip of stages that is its index. */
export const BoardInFullSwingPhone = { parameters: { viewport: 390 } };

/** Cawco-Dev's 238 tasks: 102 Ready, one Working, two in Review waiting on you, 109 Done, 24 Dropped. */
export const BoardBusyBoard = {
  args: { project: CAWCO_DEV_BUSY },
  parameters: { viewport: 1440 },
};

/** The busy board on a phone, standing on Review. */
export const BoardBusyBoardPhone = {
  args: { project: CAWCO_DEV_BUSY, stage: "review" },
  parameters: { viewport: 390 },
};

/** The same 238 tasks as a ledger. */
export const BoardAsATable = {
  args: { project: CAWCO_DEV_BUSY, view: "table" },
  parameters: { viewport: 1440 },
};

/** What waits on what: each blocker with the tasks it holds back. */
export const BoardDependencies = {
  args: { project: CAWCO_DEV_BUSY, view: "dependencies" },
  parameters: { viewport: 1440 },
};

/** A project just made: its stages named and empty, the composer open in the first, and Ask Caw to plan. */
export const BoardJustMade = {
  args: { project: JUST_MADE },
  parameters: { viewport: 1440 },
};

/** Just made, on a phone. */
export const BoardJustMadePhone = {
  args: { project: JUST_MADE },
  parameters: { viewport: 390 },
};

/** The first read is out: each column holds skeleton cards. */
export const BoardReading = {
  args: { read: LOADING },
  parameters: { viewport: 1440 },
};

/** The hub unreachable: the last board kept, marked, its cards held. */
export const BoardHubUnreachable = {
  args: { read: STALE },
  parameters: { viewport: 1440 },
};

/** The hub unreachable, on a phone. */
export const BoardHubUnreachablePhone = {
  args: { read: STALE },
  parameters: { viewport: 390 },
};

/** Your call could not be read; every other stage is current. */
export const BoardStageUnread = {
  args: { read: { ...LIVE, unread: ["stage:your-call", "rail:tasks"] } },
  parameters: { viewport: 1440 },
};

/** A title typed and filed: the task stands first in Ideas, and the composer stays open for the next. */
export const BoardTaskFiled = {
  from: "BoardJustMade",
  parameters: { viewport: 1440 },
  play: async ({ canvas, userEvent }: Play) => {
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Title of the task" }),
      "Read the open issues and file the real ones"
    );
    await userEvent.click(canvas.getByRole("button", { name: "File task" }));
  },
};

/** A card pressed: the task's pane slides over the board's trailing third; the board stays live. */
export const BoardCardOpened = {
  from: "BoardInFullSwing",
  parameters: { viewport: 1440 },
  play: press(/^Open Post: one board/u),
};

/** On a phone, a card pressed: the task rises as a bottom drawer. */
export const BoardCardOpenedPhone = {
  from: "BoardInFullSwingPhone",
  parameters: { viewport: 390 },
  play: press(/^Open Post: Caw&Co launch/u),
};
