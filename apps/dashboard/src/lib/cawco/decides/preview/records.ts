/**
 * His Who decides as the hub answers it (`GET /api/decides`, 2026-10-31): the
 * five built-in members and the six kinds, nothing added, every project
 * following the fleet. Cawco-Dev's facts lines are what its Caw and the
 * Advisor's and Common practice's delegate types run on. `added` is a fleet
 * with agents and a person added, for the hand-over with many members.
 */
import {
  BUILT_IN,
  BUILT_IN_MEMBERS,
  DEFAULT_ROUTES,
  KIND_SEED,
  type Member,
} from "@cawco/core/decides";
import { decidesWords } from "@cawco/core/words/decides";
import type { Facts } from "../decides.svelte";

export const project = "Cawco-Dev";
export const members = BUILT_IN_MEMBERS.map((id) => BUILT_IN[id]);
export const kinds = KIND_SEED;
export const fleetRoutes: Record<string, string> = { ...DEFAULT_ROUTES };
export const facts: Record<string, Facts> = {
  caw: {
    attention: false,
    text: decidesWords.leads("Claude Code · Opus 5.5", project),
  },
  advisor: {
    attention: false,
    text: decidesWords.runsOn("Claude Code", "Fable 5.1", "high"),
  },
  practice: {
    attention: false,
    text: decidesWords.runsOn("Claude Code", "Sonnet 5.5", "medium"),
  },
};

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

export const addedFacts: Record<string, Facts> = {
  ...facts,
  "design-reviewer": {
    attention: false,
    text: decidesWords.runsOn("Claude Code", "Opus 5.5", "high"),
  },
  "release-checker": {
    attention: true,
    text: decidesWords.cantRun("Release checker", "OpenCode"),
  },
  "copy-editor": {
    attention: false,
    text: decidesWords.runsOn("pi", "GPT-5.5", null),
  },
  "security-reviewer": {
    attention: false,
    text: decidesWords.runsOn("Claude Code", "Opus 5.5", "max"),
  },
  mira: { attention: true, text: decidesWords.unreachable("Mira") },
};
