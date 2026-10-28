/**
 * Whether each machine's welcome has converged: its harnesses have placed
 * what it holds of the fleet (skills, MCP servers, memory documents, hooks,
 * harness settings) up to the welcome's generation, not only kept it on
 * disk. The agent says the generation whose converge has ended
 * (`convergedGeneration`, core `FleetAck`) on its answer to every delta and
 * on every fleet report; a converge pass that threw ends with its last word
 * on its items (`fleet_converge`, none of them still running) and no
 * report. An add's sync step waits on it (installs.ts `ready`), so the
 * window says the machine is in the fleet only once what the fleet holds is
 * on it, a machine whose last converge was cut short included.
 */
import type {
  ControlResultFrame,
  FleetAck,
  FleetDelta,
  FleetItemStatus,
} from "@cawco/core";

interface Owed {
  generation: number;
  /** Each add's sync step waiting on it. */
  waiters: (() => void)[];
}

/** An item still on its way: its converge has not ended. */
const moving = (item: FleetItemStatus): boolean =>
  item.state === "pending" || item.state === "running";

export class WelcomeConverge {
  /** Each machine whose welcome's converge has not ended, with the generation it waits to reach. */
  readonly #owed = new Map<string, Owed>();

  /** A delta went to the machine: a welcome is owed its converge. */
  sent(machineId: string, delta: FleetDelta): void {
    if (!delta.welcome) {
      return;
    }
    this.#owed.set(machineId, {
      generation: delta.generation,
      waiters: this.#owed.get(machineId)?.waiters ?? [],
    });
  }

  /** The machine answered a delta (ACK): the generation it has converged. */
  answered(machineId: string, result: ControlResultFrame): void {
    const converged = result.ok
      ? (result.result as Partial<FleetAck> | undefined)?.convergedGeneration
      : undefined;
    this.#reached(machineId, converged);
  }

  /** The machine's fleet report: the generation it has converged. */
  reported(machineId: string, convergedGeneration: number | undefined): void {
    this.#reached(machineId, convergedGeneration);
  }

  /** The machine's word on items as its pass at `generation` moves them: its items, none still moving, end the pass. */
  converging(
    machineId: string,
    generation: number,
    items: readonly FleetItemStatus[]
  ): void {
    if (items.some((item) => item.id !== "policy") && !items.some(moving)) {
      this.#reached(machineId, generation);
    }
  }

  /**
   * Answers once the machine's welcome has converged: at once when nothing
   * is owed (it was never sent one). A caller that lets go (`signal`) is
   * waited for no more.
   */
  settled(machineId: string, signal: AbortSignal): Promise<void> {
    const owed = this.#owed.get(machineId);
    if (!owed) {
      return Promise.resolve();
    }
    const { promise, resolve } = Promise.withResolvers<void>();
    owed.waiters.push(resolve);
    signal.addEventListener(
      "abort",
      () => {
        const now = this.#owed.get(machineId);
        if (now) {
          now.waiters = now.waiters.filter((one) => one !== resolve);
        }
      },
      { once: true }
    );
    return promise;
  }

  #reached(machineId: string, generation: number | undefined): void {
    const owed = this.#owed.get(machineId);
    if (
      !owed ||
      typeof generation !== "number" ||
      generation < owed.generation
    ) {
      return;
    }
    this.#owed.delete(machineId);
    for (const resolve of owed.waiters) {
      resolve();
    }
  }
}
