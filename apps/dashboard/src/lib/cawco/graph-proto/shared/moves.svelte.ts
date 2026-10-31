/**
 * The move into a state, read off the live component itself: when the
 * stage's args change, the column animates by its own code (its reflow's
 * Web Animations, its count's text swap, its ticks' transitions), and every
 * animation that change started is a clip of the move. The runner holds
 * them: it plays them, holds them at any moment (the scrub), and lets them
 * finish, so the thing dragged is the thing that changes (Rive's transition
 * scrub). Nothing here is drawn by hand: a clip's element, property, start,
 * length and curve are the running animation's own.
 */
import { type ClipKind, kindOfClip } from "@cawco/core/design-graph";
import { humanize } from "@cawco/core/tool-presentation";
import { graphProtoWords as words } from "@cawco/core/words/graph-proto";
import { tick } from "svelte";

export interface ProtoClip {
  curve: string;
  /** The element in words. */
  element: string;
  kind: ClipKind;
  /** Its length, delay excluded, in ms. */
  length: number;
  property: string;
  /** Its start, the delay, in ms. */
  start: number;
}

const frame = () =>
  new Promise<void>((done) => requestAnimationFrame(() => done()));

/** An animation's target in words: its card by the task it shows, the count, else its slot. */
function wordsOf(target: Element | null): string {
  if (!target) {
    return words.clipColumn;
  }
  const item = target.closest("li[data-flip]");
  const id =
    target.closest("[data-task]")?.getAttribute("data-task") ??
    item?.querySelector("[data-task]")?.getAttribute("data-task");
  if (id) {
    return words.clipCard(id);
  }
  if (target.closest("[data-slot=count]")) {
    return words.clipCount;
  }
  const slot = target.closest("[data-slot]")?.getAttribute("data-slot");
  return slot ? humanize(slot) : words.clipColumn;
}

function propertyOf(animation: Animation): string {
  if (animation instanceof CSSTransition) {
    return animation.transitionProperty;
  }
  if (animation instanceof CSSAnimation) {
    return animation.animationName;
  }
  const { effect } = animation;
  if (effect instanceof KeyframeEffect) {
    const keys = new Set(
      effect
        .getKeyframes()
        .flatMap((one) =>
          Object.keys(one).filter(
            (key) =>
              !["offset", "easing", "composite", "computedOffset"].includes(key)
          )
        )
    );
    return [...keys].join(", ") || "transform";
  }
  return "transform";
}

const endOf = (animation: Animation): number =>
  Number(animation.effect?.getComputedTiming().endTime ?? 0);

export class MoveRunner {
  /** The stage's box the live component stands in. */
  root: HTMLElement | null = null;
  /** The clips the last move fired. */
  clips = $state.raw<ProtoClip[]>([]);
  /** The move's whole length, in ms; 0 when it animated nothing. */
  length = $state(0);
  /** Where the move stands, in ms. */
  at = $state(0);
  /** Whether it is playing on its own. */
  running = $state(false);
  /** Whether it is held at `at`. */
  held = $state(false);
  /** Less motion: every move lands at once. */
  reduced = $state(false);
  #animations: Animation[] = [];
  #loop = 0;

  /** Reads what the change just made started; `hold` stops it at its first frame. */
  async capture(hold = false): Promise<void> {
    await tick();
    await frame();
    await frame();
    const { root } = this;
    if (!root) {
      return;
    }
    this.#animations = root
      .getAnimations({ subtree: true })
      // A move's clips run on the document's clock and end: a scroll-driven
      // animation (the column's edge fade) or a looping one is no clip.
      .filter(
        (one) =>
          one.playState !== "finished" &&
          one.timeline === document.timeline &&
          Number.isFinite(endOf(one))
      );
    this.clips = this.#animations.map((one) => {
      const timing = one.effect?.getComputedTiming();
      const property = propertyOf(one);
      const target =
        one.effect instanceof KeyframeEffect ? one.effect.target : null;
      return {
        element: wordsOf(target),
        property,
        kind: kindOfClip(property.split(",")[0]?.trim() ?? "", false),
        start: Number(timing?.delay ?? 0),
        length: Number(timing?.duration ?? 0) || 0,
        curve: String(timing?.easing ?? "linear"),
      };
    });
    this.length = Math.max(0, ...this.#animations.map(endOf));
    if (this.reduced) {
      this.finish();
      return;
    }
    if (hold) {
      this.hold(0);
      return;
    }
    this.#follow();
  }

  /** Holds every clip at a fraction of the move. */
  hold(fraction: number): void {
    cancelAnimationFrame(this.#loop);
    this.running = false;
    this.held = true;
    this.at = Math.max(0, Math.min(1, fraction)) * this.length;
    for (const one of this.#animations) {
      if (one.playState === "finished") {
        continue;
      }
      one.pause();
      one.currentTime = Math.min(this.at, endOf(one));
    }
  }

  /** Lets a held move play on from where it stands. */
  resume(): void {
    this.held = false;
    for (const one of this.#animations) {
      if (one.playState === "paused") {
        one.play();
      }
    }
    this.#follow();
  }

  /** Lands the move on its end at once. */
  finish(): void {
    cancelAnimationFrame(this.#loop);
    for (const one of this.#animations) {
      if (one.playState !== "finished") {
        try {
          one.finish();
        } catch {
          one.cancel();
        }
      }
    }
    this.running = false;
    this.held = false;
    this.at = this.length;
  }

  #follow(): void {
    cancelAnimationFrame(this.#loop);
    this.running = this.length > 0;
    const step = () => {
      const live = this.#animations.filter(
        (one) => one.playState === "running"
      );
      this.at = Math.max(
        0,
        ...this.#animations.map((one) => Number(one.currentTime ?? 0))
      );
      if (live.length === 0) {
        this.running = false;
        this.at = this.length;
        return;
      }
      this.#loop = requestAnimationFrame(step);
    };
    this.#loop = requestAnimationFrame(step);
  }
}
