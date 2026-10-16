/**
 * What the hub found for the filter's words: its list's `q` (tasks.ts
 * `saying`), which matches a task's id, title or description. The rows the
 * page holds carry no description, so the words are the hub's to match,
 * never the page's; the filter's other parts are matched on the rows
 * (task-filter.ts).
 *
 * The views always show the last answer the hub gave, so they never show a
 * guess. Words taken out need no read: the views are unnarrowed at once.
 * New words keep the last answer on screen until theirs lands (`finding`
 * says one is out); a later read's answer replaces an earlier one, and an
 * answer for words since changed is dropped. The answer is read again
 * whenever the page reads its list again, since a description another hand
 * changed changes what the words find. A refusal keeps the last answer and
 * says why in the hub's words (`problem`), for Try again.
 */
import { failureWords } from "#lib/cawco/hub-read.js";
import { findTasks } from "#lib/cawco/project-tasks.js";

/** An answer: the words it was for, and the ids of the tasks, live and archived, they found. */
export interface Found {
  ids: ReadonlySet<string>;
  words: string;
}

/** What the page's load read for the URL's words: their answer, or why the hub gave none. */
export interface FindSeed {
  found: Found | null;
  problem: string | null;
  words: string;
}

/** The words as the hub reads them (`q.trim()`); case is the hub's to set aside. */
export const wordsOf = (q: string): string => q.trim();

export class TaskFind {
  /** The answer the views narrow by; null: no words stand, nothing is narrowed. */
  shown = $state<Found | null>(null);
  /** Why the newest read did not answer, in the hub's words; null while none failed. */
  problem = $state<string | null>(null);
  /** A read for words the shown answer is not for is out. */
  finding = $state(false);
  /** The words asked for last, read again by `again`. */
  #asked = "";
  /** Reads so far: only the newest one's answer is kept. */
  #reads = 0;
  readonly #project: () => string;

  constructor(project: () => string, seed: FindSeed) {
    this.#project = project;
    this.reset(seed);
  }

  /** Another project, or the page's first answer (its load's), in place of what stood. */
  reset(seed: FindSeed): void {
    this.#reads += 1;
    this.shown = seed.found;
    this.problem = seed.problem;
    this.finding = false;
    this.#asked = seed.words;
  }

  /** The ids the views keep for the filter's words; null: the words narrow nothing. */
  get ids(): ReadonlySet<string> | null {
    return this.shown?.ids ?? null;
  }

  /** Asks the hub what `q` finds; words taken out unnarrow the views at once. */
  async find(q: string): Promise<void> {
    const words = wordsOf(q);
    this.#reads += 1;
    const ticket = this.#reads;
    this.#asked = words;
    if (!words) {
      this.shown = null;
      this.problem = null;
      this.finding = false;
      return;
    }
    this.finding = this.shown?.words !== words;
    const project = this.#project();
    try {
      const [live, archived] = await Promise.all([
        findTasks(project, words),
        findTasks(project, words, true),
      ]);
      if (ticket !== this.#reads) {
        return;
      }
      this.shown = {
        words,
        ids: new Set([...live.tasks, ...archived.tasks].map((task) => task.id)),
      };
      this.problem = null;
    } catch (error) {
      if (ticket === this.#reads) {
        this.problem = failureWords(error);
      }
    } finally {
      if (ticket === this.#reads) {
        this.finding = false;
      }
    }
  }

  /**
   * The words asked for last, read again: the list changed, or Try again.
   * With none asked, it leaves the views unnarrowed, as they are.
   */
  again(): Promise<void> {
    return this.find(this.#asked);
  }
}
