/**
 * Which of Working and Finished the home shows, and whether each shows all
 * its rows or its first few, kept per browser the way folder-prefs keeps a
 * shut folder: the sidebar and the phone's home read the one answer.
 * Working, and the first few, until the reader picks.
 */
import { readJson, writeJson } from "../storage";

export type WorkTab = "working" | "finished";

const KEY = "whiffle-home-tab";
const ALL_KEY = "whiffle-home-tab-all";

const stored = readJson<unknown>(KEY, "working");
const storedAll = readJson<Partial<Record<WorkTab, unknown>>>(ALL_KEY, {});
const state = $state<{ tab: WorkTab; all: Record<WorkTab, boolean> }>({
  tab: stored === "finished" ? "finished" : "working",
  all: {
    working: storedAll.working === true,
    finished: storedAll.finished === true,
  },
});

export const workTab = {
  get current(): WorkTab {
    return state.tab;
  },
  set(tab: WorkTab): void {
    state.tab = tab;
    writeJson(KEY, tab);
  },
  /** Whether `tab` lists every row rather than its first few. */
  showsAll(tab: WorkTab): boolean {
    return state.all[tab];
  },
  setShowsAll(tab: WorkTab, all: boolean): void {
    state.all[tab] = all;
    writeJson(ALL_KEY, state.all);
  },
};
