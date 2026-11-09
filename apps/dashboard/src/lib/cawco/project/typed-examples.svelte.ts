/**
 * New project's placeholder typing its examples once, then resting
 * (decision page `onboarding-design`, card `describe-hint`, the person's
 * pick): each example types in a letter every `--dur-type`, holds for one
 * `--breath`, and erases at half the pace (exits run faster than
 * entrances), then the next types in; after the last it types the resting
 * placeholder and lands there, and nothing moves after (DESIGN.md: "Nothing
 * moves after it has landed unless it is live work").
 *
 * It runs only while `running()` holds (the field empty, the tab shown,
 * motion allowed); stopped, the placeholder is the resting words at once,
 * and it starts again at the next example. The field's name for a screen
 * reader is the page's question, never these words (Composer `label`).
 */
import { dur, motionOk } from "#lib/platform/motion/curves.svelte.js";
import { msOf } from "#lib/platform/motion/time.js";

/** `--breath` in ms, read from the root. */
const breathMs = (): number =>
  msOf(getComputedStyle(document.documentElement).getPropertyValue("--breath"));

export class TypedExamples {
  /** What the placeholder shows now. */
  text = $state("");
  /** The tab is in view: a hidden tab types nothing. */
  #shown = $state(true);
  /** It has gone through every example: it rests from now on. */
  #landed = false;
  /** The example the next run starts at. */
  #next = 0;
  readonly #examples: readonly string[];
  readonly #rest: string;

  constructor(examples: readonly string[], rest: string) {
    this.#examples = examples;
    this.#rest = rest;
    this.text = rest;
  }

  /** Whether it may move now: the tab shown and motion allowed. */
  get moving(): boolean {
    return this.#shown && motionOk.current && !this.#landed;
  }

  /**
   * Types while `running()` holds and it may move; call it from an effect
   * and hand back the stop it returns.
   */
  run(running: boolean): () => void {
    const seen = () => {
      this.#shown = document.visibilityState === "visible";
    };
    seen();
    document.addEventListener("visibilitychange", seen);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", seen);
    };
    if (!(running && this.moving)) {
      this.text = this.#rest;
      return stop;
    }
    const letter = dur("--dur-type");
    const hold = breathMs();
    const type = (words: string, then: () => void, at = 0) => {
      this.text = words.slice(0, at);
      timer =
        at < words.length
          ? setTimeout(() => type(words, then, at + 1), letter)
          : setTimeout(then, hold);
    };
    const erase = (then: () => void) => {
      if (this.text.length === 0) {
        then();
        return;
      }
      this.text = this.text.slice(0, -1);
      timer = setTimeout(() => erase(then), letter / 2);
    };
    const step = () => {
      if (this.#next >= this.#examples.length) {
        this.#landed = true;
        type(this.#rest, () => undefined);
        return;
      }
      const words = this.#examples[this.#next];
      this.#next += 1;
      type(words, () => erase(step));
    };
    this.text = "";
    step();
    return stop;
  }
}
