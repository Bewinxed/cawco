/**
 * Areas (core areas.ts, the project-grouping decision): the API that makes,
 * names, orders and deletes them, sets what each carries, and puts a
 * project in one. Each project reads its settings in effect with its row
 * (db `inEffect`), so every reader of a setting follows a move at once; this
 * module checks what reaches the rows and says what a change falls back to.
 *
 * - An area's row settings mirror a project's: its account and what its
 *   sessions do at that account's limit, its Caw permission mode, its
 *   budget and what reaching it does. Null clears one.
 * - Its folder on the hub (`areas/<id>/`, project-folder.ts `areaFolder`)
 *   holds its `decides.md` and `delegates/`, read and written
 *   through the project folder's own module and guards.
 * - Deleting an area ungroups its projects and deletes nothing of them; the
 *   scopes naming it (memory documents, connections, rules) go with it, and
 *   its folder is deleted. A memory document scoped to it alone goes to the
 *   trash first, as a forgotten project's does: its scope never widens to
 *   every project. The answer says what each project falls back to:
 *   "4 projects fall back to the fleet's account".
 * - Moving a project in or out says the same of it: what it takes from its
 *   new area, what falls back to the fleet's. Its running conversation moves
 *   with an account it now starts on, as an account edit moves it.
 */

import type { ProjectAtLimit } from "@cawco/core/accounts";
import {
  AREA_NAME_LIMIT,
  type Area,
  type CapPeriod,
  type OnCap,
  type SettingSource,
  type SettingsInEffect,
} from "@cawco/core/areas";
import { type OfferedMode, PERMISSION_MODES } from "@cawco/core/harness/kinds";
import { type AreaSettingName, areaWords } from "@cawco/core/words/areas";
import { Elysia, ElysiaStatus, t } from "elysia";
import type { DbShape } from "./db";
import type { AreaDeleted, AreaSettingsChange } from "./db/areas";
import type { ProjectRow } from "./db/projects";
import {
  areaFolder,
  deleteAsked,
  deleteProjectFolder,
  FOLDER_WRITE,
  listFolder,
  MESSAGE_LIMIT,
  readFolderFile,
  writeAsked,
} from "./project-folder";
import { refusal, schemaRefusal } from "./refusal";

/** What an area's settings write asks: any field, null clearing it. */
export interface AreaSettingsAsk {
  account?: string | null;
  accountAtLimit?: ProjectAtLimit;
  /** Its budget: an amount above 0 and its period, or null for none. */
  cap?: { period: CapPeriod; usd: number } | null;
  cawMode?: OfferedMode | null;
  name?: string;
  onCap?: OnCap | null;
}

/** The folder settings a project takes from somewhere: its Who decides and its delegate types. */
export interface FolderSources {
  decides: SettingSource[];
  types: SettingSource[];
}

export interface AreasDeps {
  /**
   * A project's running conversation moved onto the account it starts on
   * now (server.ts, as an account edit moves it): what became of it in a
   * sentence; undefined when there was nothing to move.
   */
  readonly accountMoved: (project: ProjectRow) => Promise<string | undefined>;
  /**
   * Something every reader of a project's settings follows moved: the
   * dashboards read the projects again, the rule engine its facts, the
   * machines their placed rows, the caps their state.
   */
  readonly changed: () => void;
  readonly db: Pick<
    DbShape,
    | "accounts"
    | "areas"
    | "listFleetMemoryDocs"
    | "listProjects"
    | "project"
    | "trash"
  >;
  /** Where a project's Who decides and delegate types come from now (decides-file.ts, project-delegate-types.ts). */
  readonly folderSources: (project: ProjectRow) => Promise<FolderSources>;
}

/**
 * An area's name as a body carries it: one line with something on it, at
 * most {@link AREA_NAME_LIMIT} characters; kept trimmed.
 */
const AREA_NAME = t.String({
  maxLength: AREA_NAME_LIMIT,
  pattern:
    "^[^\\u0000-\\u001f\\u007f]*[^\\s\\u0000-\\u001f\\u007f][^\\u0000-\\u001f\\u007f]*$",
  error: schemaRefusal(areaWords.name(AREA_NAME_LIMIT)),
});

/** The row settings by the name a note gives each. */
const ROW_SETTINGS = [
  ["account", "account"],
  ["cawMode", "cawMode"],
  ["cap", "cap"],
  ["onCap", "onCap"],
] as const satisfies readonly [keyof SettingsInEffect, AreaSettingName][];

/** Where each setting a note names came from for one project. */
type Sources = Record<AreaSettingName, SettingSource>;

/** The fleet rows a delete took, in a sentence; none when it took none. */
const fleetRowsWords = (rows: AreaDeleted["fleetRows"]): string[] => {
  const kinds = (Object.keys(rows) as (keyof typeof rows)[]).filter(
    (kind) => rows[kind] > 0
  );
  return kinds.length > 0
    ? [
        areaWords.fleetRowsGone(
          kinds.map((kind) => areaWords.fleetRow[kind](rows[kind])).join(", ")
        ),
      ]
    : [];
};

export const createAreas = ({
  accountMoved,
  changed,
  db,
  folderSources,
}: AreasDeps) => {
  const known = (id: string) =>
    db.areas.get(id) ?? refusal(404, "no-area", areaWords.noArea(id));

  /** An area as the API answers it: its projects, and its time the ISO string it is sent as. */
  const viewOf = (area: Area) => ({
    ...area,
    createdAt: area.createdAt.toISOString(),
    projects: db.areas.projectsIn(area.id),
  });

  const view = (id: string) => {
    const area = known(id);
    return area instanceof ElysiaStatus ? area : viewOf(area);
  };

  /** Every area, each as {@link view} answers it. */
  const views = () => db.areas.list().map(viewOf);

  /** Where each setting of a project comes from now. */
  const sourcesOf = async (project: ProjectRow): Promise<Sources> => {
    const folder = await folderSources(project);
    const sources = {} as Sources;
    for (const [field, name] of ROW_SETTINGS) {
      sources[name] = project.inEffect[field].from;
    }
    sources.decides = folder.decides.includes("area") ? "area" : "fleet";
    sources.types = folder.types.includes("area") ? "area" : "fleet";
    return sources;
  };

  /** The budget a write asks, as its two columns. */
  const capColumns = (
    cap: AreaSettingsAsk["cap"]
  ): Pick<AreaSettingsChange, "capPeriod" | "capUsd"> =>
    cap === undefined
      ? {}
      : { capUsd: cap?.usd ?? null, capPeriod: cap?.period ?? null };

  /** An area's settings write, checked; what the row takes. A field left out stays as it is. */
  const settingsChange = (ask: AreaSettingsAsk) => {
    if (ask.account && !db.accounts.get(ask.account)) {
      return refusal(400, "no-account", areaWords.noAccount(ask.account));
    }
    const asked: AreaSettingsChange = {
      account: ask.account,
      accountAtLimit: ask.accountAtLimit,
      cawMode: ask.cawMode,
      onCap: ask.onCap,
      ...capColumns(ask.cap),
    };
    return Object.fromEntries(
      Object.entries(asked).filter(([, value]) => value !== undefined)
    ) as AreaSettingsChange;
  };

  /**
   * Writes an area's name and settings, then moves each of its projects'
   * running conversation onto the account it starts on now, where that
   * moved, as an account edit moves it: what became of each, in sentences.
   */
  const configure = async (id: string, ask: AreaSettingsAsk) => {
    const area = known(id);
    if (area instanceof ElysiaStatus) {
      return area;
    }
    const name = ask.name?.trim();
    const change = settingsChange(ask);
    if (change instanceof ElysiaStatus) {
      return change;
    }
    const before = new Map(
      db.areas
        .projectsIn(id)
        .map((projectId) => [
          projectId,
          db.project(projectId)?.inEffect.account.value,
        ])
    );
    if (name !== undefined) {
      db.areas.rename(id, name);
    }
    db.areas.setSettings(id, change);
    changed();
    const said: string[] = [];
    for (const [projectId, account] of before) {
      const now = db.project(projectId);
      const moved =
        now && now.inEffect.account.value !== account
          ? await accountMoved(now)
          : undefined;
      if (now && moved) {
        said.push(`${now.name}: ${moved}`);
      }
    }
    return said;
  };

  /**
   * Puts a project in an area, or in none (null): what it takes from the
   * area now and what falls back to the fleet's, in sentences, with what
   * became of its conversation when the account it starts on moved.
   */
  const place = async (projectId: string, areaId: string | null) => {
    const before = db.project(projectId);
    if (!before) {
      return refusal(404, "no-project", areaWords.noProject(projectId));
    }
    const area = areaId === null ? null : known(areaId);
    if (area instanceof ElysiaStatus) {
      return area;
    }
    if (before.areaId === areaId) {
      return { project: before, said: [areaWords.already(area?.name ?? null)] };
    }
    const was = await sourcesOf(before);
    db.areas.place(projectId, areaId);
    changed();
    const now = db.project(projectId) ?? before;
    const is = await sourcesOf(now);
    const said = (Object.keys(is) as AreaSettingName[]).flatMap((setting) =>
      is[setting] === "area" || was[setting] === "area"
        ? [
            areaWords.takes(
              setting,
              is[setting] === "area" ? (area?.name ?? null) : null
            ),
          ]
        : []
    );
    const moved =
      now.inEffect.account.value === before.inEffect.account.value
        ? undefined
        : await accountMoved(now);
    return {
      project: now,
      said: [...said, ...(moved ? [moved] : [])],
    };
  };

  /** How many of an area's projects take each setting from it: what falls back once it goes. */
  const fallingBack = async (id: string) => {
    const inIt = db.areas
      .projectsIn(id)
      .flatMap((projectId) => db.project(projectId) ?? []);
    const counts = new Map<AreaSettingName, number>();
    for (const project of inIt) {
      const sources = await sourcesOf(project);
      for (const [setting, from] of Object.entries(sources)) {
        if (from === "area") {
          const name = setting as AreaSettingName;
          counts.set(name, (counts.get(name) ?? 0) + 1);
        }
      }
    }
    return counts;
  };

  /** Deletes an area: its projects ungrouped, and what each falls back to, counted per setting. */
  const remove = async (id: string) => {
    const area = known(id);
    if (area instanceof ElysiaStatus) {
      return area;
    }
    const counts = await fallingBack(id);
    // A document it alone narrowed would read as every project's once its
    // link went: it goes to the trash (its Undo) before the area does.
    const docs = db
      .listFleetMemoryDocs()
      .filter(
        ({ scope }) =>
          !scope?.projectIds?.length &&
          scope?.areaIds?.length === 1 &&
          scope.areaIds[0] === id
      );
    for (const doc of docs) {
      db.trash.put({ kind: "memoryDoc", key: doc.path }, Date.now());
    }
    const deleted = db.areas.delete(id);
    if (!deleted) {
      return refusal(404, "no-area", areaWords.noArea(id));
    }
    const folderGone = await deleteProjectFolder(areaFolder(id));
    if (folderGone instanceof ElysiaStatus) {
      return folderGone;
    }
    changed();
    return {
      name: area.name,
      projects: deleted.projects,
      said: [
        deleted.projects.length > 0
          ? areaWords.deleted(area.name, deleted.projects.length)
          : areaWords.deletedAlone(area.name),
        ...[...counts].map(([setting, count]) =>
          areaWords.fallBack(count, setting)
        ),
        ...(deleted.rules > 0 ? [areaWords.rulesGone(deleted.rules)] : []),
        ...fleetRowsWords(deleted.fleetRows),
        ...(docs.length > 0 ? [areaWords.docsTrashed(docs.length)] : []),
      ],
    };
  };

  /** An area by its id, or by its name in any case: what `set_area` takes. */
  const named = (asked: string): Area | undefined => {
    const lower = asked.trim().toLowerCase();
    return (
      db.areas.get(asked.trim()) ??
      db.areas.list().find((one) => one.name.trim().toLowerCase() === lower)
    );
  };

  const MODE = t.UnionEnum(PERMISSION_MODES);
  const ON_CAP = t.Union([
    t.Literal("pause"),
    t.Literal("quiet"),
    t.Literal("both"),
  ]);

  const routes = () =>
    new Elysia()
      .get("/api/areas", () => ({ areas: views() }))
      .post(
        "/api/areas",
        { body: t.Object({ name: AREA_NAME }) },
        ({ body }) => {
          const made = db.areas.create(crypto.randomUUID(), body.name.trim());
          changed();
          return view(made.id);
        }
      )
      .put(
        "/api/areas/order",
        { body: t.Object({ ids: t.Array(t.String()) }) },
        ({ body }) => {
          const all = db.areas.list().map((area) => area.id);
          const asked = new Set(body.ids);
          if (
            asked.size !== body.ids.length ||
            asked.size !== all.length ||
            !all.every((id) => asked.has(id))
          ) {
            return refusal(400, "area-order", areaWords.order);
          }
          db.areas.order(body.ids);
          changed();
          return { areas: views() };
        }
      )
      .get("/api/areas/:id", ({ params }) => view(params.id))
      // Its name and its settings: a field left out stays, null clears one.
      .patch(
        "/api/areas/:id",
        {
          body: t.Object({
            name: t.Optional(AREA_NAME),
            account: t.Optional(t.Nullable(t.String({ maxLength: 320 }))),
            accountAtLimit: t.Optional(
              t.Union([t.Literal("wait"), t.Literal("move")])
            ),
            cawMode: t.Optional(t.Nullable(MODE)),
            cap: t.Optional(
              t.Nullable(
                t.Object({
                  usd: t.Number({
                    exclusiveMinimum: 0,
                    error: schemaRefusal(areaWords.capAmount),
                  }),
                  period: t.Union([t.Literal("day"), t.Literal("month")]),
                })
              )
            ),
            onCap: t.Optional(t.Nullable(ON_CAP)),
          }),
        },
        async ({ params, body }) => {
          const said = await configure(params.id, body);
          if (said instanceof ElysiaStatus) {
            return said;
          }
          const area = view(params.id);
          return area instanceof ElysiaStatus ? area : { ...area, said };
        }
      )
      .delete("/api/areas/:id", ({ params }) => remove(params.id))
      // A project put in an area, or in none (null).
      .put(
        "/api/projects/:id/area",
        { body: t.Object({ areaId: t.Nullable(t.String()) }) },
        async ({ params, body }) => {
          const placed = await place(params.id, body.areaId);
          if (placed instanceof ElysiaStatus) {
            return placed;
          }
          const { project, said } = placed;
          return { areaId: project.areaId, inEffect: project.inEffect, said };
        }
      )
      // The area's folder: its decides.md and delegates/, kept as
      // a project's folder is, every write a commit through the same guards.
      .get(
        "/api/areas/:id/folder",
        { query: t.Object({ path: t.Optional(t.String()) }) },
        ({ params, query }) => {
          const area = known(params.id);
          return area instanceof ElysiaStatus
            ? area
            : listFolder(areaFolder(params.id), query.path ?? "", true);
        }
      )
      .get(
        "/api/areas/:id/folder/file",
        { query: t.Object({ path: t.String() }) },
        ({ params, query }) => {
          const area = known(params.id);
          return area instanceof ElysiaStatus
            ? area
            : readFolderFile(areaFolder(params.id), query.path);
        }
      )
      .put(
        "/api/areas/:id/folder/file",
        { body: FOLDER_WRITE },
        async ({ params, body }) => {
          const area = known(params.id);
          return area instanceof ElysiaStatus
            ? area
            : await writeAsked(areaFolder(params.id), body, changed);
        }
      )
      .delete(
        "/api/areas/:id/folder/file",
        {
          query: t.Object({
            path: t.String(),
            message: t.Optional(t.String({ maxLength: MESSAGE_LIMIT })),
          }),
        },
        async ({ params, query }) => {
          const area = known(params.id);
          return area instanceof ElysiaStatus
            ? area
            : await deleteAsked(areaFolder(params.id), query, changed);
        }
      );

  return { named, place, remove, routes, view };
};

export type Areas = ReturnType<typeof createAreas>;
