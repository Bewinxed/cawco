/**
 * Contracts and derived stage-state helpers for Option 2 ("How it runs"):
 * every change the view sends up to the project page, every place action,
 * and the pure derivation of each pipeline stage's standing and fault count.
 */

import type { Account } from "@cawco/core/accounts";
import {
  CHOICE_KINDS,
  type ChoiceKind,
  type Decider,
  type HowItRunsRecord,
  type Landing,
  type LargeFiles,
  type TaskHome,
} from "./records";

export type StageId = "tasks" | "sessions" | "waits" | "lands";

/** A key naming one control whose change can be in flight or refused. */
export type ChangeKey =
  | "taskHome"
  | "account"
  | "atLimit"
  | `decides.${ChoiceKind}`
  | "review"
  | "landing"
  | "largeFiles"
  | "sync"
  | "addPlace";

export type Change =
  | { key: "taskHome"; value: TaskHome }
  | { key: "account"; value: string | null } // null: Fleet routing
  | { key: "atLimit"; value: "wait" | "move" }
  | { key: "decides"; kind: ChoiceKind; value: Decider }
  | { key: "decidesReset"; kind: ChoiceKind }
  | { key: "review"; value: boolean }
  | { key: "landing"; value: Landing }
  | { key: "largeFiles"; value: LargeFiles };

export type PlaceAct = "move" | "find" | "copy" | "drop";

/** Configure's pages the stages link to: Accounts, Connections, the fleet's Who decides. */
export type HrefOf = (
  page: "accounts" | "connections" | "fleetDecides"
) => string;

/**
 * What every stage that sends a change takes: the record as the person sees
 * it (the hub's, with every change still being asked already in it:
 * {@link withAsked}), the acts still running, the changes refused, and where
 * a change goes.
 */
export interface StageSends {
  onchange: (change: Change) => void;
  onretry: (key: ChangeKey) => void;
  /** Acts still running (a sync, a place being added): a choice is never pending, it has moved already. */
  pending: ChangeKey[];
  record: HowItRunsRecord;
  refused: Partial<Record<ChangeKey, string>>;
}

/** The control a change belongs to: where its refusal stands. */
export function keyOf(change: Change): ChangeKey {
  switch (change.key) {
    case "decides":
    case "decidesReset":
      return `decides.${change.kind}`;
    case "taskHome":
    case "account":
    case "atLimit":
    case "review":
    case "landing":
    case "largeFiles":
      return change.key;
  }
}

/** The record once the hub has taken `change`. */
export function applied(
  base: HowItRunsRecord,
  change: Change
): HowItRunsRecord {
  switch (change.key) {
    case "taskHome":
      return {
        ...base,
        taskHome: change.value,
        tie: change.value === "files" ? null : base.tie,
      };
    case "account":
      return { ...base, account: { ...base.account, chosen: change.value } };
    case "atLimit":
      return { ...base, account: { ...base.account, atLimit: change.value } };
    case "decides":
    case "decidesReset": {
      if (!base.whoDecides.ok) {
        return base;
      }
      const rule = base.whoDecides.rules[change.kind];
      const by = change.key === "decides" ? change.value : rule.fleet;
      return {
        ...base,
        whoDecides: {
          ok: true,
          rules: {
            ...base.whoDecides.rules,
            [change.kind]: { ...rule, by, own: by !== rule.fleet },
          },
        },
      };
    }
    case "review":
      return { ...base, reviewBeforeDone: change.value };
    case "landing":
      return { ...base, landing: change.value };
    case "largeFiles":
      return { ...base, largeFiles: change.value };
  }
}

/**
 * The one way every choice on the work path moves: the dashboard's
 * `asked ?? record` (ProjectDetails' lands, account and at-its-limit, Who
 * decides' review), for every control at once. A change the person asked
 * stands in the record from the press until the hub answers: taken, the
 * hub's record carries it and the ask goes; refused, the ask goes, the
 * hub's value shows again, and the refusal stands at the control.
 */
export const withAsked = (
  record: HowItRunsRecord,
  asked: Iterable<Change>
): HowItRunsRecord => [...asked].reduce(applied, record);

/** What "Sessions start" and its places take: the stage's sends, the running move and the place acts. */
export interface SessionsStartProps extends StageSends {
  hrefOf: HrefOf;
  movingPlaceId: string | null;
  onaddplace: (machineId: string, path: string) => void;
  onplace: (act: PlaceAct, placeId: string) => void;
  /** A form standing open as it mounts (adding a folder, the custom large-file server, a folder's Stop using said): a states file reads it without the press. */
  opening?: "folder" | "largeFiles" | `drop:${string}` | null;
}

/**
 * How a stage's node reads: settled (neutral), busy (blue live dot: a sync or
 * a move running), away (yellow: a machine offline or a value read earlier),
 * fault (crimson: a real blocker).
 */
export type StageState = "settled" | "busy" | "away" | "fault";

/**
 * Whether the project's chosen account is signed out on every machine.
 * Fleet routing (chosen === null) never triggers a signed-out project fault.
 */
export function chosenAccountSignedOut(record: HowItRunsRecord): boolean {
  if (record.account.chosen === null) {
    return false;
  }
  const chosen = record.accounts.find(
    (account) => account.id === record.account.chosen
  );
  return chosen !== undefined && !chosen.signedIn;
}

/** Whether any machine place in this project sits on an offline machine. */
function hasOfflineMachinePlace(record: HowItRunsRecord): boolean {
  const byId = new Map(record.machines.map((machine) => [machine.id, machine]));
  return record.places.some((place) => {
    if (place.machineId === null) {
      return false;
    }
    const machine = byId.get(place.machineId);
    return machine !== undefined && !machine.online;
  });
}

/**
 * Derive the rail node state for each of the four pipeline stages from the
 * hub's record and any active sync or move.
 */
export function stageStates(
  record: HowItRunsRecord,
  busy: { sync: boolean; movingPlaceId: string | null }
): Record<StageId, StageState> {
  const tasks: StageState = (() => {
    if (
      busy.sync ||
      record.tie?.sync.kind === "syncing" ||
      record.tie?.sync.kind === "first"
    ) {
      return "busy";
    }
    if (record.tie?.sync.kind === "refused") {
      return "fault";
    }
    if (!record.hubReachable) {
      return "away";
    }
    return "settled";
  })();

  const sessions: StageState = (() => {
    if (busy.movingPlaceId !== null) {
      return "busy";
    }
    const hasMissingPlace = record.places.some((place) => place.missing);
    if (hasMissingPlace || chosenAccountSignedOut(record)) {
      return "fault";
    }
    if (!record.hubReachable || hasOfflineMachinePlace(record)) {
      return "away";
    }
    return "settled";
  })();

  const waits: StageState = (() => {
    if (!record.whoDecides.ok) {
      return "fault";
    }
    if (!record.hubReachable) {
      return "away";
    }
    return "settled";
  })();

  const lands: StageState = record.hubReachable ? "settled" : "away";

  return { tasks, sessions, waits, lands };
}

/**
 * Number of active pipeline stages currently in fault (at most one per stage:
 * a refused sync, a missing place or signed-out chosen account, or unreadable
 * Who decides). Read by the project page's "How it runs" tab badge.
 */
export function faultCount(record: HowItRunsRecord): number {
  const states = stageStates(record, { sync: false, movingPlaceId: null });
  const active: StageId[] = record.holdsCode
    ? ["tasks", "sessions", "waits", "lands"]
    : ["tasks", "sessions", "waits"];
  return active.filter((stage) => states[stage] === "fault").length;
}

/** The fleet's accounts as the account picker lists them (AccountPickRows), each by the name it carries everywhere. */
export const pickAccounts = (record: HowItRunsRecord): Account[] =>
  record.accounts.map((account, order) => ({
    atPlanLimit: "move",
    createdAt: 0,
    email: null,
    hue: account.hue,
    id: account.id,
    identity: null,
    kind: "subscription",
    label: account.name,
    neverBackup: false,
    order,
    provider: account.provider,
    reservePct: null,
    sessionReservePct: null,
  }));

/** The kinds of choice this project set itself, which Reset to defaults puts back on the fleet's choice. */
export const ownKinds = (record: HowItRunsRecord): ChoiceKind[] => {
  const { whoDecides } = record;
  return whoDecides.ok
    ? CHOICE_KINDS.filter((kind) => whoDecides.rules[kind].own)
    : [];
};
