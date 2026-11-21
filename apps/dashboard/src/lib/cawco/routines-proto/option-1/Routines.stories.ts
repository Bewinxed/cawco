/**
 * Option 1 of the Routines view, live: project Harbor on Saturday 21 Nov
 * at 13:40, every routine in one list and a routine opened beside it, in
 * the app's shell. A routine's Open stands it beside the list; an earlier
 * run's Open shows its whole result in place; the session buttons go to
 * the session that did a run.
 */

import type { InstanceRow } from "@cawco/core/protocol";
import { hubAs } from "../../hub-stand-in";
import type { ProjectRow } from "../../projects";
import Live from "./routines-live.svelte";

const HARBOR: ProjectRow = {
  account: null,
  accountAtLimit: "wait",
  cawHarness: "claude",
  cawModel: null,
  conversationInstanceId: null,
  createdAt: "2026-09-02T10:14:00.000Z",
  eventsOn: true,
  id: "harbor",
  lands: "main",
  lfsConnection: null,
  lfsUrl: null,
  links: ["github.com/harbor/harbor-app"],
  name: "Harbor",
  places: [],
  primaryPlaceId: null,
  review: true,
};

/** Harbor's sessions in the rail's Recent, newest first. */
const session = (
  id: string,
  title: string,
  status: InstanceRow["status"],
  minutesAgo: number
): InstanceRow => ({
  id,
  cwd: "/home/mira/code/harbor-app",
  harness: "claude",
  kind: "mainline",
  mayStart: ["any"],
  startingSet: null,
  launchDir: "known",
  machineId: "studio",
  sessionId: null,
  status,
  origin: "person",
  projectId: "harbor",
  parentInstanceId: null,
  createdAt: new Date(
    Date.UTC(2026, 10, 21, 13, 40 - minutesAgo)
  ).toISOString(),
  title,
});

const SESSIONS: InstanceRow[] = [
  session("e1a96c30", "Summarise yesterday's sessions", "running", 10),
  session("7c1b02aa", "Ship release 2.4", "running", 95),
  session("4f88d1e5", "Fix flaky deploy job", "stopped", 240),
  session("5d0e2f91", "Triage new GitHub issues", "stopped", 1720),
];

export default {
  title: "Routines/Option 1",
  component: Live,
  args: { opened: null, run: null },
  decorators: [hubAs("connected")],
  parameters: { viewport: 1440 },
  async beforeEach() {
    const projects = await import("../../stores/projects.svelte");
    projects.keepProjects([HARBOR], projects.projectsLeave());
    const board = await import("../../stores/board.svelte");
    board.adoptRows(SESSIONS);
    board.boardState.fleetRead = true;
  },
};

/** Harbor's routines on a Saturday afternoon: two need me, one is running, and nothing is open beside them. */
export const Harbor = {};

/** Triage new GitHub issues opened beside the list, its Friday run's whole result on top. */
export const TriageOpen = { args: { opened: "rtn-triage" } };

/** Thursday's triage run, the one an opened issue started, read whole in place. */
export const EarlierRunOpen = {
  args: { opened: "rtn-triage", run: "run-t3" },
};

/** The npm release check opened: what it looks for, its latest look and what waits on it. */
export const LookOpen = { args: { opened: "rtn-npm" } };

/** The staging check that stopped, opened: why it needs me, and its three failed looks. */
export const StoppedOpen = { args: { opened: "rtn-staging" } };
