/**
 * What Harbor's states files share: its project row and its sessions, put
 * in the projects and board stores as the app's first read would, so the
 * shell's rail and the project's head draw Harbor.
 */
import type { InstanceRow } from "@cawco/core/protocol";
import type { ProjectRow } from "../../projects";

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

/** Writes Harbor into the stores a story's own runner holds (its `beforeEach`). */
export async function standHarbor(): Promise<void> {
  const projects = await import("../../stores/projects.svelte");
  projects.keepProjects([HARBOR], projects.projectsLeave());
  const board = await import("../../stores/board.svelte");
  board.adoptRows(SESSIONS);
  board.boardState.fleetRead = true;
}
