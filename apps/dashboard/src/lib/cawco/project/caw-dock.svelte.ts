/**
 * Whether Caw's dock stands open beside a project's page, per project and
 * kept across visits, so the conversation stays beside you while you work
 * the board. This browser's own, in localStorage as SideSplit keeps its
 * width: the server never draws the dock, so no first-paint cookie is owed.
 */
import { browser } from "$app/env";

const key = (projectId: string) => `cawco.caw-dock.${projectId}`;

/**
 * What stands at the dock's foot before the first send. The design (Caw
 * assistant §1) has CawField, the session Composer taking over once a
 * thread exists; ThreadPane already writes a thread's first message from
 * the Composer (`thread:new:<project>`). PREVIEW ONLY: the owner picks one
 * on /motion/caw-assistant and the build keeps that one path.
 */
export type CawDockFoot = "field" | "composer";

class CawDock {
  readonly #open = $state<Record<string, boolean>>({});
  foot = $state<CawDockFoot>("field");

  /** Read in a template: what was set here, else what was kept. */
  isOpen(projectId: string): boolean {
    return (
      this.#open[projectId] ??
      (browser && localStorage.getItem(key(projectId)) === "1")
    );
  }

  set(projectId: string, open: boolean): void {
    this.#open[projectId] = open;
    if (open) {
      localStorage.setItem(key(projectId), "1");
    } else {
      localStorage.removeItem(key(projectId));
    }
  }

  toggle(projectId: string): void {
    this.set(projectId, !this.isOpen(projectId));
  }
}

export const cawDock = new CawDock();
