/**
 * A machine the owner paused until a time: nothing CawCo starts runs on it
 * until then, and at that time it resumes by itself. The owner, on battery:
 * "can we pause mac work for the next 3 hours". Stopping the Mac's agent by
 * hand did not hold: a delegate there woke and ran the iOS build through its
 * workspace runner, which never needed the agent.
 *
 * Its agent stays connected the whole time (heartbeats only). What the pause
 * holds is decided at the hub's own doors, each of which asks {@link
 * MachinePause.until}:
 * - a session's start (server.ts `startHold`) and every send into a session
 *   (`deliverToSession`): kept at the hub as owed, and handed over in the
 *   order taken once the pause ends (`releaseOwed`, `flushOwedStarts`);
 * - a keep-alive's ping: not sent;
 * - a command the hub runs there, a landing gate step (the iOS build among
 *   them) or a workflow's `w.exec` (`runOnMachine`): it waits for the
 *   pause's end, its item's status naming the pause and the time. One
 *   already running as the pause begins is cancelled on the machine (core
 *   `CONTROL_CANCEL_COMMAND`) and waits the same way, then runs again from
 *   the start: never a failed step or an attempt. The machine's row says how many were stopped;
 * - a new delegate for the machine (work-items.ts `MachinePaused`): queued
 *   in its parent's tray, and started once the pause ends;
 * - a preview's listener: not started, the pane saying why.
 * Turns already running there are interrupted as the pause begins, and each
 * session is sent word, held until the end, to carry on where it stopped.
 *
 * The pause is the machine's row (`agents.paused_until`), so it survives the
 * hub's restart and its agent's; the timer is armed again as the hub starts.
 */
import {
  machineCalled,
  pauseClock,
  type RunKind,
  type StoppedCommands,
  stoppedWords,
} from "@cawco/core";
import type { DbShape } from "./db";
import type { HubLifetimeShape, HubTimer } from "./lifetime";

/** The origin name of the word a pause sends the sessions it cut, to carry on. */
export const PAUSE_ORIGIN = "machine-pause";

/** How a caller has the hub run a command on a machine (server.ts `runOnMachine`). */
export interface CommandOptions {
  /**
   * A run a pause cancels answers `cancelled`, for its caller to run again
   * where it chooses (the Apple build gate moves to a Mac not paused),
   * rather than waiting the pause out and running again where it was.
   */
  readonly movable?: boolean;
  /**
   * The run never waits: on a paused machine it does not start, and one that
   * begins to wait for a shared slot (any but its boundary's start), or that
   * a pause cancels, is cancelled there; each throws {@link WouldWait}. A
   * landing turn's gate steps run so (landing.ts): an item there steps out to
   * gate again rather than hold the queue.
   */
  readonly noWait?: boolean;
  /**
   * Each change of what the run waits for, as its status says it ("queued
   * for the Mac's build slot behind …", "waiting: Omars-MacBook-Pro is
   * paused until 00:57"); null once it waits no more.
   */
  readonly onWait?: (words: string | null) => void;
  /** What it is, as a pause that stops it counts it; a plain command when not said. */
  readonly what?: RunKind;
}

/**
 * A `noWait` run ({@link CommandOptions}) that would have waited: `message`
 * is what for, as a status says it ("queued for a heavy-run slot behind …",
 * "Omars-MacBook-Pro is paused until 00:57").
 */
export class WouldWait extends Error {}

/** The longest a single timer is armed for; a later end is armed again from there. */
const TIMER_MAX_MS = 24 * 60 * 60 * 1000;

export interface MachinePauseDeps {
  readonly db: Pick<DbShape, "listAgents" | "setMachinePause">;
  readonly lifetime: HubLifetimeShape;
  /**
   * The pause took effect (or moved): what runs there now stops. Answers the
   * commands the machine says it stopped, which the machine's row keeps.
   */
  readonly paused: (machineId: string, until: Date) => Promise<StoppedCommands>;
  /** The pause is over, by its time or the owner's word: what waited goes. */
  readonly resumed: (machineId: string) => void;
}

export interface MachinePause {
  /** Resolves once `machineId` is not paused; at once when it is not now. */
  readonly free: (machineId: string) => Promise<void>;
  /**
   * Pauses `machineId` until `until`, once what ran there has stopped;
   * false when the hub knows no such machine.
   */
  readonly pause: (machineId: string, until: Date) => Promise<boolean>;
  /** Ends the machine's pause now; nothing when it was not paused. */
  readonly resume: (machineId: string) => void;
  /** Arms every stored pause, and ends those whose time came while the hub was down. */
  readonly start: () => void;
  /** When the machine's pause ends, in ms; undefined when it is not paused. */
  readonly until: (machineId: string) => number | undefined;
  /** "Omars-MacBook-Pro is paused until 00:57"; undefined when it is not paused. */
  readonly words: (machineId: string) => string | undefined;
}

export const createMachinePause = (deps: MachinePauseDeps): MachinePause => {
  const { db, lifetime } = deps;
  /** Each paused machine's end, in ms: the rows', read once and kept in step. */
  const ends = new Map<string, number>();
  const timers = new Map<string, HubTimer>();
  const waiting = new Map<string, (() => void)[]>();

  const disarm = (machineId: string): void => {
    lifetime.cancel(timers.get(machineId));
    timers.delete(machineId);
  };

  const end = (machineId: string): void => {
    disarm(machineId);
    if (!ends.delete(machineId)) {
      return;
    }
    db.setMachinePause(machineId, null, null);
    console.log(`[pause] ${machineId}: resumed`);
    for (const go of waiting.get(machineId) ?? []) {
      go();
    }
    waiting.delete(machineId);
    deps.resumed(machineId);
  };

  const arm = (machineId: string): void => {
    disarm(machineId);
    const at = ends.get(machineId);
    if (at === undefined) {
      return;
    }
    const left = at - Date.now();
    if (left <= 0) {
      end(machineId);
      return;
    }
    timers.set(
      machineId,
      lifetime.after(Math.min(left, TIMER_MAX_MS), () => arm(machineId))
    );
  };

  return {
    start: () => {
      for (const row of db.listAgents()) {
        if (row.pausedUntil !== null && row.pausedUntil !== undefined) {
          ends.set(row.machineId, row.pausedUntil);
        }
      }
      for (const machineId of [...ends.keys()]) {
        arm(machineId);
      }
    },
    pause: async (machineId, until) => {
      if (!db.setMachinePause(machineId, until, null)) {
        return false;
      }
      ends.set(machineId, until.getTime());
      console.log(`[pause] ${machineId}: paused until ${until.toISOString()}`);
      arm(machineId);
      const stopped = await deps.paused(machineId, until);
      // Kept only on the pause it belongs to: not one resumed or moved meanwhile.
      if (
        Object.keys(stopped).length > 0 &&
        ends.get(machineId) === until.getTime()
      ) {
        db.setMachinePause(machineId, until, stopped);
        console.log(
          `[pause] ${machineId}: ${stoppedWords(stopped) ?? "stopped nothing"}`
        );
      }
      return true;
    },
    resume: end,
    until: (machineId) => ends.get(machineId),
    words: (machineId) => {
      const at = ends.get(machineId);
      if (at === undefined) {
        return;
      }
      const name = machineCalled(machineId, db.listAgents());
      return `${name} is paused until ${pauseClock(at)}`;
    },
    free: (machineId) =>
      ends.has(machineId)
        ? new Promise<void>((go) => {
            waiting.set(machineId, [...(waiting.get(machineId) ?? []), go]);
          })
        : Promise.resolve(),
  };
};
