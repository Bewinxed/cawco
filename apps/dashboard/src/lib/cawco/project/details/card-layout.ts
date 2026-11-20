/**
 * The project details card's layouts, while the owner picks one (the three
 * Gemini proposed to fit a 1024×768 laptop, 2026-11-20, beside the card as
 * it ships): each a placement of the same five sections and the control
 * form each section takes there. The card takes its layout as a prop
 * (DetailsCard `layout`) and tells its sections through context, so the
 * one picked becomes the card and the rest delete with this file's entries.
 */
import { getContext, setContext } from "svelte";

/**
 * - `stacked`: the card as it ships, two columns in rows, 760 px (920 on a
 *   wide shell), 44 px between sections.
 * - `two-columns`: two independent columns, 820 px: Files and locations
 *   over Task list; AI account over Finished code over Codebases and big
 *   files; 24 px between sections.
 * - `three-columns`: three columns, 940 px: Files over Codebases; AI
 *   account over Finished code; Task list alone; 28 px between sections.
 * - `bands`: three bands, 780 px: Files beside Task list; Finished code
 *   across; AI account beside Codebases; 24 px between sections.
 */
export type CardLayout = "stacked" | "two-columns" | "three-columns" | "bands";

/** How each section is drawn in a layout. */
export interface LayoutForms {
  /** Finished code's four options: 2×2 tiles, rows, or one strip of four. */
  finished: "tiles" | "rows" | "strip";
  /** Finished code's head and its line on one line. */
  finishedInline: boolean;
  /** The room round each section's hairline: 44 px (`wide`), 28 (`roomy`), 24 (`tight`). */
  rule: "wide" | "roomy" | "tight";
  /** Codebases and big files: its two parts side by side, or stacked in its column with big files' options as two tiles. */
  storage: "parts" | "compact";
  /** The connected service's facts: one fact a line, or three tiers. */
  sync: "full" | "tight";
  /** Task list's three options: tiles, two-line rows, or one-line rows. */
  tasks: "tiles" | "rows" | "lines";
}

const LAYOUT_FORMS: Record<CardLayout, LayoutForms> = {
  stacked: {
    rule: "wide",
    tasks: "tiles",
    sync: "full",
    finished: "tiles",
    finishedInline: false,
    storage: "parts",
  },
  "two-columns": {
    rule: "tight",
    tasks: "lines",
    sync: "tight",
    finished: "tiles",
    finishedInline: false,
    storage: "compact",
  },
  "three-columns": {
    rule: "roomy",
    tasks: "rows",
    sync: "full",
    finished: "rows",
    finishedInline: false,
    storage: "compact",
  },
  bands: {
    rule: "tight",
    tasks: "lines",
    sync: "tight",
    finished: "strip",
    finishedInline: true,
    storage: "compact",
  },
};

const KEY = Symbol("details-card-layout");

/** The card says its layout to the sections under it. */
export const provideCardLayout = (layout: () => CardLayout): void => {
  setContext(KEY, layout);
};

/** The forms of the card's layout, read as it stands; the shipping card's outside one. */
export const cardForms = (): (() => LayoutForms) => {
  const layout = getContext<(() => CardLayout) | undefined>(KEY);
  return () => LAYOUT_FORMS[layout?.() ?? "stacked"];
};

const CHOSEN = Symbol("details-card-layout-chosen");

/** A mount of the card (a layout's live story) names the layout the card hung under it takes. */
export const chooseCardLayout = (layout: () => CardLayout): void => {
  setContext(CHOSEN, layout);
};

/** The layout a mount above named; the shipping card's where none did. */
export const chosenCardLayout = (): (() => CardLayout) => {
  const layout = getContext<(() => CardLayout) | undefined>(CHOSEN);
  return () => layout?.() ?? "stacked";
};
