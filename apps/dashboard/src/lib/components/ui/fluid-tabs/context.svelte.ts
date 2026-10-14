/**
 * Shared state for the Fluid Functionalism tabs: which value is chosen and
 * in what order the items sit (the root), and where each item sits in the
 * track (the list). Set by the root and the list, read by the items; the
 * order is the items' own order in the track (TabRects), kept as they
 * arrive, leave and move.
 */
import { getContext, setContext } from "svelte";
import { SvelteMap } from "svelte/reactivity";
import type { FoldMeasure } from "./fold-memory";
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
  variant = $state<TabsVariant>("segmented");
  /** Each folder tab's shape as last measured, by value (fold-memory.ts). */
  boxes = $state.raw<Readonly<Record<string, FoldMeasure>>>({});
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

/**
 * A folder tab's place in the track's stack at rest, 1 the farthest back:
 * the chosen tab on top, then each tab above those farther from it, the
 * nearer the first; with none chosen (`chosen` -1) the first on top. It is
 * drawn from the order and the value alone, so the first render (the
 * server's too) stacks the tabs before anything is measured; the track
 * ranks the same way while a switch runs (TabsList).
 */
export function restRank(count: number, chosen: number, at: number): number {
  const top = Math.max(chosen, 0);
  const depth = (i: number) => (i === chosen ? 0 : 1);
  const distance = (i: number) => Math.abs(i - top);
  let rank = 1;
  for (let i = 0; i < count; i += 1) {
    const before =
      depth(i) > depth(at) ||
      (depth(i) === depth(at) &&
        (distance(i) > distance(at) ||
          (distance(i) === distance(at) && i < at)));
    if (i !== at && before) {
      rank += 1;
    }
  }
  return rank;
}

export class TabsListState {
  rects: TabRects;
  /** Where the indicator is drawn — moved on click, ahead of the value. */
  optimisticIndex = $state<number | null>(null);
  focusedIndex = $state<number | null>(null);
  /**
   * A folder tab's sides whose foot a tab above it covers where the two are
   * drawn now (start, end), by its item (TabsList `fold`): those draw no
   * foot (TabItem).
   */
  folds = new SvelteMap<HTMLElement, readonly [boolean, boolean]>();

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
