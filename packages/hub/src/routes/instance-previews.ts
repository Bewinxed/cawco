import { Elysia } from "elysia";
import { CONTINUATION_CANCELLED } from "../continuations";
import { hidden } from "../hidden";
import type { HubContext } from "../hub-context";
import { refusal } from "../refusal";

export const instancePreviewRoutes = ({
  closePreview,
  db,
  openItems,
  outcomeOf,
  settledContinuation,
}: Pick<
  HubContext,
  "closePreview" | "db" | "openItems" | "outcomeOf" | "settledContinuation"
>) =>
  new Elysia()
    // A started continuation's report, once it has one: what the
    // `continue_session` tool waits on. The job runs whether or not anyone
    // waits here.
    .get(
      "/api/continuations/:id/outcome",
      hidden,
      async ({ params, request, server }) => {
        // A summariser can take minutes; the wait must outlast Bun's idle cut.
        server?.timeout(request, 0);
        const row = await settledContinuation(params.id);
        if (!row) {
          return refusal(
            404,
            "continuation-not-running",
            "That continuation is not running."
          );
        }
        if (row.stage === "started") {
          return outcomeOf(row);
        }
        return refusal(
          422,
          "continuation-cancelled",
          row.stage === "cancelled"
            ? CONTINUATION_CANCELLED
            : (row.error ?? "the continuation failed")
        );
      }
    )
    // A session's Open items section, built now from its records
    // (open-items.ts): what the `open_items` tool answers, which every
    // harness's listing after a compaction reads.
    .get("/api/instances/:id/open-items", hidden, async ({ params, query }) => {
      try {
        const cursor = Number(query.cursor ?? 0);
        return {
          text: await openItems.read(db.instanceIdOf(params.id), {
            cursor: Number.isInteger(cursor) && cursor > 0 ? cursor : 0,
            detailed: query.format === "detailed",
          }),
        };
      } catch (error) {
        return refusal(
          404,
          "preview-not-found",
          error instanceof Error ? error.message : String(error)
        );
      }
    })
    .delete("/api/instances/:id/preview", ({ params }) =>
      closePreview(params.id)
    );
