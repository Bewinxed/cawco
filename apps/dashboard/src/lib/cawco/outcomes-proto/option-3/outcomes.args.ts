/**
 * Every option 3 story's records and the mock hub's answers, as Outcomes
 * opens on arrival: the project "cockpit", the hub reachable and taking
 * answers, the bento on show and Caw's conversation shut.
 */
import { COCKPIT_OUTCOMES, COCKPIT_SUGGESTIONS } from "./outcomes.fixture";

export const COCKPIT_ARGS = {
  outcomes: COCKPIT_OUTCOMES,
  suggestions: COCKPIT_SUGGESTIONS,
  hub: "takes it",
  live: true,
  lastRead: "14:02",
  opens: null,
  conversation: false,
  answered: {},
};
