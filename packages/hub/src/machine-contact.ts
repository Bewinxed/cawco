/**
 * Whether the hub has lost a machine: the one rule a person hears "didn't
 * answer" by (core words/contact.ts). Word from it is what its registered
 * connection carries, as the hub's socket takes it: every frame as it
 * arrives, before the socket's inbox works it (wire-socket.ts
 * `receiveFrame`), and every ping its agent sends each 15 s (agent
 * daemon.ts, the link's deadline), which waits behind no message on either
 * side. Its heartbeat also says whether sessions run there. A machine heard
 * from during this hub's run, with sessions on it at its last beat, that
 * has sent nothing for {@link MACHINE_LOST_MS} (its agent's loop held, or
 * its link gone) is lost: said once, in the log, as Needs you's item and as
 * one push. Its next frame or ping ends it, and the item and push come
 * down. The same rule for every machine, the hub's own included; its words
 * for the hub's own name the agent, not the machine (core `contactWords`).
 *
 * A heartbeat is not the measure: it is a message, composed from reads of
 * the machine's sessions and queued behind every message before it, and
 * worked here behind every frame before it in the socket's inbox. On a
 * loaded machine it comes late while the agent's loop turns and its pings
 * arrive on time.
 *
 * Silence is judged by a look that ran on time: a look the hub's own loop
 * held past {@link LOOK_MS} twice over judges nothing, since what the
 * machines sent meanwhile still lies unread in their sockets (Bun runs a
 * held loop's timers before it reads them, wire-socket.ts `caughtUp`).
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

  let looked = Date.now();
  deps.lifetime.every(LOOK_MS, () => {
    const now = Date.now();
    const held = now - looked > LOOK_MS * 2;
    looked = now;
    if (held) {
      return;
    }
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
     * A frame or a ping from the machine's registered connection. `holds`,
     * from a heartbeat: whether sessions run there; anything else keeps
     * what the last beat said.
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
