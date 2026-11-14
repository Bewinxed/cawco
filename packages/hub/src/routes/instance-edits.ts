import { detach } from "@cawco/core/detach";
import { harnessesWith, traitsOf } from "@cawco/core/harness/traits";
import type { SessionAttachments } from "@cawco/core/protocol";
import type { TranscriptPage } from "@cawco/core/transcript-types";
import { harnessWords } from "@cawco/core/words/harness";
import { Elysia, problem, t } from "elysia";
import type { HubContext } from "../hub-context";
import { instanceTimes } from "../instance-out";
import { awayProblem, silentProblem } from "../machine-answers";
import type { MachineReadsContext } from "../machine-reads";
import { attachmentsOfPages } from "../session-attachments";

/** Why keep-alive is refused a session: its harness's prompt cache is one nothing times. */
const keepAliveRefused = harnessWords.keepAliveIsFor(
  harnessesWith((traits) => traits.promptCacheMaxMs !== null)
);

export const instanceEditRoutes = (
  ctx: Pick<
    HubContext,
    | "applyPermissionMode"
    | "continuationNow"
    | "db"
    | "everyPage"
    | "keepAliveScheduler"
    | "publishInstances"
    | "sessionName"
    | "transcripts"
    | "withKeepAlive"
    | keyof MachineReadsContext
  >
) => {
  const {
    applyPermissionMode,
    continuationNow,
    db,
    everyPage,
    keepAliveScheduler,
    publishInstances,
    sessionName,
    transcripts,
    withKeepAlive,
  } = ctx;
  return (
    new Elysia()
      // A session's stored transcript over HTTP, which is the only way a page can
      // have one before its socket is up. The dashboard used to read history with
      // a `getSessionMessages` control over its own WebSocket, so a reload showed
      // an empty transcript until the socket reconnected and backfilled; this runs
      // the same control from here, against the machine's agent socket, and
      // streams the answer back newest-entry-first as NDJSON.
      //
      // Addressed by id alone. The hub's own row answers for a session it holds —
      // including the SDK session key, which is what the machine stores the
      // transcript under. An id with no row is a stored session key, located
      // by `locateSession`.
      //
      // A page of a session's transcript as blocks the hub built, newest
      // first: the newest page carries the sends waiting, the live tail, the
      // session's facts and the stream position it is consistent with, so a
      // reader subscribes with `afterSeq: seq` and applies what follows. An
      // older page is everything before `before`, a block id a newer page
      // named as its cursor. Addressed by id alone: the hub's row names a
      // session it holds, and any other id is a stored key, located; one
      // only a machine that is away keeps (its last catalog) is that
      // machine away, 503, never a 404.
      .get(
        "/api/instances/:id/transcript",
        {
          query: t.Object({
            limit: t.Optional(t.String()),
            before: t.Optional(t.String()),
          }),
        },
        async ({ params, query }) => {
          const limit =
            Number(query.limit) > 0
              ? Math.floor(Number(query.limit))
              : undefined;
          // A former id is its session's (the hub's fold of older continuations).
          const id = db.instanceIdOf(params.id);
          const page = await transcripts.page(id, limit, query.before);
          if ("gone" in page) {
            return problem(409, {
              code: "transcript-no-longer-holds",
              detail: `the transcript no longer holds block ${page.gone}`,
            });
          }
          if (!("fault" in page)) {
            // Where a continued session's work went rides its newest page,
            // for a first paint and a reader whose board no longer lists it.
            const now = query.before ? id : continuationNow(id);
            const [to] = now === id ? [] : db.getInstancesByIds([now]);
            return to
              ? {
                  ...page,
                  continuedTo: { instanceId: to.id, title: sessionName(to) },
                }
              : page;
          }
          switch (page.fault) {
            case "offline":
              return awayProblem(page.machineId ?? "", page.message);
            case "missing":
              return problem(404, {
                code: "no-transcript",
                detail: page.message,
              });
            case "timeout":
              return silentProblem(page.message);
            // Its machine refuses the CLI the conversation is read
            // through: the read depends on a CLI the machine does not run
            // yet (424 Failed Dependency, RFC 4918 §11.4), never the hub
            // failing (500), and no machine away (503 with its header).
            case "refused":
              return problem(424, {
                code: "harness-refused",
                detail: page.message,
              });
            case "failed":
              break;
          }
          return problem(500, {
            code: "transcript-unread",
            detail: page.message,
          });
        }
      )
      // Files' Attachments: every text, file and picture the session's
      // conversation carried, read off its whole transcript here, newest
      // first, so the list never depends on the pages a reader has loaded.
      // A transcript that can't be read answers as its page would.
      .get("/api/instances/:id/attachments", async ({ params }) => {
        const read = await everyPage(params.id);
        if ("gone" in read) {
          return problem(409, {
            code: "transcript-no-longer-holds",
            detail: `the transcript no longer holds block ${read.gone}`,
          });
        }
        if ("fault" in read) {
          switch (read.fault) {
            case "offline":
              return awayProblem(read.machineId ?? "", read.message);
            case "missing":
              return problem(404, {
                code: "no-transcript",
                detail: read.message,
              });
            case "timeout":
              return silentProblem(read.message);
            case "refused":
              return problem(424, {
                code: "harness-refused",
                detail: read.message,
              });
            case "failed":
              return problem(500, {
                code: "transcript-unread",
                detail: read.message,
              });
          }
        }
        const [first] = read.pages;
        return {
          harness: (first as TranscriptPage).where.harness,
          attachments: attachmentsOfPages(read.pages),
        } satisfies SessionAttachments;
      })
      .patch(
        "/api/instances/:id",
        {
          body: t.Object({
            keepAlive: t.Optional(t.Boolean()),
            kind: t.Optional(
              t.Union([t.Literal("mainline"), t.Literal("scratch")])
            ),
            // Not narrowed to the modes the SDK names today: the hub stores what
            // the session reported it is answering with, whatever that grows into.
            permissionMode: t.Optional(t.String()),
            model: t.Optional(t.String()),
            /** The owner's name for it, which the session's `set_title` never replaces. */
            title: t.Optional(t.String()),
          }),
        },
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: validates one multi-field patch, applies its live mode, and only then changes metadata
        async ({ params, body }) => {
          const { kind, permissionMode, model } = body;
          const title = body.title?.trim();
          if (body.title !== undefined && !title) {
            return problem(400, {
              code: "title-blank",
              detail: "title is blank",
            });
          }
          if (
            kind === undefined &&
            permissionMode === undefined &&
            model === undefined &&
            title === undefined &&
            body.keepAlive === undefined
          ) {
            return problem(400, {
              code: "name-field-change",
              detail: "name a field to change",
            });
          }
          const [current] = db.getInstancesByIds([params.id]);
          if (!current) {
            return problem(404, {
              code: "no-session",
              detail: `no session ${params.id}`,
            });
          }
          if (
            body.keepAlive !== undefined &&
            traitsOf(current.harness).promptCacheMaxMs === null
          ) {
            return problem(409, {
              code: "keep-alive-refused",
              detail: keepAliveRefused,
            });
          }
          if (body.keepAlive !== undefined) {
            db.updateKeepAlive(params.id, {
              keepAliveEnabled: body.keepAlive,
              keepAliveStopped: null,
              ...(body.keepAlive ? { keepAliveSent: 0 } : {}),
            });
          }
          if (permissionMode !== undefined) {
            const refused = await applyPermissionMode(current, permissionMode);
            if (refused) {
              return refused;
            }
          }
          const named = title
            ? db.nameInstance(params.id, title, "owner")?.row
            : undefined;
          if (title && !named) {
            return problem(404, {
              code: "no-session",
              detail: `no session ${params.id}`,
            });
          }
          // A rename alone is not the session moving: its age stays.
          const row =
            kind === undefined && model === undefined
              ? (named ?? db.getInstancesByIds([params.id])[0])
              : db.patchInstance(params.id, { kind, model });
          if (!row) {
            return problem(404, {
              code: "no-session",
              detail: `no session ${params.id}`,
            });
          }
          publishInstances(row.machineId);
          // The stored toggle re-arms through the scheduler's one path.
          detach(keepAliveScheduler.wake(), "keepalive wake");
          const [answered] = withKeepAlive([row]);
          return answered && { ...answered, ...instanceTimes(answered) };
        }
      )
  );
};
