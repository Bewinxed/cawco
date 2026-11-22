/**
 * The stores the app's shell reads (its rail's projects and machines, the
 * page's address), written as the hub's first read would write them, for
 * the "How it runs" frame (how-it-runs-live.svelte).
 */

import { CONTROL_GH_REPO, CONTROL_GH_REPOS } from "@cawco/core/connections";
import { standSocket } from "#lib/cawco/hub/socket.svelte.js";
import type {
  ProjectPlace as PlaceRow,
  ProjectRow,
} from "#lib/cawco/projects.js";
import { boardState, type Machine } from "#lib/cawco/stores/board.svelte.js";
import { projectsState } from "#lib/cawco/stores/projects.svelte.js";
import { page } from "$app/state";
import { type HowItRunsRecord, SITUATIONS, type Situation } from "./records";
import { githubReposOf } from "./tie-setup.fixture";

/** The shell's rail reads the fleet's projects and machines from the stores, written here as the hub's first read would. */
const placeRow = (
  record: HowItRunsRecord,
  place: HowItRunsRecord["places"][number]
): PlaceRow => ({
  createdAt: "2026-09-02T10:00:00.000Z",
  found: !place.missing,
  id: place.id,
  isPrimary: place.kind === "start",
  kind: place.kind === "hub" ? "hub" : "checkout",
  machineId: place.machineId ?? "hub",
  made: place.madeByCawco,
  missing: place.missing,
  path: place.path,
  projectId: record.project.id,
  within: [],
});

export const projectRowOf = (record: HowItRunsRecord): ProjectRow => ({
  account: record.account.chosen,
  accountAtLimit: record.account.atLimit,
  areaId: null,
  cap: null,
  cawHarness: "claude",
  cawModel: null,
  conversationInstanceId: null,
  createdAt: "2026-09-02T10:00:00.000Z",
  eventsOn: true,
  id: record.project.id,
  lands: "pr",
  lfsConnection: null,
  lfsUrl: null,
  links: record.repos.map((r) => `${r.host}/${r.owner}/${r.name}`),
  name: record.project.name,
  places: record.places.map((p) => placeRow(record, p)),
  primaryPlaceId: record.places.find((p) => p.kind === "start")?.id ?? null,
  review: record.reviewBeforeDone,
});

const OTHER_PROJECTS: [string, string][] = [
  ["harbor-api", "Harbor API"],
  ["field-notes", "Field notes"],
  ["atlas-dotfiles", "Atlas dotfiles"],
  ["northwind-onboarding", "Northwind onboarding"],
];

const machineRowOf = (
  machine: HowItRunsRecord["machines"][number]
): Machine => ({
  auth: "unknown",
  home: machine.home,
  hostname: machine.name,
  joinedAt: Date.parse("2026-08-01T09:00:00.000Z"),
  machineId: machine.id,
  os: machine.os,
  pausedUntil: null,
  pauseStopped: null,
  status: machine.online ? "online" : "offline",
});

/**
 * The stage's page stands at the states file's own address; the shell names
 * its bar from the project's. The view's address is one under the project's
 * (`/project/<id>/how`), as the project's own pages are, so the shell draws
 * this frame's page in its page region rather than the workspace's pane.
 */
export function atProjectPage(projectId: string): void {
  Object.assign(page, {
    url: new URL(
      `/project/${projectId}/how`,
      globalThis.location?.origin ?? "http://localhost/"
    ),
  });
}

/** Writes the stores the shell reads: the project, the fleet's other projects, its machines. */
function seedShell(record: HowItRunsRecord): void {
  const own = projectRowOf(record);
  atProjectPage(own.id);
  // No hub stands behind a states file: the page stands on a bench whose hub
  // takes every command and answers none, so the shell reads the hub as
  // reached and draws no band saying it is out of reach. Its one control is
  // the repository picker's: GitHub's setup mounts it on a connection, whose
  // id stands where a machine's would, and the fixture answers its list.
  standSocket({
    control: (connectionId, method) => {
      switch (method) {
        case CONTROL_GH_REPOS:
          return githubReposOf(connectionId);
        case CONTROL_GH_REPO:
          return { kind: "not-found" };
        default:
          return null;
      }
    },
    hub: () => undefined,
    spawn: null,
  });
  projectsState.projects = [
    own,
    ...OTHER_PROJECTS.filter(([id]) => id !== own.id).map(([id, name]) => ({
      ...own,
      id,
      name,
      places: [],
      primaryPlaceId: null,
      links: [],
    })),
  ];
  projectsState.projectsRead = true;
  boardState.machines = record.machines.map(machineRowOf);
  boardState.fleetRead = true;
}

/**
 * What every states file of the "How it runs" frame shares: the page in
 * desk width, its shell's stores written for the story's situation first.
 */
export const shellFrame = {
  parameters: { viewport: "desk" },
  beforeEach: ({ args }: { args: { situation: Situation } }) => {
    seedShell(SITUATIONS[args.situation]);
  },
};
