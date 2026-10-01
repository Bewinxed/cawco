/**
 * Which of Working and Finished the home shows, kept per browser the way
 * folder-prefs keeps a shut folder: the sidebar and the phone's home read
 * the one answer. Working until the reader picks.
 */
import { readJson, writeJson } from "../storage";

export type WorkTab = "working" | "finished";

const KEY = "whiffle-home-tab";

const stored = readJson<unknown>(KEY, "working");
const state = $state<{ tab: WorkTab }>({
  tab: stored === "finished" ? "finished" : "working",
});

export const workTab = {
  get current(): WorkTab {
    return state.tab;
  },
  set(tab: WorkTab): void {
    state.tab = tab;
    writeJson(KEY, tab);
  },
};
