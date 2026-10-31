/**
 * One visit's judging, the part every structure shares under its own face:
 * the review (kept state, settings, remarks) and the live move runner,
 * with the gestures that move between states. Keeping a state changes the
 * one live component's args, so its own motion plays (The One Object Rule);
 * a scrub keeps the move's destination and holds the move at the finger;
 * a let-go lands on the nearer whole state.
 */
import { dur } from "#lib/cawco/motion/curves.svelte.js";
import { MoveRunner } from "./moves.svelte";
import { Review, SEQUENCE } from "./review.svelte";

const pause = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

export class Judge extends Review {
  runner = new MoveRunner();
  /** Each move's measured length, by `from>to`, once it has played. */
  lengths = $state<Record<string, number>>({});
  /** The move the runner holds: the one into the kept state. */
  move = $state<{ from: string; to: string } | null>(null);
  /** The move a scrub holds, from its first press to its let-go: the surface keeps its control standing meanwhile. */
  scrubbing = $state<{ from: string; to: string } | null>(null);
  /** Play the steps: walking the sequence on its own. */
  walking = $state(false);
  #walk = 0;

  async #land(to: string, from: string | null, hold = false): Promise<void> {
    this.runner.reduced = this.reduced;
    this.keep(to);
    this.move = from ? { from, to } : null;
    await this.runner.capture(hold);
    if (from) {
      this.lengths = { ...this.lengths, [`${from}>${to}`]: this.runner.length };
    }
  }

  /** Keeps a state; the move into it plays where the file declares one from the state left. */
  async go(to: string): Promise<void> {
    if (to === this.kept) {
      return;
    }
    const from = this.kept;
    this.runner.finish();
    await this.#land(to, from);
  }

  /** Plays a move from its start: its first state stands at once, then the move runs. */
  async play(from: string, to: string): Promise<void> {
    this.runner.finish();
    if (this.kept !== from) {
      await this.#land(from, null);
      this.runner.finish();
    }
    await this.#land(to, from);
  }

  /** A scrub begins on the move from `from` into `to`: `to` is kept, held at its first frame. */
  async scrubStart(from: string, to: string): Promise<void> {
    this.scrubbing = { from, to };
    this.runner.finish();
    if (this.kept !== from) {
      await this.#land(from, null);
      this.runner.finish();
    }
    await this.#land(to, from, true);
  }

  scrub(fraction: number): void {
    this.runner.hold(fraction);
  }

  /** A let-go lands on the nearer whole state. */
  async scrubEnd(fraction: number): Promise<void> {
    const move = this.scrubbing ?? this.move;
    this.scrubbing = null;
    this.runner.finish();
    if (move && fraction < 0.5) {
      await this.#land(move.from, null);
      this.runner.finish();
    }
  }

  /** One step along the sequence, or to either end. */
  async step(delta: number): Promise<void> {
    const at = Math.max(0, this.at);
    const next =
      SEQUENCE[Math.max(0, Math.min(SEQUENCE.length - 1, at + delta))];
    if (next) {
      await this.go(next);
    }
  }

  async end(which: "first" | "last"): Promise<void> {
    const to = which === "first" ? SEQUENCE[0] : SEQUENCE.at(-1);
    if (to) {
      await this.go(to);
    }
  }

  /** Play the steps: every step from here to the last, each move played, each state held a beat. */
  async walkAll(): Promise<void> {
    this.#walk += 1;
    const run = this.#walk;
    this.walking = true;
    if (this.at < 0 || this.at === SEQUENCE.length - 1) {
      await this.#land(SEQUENCE[0] as string, null);
      this.runner.finish();
      await pause(dur("--dur-hold"));
    }
    while (run === this.#walk && this.at < SEQUENCE.length - 1) {
      const from = this.kept;
      const to = SEQUENCE[this.at + 1] as string;
      await this.#land(to, from);
      await pause(Math.max(this.runner.length, 0) + dur("--dur-hold"));
    }
    if (run === this.#walk) {
      this.walking = false;
    }
  }

  stopWalk(): void {
    this.#walk += 1;
    this.walking = false;
  }

  lengthOf(from: string, to: string): number | null {
    return this.lengths[`${from}>${to}`] ?? null;
  }
}
