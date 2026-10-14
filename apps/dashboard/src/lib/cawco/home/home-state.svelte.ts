/**
 * What the home says, as one model both of its places read: the phone's
 * home page and the wide screen's sidebar draw the same groups from here.
 *
 * - Status: the hub, the machines and today's spend, in one line.
 * - Needs you: every ask parked on the operator (a session's permission or
 *   question, a workflow run's question), longest wait first by the moment
 *   the hub parked it (`raisedAt`), so every device lists them alike.
 * - Working: sessions mid-turn, with what each is doing now.
 * - Finished: sessions whose turn ended, or that failed, since this device
 *   last opened them (the `finished` choice).
 * - Recent: everything else that can be opened — every session none of the
 *   groups above shows, and the transcripts stored on the machines.
 */
import type {
  ApprovedActionView,
  FleetWatchNotice,
  NeutralSessionInfo,
  ProjectCap,
  WorkflowRun,
} from "@cawco/core";
import {
  archiveRefusal,
  machineLabel,
  projectsFor,
  questionsOf,
  topsIn,
} from "@cawco/core";
import {
  type BlockedRequest,
  cawco,
  type HubState,
  type InstanceRow,
  isFailed,
  isStale,
} from "../client.svelte";
import { buildConvergence } from "../convergence";
import { machineFaults } from "../fleet-faults";
import {
  catalogTitle,
  conversationHref,
  indexInstances,
  instanceForSession,
  resolveSessionTitle,
} from "../links";
import { signInWarning } from "../machine";
import { type MarkHue, markHue } from "../mark";
import { heldOrder } from "../motion/held-order.svelte";
import { folderOf } from "../projects";
import { rail } from "../rail.svelte";
import { onRow } from "../session-acts.svelte";
import { threadIdOf, threadTabId } from "../thread-tabs";
import { hasParent, rooted, tree } from "../tree";
import { runHref, runIdOf } from "../workflow-runs";
import { workflowState } from "../workflow-state.svelte";
import { choices } from "./choices.svelte";

/* ── Seen, on the hub ──────────────────────────────────────────────────
   What "finished since you last looked" means is the owner's looking on
   any device: each session and run carries `seenAt` from the hub, and
   every dashboard hears it change on the frames it already reads. Every
   time read against it is the hub's too (`endedAt`): no device's clock,
   and no machine's, is ever compared with the hub's. */

/** One mark this dashboard made that the hub has not yet echoed back. */
interface SeenMark {
  /** The hub's stamp of the mark, once its answer is in: the `seenAt` its echo carries. */
  at?: number;
  /** Tells this mark from a later one on the same row. */
  mark: number;
  /** The end it marked seen, on the hub's clock (`endedAt`). */
  through: number;
}

/**
 * What this dashboard marked seen and the hub has not yet echoed back. A
 * look is marked in the moment it happens; an archive once the hub has
 * taken it, so the row leaves Finished on the hub's answer rather than a
 * frame later. Each goes once the row's `seenAt` reaches the hub's stamp of
 * it, so a later change on the hub (an unarchive on another device) is never
 * masked.
 */
const seenHere = $state<Record<string, SeenMark>>({});
let seenMarks = 0;

/**
 * What this dashboard unarchived and the hub has not yet echoed back: the
 * `seenAt` the row still carried. The row counts as never seen while its
 * `seenAt` is that; once the hub's frame changes it, the entry lapses.
 */
const clearedHere = $state<Record<string, number>>({});

const epochOf = (value: string | number | Date | null | undefined): number => {
  const at = value ? new Date(value).getTime() : 0;
  return Number.isNaN(at) ? 0 : at;
};

/** When the owner last looked at it or archived it, on any device. */
export const seenAt = (row: InstanceRow): number =>
  clearedHere[row.id] === epochOf(row.seenAt)
    ? 0
    : Math.max(epochOf(row.seenAt), seenHere[row.id]?.through ?? 0);

/**
 * Drops each mark the hub has echoed: the row's `seenAt` has reached the
 * hub's stamp of it, or the row is gone. Called on the hub's answer and
 * on every change to the rows (`HomeState`'s effect).
 */
function settleSeen(): void {
  for (const [id, mark] of Object.entries(seenHere)) {
    if (mark.at === undefined) {
      continue;
    }
    const row = cawco.instanceIndex.byId.get(id);
    if (!row || epochOf(row.seenAt) >= mark.at) {
      delete seenHere[id];
    }
  }
}

/**
 * Tells the hub sessions (and runs, as `run:<id>`) were seen, archived or
 * unarchived, and resolves with its stamp (null for an unarchive). A
 * refusal is thrown in the hub's sentence, with the row's own id taken out
 * of it: it is said on that row.
 */
async function postSeen(
  ids: string[],
  kind: "archive" | "look" | "unarchive"
): Promise<number | null> {
  const response = await fetch("/api/seen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, kind }),
  });
  if (!response.ok) {
    let said = (await response.text()).trim();
    for (const id of ids) {
      said = said.replaceAll(`${id}: `, "");
    }
    throw new Error(said || `The hub answered ${response.status}.`);
  }
  const { at } = (await response.json()) as { at: number | null };
  return at;
}

/**
 * Records that the reader has a conversation in front of them, ended: seen
 * through the end it shows now, on the hub's clock, in the moment it is
 * looked at (a turn that ends while the mark is on its way is news again).
 * Nobody asked for it, so a refusal only takes the mark back.
 */
export function markOpened(id: string): void {
  seenMarks += 1;
  const mark = seenMarks;
  const row = cawco.instanceIndex.byId.get(id);
  seenHere[id] = { mark, through: (row && endedAt(row)) ?? 0 };
  delete clearedHere[id];
  const ours = () => seenHere[id]?.mark === mark;
  postSeen([id], "look").then(
    (at) => {
      if (ours() && at !== null) {
        (seenHere[id] as SeenMark).at = at;
      }
      settleSeen();
    },
    (error: unknown) => {
      if (ours()) {
        delete seenHere[id];
      }
      console.error("[cawco] marking seen failed:", error);
    }
  );
}

/**
 * Takes sessions (and runs, as `run:<id>`) off Finished without opening
 * them, so each is listed again only when it ends another turn. Only what
 * `home.archivable` allows is ever offered; the hub holds the same rule
 * (core `archiveRefusal`). Each is asked on its own: its row says
 * "Archiving…" and leaves Finished on the hub's answer, and one the hub
 * refuses stays, its reason under it, while the others go.
 */
export function archive(ids: string[]): void {
  for (const id of ids) {
    const row = cawco.instanceIndex.byId.get(id);
    const through = (row && endedAt(row)) ?? 0;
    // biome-ignore lint/complexity/noVoid: the row is the report; nothing awaits it
    void onRow(
      id,
      "Archiving…",
      async () => {
        const at = await postSeen([id], "archive");
        seenMarks += 1;
        seenHere[id] = { mark: seenMarks, through, at: at ?? undefined };
        delete clearedHere[id];
        settleSeen();
      },
      () => archive([id])
    );
  }
}

/**
 * Puts an archived session back in Finished: the hub clears its `seenAt`
 * and leaves keep-alive as it is. As archive's, the row moves on the hub's
 * answer, and a refusal stays on it.
 */
export function unarchive(rows: InstanceRow[]): void {
  for (const row of rows) {
    // biome-ignore lint/complexity/noVoid: the row is the report; nothing awaits it
    void onRow(
      row.id,
      "Unarchiving…",
      async () => {
        const was = epochOf(row.seenAt);
        await postSeen([row.id], "unarchive");
        clearedHere[row.id] = was;
        delete seenHere[row.id];
      },
      () => unarchive([row])
    );
  }
}

/* ── One clock for every age on the home ──────────────────────────── */

let tick = $state(Date.now());
let ticker: ReturnType<typeof setInterval> | undefined;

/** The minute-grained now every wait and elapsed time reads. */
export const clock = {
  get now(): number {
    if (ticker === undefined && typeof window !== "undefined") {
      ticker = setInterval(() => {
        tick = Date.now();
      }, 15_000);
    }
    return tick;
  },
};

/** "4m", "1h 12m", "2d": how long, at the grain a glance needs. */
export function span(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 1) {
    return "now";
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
  }
  return `${Math.floor(hours / 24)}d`;
}

/* ── Shapes ────────────────────────────────────────────────────────── */

export interface AskItem {
  /** What it asks, in plain words. */
  ask: string;
  /** Where the session runs: its mark's hue, the seed every list uses. */
  cwd: string;
  /** The session that asked; it is answered there. */
  instanceId: string;
  isQuestion: boolean;
  key: string;
  kind: "ask";
  /** Its machine: the name the fleet gives it and the daemon's `platform-arch` fingerprint (OsMark). */
  machine: { name: string; os: string };
  machineId: string;
  /**
   * The session whose pane draws the ask when it is not its own (a memory
   * curator run's proposal): the row opens that session; null otherwise.
   */
  origin: string | null;
  /** machine · project */
  place: string;
  /** The project it runs in, named as the rail names it, with its mark's hue; null outside any. */
  project: ProjectMarking | null;
  /** When the hub parked it, ms epoch. */
  raisedAt: number | undefined;
  request: BlockedRequest["request"];
  /** Its machine is offline: it still stands, and answering waits for it. */
  stale: boolean;
  /**
   * Where it opens: the thread a project's Caw asked in (thread-tabs.ts), so
   * his lead session is never a card's place; null opens the session.
   */
  thread: string | null;
  title: string;
}

export interface RunItem {
  href: string;
  key: string;
  kind: "run";
  place: string;
  raisedAt: number | undefined;
  run: WorkflowRun;
  title: string;
}

/** A project past its spend cap: once, until its period ends or the cap is raised. */
export interface CapItem {
  cap: ProjectCap;
  href: string;
  key: string;
  kind: "cap";
  place: string;
  raisedAt: undefined;
  title: string;
}

/**
 * An approved action waiting on you (actions.ts on the hub): one exact call
 * to approve or deny, or one that failed or whose call may or may not have
 * happened, to read and remove.
 */
export interface ActionItem {
  action: ApprovedActionView;
  /** The project's page, at the task when it has one. */
  href: string;
  key: string;
  kind: "action";
  place: string;
  /** Its project, named and marked as the rail marks it. */
  project: ProjectMarking | null;
  raisedAt: number;
  title: string;
}

/**
 * Fleet watch telling you about a session (core `FleetWatchNotice`): a
 * triage said so, or its project's Caw is off. It opens the session, and
 * leaves once you write to it or it moves on.
 */
export interface WatchItem {
  cwd: string;
  href: string;
  instanceId: string;
  key: string;
  kind: "watch";
  machineId: string;
  notice: FleetWatchNotice;
  place: string;
  raisedAt: number;
  title: string;
}

export type NeedsItem = AskItem | RunItem | CapItem | ActionItem | WatchItem;

export interface RecentItem {
  at: number;
  href: string;
  info: NeutralSessionInfo | null;
  instance: InstanceRow | null;
  key: string;
  machineId: string;
  place: string;
  title: string;
}

/** A transcript stored on a machine, before it is named (see `Home.#stored`). */
interface StoredEntry {
  at: number;
  info: NeutralSessionInfo;
  key: string;
  machineId: string;
  place: string;
}

/* ── Naming ────────────────────────────────────────────────────────── */

export const instanceTitle = (row: InstanceRow): string =>
  resolveSessionTitle({ title: row.title, cwd: row.cwd, id: row.id });

/**
 * What `/session/<id>` is called, in the bar and the document title alike:
 * the thread's title where Caw asked in one, else the session's; the board
 * (no id, or one the fleet does not hold yet) is Fleet.
 */
export function sessionName(id: string | undefined): string {
  if (!id) {
    return "Fleet";
  }
  const row = cawco.instanceIndex.byId.get(id);
  return cawco.threadOf(id)?.title ?? (row ? instanceTitle(row) : "Fleet");
}

export const machineName = (machineId: string): string => {
  const machine = cawco.machines.find((m) => m.machineId === machineId);
  return machine ? machineLabel(machine.hostname) : machineId;
};

/**
 * A workspace checkout is named `<project>-<8 hex>`: the hex is an id and
 * nobody reads ids, so the project's own name is what shows.
 */
const WORKSPACE_ID = /-[0-9a-f]{8}$/;

/** The project that holds the folder, else its leaf without a workspace id. */
export function projectOf(
  machineId: string,
  cwd: string | null | undefined
): string {
  const folder = cwd ?? "";
  const [project] = projectsFor(cawco.projects, { machineId, cwd: folder });
  return (
    project?.name ??
    (folder.split("/").filter(Boolean).pop() ?? "").replace(WORKSPACE_ID, "")
  );
}

/**
 * The project a row is named by: that of the session at the top of its
 * chain of parents (tree.ts `topsIn`), as the rail places it. Named by its
 * own machine and folder, a delegate in a worktree or on another machine
 * named no project, or another one.
 */
export function projectOfRow(row: InstanceRow): string {
  const top = topsIn(cawco.instanceIndex.byId)(row);
  return (
    projectsFor(cawco.projects, top)[0]?.name ??
    projectOf(top.machineId, top.cwd)
  );
}

/** A project as a row names it: its name and the hue its mark wears in the rail. */
export interface ProjectMarking {
  hue: MarkHue;
  name: string;
}

/**
 * The project a place is in, with its mark's hue: a fleet project's is the
 * rail's (`markHue(folderOf(project))`), a bare folder's its own path's.
 */
export function projectAt(
  machineId: string,
  cwd: string | null | undefined
): ProjectMarking | null {
  const folder = cwd ?? "";
  const [project] = projectsFor(cawco.projects, { machineId, cwd: folder });
  if (project) {
    return { name: project.name, hue: markHue(folderOf(project)) };
  }
  const name = projectOf(machineId, cwd);
  return name ? { name, hue: markHue(folder) } : null;
}

/** "machine · project". */
export function placeOf(
  machineId: string,
  cwd: string | null | undefined
): string {
  const where = projectOf(machineId, cwd);
  return where
    ? `${machineName(machineId)} · ${where}`
    : machineName(machineId);
}

export function placeOfRow(row: InstanceRow): string {
  const where = projectOfRow(row);
  return where
    ? `${machineName(row.machineId)} · ${where}`
    : machineName(row.machineId);
}

export interface MachineGroup<T> {
  machineId: string;
  name: string;
  os: string;
  rows: T[];
}

/**
 * Rows under one header per machine, so a row never repeats where it runs.
 * The groups keep the order of their first row, so the most urgent row's
 * machine leads and each group keeps the list's own order inside it.
 */
export function byMachine<T extends { machineId: string }>(
  rows: T[]
): MachineGroup<T>[] {
  const groups = new Map<string, MachineGroup<T>>();
  for (const row of rows) {
    let group = groups.get(row.machineId);
    if (!group) {
      const machine = cawco.machines.find((m) => m.machineId === row.machineId);
      group = {
        machineId: row.machineId,
        name: machineName(row.machineId),
        os: machine?.os ?? "",
        rows: [],
      };
      groups.set(row.machineId, group);
    }
    group.rows.push(row);
  }
  // One machine order for every list (the fleet's, as the machines popover
  // lists them), so a machine keeps its place whichever list is shown.
  const place = (id: string) => {
    const at = cawco.machines.findIndex((m) => m.machineId === id);
    return at === -1 ? Number.MAX_SAFE_INTEGER : at;
  };
  return [...groups.values()].sort(
    (a, b) => place(a.machineId) - place(b.machineId)
  );
}

/**
 * Ids in code-unit order, the order Swift's `<` gives them, so a tie in a
 * list falls the same way here and in the Apple app.
 */
function compareIds(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

/** Recent's order: the latest first, ties by key. */
const byRecency = (
  a: { at: number; key: string },
  b: { at: number; key: string }
): number => b.at - a.at || compareIds(a.key, b.key);

/**
 * Two lists each in `byRecency` order as one, in one pass: what sorting the
 * two together gives, the first list's item first where they tie.
 */
function mergeByRecency(
  first: RecentItem[],
  second: RecentItem[]
): RecentItem[] {
  const merged: RecentItem[] = [];
  let i = 0;
  let j = 0;
  while (i < first.length && j < second.length) {
    if (byRecency(second[j], first[i]) < 0) {
      merged.push(second[j]);
      j += 1;
    } else {
      merged.push(first[i]);
      i += 1;
    }
  }
  while (i < first.length) {
    merged.push(first[i]);
    i += 1;
  }
  while (j < second.length) {
    merged.push(second[j]);
    j += 1;
  }
  return merged;
}

/**
 * Whether two hub rows name a stored session alike: the same row, or one
 * whose every field `catalogTitle` and `conversationHref` read is the same.
 * A row holding no session, or one that is listed (`running`), only lends
 * its id: a stored transcript of a listed session is not in Recent's stored
 * half, and a row is looked up by session only through its session.
 */
function namesAlike(
  a: InstanceRow,
  b: InstanceRow | undefined,
  running: ReadonlySet<string>
): boolean {
  if (a === b) {
    return true;
  }
  if (!b || a.id !== b.id || a.sessionId !== b.sessionId) {
    return false;
  }
  if (!a.sessionId || running.has(a.sessionId)) {
    return true;
  }
  return (
    a.machineId === b.machineId &&
    a.cwd === b.cwd &&
    a.title === b.title &&
    a.titleSource === b.titleSource &&
    a.updatedAt === b.updatedAt
  );
}

/** When a session last moved: its pulse, else the hub's own update time. */
export function lastAt(row: InstanceRow): number {
  const pulse = cawco.pulseAt(row.id);
  if (pulse !== undefined) {
    return pulse;
  }
  const at = row.updatedAt ? new Date(row.updatedAt).getTime() : 0;
  return Number.isNaN(at) ? 0 : at;
}

/**
 * When a session (or run, or thread) last ended, on the hub's clock as
 * `seenAt` is; `undefined` while it works or waits on the reader. A
 * session: the end of its turn as the hub took it (`turnEndedAt`), or for
 * a failed one the hub's last change to its row. A pulse's time is its
 * machine's clock, so it is never read here. A run or a thread: its own
 * last move, which the hub stamps.
 */
function endedAt(row: InstanceRow): number | undefined {
  if (runIdOf(row.id) || threadIdOf(row.id)) {
    if (isFailed(row)) {
      return lastAt(row);
    }
    return cawco.activityOf(row.id) === "idle"
      ? cawco.pulseAt(row.id)
      : undefined;
  }
  if (isFailed(row)) {
    return epochOf(row.updatedAt);
  }
  return cawco.activityOf(row.id) === "idle" && row.turnEndedAt
    ? epochOf(row.turnEndedAt)
    : undefined;
}

/**
 * It ended and the owner has seen it or archived it since (`seenAt` at or
 * after the end): what Unarchive is offered for.
 */
export function archivedRow(row: InstanceRow): boolean {
  const ended = endedAt(row);
  return ended !== undefined && ended <= seenAt(row);
}

/**
 * It ended after the owner last saw it: news. The one rule for both sides
 * of "seen" — Finished lists exactly these, and a conversation in front of
 * the owner is marked seen exactly when it is one of these.
 */
export function endedUnseen(row: InstanceRow): boolean {
  const ended = endedAt(row);
  return ended !== undefined && ended > seenAt(row);
}

/** When each working session joined Working this stint (see `working`). */
const enteredWorking = new Map<string, number>();

/** The rail's delegates switch, kept: work handed off is listed only on request. */
const listed = (row: InstanceRow): boolean =>
  rail.delegates || !hasParent(row, (id) => cawco.instanceIndex.byId.has(id));

/* ── The machines ──────────────────────────────────────────────────── */

export interface MachineException {
  machineId: string;
  /** What is wrong, in a word or two ("behind hub"); said on the machine's
      own row, so it never names the machine again. */
  text: string;
}

/** What is wrong with a machine, in a word or two; `null` when nothing is. */
function exceptionOf(machine: (typeof cawco.machines)[number]): string | null {
  if (machine.status !== "online") {
    return "unreachable";
  }
  const signIn =
    signInWarning(machine, "pi") ?? signInWarning(machine, "opencode");
  if (signIn) {
    return signIn;
  }
  if (buildConvergence(machine.build, cawco.hubBuild) === "behind") {
    return "behind hub";
  }
  if (machineFaults(machine.machineId, machine.fleet).length > 0) {
    return "sync failed";
  }
  return null;
}

/* ── The model ─────────────────────────────────────────────────────── */

class Home {
  /** The hub is live: only then can an empty group be believed. */
  readonly live = $derived(cawco.hub === "connected");

  /**
   * Where the fleet's machines stand, once the hub is live and has listed
   * them: none registered (`none`), registered but none online (`offline`),
   * or at least one online. `null` before then, so an empty fleet is never
   * claimed over a list still being read.
   */
  readonly machines = $derived.by<"none" | "offline" | "online" | null>(() => {
    if (!(this.live && cawco.fleetRead)) {
      return null;
    }
    if (cawco.machines.length === 0) {
      return "none";
    }
    return cawco.onlineMachines.length === 0 ? "offline" : "online";
  });

  /**
   * The usage strip stands (the home's and the rail's) unless the fleet is
   * known to have no machine online: limits are read on machines, and then
   * the empty fleet already says what is missing. The Usage page still says
   * each machine's state; it is where limits are read.
   */
  readonly limitsShown = $derived(
    this.machines !== "none" && this.machines !== "offline"
  );

  /**
   * What hangs directly under each session and run, as every list nests it
   * (a session's delegates and runs, a run's steps and child runs): the
   * rows' own parents, runs among them.
   */
  readonly #children = $derived.by(() => {
    const children = new Map<string, string[]>();
    for (const row of cawco.instanceIndex.byId.values()) {
      if (row.parentInstanceId) {
        children.set(row.parentInstanceId, [
          ...(children.get(row.parentInstanceId) ?? []),
          row.id,
        ]);
      }
    }
    return children;
  });

  /**
   * Whether a row may be archived: neither it nor anything under it is
   * still doing something (core `archiveRefusal`, the rule the hub's
   * `/api/seen` holds too). A row that fails offers no archive anywhere.
   */
  archivable(row: InstanceRow): boolean {
    return (
      archiveRefusal(row.id, {
        // A session still starting is working, as the hub counts it.
        doing: (id) =>
          cawco.instanceIndex.byId.get(id)?.status === "starting"
            ? "working"
            : cawco.activityOf(id),
        childrenOf: (id) => this.#children.get(id) ?? [],
      }) === null
    );
  }

  /**
   * A row and everything under it, listed or not (the Delegates switch hides
   * rows, not what they are): what archiving a parent takes off Finished.
   */
  treeOf(id: string): string[] {
    const out: string[] = [];
    const walk = (at: string) => {
      if (out.includes(at)) {
        return;
      }
      out.push(at);
      for (const child of this.#children.get(at) ?? []) {
        walk(child);
      }
    };
    walk(id);
    return out;
  }

  /**
   * The first full read is in: machines, sessions, runs, every online
   * machine's stored sessions, and the socket's own snapshot of what is
   * mid-turn (or the hub is known to be unreachable). It only rises: a
   * reconnect later does not take the home back to its skeleton.
   */
  #ready = $state(false);
  get ready(): boolean {
    return this.#ready;
  }

  /**
   * What the home's status line has to say (StatusLine): the hub's state
   * and, once it is there, whether the first read is in. `connected` is the
   * quiet one: live and read, there is no line at all.
   */
  get status(): HubState | "reading" {
    if (cawco.hub !== "connected") {
      return cawco.hub;
    }
    return this.#ready ? "connected" : "reading";
  }

  constructor() {
    $effect.root(() => {
      $effect(() => {
        if (
          cawco.hub === "unreachable" ||
          (cawco.fleetRead &&
            cawco.liveRead &&
            workflowState.loaded &&
            cawco.catalogsRead)
        ) {
          this.#ready = true;
        }
      });
      // The hub's echo of a mark (a row's `seenAt` reaching it) drops it.
      $effect(() => {
        settleSeen();
      });
    });
  }

  readonly exceptions = $derived<MachineException[]>(
    cawco.machines.flatMap((machine) => {
      const word = exceptionOf(machine);
      return word ? [{ machineId: machine.machineId, text: word }] : [];
    })
  );

  /**
   * The machines that have not answered yet: offline, their stored sessions
   * not read, or their sessions still the hub's stale copy waiting for the
   * daemon to register. Until this is empty an empty list proves nothing,
   * so "no sessions" is never said over it.
   */
  readonly waitingOn = $derived(
    cawco.machines.filter(
      (machine) =>
        machine.status !== "online" ||
        !cawco.catalogRead(machine.machineId) ||
        cawco.listedInstances.some(
          (row) => row.machineId === machine.machineId && isStale(row)
        )
    )
  );

  readonly needs = $derived.by<NeedsItem[]>(() => {
    const asks: NeedsItem[] = cawco.blocked.map((item) => {
      const row = cawco.instanceIndex.byId.get(item.instanceId);
      // The project is the top of its chain's, as the rail places it (`projectOfRow`).
      const top = row ? topsIn(cawco.instanceIndex.byId)(row) : undefined;
      const questions = questionsOf(item.request.toolName, item.request.input);
      // An ask a project's Caw made is his thread's (his question, a project
      // setting, a memory proposal he asked about): the card opens the thread.
      const thread = item.request.threadId
        ? cawco.threadOf(threadTabId(item.request.threadId))
        : undefined;
      return {
        kind: "ask",
        key: `${item.instanceId}:${item.request.requestId}`,
        instanceId: item.instanceId,
        cwd: row?.cwd || item.cwd,
        origin: item.request.originInstanceId ?? null,
        thread: thread ? threadTabId(thread.id) : null,
        machineId: item.machineId,
        // An ask no session row stands behind (a memory proposal) is titled
        // by who asked, as the hub named them.
        title:
          thread?.title ??
          (row
            ? instanceTitle(row)
            : item.request.presentation.asker || item.hostname),
        place: row ? placeOfRow(row) : placeOf(item.machineId, item.cwd),
        project: projectAt(
          top?.machineId ?? item.machineId,
          top ? top.cwd : item.cwd
        ),
        machine: {
          name: machineName(item.machineId),
          os:
            cawco.machines.find((one) => one.machineId === item.machineId)
              ?.os ?? "",
        },
        isQuestion: Boolean(questions),
        ask: item.request.presentation.summary,
        raisedAt: item.request.raisedAt,
        request: item.request,
        stale: item.stale,
      };
    });
    const runs: NeedsItem[] = Object.values(workflowState.runs)
      .filter((run) => run.status === "waiting")
      .map((run) => ({
        kind: "run",
        key: `run:${run.id}`,
        run,
        title:
          workflowState.workflows.find((w) => w.id === run.workflowId)?.name ??
          "Workflow",
        place: machineName(run.machineId),
        href: runHref(run.id),
        raisedAt: cawco.runAskRaisedAt(run.id),
      }));
    const caps: NeedsItem[] = cawco.capped.flatMap((project) =>
      project.cap
        ? [
            {
              kind: "cap" as const,
              key: `cap:${project.id}`,
              cap: project.cap,
              title: project.name,
              place: "Budget reached",
              href: `/usage?project=${encodeURIComponent(project.id)}`,
              raisedAt: undefined,
            },
          ]
        : []
    );
    const actions: NeedsItem[] = cawco.actions.map((action) => {
      const project = cawco.projects.find((one) => one.id === action.projectId);
      const at = `/project/${encodeURIComponent(action.projectId)}`;
      return {
        kind: "action",
        key: `action:${action.id}`,
        action,
        title:
          action.taskTitle ??
          action.proposerTitle ??
          `${action.connection} · ${action.tool}`,
        place: project?.name ?? action.projectName ?? "",
        project: project
          ? { name: project.name, hue: markHue(folderOf(project)) }
          : null,
        href: action.taskId
          ? `${at}?task=${encodeURIComponent(action.taskId)}`
          : at,
        raisedAt:
          action.state === "proposed"
            ? action.createdAt
            : (action.endedAt ?? action.createdAt),
      };
    });
    const watched: NeedsItem[] = cawco.watchNotices.map((notice) => {
      const row = cawco.instanceIndex.byId.get(notice.instanceId);
      return {
        kind: "watch",
        key: `watch:${notice.instanceId}`,
        notice,
        instanceId: notice.instanceId,
        machineId: notice.machineId,
        cwd: row?.cwd ?? "",
        title: row ? instanceTitle(row) : notice.title,
        place: row ? placeOfRow(row) : machineName(notice.machineId),
        href: conversationHref(notice.instanceId, cawco.instanceIndex),
        raisedAt: notice.at,
      };
    });
    // Longest wait first; an ask the hub has not stamped sorts last.
    return [...asks, ...runs, ...caps, ...actions, ...watched].sort(
      (a, b) =>
        (a.raisedAt ?? Number.POSITIVE_INFINITY) -
        (b.raisedAt ?? Number.POSITIVE_INFINITY)
    );
  });

  /**
   * Every session mid-turn, delegates included whatever the Delegates
   * switch says: work handed off is still work, and Caw only says "all
   * quiet" when nothing at all is working. A running workflow run is one
   * of them, its steps its delegates.
   */
  readonly working = $derived.by(() => {
    const rows = [...cawco.runningRows, ...cawco.runRows].filter(
      (row) => cawco.activityOf(row.id) === "working"
    );
    // Ordered by when each joined Working this stint, newest first: a key
    // that never moves while it works, so two agents trading turns never
    // swap places. Stamped on arrival, forgotten on leaving.
    const present = new Set(rows.map((row) => row.id));
    for (const id of enteredWorking.keys()) {
      if (!present.has(id)) {
        enteredWorking.delete(id);
      }
    }
    const at = Date.now();
    for (const row of rows) {
      if (!enteredWorking.has(row.id)) {
        // Its turn's start when known (a page opened mid-turn), read once.
        enteredWorking.set(row.id, cawco.turnSince(row.id) ?? at);
      }
    }
    return rows.sort(
      (a, b) =>
        (enteredWorking.get(b.id) ?? at) - (enteredWorking.get(a.id) ?? at) ||
        a.id.localeCompare(b.id)
    );
  });

  /**
   * Every session that has ended since it was last opened, delegates
   * included whatever the Delegates switch says: the list that shows them
   * (WorkTabs) decides which delegates it lists, so a failed one is never
   * missed. A workflow run that has ended is one of them.
   */
  readonly finished = $derived.by<InstanceRow[]>(() => {
    if (choices.finished === "a") {
      return [];
    }
    return heldOrder(
      "home:finished",
      [...cawco.listedRows, ...cawco.runRows]
        .filter(endedUnseen)
        // The latest to end first. A failure says so on its own row (its
        // mark, its line, the tab's numeral), not by jumping the queue. Two
        // that ended together go by id, so every device lists them alike.
        .sort((a, b) => lastAt(b) - lastAt(a) || compareIds(a.id, b.id)),
      (row) => row.id
    );
  });

  /**
   * The rows of `all` a tab lists itself. Every delegate under a listed
   * parent, folded into its parent's count (tree.ts `rooted`); one whose
   * parent the tab does not list only when the Delegates switch is on: work
   * another session started is listed on its own on request. A failed one is
   * listed whatever the switch says, so a failure is never missed; a blocked
   * one is never in a tab, it is a Needs-you card above them.
   */
  #listedIn(all: InstanceRow[]): InstanceRow[] {
    if (rail.delegates) {
      return all;
    }
    const kept = new Set(
      rooted(all, (id) => cawco.instanceIndex.byId.has(id)).map((row) => row.id)
    );
    return all.filter((row) => kept.has(row.id) || isFailed(row));
  }

  /** What the Working tab lists of `working`, by the Delegates switch. */
  readonly workingListed = $derived(this.#listedIn(this.working));
  /** What the Finished tab lists of `finished`, by the Delegates switch. */
  readonly finishedListed = $derived(this.#listedIn(this.finished));

  /**
   * Nothing to list anywhere: no session the hub lists, and no transcript
   * stored on any machine. Asked without building a list (one look per
   * machine), so the home's empty state costs nothing as the catalogs grow.
   */
  get empty(): boolean {
    return (
      cawco.listedRows.length === 0 &&
      cawco.machines.every((machine) => !cawco.hasStored(machine.machineId))
    );
  }

  /* ── Recent ──────────────────────────────────────────────────────────
     Two halves. The stored transcripts — every catalog entry on every
     machine, a thousand and more — are mapped and sorted only when a
     catalog, a machine, the set of listed sessions or a hub row that names
     one of them changes. The listed sessions, a few dozen, are re-derived on
     every change and merged in, one pass. A turn ending changes the hub's
     rows, the machines' list and the listed sessions' array — each a new
     object on every `instances` frame — and used to map and sort the whole
     catalog again, on every page, for the rail's count. */

  /** The machines' ids and names, as text: the same text while none is added, removed or renamed. */
  readonly #machineNames = $derived(
    cawco.machines
      .map(
        (machine) =>
          `${machine.machineId}\u0000${machineLabel(machine.hostname)}`
      )
      .join("\n")
  );

  /** The listed sessions' ids, as text: the same text while the set is. */
  readonly #runningKey = $derived(
    cawco.listedInstances
      .flatMap((row) => (row.sessionId ? [row.sessionId] : []))
      .sort()
      .join("\n")
  );
  readonly #running = $derived<ReadonlySet<string>>(
    new Set(this.#runningKey.split("\n"))
  );

  /** Every stored transcript not behind a listed session, placed and in order. */
  readonly #storedEntries = $derived.by<StoredEntry[]>(() => {
    const running = this.#running;
    const entries: StoredEntry[] = [];
    for (const line of this.#machineNames.split("\n")) {
      const [machineId, name] = line.split("\u0000");
      if (!machineId) {
        continue;
      }
      for (const info of cawco.catalogOf(machineId)) {
        // A listed session's transcript is its row; a lead's is its
        // project's threads, never a stored session of its own.
        if (
          running.has(info.sessionId) ||
          cawco.leadSessions.has(info.sessionId)
        ) {
          continue;
        }
        const where = projectOf(machineId, info.cwd);
        entries.push({
          key: `${machineId}:${info.sessionId}`,
          info,
          machineId,
          place: where ? `${name} · ${where}` : name,
          at: info.lastModified,
        });
      }
    }
    return entries.sort(byRecency);
  });

  /**
   * The hub's rows as naming a stored transcript reads them: the same array
   * while no row has moved in a way `namesAlike` sees, so a turn ending —
   * a listed row's status and time — names nothing again.
   */
  #named: InstanceRow[] = [];
  readonly #namingRows = $derived.by<InstanceRow[]>(() => {
    const rows = cawco.instances;
    const running = this.#running;
    const was = this.#named;
    if (
      rows.length === was.length &&
      rows.every((row, i) => namesAlike(row, was[i], running))
    ) {
      return was;
    }
    this.#named = rows;
    return rows;
  });

  /** The stored half, named, in order. */
  readonly #stored = $derived.by<RecentItem[]>(() => {
    // Runs are rows too, but under `run:` ids no stored session carries.
    const index = indexInstances(this.#namingRows);
    return this.#storedEntries.map(
      (entry): RecentItem => ({
        ...entry,
        instance: null,
        place: (() => {
          const row = instanceForSession(index, entry.info.sessionId, {
            machineId: entry.machineId,
            cwd: entry.info.cwd,
          });
          return row ? placeOfRow(row) : entry.place;
        })(),
        title: catalogTitle(entry.info, index, entry.machineId),
        href: conversationHref(entry.info.sessionId, index, {
          machineId: entry.machineId,
          cwd: entry.info.cwd,
        }),
      })
    );
  });

  /**
   * The listed sessions Recent holds, newest first: every one no other
   * group shows, whatever its status or activity. Recent is the list of last
   * resort, so it asks nothing more of a row. Asking that it be idle, asleep
   * or failed left two with no row anywhere, and so no menu to stop or
   * remove them by: a live session whose pulse says it waits on the reader
   * while no ask of its own is parked (a delegate's ask its parent answers),
   * and one stopped before it had a transcript whose pulse or delegates
   * still say working.
   */
  readonly #recentRows = $derived.by<InstanceRow[]>(() => {
    // What the tabs list, not all they hold: with the Delegates switch off
    // a tab holds a delegate it does not draw (one that ended unseen under a
    // parent the reader has since opened), and left out here too it had no
    // row anywhere. Its parent's tree in Recent is where it hangs then.
    const shown = new Set([
      ...this.workingListed.map((row) => row.id),
      ...this.finishedListed.map((row) => row.id),
      ...cawco.blocked.map((item) => item.instanceId),
    ]);
    const rows = cawco.listedRows.filter((row) => !shown.has(row.id));
    const known = (id: string) => cawco.instanceIndex.byId.has(id);
    // What the Delegates switch means in every home list (WorkTabs
    // `rowsOf`): off, a delegate is held only under a parent the list holds
    // too, in that parent's tree; on, every one is held, under its parent.
    return (rail.delegates ? rows : rooted(rows, known)).sort(
      (a, b) => lastAt(b) - lastAt(a) || compareIds(a.id, b.id)
    );
  });

  /**
   * Recent's sessions as their trees (tree.ts), newest first: each one
   * followed by its delegates, and with the Delegates switch on each
   * ancestor Recent does not hold as a context line in its delegates' place,
   * as Working and Finished draw theirs. Read only where Recent is open.
   */
  readonly recentLines = $derived.by(() =>
    tree(this.#recentRows, {
      context: rail.delegates
        ? (id) => cawco.instanceIndex.byId.get(id)
        : undefined,
    })
  );

  /**
   * How many of the sessions Recent holds, its delegates among them, have a
   * live process (running or starting): what its closed header says, since
   * nothing else on a closed list says something inside can still be stopped.
   */
  readonly recentRunning = $derived(
    this.#recentRows.filter(
      (row) => row.status === "running" || row.status === "starting"
    ).length
  );

  /**
   * Recent's own rows among the sessions, in order: the top of each tree.
   * A delegate is in its parent's tree, never a row of the list, so the
   * list's count and its cap are of these.
   */
  readonly #recentLive = $derived.by<RecentItem[]>(() => {
    // Tops as the lists have them: a delegate of Caw's work is under its thread.
    const topOf = topsIn(new Map(cawco.listedRows.map((row) => [row.id, row])));
    const tops = new Set(this.#recentRows.map(topOf));
    return [...tops]
      .map(
        (row): RecentItem => ({
          key: row.id,
          instance: row,
          info: null,
          machineId: row.machineId,
          title: instanceTitle(row),
          place: placeOfRow(row),
          href: conversationHref(row.id, cawco.instanceIndex),
          at: lastAt(row),
        })
      )
      .sort(byRecency);
  });

  /** How many Recent lists: what its closed disclosure says, without the list. */
  readonly recentCount = $derived(
    this.#recentLive.length + this.#storedEntries.length
  );

  /** Everything else that can be opened, latest first: read only where it is shown. */
  readonly recent = $derived.by<RecentItem[]>(() =>
    heldOrder(
      "home:recent",
      mergeByRecency(this.#recentLive, this.#stored),
      (item) => item.key
    )
  );

  /**
   * What a wide screen opens with nothing open: the longest wait, else the
   * latest work. Never a session whose move was just cancelled: its tab
   * closed for the fleet page (move design §2c), and its row is on its way out.
   */
  readonly landing = $derived.by<string | null>(() => {
    const ask = this.needs.find((item) => item.kind === "ask");
    if (ask?.kind === "ask") {
      return ask.instanceId;
    }
    const cancelled = new Set(
      cawco.moves
        .filter((job) => job.stage === "cancelled")
        .map((job) => job.targetInstanceId)
    );
    const [latest] = [...cawco.runningRows]
      .filter((row) => listed(row) && !cancelled.has(row.id))
      .sort((a, b) => lastAt(b) - lastAt(a));
    return latest?.id ?? null;
  });
}

export const home = new Home();
