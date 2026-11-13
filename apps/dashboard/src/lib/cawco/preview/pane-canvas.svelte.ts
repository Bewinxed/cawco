/**
 * A canvas artifact's stage, held while it stands in this panel: the stage's one iframe over the well's slot, Undock and Done.
 */
import { untrack } from "svelte";
import { frameObserver } from "#lib/platform/frame-observer.js";
import { handBack, holdStage, letGo, type Stage } from "../canvas/stage.svelte";
import type { PaneSubject } from "./pane-subject.svelte";

export interface PaneCanvasDeps {
  /** A Comment on the canvas's ink: its composer is this panel's (page-wire.svelte.ts `heardComposer`). */
  readonly composer: (data: unknown) => void;
  /** A comment on the canvas's ink is being written: its composer stands over the canvas's own layer. */
  readonly composing: () => boolean;
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

  /**
   * A canvas's box on the screen while a comment on its ink is written: its
   * stage's fixed layer (CanvasStages), over the panel's slot, which the
   * composer's room stands over.
   */
  canvasBox = $state<{
    h: number;
    w: number;
    x: number;
    y: number;
  } | null>(null);

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
          // A Comment on the canvas's ink opens this panel's composer, as a page's does.
          composer: (data) => this.#deps.composer(data),
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
    $effect(() => {
      const node =
        this.#deps.paneSubject.isCanvas && this.#deps.composing()
          ? this.stage?.el
          : undefined;
      if (!node) {
        this.canvasBox = null;
        return;
      }
      const measure = () => {
        const box = node.getBoundingClientRect();
        this.canvasBox = {
          x: box.left,
          y: box.top,
          w: box.width,
          h: box.height,
        };
      };
      const watch = frameObserver(measure);
      watch.observe(node);
      measure();
      return () => watch.disconnect();
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
