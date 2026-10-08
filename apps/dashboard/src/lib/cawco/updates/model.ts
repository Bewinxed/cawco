/**
 * What the update screens say, as pure functions of what the hub reports:
 * the Update cell of a machine, the Running cell, the rail's count and the
 * one notice. Nothing here knows Svelte.
 */
import {
  type BinaryUpdatePolicy,
  type BinaryUpdateState,
  holdPhrases,
  UPDATE_WAIT_CAP_MS,
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
const HEADING = /^#{1,6}\s+(.+?)\s*#*$/;

/** A version as people read it: no build suffix, and a nightly as `nightly 412`. */
export function displayVersion(version: string): string {
  const plus = version.indexOf("+");
  const bare = plus === -1 ? version : version.slice(0, plus);
  const nightly = NIGHTLY_SUFFIX.exec(bare);
  return nightly ? `nightly ${nightly[1]}` : bare;
}

/** One section of a release's notes: `### New`, `### Improved`, `### Fixed`, or none. */
interface NoteSection {
  heading?: string;
  items: string[];
}

/** A release's notes, as markdown every surface renders the same way. */
export interface ReleaseNotes {
  /** Bullets in all. */
  count: number;
  /** Every section, each its heading and then its bullets. */
  full: string;
  /** Bullets the summary holds. */
  shown: number;
  /**
   * The first section's heading and its first bullets: the top of `full`,
   * so the rows it shows stand where they stand in the whole.
   */
  summary: string;
}

/** Bullets the summary holds at most. */
const SUMMARY_ITEMS = 3;

/**
 * Splits the notes (docs/releases/README.md) at their headings: each
 * heading opens a section, each other line is one bullet of it. Notes
 * written before sections are bullets under no heading: one list.
 */
function sectionsOf(notes: string): NoteSection[] {
  const sections: NoteSection[] = [];
  let open: NoteSection | undefined;
  for (const raw of notes.split("\n")) {
    const line = raw.trim();
    if (line === "") {
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      open = { heading: heading[1], items: [] };
      sections.push(open);
      continue;
    }
    if (!open) {
      open = { items: [] };
      sections.push(open);
    }
    open.items.push(line.replace(LIST_MARK, ""));
  }
  return sections.filter((section) => section.items.length > 0);
}

const markdownOf = (sections: NoteSection[]): string =>
  sections
    .map((section) =>
      [
        ...(section.heading ? [`### ${section.heading}`, ""] : []),
        ...section.items.map((item) => `- ${item}`),
      ].join("\n")
    )
    .join("\n\n");

/** The notes a build carries, or null when it carries none. */
export function releaseNotes(notes: string | undefined): ReleaseNotes | null {
  const sections = sectionsOf(notes ?? "");
  const [first] = sections;
  if (!first) {
    return null;
  }
  const lead = { ...first, items: first.items.slice(0, SUMMARY_ITEMS) };
  return {
    full: markdownOf(sections),
    summary: markdownOf([lead]),
    count: sections.reduce((sum, section) => sum + section.items.length, 0),
    shown: lead.items.length,
  };
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

/**
 * What a ready build waits for, in words: the work in flight its restart
 * would cut (`2 tool calls`, `1 image generation`). Empty when nothing holds it.
 */
const waitsOn = (u: BinaryUpdateState): string[] =>
  u.phase === "ready" && u.waitingOn ? holdPhrases(u.waitingOn) : [];

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
    case "ready": {
      const waiting = waitsOn(u);
      return {
        ...EMPTY(7),
        icon: "clock",
        text: words(
          v,
          waiting.length > 0
            ? "installs when its work in flight ends"
            : "installs within a minute"
        ),
        meta: waiting.length > 0 ? waiting.join(" · ") : undefined,
        buttons: policy.autoUpdate ? [] : ["cancel"],
      };
    }
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

export type NoticeKind = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type LineState = "plain" | "done" | "busy" | "wait";

export interface NoticeLine {
  state: LineState;
  text: string;
}

export interface Notice {
  /**
   * The notice ids acknowledging it records on the hub (notices.svelte.ts):
   * the events it announces, so it is gone on every tab and device.
   */
  acks: string[];
  /** The primary button, when the notice has one. */
  action?: "retry" | "install-all" | "reload";
  /** Caw: a still mark, or (needs-you) the one that moves. */
  caw: { moves: boolean; status: string };
  /** Machines the notice stands for, by id. */
  closing?: string;
  /** `Configure update behaviour` (Configure › Updates) is offered. */
  configure: boolean;
  /** Show the failure glyph before the title. */
  failed: boolean;
  kind: NoticeKind;
  lines: NoticeLine[];
  /** Ids of the machines it stands for. */
  machineIds: string[];
  /** The build's release notes, for the notices that speak of one build (4, 5, 6). */
  notes?: ReleaseNotes | null;
  title: string;
  /** The version the notice speaks of, as shown. */
  version: string;
}

export interface NoticeInput {
  /** The machines whose install this tab commanded. */
  commanded: ReadonlySet<string>;
  machines: UpdateMachine[];
  /**
   * The build the dashboard serves, when it is newer than this tab
   * (served-build.svelte.ts); otherwise null.
   */
  newerBuild: string | null;
  policy: BinaryUpdatePolicy;
  /** The notice ids acknowledged on any tab or device (notices.svelte.ts). */
  seen: ReadonlySet<string>;
}

/** A landing's notice id: the landing itself, by its machine and when it finished. */
export const landingId = (machineId: string, landing: { at: number }): string =>
  `landed:${machineId}:${landing.at}`;

/** The reload's notice id: the dashboard build it offers. */
export const reloadId = (build: string): string => `reload:${build}`;

/** The machines, with every landing someone has acknowledged taken off. */
export function unseenLandings<T extends UpdateMachine>(
  machines: T[],
  seen: ReadonlySet<string>
): T[] {
  return machines.map((machine) => {
    const state = machine.binaryUpdate;
    return state?.landed && seen.has(landingId(machine.machineId, state.landed))
      ? { ...machine, binaryUpdate: { ...state, landed: undefined } }
      : machine;
  });
}

/** The ids of the landings the machines carry. */
const landingIds = (machines: UpdateMachine[]): string[] =>
  machines.flatMap((m) =>
    m.binaryUpdate?.landed
      ? [landingId(m.machineId, m.binaryUpdate.landed)]
      : []
  );

const doneOn = (u: BinaryUpdateState): boolean =>
  u.availableVersion !== undefined && u.installedVersion === u.availableVersion;

const byName = (a: UpdateMachine, b: UpdateMachine): number =>
  a.hostname.localeCompare(b.hostname);

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
    .filter((m) => stateOf(m).landed?.outcome === "rolled-back")
    .sort(byName);
  if (!machine) {
    return null;
  }
  const state = stateOf(machine);
  const v = shownVersion(state.landed?.version);
  const cur = displayVersion(state.installedVersion);
  return {
    acks: landingIds([machine]),
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

/** A keeper restart's notice id: the restart itself, by its machine and when the wedge was called. */
export const keeperRestartId = (machineId: string, at: number): string =>
  `keeper:${machineId}:${at}`;

/**
 * 8. A machine's session keeper stopped answering and the agent restarted it
 * (agent keeper-watchdog.ts). Every session it held ended with it, which is
 * why it is said even though nothing is left to do.
 */
function keeperRestarted({ input, machines, name }: Ctx): Notice | null {
  const [machine] = machines
    .filter((m) => {
      const restart = stateOf(m).keeperRestart;
      return (
        restart && !input.seen.has(keeperRestartId(m.machineId, restart.at))
      );
    })
    .sort(byName);
  const restart = machine && stateOf(machine).keeperRestart;
  if (!(machine && restart)) {
    return null;
  }
  const minutesSilent = Math.max(1, Math.round(restart.silentForMs / 60_000));
  return {
    acks: [keeperRestartId(machine.machineId, restart.at)],
    kind: 8,
    title: `The session keeper on ${name(machine)} was restarted`,
    failed: true,
    lines: [
      {
        state: "plain",
        text: `It stopped answering for ${plural(minutesSilent, "minute")} (${plural(restart.dials, "call")}, no reply), so no session could start there. It was restarted and sessions start there again.`,
      },
      {
        state: "plain",
        text: `${restart.children === 1 ? "The 1 process" : `The ${restart.children} processes`} it held ended with it: the sessions running there stopped.`,
      },
      {
        state: "plain",
        text: `What it was doing is saved on ${name(machine)} in ${restart.diagnostics}.`,
      },
    ],
    configure: false,
    caw: { status: "needs-you", moves: false },
    machineIds: [machine.machineId],
    version: "",
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
  const waiting = waitsOn(state);
  if (waiting.length > 0) {
    return {
      state: "wait",
      text: `· ${name} · waiting for ${waiting.join(", ")}`,
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
  if (!running) {
    return null;
  }
  const v = shownVersion(
    inSet.map((m) => stateOf(m).availableVersion).find(Boolean)
  );
  // This install of this build on these machines: a new command shows it again.
  const id = `installing:${v}:${inSet.map((m) => m.machineId).join(",")}`;
  if (input.seen.has(id)) {
    return null;
  }
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
    acks: [id],
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
    // What landed is said here, so it is not announced again (notice 6).
    acks: landingIds(asked),
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

/**
 * Notices 4 and 5's id: the build and how many machines wait for it, so
 * one more machine waiting shows it again.
 */
const readyId = (count: number, version: string): string =>
  `ready:${count}:${version}`;

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
    acks: [readyId(waiting.length, v)],
    kind: 4,
    title: `CawCo ${v} is ready`,
    failed: false,
    lines: [],
    notes: releaseNotes(state.notes),
    closing: "Auto-update is off. It waits until you install it.",
    configure: true,
    action: "install-all",
    caw: { status: "needs-you", moves: true },
    machineIds: waiting.map((m) => m.machineId),
    version: v,
  };
}

/** 5. Auto-update is on and work in flight holds machines back. */
function heldBack({ input, machines }: Ctx): Notice | null {
  const held = machines
    .filter((m) => waitsOn(stateOf(m)).length > 0)
    .sort(byName);
  const [lead] = held;
  if (!(input.policy.autoUpdate && lead)) {
    return null;
  }
  const state = stateOf(lead);
  const v = shownVersion(state.availableVersion);
  return {
    acks: [readyId(held.length, v)],
    kind: 5,
    title: `CawCo ${v} is ready`,
    failed: false,
    lines: [],
    notes: releaseNotes(state.notes),
    closing: `Each machine installs it once its work in flight ends, within ${UPDATE_WAIT_CAP_MS / 60_000} minutes. Turns keep running through it. ${held.length} ${held.length === 1 ? "is" : "are"} waiting now.`,
    configure: true,
    caw: { status: "ready", moves: false },
    machineIds: held.map((m) => m.machineId),
    version: v,
  };
}

/**
 * 6. A build landed that nobody has acknowledged. The toast shows the notes'
 * summary and opens to the whole; the Home card shows the whole. It stands for
 * the landing itself (`landed`), so nothing else the machine reports
 * afterwards brings it back once it is acknowledged. The machines given have
 * the acknowledged landings taken off (`unseenLandings`).
 */
export function updatedNotice(machines: UpdateMachine[]): Notice | null {
  const landed = machines
    .filter(
      (m) => isOnline(m) && m.binaryUpdate?.landed?.outcome === "installed"
    )
    .sort(byName);
  const [lead] = landed;
  const landing = lead?.binaryUpdate?.landed;
  if (!landing) {
    return null;
  }
  const v = displayVersion(landing.version);
  return {
    acks: landingIds(landed),
    kind: 6,
    title: `CawCo updated to ${v}`,
    failed: false,
    lines: [],
    notes: releaseNotes(landing.notes),
    configure: true,
    caw: { status: "sleeping", moves: false },
    machineIds: landed.map((m) => m.machineId),
    version: v,
  };
}

/** 7. This tab is older than the dashboard serving it, and nothing landed to say why. */
export const reloadNotice = (build: string): Notice => ({
  acks: [reloadId(build)],
  kind: 7,
  title: "CawCo updated",
  failed: false,
  // No "reload" line: the tab reloads by itself once it is idle
  // (reload.svelte.ts); the button is there to go now.
  lines: [],
  configure: false,
  action: "reload",
  caw: { status: "sleeping", moves: false },
  machineIds: [],
  version: "",
});

/**
 * A landing's notice on a tab that is older than it: it offers the reload,
 * and acknowledging it acknowledges the reload too.
 */
const withReload = (notice: Notice | null, build: string): Notice | null =>
  notice
    ? { ...notice, action: "reload", acks: [...notice.acks, reloadId(build)] }
    : null;

/** Notices 4 and 5 someone already acknowledged are not shown again. */
const unlessSeen = (notice: Notice | null, input: NoticeInput) =>
  notice?.acks.every((id) => input.seen.has(id)) ? null : notice;

/**
 * The one notice the screen shows, or null. First match wins. A tab older
 * than the dashboard serving it is one notice too, not a second box: the
 * landing that replaced the dashboard says so and offers the reload, and
 * with no landing to announce the reload says it alone. Everything else
 * waits for the reload, since an old tab may misread what it is sent.
 * Choosing Reload acknowledges what the notice said, so the reloaded tab
 * does not say it again.
 */
export function noticeFor(
  input: NoticeInput,
  label: (hostname: string) => string
): Notice | null {
  const machines = unseenLandings(input.machines, input.seen);
  const ctx: Ctx = {
    input,
    machines: machines.filter(
      (machine) => isOnline(machine) && machine.binaryUpdate
    ),
    name: (machine) => label(machine.hostname),
  };
  const build = input.newerBuild;
  if (build !== null && !input.seen.has(reloadId(build))) {
    return (
      withReload(landedAll(ctx), build) ??
      withReload(updatedNotice(machines), build) ??
      reloadNotice(build)
    );
  }
  return (
    rolledBack(ctx) ??
    keeperRestarted(ctx) ??
    installing(ctx) ??
    landedAll(ctx) ??
    unlessSeen(waitsForYou(ctx), input) ??
    unlessSeen(heldBack(ctx), input) ??
    updatedNotice(machines)
  );
}
