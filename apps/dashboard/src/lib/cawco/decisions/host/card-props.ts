/**
 * A decision card as a page's program hands it to its Decision (the
 * OpenUI node tree): its id, question, why, and each option as an Option
 * node. What the composer's parked card draws a card from
 * (transcript/ParkedPrompt), and a states fixture of a page's card.
 */

import type { DecisionCard } from "@cawco/core/decisions";

/** An option as the card's program names it. */
export interface OptionNode {
  props: {
    builds?: string;
    cost?: string;
    id: string;
    label: string;
    line?: string;
    recommended: boolean;
  };
  typeName: "Option";
}

/** Whether `value` is an Option node. */
export const isOptionNode = (value: unknown): value is OptionNode =>
  typeof value === "object" &&
  value !== null &&
  "typeName" in value &&
  value.typeName === "Option";

/** Card `card` as the page's program would hand it its Decision. */
export const cardProps = (card: DecisionCard) => ({
  id: card.id,
  question: card.question,
  why: card.why || undefined,
  multiple: card.multiple,
  options: card.options.map((option): OptionNode => ({
    typeName: "Option",
    props: {
      id: option.id,
      label: option.label,
      line: option.line || undefined,
      cost: option.cost || undefined,
      builds: option.builds,
      recommended: option.recommended,
    },
  })),
});
