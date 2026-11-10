import { motionOk } from "#lib/platform/motion/curves.svelte.js";
import { scrollMotion } from "#lib/platform/motion/keyed.svelte.js";
import type { Ticket } from "./arrivals.svelte";
import { SCROLL_KEYS } from "./scroll-pin.svelte";

/** Within this many screens of the tail the jump scrolls there smoothly;
      past it, it lands at once. Our own call, no source sets it. */
const JUMP_SMOOTH_SCREENS = 3;
export interface JumpToLatestHost {
  readonly arrivals: {
    readonly tickets: Map<string, Ticket>;
  };
  readonly landing: {
    readonly landInFrame: () => void;
  };
  readonly pin: {
    atBottom: boolean;
    farFromLatest: boolean;
    readonly pinBottom: () => void;
    restsAtTail: boolean | null;
    readonly scroller: HTMLElement | undefined;
    readonly stopFollow: () => void;
    tailMark: number | null;
    readonly tailTop: (node: HTMLElement) => number;
  };
}

export class JumpToLatest {
  readonly #host: JumpToLatestHost;

  /**
   * The jump's scroll is under way. Its scroll events are not the reader's,
   * and `atBottom` stays false until it ends so that no follow or landing
   * writes over it: a `scrollTop` write stops a smooth scroll where it is.
   */
  jumping: boolean;

  /** Where the jump's smooth scroll was sent. */
  jumpTarget: number | null = null;

  /**
   * Back to the newest row, from wherever the reader is: one smooth scroll
   * to the tail when it is within `JUMP_SMOOTH_SCREENS`, otherwise — or
   * under reduced motion — an instant landing there. Arriving pins the true
   * tail (`jumpScrolled`). The reader's own input takes the scroll back.
   */
  jump = (): void => {
    this.#host.arrivals.tickets.clear();
    this.#host.pin.farFromLatest = false;
    const node = this.#host.pin.scroller;
    if (!(
      node &&
      motionOk.current &&
      this.#host.pin.tailTop(node) - node.scrollTop <=
        JUMP_SMOOTH_SCREENS * node.clientHeight
    )) {
      // Landed in the click itself, not in `land`'s next frame: a re-armed
      // `land` (the rows effect) can push that frame back one more.
      this.#host.pin.atBottom = true;
      this.#host.landing.landInFrame();
      return;
    }
    this.#host.pin.stopFollow();
    this.#host.pin.restsAtTail = null;
    this.#host.pin.tailMark = null;
    this.jumping = true;
    node.addEventListener("wheel", this.yieldJump, { passive: true });
    node.addEventListener("touchstart", this.yieldJump, { passive: true });
    node.addEventListener("pointerdown", this.yieldJump);
    node.addEventListener("keydown", this.yieldKey);
    this.glide();
  };

  /** One smooth scroll to the bottom as it stands now. */
  glide(): void {
    const node = this.#host.pin.scroller;
    if (!(this.jumping && node)) {
      return;
    }
    const bottom = this.#host.pin.tailTop(node);
    if (bottom - node.scrollTop <= 1) {
      this.arrive();
      return;
    }
    this.jumpTarget = bottom;
    node.scrollTo({ top: bottom, behavior: scrollMotion(true) });
  }

  /**
   * A scroll event of the jump's: arrived once it reaches the target it was
   * sent to, or the bottom when the rows shrank under it. Rows that grew the
   * bottom past the target while it scrolled get one more smooth scroll.
   */
  jumpScrolled(node: HTMLElement): void {
    if (this.jumpTarget === null) {
      return;
    }
    const bottom = this.#host.pin.tailTop(node);
    const top = node.scrollTop;
    if (Math.abs(top - this.jumpTarget) > 1 && top < bottom - 1) {
      return;
    }
    if (bottom - top > 1) {
      this.glide();
      return;
    }
    this.arrive();
  }

  /** The jump is over: at the latest row, pinned there. */
  arrive(): void {
    this.endJump();
    this.#host.pin.atBottom = true;
    this.#host.pin.farFromLatest = false;
    this.#host.pin.pinBottom();
  }

  endJump(): void {
    this.jumping = false;
    this.jumpTarget = null;
    this.#host.pin.scroller?.removeEventListener("wheel", this.yieldJump);
    this.#host.pin.scroller?.removeEventListener("touchstart", this.yieldJump);
    this.#host.pin.scroller?.removeEventListener("pointerdown", this.yieldJump);
    this.#host.pin.scroller?.removeEventListener("keydown", this.yieldKey);
  }

  /**
   * The reader's own input during a jump: the jump lets go where the view
   * is, and the reader's next scroll decides `atBottom` and the button.
   * The write stops a smooth scroll a click would not; it is untagged, so
   * its event is read as the reader's.
   */
  yieldJump = (): void => {
    this.endJump();
    this.#host.pin.scroller?.scrollTo({
      top: this.#host.pin.scroller.scrollTop,
      behavior: "instant",
    });
  };

  yieldKey = (event: KeyboardEvent): void => {
    if (SCROLL_KEYS.has(event.key)) {
      this.yieldJump();
    }
  };

  constructor(host: JumpToLatestHost) {
    this.#host = host;
    this.jumping = false;
  }
}
