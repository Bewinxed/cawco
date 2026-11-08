/**
 * Areas (the project-grouping decision, "An area with settings"): a named
 * group a project may sit in, one area at most, carrying the settings the
 * fleet carries. A project takes its area's value wherever it sets none
 * itself, and the fleet's where the area sets none too. Areas do not nest,
 * and an area has no places, board, conversation or routines: it is set up,
 * never worked in.
 *
 * Every setting in effect the hub hands out says where it came from
 * ({@link SettingSource}), so no surface leaves "which account is this on"
 * a question with three answers. {@link settingsInEffect} is the one rule
 * for the row settings; the hub's folder readers (decides.md, delegate
 * types) and its scopes (memory documents, connections, rules) apply the
 * same order to what they read.
 */
import type { ProjectAtLimit } from "./accounts";
import type { OfferedMode } from "./harness/kinds";
import type { CapPeriod, OnCap } from "./project-conversation";

/** Where a setting in effect came from: the project's own, its area's, or the fleet's. */
export type SettingSource = "project" | "area" | "fleet";

/** A setting in effect, and where it came from. */
export interface Sourced<T> {
  from: SettingSource;
  value: T;
}

/** A spend cap's amount and the span it counts over. */
export interface CapAmount {
  period: CapPeriod;
  usd: number;
}

/**
 * The row settings a project and an area each may set, null for none
 * (`projects` and `areas` hold the same columns). The account and what its
 * sessions do at its limit go together, and so do a cap's amount and period.
 */
export interface OwnSettings {
  account: string | null;
  accountAtLimit: ProjectAtLimit;
  capPeriod: CapPeriod | null;
  capUsd: number | null;
  cawMode: OfferedMode | null;
  onCap: OnCap | null;
}

/** What the fleet sets beneath every area: its Caw mode and what reaching a cap does. */
export interface FleetSettings {
  cawMode: OfferedMode | null;
  onCap: OnCap;
}

/**
 * A project's settings in effect, each with its source:
 *
 * - `account`: the account its sessions start on when a start names none;
 *   null from the fleet is the fleet's routing.
 * - `accountAtLimit`: what its sessions on that account do at its limit, from
 *   whoever set the account (the fleet's is `wait`, with no account to wait on).
 * - `cawMode`: the permission mode its conversation starts in; null from the
 *   fleet is the mode last chosen for the harness on that machine.
 * - `cap`: what it may spend in a period; null from the fleet is no cap.
 * - `onCap`: what reaching the cap does.
 */
export interface SettingsInEffect {
  account: Sourced<string | null>;
  accountAtLimit: Sourced<ProjectAtLimit>;
  cap: Sourced<CapAmount | null>;
  cawMode: Sourced<OfferedMode | null>;
  onCap: Sourced<OnCap>;
}

/** An area as the hub keeps it: its name, its place in the list, and its settings. */
export interface Area extends OwnSettings {
  createdAt: Date;
  id: string;
  name: string;
  /** Its place among the areas, smallest first. */
  position: number;
}

const capOf = (own: OwnSettings): CapAmount | null =>
  own.capUsd !== null && own.capPeriod !== null
    ? { usd: own.capUsd, period: own.capPeriod }
    : null;

/** The first of project, area and fleet that sets a value (`set` says whether one does). */
const first = <T>(
  project: T,
  area: T | undefined,
  fleet: T,
  set: (value: T) => boolean
): Sourced<T> => {
  if (set(project)) {
    return { value: project, from: "project" };
  }
  if (area !== undefined && set(area)) {
    return { value: area, from: "area" };
  }
  return { value: fleet, from: "fleet" };
};

const isSet = <T>(value: T | null): boolean => value !== null;

/**
 * A project's settings in effect: its own where it sets one, else its
 * area's (`area` null: it sits in none), else the fleet's.
 */
export const settingsInEffect = (
  project: OwnSettings,
  area: OwnSettings | null,
  fleet: FleetSettings
): SettingsInEffect => {
  const account = first<string | null>(
    project.account,
    area?.account,
    null,
    isSet
  );
  let atLimit: ProjectAtLimit = "wait";
  if (account.from === "project") {
    atLimit = project.accountAtLimit;
  } else if (account.from === "area" && area) {
    atLimit = area.accountAtLimit;
  }
  return {
    account,
    accountAtLimit: { value: atLimit, from: account.from },
    cawMode: first(project.cawMode, area?.cawMode, fleet.cawMode, isSet),
    cap: first(capOf(project), area ? capOf(area) : undefined, null, isSet),
    onCap: first<OnCap | null>(
      project.onCap,
      area?.onCap,
      fleet.onCap,
      isSet
    ) as Sourced<OnCap>,
  };
};

/** An area's name: trimmed, one line, 1 to {@link AREA_NAME_LIMIT} characters. */
export const AREA_NAME_LIMIT = 80;
