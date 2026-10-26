/**
 * The groups a probe-kit spec stands in, as the owner's test page of
 * 2026-10-16 grouped the suite, and the groups he cut. Every spec names its
 * group (kit.ts `Spec.group`); `bun run check` refuses one that names no
 * group or a cut one (scripts/probe-groups-check.ts). The groups he cut
 * whole filled up again after 10-16 because nothing stopped a new spec
 * landing in them: a spec of a cut group goes to him, not into the kit.
 */
export const KEPT_GROUPS = [
  "Previews, pages and comments",
  "iPhone Safari",
  "Workspaces and what agents may touch",
  "The hub and machines",
  "Speed",
  "Release checks",
  "The probe kit's own rig",
] as const;

export type SpecGroup = (typeof KEPT_GROUPS)[number];

/** A group the owner cut, when, and where he picked it. */
export interface CutGroup {
  by: string;
  cut: string;
  group: string;
}

const TEST_PAGE =
  "the owner's picks on the test page (14b592ff6), cut again by his pick on probe-kit-cuts (2026-10-26)";

export const CUT_GROUPS: readonly CutGroup[] = [
  { group: "Tabs, sidebar and menus", cut: "2026-10-16", by: TEST_PAGE },
  {
    group: "Typing and reading a conversation",
    cut: "2026-10-16",
    by: TEST_PAGE,
  },
  { group: "Caw", cut: "2026-10-16", by: TEST_PAGE },
  {
    group: "Projects, tasks, routines and decisions",
    cut: "2026-10-16",
    by: TEST_PAGE,
  },
  { group: "Custom views and design", cut: "2026-10-16", by: TEST_PAGE },
  { group: "Accounts and a session's life", cut: "2026-10-16", by: TEST_PAGE },
  {
    group: "Tools, skills, plugins and connections",
    cut: "2026-10-16",
    by: TEST_PAGE,
  },
  {
    group: "The iPhone and iPad app",
    cut: "2026-10-26",
    by: "the owner's pick on probe-kit-cuts",
  },
];
