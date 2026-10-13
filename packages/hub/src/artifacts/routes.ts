/**
 * The artifact routes (Projects spec §5.10), on the session that made the
 * artifact: the panel's list and its Show, what the four tools call, and the
 * lookup an artifact's own tab opens with. A session reaches only its own
 * artifacts; any other id is 404. The person's Send is on the preview
 * listener, beside the doc's socket (sync.ts `artifactSend`).
 */
import { ARTIFACT_NAME, PREVIEW_START_PATH } from "@cawco/core";
import { CANVAS_LIMITS, SKELETON_TYPES } from "@cawco/core/canvas";
import { Elysia, t } from "elysia";
import type { Operation } from "rfc6902";
import { PAGE_LIMIT } from "../decision-page";
import {
  ArtifactRefusal,
  type Artifacts,
  type CanvasChange,
  type PageChange,
  type SkeletonElement,
} from "./service";
import { PATCH_LIMIT, WORKSPACE_ID } from "./tools";

const refused = (error: unknown) => {
  if (error instanceof ArtifactRefusal) {
    return new Response(error.message, { status: error.status });
  }
  throw error;
};

/** A canvas's skeleton elements: a type, an optional id, and Excalidraw's own fields. */
const skeletons = t.Array(
  t.Object(
    {
      type: t.Union(SKELETON_TYPES.map((type) => t.Literal(type))),
      id: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
    },
    { additionalProperties: true }
  ),
  { minItems: 1, maxItems: CANVAS_LIMITS.elementsPerCall }
);

const mermaid = t.String({ minLength: 1, maxLength: CANVAS_LIMITS.mermaid });

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

/** The one change an update names: a page's html or patch, a canvas's elements, delete or mermaid. */
const changeOf = (body: {
  delete?: string[];
  elements?: SkeletonElement[];
  html?: string;
  mermaid?: string;
  patch?: unknown[];
}): PageChange | CanvasChange => {
  const named = (
    ["html", "patch", "elements", "delete", "mermaid"] as const
  ).filter((key) => body[key] !== undefined);
  if (named.length !== 1) {
    throw new ArtifactRefusal(
      400,
      "Pass exactly one of html or patch (a page), or elements, delete or mermaid (a canvas)."
    );
  }
  if (body.html !== undefined) {
    return { html: body.html };
  }
  if (body.patch !== undefined) {
    return { patch: body.patch as Operation[] };
  }
  if (body.elements !== undefined) {
    return { elements: body.elements };
  }
  return body.delete === undefined
    ? { mermaid: body.mermaid as string }
    : { delete: body.delete };
};

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
          kind: t.Union([
            t.Literal("page"),
            t.Literal("preview"),
            t.Literal("canvas"),
          ]),
          elements: t.Optional(skeletons),
          mermaid: t.Optional(mermaid),
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
          draft: t.Optional(t.Boolean()),
        }),
      },
      async ({ params, body }) => {
        try {
          if (body.draft && body.kind !== "canvas") {
            throw new ArtifactRefusal(400, "Only a canvas is a draft.");
          }
          return await artifacts.create(params.id, body);
        } catch (error) {
          return refused(error);
        }
      }
    )
    .get(
      "/api/instances/:id/artifacts/:artifact",
      {
        query: t.Object({
          since: t.Optional(t.Numeric({ minimum: 0 })),
          png: t.Optional(t.BooleanString()),
        }),
      },
      ({ params, query }) => {
        try {
          return artifacts.read(
            params.id,
            params.artifact,
            query.since,
            query.png === true
          );
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
          elements: t.Optional(skeletons),
          delete: t.Optional(
            t.Array(t.String({ minLength: 1, maxLength: 100 }), {
              minItems: 1,
              maxItems: CANVAS_LIMITS.deletePerCall,
            })
          ),
          mermaid: t.Optional(mermaid),
        }),
      },
      async ({ params, body }) => {
        try {
          return await artifacts.update(
            params.id,
            params.artifact,
            changeOf(body)
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
    // A draft canvas went out with the composer's send: no longer a draft.
    .post("/api/instances/:id/artifacts/:artifact/sent", ({ params }) => {
      try {
        return artifacts.sent(params.id, params.artifact);
      } catch (error) {
        return refused(error);
      }
    })
    // The artifact's own tab (the dashboard's /artifact/<id>) finds its session.
    .get("/api/artifacts/:artifact", ({ params }) => {
      try {
        return artifacts.find(params.artifact);
      } catch (error) {
        return refused(error);
      }
    })
    // A canvas as a send carries it: the .excalidraw file, the outline, the picture.
    .get("/api/artifacts/:artifact/export", ({ params }) => {
      try {
        return artifacts.export(params.artifact);
      } catch (error) {
        return refused(error);
      }
    });
