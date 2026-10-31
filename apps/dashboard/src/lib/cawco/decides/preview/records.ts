/**
 * His Who decides as the hub answers it (`GET /api/decides`, 2026-10-31): the
 * five built-in members and the six kinds, nothing added, every project
 * following the fleet. Cawco-Dev's facts lines are what its Caw and the
 * Advisor's and Common practice's delegate types run on.
 */
import {
  BUILT_IN,
  BUILT_IN_MEMBERS,
  DEFAULT_ROUTES,
  KIND_SEED,
} from "@cawco/core/decides";
import { decidesWords } from "@cawco/core/words/decides";

export const project = "Cawco-Dev";
export const members = BUILT_IN_MEMBERS.map((id) => BUILT_IN[id]);
export const kinds = KIND_SEED;
export const fleetRoutes: Record<string, string> = { ...DEFAULT_ROUTES };
export const facts: Record<string, string> = {
  caw: decidesWords.leads("Claude Code", project),
  advisor: "Claude Code · Fable 5.1 · high effort",
  practice: "Claude Code · Sonnet 5.5 · medium effort",
};
