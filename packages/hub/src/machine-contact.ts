/**
 * Whether the hub has lost a machine: the one rule a person hears "didn't
 * answer" by (core words/contact.ts). Every frame a machine's registered
 * connection sends is word from it; its heartbeat also says whether
 * sessions run there. A machine heard from during this hub's run, with
 * sessions on it at its last beat, that has sent nothing for
 * {@link MACHINE_LOST_MS} (its link frozen or gone) is lost: said once, in
 * the log, as Needs you's item and as one push. Its next frame ends it, and
 * the item and push come down. The same rule for every machine, the hub's
 * own included.
 *
 * Never a read: one ask a machine was slow to answer is said to whoever
 * asked and in the log, and decides nothing here (2026-10-20, obelisk: a
 * 10 s transcript read of the hub's own machine, missed three times, reached
 * the owner as a fleet-watch notice; 2026-10-23, 1,433 such misses in an
 * hour while the machine beat on).
 *
 * A machine not heard from since the hub started is offline on the board,
 * not lost: nothing of this run waits on it.
 */
import { contactWords, MACHINE_LOST_MS } from "@cawco/core";
import type { HubLifetimeShape } from "./lifetime";

/** How often silence is looked at: the span is met within this much. */
const LOOK_MS = 5000;

interface Heard {
  /** ms epoch of its last frame. */
  at: number;
  /** Its last heartbeat listed sessions running there. */
  holds: boolean;
}

export interface MachineContactDeps {
  /** It is heard from again: its item and push come down. */
  readonly back: (machineId: string) => void;
  readonly lifetime: HubLifetimeShape;
  /** The machine has been lost since `since` (ms epoch): its item and push. */
  readonly lost: (machineId: string, since: number) => void;
  /** A machine as a sentence names it. */
  readonly name: (machineId: string) => string;
}

export const createMachineContact = (deps: MachineContactDeps) => {
  const heard = new Map<string, Heard>();
  /** Lost machines, by id: since when nothing came from them. */
  const lost = new Map<string, number>();

  deps.lifetime.every(LOOK_MS, () => {
    const now = Date.now();
    for (const [machineId, last] of heard) {
      if (lost.has(machineId) || !last.holds) {
        continue;
      }
      if (now - last.at >= MACHINE_LOST_MS) {
        lost.set(machineId, last.at);
        console.warn(
          `[machines] ${deps.name(machineId)} has sent nothing for ${Math.round((now - last.at) / 1000)} s with sessions on it: ${contactWords.lostLogged}`
        );
        deps.lost(machineId, last.at);
      }
    }
  });

  return {
    /**
     * A frame from the machine's registered connection. `holds`, from a
     * heartbeat: whether sessions run there; other frames keep what the
     * last beat said.
     */
    heard(machineId: string, holds?: boolean): void {
      const now = Date.now();
      const before = heard.get(machineId);
      heard.set(machineId, {
        at: now,
        holds: holds ?? before?.holds ?? false,
      });
      const since = lost.get(machineId);
      if (since === undefined) {
        return;
      }
      lost.delete(machineId);
      console.info(
        `[machines] ${deps.name(machineId)} ${contactWords.backLogged} ${Math.round((now - since) / 1000)} s: its notice is down`
      );
      deps.back(machineId);
    },

    /** Since when the machine has been lost (ms epoch); null while it answers. */
    lostAt: (machineId: string): number | null => lost.get(machineId) ?? null,

    /** The machine left the fleet: nothing more is said of it. */
    forget(machineId: string): void {
      heard.delete(machineId);
      if (lost.delete(machineId)) {
        deps.back(machineId);
      }
    },
  };
};

export type MachineContact = ReturnType<typeof createMachineContact>;
