/**
 * Turning Caw off with a pick (Component Story Format 3, live): the
 * owner's ask on caw-one-session-calls, 10-30, drawn on the tray StopTray
 * already is. Each story is Caw's settings (the ⋯ menu's popover on a
 * desk, its sheet on a phone) with the tray grown under the switch: what
 * Caw's conversation started that still runs, each with a checkbox, all
 * checked; one confirm stops the checked ones and turns him off; Cancel
 * leaves him on. The frames play: flip the switch, uncheck, confirm.
 * Rows are hub caw.ts `initiated` (`CawRunning`), with the task's title
 * and what each is doing as the rail has them.
 */
import type { PickRow } from "./StopTrayPick.svelte";
import CawOffPanel from "./stop-preview/CawOffPanel.svelte";

const CONFIRM = /Stop 5 and turn off/u;

const row = (
  id: string,
  over: Partial<PickRow> & Pick<PickRow, "kind">
): PickRow => ({
  id,
  cwd: `/home/bewinxed/.worktrees/cockpit-${id}`,
  machineId: "m-obelisk",
  machineName: "obelisk",
  offline: false,
  parentId: null,
  taskId: null,
  taskTitle: null,
  title: null,
  activity: "working",
  ran: "4m",
  ...over,
});

/** Eight: three tasks' attempts and five delegates, two nested. */
const EIGHT: PickRow[] = [
  row("a41", {
    kind: "attempt",
    taskId: "tsk-41",
    taskTitle: "Fix the tray chip overflow",
    title: "Fix the tray chip overflow",
    ran: "14m",
  }),
  row("d41a", {
    kind: "delegate",
    parentId: "a41",
    title: "Measure chip widths at 390, 680 and 1440",
    ran: "3m",
  }),
  row("a44", {
    kind: "attempt",
    taskId: "tsk-44",
    taskTitle: "Retry pushes when the hub restarts",
    title: "Retry pushes when the hub restarts",
    activity: "blocked",
    ran: "22m",
  }),
  row("a47", {
    kind: "attempt",
    taskId: "tsk-47",
    taskTitle: "Name machines by hostname in the rail",
    title: "Name machines by hostname in the rail",
    machineId: "m-kestrel",
    machineName: "kestrel",
    offline: true,
    ran: "1h",
  }),
  row("d812", {
    kind: "delegate",
    title: "Triage #812: the phone sheet jumps on rotate",
    ran: "6m",
  }),
  row("dbun", {
    kind: "delegate",
    title: "Read https://bun.sh/blog/bun-v1.4 for breaking changes",
    activity: "idle",
    ran: "",
  }),
  row("dlog", {
    kind: "delegate",
    title: "Draft the weekly changelog",
    ran: "9m",
  }),
  row("dprs", {
    kind: "delegate",
    parentId: "dlog",
    title: "Collect merged pull request titles since Oct 23",
    ran: "1m",
  }),
];

export default {
  title: "Caw off/Pick what stops",
  component: CawOffPanel,
  args: { rows: EIGHT },
};

/** One task's attempt still runs: its box checked, the confirm counts one. */
export const One = {
  args: { rows: [EIGHT[0]] },
};

/** Eight running, all checked: tasks and delegates mixed, a delegate under a task. */
export const Many = {};

/** Three unchecked: the task that needs you and the changelog with its delegate keep running. */
export const SomeUnchecked = {
  args: { unchecked: ["a44", "dlog", "dprs"] },
};

/** None checked: the confirm becomes "Turn off, let 8 finish". */
export const NoneChecked = {
  args: { unchecked: EIGHT.map((each) => each.id) },
};

/** The hub refused: its words in the head, the picks kept, the confirm again. */
export const Refused = {
  args: {
    unchecked: ["a44", "dlog", "dprs"],
    refusal:
      "The hub didn't answer (timeout). Nothing stopped and Caw is still on; your picks are kept.",
  },
};

/** Stopping: the kept rows fold into one line; each stop turns as its machine confirms. */
export const Stopping = {
  args: {
    on: false,
    step: "stopping",
    unchecked: ["a44", "dlog", "dprs"],
    stops: {
      a41: "stopping",
      d41a: "stopped",
      a47: "away",
      d812: "stopped",
      dbun: "stopping",
    },
  },
  from: "SomeUnchecked",
  play: async ({
    canvas,
    userEvent,
  }: {
    canvas: { getByRole: (role: string, o: { name: RegExp }) => Element };
    userEvent: { click: (el: Element) => Promise<void> };
  }) => {
    await userEvent.click(canvas.getByRole("button", { name: CONFIRM }));
  },
};

/** Off: the list folds shut; what stopped, what waits for kestrel, what finishes. */
export const Off = {
  args: {
    on: false,
    step: "off",
    unchecked: ["a44", "dlog", "dprs"],
    stops: {
      a41: "stopped",
      d41a: "stopped",
      a47: "away",
      d812: "stopped",
      dbun: "stopped",
    },
  },
};

/** Nothing Caw started still runs: the switch just flips, no tray. */
export const NothingRunning = {
  args: { rows: [], on: false, open: false },
};
