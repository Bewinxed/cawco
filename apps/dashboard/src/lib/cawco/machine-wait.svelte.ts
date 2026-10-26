/**
 * A read, or a press that reads first, asked of one machine and waited out
 * while that machine is away, the way a transcript is (client.svelte.ts
 * `readBehind`): the hub's 503 naming the machine (hub-read.ts
 * `MachineAwayError`) is never a refusal. The surface that asked says it in
 * place, a line of its own (MachineAway.svelte), and the same ask runs again
 * by itself once the machine is online.
 *
 * One per surface, made while its component starts: every ask it holds,
 * keyed by what the surface asked (a machine's compare, its settle), is let
 * go with the component.
 */
import { machineLabel } from "@cawco/core";
import { cawco } from "./client.svelte";
import { MachineAwayError } from "./hub-read";

/**
 * How long an ask waits before it runs again when its machine is listed
 * online as it is found away: the hub's word on the machine moves first, and
 * an ask sent again at once would only meet the same answer.
 */
const LISTED_ONLINE_WAIT_MS = 2000;

/** The machine an ask waits for, as the fleet lists it by name. */
export const awayMachineName = (away: MachineAwayError): string => {
  const row = cawco.machines.find(
    (listed) => listed.machineId === away.machineId
  );
  return row ? machineLabel(row.hostname) : away.machineId;
};

/**
 * What a surface says while an ask waits for `away`'s machine: on its way
 * back until the hub's deadline for it passes on this clock (`now`), offline
 * after, and that the ask runs again by itself.
 */
export const awayWords = (away: MachineAwayError, now: number): string =>
  `${awayMachineName(away)} ${
    away.reconnectingUntil !== null && away.reconnectingUntil > now
      ? "is reconnecting"
      : "is offline"
  }. This reads again by itself once it's back.`;

/** Whether the hub lists `machineId` online now. */
const listedOnline = (machineId: string): boolean =>
  cawco.machines.some(
    (row) => row.machineId === machineId && row.status === "online"
  );

export class MachineWait {
  /** Per key, why its ask waits: its machine away. */
  readonly #away = $state<Record<string, MachineAwayError>>({});
  /** Per key, how to let go of its wait. */
  readonly #letGo = new Map<string, () => void>();

  constructor() {
    $effect(() => () => {
      for (const key of [...this.#letGo.keys()]) {
        this.#end(key);
      }
    });
  }

  /** The machine `key`'s ask waits for, while it does. */
  away(key: string): MachineAwayError | null {
    return this.#away[key] ?? null;
  }

  /**
   * `ask`'s answer, or what it threw that is not its machine away. While its
   * machine is away, {@link away} says so under `key` and `ask` runs again
   * once the machine is back; a new ask under the same key, or the surface
   * going, ends the wait, and this one never settles.
   */
  async run<T>(key: string, ask: () => Promise<T>): Promise<T> {
    this.#end(key);
    let ended = false;
    this.#letGo.set(key, () => {
      ended = true;
    });
    for (;;) {
      try {
        const answer = await ask();
        if (!ended) {
          this.#clear(key);
        }
        return ended ? never<T>() : answer;
      } catch (error) {
        if (ended) {
          return never<T>();
        }
        if (!(error instanceof MachineAwayError)) {
          this.#clear(key);
          throw error;
        }
        this.#away[key] = error;
        await this.#back(key, error.machineId);
        if (ended) {
          return never<T>();
        }
      }
    }
  }

  /** Settles once `machineId` is back, or never when `key`'s wait ends first. */
  #back(key: string, machineId: string): Promise<void> {
    return new Promise((resolve) => {
      const ended = this.#letGo.get(key);
      let stop: () => void = () => undefined;
      const done = () => {
        stop();
        resolve();
      };
      if (listedOnline(machineId)) {
        const timer = setTimeout(done, LISTED_ONLINE_WAIT_MS);
        stop = () => clearTimeout(timer);
      } else {
        stop = $effect.root(() => {
          $effect(() => {
            if (listedOnline(machineId)) {
              queueMicrotask(done);
            }
          });
        });
      }
      this.#letGo.set(key, () => {
        stop();
        ended?.();
      });
    });
  }

  /** `key`'s wait ended: its line goes, and its ask never settles. */
  #end(key: string): void {
    this.#letGo.get(key)?.();
    this.#clear(key);
  }

  #clear(key: string): void {
    this.#letGo.delete(key);
    delete this.#away[key];
  }
}

/** A promise that never settles: an ask whose wait ended has nothing to say. */
const never = <T>(): Promise<T> => new Promise<T>(() => undefined);
