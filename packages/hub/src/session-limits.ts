/**
 * The fleet's session limits (core `SessionLimits`): the memory and CPU each
 * session's process may use, as a percent of the machine it runs on. Off
 * until the operator sets them; the task limit every session runs under is
 * the keeper's own (sessiond cgroup.ts `CHILD_TASKS`) and is not set here.
 *
 * They reach each machine on its register ack and on every heartbeat ack,
 * and its agent hands them to the keeper with each spawn, so a change applies
 * to every process started after it (within one heartbeat, 15 s).
 */
import { Elysia, t } from "elysia";
import type { DbShape } from "./db";

/** A percent of the machine, or null for no limit. */
const PERCENT = t.Nullable(t.Integer({ minimum: 1, maximum: 100 }));

export const sessionLimitRoutes = (db: DbShape) =>
  new Elysia()
    .get("/api/session-limits", () => ({
      memoryPercent: db.sessionLimits().memoryPercent ?? null,
      cpuPercent: db.sessionLimits().cpuPercent ?? null,
    }))
    .put(
      "/api/session-limits",
      { body: t.Object({ memoryPercent: PERCENT, cpuPercent: PERCENT }) },
      ({ body }) => {
        db.setSessionLimits({
          ...(body.memoryPercent === null
            ? {}
            : { memoryPercent: body.memoryPercent }),
          ...(body.cpuPercent === null ? {} : { cpuPercent: body.cpuPercent }),
        });
        const limits = db.sessionLimits();
        console.info(
          `[hub] session limits: memory ${limits.memoryPercent === undefined ? "unlimited" : `${limits.memoryPercent}%`}, CPU ${limits.cpuPercent === undefined ? "unlimited" : `${limits.cpuPercent}%`}`
        );
        return {
          memoryPercent: limits.memoryPercent ?? null,
          cpuPercent: limits.cpuPercent ?? null,
        };
      }
    );
