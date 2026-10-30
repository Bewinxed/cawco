/**
 * The design graph's open taste calls (the primitives spec §7), each built
 * both ways so the owner can flip between them on the live product and pick.
 * Every call stands at the spec's recommendation; the switches that flip
 * them (GraphOptions.svelte) are drawn only on a page opened with
 * `?graph-options` in its address, never in the product's own paths. Once
 * he has picked, the losing side of each call and this file go.
 */

/** Each open call and its two sides; the first is the spec's recommendation. */
export const GRAPH_CALLS = {
  slider: {
    title: "1 · The slider's look",
    sides: [
      ["track", "Named stops on a track"],
      ["segments", "A segmented control of the names"],
    ],
  },
  switchAt: {
    title: "2 · Where Steps | Graph lives",
    sides: [
      ["bar", "In the panel's glass bar"],
      ["menu", "In the head's canvas-view menu"],
    ],
  },
  pairSteps: {
    title: "3 · Ultrawide pair on Steps",
    sides: [
      ["yes", "The hovered stop beside the kept page"],
      ["no", "The kept page alone"],
    ],
  },
  phoneSteps: {
    title: "4 · Many steps on a phone",
    sides: [
      ["scroll", "The track scrolls, every stop named"],
      ["dots", "Dots, the kept name alone"],
    ],
  },
  countFigure: {
    title: "5 · The count's figure",
    sides: [
      ["beside", "“12 of 60” beside the slider"],
      ["end", "“12”, with “of 60” at the track's end"],
    ],
  },
  otherPins: {
    title: "6 · Pins on other states",
    sides: [
      ["hidden", "Hidden, grouped in the rail"],
      ["dimmed", "Dimmed on the page"],
    ],
  },
  nodePill: {
    title: "7 · A node pin's pill",
    sides: [
      ["corner", "At the node's top-right"],
      ["name", "At the node's name"],
    ],
  },
  dials: {
    title: "8 · Dials beside record controls",
    sides: [
      ["keep", "Keep number, colour, select, toggle"],
      ["records", "Only the record controls"],
    ],
  },
  phoneBand: {
    title: "9 · A phone's graph names its section",
    sides: [
      ["pinned", "A slab's name, only while its top is scrolled out"],
      ["band", "A band always naming the section in view"],
    ],
  },
} as const;

export type GraphCall = keyof typeof GRAPH_CALLS;
type SideOf<C extends GraphCall> = (typeof GRAPH_CALLS)[C]["sides"][number][0];
type Sides = { [C in GraphCall]: SideOf<C> };

const RECOMMENDED = Object.fromEntries(
  Object.entries(GRAPH_CALLS).map(([call, one]) => [call, one.sides[0][0]])
) as Sides;

/** Each call's side standing now: the recommendation, unless the Options panel flipped it. */
class GraphOptions {
  sides = $state<Sides>({ ...RECOMMENDED });

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

export const graphOptions = new GraphOptions();
