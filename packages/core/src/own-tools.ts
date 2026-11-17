/**
 * Whether a session uses CawCo's own way or its agent's own tools, chosen
 * once for the fleet (the owner, 2026-11-17: "in onboarding and in settings,
 * the user can choose whether cawco uses its delegate system, the harness's
 * own subagent system"; his pick of two switches on decision page
 * `harness-tools-shape`):
 *
 * - `helpers`: CawCo's delegates (the agent's own subagents denied, core
 *   delegate-types.ts `SUBAGENTS_DENIED`) or the agent's own subagents;
 * - `stepLists`: CawCo's plan list (the agent's own to-do list and plan mode
 *   denied, `OWN_LIST_DENIED`) or the agent's own.
 *
 * The hub keeps them in `supervisor_config` and sends them with the fleet's
 * denied tools (the `policy` item); each machine adds the denials at spawn
 * (agent denied-tools.ts `sessionFleetDenials`), in the session's own start
 * options, never in the person's settings. A session takes them as it
 * starts: one running keeps what it started with.
 */
import { z } from "zod";

export const HELPERS = ["delegates", "subagents"] as const;
export type Helpers = (typeof HELPERS)[number];

export const STEP_LISTS = ["cawco", "agent"] as const;
export type StepLists = (typeof STEP_LISTS)[number];

/** What sessions start with. */
export interface OwnTools {
  helpers: Helpers;
  stepLists: StepLists;
}

/** CawCo's own way on both: what every session did before the switches, and what one does on a fleet that has not chosen. */
export const OWN_TOOLS_DEFAULT: OwnTools = {
  helpers: "delegates",
  stepLists: "cawco",
};

export const OwnToolsSchema = z.object({
  helpers: z.enum(HELPERS),
  stepLists: z.enum(STEP_LISTS),
});

/**
 * The fleet's choices as the hub holds them: each null until a person has
 * made it, so the first run asks it (dashboard home/first-run.svelte.ts).
 * A null one is {@link OWN_TOOLS_DEFAULT}'s to a session.
 */
export interface OwnToolsChosen {
  helpers: Helpers | null;
  stepLists: StepLists | null;
}

/** What a session starts with under the fleet's choices. */
export const ownToolsOf = (chosen: OwnToolsChosen): OwnTools => ({
  helpers: chosen.helpers ?? OWN_TOOLS_DEFAULT.helpers,
  stepLists: chosen.stepLists ?? OWN_TOOLS_DEFAULT.stepLists,
});
