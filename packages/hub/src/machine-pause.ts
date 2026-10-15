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
 * - a command the hub runs there, an acceptance check or the Apple build
 *   gate among them (`runOnMachine`): it waits for the pause's end, its
 *   item's status naming the pause and the time;
 * - a new delegate for the machine (work-items.ts `MachinePaused`): queued
 *   in its parent's tray, and started once the pause ends;
 * - a preview's listener: not started, the pane saying why.
 * Turns already running there are interrupted as the pause begins, and each
 * session is sent word, held until the end, to carry on where it stopped.
 *
 * The pause is the machine's row (`agents.paused_until`), so it survives the
 * hub's restart and its agent's; the timer is armed again as the hub starts.
 */
import { namedAmong, pauseClock } from "@cawco/core";
import type { DbShape } from "./db";
import type { HubLifetimeShape, HubTimer } from "./lifetime";

/** The origin name of the word a pause sends the sessions it cut, to carry on. */
export const PAUSE_ORIGIN = "machine-pause";

/** The longest a single timer is armed for; a later end is armed again from there. */
const TIMER_MAX_MS = 24 * 60 * 60 * 1000;

export interface MachinePauseDeps {
  readonly db: Pick<DbShape, "listAgents" | "setMachinePause">;
  readonly lifetime: HubLifetimeShape;
  /** The pause took effect (or moved): what runs there now stops. */
  readonly paused: (machineId: string, until: Date) => void;
  /** The pause is over, by its time or the owner's word: what waited goes. */
  readonly resumed: (machineId: string) => void;
}

export interface MachinePause {
  /** Resolves once `machineId` is not paused; at once when it is not now. */
  readonly free: (machineId: string) => Promise<void>;
  /** Pauses `machineId` until `until`; false when the hub knows no such machine. */
  readonly pause: (machineId: string, until: Date) => boolean;
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
    db.setMachinePause(machineId, null);
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
    pause: (machineId, until) => {
      if (!db.setMachinePause(machineId, until)) {
        return false;
      }
      ends.set(machineId, until.getTime());
      console.log(`[pause] ${machineId}: paused until ${until.toISOString()}`);
      arm(machineId);
      deps.paused(machineId, until);
      return true;
    },
    resume: end,
    until: (machineId) => ends.get(machineId),
    words: (machineId) => {
      const at = ends.get(machineId);
      if (at === undefined) {
        return;
      }
      const agents = db.listAgents();
      const agent = agents.find((each) => each.machineId === machineId);
      const name = agent ? namedAmong(agent, agents) : machineId;
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
