import { Elysia, problem, t, ValidationError } from "elysia";
import type { HubContext } from "../hub-context";
import { MachineProblem } from "../machine-answers";
import type { MachineReadsContext } from "../machine-reads";
import { continuationCalls } from "../session-calls";
import { firstValidationIssue } from "../validation-issue";
import { continueBody } from "./session-bodies";

/** A thrown value in its own words. */
const thrownWords = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const continuationRoutes = (
  ctx: Pick<
    HubContext,
    | "cancelContinuation"
    | "cloneForContinuation"
    | "continuationJob"
    | "continuationRefusal"
    | "continuationTable"
    | "inFlightFor"
    | "prepareContinuation"
    | "startContinuation"
    | keyof MachineReadsContext
  >
) => {
  const {
    cancelContinuation,
    continuationJob,
    continuationTable,
    prepareContinuation,
  } = ctx;
  const { continueFrom } = continuationCalls(ctx);
  return (
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
        async ({ params, query }) => {
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
            if (error instanceof MachineProblem) {
              return error.value();
            }
            return problem(422, {
              code: "thrown-words",
              detail: thrownWords(error),
            });
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
          error({ error }) {
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
              return problem(400, {
                code: "continuation-invalid",
                detail: missing
                  ? `${at}${missing} is required`
                  : `${first.path}: ${first.message}`,
              });
            }
          },
        },
        ({ params, body }) => continueFrom(params.id, body)
      )
      // The continuations the hub is carrying: what a dashboard that connects
      // late reads before the next publish reaches it.
      .get("/api/continuations", () => continuationTable())
      // Cancel, in any stage before the new session has its opening: nothing
      // starts from it after that (`cancelContinuation`).
      .delete("/api/continuations/:id", ({ params }) => {
        const cancelled = cancelContinuation(params.id);
        return "row" in cancelled
          ? continuationJob(cancelled.row)
          : problem(cancelled.refused, {
              code: "continuation-not-cancelled",
              detail: cancelled.why,
            });
      })
  );
};
