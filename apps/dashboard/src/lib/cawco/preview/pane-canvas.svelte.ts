/**
 * A canvas artifact's stage, held while it stands in this panel: the stage's one iframe over the well's slot, Undock and Done.
 */
import { untrack } from "svelte";
import { handBack, holdStage, letGo, type Stage } from "../canvas/stage.svelte";
import type { PaneSubject } from "./pane-subject.svelte";

export interface PaneCanvasDeps {
  readonly instanceId: () => string;
  readonly onScreen: () => boolean;
  readonly ownTab: () => boolean;
  readonly paneSubject: PaneSubject;
}
export class PaneCanvas {
  readonly #deps: PaneCanvasDeps;

  readonly holder = Symbol("panel");

  canvasSlot = $state<HTMLElement>();

  stage = $state<Stage>();

  /** This session's composer can take the canvas back: not a conversation's shown beside a thread, not its own tab. */
  readonly canUndock = $derived.by(
    () => this.#deps.paneSubject.isCanvas && !this.#deps.ownTab()
  );
  constructor(deps: PaneCanvasDeps) {
    this.#deps = deps;
    $effect(() => {
      const canvas = this.#deps.paneSubject.isCanvas
        ? this.#deps.paneSubject.artifact
        : undefined;
      const slot = this.canvasSlot;
      const session = this.#deps.instanceId();
      if (!(canvas && slot)) {
        return;
      }
      // Held, placed and stood here once per canvas and slot: what this reads
      // of the stages is what it writes, so none of it is a dependency.
      const held = untrack(() => {
        const one = holdStage(this.holder, session, canvas.id, canvas.name);
        this.stage = one;
        one.slots.panel = slot;
        one.actions.panel = {
          undock: () => this.giveBack(false),
          done: () => this.giveBack(true),
        };
        one.standAt("panel");
        one.changed();
        return one;
      });
      return () => {
        if (held.slots.panel === slot) {
          held.slots.panel = undefined;
          held.actions.panel = undefined;
          if (held.at === "panel") {
            held.standAt(null);
          }
        }
        letGo(this.holder, held.id);
        this.stage = undefined;
      };
    });
    /*
     * The canvas, standing in this panel while its conversation's tab is off
     * screen, is held as a page is (the overlay's hold.ts, in its host page);
     * it is never let go, as the stage keeps its one iframe wherever it stands.
     * Anywhere else (the tab in view, the canvas in the composer) it runs, and
     * a page loaded again while held (`connected` anew) is held again.
     */
    $effect(() => {
      const one = this.#deps.paneSubject.isCanvas ? this.stage : undefined;
      if (!one?.connected) {
        return;
      }
      one.post({
        type:
          !this.#deps.onScreen() && one.at === "panel"
            ? "cawco:hold"
            : "cawco:release",
      });
    });
  }

  /** Undock (or Done here): the session's composer takes the canvas back, open or as its chip. */
  giveBack(folded: boolean) {
    if (!(this.canUndock && this.#deps.paneSubject.artifact)) {
      return;
    }
    handBack.ask = {
      instanceId: this.#deps.instanceId(),
      id: this.#deps.paneSubject.artifact.id,
      name: this.#deps.paneSubject.artifact.name,
      folded,
    };
  }
}
