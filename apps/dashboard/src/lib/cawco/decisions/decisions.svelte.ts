/**
 * A project's decision pages as its page holds them (hub decisions.ts): the
 * list the Decisions tab draws and its strip's count reads, read on
 * arrival and again whenever the hub says the pages or the tasks moved
 * (`decisions.changed`, `tasks.changed`), on a reconnect and when the tab
 * comes back. Only the newest read's answer is kept.
 */

import type { DecisionsList } from "@cawco/core/decisions";
import { failureWords } from "#lib/platform/hub-read.js";
import { newestRead } from "#lib/platform/newest-read.js";
import { listDecisions } from "./decisions-api";

export class ProjectDecisions {
  /** The pages, each with the pages it links to; null until first read. */
  list = $state<DecisionsList | null>(null);
  /** Why the last read failed, in the hub's words; null when it read. */
  problem = $state<string | null>(null);
  readonly #project: () => string;
  readonly #reads = newestRead();

  constructor(project: () => string) {
    this.#project = project;
  }

  /** Pages still waiting for picks: the tab's trail. */
  get waiting(): number {
    return (
      this.list?.pages.filter((page) => page.state === "picking").length ?? 0
    );
  }

  async read(): Promise<void> {
    const projectId = this.#project();
    if (!projectId) {
      return;
    }
    const newest = this.#reads.next();
    try {
      const list = await listDecisions(projectId);
      if (newest() && projectId === this.#project()) {
        this.list = list;
        this.problem = null;
      }
    } catch (error) {
      if (newest() && projectId === this.#project()) {
        this.problem = failureWords(error);
      }
    }
  }
}
