/**
 * A session whose start failed, said over the composer: its machine's
 * harness CLI refused it (harness-block.svelte.ts), or a start again after
 * the harness was brought up was refused.
 */
import type { ComposerFleet } from "./composer-fleet";

export interface HarnessStartParts {
  fleet: () => ComposerFleet | undefined;
  /** The conversation this composer writes to. */
  recallOf: () => string | undefined;
}

export class HarnessStart {
  readonly #parts: HarnessStartParts;
  /** This session's row, while its start failed. */
  readonly failedRow = $derived.by(() => {
    const fleet = this.#parts.fleet();
    const recallOf = this.#parts.recallOf();
    const row =
      fleet && recallOf
        ? fleet.boardStore.instanceIndex.byId.get(recallOf)
        : undefined;
    return row?.status === "error" && row.harness !== null ? row : undefined;
  });
  /**
   * This session's start was refused for its machine's harness CLI
   * (harness-block.svelte.ts): the refusal stands over the field with its
   * fix (Update pi, Install OpenCode 2.0.29; Claude Code's own update, which
   * CawCo runs by itself), and once that lands the session starts again with
   * nothing more to press (`relaunchUnblocked`).
   */
  readonly harnessStart = $derived.by(() => {
    const fleet = this.#parts.fleet();
    const row = this.failedRow;
    if (!(fleet && row?.harness)) {
      return null;
    }
    const machine = fleet.boardStore.machines.find(
      (one) => one.machineId === row.machineId
    );
    const block = machine ? fleet.harnessBlockOf(machine, row.harness) : null;
    return machine && block ? { machine, block } : null;
  });
  /** A start again after its harness was brought up that was refused: said here, with Retry. */
  readonly relaunchRefused = $derived.by(() => {
    const fleet = this.#parts.fleet();
    const recallOf = this.#parts.recallOf();
    return fleet && recallOf && this.failedRow
      ? fleet.relaunchRefusalOf(recallOf)
      : undefined;
  });
  retrying = $state(false);

  constructor(parts: HarnessStartParts) {
    this.#parts = parts;

    // Any session this tab saw refused whose machine's harness now runs goes
    // again, whichever composer is on screen.
    $effect(() => {
      const fleet = parts.fleet();
      fleet?.relaunchUnblocked(fleet.boardStore.machines);
    });
    // A session that went on some other way has no refusal left to say.
    $effect(() => {
      const fleet = parts.fleet();
      const recallOf = parts.recallOf();
      if (fleet && recallOf && !this.failedRow) {
        fleet.forgetRelaunch(recallOf);
      }
    });
  }

  async retryStart(): Promise<void> {
    const fleet = this.#parts.fleet();
    const recallOf = this.#parts.recallOf();
    if (!(fleet && recallOf) || this.retrying) {
      return;
    }
    this.retrying = true;
    try {
      await fleet.retryRelaunch(recallOf);
    } finally {
      this.retrying = false;
    }
  }
}
