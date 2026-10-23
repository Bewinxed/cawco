/**
 * THE WALL BETWEEN CawCo AND A CATASTROPHIC SIGNAL, as CawCo imports it:
 * every signal CawCo sends goes through it, and only to a {@link Pid}. What
 * sends, and the rule it holds every pid to, is signal-wall.ts, which
 * imports nothing (the srt host signals through it alone); this module adds
 * the makers and senders that read the process table first.
 */
import { markerIsLive, processGroup, processStart } from "./process-identity";
import { type Delivery, type Pid, signalOwnGroup, wall } from "./signal-wall";

// biome-ignore lint/performance/noBarrelFile: the wall's own makers and senders, as every caller has always imported them from here; the sending half stays importable alone for the srt host (signal-wall.ts)
export {
  type Delivery,
  isAlive,
  isSignalRefused,
  listedPid,
  ownPid,
  type Pid,
  SignalRefused,
  type Spawned,
  signal,
  spawnedPid,
} from "./signal-wall";

/**
 * The pid a record names, when its process is still the one that wrote it:
 * its start as the system reports it now matches `procStart`, and, when the
 * record carries one, the machine has not rebooted since (`bootId`).
 * Undefined when the record names no pid or no start, or when its process
 * is gone or is another's now.
 */
export const identifiedPid = async (record: {
  bootId?: string;
  pid?: number;
  procStart?: string;
}): Promise<Pid | undefined> => {
  if (record.pid === undefined || record.procStart === undefined) {
    return;
  }
  const pid = wall(record.pid, "a recorded pid");
  const same =
    record.bootId === undefined
      ? (await processStart(pid)) === record.procStart
      : await markerIsLive({ ...record, pid });
  return same ? pid : undefined;
};

/**
 * Sends `sig` to the process group `leader` leads: only for a child CawCo
 * spawned as its own group's leader (`detached`, which is `setsid()`). The
 * leader's group is read first ({@link signalOwnGroup}).
 */
export const signalGroup = (leader: Pid, sig: NodeJS.Signals): Delivery =>
  signalOwnGroup(leader, processGroup(leader), sig);
