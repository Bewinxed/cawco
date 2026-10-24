/**
 * The reader's own messages as the three message-row drawings show them
 * (msgrow-frame.svelte and its states files): one message, a run of three,
 * a long one, and a failed one, with the design advisor's copy. Fixture data
 * for the drawings only; nothing here reaches a hub.
 */

/** One of the reader's messages, one part of a run. */
export interface RunPart {
  /** When it was said, as the hub records it. */
  at: string;
  content: string;
  /** Why it was not delivered: a failed send, its recovery at rest. */
  failed?: string;
  id: string;
}

/** What the canvas shows of the row: the moment a story stands at. */
export type RowMoment = "rest" | "hover" | "selected" | "tap" | "editing";

const at = (minute: number) => `2026-10-24T11:${minute}:00`;

export const ONE: RunPart[] = [
  {
    id: "u-crop",
    at: at(40),
    content: "And keep the screenshot crop, it reads better.",
  },
];

export const RUN: RunPart[] = [
  {
    id: "u-both",
    at: at(40),
    content: "Go ahead with both options, the short headline first.",
  },
  {
    id: "u-cta",
    at: at(41),
    content: "Also check the CTA colour against the design system.",
  },
  {
    id: "u-crop",
    at: at(42),
    content: "And keep the screenshot crop, it reads better.",
  },
];

export const LONG: RunPart[] = [
  {
    id: "u-hero",
    at: at(38),
    content:
      "The landing hero still reads like a spec sheet. Can you look at the headline, the button and the screenshot, and tell me which one carries it?",
  },
];

export const FAILED: RunPart[] = [
  {
    id: "u-crop-failed",
    at: at(40),
    content: "And keep the screenshot crop, it reads better.",
    failed: "Not delivered: the boundary refused it.",
  },
];

/** The agent's turn before the reader's, and its answer after. */
export const BEFORE =
  "Both hero options are on the landing branch: a short headline over the product shot, and a longer one that leads with the fleet board.";
export const AFTER =
  "Keeping the crop. I'll set the short headline first and check the CTA against the tokens.";
