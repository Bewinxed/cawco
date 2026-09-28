/**
 * Shared state for the Fluid Functionalism tabs: which value is chosen and
 * in what order the items sit (the root), and where each item sits in the
 * track (the list). Set by the root and the list, read by the items; the
 * order is the items' own order in the track (TabRects), kept as they
 * arrive, leave and move.
 */
import { getContext, setContext } from "svelte";
import type { TabRects } from "./rects.svelte";

export type TabsSize = "default" | "compact";
/** A segmented control in a well, or folder tabs standing on a shelf. */
export type TabsVariant = "segmented" | "folder";
/**
 * The indicator part-way from the chosen item toward another, by a fraction
 * of the way: a gesture in progress, driving it by hand.
 */
export interface TabsTravel {
  fraction: number;
  toward: string;
}

export class TabsState {
  order = $state<string[]>([]);
  uncontrolled = $state<string | undefined>(undefined);
  controlled = $state<string | undefined>(undefined);
  selectedIndex = $state<number | undefined>(undefined);
  size = $state<TabsSize>("default");
  travel = $state<TabsTravel | null>(null);
  onValueChange: ((value: string) => void) | undefined;
  onSelect: ((index: number) => void) | undefined;

  constructor(defaultValue: string | undefined) {
    this.uncontrolled = defaultValue;
  }

  /** value > selectedIndex > uncontrolled > the first item. */
  get value(): string | undefined {
    if (this.controlled !== undefined) {
      return this.controlled;
    }
    if (this.selectedIndex !== undefined) {
      return this.order[this.selectedIndex];
    }
    return this.uncontrolled ?? this.order[0];
  }

  select(value: string): void {
    if (this.controlled === undefined && this.selectedIndex === undefined) {
      this.uncontrolled = value;
    }
    this.onValueChange?.(value);
    if (this.onSelect) {
      const index = this.order.indexOf(value);
      if (index !== -1) {
        this.onSelect(index);
      }
    }
  }

  setOrder(next: string[]): void {
    const same =
      next.length === this.order.length &&
      next.every((v, i) => v === this.order[i]);
    if (!same) {
      this.order = next;
    }
  }
}

export class TabsListState {
  rects: TabRects;
  /** Where the indicator is drawn — moved on click, ahead of the value. */
  optimisticIndex = $state<number | null>(null);
  focusedIndex = $state<number | null>(null);

  constructor(rects: TabRects) {
    this.rects = rects;
  }
}

const TABS = Symbol("fluid-tabs");
const LIST = Symbol("fluid-tabs-list");

export function provideTabs(state: TabsState): void {
  setContext(TABS, state);
}
export function useTabs(): TabsState {
  return getContext<TabsState>(TABS);
}
export function provideList(state: TabsListState): void {
  setContext(LIST, state);
}
export function useList(): TabsListState {
  return getContext<TabsListState>(LIST);
}
