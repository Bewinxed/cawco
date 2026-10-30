/**
 * Turning Caw off with what his conversation started still running (Component
 * Story Format 3, live): the section under his switch, each row checked to
 * stop, one confirm. CawOffTray draws it from its job in stop-work.svelte.ts;
 * these are its steps with rows as the hub's `initiated` lists them
 * (`CawRunning`, an attempt named by its task's title), and what each is
 * doing as the rail has it.
 */
import type { PickRow } from "./StopTrayPick.svelte";
import StopTrayPick from "./StopTrayPick.svelte";

const row = (
  id: string,
  over: Partial<PickRow> & Pick<PickRow, "kind" | "title">
): PickRow => ({
  id,
  cwd: `/home/bewinxed/.worktrees/cockpit-${id}`,
  machineName: "obelisk",
  offline: false,
  parentId: null,
  activity: "working",
  ran: "4m",
  stop: null,
  landed: false,
  error: null,
  ...over,
});

/** Eight: three tasks' attempts and five delegates, two nested. */
const EIGHT: PickRow[] = [
  row("a41", {
    kind: "attempt",
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
    title: "Retry pushes when the hub restarts",
    activity: "blocked",
    ran: "22m",
  }),
  row("a47", {
    kind: "attempt",
    title: "Name machines by hostname in the rail",
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
    title: "Keep the composer's draft through a reload",
    activity: "blocked",
    ran: "48m",
  }),
  row("a55", {
    kind: "attempt",
    title: "Sign the iOS build with the new team id",
    machineName: "mini",
    ran: "12m",
  }),
  row("d55a", {
    kind: "delegate",
    parentId: "a55",
    machineName: "mini",
    title: "Run xcodebuild archive for Caw&Co",
    ran: "9m",
  }),
  row("a58", {
    kind: "attempt",
    title: "Fold old routines into their project's page",
    activity: "idle",
    ran: "",
  }),
  row("a60", {
    kind: "attempt",
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

const ids = (rows: PickRow[]) => rows.map((each) => each.id);
/** Every row checked but these. */
const allBut = (rows: PickRow[], off: string[]) =>
  ids(rows).filter((id) => !off.includes(id));
const KEPT = ["a44", "dlog", "dprs"];

/** Each checked row's stop, part-way: two landed, kestrel's waits for it. */
const partway = (rows: PickRow[]): PickRow[] =>
  rows.map((each): PickRow => {
    if (KEPT.includes(each.id)) {
      return each;
    }
    if (each.offline) {
      return { ...each, ran: "", stop: "away", landed: true };
    }
    const done = ["d41a", "d812"].includes(each.id);
    return {
      ...each,
      ran: done ? "" : "7s",
      stop: done ? "stopped" : "stopping",
      landed: done,
    };
  });

export default {
  title: "Caw off/Pick what stops",
  component: StopTrayPick,
  args: { projectName: "cockpit", rows: EIGHT, checked: ids(EIGHT) },
};

/** One task's attempt still runs: its box checked, the confirm counts one. */
export const One = {
  args: { rows: [EIGHT[0]], checked: [EIGHT[0]?.id] },
};

/** Eight running, all checked: tasks and delegates mixed, the one that needs you too. */
export const Many = {};

/** Three unchecked: the task that needs you and the changelog with its delegate keep running. */
export const SomeUnchecked = {
  args: { checked: allBut(EIGHT, KEPT) },
};

/** None checked: the confirm just turns him off. */
export const NoneChecked = {
  args: { checked: [] },
};

/** Turning him off was refused: the hub's words in the head, the picks kept, the confirm again. */
export const Refused = {
  args: {
    checked: allBut(EIGHT, KEPT),
    refusal: "The hub didn't answer (timeout). Try again.",
  },
};

/** Stopping: only the checked rows stand, each turning as its machine confirms it. */
export const Stopping = {
  args: {
    step: "stopping",
    checked: allBut(EIGHT, KEPT),
    rows: partway(EIGHT),
  },
};

/** One stop failed: its row says why with its own Try again; the confirm tries it too. */
export const Failed = {
  args: {
    step: "failed",
    checked: allBut(EIGHT, KEPT),
    rows: partway(EIGHT)
      .map((each) =>
        each.stop === "stopping"
          ? { ...each, ran: "", stop: "stopped", landed: true }
          : each
      )
      .map((each) =>
        each.id === "dbun"
          ? {
              ...each,
              stop: "failed",
              landed: false,
              error: "obelisk didn't confirm the stop in 30s.",
            }
          : each
      ),
  },
};

/** Off: the list folds shut; what stopped, what waits for kestrel. */
export const Off = {
  args: {
    step: "off",
    checked: allBut(EIGHT, KEPT),
    rows: partway(EIGHT).map((each) =>
      each.stop === "stopping"
        ? { ...each, ran: "", stop: "stopped", landed: true }
        : each
    ),
  },
};

/** A long list: 24 rows stand about ten tall and scroll, the edge fading where more is past it. */
export const Long = {
  args: { rows: TWENTY_FOUR, checked: ids(TWENTY_FOUR) },
};
