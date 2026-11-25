/**
 * The stores the app's shell reads (its rail's projects and machines, the
 * page's address), written as the hub's first read would write them, for
 * the Settings view's states files (settings-live.svelte).
 */

import { DAY_MS, HOUR_MS, MINUTE_MS } from "@cawco/core/time";
import type { ClaudeLimits, LimitWindow } from "@cawco/core/usage/types";
import { standSocket } from "#lib/cawco/hub/socket.svelte.js";
import type {
  ProjectPlace as PlaceRow,
  ProjectRow,
} from "#lib/cawco/projects.js";
import { boardState, type Machine } from "#lib/cawco/stores/board.svelte.js";
import { projectsState } from "#lib/cawco/stores/projects.svelte.js";
import { adoptUsageLimits } from "#lib/cawco/stores/usage.svelte.js";
import { page } from "$app/state";
import type { SettingsRecord } from "./records";
import { SITUATIONS, type Situation } from "./settings.fixtures";

/** The shell's rail reads the fleet's projects and machines from the stores, written here as the hub's first read would. */
const placeRow = (
  record: SettingsRecord,
  place: SettingsRecord["places"][number]
): PlaceRow => ({
  createdAt: "2026-09-02T10:00:00.000Z",
  found: !place.missing,
  id: place.id,
  isPrimary: place.kind === "start",
  kind: place.kind === "hub" ? "hub" : "checkout",
  locateTo: place.locateTo,
  machineId: place.machineId ?? "hub",
  made: place.madeByCawco,
  missing: place.missing,
  path: place.path,
  projectId: record.project.id,
  within: [],
});

export const projectRowOf = (record: SettingsRecord): ProjectRow => ({
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
  lands: record.landing,
  outsiders: record.outsiders,
  lfsConnection:
    record.largeFiles.kind === "declared" ? record.largeFiles.connection : null,
  lfsUrl:
    record.largeFiles.kind === "declared" ? record.largeFiles.address : null,
  links: record.repos.map((r) => `${r.host}/${r.owner}/${r.name}`),
  name: record.project.name,
  places: record.places.map((p) => placeRow(record, p)),
  primaryPlaceId: record.places.find((p) => p.kind === "start")?.id ?? null,
});

const OTHER_PROJECTS: [string, string][] = [
  ["harbor-api", "Harbor API"],
  ["field-notes", "Field notes"],
  ["atlas-dotfiles", "Atlas dotfiles"],
  ["northwind-onboarding", "Northwind onboarding"],
];

const machineRowOf = (
  machine: SettingsRecord["machines"][number]
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
 * its bar from the project's. The frame's address is one under the
 * project's (`/project/<id>/settings`), as the project's own pages are, so
 * the shell draws this frame's page in its page region rather than the
 * workspace's pane.
 */
export function atProjectPage(projectId: string): void {
  Object.assign(page, {
    url: new URL(
      `/project/${projectId}/settings`,
      globalThis.location?.origin ?? "http://localhost/"
    ),
  });
}

/** A limit window of a reading, `percent` used, resetting `inMs` from now. */
const win = (
  group: "session" | "weekly",
  percent: number,
  inMs: number
): LimitWindow => ({
  group,
  isActive: true,
  kind: group === "session" ? "session" : "weekly_all",
  percent,
  resetsAt: new Date(Date.now() + inMs).toISOString(),
  scopeLabel: null,
  severity: percent >= 100 ? "critical" : "normal",
});

/** An Anthropic account's reading, taken a few minutes ago. */
const reading = (windows: LimitWindow[]): ClaudeLimits => ({
  error: null,
  errorKind: null,
  extraUsage: null,
  fetchedAt: Date.now() - 4 * MINUTE_MS,
  stale: false,
  subscription: "max",
  windows,
});

/**
 * The fleet's limit readings the account picker reads (usageStore), as the
 * hub's usage frame brings them: Studio Max with room, Northwind client at
 * its 5-hour limit; Personal Pro, signed in nowhere, has none to read.
 */
const LIMITS: Record<string, LimitWindow[]> = {
  "acc-studio": [
    win("session", 38, 3 * HOUR_MS),
    win("weekly", 54, 4 * DAY_MS),
  ],
  "acc-northwind": [
    win("session", 100, HOUR_MS + 25 * MINUTE_MS),
    win("weekly", 71, 2 * DAY_MS),
  ],
};

/** Writes the stores the shell reads: the project, the fleet's other projects, its machines. */
function seedShell(record: SettingsRecord): void {
  const own = projectRowOf(record);
  atProjectPage(own.id);
  // No hub stands behind a states file: the page stands on a bench whose hub
  // takes every command and answers none, so the shell reads the hub as
  // reached and draws no band saying it is out of reach.
  standSocket({
    control: () => null,
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
  adoptUsageLimits({
    claude: record.accounts.flatMap((account) => {
      const windows = LIMITS[account.id];
      return windows
        ? [{ accountId: account.id, limits: reading(windows) }]
        : [];
    }),
    openCodeGo: [],
  });
}

/**
 * What every states file of the Settings view shares: the page in
 * desk width, its shell's stores written for the story's situation first.
 */
export const shellFrame = {
  parameters: { viewport: "desk" },
  beforeEach: ({ args }: { args: { situation: Situation } }) => {
    seedShell(SITUATIONS[args.situation]);
  },
};
