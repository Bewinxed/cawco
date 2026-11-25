/**
 * The project Settings view's contracts and derived section states: every
 * change the view sends up (settings-hub.svelte.ts carries it to the hub),
 * every place act, and the pure derivation of each section's standing and
 * the tab's fault count.
 */

import type { Account } from "@cawco/core/accounts";
import type { LandsMode } from "@cawco/core/injected";
import type { OutsiderRule } from "@cawco/core/outsiders";
import type { AgentHere, FolderForecast } from "@cawco/core/project-folders";
import type { TrackerDirection } from "@cawco/core/trackers";
import type { RepoSource } from "#lib/cawco/spawn/RepoPicker.svelte";
import type { LargeFiles, SettingsRecord } from "./records";

export type StageId = "tasks" | "sessions" | "waits" | "lands";

/** A key naming one control whose change can be in flight or refused. */
export type ChangeKey =
  | "taskHome"
  | "account"
  | "atLimit"
  | `decides.${string}`
  | "landing"
  | "largeFiles"
  | "outsiders"
  | "sync"
  | "addPlace"
  | `locate.${string}`
  | `drop.${string}`;

/** A tie the setup saves: the tracker, the sign-in, the repository or team, which way it syncs, and on GitHub the Project for columns (null: open and closed only). */
interface TieAsk {
  connection: string;
  direction: TrackerDirection;
  githubProject: string | null;
  home: "github" | "linear";
  target: string;
}

export type Change =
  | { key: "taskHome"; value: "files" }
  | { key: "tie"; value: TieAsk }
  | { key: "account"; value: string | null } // null: Fleet routing
  | { key: "atLimit"; value: "wait" | "move" }
  | { key: "decides"; kind: string; value: string }
  | { key: "decidesReset"; kind: string }
  | { key: "landing"; value: LandsMode }
  | { key: "largeFiles"; value: LargeFiles }
  | { key: "outsiders"; value: OutsiderRule };

/** A read the view waits on: still coming, what the hub answered, or why it could not. */
export type Read<T> =
  | { state: "reading" }
  | { state: "read"; value: T }
  | { state: "failed"; reason: string };

/** A key Add key saves as a sign-in (Configure's Connections' add form, its key way): its service, account, server and key. */
export interface KeyAsk {
  account: string;
  key: string;
  service: string;
  url: string;
}

/** A sign-in a tie can use, by its name. */
export interface SetupConnection {
  account: string;
  name: string;
}

/**
 * What the tie's setup reads from the hub while it stands open
 * (settings-hub.svelte.ts): the sign-ins each tracker can use, a Linear
 * sign-in's teams, the GitHub Projects a sign-in reaches for a repository
 * (or GitHub's words when it may not read them), and a GitHub sign-in's
 * repositories for the repository picker. The setup asks with `read` from
 * an effect and draws what the reads hold.
 */
export interface TieSetup {
  connections: Partial<Record<"github" | "linear", Read<SetupConnection[]>>>;
  /** By `<connection> <owner/repo>`; `refused` holds GitHub's words when the sign-in may not read the owner's Projects. */
  projects: Record<
    string,
    Read<{
      projects: { id: string; linked: boolean; name: string }[];
      refused: string | null;
    }>
  >;
  read: (
    ask:
      | { kind: "connections"; home: "github" | "linear" }
      | { kind: "teams"; connection: string }
      | { kind: "projects"; connection: string; repo: string }
  ) => void;
  /** A GitHub sign-in's repositories, keyed `connection:<name>` (RepoPicker `source`). */
  repos: RepoSource;
  /** By connection. */
  teams: Record<string, Read<{ id: string; label: string }[]>>;
}

/** A place's acts that go at once: Stop using, and calling off a Change path held for a machine away. */
export type PlaceAct = "drop" | "callOffLocate";

/** A place's acts that open a step under its row: Move, Change path, Copy elsewhere. */
export type FlowAct = "move" | "find" | "copy";

/** What a step's act would do, read from the machine before anything runs. */
type FlowForecast =
  { state: "none" } | { state: "checking"; machine: string } | FolderForecast;

/**
 * The step open under one place's row, as the hub carries it
 * (settings-hub.svelte.ts): where it goes, what will happen there, the
 * agents working in the folder, and once it runs its stages, then what it
 * did.
 */
export interface PlaceFlow {
  act: FlowAct;
  after: { lines: string[] } | null;
  agents: AgentHere[];
  forecast: FlowForecast;
  /** The machine it goes to; Change path's is the place's own. */
  machineId: string | null;
  path: string;
  placeId: string;
  /** The hub's words for an act it refused. */
  refused: string | null;
  run: {
    at: number;
    callOff: boolean;
    failed: { stage: string; words: string } | null;
    progress: string | null;
    stages: string[];
    waitingFor: string | null;
  } | null;
  sending: boolean;
}

/** What the person does in a place's step. */
export type FlowEvent =
  | { kind: "open"; act: FlowAct; placeId: string }
  | { kind: "draft"; machineId: string | null; path: string }
  | { kind: "run" }
  | { kind: "interrupt"; agentId: string }
  | { kind: "callOff" }
  | { kind: "tryStage" }
  | { kind: "close" };

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
  record: SettingsRecord;
  refused: Partial<Record<ChangeKey, string>>;
}

/** The control a change belongs to: where its refusal stands. */
export function keyOf(change: Change): ChangeKey {
  switch (change.key) {
    case "decides":
    case "decidesReset":
      return `decides.${change.kind}`;
    case "tie":
      return "taskHome";
    case "taskHome":
    case "account":
    case "atLimit":
    case "landing":
    case "largeFiles":
    case "outsiders":
      return change.key;
  }
}

/** The record once the hub has taken `change`. */
export function applied(base: SettingsRecord, change: Change): SettingsRecord {
  switch (change.key) {
    case "taskHome":
      return { ...base, taskHome: "files", tie: null };
    case "tie":
      // The tie's own facts come with the hub's answer; until then the
      // tile stands on the tracker asked, and a tie to another stays.
      return {
        ...base,
        taskHome: change.value.home,
        tie: base.tie?.home === change.value.home ? base.tie : null,
      };
    case "account":
      return { ...base, account: { ...base.account, chosen: change.value } };
    case "atLimit":
      return { ...base, account: { ...base.account, atLimit: change.value } };
    case "decides":
    case "decidesReset": {
      const rule = base.whoDecides.rules[change.kind];
      if (base.whoDecides.unread !== null || !rule) {
        return base;
      }
      const by = change.key === "decides" ? change.value : rule.fleet;
      return {
        ...base,
        whoDecides: {
          ...base.whoDecides,
          rules: {
            ...base.whoDecides.rules,
            [change.kind]: { ...rule, by, own: by !== rule.fleet },
          },
        },
      };
    }
    case "landing":
      return { ...base, landing: change.value };
    case "largeFiles":
      return { ...base, largeFiles: change.value };
    case "outsiders":
      return { ...base, outsiders: change.value };
  }
}

/**
 * The one way every choice in the view moves, for every control at once. A change the person asked
 * stands in the record from the press until the hub answers: taken, the
 * hub's record carries it and the ask goes; refused, the ask goes, the
 * hub's value shows again, and the refusal stands at the control.
 */
export const withAsked = (
  record: SettingsRecord,
  asked: Iterable<Change>
): SettingsRecord => [...asked].reduce(applied, record);

/** What "Sessions start" and its places take: the stage's sends, the running move and the place acts. */
export interface PlacesProps extends StageSends {
  /** The step open under a place's row, or none. */
  flow: PlaceFlow | null;
  hrefOf: HrefOf;
  movingPlaceId: string | null;
  onaddplace: (machineId: string, path: string) => void;
  onflow: (event: FlowEvent) => void;
  onplace: (act: PlaceAct, placeId: string) => void;
  /** A form standing open as it mounts (adding a folder, the custom large-file server, a folder's Stop using said): a states file reads it without the press. */
  opening?: "folder" | "largeFiles" | `drop:${string}` | null;
}

/**
 * How a section's heading reads: settled (no mark), busy (the live dot: a
 * sync or a move running), away (a machine offline or a value read
 * earlier), fault (a real blocker).
 */
export type StageState = "settled" | "busy" | "away" | "fault";

/**
 * Whether the project's chosen account is signed out on every machine.
 * Fleet routing (chosen === null) never triggers a signed-out project fault.
 */
export function chosenAccountSignedOut(record: SettingsRecord): boolean {
  if (record.account.chosen === null) {
    return false;
  }
  const chosen = record.accounts.find(
    (account) => account.id === record.account.chosen
  );
  return chosen !== undefined && !chosen.signedIn;
}

/** Whether any machine place in this project sits on an offline machine. */
function hasOfflineMachinePlace(record: SettingsRecord): boolean {
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
 * The settings' sections, in the order they stand (HowItRuns): where tasks
 * sync, the folders agents run in, the code's repositories and large files
 * and where it lands, the account and its limit, and Who decides.
 */
export type SectionId = "tasks" | "places" | "git" | "account" | "waits";

/** What the hub reads for each section: a stage still reading or refused stands in its place. */
export const SECTION_READS: Record<SectionId, readonly StageId[]> = {
  tasks: ["tasks"],
  places: ["sessions"],
  git: ["sessions", "lands"],
  account: ["sessions"],
  waits: ["waits"],
};

/**
 * How each section's heading reads from the hub's record and any running
 * sync or move: settled (no mark), busy (the live dot), away (a machine
 * offline, or a value read earlier), fault (a real blocker).
 */
export function sectionStates(
  record: SettingsRecord,
  busy: { sync: boolean; movingPlaceId: string | null }
): Record<SectionId, StageState> {
  const away: StageState = record.hubReachable ? "settled" : "away";
  const tasks: StageState = (() => {
    if (
      busy.sync ||
      record.tie?.sync.kind === "syncing" ||
      record.tie?.sync.kind === "first"
    ) {
      return "busy";
    }
    if (record.tie?.sync.kind === "refused" || record.tie?.statusesRefused) {
      return "fault";
    }
    return away;
  })();
  const places: StageState = (() => {
    if (busy.movingPlaceId !== null) {
      return "busy";
    }
    if (record.places.some((place) => place.missing)) {
      return "fault";
    }
    return hasOfflineMachinePlace(record) ? "away" : away;
  })();
  const account: StageState = chosenAccountSignedOut(record) ? "fault" : away;
  const waits: StageState = record.whoDecides.unread === null ? away : "fault";
  return { tasks, places, git: away, account, waits };
}

/**
 * Number of the project's sections in fault (a refused sync, a missing
 * folder, a signed-out named account, an unreadable Who decides). Read by
 * the project page's settings tab badge.
 */
export function faultCount(record: SettingsRecord): number {
  const states = sectionStates(record, { sync: false, movingPlaceId: null });
  return Object.values(states).filter((state) => state === "fault").length;
}

/** The fleet's accounts as the account picker lists them (AccountPickRows), each by the name it carries everywhere. */
export const pickAccounts = (record: SettingsRecord): Account[] =>
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
