/**
 * Each kind of trigger's harness, model, permission mode and account (the
 * owner's card "Where triggers go", settings: "Its own setting per kind of
 * trigger"; his pin of 2026-10-30, "global caw settings → per project
 * override → per routine/event override", tsk-313). The kinds are core's
 * `TRIGGER_KINDS`: comments, routine results, task moves, inbound events.
 *
 * - **The fleet's default** for a kind (`fleet_trigger_settings`), then
 *   **the project's own** over it (`project_trigger_settings`), each field
 *   on its own; a harness, model or account neither sets is the project's
 *   Caw setting (its harness and model, the account its sessions start
 *   on), and a mode neither sets is Auto on Claude Code, else Bypass (core
 *   `triggerModeDefault`), never Caw's chat mode. A model follows its
 *   harness (core `triggerSettingInEffect`).
 * - **A routine's or an event route's own mode** wins over all of it, per
 *   event, as the router reads it ({@link TriggerSettings.forEvent}).
 * - Read and written through `/api/fleet/trigger-settings` and
 *   `/api/projects/:id/trigger-settings`; a write names the fields it
 *   changes, null clearing one.
 */
import type { Account } from "@cawco/core/accounts";
import { HARNESSES } from "@cawco/core/harness/kinds";
import type { OfferedMode } from "@cawco/core/harness/modes";
import {
  byTriggerKind,
  type FleetTriggerSettings,
  type ProjectTriggerSettings,
  TRIGGER_KINDS,
  type TriggerKind,
  type TriggerSetting,
  type TriggerSettingInEffect,
  triggerModeDefault,
  triggerSettingInEffect,
} from "@cawco/core/triggers";
import { Elysia, ElysiaStatus, problem, t } from "elysia";
import type { DbShape } from "./db";
import type { ProjectRow } from "./db/projects";
import { oneAccountAsked } from "./project-edit";
import { MODE } from "./tasks";

/** A write to one kind's setting: the fields it names change, null clearing one. */
export type TriggerSettingChange = Partial<TriggerSetting>;

export interface TriggerSettingsDeps {
  /** The fleet's accounts, every provider's. */
  readonly accounts: () => Account[];
  readonly db: Pick<DbShape, "ingress" | "project" | "routines" | "triggers">;
}

/** Where the event that asks for a session came from, for the mode its own route or routine names. */
export interface EventModeSource {
  /** The event route that delivered it. */
  route?: string;
  /** The routine whose run or report it is. */
  routine?: string;
}

/** What a fresh session for a trigger starts on (core `TriggerSettingInEffect`'s values, the event's own mode over its mode). */
export interface TriggerStart {
  account: string | null;
  harness: TriggerSettingInEffect["harness"]["value"];
  mode: OfferedMode;
  model: string | null;
}

const settingBody = t.Object({
  harness: t.Optional(t.Nullable(t.UnionEnum(HARNESSES))),
  model: t.Optional(t.Nullable(t.String())),
  mode: t.Optional(t.Nullable(MODE)),
  account: t.Optional(t.Nullable(t.String())),
});

const KIND = t.UnionEnum(TRIGGER_KINDS);

export const createTriggerSettings = ({
  accounts,
  db,
}: TriggerSettingsDeps) => {
  /** The project's Caw settings, what a kind's harness, model and account fall back to. */
  const cawOf = (project: ProjectRow) => ({
    harness: project.cawHarness,
    model: project.cawModel ?? null,
    account: project.inEffect.account.value,
  });

  /** One kind's settings in effect for `project`. */
  const inEffect = (
    project: ProjectRow,
    kind: TriggerKind
  ): TriggerSettingInEffect =>
    triggerSettingInEffect(
      db.triggers.projectSettings(project.id)[kind],
      db.triggers.fleetSettings()[kind],
      cawOf(project)
    );

  /** The project's view: each kind's own setting, the fleet's under it, what is in effect, and the Caw settings under both. */
  const projectView = (project: ProjectRow): ProjectTriggerSettings => {
    const own = db.triggers.projectSettings(project.id);
    const fleet = db.triggers.fleetSettings();
    const caw = cawOf(project);
    return {
      caw,
      kinds: byTriggerKind((kind) => ({
        own: own[kind],
        fleet: fleet[kind],
        inEffect: triggerSettingInEffect(own[kind], fleet[kind], caw),
      })),
    };
  };

  /** `change` over `had`, its account named by id, nickname or email resolved to its id; refused when it names none or several. */
  const applied = (had: TriggerSetting, change: TriggerSettingChange) => {
    let { account } = had;
    if (change.account !== undefined) {
      const raw = change.account?.trim() ?? "";
      if (raw) {
        const one = oneAccountAsked(accounts(), raw);
        if (one instanceof ElysiaStatus) {
          return one;
        }
        account = one.id;
      } else {
        account = null;
      }
    }
    const model =
      change.model === undefined ? had.model : change.model?.trim() || null;
    return {
      account,
      harness: change.harness === undefined ? had.harness : change.harness,
      mode: change.mode === undefined ? had.mode : change.mode,
      model,
    } satisfies TriggerSetting;
  };

  const projectOf = (projectId: string) =>
    db.project(projectId) ??
    problem(404, {
      code: "project-unknown",
      detail: `The hub keeps no project ${projectId}.`,
    });

  return {
    inEffect,

    /**
     * What a fresh session for an event of `kind` (a kind with settings, or
     * none: the project's Caw settings, its Caw mode else a trigger's
     * default mode) starts on in `project`: its kind's settings in effect,
     * the event's own route's or routine's mode over its mode. A mode its
     * harness lacks is settled where the session starts (hub launches.ts
     * `modeOf`).
     */
    forEvent(
      project: ProjectRow,
      kind: TriggerKind | undefined,
      source: EventModeSource
    ): TriggerStart {
      const own =
        (source.route ? db.ingress.route(source.route)?.mode : undefined) ??
        (source.routine ? db.routines.get(source.routine)?.mode : undefined);
      if (kind === undefined) {
        const caw = cawOf(project);
        return {
          ...caw,
          mode:
            own ??
            project.inEffect.cawMode.value ??
            triggerModeDefault(caw.harness),
        };
      }
      const set = inEffect(project, kind);
      return {
        account: set.account.value,
        harness: set.harness.value,
        mode: own ?? set.mode.value,
        model: set.model.value,
      };
    },

    fleet: (): FleetTriggerSettings => ({ kinds: db.triggers.fleetSettings() }),

    setFleet(kind: TriggerKind, change: TriggerSettingChange) {
      const next = applied(db.triggers.fleetSettings()[kind], change);
      if (next instanceof ElysiaStatus) {
        return next;
      }
      db.triggers.setFleet(kind, next);
      return { kinds: db.triggers.fleetSettings() };
    },

    project(projectId: string) {
      const project = projectOf(projectId);
      return project instanceof ElysiaStatus ? project : projectView(project);
    },

    setProject(
      projectId: string,
      kind: TriggerKind,
      change: TriggerSettingChange
    ) {
      const project = projectOf(projectId);
      if (project instanceof ElysiaStatus) {
        return project;
      }
      const next = applied(
        db.triggers.projectSettings(projectId)[kind],
        change
      );
      if (next instanceof ElysiaStatus) {
        return next;
      }
      db.triggers.setProject(projectId, kind, next);
      return projectView(project);
    },
  };
};

export type TriggerSettings = ReturnType<typeof createTriggerSettings>;

/** The routes the fleet's settings and a project's Caw settings read and write each kind's setting through. */
export const triggerSettingsRoutes = (settings: TriggerSettings) =>
  new Elysia()
    .get("/api/fleet/trigger-settings", () => settings.fleet())
    .patch(
      "/api/fleet/trigger-settings/:kind",
      { params: t.Object({ kind: KIND }), body: settingBody },
      ({ params, body }) => settings.setFleet(params.kind, body)
    )
    .get("/api/projects/:id/trigger-settings", ({ params }) =>
      settings.project(params.id)
    )
    .patch(
      "/api/projects/:id/trigger-settings/:kind",
      {
        params: t.Object({ id: t.String(), kind: KIND }),
        body: settingBody,
      },
      ({ params, body }) => settings.setProject(params.id, params.kind, body)
    );
