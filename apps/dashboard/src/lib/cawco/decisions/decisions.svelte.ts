/**
 * A project's decision pages as its page holds them (hub decisions.ts): the
 * list the Decisions tab draws and its strip's count reads, read on
 * arrival and again whenever the hub says the pages or the tasks moved
 * (`decisions.changed`, `tasks.changed`), on a reconnect and when the tab
 * comes back. Only the newest read's answer is kept.
 */
import type { DecisionsList } from "@cawco/core/decisions";
import { failureWords } from "#lib/cawco/hub-read.js";
import { listDecisions } from "./decisions-api";

/** How the tab shows the pages: the tiles, or the graph they form. */
export type DecisionsMode = "list" | "graph";

export class ProjectDecisions {
  /** The pages and whether they form a graph; null until first read. */
  list = $state<DecisionsList | null>(null);
  /** Why the last read failed, in the hub's words; null when it read. */
  problem = $state<string | null>(null);
  readonly #project: () => string;
  #reads = 0;

  constructor(project: () => string) {
    this.#project = project;
  }

  /** Pages still waiting for picks: the tab's trail. */
  get waiting(): number {
    return this.list?.pages.filter((page) => page.state === "picking").length ?? 0;
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
