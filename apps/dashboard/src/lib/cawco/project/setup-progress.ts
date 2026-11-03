/**
 * How far Caw has got setting a project up (the project-setup skill), read
 * off his own conversation as it stands: the calls he made, the name the
 * project has, the setup page once it is there, and the questions he has
 * open. It changes nothing for him: the four steps are the skill's own
 * order, ticked from what has happened (decision page `onboarding-design`,
 * card `the-wait`, "Caw at work in his panel, the fixed steps under him").
 */
import { setupWords } from "@cawco/core/words/onboarding";
import type { Message } from "../types";

/** The setup's four steps, in the skill's order. */
type SetupStepId = "read" | "name" | "draft" | "page";

export interface SetupStep {
  done: boolean;
  id: SetupStepId;
  label: string;
  /** The one he is on: it breathes. */
  live: boolean;
}

/** Where the setup stands, by what he is on now (each its words in `setupWords.doing`). */
type SetupPhase = keyof typeof setupWords.doing;

export interface SetupProgress {
  /** What he is on now, in words under him. */
  doing: string;
  phase: SetupPhase;
  steps: SetupStep[];
}

/** The page the setup skill writes and opens: `decisions/setup/` (hub setup.ts `SETUP_PAGE`). */
export const SETUP_PAGE = "setup";

/** A CawCo tool by its bare name, under any harness's naming of it (`mcp__cawco__…`, `cawco_…`). */
const calls = (message: Message, bare: string): boolean => {
  const name = message.metadata?.toolName ?? "";
  return name === bare || name.endsWith(`_${bare}`);
};

/** He opened the setup page: an `artifact_create` of `setup` that went. */
const openedPage = (message: Message): boolean =>
  calls(message, "artifact_create") &&
  message.metadata?.toolStatus !== "error" &&
  (message.metadata?.toolInput as { name?: unknown } | undefined)?.name ===
    SETUP_PAGE;

export interface SetupFacts {
  /** His conversation's messages, oldest first. */
  messages: readonly Message[];
  /** The project's name, and whether it is still the placeholder. */
  name: string;
  named: boolean;
  /** Questions of his still open: whether any holds his work up. */
  open: { blocks: boolean }[];
  /** The setup page exists in the project (its Decisions list has it). */
  page: boolean;
}

/** The setup's steps and what he is on, from what has happened so far. */
export function setupProgressOf(facts: SetupFacts): SetupProgress {
  const read = facts.messages.some((message) =>
    calls(message, "project_setup")
  );
  const named =
    facts.named ||
    facts.messages.some((message) => calls(message, "project_name"));
  const page = facts.page || facts.messages.some(openedPage);
  const phase = phaseOf(read, named, page, facts.open);
  const steps: SetupStep[] = [
    {
      id: "read",
      label: setupWords.steps.read,
      done: read,
      live: phase === "reading",
    },
    {
      id: "name",
      label: facts.named
        ? setupWords.steps.named(facts.name)
        : setupWords.steps.name,
      done: named,
      live: phase === "naming",
    },
    {
      id: "draft",
      label: setupWords.steps.draft,
      done: page,
      live: phase === "drafting" || phase === "asking" || phase === "waiting",
    },
    { id: "page", label: setupWords.steps.page, done: page, live: false },
  ];
  return { phase, steps, doing: setupWords.doing[phase] };
}

function phaseOf(
  read: boolean,
  named: boolean,
  page: boolean,
  open: { blocks: boolean }[]
): SetupPhase {
  if (page) {
    return "page";
  }
  if (!read) {
    return "reading";
  }
  if (!named) {
    return "naming";
  }
  if (open.some((ask) => ask.blocks)) {
    return "waiting";
  }
  return open.length > 0 ? "asking" : "drafting";
}
