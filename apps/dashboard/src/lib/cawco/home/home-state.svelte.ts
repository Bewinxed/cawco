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
 * - Recent: everything else that can be opened — idle and sleeping
 *   sessions, and the transcripts stored on the machines.
 */
import type { NeutralSessionInfo, WorkflowRun } from "@cawco/core";
import { archiveRefusal, machineLabel } from "@cawco/core";
import {
  type BlockedRequest,
  cawco,
  type HubState,
  type InstanceRow,
  isFailed,
  isResumable,
  isStale,
} from "../client.svelte";
import {
  buildConvergence,
  deployInfoOf,
  isDeployDiverged,
} from "../convergence";
import { machineFaults } from "../fleet-faults";
import {
  catalogTitle,
  conversationHref,
  indexInstances,
  resolveSessionTitle,
} from "../links";
import { signInWarning } from "../machine";
import { heldOrder } from "../motion/held-order.svelte";
import { permissionSummary } from "../permission-summary";
import { questionsOf } from "../question";
import { rail } from "../rail.svelte";
import { runHref } from "../workflow-runs";
import { workflowState } from "../workflow-state.svelte";
import { choices } from "./choices.svelte";

/* ── Seen, on the hub ──────────────────────────────────────────────────
   What "finished since you last looked" means is the owner's looking on
   any device: each session and run carries `seenAt` from the hub, and
   every dashboard hears it change on the frames it already reads. */

/**
 * What this dashboard marked seen and the hub has not yet echoed back: the
 * row leaves Finished in the click that archived it, not a round trip later.
 */
const seenHere = $state<Record<string, number>>({});

const epochOf = (value: string | number | Date | null | undefined): number => {
  const at = value ? new Date(value).getTime() : 0;
  return Number.isNaN(at) ? 0 : at;
};

/** When the owner last looked at it or archived it, on any device. */
export const seenAt = (row: InstanceRow): number =>
  Math.max(epochOf(row.seenAt), seenHere[row.id] ?? 0);

/**
 * Marks sessions (and runs, as `run:<id>`) seen on the hub: `look`, the
 * owner had it in front after it ended; `archive`, taken off Finished
 * without opening it, which the hub refuses for anything still doing
 * something (core `archiveRefusal`). A refusal puts the rows back.
 */
function markSeen(ids: string[], kind: "archive" | "look"): void {
  if (ids.length === 0) {
    return;
  }
  const at = Date.now();
  for (const id of ids) {
    seenHere[id] = at;
  }
  const undo = () => {
    for (const id of ids) {
      if (seenHere[id] === at) {
        delete seenHere[id];
      }
    }
  };
  fetch("/api/seen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, kind }),
  })
    .then(async (response) => {
      if (!response.ok) {
        undo();
        console.error("[cawco] not marked seen:", await response.text());
      }
    })
    .catch((error) => {
      undo();
      console.error("[cawco] marking seen failed:", error);
    });
}

/** Records that the reader has a conversation in front of them, ended. */
export function markOpened(id: string): void {
  markSeen([id], "look");
}

/**
 * Takes sessions (and runs, as `run:<id>`) off Finished without opening
 * them, so each is listed again only when it ends another turn. Only what
 * `home.archivable` allows is ever offered; the hub holds the same rule.
 */
export function archive(ids: string[]): void {
  markSeen(ids, "archive");
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
  instanceId: string;
  isQuestion: boolean;
  key: string;
  kind: "ask";
  machineId: string;
  /** machine · project */
  place: string;
  /** When the hub parked it, ms epoch. */
  raisedAt: number | undefined;
  request: BlockedRequest["request"];
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

export type NeedsItem = AskItem | RunItem;

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
  const project = cawco.projects.find(
    (p) =>
      p.machineId === machineId &&
      (folder === p.cwd || folder.startsWith(`${p.cwd}/`))
  );
  return (
    project?.name ??
    (folder.split("/").filter(Boolean).pop() ?? "").replace(WORKSPACE_ID, "")
  );
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
 * When a session (or run) last ended: its failure, else the end of its turn
 * as its pulse says; `undefined` while it works or waits on the reader.
 */
function endedAt(row: InstanceRow): number | undefined {
  if (isFailed(row)) {
    return lastAt(row);
  }
  return cawco.activityOf(row.id) === "idle"
    ? cawco.pulseAt(row.id)
    : undefined;
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
  rail.delegates || !row.parentInstanceId;

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
  const signIn = signInWarning(machine, "pi");
  if (signIn) {
    return signIn;
  }
  if (buildConvergence(machine.build, cawco.hubBuild) === "behind") {
    return "behind hub";
  }
  if (machineFaults(machine.machineId, machine.fleet).length > 0) {
    return "sync failed";
  }
  const deploy = deployInfoOf(
    (machine as unknown as { deploy?: unknown }).deploy
  );
  if (isDeployDiverged(deploy)) {
    return "deploy diverged";
  }
  return null;
}

/* ── The model ─────────────────────────────────────────────────────── */

class Home {
  /** The hub is live: only then can an empty group be believed. */
  readonly live = $derived(cawco.hub === "connected");

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
      const questions = questionsOf(item.request.toolName, item.request.input);
      return {
        kind: "ask",
        key: `${item.instanceId}:${item.request.requestId}`,
        instanceId: item.instanceId,
        machineId: item.machineId,
        title: row ? instanceTitle(row) : item.hostname,
        place: placeOf(item.machineId, item.cwd),
        isQuestion: Boolean(questions),
        ask: questions
          ? questions.map((question) => question.question).join(" · ")
          : permissionSummary(item.request.toolName, item.request.input),
        raisedAt: item.request.raisedAt,
        request: item.request,
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
    // Longest wait first; an ask the hub has not stamped sorts last.
    return [...asks, ...runs].sort(
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
    const rows = [...cawco.runningInstances, ...cawco.runRows].filter(
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
      [...cawco.listedInstances, ...cawco.runRows]
        .filter(endedUnseen)
        // The latest to end first. A failure says so on its own row (its
        // mark, its line, the tab's numeral), not by jumping the queue. Two
        // that ended together go by id, so every device lists them alike.
        .sort((a, b) => lastAt(b) - lastAt(a) || compareIds(a.id, b.id)),
      (row) => row.id
    );
  });

  /**
   * Nothing to list anywhere: no session the hub lists, and no transcript
   * stored on any machine. Asked without building a list (one look per
   * machine), so the home's empty state costs nothing as the catalogs grow.
   */
  get empty(): boolean {
    return (
      cawco.listedInstances.length === 0 &&
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
        if (running.has(info.sessionId)) {
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
        title: catalogTitle(entry.info, index, entry.machineId),
        href: conversationHref(entry.info.sessionId, index, {
          machineId: entry.machineId,
          cwd: entry.info.cwd,
        }),
      })
    );
  });

  /** The listed sessions Recent lists, in order: what no other group shows. */
  readonly #recentLive = $derived.by<RecentItem[]>(() => {
    const shown = new Set([
      ...this.working.map((row) => row.id),
      ...this.finished.map((row) => row.id),
      ...cawco.blocked.map((item) => item.instanceId),
    ]);
    return cawco.listedInstances
      .filter(
        (row) =>
          listed(row) &&
          !shown.has(row.id) &&
          (cawco.activityOf(row.id) === "idle" ||
            isResumable(row) ||
            isStale(row) ||
            isFailed(row))
      )
      .map(
        (row): RecentItem => ({
          key: row.id,
          instance: row,
          info: null,
          machineId: row.machineId,
          title: instanceTitle(row),
          place: placeOf(row.machineId, row.cwd),
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

  /** What a wide screen opens with nothing open: the longest wait, else the latest work. */
  readonly landing = $derived.by<string | null>(() => {
    const ask = this.needs.find((item) => item.kind === "ask");
    if (ask?.kind === "ask") {
      return ask.instanceId;
    }
    const [latest] = [...cawco.runningInstances]
      .filter(listed)
      .sort((a, b) => lastAt(b) - lastAt(a));
    return latest?.id ?? null;
  });
}

export const home = new Home();
