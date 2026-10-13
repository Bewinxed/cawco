/**
 * The artifact routes (Projects spec §5.10), on the session that made the
 * artifact: the panel's list and its Show and Send, and what the four tools
 * call. A session reaches only its own artifacts; any other id is 404.
 */
import { ARTIFACT_NAME, CHOICE_LIMITS, PREVIEW_START_PATH } from "@cawco/core";
import { Elysia, t } from "elysia";
import type { Operation } from "rfc6902";
import { PAGE_LIMIT } from "../decision-page";
import { ArtifactRefusal, type Artifacts } from "./service";
import { PATCH_LIMIT, WORKSPACE_ID } from "./tools";

const refused = (error: unknown) => {
  if (error instanceof ArtifactRefusal) {
    return new Response(error.message, { status: error.status });
  }
  throw error;
};

const operation = t.Object({
  op: t.Union([
    t.Literal("add"),
    t.Literal("remove"),
    t.Literal("replace"),
    t.Literal("move"),
    t.Literal("copy"),
    t.Literal("test"),
  ]),
  path: t.String({ maxLength: 1000 }),
  from: t.Optional(t.String({ maxLength: 1000 })),
  value: t.Optional(t.Unknown()),
});

export const artifactRoutes = (artifacts: Artifacts) =>
  new Elysia()
    .get("/api/instances/:id/artifacts", ({ params }) => {
      try {
        return artifacts.list(params.id);
      } catch (error) {
        return refused(error);
      }
    })
    .post(
      "/api/instances/:id/artifacts",
      {
        body: t.Object({
          kind: t.Union([t.Literal("page"), t.Literal("preview")]),
          name: t.String({ pattern: ARTIFACT_NAME.source }),
          html: t.Optional(t.String({ minLength: 1, maxLength: PAGE_LIMIT })),
          dir: t.Optional(
            t.String({ minLength: 2, maxLength: 4096, pattern: "^/" })
          ),
          port: t.Optional(t.Integer({ minimum: 1, maximum: 65_535 })),
          path: t.Optional(
            t.String({ maxLength: 2000, pattern: PREVIEW_START_PATH.source })
          ),
          machine: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
          workspace: t.Optional(t.String({ pattern: WORKSPACE_ID.source })),
        }),
      },
      async ({ params, body }) => {
        try {
          return await artifacts.create(params.id, body);
        } catch (error) {
          return refused(error);
        }
      }
    )
    .get(
      "/api/instances/:id/artifacts/:artifact",
      {
        query: t.Object({ since: t.Optional(t.Numeric({ minimum: 0 })) }),
      },
      ({ params, query }) => {
        try {
          return artifacts.read(params.id, params.artifact, query.since);
        } catch (error) {
          return refused(error);
        }
      }
    )
    .patch(
      "/api/instances/:id/artifacts/:artifact",
      {
        body: t.Object({
          html: t.Optional(t.String({ minLength: 1, maxLength: PAGE_LIMIT })),
          patch: t.Optional(
            t.Array(operation, { minItems: 1, maxItems: PATCH_LIMIT })
          ),
        }),
      },
      async ({ params, body }) => {
        try {
          if ((body.html === undefined) === (body.patch === undefined)) {
            throw new ArtifactRefusal(
              400,
              "Pass exactly one of html or patch."
            );
          }
          return await artifacts.update(
            params.id,
            params.artifact,
            body.html === undefined
              ? { patch: body.patch as Operation[] }
              : { html: body.html }
          );
        } catch (error) {
          return refused(error);
        }
      }
    )
    .post("/api/instances/:id/artifacts/:artifact/show", async ({ params }) => {
      try {
        const opened = await artifacts.show(params.id, params.artifact);
        return opened === true
          ? { opened: true }
          : new Response(opened, { status: 503 });
      } catch (error) {
        return refused(error);
      }
    })
    // The person sends: the session hears every pick as one message, at once.
    // A page's `ui/message` adds its text below the picks.
    .post(
      "/api/instances/:id/artifacts/:artifact/send",
      {
        body: t.Optional(
          t.Object({
            text: t.Optional(t.String({ maxLength: CHOICE_LIMITS.note })),
          })
        ),
      },
      ({ params, body }) => {
        try {
          return artifacts.send(params.id, params.artifact, body?.text?.trim());
        } catch (error) {
          return refused(error);
        }
      }
    );
