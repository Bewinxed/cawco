/**
 * A group of conversations as a busy fleet holds them, for the tab-switch
 * design graph (PaneTabs*.stories.ts): up to 29 sessions across projects,
 * each a row the hub would list and a pulse its daemon would send, in mixed
 * states (most idle, some working, one asking, one stopped, one failed).
 * The states files hand them to the board through its own writers.
 */
import type { InstanceRow, SessionPulse } from "@cawco/core/protocol";
import type { ForwardStyle } from "#lib/components/ui/fluid-tabs/forward-style.js";

/** Each session's title, as its first message named it. */
const TITLES = [
  "Fix the tray chip overflow",
  "Speed up the dashboard's tab switch",
  "Write the release notes for 0.42",
  "Probe the phone's network switch",
  "Move the hub's scheduler onto one loop",
  "Find why the preview origin refuses the socket",
  "Redesign the project header",
  "Add a lint rule against :has() outside the subject",
  "Audit the push probe",
  "Rebuild the token sheet",
  "Fix the relay's reconnect after sleep",
  "Trim the onboarding copy",
  "Cache the fleet memory between runs",
  "Port the usage meter to the new socket",
  "Stop the composer jumping on paste",
  "Draw the delegate tray's empty state",
  "Read the billing webhook retries",
  "Split the transcript store by session",
  "Land the dark scheme's contrast fixes",
  "Name the machines by their hostnames",
  "Make the routine runner resumable",
  "Profile the board's first paint",
  "Teach the search to read task logs",
  "Bring the settings sheet to the phone",
  "Answer the permission ask from the lock screen",
  "Tidy the account picker",
  "Measure the stage's cold start",
  "Rewrite the folder tabs' outline",
  "Ship the CLI's update check",
] as const;

/** The most tabs a group holds here. */
const MOST_TABS = TITLES.length;

/** The `n`th session's id. */
const idOf = (n: number) =>
  `7a65c0de-0000-4000-8000-${String(n + 1).padStart(12, "0")}`;

/** The first `count` sessions' ids, in the strip's order. */
export const switchIds = (count: number): string[] =>
  Array.from({ length: Math.min(count, MOST_TABS) }, (_, n) => idOf(n));

/** What each session is doing, by its place: most idle, a few at work. */
const doingAt = (n: number): SessionPulse["activity"] => {
  if (n === 3) {
    return "blocked";
  }
  return n % 5 === 1 ? "working" : "idle";
};

/** The rows the hub lists for the first `count` sessions, as of `now`. */
function switchRows(count: number, now: number): InstanceRow[] {
  return switchIds(count).map((id, n) => {
    const doing = doingAt(n);
    let status: InstanceRow["status"] = "running";
    if (n === 6) {
      status = "stopped";
    } else if (n === 9) {
      status = "error";
    }
    const ended = doing === "working" ? null : now - (n + 1) * 240_000;
    return {
      id,
      cwd: "/srv/cockpit",
      harness: "claude",
      kind: "mainline",
      mayStart: ["any"],
      startingSet: null,
      launchDir: "known",
      machineId: "studio",
      sessionId: id,
      status,
      title: TITLES[n],
      turnEndedAt: ended,
      updatedAt: ended ?? now,
    };
  });
}

/** Each session's pulse, as its daemon last sent it at `now`. */
function switchPulses(count: number, now: number): SessionPulse[] {
  return switchIds(count).map((instanceId, n) => {
    const activity = doingAt(n);
    return {
      activity,
      at: now,
      busy: activity === "working",
      currentTool: null,
      instanceId,
      runningSubagents: 0,
    };
  });
}

/** The board's writers a states file hands the group to (stores/board.svelte.ts). */
interface BoardWriters {
  adoptRows: (rows: InstanceRow[]) => unknown;
  takePulse: (instanceId: string, pulse: SessionPulse) => void;
}

/** Every session of the group, its row and its pulse, held by `board`. */
function holdSwitch(board: BoardWriters): void {
  const now = Date.now();
  board.adoptRows(switchRows(MOST_TABS, now));
  for (const pulse of switchPulses(MOST_TABS, now)) {
    board.takePulse(pulse.instanceId, pulse);
  }
}

/** What a states file's `play` is handed, as far as a press on a tab needs. */
interface PlayKit {
  canvas: { getByRole: (role: string, options: { name: RegExp }) => Element };
  userEvent: { click: (el: Element) => Promise<void> };
}

/** A `play` that presses the tab whose name starts with `title`, as a person does. */
const pressTab =
  (title: string) =>
  async ({ canvas, userEvent }: PlayKit): Promise<void> => {
    await userEvent.click(
      canvas.getByRole("tab", { name: new RegExp(`^${title}`, "u") })
    );
  };

/**
 * What every tab-switch states file shares but its title and component
 * (pane-tabs-live): its come-forward drawn `forward`, 29 tabs, the
 * fifteenth chosen, the board holding the group before each frame.
 */
export const switchMeta = (forward: ForwardStyle) => ({
  args: { forward, count: MOST_TABS, at: 14 },
  async beforeEach() {
    holdSwitch(await import("../stores/board.svelte"));
  },
});

/** The press four tabs along, from the live strip. */
export const JUMP = {
  from: "Live",
  play: pressTab("Fix the relay's reconnect"),
};

/** The press on the tab beside the chosen one, from the live strip. */
export const NEXT = { from: "Live", play: pressTab("Port the usage meter") };
