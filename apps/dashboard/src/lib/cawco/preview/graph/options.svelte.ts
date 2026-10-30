/**
 * The design graph's open taste calls (the primitives spec §7), each built
 * both ways so the owner can flip between them on the live product and pick.
 * Every call stands at the spec's recommendation; the switches that flip
 * them (GraphOptions.svelte) are drawn only on a page opened with
 * `?graph-options` in its address, never in the product's own paths. Once
 * he has picked, the losing side of each call and this file go.
 */

/**
 * Each open call and its sides, each named for the reference it comes
 * from (design/graph-controls-references.md); the first is the
 * recommendation. A call the references settled stands at its side with
 * no switch (`settled`), its reason in the references file.
 */
export const GRAPH_CALLS = {
  bar: {
    title: "1 · The steps bar",
    sides: [
      ["field", "Dessn: one field, the name and 3/6 inside it"],
      ["scrubber", "Apple Books: dots, the name in a bubble"],
      ["player", "Sentry replay: ‹ name ›, its line scrubs"],
    ],
  },
  wide: {
    title: "2 · A wide window",
    sides: [
      ["row", "Dessn's flow: every state that fits, in order"],
      ["pair", "The kept state and the hovered one"],
    ],
  },
  countFigure: {
    title: "3 · The count's figure",
    sides: [
      ["field", "Dessn: “Cards … 12 of 60” inside the field"],
      ["beside", "Apple Books: “12 of 60” beside the slider"],
    ],
  },
  otherPins: {
    title: "Pins on other states",
    settled: true,
    sides: [
      ["hidden", "Hidden, grouped in the rail"],
      ["dimmed", "Dimmed on the page"],
    ],
  },
  nodePill: {
    title: "A node pin’s pill",
    settled: true,
    sides: [
      ["corner", "At the node's top-right"],
      ["name", "At the node's name"],
    ],
  },
  phoneBand: {
    title: "4 · A phone's graph names its section",
    sides: [
      ["pinned", "iOS large title: a slab's name in the bar once scrolled out"],
      ["band", "iOS Contacts: a sticky band naming the section in view"],
    ],
  },
} as const;

export type GraphCall = keyof typeof GRAPH_CALLS;
type SideOf<C extends GraphCall> = (typeof GRAPH_CALLS)[C]["sides"][number][0];
type Sides = { [C in GraphCall]: SideOf<C> };

const RECOMMENDED = Object.fromEntries(
  Object.entries(GRAPH_CALLS).map(([call, one]) => [call, one.sides[0][0]])
) as Sides;

/** The sides `?graph-options=call:side,…` names, each one a call holds. */
function namedSides(): Partial<Sides> {
  if (typeof location === "undefined") {
    return {};
  }
  const named = new URLSearchParams(location.search).get("graph-options") ?? "";
  return Object.fromEntries(
    named.split(",").flatMap((pair) => {
      const [call, side] = pair.split(":");
      const one = GRAPH_CALLS[call as GraphCall];
      return one?.sides.some(([value]) => value === side) ? [[call, side]] : [];
    })
  );
}

/** Each call's side standing now: the recommendation, unless the Options panel flipped it. */
class GraphOptions {
  /** The recommendation, else the sides the address names (`?graph-options=bar:player,wide:pair`), so a side opens cold. */
  sides = $state<Sides>({ ...RECOMMENDED, ...namedSides() });

  /** The Options panel is drawn: the page was opened with `?graph-options`. */
  get shown(): boolean {
    return (
      typeof location !== "undefined" &&
      new URLSearchParams(location.search).has("graph-options")
    );
  }

  set<C extends GraphCall>(call: C, side: SideOf<C>): void {
    this.sides = { ...this.sides, [call]: side };
  }
}

/** The calls still open, the ones the Options panel draws a switch for. */
export const OPEN_CALLS = (
  Object.entries(GRAPH_CALLS) as [GraphCall, (typeof GRAPH_CALLS)[GraphCall]][]
).filter(([, one]) => !("settled" in one));

export const graphOptions = new GraphOptions();
