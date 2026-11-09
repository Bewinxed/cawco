import { Elysia, t, ValidationError } from "elysia";
import type {
  ContinuationAsker,
  PreparedContinuation,
} from "../db/stored-types";
import type { HubContext } from "../hub-context";
import { MachineAway } from "../hub-shapes";
import { continueBody } from "../routes/session-bodies";
import { firstValidationIssue } from "../validation-issue";

/** A thrown value in its own words. */
const thrownWords = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const continuationRoutes = ({
  awayStatus,
  cancelContinuation,
  cloneForContinuation,
  continuationJob,
  continuationRefusal,
  continuationTable,
  inFlightFor,
  prepareContinuation,
  startContinuation,
}: Pick<
  HubContext,
  | "awayStatus"
  | "cancelContinuation"
  | "cloneForContinuation"
  | "continuationJob"
  | "continuationRefusal"
  | "continuationTable"
  | "inFlightFor"
  | "prepareContinuation"
  | "startContinuation"
>) =>
  new Elysia()
    // What a continuation of this session would carry, sized — for the
    // dialog's pickers, which enable only models that fit.
    .get(
      "/api/instances/:id/continue",
      {
        query: t.Object({
          note: t.Optional(t.String()),
          // Sized as a restart from the person's asks: nothing to summarise.
          asks: t.Optional(t.Boolean()),
        }),
      },
      async ({ params, query, set, status }) => {
        try {
          const prepared = await prepareContinuation(
            params.id,
            query.note,
            query.asks === true
          );
          return {
            asks: prepared.extracted.asks.length,
            liveContextTokens: prepared.liveContextTokens,
            summariseInputTokens: prepared.summariseInputTokens,
            openingTokens: prepared.openingTokens,
            compacted: prepared.compacted,
            entries: prepared.entries,
          };
        } catch (error) {
          if (error instanceof MachineAway) {
            const away = awayStatus(set, error.machineId, error.message);
            return status(away.code, away.said);
          }
          return status(422, thrownWords(error));
        }
      }
    )
    // Continue in new session. The fit of both models is checked before
    // anything starts (a plain 409); then the hub starts the job and
    // answers with its ids at once. The job's stages reach every dashboard
    // on the `instances` frames (`continuations`); nothing about the
    // request that started it can stop it — only its Cancel.
    .post(
      "/api/instances/:id/continue",
      {
        body: continueBody,
        // A 400 that names the missing or malformed field, in words.
        error({ error, status }) {
          if (error instanceof ValidationError) {
            const first = firstValidationIssue(error);
            // The issue's own path stops at the object missing the field;
            // the error's `property` names that object from the root.
            const { property } = error.payload as { property?: string };
            const parent = property?.startsWith("/")
              ? property.slice(1).replaceAll("/", ".")
              : "";
            const at = parent ? `${parent}.` : "";
            const missing = first.params?.requiredProperties?.join(", ");
            return status(
              400,
              missing
                ? `${at}${missing} is required`
                : `${first.path}: ${first.message}`
            );
          }
        },
      },
      async ({ params, body, set, status }) => {
        const { askedBy, ...request } = body;
        const asker: ContinuationAsker = askedBy
          ? { kind: "session", id: askedBy }
          : { kind: "person" };
        let prepared: PreparedContinuation;
        let refusal: string | undefined;
        let release: () => void = () => undefined;
        try {
          release = await cloneForContinuation(params.id);
          prepared = await prepareContinuation(
            params.id,
            body.note,
            body.asksOnly
          );
          refusal = await continuationRefusal(prepared, request, asker);
        } catch (error) {
          release();
          if (error instanceof MachineAway) {
            const away = awayStatus(set, error.machineId, error.message);
            return status(away.code, away.said);
          }
          return status(422, thrownWords(error));
        }
        if (refusal) {
          release();
          return status(409, refusal);
        }
        // What the source's process holds that ending it would lose: the
        // job waits for it, and the caller hears so at once.
        const inFlight = await inFlightFor(params.id);
        if ("refusal" in inFlight) {
          release();
          return status(422, inFlight.refusal);
        }
        const row = startContinuation(prepared, request, asker, inFlight.work);
        // Its record holds the source's workspace from here (workspaces.ts `holdsOf`).
        release();
        const job = continuationJob(row);
        return {
          continuationId: row.id,
          targetInstanceId: row.targetInstanceId,
          summariserInstanceId: row.summariserInstanceId,
          ...(job.waiting ? { waiting: job.waiting } : {}),
        };
      }
    )
    // The continuations the hub is carrying: what a dashboard that connects
    // late reads before the next publish reaches it.
    .get("/api/continuations", () => continuationTable())
    // Cancel, in any stage before the new session has its opening: nothing
    // starts from it after that (`cancelContinuation`).
    .delete("/api/continuations/:id", ({ params, status }) => {
      const cancelled = cancelContinuation(params.id);
      return "row" in cancelled
        ? continuationJob(cancelled.row)
        : status(cancelled.refused, cancelled.why);
    });
