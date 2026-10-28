/**
 * Whether each machine's welcome has converged: its harnesses have placed
 * what the welcome carried (the fleet's skills, MCP servers, memory
 * documents, hooks and harness settings), not only kept it. The agent
 * answers a welcome (READY, fleet-sync.ts) once it has kept the items on
 * disk, then converges them (agent session.ts `#convergeSoon`): the pass
 * that reached the welcome's generation says it ended with its fleet
 * report, or, when its harnesses threw, with its last word on its items
 * (`fleet_converge`, none of them still running). The policy's own word
 * (`#writePolicy`) ends no pass. An add's sync step waits on it
 * (installs.ts `ready`), so the window says the machine is in the fleet
 * only once what the fleet holds is on it.
 */
import type { FleetDelta, FleetItemStatus } from "@cawco/core";

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

  /**
   * A delta went to the machine. A welcome carrying more than the policy
   * (which the agent writes as it answers) owes a converge; one carrying
   * nothing else settles whatever waited on an earlier one.
   */
  sent(machineId: string, delta: FleetDelta): void {
    if (!delta.welcome) {
      return;
    }
    if (delta.items.some((item) => item.id !== "policy")) {
      this.#owed.set(machineId, {
        generation: delta.generation,
        waiters: this.#owed.get(machineId)?.waiters ?? [],
      });
      return;
    }
    this.#settle(machineId);
  }

  /** The machine's fleet report, from the converge pass that reached `generation` (null: read unasked). */
  reported(machineId: string, generation: number | null): void {
    if (generation !== null) {
      this.#reached(machineId, generation);
    }
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
   * is owed (its welcome carried only the policy, or it was never sent one).
   * A caller that lets go (`signal`) is waited for no more.
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

  #reached(machineId: string, generation: number): void {
    const owed = this.#owed.get(machineId);
    if (owed && generation >= owed.generation) {
      this.#settle(machineId);
    }
  }

  #settle(machineId: string): void {
    const waiters = this.#owed.get(machineId)?.waiters ?? [];
    this.#owed.delete(machineId);
    for (const resolve of waiters) {
      resolve();
    }
  }
}
