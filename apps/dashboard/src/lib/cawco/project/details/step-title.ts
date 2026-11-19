import {
  actWords,
  cardWords,
  connectWords,
  taskWords,
} from "@cawco/core/words/project-details";
import type { StepState } from "./details";

/** The card's or the step's name, in its bar and its sheet's title. */
export const stepTitle = (step: StepState): string => {
  if (step === null) {
    return cardWords.title;
  }
  return step.kind === "folder"
    ? actWords[step.act].name
    : connectWords.title(taskWords[step.provider].name);
};
