/**
 * What the composer stands over the transcript's foot, told to the pane it
 * is lent to (its fade and its "Jump to latest" rest on it), and the sizes
 * that make it up: the panel's own height, the delegate tray's standing on
 * it, and the prompt stack's standing on that (what the desk's toasts rise
 * above). Each of these sizes is read as its box mounts, and a change in
 * the next frame (frameSize).
 */
import { frameSize } from "#lib/platform/frame-observer.js";
import { stand } from "./composer-presence.svelte";

/**
 * What a composer stands over the transcript's foot, in px: `stack`, the
 * panel with the tray row and what stands on it, or the grown ask when it
 * reaches higher; `parked`,
 * what stands higher than the panel and its tray row (0 with nothing).
 * What floats out of the composer (the tray's shelf and panel, the `/`
 * and `@` menu, the recall wheel) is in none of them: a layer over the
 * transcript's foot, never a size the transcript is told.
 */
export interface ComposerFoot {
  parked: number;
  stack: number;
}

export interface DockFootParts {
  /** How high the grown ask stands over the composer's foot; 0 with none up. */
  askRise: () => number;
  /** The find line's drawn height on the pill and the places' over it. */
  findHeight: () => number;
  /** Find stands open on the pill. */
  finding: () => boolean;
  /** What it stands over the transcript's foot, told to the pane it is lent to. */
  onfoot: () => ((foot: ComposerFoot) => void) | undefined;
  paneVisible: () => boolean;
  /** The prompt stack's height, standing on the tray row. */
  stack: () => number;
}

export class DockFoot {
  panel = $state(0);
  lift = $state(0);
  /** The plan's ring's width: the delegate tray's row keeps clear of it. */
  ringWidth = $state(0);
  readonly measurePanel = frameSize(
    (node: HTMLElement) => node.clientHeight,
    (value) => {
      this.panel = value;
    }
  );
  readonly measureLift = frameSize(
    (node: HTMLElement) => node.clientHeight,
    (value) => {
      this.lift = value;
    }
  );
  readonly measureRing = frameSize(
    (node: HTMLElement) => node.clientWidth,
    (value) => {
      this.ringWidth = value;
    }
  );
  readonly #parts: DockFootParts;
  /** What the composer stands over the transcript's foot, all told. */
  readonly standing = $derived.by(() =>
    Math.max(
      this.panel + this.lift + this.#parts.stack(),
      this.#parts.askRise()
    )
  );

  constructor(parts: DockFootParts) {
    this.#parts = parts;

    // On screen, this composer is what the desk's toasts rise above.
    const presence = {};
    $effect(() => {
      if (parts.paneVisible()) {
        return stand(presence, this.standing);
      }
    });
    // What stands over the transcript's foot, told to the pane it is lent to
    // (its fade and its "Jump to latest" rest on it).
    $effect(() => {
      parts.onfoot()?.({
        stack: this.standing,
        // What find grows out of the composer stands over the foot too: its
        // line on the pill and its places over it, so the transcript's end
        // reads above them.
        parked:
          this.standing -
          this.panel -
          this.lift +
          (parts.finding() ? parts.findHeight() : 0),
      });
    });
  }
}
