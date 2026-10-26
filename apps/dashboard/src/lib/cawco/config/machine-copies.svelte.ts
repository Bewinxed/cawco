/**
 * An editor's per-machine copies (a hook's script, a memory file): a machine
 * gives back only what CawCo wrote it, so a copy edited on the machine
 * waits until it is compared, adopted or overwritten. Each ask waits out a
 * machine that is away (MachineWait). Made as its editor starts.
 */
import type { Machine } from "../client.svelte";
import { failureWords as message } from "../hub-read";
import { MachineWait } from "../machine-wait.svelte";

export class MachineCopies {
  /** The machine whose copy stands open under its row. */
  comparing = $state<string | null>(null);
  /** Per machine, its copy as read (null: it has none). */
  copies = $state<Record<string, string | null>>({});
  /** Per machine, a read under way. */
  peeking = $state<Record<string, boolean>>({});
  /** Per machine, why its copy could not be read. */
  unread = $state<Record<string, string>>({});
  /** Per machine, the settle whose request is out. */
  settling = $state<Record<string, "adopt" | "push">>({});
  /** Per machine, why its last settle was refused: said under its row. */
  settleFailed = $state<Record<string, string>>({});
  /** Compares and settles whose machine went away: said in place, asked again once it is back. */
  readonly waits = new MachineWait();

  /** Opens `machine`'s copy under its row, or closes it; the first open reads it (`read`). */
  async compare(
    machine: Machine,
    read: () => Promise<string | null>
  ): Promise<void> {
    const at = machine.machineId;
    if (this.comparing === at) {
      this.comparing = null;
      return;
    }
    this.comparing = at;
    if (Object.hasOwn(this.copies, at) || this.peeking[at]) {
      return;
    }
    this.peeking[at] = true;
    delete this.unread[at];
    try {
      this.copies[at] = await this.waits.run(`peek:${at}`, read);
    } catch (caught) {
      this.unread[at] = message(caught);
    } finally {
      delete this.peeking[at];
    }
  }

  /**
   * Adopts `machine`'s copy or sends it ours (`kind`), by `ask`; once it
   * lands its copy closes and is let go, and `landed` takes the answer.
   */
  async settle<T>(
    machine: Machine,
    kind: "adopt" | "push",
    ask: () => Promise<T>,
    landed: (answer: T) => unknown
  ): Promise<void> {
    const at = machine.machineId;
    this.settling[at] = kind;
    delete this.settleFailed[at];
    try {
      const answer = await this.waits.run(`settle:${at}`, ask);
      this.comparing = null;
      delete this.copies[at];
      await landed(answer);
    } catch (caught) {
      this.settleFailed[at] = message(caught);
    } finally {
      delete this.settling[at];
    }
  }
}
