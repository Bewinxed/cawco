/**
 * The project page's Decisions tab (DecisionsView, Component Story Format
 * 3, live components) with no decision page yet and Caw able to start: Caw
 * at 80 centred over the column, the title, the line and his starters on
 * its left edge (EmptyState `axis="mark"`). Its reads arrive as props, so
 * the list stands in read and empty, and Caw stands in at rest, with no
 * head to sit down in.
 */
import {
  RESTING_LEAD,
  sitDownNowhere,
} from "#lib/cawco/project/caw-lead.fixture.js";
import type { ProjectStarter } from "#lib/cawco/project-tasks.js";
import DecisionsView from "./DecisionsView.svelte";
import type { ProjectDecisions } from "./decisions.svelte";

const decisions = {
  list: { pages: [] },
  problem: null,
  read: async () => undefined,
} as unknown as ProjectDecisions;

const STARTERS: ProjectStarter[] = [
  {
    glyph: "palette",
    text: "Lay out three directions for the onboarding screen and let me pick one",
    reason: "The onboarding screen has two open designs and no pick yet.",
    sources: [],
  },
  {
    glyph: "rocket",
    text: "Ask me which of the four open bugs ship in the Friday release",
    reason: "Four bugs are open against Friday's release and none is chosen.",
    sources: [],
  },
  {
    glyph: "system",
    text: "Should the hub keep a week of session logs, or a month?",
    reason: "Log retention came up twice in sessions this week.",
    sources: [],
  },
];

export default {
  title: "Decisions/Decisions tab",
  component: DecisionsView,
  args: {
    projectId: "launch",
    projectName: "Launch",
    decisions,
    page: null,
    card: null,
    canTalk: true,
    lead: RESTING_LEAD,
    now: Date.parse("2026-11-12T10:00:00Z"),
    hrefOf: () => "#",
    taskOf: () => undefined,
    taskHref: () => "#",
    onopentask: () => undefined,
    sitDown: sitDownNowhere,
    starters: STARTERS,
    go: () => undefined,
  },
  parameters: { viewport: 1440 },
};

/** No decision page yet: Caw offers three choices to put to me. */
export const NoDecisionsYet = {};
