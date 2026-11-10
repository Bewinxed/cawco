/**
 * The lanes machine-scoped controls wait in (session.ts `dispatch`): one
 * queue per key, each control declared with the lane it takes
 * (`SessionSupervisor.declareControl`), so no ladder names them apart.
 */

import type { ControlPayload } from "@cawco/core/protocol";
import { fieldOf } from "./json-field";

/** The queue key a control waits in; `undefined` for the default (`machine:<method>`). */
export type ControlLane = (control: ControlPayload) => string | undefined;

/** A control reached by name through `control`. */
export type ControlMethod = (...args: unknown[]) => unknown;

/**
 * A machine-scoped control as declared: what it runs, and its lane. A
 * `read` is one the hub may let go (`CONTROL_ABANDON`), handed a signal
 * that aborts then.
 */
export type MachineControl =
  | { call: ControlMethod; lane?: ControlLane }
  | {
      lane: ControlLane;
      read: (signal: AbortSignal, ...args: unknown[]) => unknown;
    };

/** An image generation with a request id runs in a lane of its own: a slow one blocks no machine busy probe and no other control. */
export const imageLane: ControlLane = (control) =>
  control.requestId ? `image:${control.requestId}` : undefined;

/**
 * A command the hub runs (a check, a landing gate step, up to an hour):
 * commands in one directory run one after another, and nothing else waits
 * for them.
 */
export const commandLane: ControlLane = (control) =>
  `command:${String(control.args?.[0])}`;

/**
 * A move's steps (each naming its job as `args[0].jobId`) queue per job:
 * two jobs never wait on each other, and
 * a hub asking again for a step in flight waits on that one run.
 */
export const moveLane: ControlLane = (control) =>
  `move:${fieldOf(control.args?.[0], "jobId")}`;

/** A late create must finish before its discard; different workspace ids do not queue together. */
export const workspaceCreateLane: ControlLane = (control) =>
  `workspace:${String(control.args?.[1])}`;

/** A workspace's other controls, in its create's lane, by the workspace its first argument names. */
export const workspaceLane: ControlLane = (control) =>
  `workspace:${fieldOf(control.args?.[0], "id")}`;
