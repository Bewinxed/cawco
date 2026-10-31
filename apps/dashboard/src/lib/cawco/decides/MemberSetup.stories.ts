/**
 * A member's settings, hung from the card that opened them, on his real fleet: the five
 * built-ins, Design reviewer (an agent he added, holding Look and words in
 * Cawco-Dev) and Release checker, the harnesses on his machines with their
 * models, and the fleet's skills. Every write stays on the page.
 */
import SetupFixture from "./preview/SetupFixture.svelte";
import { harnessesNoOpenCode } from "./preview/setup-records";

export default {
  title: "Who decides/A member's settings",
  component: SetupFixture,
};

/** The Advisor's settings, every row folded with its Change. */
export const AdvisorDesk = {
  args: { open: "advisor" },
  parameters: { viewport: 1440 },
};

/** The Advisor with Runs on open: the harnesses naming their machines, its model, effort, and may it delegate. */
export const AdvisorRunsOn = {
  args: { open: "advisor", row: "runs" },
  parameters: { viewport: 1440 },
};

/** The Advisor, Runs on open, at the two-column width. */
export const AdvisorRunsOnTablet = {
  args: { open: "advisor", row: "runs" },
  parameters: { viewport: 680 },
};

/** The Advisor, Runs on open, on a phone: the label over the value, the harnesses stacked. */
export const AdvisorRunsOnPhone = {
  args: { open: "advisor", row: "runs" },
  parameters: { viewport: 390 },
};

/** Approach's member with "May start delegates of its own" on. */
export const AdvisorMayDelegate = {
  args: { open: "advisor", row: "runs", draft: { delegates: true } },
  parameters: { viewport: 1440 },
};

/** Design reviewer, an agent he added: Knows open, its skills and instructions. */
export const DesignReviewer = {
  args: { open: "design-reviewer", row: "knows" },
  parameters: { viewport: 1440 },
};

/** Design reviewer's Decides: every kind, who holds each now, and the hint. */
export const DesignReviewerDecides = {
  args: { open: "design-reviewer", row: "decides" },
  parameters: { viewport: 680 },
};

/** Removing Design reviewer: the question stands in the settings' flow. */
export const RemovingMember = {
  args: { open: "design-reviewer", removing: true },
  parameters: { viewport: 1440 },
};

/** Removing Design reviewer on a phone. */
export const RemovingMemberPhone = {
  args: { open: "design-reviewer", removing: true },
  parameters: { viewport: 390 },
};

/** Release checker can't run: OpenCode is on no machine, so its Runs on says so once Save is pressed. */
export const CantRun = {
  args: {
    open: "release-checker",
    row: "runs",
    offers: harnessesNoOpenCode,
    tried: true,
  },
  parameters: { viewport: 1440 },
};

/** Common practice: Runs on and How you hear. */
export const CommonPractice = {
  args: { open: "practice", row: "hear" },
  parameters: { viewport: 1440 },
};

/** Caw's profile on Cawco-Dev: his status, his lead switch live, Runs on, Knows, Decides. */
export const CawProfile = {
  args: { open: "caw", row: "runs" },
  parameters: { viewport: 1440 },
};

/** Caw's profile on a phone. */
export const CawProfilePhone = {
  args: { open: "caw", row: "runs" },
  parameters: { viewport: 390 },
};

/** Caw on the fleet's page: his harness and model are each project's. */
export const CawFleet = {
  args: { open: "caw", project: null },
  parameters: { viewport: 1440 },
};
