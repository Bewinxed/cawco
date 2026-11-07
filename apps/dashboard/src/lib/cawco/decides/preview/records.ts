/**
 * His Who decides as the hub answers it (`GET /api/decides`, 2026-10-31): the
 * fleet's routes, every project following them, and `added`, the five
 * built-in members with the agents and a person he added.
 */
import {
  BUILT_IN,
  BUILT_IN_MEMBERS,
  DEFAULT_ROUTES,
  type Member,
} from "@cawco/core/decides";

const members = BUILT_IN_MEMBERS.map((id) => BUILT_IN[id]);
export const fleetRoutes: Record<string, string> = { ...DEFAULT_ROUTES };

const agent = (id: string, name: string, job: string, hue: number): Member => ({
  id,
  type: "agent",
  name,
  job,
  subject: name.toLowerCase(),
  builtIn: false,
  hue,
  pose: null,
  hear: "each",
  delegateType: id,
  reach: null,
});

/** Agents and a person he added, beside the built-ins. */
export const added: Member[] = [
  ...members,
  agent(
    "design-reviewer",
    "Design reviewer",
    "Reads DESIGN.md and the screens, then picks the look.",
    3
  ),
  agent(
    "release-checker",
    "Release checker",
    "Checks the changelog and the build before anything ships.",
    5
  ),
  agent(
    "copy-editor",
    "Copy editor",
    "Holds every word on screen to the Voice section.",
    7
  ),
  agent(
    "security-reviewer",
    "Security reviewer",
    "Reads auth, secrets and anything that crosses the tailnet.",
    1
  ),
  {
    ...agent("mira", "Mira", "Owns the brand: decides what it looks like.", 6),
    type: "person",
    hear: null,
    delegateType: null,
  },
];
