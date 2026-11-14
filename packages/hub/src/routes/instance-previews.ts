import { Elysia } from "elysia";
import { hidden } from "../hidden";
import type { HubContext } from "../hub-context";
import { openItemsCalls, outcomeCalls } from "../session-calls";

export const instancePreviewRoutes = (
  ctx: Pick<
    HubContext,
    "closePreview" | "db" | "openItems" | "outcomeOf" | "settledContinuation"
  >
) => {
  const { closePreview } = ctx;
  const { continuationOutcome } = outcomeCalls(ctx);
  const { openItems } = openItemsCalls(ctx);
  return (
    new Elysia()
      // A started continuation's report, once it has one: what the
      // `continue_session` tool waits on. The job runs whether or not anyone
      // waits here.
      .get(
        "/api/continuations/:id/outcome",
        hidden,
        ({ params, request, server }) => {
          // A summariser can take minutes; the wait must outlast Bun's idle cut.
          server?.timeout(request, 0);
          return continuationOutcome(params.id);
        }
      )
      // A session's Open items section, built now from its records
      // (open-items.ts): what the `open_items` tool answers, which every
      // harness's listing after a compaction reads.
      .get("/api/instances/:id/open-items", hidden, ({ params, query }) =>
        openItems(params.id, query)
      )
      // The iOS app's Close (CawCoCore Previews.swift `closePreview`): the
      // show goes for every view. The dashboard's Close is its tab's own
      // (dashboard preview/closed-here.ts) and sends nothing.
      .delete("/api/instances/:id/preview", ({ params }) =>
        closePreview(params.id)
      )
  );
};
