/**
 * The artifact routes (Projects spec §5.10), on the session that made the
 * artifact: the panel's list, its Show and Remove, what the six tools call, and the
 * lookup an artifact's own tab opens with. A session reaches only its own
 * artifacts, and those it put in its parent's panel (update, read, show);
 * any other id is 404. The person's Send is on the preview
 * listener, beside the doc's socket (sync.ts `artifactSend`).
 */
import { ARTIFACT_NAME, PREVIEW_START_PATH, SHOWN_FAILURES } from "@cawco/core";
import { CANVAS_LIMITS, SKELETON_TYPES } from "@cawco/core/canvas";
import { COMMENT_LIMITS } from "@cawco/core/comments";
import {
  CANVAS_SPEC_LIMITS,
  DESIGN_MAP_LIMITS,
  SERVE_COMMAND_LIMIT,
  STORY_FILE,
  type StoryOp,
} from "@cawco/core/stage";
import { Elysia, t, ValidationError } from "elysia";
import type { Operation } from "rfc6902";
import { PAGE_LIMIT } from "../decision-page";
import { PROGRAM_MAX } from "../decision-program";
import type { StateAsk } from "./component";
import { COMPONENT_EXAMPLE } from "./component";
import {
  ArtifactRefusal,
  type Artifacts,
  type CanvasChange,
  type PageChange,
  type SheetChange,
  type SkeletonElement,
} from "./service";
import { ARGS_LIMIT, PATCH_LIMIT, STORY_NAME, WORKSPACE_ID } from "./tools";

const INTERACTION_NAMES = ["rest", "hover", "focus", "pressed"];

/** A read's frame, from its JSON; refused with the shape when it is none. */
const stateOf = (text: string): StateAsk => {
  let value: Partial<StateAsk> | null = null;
  try {
    value = JSON.parse(text) as Partial<StateAsk>;
  } catch {
    value = null;
  }
  if (
    !(
      value &&
      typeof value.story === "string" &&
      STORY_NAME.test(value.story)
    ) ||
    (value.interaction !== undefined &&
      !INTERACTION_NAMES.includes(value.interaction)) ||
    (value.scheme !== undefined &&
      value.scheme !== "light" &&
      value.scheme !== "dark") ||
    (value.width !== undefined &&
      !(typeof value.width === "number" && value.width > 0))
  ) {
    throw new ArtifactRefusal(400, SHAPES.read as string);
  }
  return value as StateAsk;
};

const refused = (error: unknown) => {
  if (error instanceof ArtifactRefusal) {
    return new Response(error.message, { status: error.status });
  }
  throw error;
};

/** Who moves the panel: `by=agent` from the session's own tools; left out, the person. */
const handQuery = t.Object({ by: t.Optional(t.Literal("agent")) });

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

const storyName = t.String({ pattern: STORY_NAME.source });
const argValues = t.Record(
  t.String({ minLength: 1, maxLength: 100 }),
  t.Unknown(),
  {
    maxProperties: ARGS_LIMIT,
  }
);

/** A states file, from the clone's root or absolute. */
const statesFile = t.String({
  minLength: 1,
  maxLength: 1000,
  pattern: STORY_FILE.source,
});

/** A story on a canvas: `Story`, or `file:Story` across sections. */
const storyRef = t.String({ minLength: 1, maxLength: 1100 });

/** A component canvas's about, edges, groups and dials (core `CanvasSpec`), as create and update take them. */
const canvasFields = {
  about: t.Optional(
    t.String({ minLength: 1, maxLength: CANVAS_SPEC_LIMITS.about })
  ),
  edges: t.Optional(
    t.Array(
      t.Object({
        from: storyRef,
        to: storyRef,
        label: t.Optional(t.String({ maxLength: CANVAS_SPEC_LIMITS.label })),
      }),
      { maxItems: CANVAS_SPEC_LIMITS.edges }
    )
  ),
  group: t.Optional(t.Record(storyRef, storyRef, { maxProperties: 200 })),
  dials: t.Optional(
    t.Array(
      t.Object({
        name: t.String({
          minLength: 1,
          maxLength: 60,
          pattern: "^[A-Za-z][\\w-]*$",
        }),
        label: t.Optional(t.String({ maxLength: CANVAS_SPEC_LIMITS.label })),
        kind: t.Union([
          t.Literal("number"),
          t.Literal("color"),
          t.Literal("select"),
          t.Literal("toggle"),
        ]),
        min: t.Optional(t.Number()),
        max: t.Optional(t.Number()),
        step: t.Optional(t.Number({ exclusiveMinimum: 0 })),
        unit: t.Optional(t.String({ maxLength: 10 })),
        options: t.Optional(
          t.Array(t.String({ maxLength: 100 }), { maxItems: 24 })
        ),
        target: t.Union([
          t.Object({
            cssVar: t.String({ pattern: "^--[\\w-]+$", maxLength: 100 }),
          }),
          t.Object({ arg: t.String({ minLength: 1, maxLength: 100 }) }),
        ]),
      }),
      { maxItems: CANVAS_SPEC_LIMITS.dials }
    )
  ),
};

/** What a malformed body was refused for, in the tool's words with its valid shape: never the validator's own text (component canvas G3). */
const SHAPES: Record<string, string> = {
  create: `artifact_create takes kind, name and that kind's fields. A component canvas: { kind: "component", name, file, about, edges?, group?, dials? }; edges [{ from: "Waiting", to: "Approved", label? }]; dials [{ name, kind: "number" | "color" | "select" | "toggle", min?, max?, step?, unit?, options?, target: { cssVar: "--radius" } | { arg: "size" } }]. Example: ${COMPONENT_EXAMPLE}.`,
  update:
    'artifact_update takes id and one change: html or patch (a page); elements, delete or mermaid (a canvas); args { story, values, unset? } or story { add, args? } | { duplicate, as } | { remove } | { move, before } (a component canvas\'s states file); or about, edges, group, dials (the canvas itself). Example: { id, args: { story: "Waiting", values: { status: "waiting" } } }.',
  read: 'artifact_read takes id?, since?, png?, detail ("summary" | "story"), story, state { story, interaction?: "rest" | "hover" | "focus" | "pressed", scheme?: "light" | "dark", width? }, render. Example: { id, state: { story: "Waiting", interaction: "hover" } }.',
  map: `design_map takes dir?, query?, component?, limit? (1 to ${DESIGN_MAP_LIMITS.max}), cursor?, response_format? ("concise" | "detailed"). Example: { dir: "src/lib", query: "card" }.`,
};

/** A sheet's change (core `SheetWrite` less its file): one story's args, or one story op. */
const sheetChange = {
  args: t.Optional(
    t.Object({
      story: storyName,
      values: argValues,
      unset: t.Optional(
        t.Array(t.String({ minLength: 1, maxLength: 100 }), {
          maxItems: ARGS_LIMIT,
        })
      ),
    })
  ),
  story: t.Optional(
    t.Union([
      t.Object({ add: storyName, args: t.Optional(argValues) }),
      t.Object({ duplicate: storyName, as: storyName }),
      t.Object({ remove: storyName }),
      t.Object({ move: storyName, before: t.Union([storyName, t.Null()]) }),
    ])
  ),
};

/** The one change a sheet's write names. */
const sheetChangeOf = (body: {
  args?: Extract<SheetChange, { args: unknown }>["args"];
  story?: StoryOp;
}): SheetChange => {
  if ((body.args === undefined) === (body.story === undefined)) {
    throw new ArtifactRefusal(
      400,
      "A sheet takes exactly one of args or story."
    );
  }
  return body.args ? { args: body.args } : { story: body.story as StoryOp };
};

/** The one change an update names (a decision page's statements and a component canvas each have their own route): a page's html or patch, a canvas's elements, delete or mermaid. */
const changeOf = (body: {
  delete?: string[];
  elements?: SkeletonElement[];
  html?: string;
  mermaid?: string;
  patch?: unknown[];
}): Exclude<PageChange, { statements: string }> | CanvasChange => {
  const named = (
    ["html", "patch", "elements", "delete", "mermaid"] as const
  ).filter((key) => body[key] !== undefined);
  if (named.length !== 1) {
    throw new ArtifactRefusal(
      400,
      "Pass exactly one of html or patch (a page), or elements, delete or mermaid (a canvas); a decision page's statements and a component's args, story, about, edges, group or dials go through their own routes."
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
    // A body the validator refused: what the tool takes, never the validator's text.
    .error(({ error, request }) => {
      const { pathname: path } = new URL(request.url);
      if (!(error instanceof ValidationError && path.includes("/artifacts"))) {
        return;
      }
      let shape = SHAPES.read;
      if (path.endsWith("/design-map")) {
        shape = SHAPES.map;
      } else if (path.endsWith("/artifacts")) {
        shape = SHAPES.create;
      } else if (!(path.endsWith("/sheet") || path.endsWith("/view"))) {
        shape = SHAPES.update;
      }
      return new Response(shape, { status: 422 });
    })
    .get("/api/instances/:id/artifacts", ({ params }) => {
      try {
        return artifacts.list(params.id);
      } catch (error) {
        return refused(error);
      }
    })
    // Each artifact with whose move it is (artifact_list).
    .get(
      "/api/instances/:id/artifacts/status",
      { query: t.Object({ waiting: t.Optional(t.BooleanString()) }) },
      ({ params, query }) => {
        try {
          return artifacts.status(params.id, query.waiting === true);
        } catch (error) {
          return refused(error);
        }
      }
    )
    .post(
      "/api/instances/:id/artifacts",
      {
        body: t.Object({
          kind: t.Union([
            t.Literal("page"),
            t.Literal("component"),
            t.Literal("preview"),
            t.Literal("canvas"),
            // Shipped apps' generated client still lists it (the wire guard): refused with the new shape.
            t.Literal("sheet"),
          ]),
          ...canvasFields,
          elements: t.Optional(skeletons),
          mermaid: t.Optional(mermaid),
          name: t.String({ pattern: ARTIFACT_NAME.source }),
          html: t.Optional(t.String({ minLength: 1, maxLength: PAGE_LIMIT })),
          program: t.Optional(
            t.String({ minLength: 1, maxLength: PROGRAM_MAX })
          ),
          file: t.Optional(
            t.Union([
              statesFile,
              t.Array(statesFile, {
                minItems: 1,
                maxItems: CANVAS_SPEC_LIMITS.files,
              }),
            ])
          ),
          dir: t.Optional(
            t.String({ minLength: 2, maxLength: 4096, pattern: "^/" })
          ),
          port: t.Optional(t.Integer({ minimum: 1, maximum: 65_535 })),
          path: t.Optional(
            t.String({ maxLength: 2000, pattern: PREVIEW_START_PATH.source })
          ),
          machine: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
          workspace: t.Optional(t.String({ pattern: WORKSPACE_ID.source })),
          serve: t.Optional(
            t.Object({
              command: t.String({
                minLength: 1,
                maxLength: SERVE_COMMAND_LIMIT,
              }),
              cwd: t.Optional(t.String({ maxLength: 1000 })),
            })
          ),
          draft: t.Optional(t.Boolean()),
          // A delegate puts it in its parent's panel.
          to: t.Optional(t.Literal("parent")),
        }),
      },
      async ({ params, body }) => {
        try {
          const { kind } = body;
          if (kind === "sheet") {
            throw new ArtifactRefusal(
              400,
              `A component's states are a component canvas now: kind "component", with about. Example: ${COMPONENT_EXAMPLE}.`
            );
          }
          if (body.draft && kind !== "canvas") {
            throw new ArtifactRefusal(400, "Only a canvas is a draft.");
          }
          return await artifacts.create(params.id, { ...body, kind });
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
          detail: t.Optional(
            t.Union([t.Literal("summary"), t.Literal("story")])
          ),
          story: t.Optional(storyName),
          // A frame: JSON { story, interaction?, scheme?, width? }.
          state: t.Optional(t.String({ maxLength: 400 })),
          render: t.Optional(t.BooleanString()),
          verify: t.Optional(t.BooleanString()),
        }),
      },
      ({ params, query }) => {
        try {
          return artifacts.read(
            params.id,
            params.artifact,
            query.since,
            query.png === true,
            {
              ...(query.detail ? { detail: query.detail } : {}),
              ...(query.story ? { story: query.story } : {}),
              ...(query.state ? { state: stateOf(query.state) } : {}),
              ...(query.render ? { render: true } : {}),
              ...(query.verify ? { verify: true } : {}),
            }
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
    // A component canvas's change by its session (artifact_update): a states file's story args or op, or the canvas's own about, edges, groups or dials.
    .patch(
      "/api/instances/:id/artifacts/:artifact/component",
      { body: t.Object({ ...sheetChange, ...canvasFields }) },
      async ({ params, body }) => {
        try {
          const { about, edges, group, dials, args, story } = body;
          const canvas = [about, edges, group, dials].some(
            (one) => one !== undefined
          );
          if (canvas && (args !== undefined || story !== undefined)) {
            throw new ArtifactRefusal(
              400,
              "about, edges, group and dials change the canvas itself: send them apart from a states file's args or story."
            );
          }
          return canvas
            ? await artifacts.canvasUpdate(params.id, params.artifact, {
                about,
                edges,
                group,
                dials,
              })
            : await artifacts.sheetUpdate(
                params.id,
                params.artifact,
                sheetChangeOf({ args, story })
              );
        } catch (error) {
          return refused(error);
        }
      }
    )
    // A decision page's revision (artifact_update's statements): merged into its program by name; what changed.
    .post(
      "/api/instances/:id/artifacts/:artifact/statements",
      {
        body: t.Object({
          statements: t.String({ minLength: 1, maxLength: PROGRAM_MAX }),
        }),
      },
      async ({ params, body }) => {
        try {
          return await artifacts.revise(
            params.id,
            params.artifact,
            body.statements
          );
        } catch (error) {
          return refused(error);
        }
      }
    )
    // The person's Save in a sheet's inspector, or its story buttons: written by the stage, told to the session.
    .post(
      "/api/instances/:id/artifacts/:artifact/sheet",
      { body: t.Object(sheetChange) },
      async ({ params, body }) => {
        try {
          return await artifacts.sheetWrite(
            params.id,
            params.artifact,
            sheetChangeOf(body)
          );
        } catch (error) {
          return refused(error);
        }
      }
    )
    // A component canvas's map for its panel: its component, what renders it and what it renders.
    .get("/api/instances/:id/artifacts/:artifact/map", async ({ params }) => {
      try {
        return await artifacts.mapOf(params.id, params.artifact);
      } catch (error) {
        return refused(error);
      }
    })
    // The panel's Verify: a design system round on a component canvas, its verdict to the canvas's session.
    .post(
      "/api/instances/:id/artifacts/:artifact/verify",
      async ({ params }) => {
        try {
          return {
            verify: await artifacts.verifyFor(params.id, params.artifact),
          };
        } catch (error) {
          return refused(error);
        }
      }
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
      async ({ params, query }) => {
        try {
          return await artifacts.designMap(params.id, {
            ...(query.dir ? { dir: query.dir } : {}),
            ...(query.query ? { query: query.query } : {}),
            ...(query.component ? { component: query.component } : {}),
            ...(query.limit ? { limit: query.limit } : {}),
            ...(query.cursor ? { cursor: query.cursor } : {}),
            ...(query.response_format === "detailed" ? { detailed: true } : {}),
          });
        } catch (error) {
          return refused(error);
        }
      }
    )
    // Removes the artifact (the panel's Remove; artifact_delete with by=agent).
    // The panel that showed it shows the next newest after the person's
    // Remove, what the person had before after the agent's, or nothing.
    .delete(
      "/api/instances/:id/artifacts/:artifact",
      { query: handQuery },
      async ({ params, query }) => {
        try {
          return await artifacts.remove(
            params.id,
            params.artifact,
            query.by ?? "person"
          );
        } catch (error) {
          return refused(error);
        }
      }
    )
    // The person's pins on the session's artifacts, with their threads (comment_read).
    .get(
      "/api/instances/:id/artifacts/comments",
      {
        query: t.Object({
          artifact: t.Optional(t.String({ pattern: "^[0-9a-f-]{36}$" })),
          filter: t.Optional(
            t.Union([
              t.Literal("open"),
              t.Literal("resolved"),
              t.Literal("all"),
            ])
          ),
          since: t.Optional(t.String({ maxLength: 40 })),
          // The session itself reads them (its comment_read tool): what it reads counts as heard.
          reader: t.Optional(t.Literal("session")),
        }),
      },
      ({ params, query }) => {
        try {
          return artifacts.commentRead(params.id, {
            artifact: query.artifact,
            filter: query.filter ?? "open",
            since: query.since,
            bySession: query.reader === "session",
          });
        } catch (error) {
          return refused(error);
        }
      }
    )
    // The agent answers a pin in its thread (comment_reply).
    .post(
      "/api/instances/:id/artifacts/comments/:pin/reply",
      {
        body: t.Object({
          text: t.String({ minLength: 1, maxLength: COMMENT_LIMITS.text }),
          files: t.Optional(
            t.Array(
              t.String({ minLength: 1, maxLength: COMMENT_LIMITS.file }),
              { maxItems: COMMENT_LIMITS.files }
            )
          ),
        }),
      },
      ({ params, body }) => {
        try {
          return artifacts.commentReply(
            params.id,
            params.pin,
            body.text,
            body.files
          );
        } catch (error) {
          return refused(error);
        }
      }
    )
    // The agent resolves a pin (comment_resolve).
    .post(
      "/api/instances/:id/artifacts/comments/:pin/resolve",
      {
        body: t.Object({
          text: t.Optional(
            t.String({ minLength: 1, maxLength: COMMENT_LIMITS.text })
          ),
        }),
      },
      ({ params, body }) => {
        try {
          return artifacts.commentResolve(params.id, params.pin, body.text);
        } catch (error) {
          return refused(error);
        }
      }
    )
    // Whether a view has it on screen within 10 s, or why not; 503 when its
    // server could not start. The person's show unless by=agent (artifact_show).
    .post(
      "/api/instances/:id/artifacts/:artifact/show",
      { query: handQuery },
      async ({ params, query }) => {
        try {
          return await artifacts.show(
            params.id,
            params.artifact,
            query.by ?? "person"
          );
        } catch (error) {
          return refused(error);
        }
      }
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
          error: t.Optional(
            t.Union(SHOWN_FAILURES.map((failure) => t.Literal(failure)))
          ),
        }),
      },
      ({ params, body }) => {
        try {
          return artifacts.shown(params.id, params.artifact, body);
        } catch (error) {
          return refused(error);
        }
      }
    )
    // The artifact's doc as a person's view reads it (the app's panel): its
    // picks and their send. No read of the session's, and it never wakes a stage.
    .get("/api/instances/:id/artifacts/:artifact/view", ({ params }) => {
      try {
        return artifacts.viewOf(params.id, params.artifact);
      } catch (error) {
        return refused(error);
      }
    })
    // The artifact into its project's folder at artifacts/<name>/, one commit (artifact_promote).
    .post(
      "/api/instances/:id/artifacts/:artifact/promote",
      async ({ params }) => {
        try {
          return await artifacts.promote(params.id, params.artifact);
        } catch (error) {
          return refused(error);
        }
      }
    )
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
