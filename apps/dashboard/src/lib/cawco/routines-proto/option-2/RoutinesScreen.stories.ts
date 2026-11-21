/**
 * My reading of what opens beside Option 2's view (Component Story Format
 * 3): a run's page and a routine's page, each open in the split beside the
 * project's day, as a press on its Open leaves them.
 */
import { NOW, ROUTINES, RUNS, SOURCES, STANDINGS } from "./day";
import RoutinesScreen from "./RoutinesScreen.svelte";
import ScreenRoom from "./screen-room.svelte";

const nothing = () => undefined;

export default {
  title: "Routines, option 2/Open beside the day",
  component: RoutinesScreen,
  args: {
    routines: ROUTINES,
    runs: RUNS,
    sources: SOURCES,
    standings: STANDINGS,
    now: NOW,
    looked: [],
    open: { kind: "run", id: "triage-833" },
    onopen: nothing,
    onopensession: nothing,
    onchoose: nothing,
    onlooked: nothing,
    onedit: nothing,
    onchangewithcaw: nothing,
  },
  decorators: [() => ({ Component: ScreenRoom, props: {} })],
  parameters: { viewport: 1440 },
};

/** This morning's triage run: what it labelled, the delegate's report with its loose ends, and Open session. */
export const TriageRun = {};

/** Friday's retry that failed: why, and the post X refused, waiting to be looked at. */
export const FailedRetry = {
  args: { open: { kind: "run", id: "changelog-retry" } },
};

/** One look at npm: what it looks for, the command's words and its output, and no session to open. */
export const NpmLook = {
  args: { open: { kind: "run", id: `npm-${Date.UTC(2026, 10, 21, 13, 30)}` } },
};

/** The summary still running: what it has read so far. */
export const DigestRunning = {
  args: { open: { kind: "run", id: "digest-today" } },
};

/** The npm wait opened as a routine: Edit and Change with Caw in its bar, what it looks for, when it runs, its runs. */
export const NpmRoutine = {
  args: { open: { kind: "routine", id: "npm" } },
};

/** CawCo's own memory run opened: only its time can change. */
export const MemoryRoutine = {
  args: { open: { kind: "routine", id: "memory" } },
};
