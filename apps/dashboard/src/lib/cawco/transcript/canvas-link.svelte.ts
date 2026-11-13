/**
 * The composer's hold on its canvas: the draft's drawing, standing over the
 * field. A conversation's composer has a room for it (canvas-room.svelte.ts,
 * handed in by the fleet); this binds the room to the draft the composer is
 * handed, to the panel that can take the canvas, and to the window it
 * stands in, and answers the key that opens and folds it.
 */
import { untrack } from "svelte";
import { handBack, stages } from "../canvas/stage.svelte";
import type { CanvasRoom } from "./canvas-room.svelte";
import type { ComposerDraft } from "./composer-draft.svelte";
import type { ComposerFleet } from "./composer-fleet";

/** ⌘⇧D (Ctrl+Shift+D): the canvas opens, or folds when it stands. */
const isCanvasKey = (event: KeyboardEvent) =>
  event.shiftKey &&
  (event.metaKey || event.ctrlKey) &&
  !event.altKey &&
  event.key.toLowerCase() === "d";

export interface CanvasLinkParts {
  /** The composer is an ask: its keys are the ask's. */
  askOpen: () => boolean;
  /** The whole dock: the column the canvas stands in. */
  dock: () => HTMLElement | undefined;
  draft: () => ComposerDraft;
  field: () => HTMLDivElement | null;
  fleet: () => ComposerFleet | undefined;
  paneVisible: () => boolean;
  pill: () => HTMLElement | undefined;
  /** The wheel is up (the canvas key and Escape leave it alone), and puts itself away when asked to. */
  recalling: () => boolean;
  /** The conversation the canvas is made in and sent to. */
  recallOf: () => string | undefined;
  shell: () => HTMLElement | undefined;
  wheelBack: () => void;
}

export class CanvasLink {
  /** The composer's box (chips, notice, pill), whose top the canvas stands on. */
  column = $state<HTMLElement>();
  /** The canvas's box over the field, while it stands there. */
  canvasSlot = $state<HTMLElement>();
  /** The canvas's chip, while it is folded. */
  canvasChip = $state<HTMLElement>();
  /** The canvas's room: a conversation's composer has one (`chat`); a comment's reply draws none. */
  readonly room: CanvasRoom | null;
  readonly #parts: CanvasLinkParts;
  /** The canvas stands over the field, or is on its way up or down: the grown shape is the composer. */
  readonly up = $derived.by(() => this.room?.up ?? false);
  /** Its box over the field is laid out while the draft's canvas stands there. */
  readonly stands = $derived.by(() => {
    const { canvas } = this.#parts.draft();
    return this.up && !!canvas && !canvas.folded;
  });

  constructor(parts: CanvasLinkParts) {
    this.#parts = parts;
    const Room = untrack(() => parts.fleet()?.CanvasRoom);
    this.room = Room
      ? new Room({
          column: () => this.column,
          dock: parts.dock,
          draft: parts.draft,
          field: () => parts.field() ?? undefined,
          chip: () => this.canvasChip,
          pill: parts.pill,
          session: parts.recallOf,
          shell: parts.shell,
          slot: () => this.canvasSlot,
        })
      : null;
    const { room } = this;

    // The composer handed another conversation's draft: this one's canvas goes,
    // the new one's stands if it was standing.
    let canvasDraft: ComposerDraft | undefined;
    $effect(() => {
      if (!room) {
        return;
      }
      const next = parts.draft();
      untrack(() => {
        if (canvasDraft !== undefined && canvasDraft !== next) {
          room.rebind();
        } else if (
          canvasDraft === undefined &&
          next.canvas &&
          !next.canvas.folded
        ) {
          room.rebind();
        }
        canvasDraft = next;
      });
    });
    // The panel gives a canvas back (Undock, or Done while docked).
    $effect(() => {
      const asked = handBack.ask;
      if (!(room && asked) || asked.instanceId !== parts.recallOf()) {
        return;
      }
      untrack(() => {
        handBack.ask = null;
        room.takeBack(asked);
      });
    });
    // The panel shows the canvas standing here (picked from its list): it is the panel's.
    $effect(() => {
      const { canvas } = parts.draft();
      const id = canvas?.id;
      const stage = id ? stages.get(id) : undefined;
      if (room && stage?.at === "panel" && !canvas?.folded) {
        untrack(() => room.yielded());
      }
    });
    $effect(() => {
      if (!room) {
        return;
      }
      const refit = () => room.refit();
      window.addEventListener("resize", refit);
      return () => {
        window.removeEventListener("resize", refit);
        room.destroy();
      };
    });
  }

  key(event: KeyboardEvent): boolean {
    const { room } = this;
    if (
      !(room && this.#parts.recallOf() && isCanvasKey(event)) ||
      this.#parts.askOpen()
    ) {
      return false;
    }
    event.preventDefault();
    if (this.#parts.recalling()) {
      this.#parts.wheelBack();
    }
    room.toggle();
    return true;
  }

  /**
   * The key reaches the composer from anywhere in its group: the field,
   * its chips, the page around it. Escape folds a standing canvas.
   */
  windowKey = (event: KeyboardEvent): void => {
    const dock = this.#parts.dock();
    if (event.defaultPrevented || !this.#parts.paneVisible() || !dock) {
      return;
    }
    const at = document.activeElement;
    const ours =
      !at ||
      at === document.body ||
      !!dock.closest('[data-slot="leaf"]')?.contains(at);
    if (!ours || at === this.#parts.field()) {
      return;
    }
    if (this.key(event)) {
      return;
    }
    if (event.key === "Escape" && this.up && !this.#parts.recalling()) {
      event.preventDefault();
      this.room?.fold();
    }
  };
}
