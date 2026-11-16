/**
 * The lanes machine-scoped controls wait in (session.ts `dispatch`): one
 * queue per key, each control declared with the lane it takes
 * (`SessionSupervisor.declareControl`), so no ladder names them apart.
 */

import type {
  ControlArgs,
  ControlName,
  ControlResult,
} from "@cawco/core/control-table";

/** A control as its lane reads it: the hub's request id, and its own arguments. */
interface LaneAsk<K extends ControlName> {
  args: ControlArgs<K>;
  requestId: string;
}

/** The queue key control `K` waits in; `undefined` for the default (`machine:<method>`). */
export type ControlLane<K extends ControlName> = (
  control: LaneAsk<K>
) => string | undefined;

/** What control `K`'s handler answers, now or once it has run. */
export type ControlAnswer<K extends ControlName> =
  ControlResult<K> | Promise<ControlResult<K>>;

/**
 * A machine-scoped control as declared: what it runs, called with its own
 * arguments, and its lane. A `read` is one the hub may let go
 * (`CONTROL_ABANDON`), handed a signal that aborts then.
 */
export type MachineControl<K extends ControlName> =
  | {
      call: (...args: ControlArgs<K>) => ControlAnswer<K>;
      lane?: ControlLane<K>;
    }
  | {
      lane: ControlLane<K>;
      read: (signal: AbortSignal, ...args: ControlArgs<K>) => ControlAnswer<K>;
    };

/** The machine-scoped controls declared, each under its own name. */
export type MachineControls = { [K in ControlName]?: MachineControl<K> };

/** An image generation with a request id runs in a lane of its own: a slow one blocks no machine busy probe and no other control. */
export const imageLane: ControlLane<"generateImage"> = (control) =>
  control.requestId ? `image:${control.requestId}` : undefined;

/**
 * A command the hub runs (a check, a landing gate step, up to an hour):
 * commands in one directory run one after another, and nothing else waits
 * for them.
 */
export const commandLane: ControlLane<"runCommand"> = (control) =>
  `command:${control.args[0]}`;

/**
 * A move's steps (each naming its job as `args[0].jobId`) queue per job:
 * two jobs never wait on each other, and
 * a hub asking again for a step in flight waits on that one run.
 */
export const moveLane: ControlLane<
  "movePrepare" | "moveSnapshot" | "moveClone" | "moveLfs"
> = (control) => `move:${control.args[0].jobId}`;

/** A late create must finish before its discard; different workspace ids do not queue together. */
export const workspaceCreateLane: ControlLane<"workspaceCreate"> = (control) =>
  `workspace:${control.args[1]}`;

/** A workspace's other controls, in its create's lane, by the workspace its first argument names. */
export const workspaceLane: ControlLane<
  | "workspaceArchive"
  | "workspaceDiscard"
  | "workspaceOutputs"
  | "hostOutputs"
  | "hostScratchRemove"
  | "workspaceWorkEnd"
  | "workspaceBundle"
  | "workspaceAt"
> = (control) => `workspace:${control.args[0].id}`;
