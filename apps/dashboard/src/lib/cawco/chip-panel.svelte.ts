/**
 * The house hover panel (HoverPanel) opened from an inline chip in written
 * words (ui/chip `inline`): a session's (SessionReference), a skill's
 * (SkillChip). Pressing the chip opens it to the chip's right, level with
 * it; a press outside the panel and the chip, Escape, or the chip scrolling
 * out of view puts it away; while the text scrolls, the panel keeps to its
 * chip. Opened from the keys, focus goes into it.
 *
 * Made while its component initialises: the listeners live as long as it.
 */
import { tick } from "svelte";
import { pressOutside } from "./press-outside";

/** A token's length in px, as the root computes it. */
const px = (name: string): number =>
  Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(name)
  );

export class ChipPanel {
  chip = $state<HTMLElement>();
  open = $state(false);
  place = $state({ x: 0, y: 0, origin: 0 });

  readonly #id: string;
  readonly #opening: (() => void) | undefined;

  /** `id` is the panel's element id; `opening` runs as it opens. */
  constructor(id: string, opening?: () => void) {
    this.#id = id;
    this.#opening = opening;
    $effect(() => {
      const at = this.chip;
      const panel = this.open ? document.getElementById(this.#id) : null;
      if (!(at && panel)) {
        return;
      }
      return this.#watch(at, panel);
    });
  }

  /**
   * The panel stands to the chip's right, level with it, pulled back inside
   * the viewport when the room there is narrower than the panel can grow
   * (a chip at a line's end, a phone), where it covers the chip.
   */
  #stand(at: HTMLElement): void {
    const box = at.getBoundingClientRect();
    const inset = px("--hover-panel-inset");
    const widest = Math.min(px("--hover-panel-max"), innerWidth - 2 * inset);
    this.place = {
      x: Math.round(
        Math.max(inset, Math.min(box.right + 4, innerWidth - widest - inset))
      ),
      y: Math.round(box.top),
      origin: Math.round(box.height / 2),
    };
  }

  press = async (event: MouseEvent): Promise<void> => {
    if (this.open || !this.chip) {
      this.open = false;
      return;
    }
    this.#stand(this.chip);
    this.#opening?.();
    this.open = true;
    // Opened from the keys (a click with no pointer), focus goes in with it.
    if (event.detail === 0) {
      await tick();
      const panel = document.getElementById(this.#id);
      (
        panel?.querySelector<HTMLElement>(
          '[data-slot="acts"] a, [data-slot="acts"] button'
        ) ?? panel
      )?.focus();
    }
  };

  close(refocus: boolean): void {
    this.open = false;
    if (refocus) {
      this.chip?.focus();
    }
  }

  #watch(at: HTMLElement, panel: HTMLElement): () => void {
    const stopPress = pressOutside(panel, (event) => {
      if (!(event.target instanceof Node && at.contains(event.target))) {
        this.close(false);
      }
    });
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        this.close(true);
      }
    };
    let frame = 0;
    const follow = (event: Event) => {
      if (
        frame ||
        (event.target instanceof Node && panel.contains(event.target))
      ) {
        return;
      }
      frame = requestAnimationFrame(() => {
        frame = 0;
        const box = at.getBoundingClientRect();
        if (!at.isConnected || box.bottom <= 0 || box.top >= innerHeight) {
          this.close(false);
          return;
        }
        this.#stand(at);
      });
    };
    window.addEventListener("keydown", key);
    window.addEventListener("scroll", follow, { capture: true, passive: true });
    return () => {
      stopPress();
      window.removeEventListener("keydown", key);
      window.removeEventListener("scroll", follow, { capture: true });
      cancelAnimationFrame(frame);
    };
  }
}
