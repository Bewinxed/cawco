/**
 * Where a project's work runs: one rule for every start the hub places in a
 * project (a task's attempt, dispatch.ts; a routine's run, routines.ts; a
 * delegate moved to its project's account, work-items.ts `onProjectAccount`;
 * the project's conversation, caw.ts).
 *
 * - **A checkout** of the project on a machine that is online, and one its
 *   `runs_on` names when the work names one (runs-on.ts), among those where
 *   the project's account is signed in when any is (placement.ts
 *   `onAccountMachines`): the starting session's own folder first, then a
 *   checkout on its machine, then the primary, then the first.
 * - **Its folder on the hub**, on the hub's machine while that machine runs
 *   an agent that is online, for a project with no checkout: its folder is
 *   where its work is (Projects spec §5.1, an "own" project's one place), and
 *   a workspace is cut from it as from any repository (a plain delegate in
 *   it has always been).
 * - **Nowhere** for a project that has a checkout but none online: its work
 *   is in its repository, which its folder on the hub (tasks, notes,
 *   decisions) is not, so a start there would work on the wrong tree. The
 *   start is refused or skipped in words naming what is missing.
 */
import type { AccountSignin } from "@cawco/core/accounts";
import { machinesCalled } from "@cawco/core/machine-names";
import { ElysiaStatus } from "elysia";
import type { ProjectRow } from "./db/projects";
import { onAccountMachines } from "./placement";
import type { projectRoot } from "./project-folder";
import { fits, type MachineFacts, runsOnWords } from "./runs-on";

/** The full stop a problem's sentence ends in, which a clause of a longer one drops. */
const TRAILING_STOP = /\.$/u;

/** What the rule reads of the fleet, read by the caller now. */
export interface WorkFleet {
  /** The project's folder on the hub, absolute on the hub's machine (project-folder.ts `projectRoot`): its problem when the id is no project's. */
  hubFolder: (projectId: string) => ReturnType<typeof projectRoot>;
  /** The machine the hub runs on; undefined before it is read. */
  hubMachine: string | undefined;
  /** Every machine the hub knows, online or not. */
  machines: readonly MachineFacts[];
  online: (machineId: string) => boolean;
  signins: readonly AccountSignin[];
}

/** What a start asks of its place; each left out, anywhere. */
export interface WorkAsk {
  /** The starting session's folder: a checkout there first, then one on its machine. */
  near?: { cwd: string; machineId: string };
  /** A task's `runs_on` (runs-on.ts): a machine or a capability. */
  runsOn?: string | null;
}

/**
 * Where the work runs, or why it runs nowhere: `why` says what is missing
 * and `fix` what to do, each a clause its caller frames ("skipped: <why>").
 */
export type WorkPlace =
  | { cwd: string; kind: "checkout" | "hub"; machineId: string }
  | { fix: string; kind: "none"; why: string };

type ProjectFacts = Pick<ProjectRow, "id" | "inEffect" | "name" | "places">;

/** The checkout {@link workPlace} picks, before the hub folder is considered. */
const checkoutOf = (
  project: ProjectFacts,
  fleet: WorkFleet,
  allowed: (machineId: string) => boolean,
  near: WorkAsk["near"]
) => {
  const checkouts = onAccountMachines(
    project.places.filter(
      (place) =>
        place.kind === "checkout" &&
        fleet.online(place.machineId) &&
        allowed(place.machineId)
    ),
    project.inEffect.account.value,
    fleet.signins
  );
  const onNear = near
    ? (checkouts.find(
        (place) => place.machineId === near.machineId && place.path === near.cwd
      ) ?? checkouts.find((place) => place.machineId === near.machineId))
    : undefined;
  return onNear ?? checkouts.find((place) => place.isPrimary) ?? checkouts[0];
};

/** Where `project`'s work runs now ({@link WorkPlace}). */
export const workPlace = (
  project: ProjectFacts,
  fleet: WorkFleet,
  ask: WorkAsk = {}
): WorkPlace => {
  const runsOn = ask.runsOn ?? null;
  const fitting = runsOn
    ? fleet.machines.filter((machine) => fits(runsOn, machine))
    : null;
  const allowed = (machineId: string): boolean =>
    !fitting || fitting.some((machine) => machine.machineId === machineId);
  const checkout = checkoutOf(project, fleet, allowed, ask.near);
  if (checkout) {
    return {
      kind: "checkout",
      machineId: checkout.machineId,
      cwd: checkout.path,
    };
  }
  const repository = project.places.some((place) => place.kind === "checkout");
  const hub = fleet.hubMachine;
  if (!repository && hub && fleet.online(hub) && allowed(hub)) {
    const folder = fleet.hubFolder(project.id);
    // A folder the hub cannot name is nowhere the work could run.
    return folder instanceof ElysiaStatus
      ? {
          kind: "none",
          why: folder.response.detail.replace(TRAILING_STOP, ""),
          fix: "start the work in a project the hub keeps",
        }
      : { kind: "hub", machineId: hub, cwd: folder };
  }
  return { kind: "none", ...missing(project, fleet, runsOn, fitting) };
};

/** Why {@link workPlace} found nowhere, and what to do. */
const missing = (
  project: ProjectFacts,
  fleet: WorkFleet,
  runsOn: string | null,
  fitting: MachineFacts[] | null
): { fix: string; why: string } => {
  const named = (machines: readonly { machineId: string }[]): string =>
    machinesCalled(
      machines.map(
        (one) =>
          fleet.machines.find((known) => known.machineId === one.machineId) ?? {
            machineId: one.machineId,
            hostname: one.machineId,
          }
      ),
      fleet.machines
    );
  const checkouts = project.places.filter((place) => place.kind === "checkout");
  const needs = runsOn ? `this task runs on ${runsOnWords(runsOn)}` : "";
  if (runsOn && fitting?.length === 0) {
    return {
      why: `${needs}, and no machine this hub knows is one`,
      fix: "join one, or change its runs_on",
    };
  }
  const up = fitting?.filter((machine) => fleet.online(machine.machineId));
  if (fitting && up?.length === 0) {
    return {
      why: `${needs}, and none is online (${named(fitting)} ${fitting.length === 1 ? "is" : "are"} offline)`,
      fix: "bring one online",
    };
  }
  if (checkouts.length > 0) {
    return up
      ? {
          why: `${needs}, and no checkout of ${project.name} is on one that is online (${named(up)})`,
          fix: "add a checkout place there",
        }
      : {
          why: `no checkout of ${project.name} is on a machine that is online (its checkouts are on ${named(checkouts)}), and its work is in its repository, not its folder on the hub`,
          fix: "bring one of those machines online, or add a checkout place on one that is",
        };
  }
  const hub = fleet.hubMachine;
  if (hub && fleet.online(hub) && up) {
    return {
      why: `${needs}, and ${project.name}'s one place is its folder on the hub, on ${named([{ machineId: hub }])}, which is not one`,
      fix: "add a checkout place on one, or change its runs_on",
    };
  }
  return {
    why: `${project.name}'s one place is its folder on the hub, and the hub's machine${hub ? ` (${named([{ machineId: hub }])})` : ""} runs no agent that is online`,
    fix: `bring its agent online, or add a checkout place of ${project.name} on a machine that is`,
  };
};

/** A clause as a sentence's start. */
export const capitalized = (clause: string): string =>
  clause.charAt(0).toUpperCase() + clause.slice(1);
