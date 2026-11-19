/**
 * Find's names (find-names.ts), kept on the views thread by what moved: every
 * row they are built from is read whole once as the thread starts, then
 * again by key only when the hub's change log names it (views/changes.ts),
 * and only the entries that row stands in are laid again. Before this, the
 * whole index was read and laid again whenever it was a second old, twice
 * per request once a build passed a second, on the hub's own thread
 * (2026-11-19, tsk-391's cause C).
 *
 * Which entries a row stands in: a session's own, its children's (their
 * parent's title), its artifacts' and its work items' commits and files
 * (its title), and the stored conversation its harness session id would
 * otherwise be; a work item's session's and its parent's (its report); a
 * project's, machine's or task's every entry that names it.
 */
import { detach } from "@cawco/core/detach";
import { machineLabel } from "@cawco/core/machine-names";
import { DAY_MS } from "@cawco/core/time";
import type { StageKind } from "@cawco/core/views";
import type {
  FindArtifactRow,
  FindInstanceRow,
  FindRoutineRow,
  FindWorkItemRow,
} from "../db/find";
import {
  artifactEntry,
  changeEntries,
  changesOf,
  conversationEntry,
  type Entry,
  type ItemChanges,
  kinOf,
  machineEntry,
  projectEntry,
  routineEntry,
  storedEntry,
  taskEntry,
} from "../find-names";
import type { Catalogs } from "./catalogs";
import { VIEW_KINDS, type ViewChanges } from "./changes";
import type { ViewMachine, ViewProject, ViewsDb } from "./read";

/** How many keys one read names: under SQLite's bound on a statement's values (macOS's system SQLite: 32,766). */
const KEYS_PER_READ = 500;

/** How long a project's stage kinds are kept before they are read again, ms. */
const STAGES_FRESH_MS = 30_000;

/** A purged or hub-made session's key: its machine and harness session id. */
export const sessionKey = (machineId: string, sessionId: string): string =>
  `${machineId}:${sessionId}`;

/** A conversation as the names hold it: its row, its entry and the sessions it started. */
export interface Held {
  children: string[];
  entry: Entry;
  row: FindInstanceRow;
}

/** What one find reads of the names: everything matched against, and what folding the machines' answers reads. */
export interface Names {
  /** A harness session id (and each it went on from) to its session. */
  bySessionId: ReadonlyMap<string, string>;
  conversations: ReadonlyMap<string, Held>;
  entries: Entry[];
  /**
   * The hub's own conversations, by `machineId:sessionId`: a summariser's,
   * whose words are the hub's prompt quoting a session and a model's
   * summary of it. No find answers with them, the person's nor an agent's:
   * the session they quote is found by its own words, and they are hidden
   * from every board and catalog besides.
   */
  hubMade: ReadonlySet<string>;
  machines: ReadonlyMap<string, ViewMachine>;
  /** Each session a machine keeps that the hub never started, by `machineId:sessionId`. */
  stored: ReadonlyMap<string, Entry>;
}

/** A project's indexed task, as find reads it. */
type TaskRow = ReturnType<ViewsDb["find"]["tasks"]>[number];

export interface FindIndexDeps {
  /** Of these page artifacts, the kept blocks (hub kept-blocks.ts), asked of the hub's thread, which holds the programs. */
  blockPages: (ids: string[]) => Promise<string[]>;
  catalogs: Catalogs;
  db: ViewsDb;
  /** A project's stages by name, each with its kind, asked of the hub's thread; undefined when its stages.md does not read. */
  stageKinds: (
    projectId: string
  ) => Promise<Map<string, StageKind> | undefined>;
}

/** `value` added to `key`'s set in `sets`. */
const addTo = (
  sets: Map<string, Set<string>>,
  key: string | null,
  value: string
): void => {
  if (key === null) {
    return;
  }
  let set = sets.get(key);
  if (!set) {
    set = new Set();
    sets.set(key, set);
  }
  set.add(value);
};

/** `value` taken from `key`'s set in `sets`. */
const takeFrom = (
  sets: Map<string, Set<string>>,
  key: string | null,
  value: string
): void => {
  if (key === null) {
    return;
  }
  const set = sets.get(key);
  set?.delete(value);
  if (set?.size === 0) {
    sets.delete(key);
  }
};

export const createFindIndex = (deps: FindIndexDeps) => {
  const { db, catalogs } = deps;

  /* ---- what the entries are built from ---- */

  const rows = new Map<string, FindInstanceRow>();
  /** Each session's children among {@link rows}. */
  const children = new Map<string, Set<string>>();
  const bySessionId = new Map<string, string>();
  const items = new Map<string, FindWorkItemRow>();
  /** Each session's work items, and each delegating session's delegates' items. */
  const itemsOf = new Map<string, Set<string>>();
  const itemsUnder = new Map<string, Set<string>>();
  /** Each ended work item's commits and files, parsed once per end. */
  const changes = new Map<string, ItemChanges>();
  const branches = new Map<string, string>();
  const artifacts = new Map<string, FindArtifactRow>();
  /** Each session's artifacts. */
  const artifactsOf = new Map<string, Set<string>>();
  /** The page artifacts that are kept blocks (they ask nothing: artifacts, not decisions). */
  const blocks = new Set<string>();
  const tasksOf = new Map<string, TaskRow[]>();
  const taskTitles = new Map<string, string>();
  const routines = new Map<string, FindRoutineRow>();
  const projects = new Map<string, ViewProject>();
  const machines = new Map<string, ViewMachine>();
  const steps = new Map<string, string>();
  /** Each summariser's conversations, by its id ({@link Names.hubMade}). */
  const hubMadeOf = new Map<string, string[]>();
  let hubMade = new Set<string>();
  const purged = new Set<string>();
  const stageKinds = new Map<
    string,
    { at: number; kinds: Map<string, StageKind> }
  >();
  const stagesReading = new Set<string>();

  /* ---- the entries ---- */

  const conversations = new Map<string, Held>();
  const storedEntries = new Map<string, Entry>();
  const taskEntries = new Map<string, Entry[]>();
  const routineEntries = new Map<string, Entry>();
  const projectEntries = new Map<string, Entry>();
  const artifactEntries = new Map<string, Entry>();
  const changeEntriesOf = new Map<string, Entry[]>();

  /* ---- what is owed laying ---- */

  const conversationsOwed = new Set<string>();
  const artifactsOwed = new Set<string>();
  const changesOwed = new Set<string>();
  const tasksOwed = new Set<string>();
  const routinesOwed = new Set<string>();
  let projectsOwed = false;
  /** Stored conversations owed, by machine: some sessions, or every one. */
  const storedOwed = new Map<string, Set<string> | "all">();
  /** Harness session ids whose stored conversation, on any machine, is owed. */
  const storedSessionsOwed = new Set<string>();

  /* ---- reading by key ---- */

  /** The latest work item of a session: the one made last. */
  const latestOf = (instanceId: string): FindWorkItemRow | undefined => {
    let latest: FindWorkItemRow | undefined;
    for (const id of itemsOf.get(instanceId) ?? []) {
      const item = items.get(id);
      if (item && (!latest || latest.createdAt < item.createdAt)) {
        latest = item;
      }
    }
    return latest;
  };

  /** A delegating session's newest report from one of its delegates. */
  const reportedToOf = (parentId: string): FindWorkItemRow | undefined => {
    let told: FindWorkItemRow | undefined;
    for (const id of itemsUnder.get(parentId) ?? []) {
      const item = items.get(id);
      const newer =
        !told?.endedAt ||
        (item?.endedAt?.getTime() ?? 0) > told.endedAt.getTime();
      if (item?.headline && item.endedAt && newer) {
        told = item;
      }
    }
    return told;
  };

  /** The harness session ids a row went by: its own, and each it went on from. */
  const sessionIdsOf = (row: FindInstanceRow): string[] =>
    [row.sessionId, ...row.priorSessionIds].filter(
      (sessionId): sessionId is string => !!sessionId
    );

  /** A row held no more: its place under its parent and its session ids let go. */
  const unholdRow = (id: string, before: FindInstanceRow): void => {
    takeFrom(children, before.parentInstanceId, id);
    for (const sessionId of sessionIdsOf(before)) {
      if (bySessionId.get(sessionId) === id) {
        bySessionId.delete(sessionId);
        storedSessionsOwed.add(sessionId);
      }
    }
  };

  /** Every entry a session's row stands in, owed laying: its own, its children's, its artifacts', its work items' changes. */
  const rowOwed = (id: string): void => {
    conversationsOwed.add(id);
    for (const owed of [
      [children.get(id), conversationsOwed],
      [artifactsOf.get(id), artifactsOwed],
      [itemsOf.get(id), changesOwed],
    ] as const) {
      for (const key of owed[0] ?? []) {
        owed[1].add(key);
      }
    }
  };

  /** A session's row as `row` stands now, or gone: what it stands in owed laying. */
  const putRow = (id: string, row: FindInstanceRow | undefined): void => {
    const before = rows.get(id);
    if (before) {
      unholdRow(id, before);
    }
    if (row) {
      rows.set(id, row);
      addTo(children, row.parentInstanceId, id);
      for (const sessionId of sessionIdsOf(row)) {
        bySessionId.set(sessionId, id);
        storedSessionsOwed.add(sessionId);
      }
    } else {
      rows.delete(id);
    }
    rowOwed(id);
  };

  const putItem = (
    id: string,
    item: FindWorkItemRow | undefined,
    result: string | null | undefined
  ): void => {
    const before = items.get(id);
    for (const held of [before, item]) {
      if (held) {
        conversationsOwed.add(held.instanceId);
        conversationsOwed.add(held.parentInstanceId);
      }
    }
    if (before) {
      takeFrom(itemsOf, before.instanceId, id);
      takeFrom(itemsUnder, before.parentInstanceId, id);
    }
    if (item) {
      items.set(id, item);
      addTo(itemsOf, item.instanceId, id);
      addTo(itemsUnder, item.parentInstanceId, id);
    } else {
      items.delete(id);
    }
    if (item?.endedAt && result !== undefined) {
      changes.set(id, changesOf(result));
    } else if (!item?.endedAt) {
      changes.delete(id);
    }
    changesOwed.add(id);
  };

  const putArtifact = (id: string, artifact: FindArtifactRow | undefined) => {
    const before = artifacts.get(id);
    if (before) {
      takeFrom(artifactsOf, before.instanceId, id);
    }
    if (artifact) {
      artifacts.set(id, artifact);
      addTo(artifactsOf, artifact.instanceId, id);
    } else {
      artifacts.delete(id);
      blocks.delete(id);
    }
    artifactsOwed.add(id);
  };

  const putTasks = (projectId: string, tasks: TaskRow[]): void => {
    for (const task of tasksOf.get(projectId) ?? []) {
      taskTitles.delete(`${projectId}:${task.id}`);
    }
    if (tasks.length > 0) {
      tasksOf.set(projectId, tasks);
    } else {
      tasksOf.delete(projectId);
    }
    for (const task of tasks) {
      taskTitles.set(`${projectId}:${task.id}`, task.title);
    }
    tasksOwed.add(projectId);
    // An attempt names its task by the task's title.
    for (const item of items.values()) {
      if (item.projectId === projectId && item.taskId) {
        conversationsOwed.add(item.instanceId);
      }
    }
  };

  const putHubMade = (made: Map<string, string[]>, ids: string[]): void => {
    for (const id of ids) {
      for (const key of [
        ...(hubMadeOf.get(id) ?? []),
        ...(made.get(id) ?? []),
      ]) {
        storedSessionsOwed.add(key.slice(key.indexOf(":") + 1));
      }
      const keys = made.get(id);
      if (keys) {
        hubMadeOf.set(id, keys);
      } else {
        hubMadeOf.delete(id);
      }
    }
    hubMade = new Set([...hubMadeOf.values()].flat());
  };

  /** Every entry owed laying, once something everything names moved (a project). */
  const everythingOwed = (): void => {
    projectsOwed = true;
    for (const id of rows.keys()) {
      conversationsOwed.add(id);
    }
    for (const id of artifacts.keys()) {
      artifactsOwed.add(id);
    }
    for (const id of changes.keys()) {
      changesOwed.add(id);
    }
    for (const id of tasksOf.keys()) {
      tasksOwed.add(id);
    }
    for (const id of routines.keys()) {
      routinesOwed.add(id);
    }
  };

  /** Asks which of these page artifacts are kept blocks; their entries are laid again on the answer. */
  const askBlocks = (ids: string[]): void => {
    if (ids.length === 0) {
      return;
    }
    detach(
      deps.blockPages(ids).then((found) => {
        const block = new Set(found);
        for (const id of ids) {
          if (block.has(id) !== blocks.has(id)) {
            if (block.has(id)) {
              blocks.add(id);
            } else {
              blocks.delete(id);
            }
            artifactsOwed.add(id);
          }
        }
      }),
      "find: kept blocks read"
    );
  };

  /** A project's stage kinds as last read; read again in the background once stale. */
  const kindsOf = (projectId: string, now: number) => {
    const known = stageKinds.get(projectId);
    const due = !known || now - known.at > STAGES_FRESH_MS;
    if (due && !stagesReading.has(projectId)) {
      stagesReading.add(projectId);
      detach(
        deps
          .stageKinds(projectId)
          .then((kinds) => {
            if (kinds) {
              stageKinds.set(projectId, { at: Date.now(), kinds });
              tasksOwed.add(projectId);
            }
          })
          .finally(() => stagesReading.delete(projectId)),
        `find: ${projectId}'s stages`
      );
    }
    return known?.kinds;
  };

  /* ---- the changes heard ---- */

  const heard = {
    sessions(ids: string[]): void {
      const fresh = new Map(db.find.instances(ids).map((row) => [row.id, row]));
      const stepsNow = db.find.planSteps(ids);
      for (const id of ids) {
        putRow(id, fresh.get(id));
        const step = stepsNow.get(id);
        if (step === undefined) {
          steps.delete(id);
        } else {
          steps.set(id, step);
        }
      }
      putHubMade(db.find.hubMade(ids), ids);
    },
    workItems(ids: string[]): void {
      const fresh = new Map(
        db.find.workItems(ids).map((item) => [item.id, item])
      );
      const results = new Map(
        db.find.results(ids).map((ended) => [ended.id, ended.result])
      );
      for (const id of ids) {
        putItem(id, fresh.get(id), results.get(id));
      }
    },
    workspaces(ids: string[]): void {
      const fresh = db.find.workspaceBranches(ids);
      const moved = new Set(ids);
      for (const id of ids) {
        const branch = fresh.get(id);
        if (branch === undefined) {
          branches.delete(id);
        } else {
          branches.set(id, branch);
        }
      }
      for (const item of items.values()) {
        if (moved.has(item.workspaceId)) {
          changesOwed.add(item.id);
        }
      }
    },
    artifacts(ids: string[]): void {
      const fresh = new Map(db.find.artifacts(ids).map((row) => [row.id, row]));
      const pages: string[] = [];
      for (const id of ids) {
        const artifact = fresh.get(id);
        putArtifact(id, artifact);
        if (artifact?.kind === "page" && artifact.projectId !== null) {
          pages.push(id);
        }
      }
      askBlocks(pages);
    },
    tasks(projectIds: string[]): void {
      const fresh = Map.groupBy(
        db.find.tasks(projectIds),
        (task) => task.projectId
      );
      for (const projectId of projectIds) {
        putTasks(projectId, fresh.get(projectId) ?? []);
      }
    },
    routines(ids: string[]): void {
      const fresh = new Map(db.find.routines(ids).map((row) => [row.id, row]));
      for (const id of ids) {
        const routine = fresh.get(id);
        if (routine) {
          routines.set(id, routine);
        } else {
          routines.delete(id);
        }
        routinesOwed.add(id);
      }
    },
    projects(): void {
      projects.clear();
      for (const project of db.projects()) {
        projects.set(project.id, project);
      }
      everythingOwed();
    },
    machines(ids: string[]): void {
      const fresh = new Map(
        db.machines(ids).map((row) => [row.machineId, row])
      );
      const moved = new Set(ids);
      for (const id of ids) {
        const machine = fresh.get(id);
        if (machine) {
          machines.set(id, machine);
        } else {
          machines.delete(id);
        }
        storedOwed.set(id, "all");
      }
      for (const row of rows.values()) {
        if (moved.has(row.machineId)) {
          conversationsOwed.add(row.id);
        }
      }
    },
    purged(machineIds: string[]): void {
      const moved = new Set(machineIds);
      for (const key of purged) {
        if (moved.has(key.slice(0, key.indexOf(":")))) {
          purged.delete(key);
        }
      }
      for (const key of db.find.purged(machineIds)) {
        purged.add(key);
      }
      for (const machineId of machineIds) {
        storedOwed.set(machineId, "all");
      }
    },
  } satisfies { [Kind in keyof ViewChanges]-?: (ids: string[]) => void };

  /* ---- reading whole, as the thread starts ---- */

  const startSessions = (): void => {
    for (const row of db.find.instances()) {
      putRow(row.id, row);
    }
    for (const [id, step] of db.find.planSteps()) {
      steps.set(id, step);
    }
    const made = db.find.hubMade();
    putHubMade(made, [...made.keys()]);
  };

  const startWork = (): void => {
    const results = new Map(
      db.find.results().map((ended) => [ended.id, ended.result])
    );
    for (const item of db.find.workItems()) {
      putItem(item.id, item, results.get(item.id));
    }
    for (const [id, branch] of db.find.workspaceBranches()) {
      branches.set(id, branch);
    }
  };

  const startArtifacts = (): void => {
    const pages: string[] = [];
    for (const artifact of db.find.artifacts()) {
      putArtifact(artifact.id, artifact);
      if (artifact.kind === "page" && artifact.projectId !== null) {
        pages.push(artifact.id);
      }
    }
    askBlocks(pages);
  };

  /* ---- laying what is owed ---- */

  const projectOf = (id: string | null) => {
    const project = id ? projects.get(id) : undefined;
    return project ? { id: project.id, name: project.name } : null;
  };

  const machineName = (id: string): string =>
    machineLabel(machines.get(id)?.hostname ?? id);

  /** Whether a machine's stored session is one find answers with: the hub never started it, made it for itself, or had it purged. */
  const storedShown = (machineId: string, sessionId: string): boolean =>
    !(
      bySessionId.has(sessionId) ||
      hubMade.has(sessionKey(machineId, sessionId)) ||
      purged.has(sessionKey(machineId, sessionId))
    );

  /** One machine's stored conversation laid again, or let go. */
  const layStored = (machineId: string, sessionId: string): void => {
    const key = sessionKey(machineId, sessionId);
    const info = catalogs.session(machineId, sessionId);
    const entry =
      info && storedShown(machineId, sessionId)
        ? storedEntry(info, { id: machineId, name: machineName(machineId) })
        : null;
    if (entry) {
      storedEntries.set(key, entry);
    } else {
      storedEntries.delete(key);
    }
  };

  /** Every stored conversation of a machine laid again, its old ones let go first. */
  const layMachineStored = (machineId: string): void => {
    const prefix = `${machineId}:`;
    for (const key of storedEntries.keys()) {
      if (key.startsWith(prefix)) {
        storedEntries.delete(key);
      }
    }
    for (const info of catalogs.sessions(machineId)) {
      layStored(machineId, info.sessionId);
    }
  };

  /** The stored conversations of these harness session ids laid again, on every machine that keeps one. */
  const laySessionsStored = (): void => {
    for (const machineId of catalogs.machines()) {
      for (const sessionId of storedSessionsOwed) {
        if (catalogs.session(machineId, sessionId)) {
          layStored(machineId, sessionId);
        }
      }
    }
    storedSessionsOwed.clear();
  };

  const layStoredOwed = (): void => {
    for (const [machineId, owed] of storedOwed) {
      if (owed === "all") {
        layMachineStored(machineId);
        continue;
      }
      for (const sessionId of owed) {
        layStored(machineId, sessionId);
      }
    }
    storedOwed.clear();
    laySessionsStored();
  };

  const layConversations = (now: number): void => {
    const sources = {
      items: { byId: items, latest: { get: latestOf } },
      machineName,
      now,
      projectOf,
      reportedTo: { get: reportedToOf },
      rows,
      steps,
      taskTitles,
    };
    for (const id of conversationsOwed) {
      const row = rows.get(id);
      if (row) {
        conversations.set(id, {
          row,
          children: [],
          entry: conversationEntry(row, sources, 0),
        });
      } else {
        conversations.delete(id);
      }
    }
    conversationsOwed.clear();
  };

  const layArtifacts = (): void => {
    for (const id of artifactsOwed) {
      const artifact = artifacts.get(id);
      const maker =
        artifact && artifact.instanceId !== null
          ? rows.get(artifact.instanceId)
          : undefined;
      if (artifact && maker) {
        artifactEntries.set(
          id,
          artifactEntry(
            artifact,
            maker,
            projectOf(artifact.projectId ?? maker.projectId),
            artifact.kind === "page" && blocks.has(id)
          )
        );
      } else {
        artifactEntries.delete(id);
      }
    }
    artifactsOwed.clear();
  };

  const layChanges = (): void => {
    for (const id of changesOwed) {
      const item = items.get(id);
      const ended = changes.get(id);
      const maker = item ? rows.get(item.instanceId) : undefined;
      if (item && ended && maker) {
        changeEntriesOf.set(
          id,
          changeEntries(
            item,
            ended,
            maker,
            branches.get(item.workspaceId) ?? "",
            projectOf(item.projectId)
          )
        );
      } else {
        changeEntriesOf.delete(id);
      }
    }
    changesOwed.clear();
  };

  const layTasks = (now: number): void => {
    for (const projectId of tasksOwed) {
      const tasks = tasksOf.get(projectId);
      if (!tasks) {
        taskEntries.delete(projectId);
        continue;
      }
      const kinds = kindsOf(projectId, now);
      taskEntries.set(
        projectId,
        tasks.map((task) =>
          taskEntry(
            task,
            projectOf(task.projectId),
            kinds?.get(task.stage) ?? null
          )
        )
      );
    }
    tasksOwed.clear();
  };

  const layRoutines = (): void => {
    for (const id of routinesOwed) {
      const routine = routines.get(id);
      if (routine) {
        routineEntries.set(
          id,
          routineEntry(routine, projectOf(routine.projectId))
        );
      } else {
        routineEntries.delete(id);
      }
    }
    routinesOwed.clear();
    if (projectsOwed) {
      projectEntries.clear();
      for (const project of projects.values()) {
        projectEntries.set(project.id, projectEntry(project));
      }
      projectsOwed = false;
    }
  };

  /** Every entry owed laying, laid: what a find reads next. */
  const settle = (now: number): void => {
    // A project's stage kinds go stale by time alone: read again when due.
    for (const projectId of tasksOf.keys()) {
      kindsOf(projectId, now);
    }
    layConversations(now);
    layStoredOwed();
    layArtifacts();
    layChanges();
    layTasks(now);
    layRoutines();
  };

  return {
    /** Reads every row the names are built from whole: once, as the thread starts. */
    start(): void {
      startSessions();
      startWork();
      heard.projects();
      for (const machine of db.machines()) {
        machines.set(machine.machineId, machine);
      }
      for (const key of db.find.purged()) {
        purged.add(key);
      }
      startArtifacts();
      for (const [projectId, tasks] of Map.groupBy(
        db.find.tasks(),
        (task) => task.projectId
      )) {
        putTasks(projectId, tasks);
      }
      for (const routine of db.find.routines()) {
        routines.set(routine.id, routine);
        routinesOwed.add(routine.id);
      }
    },

    /** The change log named these rows: each read again by key, and what it stands in owed laying. */
    heard(changesHeard: ViewChanges): void {
      for (const kind of VIEW_KINDS) {
        const ids = changesHeard[kind] ?? [];
        // In bounded lists: under SQLite's bound on a statement's values.
        for (let at = 0; at < ids.length; at += KEYS_PER_READ) {
          heard[kind](ids.slice(at, at + KEYS_PER_READ));
        }
      }
    },

    /** A machine's catalog moved: these stored sessions of it are laid again (all: every one). */
    catalogMoved(
      machineId: string,
      sessionIds: readonly string[] | "all"
    ): void {
      const owed = storedOwed.get(machineId);
      if (sessionIds === "all" || owed === "all") {
        storedOwed.set(machineId, "all");
        return;
      }
      const set = owed ?? new Set<string>();
      for (const id of sessionIds) {
        set.add(id);
      }
      storedOwed.set(machineId, set);
    },

    /**
     * The names as they stand: what is owed laid, each machine's last
     * contact read (a handful of rows), each conversation's parentage
     * weighed as of `now`, the entries in one list.
     */
    names(now: number): Names {
      settle(now);
      const today = now - DAY_MS;
      const held = new Map<string, Held>();
      for (const [id, one] of conversations) {
        one.children = [...(children.get(id) ?? [])];
        const parent = one.row.parentInstanceId
          ? rows.get(one.row.parentInstanceId)
          : undefined;
        one.entry.kin = kinOf(one.row, parent, today);
        held.set(id, one);
      }
      for (const machine of db.machines()) {
        machines.set(machine.machineId, machine);
      }
      return {
        bySessionId,
        conversations: held,
        hubMade,
        machines,
        stored: storedEntries,
        entries: [
          ...[...held.values()].map((one) => one.entry),
          ...storedEntries.values(),
          ...[...taskEntries.values()].flat(),
          ...routineEntries.values(),
          ...projectEntries.values(),
          ...[...machines.values()].map((machine) =>
            machineEntry(machine, false)
          ),
          ...artifactEntries.values(),
          ...[...changeEntriesOf.values()].flat(),
        ],
      };
    },

    /** Every purged session, by `machineId:sessionId`: no find answers with one. */
    purged: (): ReadonlySet<string> => purged,
    /** A project's id and name; undefined for one the hub does not hold. */
    project: (id: string) => projectOf(id) ?? undefined,
    /** Every work item, for Jump's unread reports. */
    workItems: (): Iterable<FindWorkItemRow> => items.values(),
    /** A machine's hostname; its id when the hub knows none. */
    hostname: (id: string): string => machines.get(id)?.hostname ?? id,
    /** Every machine the hub knows. */
    machineIds: (): string[] => [...machines.keys()],
    /** Every project with its places (core `MemberProject`). */
    projects: (): Iterable<ViewProject> => projects.values(),
  };
};

export type FindIndex = ReturnType<typeof createFindIndex>;
