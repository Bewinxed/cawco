/**
 * Where a PickRow stands, as its PickList says: a popover's listbox
 * (`list`), or a context menu's radio group (`menu`), where its option and
 * its force are the menu's own items. A row outside any PickList (the
 * model list's own) is a listbox's.
 */
import { createContext } from "svelte";

export type PickHost = "list" | "menu";

const [hostOf, setHost] = createContext<() => PickHost>();

/** The rows under here stand in `host`, read each time a row asks. */
export const providePickHost = (host: () => PickHost): void => {
  setHost(host);
};

/** Where the row asking stands: its PickList's host, else a listbox. */
export const pickHost = (): (() => PickHost) => {
  try {
    return hostOf();
  } catch {
    return () => "list";
  }
};
