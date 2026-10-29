import { FLEET_WATCH_WAITS } from "./fleet-watch";
import { DAY_MS } from "./time";

/**
 * The hard wall clock on any CawCo tool call, in every harness: finish_item
 * runs a work item's landing gate, up to an hour (an iOS build), creating a
 * delegate's workspace runs minutes, and a wait on the person runs as long as
 * they take. Claude Code takes it as the server's `timeout` (agent
 * delegation.ts), OpenCode as the server's `timeout.execution` (agent
 * harnesses/opencode.ts), pi's tool door as its read deadline. Our call.
 */
export const LONG_CALL_WALL_MS = DAY_MS;

/** Tools that run for minutes, and what the hub's progress heartbeat says meanwhile. */
export const LONG_CALLS: Readonly<Record<string, string>> = {
  delegate: "Creating the delegate's workspace",
  generate_image: "Generating image through ChatGPT",
  continue_session: "Summarising the session",
  finish_item: "Running the merge checks of the work item",
  task_start: "Creating the attempt's workspace",
  start_session: "Waiting for the machine to start the session",
};

/**
 * Whether a CawCo tool (by its own name, the harness's prefix off) may run
 * past a quick call's deadline: a long call, or a designed wait
 * ({@link FLEET_WATCH_WAITS}). Such a call is bounded by
 * {@link LONG_CALL_WALL_MS} alone. A call that asks the person answers at
 * once (core asks.ts), so none is here.
 */
export const runsLong = (name: string): boolean =>
  Object.hasOwn(LONG_CALLS, name) || FLEET_WATCH_WAITS.has(name);
