/**
 * `bun scripts/call-cuts-check.ts`: a sweep of the cut-call rule (hub
 * call-cuts.ts `createCallCuts`, `whenCut`), the decision that a CawCo call
 * its harness cancels leaves nothing running that it started.
 *
 * Breadth-first over every schedule of up to {@link MAX_EVENTS} events of
 * one call (session `s1`, JSON-RPC id 7) running beside another session's
 * call under the same id: the call starts something (a delegate), answers,
 * outlives its late-cancel window, and cancels arrive naming it, the same id
 * as a string, another id, or the other session. After every schedule, the
 * laws:
 *
 * - Law A: what the call started is stopped exactly once when a cancel
 *   naming it came before its window closed, whether before or after the
 *   start and before or after the answer; never otherwise.
 * - Law B: a cancel cuts only the call it names: the other session's call
 *   under the same id, and a call under the same id as another type, are
 *   never cut.
 * - Law C: a cancel says it cut a call exactly when that call could still be
 *   cut, and a call whose window closed is no longer held.
 *
 * Run by `bun run check` (scripts/check.ts); it fails on any law broken.
 */
import { createCallCuts, whenCut } from "../packages/hub/src/call-cuts";

/** The longest schedule swept. */
const MAX_EVENTS = 7;

type Event =
  | "start"
  | "answer"
  | "window-closes"
  | "cancel"
  | "cancel-string-id"
  | "cancel-other-id"
  | "cancel-other-session";

const EVENTS: readonly Event[] = [
  "start",
  "answer",
  "window-closes",
  "cancel",
  "cancel-string-id",
  "cancel-other-id",
  "cancel-other-session",
];

/** Whether `event` may come next after `schedule`: one start before the answer, one answer, its window closing once after it. */
const mayFollow = (schedule: readonly Event[], event: Event): boolean => {
  const answered = schedule.includes("answer");
  switch (event) {
    case "start":
      return !(schedule.includes("start") || answered);
    case "answer":
      return !answered;
    case "window-closes":
      return answered && !schedule.includes("window-closes");
    case "cancel":
    case "cancel-string-id":
    case "cancel-other-id":
    case "cancel-other-session":
      return true;
  }
};

const failures: string[] = [];
const fail = (schedule: readonly Event[], law: string, said: string): void => {
  if (failures.length < 20) {
    failures.push(`${law} on [${schedule.join(", ")}]: ${said}`);
  }
};

/** One schedule's run: the registry, the two calls, and what the laws read. */
const runOf = (schedule: readonly Event[]) => {
  const pending: (() => void)[] = [];
  const cuts = createCallCuts((close) => {
    pending.push(close);
  });
  const call = cuts.begin("s1", 7);
  const other = cuts.begin("s2", 7);
  whenCut(other.signal, () => {
    fail(schedule, "Law B", "the other session's call was cut");
  });
  const state: { closed: boolean; cutBeforeClose: boolean; stops: number } = {
    stops: 0,
    cutBeforeClose: false,
    closed: false,
  };
  const cancel = (): void => {
    const holdable = !(state.closed || state.cutBeforeClose);
    const said = cuts.cancel("s1", 7, "Stop");
    if (said !== holdable) {
      fail(
        schedule,
        "Law C",
        `the cancel said ${said} while the call ${holdable ? "could" : "could not"} be cut`
      );
    }
    if (!state.closed) {
      state.cutBeforeClose = true;
    }
  };
  const steps: Record<Event, () => void> = {
    start: () =>
      whenCut(call.signal, () => {
        state.stops += 1;
      }),
    answer: () => call.answered(),
    "window-closes": () => {
      for (const close of pending.splice(0)) {
        close();
      }
      state.closed = true;
    },
    cancel,
    "cancel-string-id": () => {
      if (cuts.cancel("s1", "7")) {
        fail(schedule, "Law B", 'a cancel naming "7" cut the call 7');
      }
    },
    "cancel-other-id": () => {
      if (cuts.cancel("s1", 8)) {
        fail(schedule, "Law B", "a cancel naming 8 cut a call");
      }
    },
    "cancel-other-session": () => {
      cuts.cancel("s3", 7);
    },
  };
  return { cuts, state, steps };
};

/** Runs one schedule and holds it to the laws. */
const run = (schedule: readonly Event[]): void => {
  const { cuts, state, steps } = runOf(schedule);
  for (const event of schedule) {
    steps[event]();
  }
  const expected = schedule.includes("start") && state.cutBeforeClose ? 1 : 0;
  if (state.stops !== expected) {
    fail(
      schedule,
      "Law A",
      `what it started was stopped ${state.stops} time(s), ${expected} expected`
    );
  }
  // The other call is still held; this call is too until cut or closed.
  const held = 1 + (state.closed || state.cutBeforeClose ? 0 : 1);
  if (cuts.size !== held) {
    fail(schedule, "Law C", `${cuts.size} call(s) held, ${held} expected`);
  }
};

let swept = 0;
const outcomes = new Set<number>();
let frontier: Event[][] = [[]];
for (let depth = 0; depth <= MAX_EVENTS; depth += 1) {
  const next: Event[][] = [];
  for (const schedule of frontier) {
    run(schedule);
    swept += 1;
    outcomes.add(
      schedule.includes("start") &&
        schedule.indexOf("cancel") !== -1 &&
        (schedule.indexOf("window-closes") === -1 ||
          schedule.indexOf("cancel") < schedule.indexOf("window-closes"))
        ? 1
        : 0
    );
    if (depth < MAX_EVENTS) {
      for (const event of EVENTS) {
        if (mayFollow(schedule, event)) {
          next.push([...schedule, event]);
        }
      }
    }
  }
  frontier = next;
}

// A sweep that never reached a cut, or never a call left running, proves nothing.
if (outcomes.size !== 2) {
  failures.push("the sweep did not reach both a cut call and an uncut one");
}

if (failures.length > 0) {
  console.error(`call-cuts check: ${failures.length} failure(s)`);
  for (const failure of failures) {
    console.error(`  ${failure}`);
  }
  process.exit(1);
}
console.log(
  `call-cuts check: ${swept} schedules, laws A–C hold (a cut call's start is stopped once; nothing else is cut)`
);
