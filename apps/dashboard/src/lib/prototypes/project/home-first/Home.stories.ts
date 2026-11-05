/**
 * Home, the morning briefing (Option 2, "Home first"), the project's first
 * screen and the way into every other place. Cawco's own records: in full
 * swing (every kind of wait, a stuck task, a failed routine, new outputs),
 * on a quiet morning, just made, loading, stale and partly read; with a
 * task, Caw or Configure open over it. Every state at 1440 and 390; at 900
 * where the two columns become one.
 */
import { homeFirstWords as words } from "@cawco/core/words/proto-home-first";
import { BUSY, FRESH, NEEDS, QUIET, STAGES, STALE_AT } from "./fixture";
import HomeScreen from "./HomeScreen.svelte";
import { LOADING, moveTo, STALE } from "./play";

const desk = { viewport: 1440 };
const mid = { viewport: 900 };
const phone = { viewport: 390 };

const REVIEWED = "Post: one board instead of a wall of agent terminals";

/** The approved post answered: its row leaves, the next wait comes first. */
const answered = { ...BUSY, needs: NEEDS.slice(1) };

/** The reviewed post approved forward: Your call holds one, Scheduled two. */
const moved = {
  ...BUSY,
  needs: NEEDS.filter((need) => need.title !== REVIEWED),
  stages: STAGES.map((stage) => {
    if (stage.id === "your-call") {
      return { ...stage, count: 1 };
    }
    return stage.id === "scheduled" ? { ...stage, count: 2 } : stage;
  }),
};

/** Not now on the approved post: it stays answerable, at the foot. */
const later = {
  ...BUSY,
  needs: [...NEEDS.slice(1), { ...NEEDS[0], later: true }],
};

export default {
  title: "Home first/Home",
  component: HomeScreen,
  args: { briefing: BUSY, read: "live", open: null },
};

/** The briefing in full swing: seven waits, five at work, the stages, what's coming and what came out since 09:14. */
export const Busy = { parameters: desk };

/** The same at 900: the knowing column follows the acting one, the stages a line of chips. */
export const Busy900 = { name: "Busy at 900", parameters: mid };

/** The same on a phone: one scrolling page in the same order. */
export const BusyPhone = { name: "Busy on a phone", parameters: phone };

/** Approve on the 15:00 post: the row leaves and the next wait is first. */
export const Answered = {
  args: { briefing: answered },
  parameters: desk,
  from: "Busy",
  play: moveTo({ briefing: answered }),
};

/** Not now on the 15:00 post: it moves to the foot, still answerable. */
export const PutBack = {
  name: "Not now",
  args: { briefing: later },
  parameters: desk,
  from: "Busy",
  play: moveTo({ briefing: later }),
};

/** Open task on a post in Your call: the task slides over the right third, Home live beneath. */
export const TaskOpen = {
  name: "Task open",
  args: { open: "task", openTask: REVIEWED },
  parameters: desk,
  from: "Busy",
  play: moveTo({ open: "task", openTask: REVIEWED }),
};

/** Approved forward and closed: back where it was, Your call 1 and Scheduled 2. */
export const TaskMoved = {
  name: "Task moved",
  args: { briefing: moved, open: null },
  parameters: desk,
  from: "TaskOpen",
  play: moveTo({ briefing: moved, open: null }),
};

/** The task opened on a phone: a bottom drawer over the dimmed briefing. */
export const TaskOpenPhone = {
  name: "Task open on a phone",
  args: { open: "task", openTask: REVIEWED },
  parameters: phone,
  from: "BusyPhone",
  play: moveTo({ open: "task", openTask: REVIEWED }),
};

/** Ask Caw: his pane docks beside the page and the briefing becomes one column. */
export const CawOpen = {
  name: "Caw open",
  args: { open: "caw" },
  parameters: desk,
  from: "Busy",
  play: moveTo({ open: "caw" }),
};

/** Ask Caw at 900: his pane stands over the page from the right. */
export const CawOpen900 = {
  name: "Caw open at 900",
  args: { open: "caw" },
  parameters: mid,
};

/** Ask Caw on a phone: a drawer at 85% of the screen. */
export const CawOpenPhone = {
  name: "Caw open on a phone",
  args: { open: "caw" },
  parameters: phone,
  from: "BusyPhone",
  play: moveTo({ open: "caw" }),
};

/** A quiet morning: nothing waits, nothing runs, every group still named. */
export const Quiet = { args: { briefing: QUIET }, parameters: desk };

/** A quiet morning on a phone. */
export const QuietPhone = {
  name: "Quiet on a phone",
  args: { briefing: QUIET },
  parameters: phone,
};

/** Just made: the stages named without numbers, and one starter under Caw's line. */
export const Fresh = {
  name: "Just made",
  args: { briefing: FRESH, fresh: true },
  parameters: desk,
};

/** Just made, on a phone. */
export const FreshPhone = {
  name: "Just made on a phone",
  args: { briefing: FRESH, fresh: true },
  parameters: phone,
};

/** The first read: each group a skeleton at its real size, two columns. */
export const Loading = { args: LOADING, parameters: desk };

/** The first read on a phone. */
export const LoadingPhone = {
  name: "Loading on a phone",
  args: LOADING,
  parameters: phone,
};

/** The hub unreachable since 10:42: every count says so, the rows stay, marked. */
export const Stale = {
  name: "Hub unreachable",
  args: STALE,
  parameters: desk,
};

/** The hub unreachable, on a phone. */
export const StalePhone = {
  name: "Hub unreachable on a phone",
  args: STALE,
  parameters: phone,
};

/** Working now's read failed (502) while the rest stayed live: only it says so. */
export const Partial = {
  name: "One group unread",
  args: { failed: { working: { at: STALE_AT, why: "502" } } },
  parameters: desk,
};

/** One group unread, on a phone. */
export const PartialPhone = {
  name: "One group unread on a phone",
  args: { failed: { working: { at: STALE_AT, why: "502" } } },
  parameters: phone,
};

/** More, opened: the rare acts, each opening Configure at its part. */
export const MoreOpen = {
  name: "More open",
  args: { moreOpen: true },
  parameters: desk,
};

/** Set up or change how it runs: the Configure sheet from the trailing edge. */
export const ConfigureOpen = {
  name: words.configure.title,
  args: { open: "configure" },
  parameters: desk,
  from: "MoreOpen",
  play: moveTo({ open: "configure", moreOpen: false }),
};
