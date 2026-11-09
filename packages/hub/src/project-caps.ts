/**
 * A project's spend cap (Projects spec §5.3). A project may cap what it
 * spends in a day or a month, in dollars: every session of it, its Caw and
 * its attempts, from the usage its machines report, counted from the
 * period's start in the hub's own zone. A project in an area (core
 * areas.ts) with no cap of its own takes its area's, for itself alone. What
 * reaching the cap does is the project's own choice, else its area's, else
 * the fleet's default (`spend_settings`):
 *
 * - `pause`: no new attempt at its tasks starts (work-items.ts refuses one,
 *   dispatch.ts treats the project as paused);
 * - `quiet`: nothing reaches its conversation (caw.ts `tell`);
 * - `both`.
 *
 * Nothing runs on a timer: the cap is read at each decision, and holds
 * only while its period runs (`capHolds`), so the next period starts clear.
 * Every dashboard hears a project's cap move (`project.cap`) as its spend is
 * reported and as the cap or the defaults change.
 */
import type { CapPeriod, OnCap, ProjectCap } from "@cawco/core/areas";
import type { ProjectCapFrame } from "@cawco/core/frames";
import { capHolds } from "@cawco/core/project-conversation";
import { Elysia, t } from "elysia";
import type { DbShape } from "./db";
import type { ProjectRow } from "./db/projects";
import { refusal } from "./refusal";

/** The period `at` falls in, in the hub's zone: when it began and when the next one begins. */
const periodOf = (
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

const ON_CAP = ["pause", "quiet", "both"] as const satisfies readonly OnCap[];

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
  /** A project's cap in effect (its own, else its area's) as it stands at `now`; null when it has none. */
  const capOf = (project: ProjectRow, now = Date.now()): ProjectCap | null => {
    const { cap, onCap } = project.inEffect;
    if (cap.value === null || cap.from === "fleet") {
      return null;
    }
    const { start, end } = periodOf(cap.value.period, new Date(now));
    const spentUsd = db.projectSpentSince(project.id, start);
    return {
      usd: cap.value.usd,
      period: cap.value.period,
      from: cap.from,
      spentUsd,
      startsAt: start,
      resetsAt: end,
      reached: spentUsd >= cap.value.usd,
      onCap: onCap.value,
      onCapFrom: onCap.from,
      inherited: onCap.from !== "project",
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

    /**
     * Why its Caw takes no turn now, in the sentence the person reads when
     * they write to him: the cap holds and says so. Nothing when he may.
     */
    quiets(projectId: string): string | undefined {
      const cap = holding(projectId);
      if (!cap || cap.onCap === "pause") {
        return;
      }
      const name = db.project(projectId)?.name ?? "The project";
      return `${name} reached its budget: $${cap.spentUsd.toFixed(2)} of its $${cap.usd.toFixed(2)} this ${cap.period}. Caw takes no turn until the next ${cap.period} begins (${WHEN.format(cap.resetsAt)}), or the budget is raised.`;
    },

    /** Every capped project's state, told to the dashboards where it moved. */
    recheck(): void {
      for (const project of db.listProjects()) {
        if (project.inEffect.cap.value !== null || told.has(project.id)) {
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
              onCap: t.UnionEnum(ON_CAP),
            }),
          },
          ({ body }) => {
            db.setSpendOnCap(body.onCap);
            for (const project of db.listProjects()) {
              if (project.inEffect.cap.value !== null) {
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
              onCap: t.Nullable(t.UnionEnum(ON_CAP)),
            }),
          },
          ({ params, body }) => {
            const project = db.project(params.id);
            if (!project) {
              return refusal(404, "no-project", `No project ${params.id}.`);
            }
            if (
              body.usd !== null &&
              !(Number.isFinite(body.usd) && body.usd > 0)
            ) {
              return refusal(
                400,
                "budget-number-dollars-above",
                "The budget is a number of dollars above 0."
              );
            }
            if ((body.usd === null) !== (body.period === null)) {
              return refusal(
                400,
                "budget-has-both-amount",
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
