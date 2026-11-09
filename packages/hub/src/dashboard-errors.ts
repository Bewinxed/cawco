import {
  PAGE_FAULT_TEXT_MAX,
  type PageFaultReport,
} from "@cawco/core/page-faults";
import { Elysia, ElysiaStatus, ParseError, status, t } from "elysia";
import { refusal } from "./refusal";

const BODY_LIMIT = 64 * 1024;

/** Where the dashboard sends its errors, on its own origin (dashboard lib/cawco/error-report.ts). */
const DASHBOARD_ERRORS_PATH = "/api/dashboard-errors";

const faultText = t.String({ maxLength: PAGE_FAULT_TEXT_MAX });
const faultPlace = t.Union([t.Integer({ minimum: 0 }), t.Null()]);

/** A page's fault (core page-faults.ts), as the preview overlay reports it. */
const faultBody = t.Object({
  artifact: t.String({ minLength: 1, maxLength: 64 }),
  revision: t.Integer({ minimum: 0 }),
  fault: t.Union([
    t.Object({
      kind: t.Literal("dial"),
      control: faultText,
      panel: faultText,
      path: faultText,
    }),
    t.Object({
      kind: t.Literal("error"),
      column: faultPlace,
      file: t.Union([faultText, t.Null()]),
      line: faultPlace,
      message: faultText,
      source: t.Union([faultText, t.Null()]),
    }),
    t.Object({
      kind: t.Literal("asset"),
      element: faultText,
      url: faultText,
    }),
  ]),
});

/**
 * Who keeps the fault a request's report names, by the request the route
 * handles: a report on a preview origin ({@link takeErrorReport}) names one
 * of its artifacts; the dashboard's own names none, and nothing keeps it.
 */
const faultKeepers = new WeakMap<Request, (report: PageFaultReport) => void>();

/**
 * Bounded telemetry ingestion: the journal is the record of every report,
 * and a page's fault (`fault`, the preview overlay's) is also kept with its
 * artifact for `artifact_read` by whoever handed the request in.
 */
export const dashboardErrorsRoutes = () =>
  new Elysia().post(
    DASHBOARD_ERRORS_PATH,
    {
      error: ({ error }) => {
        // Elysia wraps custom-parser exceptions; retain our explicit refusal statuses.
        if (
          error instanceof ParseError &&
          error.cause instanceof ElysiaStatus
        ) {
          if (error.cause.status === 413) {
            return refusal(
              413,
              "dashboard-error-report-too",
              "Dashboard error report is too large"
            );
          }
          if (error.cause.status === 415) {
            return refusal(
              415,
              "dashboard-errors-require-application",
              "Dashboard errors require application/json"
            );
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
        fault: t.Optional(faultBody),
      }),
      parse: [
        async ({ request }) => {
          if (
            request.headers.get("content-type")?.split(";")[0].trim() !==
            "application/json"
          ) {
            throw refusal(
              415,
              "dashboard-errors-require-application",
              "Dashboard errors require application/json"
            );
          }
          if (Number(request.headers.get("content-length")) > BODY_LIMIT) {
            throw refusal(
              413,
              "dashboard-error-report-too",
              "Dashboard error report is too large"
            );
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
              const { done, value } = await reader.read();
              if (done) {
                break;
              }
              size += value.byteLength;
              if (size > BODY_LIMIT) {
                await reader.cancel();
                throw refusal(
                  413,
                  "dashboard-error-report-too",
                  "Dashboard error report is too large"
                );
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
    ({ body, request }) => {
      // JSON escaping keeps even multiline stacks and messages on one journal line.
      console.warn(`dashboard error: ${JSON.stringify(body)}`);
      if (body.fault) {
        faultKeepers.get(request)?.(body.fault);
      }
      return status(204);
    }
  );

const errorLog = dashboardErrorsRoutes();

/**
 * A page's error report on a preview origin (core `PREVIEW_ERRORS_PATH`: a
 * decision page's host, and the preview overlay in every page it runs in):
 * taken exactly as the dashboard's is, by the same route, so both land in
 * the journal alike. A report that names a fault of its artifact (core
 * page-faults.ts) goes to `keep` as well.
 */
export const takeErrorReport = (
  request: Request,
  keep: (report: PageFaultReport) => void
): Promise<Response> => {
  const taken = new Request(
    new URL(DASHBOARD_ERRORS_PATH, request.url),
    request
  );
  faultKeepers.set(taken, keep);
  return errorLog.handle(taken);
};
