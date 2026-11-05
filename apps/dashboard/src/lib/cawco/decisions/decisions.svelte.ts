/**
 * A project's decision pages as its page holds them (hub decisions.ts): the
 * list the Decisions tab draws and its strip's count reads, read on
 * arrival and again whenever the hub says the pages or the tasks moved
 * (`decisions.changed`, `tasks.changed`), on a reconnect and when the tab
 * comes back. Only the newest read's answer is kept.
 */

import { SETUP_PAGE } from "@cawco/core/artifact-needs";
import type { DecisionPageSummary, DecisionsList } from "@cawco/core/decisions";
import { failureWords } from "#lib/cawco/hub-read.js";
import { listDecisions } from "./decisions-api";

export class ProjectDecisions {
  /** The pages, each with the pages it links to; null until first read. */
  list = $state<DecisionsList | null>(null);
  /** Why the last read failed, in the hub's words; null when it read. */
  problem = $state<string | null>(null);
  readonly #project: () => string;
  #reads = 0;

  constructor(project: () => string) {
    this.#project = project;
  }

  async read(): Promise<void> {
    const projectId = this.#project();
    if (!projectId) {
      return;
    }
    this.#reads += 1;
    const ticket = this.#reads;
    try {
      const list = await listDecisions(projectId);
      if (ticket === this.#reads && projectId === this.#project()) {
        this.list = list;
        this.problem = null;
      }
    } catch (error) {
      if (ticket === this.#reads && projectId === this.#project()) {
        this.problem = failureWords(error);
      }
    }
  }
}

/**
 * The decision pages waiting on the person's picks, as Needs you counts
 * them (JOURNEY.md, Needs you is a mark: "a decision page with picks not
 * made or not sent"). While the project is not set up the setup page counts
 * only while a card on it is not picked: the draft in the board's place is
 * that page's Setup, and Set up waits on those cards (hub decisions.ts
 * `send`), which stand only on the page.
 */
export const pagesWaitingOf = (
  pages: readonly DecisionPageSummary[],
  notSetUp: boolean
): DecisionPageSummary[] =>
  pages.filter(
    (one) =>
      one.state === "picking" &&
      !(notSetUp && one.name === SETUP_PAGE && one.picked >= one.cards)
  );
