/**
 * Which elements of a decision page fail as a card (OpenUiRenderer
 * `cardOf`): a Decision, its question named on its face. Every other
 * element fails as a line naming its component.
 */
import { regionFaultWords } from "@cawco/core/words/region-fault";
import type { ElementNode } from "@openuidev/lang-core";

export const decisionCardOf = (
  node: ElementNode
): { what: string; question: string } | null =>
  node.typeName === "Decision"
    ? {
        what: regionFaultWords.parts.decision.what,
        question: String(node.props.question ?? ""),
      }
    : null;
