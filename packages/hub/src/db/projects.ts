/** Projects: their rows, places, links, offers, spend and notes, and folding one into another. */

import {
  type FleetSettings,
  type OnCap,
  type SettingsInEffect,
  settingsInEffect,
} from "@cawco/core/areas";
import type { MachinePath } from "@cawco/core/machine-path";
import type { ProjectNote } from "@cawco/core/project-conversation";
import type { SessionLimits } from "@cawco/core/protocol";
import type { StagesTemplate } from "@cawco/core/views";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import type { AreaRow } from "./areas";
import { projectPage } from "./artifacts";
import type { DbCore } from "./core";
import { walkOwned } from "./owned-rows";
import {
  actions,
  areas,
  artifacts,
  connectionProjects,
  fleetMemoryDocProjects,
  githubPollCursors,
  githubPollers,
  type HubFolder,
  instances,
  type OpenSubagent,
  projectAccounts,
  projectLinks,
  projectNotes,
  projectOffers,
  projectPlaces,
  projectRepositories,
  projects,
  queuedTaskStarts,
  queuedWorkItems,
  SESSION_LIMITS_ID,
  SPEND_SETTINGS_ID,
  sessionLimits,
  sessionSubagents,
  sessionTaints,
  spendSettings,
  taskCommentIds,
  usageBuckets,
  workItems,
  workspaces,
} from "./schema";
import { singleton, singletonColumn } from "./singleton";
import type { Tx } from "./tx";

export type PlaceRow = typeof projectPlaces.$inferSelect;

/**
 * A project as every client reads it: its row, whose `machineId` and `cwd`
 * are its primary place, and every place it has, the primary first.
 */
export type ProjectRow = Omit<
  typeof projects.$inferSelect,
  "accountsLimited"
> & {
  /** The accounts its sessions may run on (`project_accounts`); null: every account. */
  accounts: string[] | null;
  /**
   * Its settings in effect, each with where it came from: its own, else its
   * area's, else the fleet's (core `settingsInEffect`), read with the row.
   * Every reader that acts on one of them reads it here.
   */
  inEffect: SettingsInEffect;
  /** Its links (`project_links`), one per repository, oldest first. */
  links: string[];
  places: PlaceRow[];
};

export type ProjectOfferRow = typeof projectOffers.$inferSelect;

/** What a session has done that taints its memory notes (memory.ts), its open subagents with it. */
export type SessionTaintRow = typeof sessionTaints.$inferSelect & {
  subagents: OpenSubagent[];
};

/** A folder's trailing slashes, which {@link DbShape.projectHolding} reads past. */
const TRAILING_SLASHES = /\/+$/u;

/** A hub place's machine: the hub itself, which is no machine of the fleet. */
const HUB_PLACE_MACHINE = "hub";

/** Where a place stands in its project's list: the primary checkout, other checkouts, the hub's folder, workspaces. */
const placeRank = (place: PlaceRow): number => {
  if (place.isPrimary) {
    return 0;
  }
  return { checkout: 1, hub: 2, workspace: 3 }[place.kind];
};

/**
 * A project's primary checkout: where it is worked on, and the machine and
 * folder a client names it by. Undefined before it has a checkout (made on
 * the hub, its place still to be picked): "no checkout yet".
 */
export const checkoutOf = (project: ProjectRow): PlaceRow | undefined =>
  project.places.find((place) => place.isPrimary);

/** The project's folder on the hub, the place every project has from the start. */
const hubPlacePath = (projectId: string): HubFolder => `projects/${projectId}`;

/**
 * Each project with its places, the primary first, then oldest first, and
 * the accounts it allows: null for one not limited to some.
 */
const withPlaces = (
  rows: (typeof projects.$inferSelect)[],
  places: PlaceRow[],
  allowed: { accountId: string; projectId: string }[],
  links: { projectId: string; remote: string }[],
  above: { areas: readonly AreaRow[]; fleet: FleetSettings }
): ProjectRow[] => {
  const areaById = new Map(above.areas.map((area) => [area.id, area]));
  const linksOf = new Map<string, string[]>();
  for (const { projectId, remote } of links) {
    linksOf.set(projectId, [...(linksOf.get(projectId) ?? []), remote]);
  }
  const byProject = new Map<string, PlaceRow[]>();
  for (const place of places) {
    const listed = byProject.get(place.projectId);
    if (listed) {
      listed.push(place);
    } else {
      byProject.set(place.projectId, [place]);
    }
  }
  const accountsOf = new Map<string, string[]>();
  for (const { projectId, accountId } of allowed) {
    accountsOf.set(projectId, [
      ...(accountsOf.get(projectId) ?? []),
      accountId,
    ]);
  }
  return rows.map(({ accountsLimited, ...project }) => ({
    ...project,
    inEffect: settingsInEffect(
      project,
      (project.areaId && areaById.get(project.areaId)) || null,
      above.fleet
    ),
    accounts: accountsLimited ? (accountsOf.get(project.id) ?? []) : null,
    links: linksOf.get(project.id) ?? [],
    places: (byProject.get(project.id) ?? []).sort(
      (a, b) =>
        placeRank(a) - placeRank(b) ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id)
    ),
  }));
};

/** The project whose place holds the folder `cwd` on `machineId` (the deepest; the earliest made among equals). */
export const projectHoldingOf = (
  db: BunSQLiteDatabase,
  machineId: string,
  cwd: string
): string | undefined => {
  const at = cwd.replace(TRAILING_SLASHES, "") || "/";
  const base = sql`rtrim(${projectPlaces.path}, '/')`;
  return db
    .select({ projectId: projectPlaces.projectId })
    .from(projectPlaces)
    .innerJoin(projects, eq(projects.id, projectPlaces.projectId))
    .where(
      and(
        eq(projectPlaces.machineId, machineId),
        ne(projectPlaces.kind, "hub"),
        or(
          sql`${base} = ${at}`,
          sql`substr(${at}, 1, length(${base}) + 1) = ${base} || '/'`
        )
      )
    )
    .orderBy(
      desc(sql`length(${base})`),
      asc(projects.createdAt),
      asc(projects.id)
    )
    .limit(1)
    .get()?.projectId;
};

export interface ProjectsDb {
  /**
   * Files a place of a project. One already there for that project, machine
   * and folder is answered as it is, with `added` false. A project's first
   * checkout becomes its primary.
   */
  readonly addPlace: (
    place:
      | {
          projectId: string;
          machineId: string;
          path: MachinePath;
          kind: "checkout";
        }
      | {
          projectId: string;
          machineId: string;
          path: HubFolder;
          kind: "hub";
        }
  ) => { place: PlaceRow; added: boolean };
  /**
   * Links a repository (normalised remote) to a project, as the published
   * copy of hub repository `publishedFrom` when one is named: whether it was
   * not linked before.
   */
  readonly addProjectLink: (
    id: string,
    remote: string,
    publishedFrom?: string
  ) => boolean;
  /** Records the answer, filing the offer first when it was taken unprompted. */
  readonly answerProjectOffer: (
    instanceId: string,
    answer: "accepted" | "dismissed",
    projectId?: string
  ) => void;
  /** Dollars a project's Caw sessions have spent, from the usage their machines report. */
  /** Dollars the project's Caw turns have cost since `since` (ms epoch). */
  readonly cawSpentSince: (projectId: string, since: number) => number;
  /** The project's Caw conversations, ever, and when the newest of their turns was reported (ms epoch; null before any). */
  readonly cawThreads: (projectId: string) => {
    lastTurnAt: number | null;
    threads: number;
  };
  /** Every project's checkouts on `machineId`, oldest first: each one's `origin` and root commit are to read. */
  readonly checkoutsOn: (
    machineId: string
  ) => { id: string; projectId: string; path: string }[];
  /**
   * A project, with its folder on the hub as its first place, and the
   * checkout it was made from (`checkout`), its primary, when it has one.
   */
  readonly createProject: (project: {
    id: string;
    name: string;
    /** Its first checkout, with the root commit read there (null: none read). */
    checkout?: { machineId: string; path: MachinePath; root?: string | null };
    remote: string | null;
    /** Made with Caw: its Caw starts on. */
    caw?: boolean;
    /** The template tapped on New project, kept as tapped until its setup page is sent. */
    tapped?: StagesTemplate | null;
  }) => ProjectRow;
  /**
   * Folds a duplicate project into the one it duplicates (project-merge.ts),
   * in one transaction: its checkout and workspace places join `keepId`'s
   * (the same folder once), and every row that names it becomes `keepId`'s
   * (sessions, work items, notes, the rules scoped
   * to it, routines with their routes and polls, events, actions, relays,
   * moves, artifacts, notices, fleet rows, offers, granted connections,
   * queued starts), task ids renamed through `taskIds`; then its row goes.
   * `keepId`'s settings, allowed accounts, primary place, repositories and
   * GitHub poller stand. Answers what moved.
   */
  readonly foldProject: (
    dupId: string,
    keepId: string,
    taskIds: ReadonlyMap<string, string>
  ) => { places: number; sessions: number; workItems: number };
  readonly listProjects: () => ProjectRow[];
  /** Notes a comment written under the id its device chose, once committed. */
  readonly noteTaskComment: (said: {
    id: string;
    projectId: string;
    taskId: string;
  }) => void;
  /** Files an offer; false when the session was already offered one. */
  readonly offerProject: (offer: {
    instanceId: string;
    reason: ProjectOfferRow["reason"];
    line: string;
  }) => boolean;
  /** The offers nobody has answered yet. */
  readonly openProjectOffers: () => ProjectOfferRow[];
  /** A project with its places, or undefined for an id the hub does not hold. */
  readonly project: (id: string) => ProjectRow | undefined;
  /** The oldest project that links `remote` (normalised). */
  readonly projectByRemote: (remote: string) => ProjectRow | undefined;
  /**
   * The project whose place on `machineId` holds `cwd` most closely (core
   * `projectAt`, the rule migration 0309 placed every older row by): the
   * deepest place, the oldest project where two share it. Undefined: none.
   */
  readonly projectHolding: (
    machineId: string,
    cwd: string
  ) => string | undefined;
  /** The link a project published hub repository `segment` as, if it has. */
  readonly projectLinkPublishedFrom: (
    projectId: string,
    segment: string
  ) => string | undefined;
  /**
   * The hub's notes to the person about a project (caw.ts `notice`): `add`
   * keeps one, its conversation's line, or the next one's while it has none
   * (`instanceId` null); `adopt` makes the waiting ones the conversation's
   * that just started; `of` reads a conversation's, oldest first.
   */
  readonly projectNotes: {
    add: (
      projectId: string,
      instanceId: string | null,
      note: ProjectNote
    ) => { at: number; id: string; note: ProjectNote };
    adopt: (projectId: string, instanceId: string) => void;
    of: (instanceId: string) => { at: number; id: string; note: ProjectNote }[];
  };
  /** A session's "make this a project" offer, answered or not (project-offers.ts). */
  readonly projectOffer: (instanceId: string) => ProjectOfferRow | undefined;
  /** The project's repository on a machine, as the last workspace cut there recorded it. */
  readonly projectRepository: (
    projectId: string,
    machineId: string
  ) => MachinePath | undefined;
  /**
   * The project's spend over today and this month, each part from the usage
   * its sessions reported: its conversations', every attempt's session's and
   * every other session's. The parts add up to the totals.
   */
  readonly projectSpend: (
    projectId: string,
    since: { monthStart: number; todayStart: number }
  ) => {
    caw: { monthUsd: number; todayUsd: number };
    others: { monthUsd: number; todayUsd: number };
    items: {
      at: number;
      state: string;
      taskId: string;
      title: string;
      type: string | null;
      usd: number;
    }[];
    monthUsd: number;
    todayUsd: number;
  };
  /**
   * The project's delegated work since `since` (ms epoch), by the delegate
   * type each work item ran on (attempts, routine runs, delegates; null where
   * none was named): what their sessions reported spending in the window, and
   * how many items spent. Most first.
   */
  readonly projectSpendByType: (
    projectId: string,
    since: number
  ) => { items: number; type: string | null; usd: number }[];
  /**
   * Dollars the project has cost since `since` (ms epoch): its Caw's booked
   * turns and every other session's reported usage. What its cap counts.
   */
  readonly projectSpentSince: (projectId: string, since: number) => number;
  /**
   * The projects with a work item on `machineId`: in a workspace there,
   * whatever checkout the project has there. The machine is sent their rows
   * (fleet-sources.ts `machineFleetItems`).
   */
  readonly projectsWorkedOn: (machineId: string) => string[];
  /** Stores what a session has done that taints its memory notes (memory.ts), replacing what it had. */
  readonly putSessionTaint: (row: SessionTaintRow) => void;
  /** Records the folder a workspace of the project was just cut from on a machine; the last one stands. */
  readonly recordProjectRepository: (repository: {
    projectId: string;
    machineId: string;
    path: MachinePath;
  }) => void;
  /**
   * Removes one of a project's places. Its primary checkout and its hub
   * folder are never removed here: forgetting the project is.
   */
  readonly removePlace: (
    projectId: string,
    placeId: string
  ) => "removed" | "primary" | "missing";
  /** The fleet's session limits; none set reads as `{}`. */
  readonly sessionLimits: () => SessionLimits;
  /** What a session has done that taints its memory notes; undefined for one that has done nothing the hub keeps. */
  readonly sessionTaint: (instanceId: string) => SessionTaintRow | undefined;
  /** A move's "Don't move", remembered on its project; null forgets it. */
  /** Records the root commit checkout place `id` was read at. */
  readonly setPlaceRoot: (id: string, commit: string) => void;
  /** The project's spend cap and what reaching it does (project-caps.ts). */
  readonly setProjectCap: (
    id: string,
    change: Pick<ProjectRow, "capUsd" | "capPeriod" | "onCap">
  ) => void;
  /** The project's Caw: on or off, its harness, and its conversation session (caw.ts). */
  readonly setProjectCaw: (
    id: string,
    change: Partial<
      Pick<
        ProjectRow,
        | "eventsOn"
        | "cawHarness"
        | "cawMode"
        | "cawModel"
        | "conversationInstanceId"
        | "hearsTasks"
        | "attemptsHearComments"
      >
    >
  ) => void;
  /** The project's name, its Review before done, its large files and its account, as project-edit.ts checked them. */
  readonly setProjectDetails: (
    id: string,
    change: Partial<
      Pick<
        ProjectRow,
        | "account"
        | "accountAtLimit"
        | "lfsConnection"
        | "lfsUrl"
        | "name"
        | "review"
      >
    >
  ) => void;
  /** The project's dispatch settings: whether it dispatches, its caps, its default budget and landing. */
  readonly setProjectDispatch: (
    id: string,
    change: Partial<
      Pick<
        ProjectRow,
        | "budget"
        | "dispatch"
        | "lands"
        | "maxAttempts"
        | "reviewLimit"
        | "runsOn"
      >
    >
  ) => void;
  /** The stage template a project last had applied: its starter skills follow it. */
  readonly setProjectTemplate: (id: string, template: StagesTemplate) => void;
  /** The fleet's session limits, whole: a field absent is no limit. */
  readonly setSessionLimits: (limits: SessionLimits) => void;
  /** What reaching a cap does where a project sets nothing. */
  readonly setSpendOnCap: (onCap: OnCap) => void;
  /** What reaching a cap does where a project sets nothing; its default before any is set. */
  readonly spendOnCap: () => OnCap;
  /** The task a comment written under the id its device chose went on (`task_comment_ids`). */
  readonly taskCommentSaid: (
    id: string
  ) => { projectId: string; taskId: string } | undefined;
}

export const projectsDb = (core: DbCore): ProjectsDb => {
  const { db, dropArtifacts, supervisorChoices } = core;

  /** Writes a change to a project's row; nothing for an empty one. */
  const setProject = (
    id: string,
    change: Partial<typeof projects.$inferInsert>
  ): void => {
    if (Object.keys(change).length > 0) {
      db.update(projects).set(change).where(eq(projects.id, id)).run();
    }
  };

  /**
   * Dollars the project's conversations (sessions of origin `project`) cost
   * since `since` (ms epoch), from the usage buckets every session reports.
   */
  const cawSince = (projectId: string, since: number): number =>
    db
      .select({ usd: sql<number>`coalesce(sum(${usageBuckets.costUsd}), 0)` })
      .from(usageBuckets)
      .innerJoin(instances, eq(instances.sessionId, usageBuckets.sessionId))
      .where(
        and(
          eq(instances.projectId, projectId),
          eq(instances.origin, "project"),
          sql`${usageBuckets.start} >= ${since}`
        )
      )
      .get()?.usd ?? 0;

  /** What reaching a cap does across the fleet (`spend_settings`): `both` until it is set. */
  const fleetOnCap = (): OnCap =>
    singletonColumn(
      db,
      spendSettings,
      SPEND_SETTINGS_ID,
      spendSettings.onCap
    ) ?? "both";

  /**
   * What stands above the projects read: their areas (`areaIds`, else every
   * area) and the fleet's settings, from which each reads its settings in
   * effect ({@link withPlaces}).
   */
  const aboveProjects = (
    from: Pick<Tx, "select">,
    areaIds?: string[]
  ): { areas: AreaRow[]; fleet: FleetSettings } => {
    const fleet = { cawMode: supervisorChoices().cawMode, onCap: fleetOnCap() };
    if (areaIds?.length === 0) {
      return { areas: [], fleet };
    }
    const query = from.select().from(areas);
    return {
      areas: areaIds
        ? query.where(inArray(areas.id, areaIds)).all()
        : query.all(),
      fleet,
    };
  };

  /** One project and its places, read inside a transaction or out of one. */
  const projectOf = (
    from: Pick<Tx, "select">,
    id: string
  ): ProjectRow | undefined => {
    const row = from.select().from(projects).where(eq(projects.id, id)).get();
    return row
      ? withPlaces(
          [row],
          from
            .select()
            .from(projectPlaces)
            .where(eq(projectPlaces.projectId, id))
            .all(),
          from
            .select()
            .from(projectAccounts)
            .where(eq(projectAccounts.projectId, id))
            .orderBy(sql`rowid`)
            .all(),
          from
            .select()
            .from(projectLinks)
            .where(eq(projectLinks.projectId, id))
            .orderBy(asc(projectLinks.createdAt), sql`rowid`)
            .all(),
          aboveProjects(from, row.areaId ? [row.areaId] : [])
        )[0]
      : undefined;
  };

  return {
    projectHolding: (machineId, cwd) => projectHoldingOf(db, machineId, cwd),
    listProjects: () =>
      withPlaces(
        db.select().from(projects).all(),
        db.select().from(projectPlaces).all(),
        db
          .select()
          .from(projectAccounts)
          .orderBy(sql`rowid`)
          .all(),
        db
          .select()
          .from(projectLinks)
          .orderBy(asc(projectLinks.createdAt), sql`rowid`)
          .all(),
        aboveProjects(db)
      ),
    project: (id) => projectOf(db, id),
    projectsWorkedOn: (machineId) =>
      db
        .selectDistinct({ projectId: workItems.projectId })
        .from(workItems)
        .innerJoin(workspaces, eq(workspaces.id, workItems.workspaceId))
        .where(
          and(
            eq(workspaces.machineId, machineId),
            isNotNull(workItems.projectId)
          )
        )
        .all()
        .flatMap(({ projectId }) => (projectId ? [projectId] : [])),
    projectRepository: (projectId, machineId) =>
      db
        .select({ path: projectRepositories.path })
        .from(projectRepositories)
        .where(
          and(
            eq(projectRepositories.projectId, projectId),
            eq(projectRepositories.machineId, machineId)
          )
        )
        .get()?.path,
    recordProjectRepository: (repository) => {
      const row = { ...repository, recordedAt: new Date() };
      db.insert(projectRepositories)
        .values(row)
        .onConflictDoUpdate({
          target: [
            projectRepositories.projectId,
            projectRepositories.machineId,
          ],
          set: { path: row.path, recordedAt: row.recordedAt },
        })
        .run();
    },
    projectByRemote: (remote) => {
      const [oldest] = db
        .select({ id: projects.id })
        .from(projectLinks)
        .innerJoin(projects, eq(projects.id, projectLinks.projectId))
        .where(eq(projectLinks.remote, remote))
        .orderBy(asc(projects.createdAt), asc(projects.id))
        .limit(1)
        .all();
      return oldest && projectOf(db, oldest.id);
    },
    checkoutsOn: (machineId) =>
      db
        .select({
          id: projectPlaces.id,
          projectId: projectPlaces.projectId,
          path: projectPlaces.path,
        })
        .from(projectPlaces)
        .where(
          and(
            eq(projectPlaces.machineId, machineId),
            eq(projectPlaces.kind, "checkout")
          )
        )
        .orderBy(asc(projectPlaces.createdAt))
        .all(),
    addProjectLink: (id, remote, publishedFrom) =>
      db
        .insert(projectLinks)
        .values({ projectId: id, remote, publishedFrom: publishedFrom ?? null })
        .onConflictDoNothing()
        .returning({ remote: projectLinks.remote })
        .all().length > 0,
    setPlaceRoot: (id, commit) => {
      db.update(projectPlaces)
        .set({ root: commit })
        .where(eq(projectPlaces.id, id))
        .run();
    },
    projectLinkPublishedFrom: (projectId, segment) =>
      db
        .select({ remote: projectLinks.remote })
        .from(projectLinks)
        .where(
          and(
            eq(projectLinks.projectId, projectId),
            eq(projectLinks.publishedFrom, segment)
          )
        )
        .get()?.remote,
    setProjectDetails: (id, change) => {
      db.update(projects).set(change).where(eq(projects.id, id)).run();
    },
    setProjectTemplate: (id, template) => {
      db.update(projects).set({ template }).where(eq(projects.id, id)).run();
    },
    projectOffer: (instanceId) =>
      db
        .select()
        .from(projectOffers)
        .where(eq(projectOffers.instanceId, instanceId))
        .get(),
    openProjectOffers: () =>
      db.select().from(projectOffers).where(isNull(projectOffers.answer)).all(),
    offerProject: ({ instanceId, reason, line }) =>
      db
        .insert(projectOffers)
        .values({ instanceId, reason, line, offeredAt: new Date() })
        .onConflictDoNothing()
        .returning({ instanceId: projectOffers.instanceId })
        .all().length > 0,
    answerProjectOffer: (instanceId, answer, projectId) => {
      const answeredAt = new Date();
      db.insert(projectOffers)
        .values({
          instanceId,
          reason: "caw",
          line: "",
          offeredAt: answeredAt,
          answer,
          answeredAt,
          projectId: projectId ?? null,
        })
        .onConflictDoUpdate({
          target: projectOffers.instanceId,
          set: { answer, answeredAt, projectId: projectId ?? null },
        })
        .run();
    },
    setProjectDispatch: (id, change) => setProject(id, change),
    setProjectCaw: (id, change) => setProject(id, change),
    setProjectCap: (id, change) => {
      db.update(projects).set(change).where(eq(projects.id, id)).run();
    },
    setSpendOnCap: (onCap) => {
      db.insert(spendSettings)
        .values({ id: SPEND_SETTINGS_ID, onCap })
        .onConflictDoUpdate({ target: spendSettings.id, set: { onCap } })
        .run();
    },
    setSessionLimits: (limits) => {
      const values = {
        memoryPercent: limits.memoryPercent ?? null,
        cpuPercent: limits.cpuPercent ?? null,
      };
      db.insert(sessionLimits)
        .values({ id: SESSION_LIMITS_ID, ...values })
        .onConflictDoUpdate({ target: sessionLimits.id, set: values })
        .run();
    },
    sessionLimits: () => {
      const row = singleton(db, sessionLimits, SESSION_LIMITS_ID);
      const memoryPercent = row?.memoryPercent ?? undefined;
      const cpuPercent = row?.cpuPercent ?? undefined;
      return {
        ...(memoryPercent === undefined ? {} : { memoryPercent }),
        ...(cpuPercent === undefined ? {} : { cpuPercent }),
      };
    },
    spendOnCap: fleetOnCap,
    projectSpentSince: (projectId, since) =>
      db
        .select({
          usd: sql<number>`coalesce(sum(${usageBuckets.costUsd}), 0)`,
        })
        .from(usageBuckets)
        .innerJoin(instances, eq(instances.sessionId, usageBuckets.sessionId))
        .where(
          and(
            eq(instances.projectId, projectId),
            sql`${usageBuckets.start} >= ${since}`
          )
        )
        .get()?.usd ?? 0,
    sessionTaint: (instanceId) => {
      const row = db
        .select()
        .from(sessionTaints)
        .where(eq(sessionTaints.instanceId, instanceId))
        .get();
      return (
        row && {
          ...row,
          subagents: db
            .select({
              task: sessionSubagents.task,
              call: sessionSubagents.call,
            })
            .from(sessionSubagents)
            .where(eq(sessionSubagents.instanceId, instanceId))
            .all(),
        }
      );
    },
    putSessionTaint: ({ subagents, ...row }) => {
      const { instanceId, ...rest } = row;
      db.transaction((tx) => {
        tx.insert(sessionTaints)
          .values(row)
          .onConflictDoUpdate({ target: sessionTaints.instanceId, set: rest })
          .run();
        tx.delete(sessionSubagents)
          .where(eq(sessionSubagents.instanceId, instanceId))
          .run();
        if (subagents.length > 0) {
          tx.insert(sessionSubagents)
            .values(subagents.map((open) => ({ instanceId, ...open })))
            .run();
        }
      });
    },
    cawSpentSince: (projectId, since) => cawSince(projectId, since),
    cawThreads: (projectId) => {
      const conversations = and(
        eq(instances.projectId, projectId),
        eq(instances.origin, "project")
      );
      const threads =
        db
          .select({ count: sql<number>`count(*)` })
          .from(instances)
          .where(conversations)
          .get()?.count ?? 0;
      const last =
        db
          .select({ at: sql<number | null>`max(${usageBuckets.lastTs})` })
          .from(usageBuckets)
          .innerJoin(instances, eq(instances.sessionId, usageBuckets.sessionId))
          .where(conversations)
          .get()?.at ?? null;
      return { threads, lastTurnAt: last };
    },
    projectSpend: (projectId, { todayStart, monthStart }) => {
      // Caw: what the project's conversations reported.
      const caw = {
        today: cawSince(projectId, todayStart),
        month: cawSince(projectId, monthStart),
      };
      // Each attempt with what its session reported this month.
      const items = db
        .select({
          taskId: workItems.taskId,
          title: workItems.title,
          type: workItems.type,
          state: workItems.state,
          createdAt: workItems.createdAt,
          endedAt: workItems.endedAt,
          instanceId: workItems.instanceId,
          today: sql<number>`coalesce(sum(case when ${usageBuckets.start} >= ${todayStart} then ${usageBuckets.costUsd} else 0 end), 0)`,
          usd: sql<number>`coalesce(sum(case when ${usageBuckets.start} >= ${monthStart} then ${usageBuckets.costUsd} else 0 end), 0)`,
        })
        .from(workItems)
        .leftJoin(instances, eq(instances.id, workItems.instanceId))
        .leftJoin(usageBuckets, eq(usageBuckets.sessionId, instances.sessionId))
        .where(
          and(eq(workItems.projectId, projectId), isNotNull(workItems.taskId))
        )
        .groupBy(workItems.id)
        .orderBy(asc(workItems.createdAt))
        .all();
      // Every other session of the project (not its conversation, counted
      // above, and not an attempt).
      const attemptSessions = items.flatMap((item) =>
        item.instanceId ? [item.instanceId] : []
      );
      const others = db
        .select({
          today: sql<number>`coalesce(sum(case when ${usageBuckets.start} >= ${todayStart} then ${usageBuckets.costUsd} else 0 end), 0)`,
          month: sql<number>`coalesce(sum(case when ${usageBuckets.start} >= ${monthStart} then ${usageBuckets.costUsd} else 0 end), 0)`,
        })
        .from(usageBuckets)
        .innerJoin(instances, eq(instances.sessionId, usageBuckets.sessionId))
        .where(
          and(
            eq(instances.projectId, projectId),
            ne(instances.origin, "project"),
            attemptSessions.length > 0
              ? notInArray(instances.id, attemptSessions)
              : undefined
          )
        )
        .get();
      const attemptsToday = items.reduce((sum, item) => sum + item.today, 0);
      const attemptsMonth = items.reduce((sum, item) => sum + item.usd, 0);
      const cawToday = caw.today;
      const cawMonth = caw.month;
      return {
        todayUsd: cawToday + attemptsToday + (others?.today ?? 0),
        monthUsd: cawMonth + attemptsMonth + (others?.month ?? 0),
        caw: {
          todayUsd: cawToday,
          monthUsd: cawMonth,
        },
        others: { todayUsd: others?.today ?? 0, monthUsd: others?.month ?? 0 },
        items: items.map((item) => ({
          taskId: item.taskId as string,
          title: item.title,
          type: item.type,
          state: item.state,
          usd: item.usd,
          at: (item.endedAt ?? item.createdAt).getTime(),
        })),
      };
    },
    projectNotes: {
      add: (projectId, instanceId, note) => {
        const row = {
          id: `note-${crypto.randomUUID()}`,
          projectId,
          instanceId,
          at: new Date(),
          note,
        };
        db.insert(projectNotes).values(row).run();
        return { at: row.at.getTime(), id: row.id, note };
      },
      adopt: (projectId, instanceId) => {
        db.update(projectNotes)
          .set({ instanceId })
          .where(
            and(
              eq(projectNotes.projectId, projectId),
              isNull(projectNotes.instanceId)
            )
          )
          .run();
      },
      of: (instanceId) =>
        db
          .select()
          .from(projectNotes)
          .where(eq(projectNotes.instanceId, instanceId))
          .orderBy(asc(projectNotes.at))
          .all()
          .map((row) => ({ at: row.at.getTime(), id: row.id, note: row.note })),
    },
    projectSpendByType: (projectId, since) =>
      db
        .select({
          type: workItems.type,
          usd: sql<number>`coalesce(sum(${usageBuckets.costUsd}), 0)`,
          items: sql<number>`count(distinct ${workItems.id})`,
        })
        .from(workItems)
        .innerJoin(instances, eq(instances.id, workItems.instanceId))
        .innerJoin(
          usageBuckets,
          eq(usageBuckets.sessionId, instances.sessionId)
        )
        .where(
          and(
            eq(workItems.projectId, projectId),
            sql`${usageBuckets.start} >= ${since}`
          )
        )
        .groupBy(workItems.type)
        .orderBy(desc(sql`coalesce(sum(${usageBuckets.costUsd}), 0)`))
        .all(),
    taskCommentSaid: (id) =>
      db
        .select({
          projectId: taskCommentIds.projectId,
          taskId: taskCommentIds.taskId,
        })
        .from(taskCommentIds)
        .where(eq(taskCommentIds.id, id))
        .get(),
    noteTaskComment: ({ id, projectId, taskId }) => {
      db.insert(taskCommentIds)
        .values({ id, projectId, taskId, saidAt: new Date() })
        .onConflictDoNothing()
        .run();
    },
    createProject: ({ id, name, checkout, remote, caw = false, tapped }) =>
      db.transaction((tx) => {
        tx.insert(projects)
          .values({
            id,
            name,
            eventsOn: caw,
            tapped: tapped ?? null,
          })
          .run();
        if (remote) {
          tx.insert(projectLinks).values({ projectId: id, remote }).run();
        }
        tx.insert(projectPlaces)
          .values({
            id: crypto.randomUUID(),
            projectId: id,
            machineId: HUB_PLACE_MACHINE,
            path: hubPlacePath(id),
            kind: "hub",
          })
          .run();
        if (checkout) {
          tx.insert(projectPlaces)
            .values({
              id: crypto.randomUUID(),
              projectId: id,
              machineId: checkout.machineId,
              path: checkout.path,
              root: checkout.root ?? null,
              kind: "checkout",
              isPrimary: true,
            })
            .run();
        }
        const created = projectOf(tx, id);
        if (!created) {
          throw new Error(`project ${id} was not filed`);
        }
        return created;
      }),
    addPlace: (place) => {
      const added = db.transaction((tx) => {
        // The first checkout a project gains is its primary.
        const primary =
          place.kind === "checkout" &&
          !tx
            .select({ id: projectPlaces.id })
            .from(projectPlaces)
            .where(
              and(
                eq(projectPlaces.projectId, place.projectId),
                eq(projectPlaces.isPrimary, true)
              )
            )
            .get();
        return tx
          .insert(projectPlaces)
          .values({ id: crypto.randomUUID(), ...place, isPrimary: primary })
          .onConflictDoNothing()
          .returning()
          .get();
      });
      if (added) {
        return { place: added, added: true };
      }
      const standing = db
        .select()
        .from(projectPlaces)
        .where(
          and(
            eq(projectPlaces.projectId, place.projectId),
            eq(projectPlaces.machineId, place.machineId),
            eq(projectPlaces.path, place.path)
          )
        )
        .get();
      if (!standing) {
        throw new Error(
          `place ${place.machineId}:${place.path} of project ${place.projectId} was neither filed nor found`
        );
      }
      return { place: standing, added: false };
    },
    removePlace: (projectId, placeId) => {
      const place = db
        .select()
        .from(projectPlaces)
        .where(
          and(
            eq(projectPlaces.id, placeId),
            eq(projectPlaces.projectId, projectId)
          )
        )
        .get();
      if (!place) {
        return "missing";
      }
      if (place.isPrimary || place.kind === "hub") {
        return "primary";
      }
      db.delete(projectPlaces).where(eq(projectPlaces.id, placeId)).run();
      return "removed";
    },
    foldProject: (dupId, keepId, taskIds) =>
      db.transaction((tx) => {
        const renamed = (taskId: string | null): string | null =>
          taskId ? (taskIds.get(taskId) ?? taskId) : null;
        /** The duplicate's rows of `table`, by `column`, the kept project's. */
        const moveRows = (column: SQLiteColumn): void => {
          tx.run(
            sql`UPDATE ${column.table} SET ${sql.identifier(column.name)} = ${keepId} WHERE ${sql.identifier(column.name)} = ${dupId}`
          );
        };
        let places = 0;
        let sessions = 0;
        let items = 0;
        walkOwned(
          "foldProject",
          {
            // Places: the duplicate's checkouts and workspaces join, each
            // folder once; its hub folder is its own, and goes with it.
            project_places: () => {
              const kept = tx
                .select()
                .from(projectPlaces)
                .where(eq(projectPlaces.projectId, keepId))
                .all();
              const where = new Set(
                kept.map((p) => `${p.machineId}\0${p.path}`)
              );
              let primary = kept.some((p) => p.isPrimary);
              for (const place of tx
                .select()
                .from(projectPlaces)
                .where(eq(projectPlaces.projectId, dupId))
                .orderBy(asc(projectPlaces.createdAt))
                .all()) {
                const key = `${place.machineId}\0${place.path}`;
                if (place.kind === "hub" || where.has(key)) {
                  continue;
                }
                const first = !primary && place.kind === "checkout";
                primary ||= first;
                where.add(key);
                tx.insert(projectPlaces)
                  .values({
                    ...place,
                    id: crypto.randomUUID(),
                    projectId: keepId,
                    isPrimary: first,
                  })
                  .run();
                places += 1;
              }
            },
            // Its links: each repository it linked, the kept project's too.
            project_links: () => {
              for (const link of tx
                .select()
                .from(projectLinks)
                .where(eq(projectLinks.projectId, dupId))
                .all()) {
                tx.insert(projectLinks)
                  .values({ ...link, projectId: keepId })
                  .onConflictDoNothing()
                  .run();
              }
            },
            // Its repository on a machine where the kept project records none.
            project_repositories: () => {
              const machines = new Set(
                tx
                  .select({ machineId: projectRepositories.machineId })
                  .from(projectRepositories)
                  .where(eq(projectRepositories.projectId, keepId))
                  .all()
                  .map((row) => row.machineId)
              );
              for (const repository of tx
                .select()
                .from(projectRepositories)
                .where(eq(projectRepositories.projectId, dupId))
                .all()) {
                if (!machines.has(repository.machineId)) {
                  tx.insert(projectRepositories)
                    .values({ ...repository, projectId: keepId })
                    .run();
                }
              }
            },
            instances: () => {
              sessions = tx
                .select({ id: instances.id })
                .from(instances)
                .where(eq(instances.projectId, dupId))
                .all().length;
              tx.update(instances)
                .set({ projectId: keepId })
                .where(eq(instances.projectId, dupId))
                .run();
            },
            work_items: () => {
              const moved = tx
                .select({ id: workItems.id, taskId: workItems.taskId })
                .from(workItems)
                .where(eq(workItems.projectId, dupId))
                .all();
              for (const item of moved) {
                tx.update(workItems)
                  .set({ projectId: keepId, taskId: renamed(item.taskId) })
                  .where(eq(workItems.id, item.id))
                  .run();
              }
              items = moved.length;
            },
            // An action names its task by the duplicate's number.
            actions: () => {
              for (const action of tx
                .select({ id: actions.id, taskId: actions.taskId })
                .from(actions)
                .where(
                  and(eq(actions.projectId, dupId), isNotNull(actions.taskId))
                )
                .all()) {
                tx.update(actions)
                  .set({ taskId: renamed(action.taskId) })
                  .where(eq(actions.id, action.id))
                  .run();
              }
              moveRows(actions.projectId);
            },
            // A page of a name the kept project has goes: the kept project's
            // source of that name stood (project-merge.ts copies only the
            // files it lacks), and a project's page is the project's by its
            // name.
            artifacts: () => {
              const keptNames = tx
                .select({ name: artifacts.name })
                .from(artifacts)
                .where(and(projectPage, eq(artifacts.projectId, keepId)));
              dropArtifacts(
                tx,
                and(
                  projectPage,
                  eq(artifacts.projectId, dupId),
                  inArray(artifacts.name, keptNames)
                )
              );
              moveRows(artifacts.projectId);
            },
            // The connections it was granted go with its row: project-merge.ts
            // grants them to the kept project through connections.ts.
            connection_projects: () => {
              tx.delete(connectionProjects)
                .where(eq(connectionProjects.projectId, dupId))
                .run();
            },
            // Its GitHub poller, with its cursors, where the kept project
            // polls none: both poll the one repository they share.
            github_pollers: () => {
              const poller = tx
                .select()
                .from(githubPollers)
                .where(eq(githubPollers.projectId, dupId))
                .get();
              if (
                poller &&
                !tx
                  .select({ projectId: githubPollers.projectId })
                  .from(githubPollers)
                  .where(eq(githubPollers.projectId, keepId))
                  .get()
              ) {
                tx.insert(githubPollers)
                  .values({ ...poller, projectId: keepId })
                  .run();
                tx.update(githubPollCursors)
                  .set({ projectId: keepId })
                  .where(eq(githubPollCursors.projectId, dupId))
                  .run();
              }
            },
            // A memory document of both stays one link to the kept project.
            fleet_memory_doc_projects: () => {
              for (const link of tx
                .select()
                .from(fleetMemoryDocProjects)
                .where(eq(fleetMemoryDocProjects.projectId, dupId))
                .all()) {
                tx.insert(fleetMemoryDocProjects)
                  .values({ path: link.path, projectId: keepId })
                  .onConflictDoNothing()
                  .run();
              }
              tx.delete(fleetMemoryDocProjects)
                .where(eq(fleetMemoryDocProjects.projectId, dupId))
                .run();
            },
            queued_task_starts: () => {
              for (const queued of tx
                .select()
                .from(queuedTaskStarts)
                .where(eq(queuedTaskStarts.projectId, dupId))
                .all()) {
                tx.insert(queuedTaskStarts)
                  .values({
                    ...queued,
                    projectId: keepId,
                    taskId: renamed(queued.taskId) ?? queued.taskId,
                  })
                  .onConflictDoNothing()
                  .run();
              }
              tx.delete(queuedTaskStarts)
                .where(eq(queuedTaskStarts.projectId, dupId))
                .run();
            },
            // A queued delegate for one of its tasks starts the task it is now.
            queued_work_items: () => {
              for (const queued of tx
                .select({
                  id: queuedWorkItems.id,
                  taskId: queuedWorkItems.taskId,
                })
                .from(queuedWorkItems)
                .where(eq(queuedWorkItems.projectId, dupId))
                .all()) {
                tx.update(queuedWorkItems)
                  .set({ projectId: keepId, taskId: renamed(queued.taskId) })
                  .where(eq(queuedWorkItems.id, queued.id))
                  .run();
              }
            },
          },
          // Its notes each where they stand, a rule scoped to it, its
          // routines with their routes and polls, the events it took in, its
          // relays and moves, Caw's turns and calls, its notices, hooks,
          // servers, skills and its offer: the kept project's from now on,
          // where the duplicate's row going would have taken them or left
          // them naming it.
          ({ column }) => moveRows(column)
        );
        // Its index rows and the rest of its own rows go with it (cascade).
        tx.delete(projects).where(eq(projects.id, dupId)).run();
        return { places, sessions, workItems: items };
      }),
  };
};
