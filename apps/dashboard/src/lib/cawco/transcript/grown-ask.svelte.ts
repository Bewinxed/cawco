/**
 * A parked ask (a permission, a question) is the composer itself while it
 * waits. The composer grows up out of its pill into the ask's
 * card: the shape the recall wheel and a queued edit grow (grown.ts), its
 * sides straight and its top solid, since an ask has no rows leaning back
 * and no oldest row fading out. What stands over the pill (the delegate
 * tray, the plan's ring, the suggestion chips, an offer) steps
 * aside while it is up, so nothing covers it, and so do the pill's own
 * controls and the attachments: the only controls in the composer are the
 * ask's. The card stands on the shell's foot, over the pill, so no empty
 * band is left under it; the shape keeps the pill's measured height as its
 * foot and reaches the rest of the card's height above it. The draft stays
 * in the field, unseen and untouched. Answered, dismissed or withdrawn, the
 * ask folds back into the pill and the draft and its attachments are as they
 * were;
 * the next ask waiting takes its place in the grown shape without folding,
 * its parts staggering in again.
 *
 * A question the reader has minimized (minimized-asks.svelte.ts) is not
 * grown: the shape folds back into the pill exactly as for an answer, the
 * tray row and the pill's controls come back, and the question stands as a
 * one-line bar over the tray row (`asked`) until the bar is pressed, when
 * the composer grows into it again. Nothing is answered either way: the
 * ask stays parked on the hub, as it does on iOS, where the pill stays
 * writable under a parked card.
 */

import { questionsOf } from "@cawco/core/question";
import type { PermissionResult } from "@cawco/core/session-messages";
import { tick, untrack } from "svelte";
import { frameObserver } from "#lib/platform/frame-observer.js";
import { dur, motionOk } from "#lib/platform/motion/curves.svelte.js";
import { minimizedAsks } from "../minimized-asks.svelte";
import type { PendingPermission } from "../stores/sessions.svelte";
import type { ComposerDraft } from "./composer-draft.svelte";
import { GrownShape, layoutScale, measureShape } from "./grown";

/**
 * The ask a conversation has parked on its composer, the first of those
 * waiting: the composer grows into it until it is answered or withdrawn.
 */
export interface ComposerAsk {
  /** Who asks, as the conversation names its agent ("Caw" in a project's conversation). */
  asker: string;
  /** How many more asks wait behind this one. */
  more: number;
  /** Submits its answer; the id of the command it went out as (Prompt). */
  onanswer: (result: PermissionResult) => string | null;
  /**
   * A browser ask taken over from here that a delegate asked: the hub
   * opened the browser in that delegate's panel, and this takes the
   * person there (Prompt).
   */
  ontaken?: () => void;
  request: PendingPermission;
}

export interface GrownAskParts {
  /** The ask parked on this conversation, which the composer grows into; none with none. */
  ask: () => ComposerAsk | null;
  /** The whole dock: the column the ask stands in. */
  dock: () => HTMLElement | undefined;
  draft: () => ComposerDraft;
  field: () => HTMLDivElement | null;
  pill: () => HTMLFormElement | undefined;
  /** What else grows out of the pill puts itself away: the ask has it. */
  putAway: () => void;
  shell: () => HTMLElement | undefined;
}

export class GrownAsk {
  /** The minimized question's bar. */
  askedChip = $state<HTMLButtonElement>();
  /** The ask the shape holds: it trails `ask` while one changes into the next. */
  drawnAsk = $state<ComposerAsk | null>(null);
  /** Grown, or growing, into an ask: what stands over the pill steps aside. */
  askRaised = $state(false);
  /** Whether what stands in the shape is up. */
  askShown = $state(false);
  /**
   * The grown shape's measures: the pill's height when it grew (the shape's
   * foot, held for the whole ask), how far over it the card reaches, and the
   * room the card has.
   */
  askBox = $state<{
    base: number;
    ext: number;
    max: number;
  } | null>(null);
  askPanel = $state<HTMLElement>();
  readonly #parts: GrownAskParts;
  /** The questions the parked ask puts, if it is a question. */
  readonly askQuestions = $derived.by(() => {
    const ask = this.#parts.ask();
    return ask ? questionsOf(ask.request.toolName, ask.request.input) : null;
  });
  /** The parked ask can fold to its bar: a question. */
  readonly askParks = $derived(!!this.askQuestions);
  /** The parked ask is one the reader minimized here. */
  readonly minimized = $derived.by(() => {
    const ask = this.#parts.ask();
    return !!(ask && this.askParks && minimizedAsks.has(ask.request.requestId));
  });
  /** The ask the composer grows into: the parked one, unless it is minimized. */
  readonly grownAsk = $derived.by(() =>
    this.minimized ? null : this.#parts.ask()
  );
  /** The composer is an ask, from its growth until its fold has landed. */
  readonly askOpen = $derived(!!this.drawnAsk);
  readonly askId = $derived(this.grownAsk?.request.requestId ?? null);
  readonly askPlace = $derived.by(() => {
    const { grownAsk, drawnAsk } = this;
    return grownAsk &&
      drawnAsk?.request.requestId === grownAsk.request.requestId
      ? {
          at: this.#parts.draft().askRun + 1,
          of: this.#parts.draft().askRun + 1 + grownAsk.more,
        }
      : null;
  });
  /** How high the grown ask stands over the composer's foot; 0 with none up. */
  readonly askRise = $derived(
    this.askRaised && this.askBox ? this.askBox.base + this.askBox.ext : 0
  );
  #askShape: GrownShape | null = null;
  /** The newest change of ask; an older one still landing leaves it be. */
  #askTurn = 0;
  /** The field had the keys when the ask came up: it has them back after. */
  #askRefocus: boolean;

  constructor(parts: GrownAskParts) {
    this.#parts = parts;
    this.#askRefocus = false;

    $effect(() => {
      const id = this.askId;
      if (!(parts.shell() && parts.pill() && parts.field())) {
        return;
      }
      untrack(() => {
        const drawn = this.drawnAsk?.request.requestId ?? null;
        if (id === drawn && (id === null || this.askRaised)) {
          return;
        }
        this.#askTurn += 1;
        const { grownAsk } = this;
        if (!grownAsk) {
          // Minimized, the question folds away but is still parked: the
          // keys stay where the reader put them, on the bar.
          if (this.minimized) {
            this.#askRefocus = false;
          }
          this.#foldAsk(this.#askTurn);
        } else if (this.drawnAsk) {
          this.#switchAsk(grownAsk, this.#askTurn);
        } else {
          this.#growAsk(grownAsk, this.#askTurn);
        }
      });
    });

    // The card grows (a disclosure opened, a refusal said under its buttons)
    // and the window resizes: the shape follows.
    $effect(() => {
      const node = this.askPanel;
      if (!node) {
        return;
      }
      // In the next frame (frameObserver): the fit eases the shape to the
      // card over --duration-fade, which resizes it.
      const sizes = frameObserver(() => {
        if (this.askRaised) {
          this.#fitAsk(dur("--duration-fade"));
        }
      });
      sizes.observe(node);
      const remeasure = () => {
        if (this.askBox) {
          this.askBox.max = this.#askRoom();
        }
      };
      window.addEventListener("resize", remeasure);
      return () => {
        sizes.disconnect();
        window.removeEventListener("resize", remeasure);
      };
    });

    $effect(() => () => {
      this.#askShape?.remove();
      this.#askShape = null;
    });
  }

  async minimizeAsk(): Promise<void> {
    const ask = this.#parts.ask();
    if (!ask) {
      return;
    }
    // Keys that were in the card follow it onto its bar; a finger's swipe
    // leaves focus where it was, so no ring is drawn under a touch.
    const keys = !!this.askPanel?.contains(document.activeElement);
    minimizedAsks.set(ask.request.requestId, true);
    await tick();
    if (keys) {
      this.askedChip?.focus();
    }
  }

  restoreAsk(): void {
    const ask = this.#parts.ask();
    if (ask) {
      minimizedAsks.set(ask.request.requestId, false);
    }
  }

  /** The room over the pill the ask can stand in, under the pane's top. */
  #askRoom(): number {
    const dockEl = this.#parts.dock();
    const shell = this.#parts.shell();
    if (!(dockEl && shell)) {
      return 0;
    }
    const gap = Number.parseFloat(
      getComputedStyle(shell).getPropertyValue("--spacing-space-8")
    );
    const { top } = dockEl.getBoundingClientRect();
    // In the layout's px: the panel may still be rising out of its scale.
    const over = (shell.getBoundingClientRect().top - top) / layoutScale(shell);
    return Math.max(0, over - gap);
  }

  /** The shape takes the card's height, from wherever it is drawn. */
  #fitAsk(ms: number, force = false): void {
    if (!(this.#askShape && this.askPanel && this.askBox)) {
      return;
    }
    const ext = this.askPanel.offsetHeight - this.askBox.base;
    if (!force && Math.abs(ext - this.askBox.ext) < 0.5) {
      return;
    }
    this.askBox.ext = ext;
    this.#askShape.morphTo(1, ext, ms);
  }

  async #growAsk(next: ComposerAsk, turn: number): Promise<void> {
    const { field, pill, shell } = this.#parts;
    const shellEl = shell();
    const pillEl = pill();
    const fieldEl = field();
    if (!(shellEl && pillEl && fieldEl)) {
      return;
    }
    // Every size first, before anything is written: one layout per growth.
    const { size } = measureShape(shellEl, pillEl, fieldEl);
    const max = this.#askRoom();
    // What else grows out of the pill puts itself away: the ask has it.
    this.#parts.putAway();
    if (document.activeElement === fieldEl) {
      this.#askRefocus = true;
      fieldEl.blur();
    }
    // A run goes on through a minimize and a composer drawn again: the
    // card stood up again is the same question, at the same place in the
    // same run ("2 of 3", never "1 of 2" on its way back up), its count
    // kept by its conversation's draft.
    this.askBox = { base: size.base, ext: 0, max };
    this.drawnAsk = next;
    this.askRaised = true;
    await tick();
    if (turn !== this.#askTurn || !this.askPanel) {
      return;
    }
    // The card stands on the shell's foot: the pill's height is its own.
    const ext = this.askPanel.offsetHeight - size.base;
    this.askBox.ext = ext;
    const shape = new GrownShape(shellEl, size, ext, {
      taper: false,
      fade: false,
    });
    this.#askShape = shape;
    // The card comes up from inside the shape, never above its edge.
    shape.clip(this.askPanel, () => ({
      left: 0,
      bottom: 0,
      height: (this.askBox?.base ?? 0) + (this.askBox?.ext ?? 0),
    }));
    shape.morphTo(1, ext, dur("--duration-panel"));
    // Partway up, once there is room for it.
    setTimeout(
      () => {
        if (turn === this.#askTurn) {
          this.askShown = true;
        }
      },
      motionOk.current ? dur("--duration-control") : 0
    );
  }

  /** The next ask waiting takes the shape's place, grown: no fold between. */
  async #switchAsk(next: ComposerAsk, turn: number): Promise<void> {
    const same = this.drawnAsk?.request.requestId === next.request.requestId;
    this.askRaised = true;
    if (!same) {
      this.#parts.draft().askRun += 1;
      this.askShown = false;
      if (motionOk.current) {
        await new Promise((done) => setTimeout(done, dur("--duration-exit")));
      }
      if (turn !== this.#askTurn) {
        return;
      }
      this.drawnAsk = next;
      await tick();
      if (turn !== this.#askTurn) {
        return;
      }
    }
    if (this.askBox) {
      this.askBox.max = this.#askRoom();
    }
    this.#fitAsk(dur("--duration-fade"), true);
    this.askShown = true;
  }

  /** Answered, dismissed or withdrawn: back into the pill. */
  async #foldAsk(turn: number): Promise<void> {
    this.askShown = false;
    this.askRaised = false;
    const shape = this.#askShape;
    if (shape) {
      // It folds into the pill as it stands now (a long draft folded to its
      // first line as the field let the keys go): the foot takes the pill's
      // height and the reach the rest, so the outline holds still meanwhile.
      const pill = this.#parts.pill();
      if (pill) {
        const base = pill.offsetHeight;
        shape.ext += shape.base - base;
        shape.base = base;
      }
      await shape.morphTo(0, shape.ext, dur("--duration-panel-exit"));
    }
    if (turn !== this.#askTurn) {
      return;
    }
    shape?.remove();
    this.#askShape = null;
    this.drawnAsk = null;
    this.askBox = null;
    // Minimized, the run is put down, not ended: its asks still wait.
    if (!this.minimized) {
      this.#parts.draft().askRun = 0;
    }
    if (this.#askRefocus) {
      this.#askRefocus = false;
      // Once the field's label is no longer inert: focus does not land in
      // an inert subtree, and the draft would stay folded to its first line.
      await tick();
      if (turn !== this.#askTurn) {
        // Another ask came up meanwhile: its fold gives the keys back.
        this.#askRefocus = true;
        return;
      }
      this.#parts.field()?.focus();
    }
  }
}
