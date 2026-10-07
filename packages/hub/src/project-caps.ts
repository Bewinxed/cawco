/**
 * A project's spend cap (Projects spec §5.3). A project may cap what it
 * spends in a day or a month, in dollars: every session of it, its Caw and
 * its attempts, from the usage its machines report, counted from the
 * period's start in the hub's own zone. What reaching the cap does is the
 * project's own choice, else the fleet's default (`spend_settings`):
 *
 * - `pause`: no new attempt at its tasks starts (work-items.ts refuses one,
 *   dispatch.ts treats the project as paused);
 * - `quiet`: what would wake its Caw is booked in its thread without a turn
 *   (caw.ts `wake`);
 * - `both`.
 *
 * Nothing runs on a timer: the cap is read at each decision, and holds
 * only while its period runs (`capHolds`), so the next period starts clear.
 * Every dashboard hears a project's cap move (`project.cap`) as its spend is
 * reported and as the cap or the defaults change.
 */
import {
  type CapPeriod,
  capHolds,
  type OnCap,
  type ProjectCap,
  type ProjectCapFrame,
} from "@cawco/core";
import { Elysia, status, t } from "elysia";
import type { DbShape, ProjectRow } from "./db";

/** The period `at` falls in, in the hub's zone: when it began and when the next one begins. */
export const periodOf = (
  period: CapPeriod,
  at: Date
): { start: number; end: number } => {
  const start = new Date(at);
  start.setHours(0, 0, 0, 0);
  if (period === "month") {
    start.setDate(1);
  }
  const end = new Date(start);
  if (period === "month") {
    end.setMonth(end.getMonth() + 1);
  } else {
    end.setDate(end.getDate() + 1);
  }
  return { start: start.getTime(), end: end.getTime() };
};

const WHEN = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const ON_CAP: readonly OnCap[] = ["pause", "quiet", "both"];

export interface CapsDeps {
  db: Pick<
    DbShape,
    | "listProjects"
    | "project"
    | "projectSpentSince"
    | "setProjectCap"
    | "setSpendOnCap"
    | "spendOnCap"
  >;
  publish: (payload: ProjectCapFrame) => void;
}

export const createCaps = ({ db, publish }: CapsDeps) => {
  /** A project's cap as it stands at `now`; null when it has none. */
  const capOf = (project: ProjectRow, now = Date.now()): ProjectCap | null => {
    if (project.capUsd === null || project.capPeriod === null) {
      return null;
    }
    const { start, end } = periodOf(project.capPeriod, new Date(now));
    const spentUsd = db.projectSpentSince(project.id, start);
    return {
      usd: project.capUsd,
      period: project.capPeriod,
      spentUsd,
      startsAt: start,
      resetsAt: end,
      reached: spentUsd >= project.capUsd,
      onCap: project.onCap ?? db.spendOnCap(),
      inherited: project.onCap === null,
    };
  };

  /** The cap holding the project back now, or null while nothing is. */
  const holding = (projectId: string): ProjectCap | null => {
    const project = db.project(projectId);
    const cap = project ? capOf(project) : null;
    return capHolds(cap, Date.now()) ? cap : null;
  };

  /** What each project's dashboards were last told, so a move is said once. */
  const told = new Map<string, string>();
  const tell = (project: ProjectRow): void => {
    const cap = capOf(project);
    // Spend is said to the cent: a fraction of one moves nothing on screen.
    const key = JSON.stringify(
      cap && { ...cap, spentUsd: Math.round(cap.spentUsd * 100) }
    );
    if (told.get(project.id) === key) {
      return;
    }
    told.set(project.id, key);
    publish({ kind: "project.cap", projectId: project.id, cap });
  };

  return {
    capOf,

    /**
     * Why an attempt at one of the project's tasks may not start now, in a
     * sentence the asker (Caw, a hook, the person) reads; nothing when it may.
     */
    pauses(projectId: string): string | undefined {
      const cap = holding(projectId);
      if (!cap || cap.onCap === "quiet") {
        return;
      }
      const name = db.project(projectId)?.name ?? "The project";
      return `${name} reached its budget: $${cap.spentUsd.toFixed(2)} of its $${cap.usd.toFixed(2)} this ${cap.period}. No attempt starts until the next ${cap.period} begins (${WHEN.format(cap.resetsAt)}), or the budget is raised.`;
    },

    /** Its Caw is not woken now: the cap holds and says so. */
    quiets(projectId: string): boolean {
      const cap = holding(projectId);
      return cap !== null && cap.onCap !== "pause";
    },

    /** Every capped project's state, told to the dashboards where it moved. */
    recheck(): void {
      for (const project of db.listProjects()) {
        if (project.capUsd !== null || told.has(project.id)) {
          tell(project);
        }
      }
    },

    routes: () =>
      new Elysia()
        .get("/api/spend-settings", () => ({ onCap: db.spendOnCap() }))
        .put(
          "/api/spend-settings",
          {
            body: t.Object({
              onCap: t.Union(ON_CAP.map((each) => t.Literal(each))),
            }),
          },
          ({ body }) => {
            db.setSpendOnCap(body.onCap);
            for (const project of db.listProjects()) {
              if (project.capUsd !== null) {
                tell(project);
              }
            }
            return { onCap: db.spendOnCap() };
          }
        )
        .put(
          "/api/projects/:id/cap",
          {
            body: t.Object({
              usd: t.Nullable(t.Number()),
              period: t.Nullable(
                t.Union([t.Literal("day"), t.Literal("month")])
              ),
              onCap: t.Nullable(t.Union(ON_CAP.map((each) => t.Literal(each)))),
            }),
          },
          ({ params, body }) => {
            const project = db.project(params.id);
            if (!project) {
              return status(404, `No project ${params.id}.`);
            }
            if (
              body.usd !== null &&
              !(Number.isFinite(body.usd) && body.usd > 0)
            ) {
              return status(400, "The budget is a number of dollars above 0.");
            }
            if ((body.usd === null) !== (body.period === null)) {
              return status(
                400,
                "A budget has both an amount and a period (day or month), or neither."
              );
            }
            db.setProjectCap(project.id, {
              capUsd: body.usd,
              capPeriod: body.period,
              onCap: body.onCap,
            });
            const changed = db.project(project.id) ?? project;
            tell(changed);
            return { cap: capOf(changed) };
          }
        ),
  };
};

export type Caps = ReturnType<typeof createCaps>;
