/**
 * A project's first minutes with Caw's stage in his panel, and with his
 * questions floating in as he drafts (decision page `onboarding-design`,
 * card `the-wait`, options `stage` and `asks`), with the personal PR team's
 * real questions. A story's own args are what it changes.
 */

import ProjectStart from "./ProjectStart.svelte";
import { PR_ASKS } from "./pr-team.fixtures";

const [visa, socials, where] = PR_ASKS;

export default {
  title: "Onboarding/Project start · his stage and his questions",
  component: ProjectStart,
  args: { beat: "drafting", wait: "steps", board: "empty" },
  parameters: { viewport: 1440 },
};

/** About 13 s, his stage: a transcript well holding him, live, what he is on, and the fixed steps. */
export const StageSpoke = { args: { beat: "spoke", wait: "stage" } };

/** About 60 s, his stage: the drafting step breathes under him. */
export const StageDrafting = { args: { wait: "stage" } };

/** On a phone, about 60 s, his stage in the sheet. */
export const StageDraftingPhone = {
  args: { wait: "stage", phone: true },
  parameters: { viewport: 390 },
};

/** Questions as he goes, about 13 s: the first floats in, and his drafting waits on it. */
export const AsksArrive = {
  args: { beat: "spoke", wait: "asks", asks: [visa] },
};

/** About 40 s: three open at once, one holding him up, two he goes on past with his assumption. */
export const AsksSeveral = {
  args: { wait: "asks", asks: [visa, socials, where] },
};

/** A late answer: X alone, where he had drafted for LinkedIn and X, so he redoes that part. */
export const AsksLate = {
  args: {
    wait: "asks",
    asks: [
      { ...visa, answered: "A new application" },
      {
        ...socials,
        answered: "X",
        redoing: "Redrafting the posting stages for X alone",
      },
      where,
    ],
  },
};

/** The page open with one left unanswered: it went with his assumption, still answerable. */
export const AsksUnanswered = {
  args: {
    beat: "page",
    wait: "asks",
    asks: [
      { ...visa, answered: "A new application" },
      { ...socials, answered: "LinkedIn and X" },
      where,
    ],
  },
};

/** On a phone: the questions stand one at a time at the top of his sheet. */
export const AsksPhone = {
  args: { wait: "asks", asks: [visa, socials, where], phone: true },
  parameters: { viewport: 390 },
};
