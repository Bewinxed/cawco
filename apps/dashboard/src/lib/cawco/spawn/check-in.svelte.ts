/**
 * The Machines chip's pairing panel (MachinesChip): the line a machine runs
 * to join, and the watch for it checking in. The hub's addresses it builds
 * the line from are Add machine's own read (connect/installs.svelte.ts
 * `loadJoin`), so the two read them one way.
 */
import { cawco, type Machine } from "../client.svelte";

/** The one-liner a machine runs to join: the hub's install script, piped to sh. */
export const installCommand = (hubUrl: string): string =>
  `curl -fsSL ${hubUrl}/install.sh | sh`;

/**
 * Watches the fleet for a machine that was not in it when watching began —
 * the one signal that a machine someone is setting up has checked in. Made
 * fresh each time the panel opens, so a machine that was already there
 * never reads as new.
 */
export class CheckIn {
  readonly #known: ReadonlySet<string>;

  constructor() {
    this.#known = new Set(cawco.machines.map((row) => row.machineId));
  }

  /** The first machine online now that was not in the fleet at the start. */
  readonly joined: Machine | undefined = $derived(
    cawco.machines.find(
      (row) => row.status === "online" && !this.#known.has(row.machineId)
    )
  );
}
