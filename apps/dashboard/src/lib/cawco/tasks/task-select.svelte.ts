/**
 * The tasks picked for a bulk change, shared by the board's cards, the
 * table's rows and the bar that acts on them.
 */
export const selection = $state({
  ids: [] as string[],
  /** The last row ticked, for a shift-click range. */
  anchor: null as string | null,
});

export const isPicked = (id: string): boolean => selection.ids.includes(id);

/** Ticks or unticks one; with `range`, every id between the anchor and it. */
export function pickTask(id: string, on: boolean, range?: string[]): void {
  if (range && selection.anchor && range.includes(selection.anchor)) {
    const from = range.indexOf(selection.anchor);
    const to = range.indexOf(id);
    const span = range.slice(Math.min(from, to), Math.max(from, to) + 1);
    selection.ids = on
      ? [...new Set([...selection.ids, ...span])]
      : selection.ids.filter((each) => !span.includes(each));
  } else {
    selection.ids = on
      ? [...new Set([...selection.ids, id])]
      : selection.ids.filter((each) => each !== id);
  }
  selection.anchor = id;
}

export function pickAll(ids: string[], on: boolean): void {
  selection.ids = on ? [...ids] : [];
  selection.anchor = null;
}

export function clearPicks(): void {
  selection.ids = [];
  selection.anchor = null;
}
