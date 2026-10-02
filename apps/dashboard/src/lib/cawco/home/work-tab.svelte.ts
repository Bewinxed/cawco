/**
 * Which of Working and Finished the home shows, and which machines' groups
 * in each show all their rows rather than their first few, kept per browser
 * the way folder-prefs keeps a shut folder: the sidebar and the phone's home
 * read the one answer. Working, and the first few, until the reader picks.
 */
import { SvelteSet } from "svelte/reactivity";
import { readJson, writeJson } from "../storage";

export type WorkTab = "working" | "finished";

const KEY = "cawco-home-tab";
const ALL_KEY = "cawco-home-tab-all";

const stored = readJson<unknown>(KEY, "working");
const storedAll = readJson<Partial<Record<WorkTab, unknown>>>(ALL_KEY, {});
/** A tab's machines shown whole, as stored: a list of machine ids. */
const machinesOf = (value: unknown): SvelteSet<string> =>
  new SvelteSet(
    Array.isArray(value)
      ? value.filter((id): id is string => typeof id === "string")
      : []
  );
const state = $state<{ tab: WorkTab }>({
  tab: stored === "finished" ? "finished" : "working",
});
const whole: Record<WorkTab, SvelteSet<string>> = {
  working: machinesOf(storedAll.working),
  finished: machinesOf(storedAll.finished),
};

export const workTab = {
  get current(): WorkTab {
    return state.tab;
  },
  set(tab: WorkTab): void {
    state.tab = tab;
    writeJson(KEY, tab);
  },
  /** The machines whose group in `tab` lists every row, not its first few. */
  shownWhole(tab: WorkTab): ReadonlySet<string> {
    return whole[tab];
  },
  setShownWhole(tab: WorkTab, machineId: string, all: boolean): void {
    if (all) {
      whole[tab].add(machineId);
    } else {
      whole[tab].delete(machineId);
    }
    writeJson(ALL_KEY, {
      working: [...whole.working],
      finished: [...whole.finished],
    });
  },
};
