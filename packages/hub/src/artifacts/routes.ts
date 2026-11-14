/**
 * The artifact routes (Projects spec §5.10), on the session that made the
 * artifact: the panel's list, its Show and Remove, what the six tools call, and the
 * lookup an artifact's own tab opens with. A session reaches only its own
 * artifacts, and those it handed to its parent (update, read);
 * any other id is 404. The person's Send is on the preview
 * listener, beside the doc's socket (sync.ts `artifactSend`).
 */

import { PICTURE_LIMITS } from "@cawco/core/artifact-picture";
import { SHOWN_FAILURES } from "@cawco/core/preview/protocol";
import { DESIGN_MAP_LIMITS } from "@cawco/core/stage";
import { Elysia, ElysiaStatus, problem, t, ValidationError } from "elysia";
import {
  askBody,
  closeQuestionBody,
  commentsFields,
  componentBody,
  createBody,
  readFields,
  replyBody,
  resolveBody,
  SHAPES,
  settleBody,
  sheetBody,
  statementsBody,
  titleBody,
  updateBody,
} from "./bodies";
import {
  createArtifact,
  readAsked,
  sheetChangeOf,
  updateArtifact,
  updateComponent,
} from "./calls";
import { type Artifacts, THUMBNAIL_BYTES } from "./service";
import { PNG_SIGNATURE } from "./sync";

/** A thumbnail's scheme as the pane sends it: base64 PNG, or null where none was drawn. */
const thumbnailPng = t.Nullable(
  t.String({ maxLength: Math.ceil(THUMBNAIL_BYTES / 3) * 4 })
);

/** A base64 PNG's bytes; refused when it is not a PNG. */
const pngOf = (base64: string | null) => {
  if (base64 === null) {
    return null;
  }
  const bytes = Uint8Array.from(Buffer.from(base64, "base64"));
  if (!PNG_SIGNATURE.every((byte, i) => bytes[i] === byte)) {
    return problem(422, {
      code: "artifact-thumbnail-not-png",
      detail: "A thumbnail is a PNG.",
    });
  }
  return bytes;
};

/** Who moves the panel: `by=agent` from the session's own tools; left out, the person. */
const handQuery = t.Object({ by: t.Optional(t.Literal("agent")) });

export const artifactRoutes = (artifacts: Artifacts) =>
  new Elysia()
    // A body the validator refused: what the tool takes, never the validator's text.
    .onError(({ error, request }) => {
      const { pathname: path } = new URL(request.url);
      if (!(error instanceof ValidationError && path.includes("/artifacts"))) {
        return;
      }
      // Files' own reads: the validator's word is enough there.
      if (path.endsWith("/search") || path.includes("/thumbnail")) {
        return problem(422, {
          code: "files-asked-shape-hub",
          detail: "Files asked in a shape the hub doesn't take.",
        });
      }
      let shape = SHAPES.read;
      if (path.endsWith("/design-map")) {
        shape = SHAPES.map;
      } else if (request.method === "GET") {
        // A read's query (its png's width, its frame): artifact_read's shape.
        shape = SHAPES.read;
      } else if (path.endsWith("/artifacts")) {
        shape = SHAPES.create;
      } else if (!(path.endsWith("/sheet") || path.endsWith("/view"))) {
        shape = SHAPES.update;
      }
      return problem(422, { code: "artifact-shape", detail: shape });
    })
    // Every artifact the session holds: its panel's menu.
    .get("/api/instances/:id/artifacts", ({ params }) =>
      artifacts.list(params.id)
    )
    // Files' list: the session's artifacts that reached the person. The
    // dashboard's alone, so out of the app's API document.
    .get(
      "/api/instances/:id/artifacts/files",
      { detail: { hide: true } },
      ({ params }) => artifacts.files(params.id)
    )
    // What the session's tree asked the person, open or answered and not
    // yet taken (core session-questions.ts): its own screen's list. The
    // dashboard's alone, so out of the app's API document.
    .get(
      "/api/instances/:id/questions",
      { detail: { hide: true } },
      ({ params }) => artifacts.sessionQuestions(params.id)
    )
    // Files' search: the session's artifacts a query matches by name or by
    // the words on their page, best first, with the words round a hit.
    .get(
      "/api/instances/:id/artifacts/search",
      { query: t.Object({ q: t.String({ maxLength: 200 }) }) },
      ({ params, query }) => artifacts.search(params.id, query.q)
    )
    // A screen's thumbnail of a page or preview, kept as its latest picture.
    .put(
      "/api/instances/:id/artifacts/:artifact/thumbnail",
      {
        body: t.Object({
          light: thumbnailPng,
          dark: thumbnailPng,
          single: t.Boolean(),
        }),
      },
      ({ params, body }) => {
        const light = pngOf(body.light);
        if (light instanceof ElysiaStatus) {
          return light;
        }
        const dark = pngOf(body.dark);
        if (dark instanceof ElysiaStatus) {
          return dark;
        }
        return artifacts.keepThumbnail(params.id, params.artifact, {
          light,
          dark,
          single: body.single,
        });
      }
    )
    // A page of every artifact the session acts on, with whose move each is (artifact_list).
    .get(
      "/api/instances/:id/artifacts/list",
      {
        query: t.Object({
          cursor: t.Optional(t.String({ maxLength: 60 })),
          waiting: t.Optional(t.BooleanString()),
        }),
      },
      ({ params, query }) =>
        artifacts.status(params.id, {
          cursor: query.cursor,
          waitingOnly: query.waiting === true,
        })
    )
    .post(
      "/api/instances/:id/artifacts",
      { body: createBody },
      ({ params, body }) => createArtifact(artifacts, params.id, body)
    )
    .get(
      "/api/instances/:id/artifacts/:artifact",
      {
        query: t.Object({
          since: t.Optional(t.Numeric({ minimum: 0 })),
          png: t.Optional(t.BooleanString()),
          // A preview's or a page's picture: its width in CSS px.
          width: t.Optional(
            t.Numeric({
              minimum: PICTURE_LIMITS.minWidth,
              maximum: PICTURE_LIMITS.maxWidth,
              multipleOf: 1,
            })
          ),
          detail: t.Optional(
            t.Union([t.Literal("summary"), t.Literal("story")])
          ),
          ...readFields.properties,
          render: t.Optional(t.BooleanString()),
          verify: t.Optional(t.BooleanString()),
        }),
      },
      ({ params, query }) =>
        readAsked(artifacts, params.id, params.artifact, query)
    )
    .patch(
      "/api/instances/:id/artifacts/:artifact",
      { body: updateBody },
      ({ params, body }) =>
        updateArtifact(artifacts, params.id, params.artifact, body)
    )
    // A component canvas's change by its session (artifact_update): a states file's story args or op, or the canvas's own edges, groups or dials.
    .patch(
      "/api/instances/:id/artifacts/:artifact/component",
      // The agent's tool alone calls it: no dashboard or app reads its answer.
      { body: componentBody, detail: { hide: true } },
      ({ params, body }) =>
        updateComponent(artifacts, params.id, params.artifact, body)
    )
    // Any kind's head line (artifact_update's ask): checked as a create's is, then every open view's head morphs to it.
    .post(
      "/api/instances/:id/artifacts/:artifact/ask",
      { body: askBody, detail: { hide: true } },
      ({ params, body }) =>
        artifacts.askUpdate(params.id, params.artifact, body.ask)
    )
    // Any kind's title (artifact_update's title): checked as a create's is, then every surface that names it says it.
    .post(
      "/api/instances/:id/artifacts/:artifact/title",
      { body: titleBody, detail: { hide: true } },
      ({ params, body }) =>
        artifacts.titleUpdate(params.id, params.artifact, body.title)
    )
    // A card settled for the person (settle, Who decides): written as the person's pick is, with who settled it.
    .post(
      "/api/instances/:id/artifacts/:artifact/settle",
      { body: settleBody },
      async ({ params, body }) =>
        await artifacts.settle(params.id, params.artifact, body)
    )
    // question_close: the session takes a question from the person's answer, or withdraws it; nothing is deleted.
    .post(
      "/api/instances/:id/artifacts/questions/close",
      { body: closeQuestionBody },
      ({ params, body }) => artifacts.closeQuestion(params.id, body)
    )
    // A decision page's revision (artifact_update's statements): merged into its program by name; what changed.
    .post(
      "/api/instances/:id/artifacts/:artifact/statements",
      { body: statementsBody },
      async ({ params, body }) =>
        await artifacts.revise(params.id, params.artifact, body.statements)
    )
    // The person's Save in a sheet's inspector, or its story buttons: written by the stage, told to the session.
    .post(
      "/api/instances/:id/artifacts/:artifact/sheet",
      { body: sheetBody },
      async ({ params, body }) => {
        const change = sheetChangeOf(body);
        return change instanceof ElysiaStatus
          ? change
          : await artifacts.sheetWrite(params.id, params.artifact, change);
      }
    )
    // The panel's Verify: a design system round on a component canvas, its verdict to the canvas's session.
    .post(
      "/api/instances/:id/artifacts/:artifact/verify",
      async ({ params }) => ({
        verify: await artifacts.verifyFor(params.id, params.artifact),
      })
    )
    // The library of the session's workspace: its components, paged, or one's card (design_map).
    .get(
      "/api/instances/:id/artifacts/design-map",
      {
        query: t.Object({
          dir: t.Optional(t.String({ minLength: 1, maxLength: 1000 })),
          query: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
          component: t.Optional(t.String({ minLength: 1, maxLength: 1000 })),
          limit: t.Optional(
            t.Numeric({ minimum: 1, maximum: DESIGN_MAP_LIMITS.max })
          ),
          cursor: t.Optional(t.String({ maxLength: 20 })),
          response_format: t.Optional(
            t.Union([t.Literal("concise"), t.Literal("detailed")])
          ),
        }),
      },
      async ({ params, query }) =>
        await artifacts.designMap(params.id, {
          ...(query.dir ? { dir: query.dir } : {}),
          ...(query.query ? { query: query.query } : {}),
          ...(query.component ? { component: query.component } : {}),
          ...(query.limit ? { limit: query.limit } : {}),
          ...(query.cursor ? { cursor: query.cursor } : {}),
          ...(query.response_format === "detailed" ? { detailed: true } : {}),
        })
    )
    // Removes the artifact (the panel's Remove; artifact_delete with by=agent).
    // The panel that showed it shows the next newest after the person's
    // Remove, and closes after the agent's.
    .delete(
      "/api/instances/:id/artifacts/:artifact",
      { query: handQuery },
      async ({ params, query }) =>
        await artifacts.remove(params.id, params.artifact, query.by ?? "person")
    )
    // The person's pins on the session's artifacts, with their threads (comment_read).
    .get(
      "/api/instances/:id/artifacts/comments",
      {
        query: t.Object({
          ...commentsFields,
          // The session itself reads them (its comment_read tool): what it reads counts as heard.
          reader: t.Optional(t.Literal("session")),
        }),
      },
      ({ params, query }) =>
        artifacts.commentRead(params.id, {
          artifact: query.artifact,
          filter: query.filter ?? "open",
          since: query.since,
          bySession: query.reader === "session",
        })
    )
    // The agent answers a pin in its thread (comment_reply).
    .post(
      "/api/instances/:id/artifacts/comments/:pin/reply",
      { body: replyBody },
      ({ params, body }) => artifacts.commentReply(params.id, params.pin, body)
    )
    // The agent resolves a pin (comment_resolve).
    .post(
      "/api/instances/:id/artifacts/comments/:pin/resolve",
      { body: resolveBody },
      ({ params, body }) =>
        artifacts.commentResolve(params.id, params.pin, body.text)
    )
    // Whether a view has it on screen within 10 s, or why not; 503 when its
    // server could not start. The person's show unless by=agent (artifact_show).
    // The answer's href is where the person goes instead: a project's setup
    // page's landing, or, for the person's show of one this session's panel
    // does not hold, the session that holds it.
    .post(
      "/api/instances/:id/artifacts/:artifact/show",
      {
        query: handQuery,
        // The place the person's press opens it at (core `ArtifactPlace`): a
        // pin, a decision card, a changed spot. A project's setup page lands
        // at the card (core `setupLanding`); one another session holds opens
        // there at the place (core `artifactStopHref`).
        body: t.Optional(
          t.Object({
            at: t.Optional(
              t.Union([
                t.Object({ pin: t.Integer({ minimum: 1 }) }),
                t.Object({ card: t.String({ minLength: 1, maxLength: 200 }) }),
                t.Object({
                  change: t.String({ minLength: 1, maxLength: 200 }),
                }),
              ])
            ),
          })
        ),
      },
      async ({ params, query, body }) =>
        await artifacts.show(
          params.id,
          params.artifact,
          query.by ?? "person",
          body?.at ?? { top: true }
        )
    )
    // Where the session's own browser opens the artifact (artifact_browse):
    // a one-time address, and when it stops opening. The tool alone calls it.
    .post(
      "/api/instances/:id/artifacts/:artifact/browse",
      { detail: { hide: true } },
      async ({ params }) => await artifacts.browse(params.id, params.artifact)
    )
    // A view (a dashboard tab, the app) has the artifact on screen at the
    // open frame's revision, or could not load it: the waiting show answers.
    .post(
      "/api/instances/:id/artifacts/:artifact/shown",
      {
        body: t.Object({
          client: t.String({ minLength: 1, maxLength: 100 }),
          revision: t.String({ minLength: 1, maxLength: 100 }),
          ok: t.Boolean(),
          error: t.Optional(t.UnionEnum(SHOWN_FAILURES)),
        }),
      },
      ({ params, body }) => artifacts.shown(params.id, params.artifact, body)
    )
    // The artifact's doc as a person's view reads it (the app's panel): its
    // picks and their send. No read of the session's, and it never wakes a stage.
    .get("/api/instances/:id/artifacts/:artifact/view", ({ params }) =>
      artifacts.viewOf(params.id, params.artifact)
    )
    // The artifact into its project's folder at artifacts/<name>/, one commit (artifact_promote).
    .post(
      "/api/instances/:id/artifacts/:artifact/promote",
      async ({ params }) => await artifacts.promote(params.id, params.artifact)
    )
    // A draft canvas went out with the composer's send: no longer a draft.
    .post("/api/instances/:id/artifacts/:artifact/sent", ({ params }) =>
      artifacts.sent(params.id, params.artifact)
    )
    // The artifact's own tab (the dashboard's /artifact/<id>) finds its session.
    .get("/api/artifacts/:artifact", ({ params }) =>
      artifacts.find(params.artifact)
    )
    // What its program links to: the `cawco:` references its words name and
    // the artifacts its pieces show, all a dashboard framing it says faces
    // of to the page and opens for it (core reference-faces.ts).
    .get("/api/artifacts/:artifact/links", ({ params }) =>
      artifacts.links(params.artifact)
    )
    // An artifact's latest picture in a scheme (Files' cards). The list names
    // it with its `at`, so a new one is a new address and this one never
    // changes under it.
    .get(
      "/api/artifacts/:artifact/thumbnail/:scheme",
      {
        params: t.Object({
          artifact: t.String(),
          scheme: t.Union([t.Literal("light"), t.Literal("dark")]),
        }),
        // When the picture was drawn, which names the address so a browser
        // reads a new one afresh (dashboard artifact-api.ts `thumbnailUrl`);
        // the file served is the latest either way.
        query: t.Object({ at: t.Optional(t.String()) }),
      },
      ({ params, set }) => {
        const png = artifacts.thumbnailFile(params.artifact, params.scheme);
        if (png instanceof ElysiaStatus) {
          return png;
        }
        if (!png) {
          return problem(404, {
            code: "no-picture-yet",
            detail: "No picture yet.",
          });
        }
        set.headers["content-type"] = "image/png";
        set.headers["cache-control"] = "private, max-age=31536000, immutable";
        return new Blob([new Uint8Array(png)]);
      }
    )
    // A canvas as a send carries it: the .excalidraw file, the outline, the picture.
    .get("/api/artifacts/:artifact/export", ({ params }) =>
      artifacts.export(params.artifact)
    );
