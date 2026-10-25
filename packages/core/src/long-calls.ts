import { FLEET_WATCH_WAITS } from "./fleet-watch";

/**
 * The hard wall clock on any CawCo tool call, in every harness: finish_item
 * runs a work item's landing gate, up to an hour (an iOS build), creating a
 * delegate's workspace runs minutes, and a wait on the person runs as long as
 * they take. Claude Code takes it as the server's `timeout` (agent
 * delegation.ts), OpenCode as the server's `timeout.execution` (agent
 * harnesses/opencode.ts), pi's tool door as its read deadline. Our call.
 */
export const LONG_CALL_WALL_MS = 24 * 60 * 60 * 1000;

/** Tools that run for minutes, and what the hub's progress heartbeat says meanwhile. */
export const LONG_CALLS: Readonly<Record<string, string>> = {
  delegate: "Creating the delegate's workspace",
  generate_image: "Generating image through ChatGPT",
  continue_session: "Summarising the session",
  finish_item: "Running the merge checks of the work item",
  task_start: "Creating the attempt's workspace",
  start_session: "Waiting for the machine to start the session",
};

/** The tool that changes a project's settings, asking the person first unless it is in Full Send. */
export const PROJECT_SETTINGS = "project_settings";

const ADMIN_WRITE_TOOL = /^admin_[a-z_]+_write$/;

/** Whether a tool is an admin write: the hub asks the person before each call runs, unless its session is in Full Send (hub admin-asks.ts). */
export const isAdminWrite = (name: string): boolean =>
  ADMIN_WRITE_TOOL.test(name);

/**
 * Whether a CawCo tool (by its own name, the harness's prefix off) may run
 * past a quick call's deadline: a long call, a designed wait
 * ({@link FLEET_WATCH_WAITS}), or one that waits on the person's answer.
 * Such a call is bounded by {@link LONG_CALL_WALL_MS} alone.
 */
export const runsLong = (name: string): boolean =>
  Object.hasOwn(LONG_CALLS, name) ||
  FLEET_WATCH_WAITS.has(name) ||
  isAdminWrite(name) ||
  name === PROJECT_SETTINGS;
