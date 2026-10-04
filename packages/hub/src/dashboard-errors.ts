import { Elysia, ElysiaStatus, ParseError, status, t } from "elysia";

const BODY_LIMIT = 64 * 1024;

/** Bounded telemetry ingestion; the journal is the only record. */
export const dashboardErrorsRoutes = () =>
  new Elysia().post(
    "/api/dashboard-errors",
    {
      error: ({ error }) => {
        // Elysia wraps custom-parser exceptions; retain our explicit refusal statuses.
        if (
          error instanceof ParseError &&
          error.cause instanceof ElysiaStatus
        ) {
          if (error.cause.status === 413) {
            return status(413, "Dashboard error report is too large");
          }
          if (error.cause.status === 415) {
            return status(415, "Dashboard errors require application/json");
          }
        }
      },
      body: t.Object({
        message: t.String({ maxLength: 1000 }),
        stack: t.String({ maxLength: 6000 }),
        path: t.String({ minLength: 1, maxLength: 1000, pattern: "^/" }),
        sessionId: t.Union([t.String({ maxLength: 256 }), t.Null()]),
        version: t.String({ minLength: 1, maxLength: 128 }),
        userAgent: t.String({ maxLength: 512 }),
      }),
      parse: [
        async ({ request }) => {
          if (
            request.headers.get("content-type")?.split(";")[0].trim() !==
            "application/json"
          ) {
            throw status(415, "Dashboard errors require application/json");
          }
          if (Number(request.headers.get("content-length")) > BODY_LIMIT) {
            throw status(413, "Dashboard error report is too large");
          }
          const reader = request.body?.getReader();
          if (!reader) {
            return null;
          }
          let size = 0;
          let text = "";
          const decoder = new TextDecoder();
          try {
            for (;;) {
              // biome-ignore lint/performance/noAwaitInLoops: read sequentially so the size cap stops ingestion before buffering the rest.
              const { done, value } = await reader.read();
              if (done) {
                break;
              }
              size += value.byteLength;
              if (size > BODY_LIMIT) {
                await reader.cancel();
                throw status(413, "Dashboard error report is too large");
              }
              text += decoder.decode(value, { stream: true });
            }
          } finally {
            reader.releaseLock();
          }
          return JSON.parse(text + decoder.decode());
        },
        "json",
      ],
    },
    ({ body }) => {
      // JSON escaping keeps even multiline stacks and messages on one journal line.
      console.warn(`dashboard error: ${JSON.stringify(body)}`);
      return status(204);
    }
  );
