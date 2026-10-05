/**
 * What the update screens say, as pure functions of what the hub reports:
 * the Update cell of a machine, the Running cell, the rail's count and the
 * one notice. Nothing here knows Svelte.
 */
import type {
  BinaryUpdatePolicy,
  BinaryUpdateState,
} from "@cawco/core/binary-updates";

/** The part of a machine row these functions read. */
export interface UpdateMachine {
  binaryUpdate?: BinaryUpdateState;
  build?: { commit?: string };
  hostname: string;
  machineId: string;
  status: string;
}

export const isOnline = (machine: { status: string }): boolean =>
  machine.status === "online";

const NIGHTLY_SUFFIX = /-nightly\.(\d+)$/;
const LIST_MARK = /^(?:[-*+]|\d+\.)\s+/;

/** A version as people read it: no build suffix, and a nightly as `nightly 412`. */
export function displayVersion(version: string): string {
  const plus = version.indexOf("+");
  const bare = plus === -1 ? version : version.slice(0, plus);
  const nightly = NIGHTLY_SUFFIX.exec(bare);
  return nightly ? `nightly ${nightly[1]}` : bare;
}

/** The release notes as plain lines: no blanks, headings or list marks. */
export function noteLines(notes: string | undefined): string[] {
  if (!notes) {
    return [];
  }
  return notes
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => line.replace(LIST_MARK, ""));
}

export const plural = (n: number, noun: string): string =>
  `${n} ${noun}${n === 1 ? "" : "s"}`;

export type CellButton = "retry" | "error" | "cancel" | "install";
export type CellIcon = "clock" | "download" | "spinner";

export interface Cell {
  buttons: CellButton[];
  /** A failure: the destructive badge with the error dot. */
  fail: boolean;
  icon?: CellIcon;
  /** A second line under the words. */
  meta?: string;
  /** Plain muted words with no badge (`Runs from source`). */
  plain: boolean;
  /** Which row of the table in the spec matched. */
  row: number;
  text: string;
}

const EMPTY = (row: number): Cell => ({
  row,
  text: "",
  plain: false,
  fail: false,
  buttons: [],
});

const channelName = (channel: BinaryUpdatePolicy["channel"]): string =>
  channel === "nightly" ? "Nightly" : "Stable";

const words = (...parts: string[]): string =>
  parts.filter((part) => part !== "").join(" ");

/** The cell a machine's Update column shows. First match wins. */
export function cellFor(
  machine: UpdateMachine,
  policy: BinaryUpdatePolicy
): Cell {
  if (!isOnline(machine)) {
    return EMPTY(1);
  }
  const u = machine.binaryUpdate;
  if (!u) {
    return { ...EMPTY(2), plain: true, text: "Runs from source" };
  }
  const v = u.availableVersion ? displayVersion(u.availableVersion) : "";
  const cur = displayVersion(u.installedVersion);
  switch (u.phase) {
    case "failed-rolled-back":
      return {
        ...EMPTY(3),
        fail: true,
        text: `${u.failedVersion ? displayVersion(u.failedVersion) : "The update"} did not start. Rolled back to ${cur}, which is running.`,
        buttons: ["retry", "error"],
      };
    case "failed":
      return {
        ...EMPTY(4),
        fail: true,
        text: v
          ? `${v} did not install. It retries by itself.`
          : "The update did not install. It retries by itself.",
        buttons: ["error"],
      };
    case "installing":
      return { ...EMPTY(5), icon: "spinner", text: words("Installing", v) };
    case "downloading":
      return { ...EMPTY(6), icon: "spinner", text: words("Downloading", v) };
    case "ready":
      return {
        ...EMPTY(7),
        icon: "clock",
        text: words(v, "installs when idle"),
        meta:
          u.waitingFor !== undefined && u.waitingFor > 0
            ? `${plural(u.waitingFor, "session")} working`
            : undefined,
        buttons: policy.autoUpdate ? [] : ["cancel"],
      };
    case "waiting-sessions": {
      if (u.installedVersion === u.availableVersion) {
        return EMPTY(8);
      }
      const held = u.heldChildren ?? 0;
      return {
        ...EMPTY(9),
        icon: "clock",
        text: words(
          v,
          `installs when ${held} ${held === 1 ? "session ends" : "sessions end"}`
        ),
      };
    }
    case "waiting-for-channel":
      return {
        ...EMPTY(10),
        icon: "clock",
        text: `Stays on ${cur} until ${channelName(policy.channel)} has a newer build`,
      };
    case "available":
      return {
        ...EMPTY(11),
        icon: "download",
        text: words(v, "available"),
        buttons: ["install"],
      };
    default:
      return EMPTY(12);
  }
}

/** The build is the newest there is: rows 8 and 12 of the table. */
export function isCurrent(machine: UpdateMachine): boolean {
  if (!(isOnline(machine) && machine.binaryUpdate)) {
    return false;
  }
  const { row } = cellFor(machine, { autoUpdate: true, channel: "stable" });
  return row === 8 || row === 12;
}

/** What the Running cell says: the version, or the commit of a source checkout, or a dash. */
export function runningOf(machine: UpdateMachine): string {
  if (!isOnline(machine)) {
    return "—";
  }
  if (machine.binaryUpdate) {
    return displayVersion(machine.binaryUpdate.installedVersion);
  }
  return machine.build?.commit ? machine.build.commit.slice(0, 7) : "—";
}

/** Machines waiting on the operator: a failed update, or (auto-update off) one to install. */
export function attention(
  machines: UpdateMachine[],
  policy: BinaryUpdatePolicy
): number {
  return machines.filter((machine) => {
    const { row } = cellFor(machine, policy);
    return row === 3 || row === 4 || (row === 11 && !policy.autoUpdate);
  }).length;
}

/** The machines with an update to install now (row 11). */
export const installable = (
  machines: UpdateMachine[],
  policy: BinaryUpdatePolicy
): UpdateMachine[] =>
  machines.filter((machine) => cellFor(machine, policy).row === 11);

// ── the notice ───────────────────────────────────────────────────────────

export type NoticeKind = 1 | 2 | 3 | 4 | 5 | 6;
export type LineState = "plain" | "done" | "busy" | "wait";

export interface NoticeLine {
  state: LineState;
  text: string;
}

export interface Notice {
  /** The primary button, when the notice has one. */
  action?: "retry" | "install-all";
  /** Caw: a still mark, or (needs-you) the one that moves. */
  caw: { moves: boolean; status: string };
  /** Machines the notice stands for, by id. */
  closing?: string;
  /** `Configure updates` is offered. */
  configure: boolean;
  /** Show the failure glyph before the title. */
  failed: boolean;
  kind: NoticeKind;
  lines: NoticeLine[];
  /** Ids of the machines it stands for. */
  machineIds: string[];
  title: string;
  /** The version the notice speaks of, as shown. */
  version: string;
}

export interface NoticeInput {
  /** The machines whose install this tab commanded. */
  commanded: ReadonlySet<string>;
  /** `deployPending()`: the reload toast is up. */
  deployPending: boolean;
  /** Notices 4 and 5 the person dismissed, as `"{number}:{version}"`. */
  dismissed: ReadonlySet<string>;
  /** Whether notice 2 was dismissed for this exact commanded set. */
  installingDismissed: boolean;
  machines: UpdateMachine[];
  policy: BinaryUpdatePolicy;
}

const doneOn = (u: BinaryUpdateState): boolean =>
  u.availableVersion !== undefined && u.installedVersion === u.availableVersion;

const byName = (a: UpdateMachine, b: UpdateMachine): number =>
  a.hostname.localeCompare(b.hostname);

/** The first three note lines, then `and N more`. */
export function noticeNotes(notes: string | undefined): NoticeLine[] {
  const lines = noteLines(notes);
  const shown: NoticeLine[] = lines
    .slice(0, 3)
    .map((text) => ({ state: "plain", text }));
  if (lines.length > 3) {
    shown.push({ state: "plain", text: `and ${lines.length - 3} more` });
  }
  return shown;
}

/** The key notices 4 and 5 store when dismissed. */
export const dismissKey = (notice: Notice): string =>
  `${notice.machineIds.length}:${notice.version}`;

/** What every notice builder reads: the machines that report an update, and how to name one. */
interface Ctx {
  input: NoticeInput;
  machines: UpdateMachine[];
  name: (machine: UpdateMachine) => string;
}

const stateOf = (machine: UpdateMachine): BinaryUpdateState =>
  machine.binaryUpdate as BinaryUpdateState;

const shownVersion = (version: string | undefined): string =>
  displayVersion(version ?? "");

/** 1. A rollback nobody has seen. */
function rolledBack({ machines, name }: Ctx): Notice | null {
  const [machine] = machines
    .filter((m) => {
      const state = stateOf(m);
      return state.phase === "failed-rolled-back" && state.unseen;
    })
    .sort(byName);
  if (!machine) {
    return null;
  }
  const state = stateOf(machine);
  const v = shownVersion(state.failedVersion ?? state.availableVersion);
  const cur = displayVersion(state.installedVersion);
  return {
    kind: 1,
    title: `CawCo ${v} did not install on ${name(machine)}`,
    failed: true,
    lines: [
      {
        state: "plain",
        text: `It did not start, so ${name(machine)} went back to ${cur} and is running. It will not try ${v} again by itself.`,
      },
    ],
    configure: true,
    action: "retry",
    caw: { status: "needs-you", moves: true },
    machineIds: [machine.machineId],
    version: v,
  };
}

const COMMANDED_PHASES: readonly string[] = [
  "available",
  "downloading",
  "ready",
  "installing",
];

/** One machine's line in the installing notice. */
function installLine(machine: UpdateMachine, name: string): NoticeLine {
  const state = stateOf(machine);
  if (doneOn(state)) {
    return { state: "done", text: `✓ ${name}` };
  }
  if (state.phase === "installing") {
    return { state: "busy", text: `${name} · restarting` };
  }
  if (state.phase === "downloading") {
    return { state: "busy", text: `${name} · downloading` };
  }
  if (
    state.phase === "ready" &&
    state.waitingFor !== undefined &&
    state.waitingFor > 0
  ) {
    return {
      state: "wait",
      text: `· ${name} · waiting for ${plural(state.waitingFor, "session")}`,
    };
  }
  return { state: "wait", text: `· ${name} · waiting` };
}

/** 2. An install this tab asked for, or the hub restarting under it. */
function installing({ input, machines, name }: Ctx): Notice | null {
  const inSet = machines
    .filter((m) => input.commanded.has(m.machineId) || stateOf(m).hostsHub)
    .filter(
      (m) =>
        input.commanded.has(m.machineId) || stateOf(m).phase === "installing"
    )
    .sort(byName);
  const running = inSet.some((m) => {
    const state = stateOf(m);
    return (
      (input.commanded.has(m.machineId) &&
        COMMANDED_PHASES.includes(state.phase)) ||
      (state.hostsHub && state.phase === "installing")
    );
  });
  if (!running || input.installingDismissed) {
    return null;
  }
  const v = shownVersion(
    inSet.map((m) => stateOf(m).availableVersion).find(Boolean)
  );
  const lines: NoticeLine[] = [];
  if (inSet.length > 1) {
    const done = inSet.filter((m) => doneOn(stateOf(m))).length;
    lines.push({
      state: "plain",
      text: `${done} of ${inSet.length} machines done`,
    });
  }
  if (inSet.length <= 3) {
    lines.push(...inSet.map((m) => installLine(m, name(m))));
  }
  const hub = inSet.find((m) => stateOf(m).hostsHub && !doneOn(stateOf(m)));
  return {
    kind: 2,
    title: `Installing CawCo ${v}`,
    failed: false,
    lines,
    closing: hub
      ? `The hub restarts with ${name(hub)}. This page reconnects by itself.`
      : undefined,
    configure: true,
    caw: { status: "working", moves: false },
    machineIds: inSet.map((m) => m.machineId),
    version: v,
  };
}

/** 3. Everything this tab asked for has landed. */
function landedAll({ input, machines }: Ctx): Notice | null {
  const asked = machines.filter((m) => input.commanded.has(m.machineId));
  if (asked.length === 0 || !asked.every((m) => doneOn(stateOf(m)))) {
    return null;
  }
  const v = shownVersion(stateOf(asked[0] as UpdateMachine).availableVersion);
  return {
    kind: 3,
    title: `CawCo ${v} is running on ${plural(asked.length, "machine")}`,
    failed: false,
    lines: [],
    configure: false,
    caw: { status: "done", moves: false },
    machineIds: asked.map((m) => m.machineId),
    version: v,
  };
}

/** 4. Auto-update is off and a build waits for a person. */
function waitsForYou({ input, machines }: Ctx): Notice | null {
  const waiting = installable(machines, input.policy).sort(byName);
  const [lead] = waiting;
  if (input.policy.autoUpdate || !lead) {
    return null;
  }
  const state = stateOf(lead);
  const v = shownVersion(state.availableVersion);
  return {
    kind: 4,
    title: `CawCo ${v} is ready`,
    failed: false,
    lines: noticeNotes(state.notes),
    closing: "Auto-update is off. It waits until you install it.",
    configure: true,
    action: "install-all",
    caw: { status: "needs-you", moves: true },
    machineIds: waiting.map((m) => m.machineId),
    version: v,
  };
}

/** 5. Auto-update is on and working sessions hold machines back. */
function heldBack({ input, machines }: Ctx): Notice | null {
  const held = machines
    .filter((m) => {
      const state = stateOf(m);
      return (
        state.phase === "ready" &&
        state.waitingFor !== undefined &&
        state.waitingFor > 0
      );
    })
    .sort(byName);
  const [lead] = held;
  if (!(input.policy.autoUpdate && lead)) {
    return null;
  }
  const state = stateOf(lead);
  const v = shownVersion(state.availableVersion);
  return {
    kind: 5,
    title: `CawCo ${v} is ready`,
    failed: false,
    lines: noticeNotes(state.notes),
    closing: `Each machine installs it when idle. ${held.length} ${held.length === 1 ? "is" : "are"} working now.`,
    configure: true,
    caw: { status: "ready", moves: false },
    machineIds: held.map((m) => m.machineId),
    version: v,
  };
}

/** 6. A build landed that nobody watched. */
function unwatched({ input, machines }: Ctx): Notice | null {
  const landed = machines
    .filter((m) => {
      const { row } = cellFor(m, input.policy);
      return (row === 8 || row === 12) && stateOf(m).unseen;
    })
    .sort(byName);
  const [lead] = landed;
  if (!lead) {
    return null;
  }
  const state = stateOf(lead);
  const v = displayVersion(state.installedVersion);
  return {
    kind: 6,
    title: `CawCo updated to ${v}`,
    failed: false,
    lines: noticeNotes(state.notes),
    configure: true,
    caw: { status: "sleeping", moves: false },
    machineIds: landed.map((m) => m.machineId),
    version: v,
  };
}

/** Notices 4 and 5 the person already dismissed are not shown again. */
const unlessDismissed = (notice: Notice | null, input: NoticeInput) =>
  notice && input.dismissed.has(dismissKey(notice)) ? null : notice;

/** The one notice the screen shows, or null. First match wins. */
export function noticeFor(
  input: NoticeInput,
  label: (hostname: string) => string
): Notice | null {
  if (input.deployPending) {
    return null;
  }
  const ctx: Ctx = {
    input,
    machines: input.machines.filter(
      (machine) => isOnline(machine) && machine.binaryUpdate
    ),
    name: (machine) => label(machine.hostname),
  };
  return (
    rolledBack(ctx) ??
    installing(ctx) ??
    landedAll(ctx) ??
    unlessDismissed(waitsForYou(ctx), input) ??
    unlessDismissed(heldBack(ctx), input) ??
    unwatched(ctx)
  );
}
