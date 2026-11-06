/**
 * The thing in the air follows the hand on a spring, never pinned to it: a
 * dnd kit modifier (DragProvider) that draws it where a spring toward the
 * pointer has carried it. Carried steadily it trails the hand a little (at
 * a steady speed v, by `T·v/π`: 13px at a brisk 0.5px/ms), and when the hand
 * stops it catches up and comes to rest under it, so it reads as a thing
 * with weight that floats, not a cut-out stuck to the cursor.
 *
 * The spring is the house's, critically damped (motion/spring, no bounce),
 * at a perceptual duration of its own, --dur-drag-follow (80ms): the
 * house's --dur-settle (400ms) on a follow left a card 130px behind a
 * brisk hand, which reads as lag, not weight. Stepped every frame on the
 * pointer's raw travel, it writes only what dnd kit draws (`transform`),
 * so the collisions, the drop's flight and the scroll at an edge all read
 * the thing where it is drawn.
 *
 * What is drawn is where the spring has carried it, and nothing else: it
 * moves only on the spring's frame. dnd kit asks for the transform again on
 * every pointer move, between frames; drawn there as the hand's travel less
 * the last frame's lag, a steady glide was drawn a step ahead on each move
 * and put back on the spring's curve a frame later, a pixel or two back
 * every other frame, the thing trembling under the hand.
 *
 * Where the reader asked for less motion, and for a drag the keys carry
 * (each press is a step, The Frequency Rule), it is pinned to the hand.
 */
import type { DragOperation } from "@dnd-kit/abstract";
import { Modifier } from "@dnd-kit/abstract";
import type { DragDropManager } from "@dnd-kit/dom";
import { signal, untracked } from "@dnd-kit/state";
import { dur, motionOk } from "../motion/curves.svelte";
import { springForces } from "../motion/spring";

/** A point or a travel, in px. */
type Point = DragOperation["transform"];

/** Within this of the hand, in px, and as slow as this, in px/s: at rest under it. */
const REST = 0.25;
const REST_SPEED = 5;
/** The longest step the spring takes in one frame, in s: a frame dropped is not a leap. */
const STEP_MAX = 1 / 30;

export class Follow extends Modifier<DragDropManager> {
  /** Where the spring has carried the thing, in the pointer's travel (px); null while it is pinned to the hand. */
  readonly #at = signal<Point | null>(null);

  constructor(manager: DragDropManager) {
    super(manager);
    this.registerEffect(() => {
      const { dragOperation } = this.manager;
      if (!dragOperation.status.dragging) {
        this.#at.value = null;
        return;
      }
      const keys = untracked(
        () => dragOperation.activatorEvent instanceof KeyboardEvent
      );
      if (keys || !motionOk.current) {
        return;
      }
      return this.#spring();
    });
  }

  /** Steps the spring each frame until the drag ends; returns its stop. */
  #spring(): () => void {
    // Critically damped (the house's no bounce): damping is twice the
    // natural frequency, so each frame is stepped by the spring's own
    // solution, which holds at any frame rate (a stepped integration at
    // 80ms ran away on a 60Hz frame).
    const { stiffness } = springForces(dur("--dur-drag-follow"));
    const omega = Math.sqrt(stiffness);
    const hand = () =>
      untracked(() => this.manager.dragOperation.position.delta);
    // Where it is drawn and how fast it moves, in the pointer's travel.
    const at = { ...hand() };
    const speed = { x: 0, y: 0 };
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(this: void, now: number) {
      step(now);
      frame = requestAnimationFrame(tick);
    });
    const step = (now: number) => {
      // A frame's time can stand before the clock this started on: never a step back.
      const dt = Math.max(0, Math.min((now - last) / 1000, STEP_MAX));
      last = now;
      const to = hand();
      const decay = Math.exp(-omega * dt);
      const axis = (key: "x" | "y") => {
        const off = at[key] - to[key];
        const sum = speed[key] + omega * off;
        at[key] = to[key] + (off + sum * dt) * decay;
        speed[key] = (speed[key] - omega * sum * dt) * decay;
        if (
          Math.abs(at[key] - to[key]) < REST &&
          Math.abs(speed[key]) < REST_SPEED
        ) {
          at[key] = to[key];
          speed[key] = 0;
        }
      };
      axis("x");
      axis("y");
      const was = this.#at.peek();
      if (was?.x !== at.x || was?.y !== at.y) {
        this.#at.value = { ...at };
      }
    };
    return () => cancelAnimationFrame(frame);
  }

  /**
   * The thing drawn where the spring has it: the transform less the hand's
   * travel (what other modifiers add), plus the spring's place.
   */
  override apply({ transform }: { transform: Point }): Point {
    const at = this.#at.value;
    if (!at) {
      return transform;
    }
    const hand = this.manager.dragOperation.position.delta;
    return {
      x: transform.x - hand.x + at.x,
      y: transform.y - hand.y + at.y,
    };
  }
}
