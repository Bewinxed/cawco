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

/** Sixteen more, for a long list: 24 in all, as a busy week leaves them. */
const SIXTEEN: PickRow[] = [
  row("a52", {
    kind: "attempt",
    taskId: "tsk-52",
    taskTitle: "Show spend per harness on the usage chart",
    title: "Show spend per harness on the usage chart",
    ran: "31m",
  }),
  row("d52a", {
    kind: "delegate",
    parentId: "a52",
    title: "Read the usage table's query plan",
    ran: "4m",
  }),
  row("a53", {
    kind: "attempt",
    taskId: "tsk-53",
    taskTitle: "Keep the composer's draft through a reload",
    title: "Keep the composer's draft through a reload",
    activity: "blocked",
    ran: "48m",
  }),
  row("a55", {
    kind: "attempt",
    taskId: "tsk-55",
    taskTitle: "Sign the iOS build with the new team id",
    title: "Sign the iOS build with the new team id",
    machineId: "m-mini",
    machineName: "mini",
    ran: "12m",
  }),
  row("d55a", {
    kind: "delegate",
    parentId: "a55",
    machineId: "m-mini",
    machineName: "mini",
    title: "Run xcodebuild archive for Caw&Co",
    ran: "9m",
  }),
  row("a58", {
    kind: "attempt",
    taskId: "tsk-58",
    taskTitle: "Fold old routines into their project's page",
    title: "Fold old routines into their project's page",
    activity: "idle",
    ran: "",
  }),
  row("a60", {
    kind: "attempt",
    taskId: "tsk-60",
    taskTitle: "Retry a delegate's merge check after a lockfile race",
    title: "Retry a delegate's merge check after a lockfile race",
    ran: "7m",
  }),
  row("d901", {
    kind: "delegate",
    title: "Triage #901: pins drift after the canvas zooms",
    ran: "15m",
  }),
  row("d904", {
    kind: "delegate",
    title: "Triage #904: tray chip overflows at 200% zoom",
    activity: "blocked",
    ran: "26m",
  }),
  row("dtok", {
    kind: "delegate",
    title: "Check every token's contrast in dark mode",
    ran: "2m",
  }),
  row("dshot", {
    kind: "delegate",
    title: "Shoot the onboarding flow at 390 and 1440",
    machineId: "m-kestrel",
    machineName: "kestrel",
    offline: true,
    ran: "1h",
  }),
  row("dmdns", {
    kind: "delegate",
    title: "Find why mDNS misses the hub after sleep",
    ran: "18m",
  }),
  row("dmdns2", {
    kind: "delegate",
    parentId: "dmdns",
    title: "Capture avahi traffic on obelisk for five minutes",
    ran: "3m",
  }),
  row("ddeps", {
    kind: "delegate",
    title: "Bump bits-ui to 2.20 and read its changelog",
    activity: "idle",
    ran: "",
  }),
  row("drel", {
    kind: "delegate",
    title: "Draft release notes for nightly 6191",
    ran: "5m",
  }),
  row("ddocs", {
    kind: "delegate",
    title: "Rewrite the self-hosting guide's Tailscale section",
    ran: "11m",
  }),
];

/** Twenty-four running. */
const TWENTY_FOUR = [...EIGHT, ...SIXTEEN];

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

/** Long list, capped: 24 rows stand about ten tall and scroll, the eleventh peeking. */
export const ManyCapped = {
  args: { rows: TWENTY_FOUR, cap: true },
};

/** Long list, uncapped: all 24 rows stand, the tray as tall as they are. */
export const ManyUncapped = {
  args: { rows: TWENTY_FOUR },
};

/** Unchecked rows say "Keeps running" on their second line. */
export const UncheckedSays = {
  args: { unchecked: ["a44", "dlog", "dprs"], keptSays: true },
};

/** Unchecked rows keep their status (as built): only the box says it. */
export const UncheckedQuiet = {
  args: { unchecked: ["a44", "dlog", "dprs"] },
};

/** The session that needs you starts unchecked; everything else starts checked. */
export const NeedsYouUnchecked = {
  args: { needsYouStartsOff: true },
};

/** Everything starts checked, the one that needs you too (as built, his "all selected by default"). */
export const NeedsYouChecked = {};
