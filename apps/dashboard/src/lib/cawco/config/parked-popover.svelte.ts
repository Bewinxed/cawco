/**
 * A write popover whose work belongs to the hub (DESIGN.md, The Work
 * Outlives Its Surface Rule): ×, Esc or a press outside put it away into
 * the row its ask made, which carries it back; a reload opens it again as
 * it was (`draft`). It may stand in the section's header ("head") and in
 * an empty group's action, named by its group: one put away opens in the
 * header's when its own is gone.
 */
import { onMount } from "svelte";
import type { z } from "zod";
import { closeInto } from "#lib/cawco/motion/share.svelte.js";
import { TabDraft } from "../tab-draft.svelte";

/**
 * What every such popover keeps: open or not; where it was opened from
 * ("head", or an empty group's name); the hub's row its ask went on in,
 * until it lands; and why the hub refused the ask itself (no row to carry
 * it).
 */
type Held = z.ZodObject<{
  open: z.ZodBoolean;
  at: z.ZodString;
  asked: z.ZodNullable<z.ZodString>;
  refused: z.ZodNullable<z.ZodString>;
}>;

/** The row named `name` on the page: what a popover opens beside and closes into. */
export const rowOf = (name: string): HTMLElement | null =>
  document.querySelector<HTMLElement>(`[data-row-name="${CSS.escape(name)}"]`);

export class ParkedPopover<S extends Held> {
  readonly draft: TabDraft<S>;
  /** The popovers mounted on the page, by where. */
  readonly mounted = $state<Record<string, number>>({});
  /** The row it is reopened from, which it opens beside and closes into. */
  fromRow = $state<HTMLElement | null>(null);

  constructor(key: string, shape: S, blank: () => z.output<S>) {
    this.draft = new TabDraft(key, shape, blank);
  }

  /** One press on its row: the popover again, where it was, beside that row. */
  reopen(row: HTMLElement | null): void {
    this.fromRow = row;
    this.draft.value.open = true;
  }
}

/** One popover on the page, at `where`: made as its component starts. */
export class PopoverSeat<S extends Held> {
  readonly #parked: ParkedPopover<S>;
  readonly #where: () => string;
  /** The closed surface's flight into its row, while bits-ui still draws it. */
  #flight: Animation | undefined;
  surface = $state<HTMLElement | null>(null);
  /** It stands open here: where it was opened, or in the header when that place is gone. */
  readonly open = $derived.by(() => {
    const held = this.#parked.draft.value;
    const where = this.#where();
    return (
      held.open &&
      (held.at === where ||
        (where === "head" && (this.#parked.mounted[held.at] ?? 0) === 0))
    );
  });

  constructor(parked: ParkedPopover<S>, where: () => string) {
    this.#parked = parked;
    this.#where = where;
    onMount(() => {
      const at = where();
      parked.mounted[at] = (parked.mounted[at] ?? 0) + 1;
      return () => {
        parked.mounted[at] = (parked.mounted[at] ?? 1) - 1;
      };
    });
    // Opened again while its flight still runs (its trigger, or the row's
    // Open): it turns back, whole, before it is drawn.
    $effect.pre(() => {
      if (this.open) {
        this.#flight?.cancel();
        this.#flight = undefined;
      }
    });
  }

  /**
   * Closes at once, and the surface travels into `row` as it goes (The One
   * Object Rule): bits-ui keeps a closed surface drawn until its animations
   * end, the flight among them. The close never waits on the flight, so a
   * reload or a press made during it finds the popover already shut.
   */
  closeOnto(row: HTMLElement | null): void {
    this.#flight?.cancel();
    this.#flight =
      this.surface && row ? closeInto(this.surface, row) : undefined;
    this.#parked.draft.value.open = false;
    this.#parked.fromRow = null;
  }

  /**
   * ×, Esc or a press outside: the popover goes, the work stays. With a row
   * to follow it travels into that row; with none, into its trigger.
   */
  setOpen = (next: boolean): void => {
    const held = this.#parked.draft.value;
    if (next) {
      held.at = this.#where();
      held.open = true;
      return;
    }
    this.closeOnto(held.asked === null ? null : rowOf(held.asked));
  };
}
