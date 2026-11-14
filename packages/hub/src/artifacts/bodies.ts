/**
 * What the artifact routes take in their bodies, and the words a malformed one
 * is refused with (component canvas G3). The routes validate with them, and a
 * session's artifact tools check what they call with the same schemas
 * (calls.ts), so a call is held to the shape whichever door it comes by.
 */

import {
  ARTIFACT_DOES,
  ARTIFACT_NAME,
  ARTIFACT_TITLE_LIMIT,
  ASK_LIMIT,
} from "@cawco/core/artifact-kinds";
import { CANVAS_LIMITS, SKELETON_TYPES } from "@cawco/core/canvas";
import { CHOICE_LIMITS } from "@cawco/core/choices";
import { COMMENT_LIMITS } from "@cawco/core/comments/model";
import { PREVIEW_START_PATH } from "@cawco/core/preview/protocol";
import {
  CANVAS_SPEC_LIMITS,
  DESIGN_MAP_LIMITS,
  SERVE_COMMAND_LIMIT,
  STORY_FILE,
  STORY_NAME,
} from "@cawco/core/stage";
import { t } from "elysia";
import { PAGE_LIMIT } from "../decision-page";
import { PROGRAM_MAX } from "../decision-program";
import { CREATE_SHAPE } from "./component";
import { ARGS_LIMIT, WORKSPACE_ID } from "./tools";

/** A canvas's skeleton elements: a type, an optional id, and Excalidraw's own fields. */
const skeletons = t.Array(
  t.Object(
    {
      type: t.UnionEnum(SKELETON_TYPES),
      id: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
    },
    { additionalProperties: true }
  ),
  { minItems: 1, maxItems: CANVAS_LIMITS.elementsPerCall }
);

const mermaid = t.String({
  minLength: 1,
  maxLength: CANVAS_LIMITS.mermaid,
});

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

/** What the person does on an artifact, and its one line in the panel's head. */
const doesField = t.UnionEnum(ARTIFACT_DOES);
const askField = t.String({ minLength: 1, maxLength: ASK_LIMIT });
const titleField = t.String({
  minLength: 1,
  maxLength: ARTIFACT_TITLE_LIMIT,
});

/** A component canvas's edges, groups and dials (core `CanvasSpec`), as create and update take them. */
const canvasFields = {
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
  group: t.Optional(t.Record(storyRef, storyRef)),
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
          t.Literal("text"),
          t.Literal("action"),
        ]),
        group: t.Optional(t.String({ maxLength: CANVAS_SPEC_LIMITS.label })),
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
export const SHAPES = {
  create: CREATE_SHAPE,
  update:
    'artifact_update takes id and one change: html or patch (a page); elements, delete or mermaid (a canvas); args { story, values, unset? } or story { add, args? } | { duplicate, as } | { remove } | { move, before } (a component canvas\'s states file); or edges, group, dials (the canvas itself); or ask or title (any kind\'s head). Example: { id, args: { story: "Waiting", values: { status: "waiting" } } }.',
  read: 'artifact_read takes id?, since?, png?, width?, save?: a .png path, detail ("summary" | "story"), story, state: a component\'s { story: "Story" or, where two states files export it, "file:Story", interaction?: "rest" | "hover" | "focus" | "pressed", scheme?: "light" | "dark", width? } or a preview\'s or page\'s "?query" or "#hash", render. Example: { id, state: { story: "Waiting", interaction: "hover" } }; { id, state: "?__state=pairing:asking", save: "$TMPDIR/outputs/asking.png" }.',
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

/** A create's body: a kind, its words and what it is made of. */
export const createBody = t.Object({
  kind: t.Union([
    t.Literal("page"),
    t.Literal("component"),
    t.Literal("preview"),
    t.Literal("canvas"),
    // Shipped apps' generated client still lists it (the wire guard): refused with the new shape.
    t.Literal("sheet"),
  ]),
  // Every create names all three but the person's own composer canvas (draft), which shipped apps make without them: refused with the tool's shape when missing (service.ts `askedOf`).
  does: t.Optional(doesField),
  ask: t.Optional(askField),
  title: t.Optional(titleField),
  ...canvasFields,
  elements: t.Optional(skeletons),
  mermaid: t.Optional(mermaid),
  name: t.String({ pattern: ARTIFACT_NAME.source }),
  html: t.Optional(t.String({ minLength: 1, maxLength: PAGE_LIMIT })),
  program: t.Optional(t.String({ minLength: 1, maxLength: PROGRAM_MAX })),
  file: t.Optional(
    t.Union([
      statesFile,
      t.Array(statesFile, {
        minItems: 1,
        maxItems: CANVAS_SPEC_LIMITS.files,
      }),
    ])
  ),
  dir: t.Optional(t.String({ minLength: 2, maxLength: 4096, pattern: "^/" })),
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
  // A delegate hands it to its parent, unopened.
  to: t.Optional(t.Literal("parent")),
});

/** A page's or a canvas's change: one of html, patch, elements, delete or mermaid. */
export const updateBody = t.Object({
  html: t.Optional(t.String({ minLength: 1, maxLength: PAGE_LIMIT })),
  patch: t.Optional(t.Array(operation, { minItems: 1 })),
  elements: t.Optional(skeletons),
  delete: t.Optional(
    t.Array(t.String({ minLength: 1, maxLength: 100 }), {
      minItems: 1,
      maxItems: CANVAS_LIMITS.deletePerCall,
    })
  ),
  mermaid: t.Optional(mermaid),
});

/** A component canvas's change: a states file's story args or op, or the canvas's own edges, groups or dials. */
export const componentBody = t.Object({ ...sheetChange, ...canvasFields });

/** Any kind's head line. */
export const askBody = t.Object({ ask: askField });

/** Any kind's title. */
export const titleBody = t.Object({ title: titleField });

/** A card settled for the person. */
export const settleBody = t.Object({
  card: t.String({ minLength: 1, maxLength: CHOICE_LIMITS.id }),
  option: t.String({ minLength: 1, maxLength: CHOICE_LIMITS.option }),
  why: t.String({ minLength: 1, maxLength: CHOICE_LIMITS.why }),
  sources: t.Array(
    t.String({ minLength: 1, maxLength: CHOICE_LIMITS.source }),
    { maxItems: CHOICE_LIMITS.sources }
  ),
});

/** `question_close`: taken from the person's answer, or withdrawn. */
export const closeQuestionBody = t.Object({
  question: t.String({ minLength: 1, maxLength: 400 }),
  as: t.Union([t.Literal("taken"), t.Literal("withdrawn")]),
  why: t.String({ minLength: 1, maxLength: CHOICE_LIMITS.why }),
});

/** A decision page's revision: statements merged into its program by name. */
export const statementsBody = t.Object({
  statements: t.String({ minLength: 1, maxLength: PROGRAM_MAX }),
});

/** An agent's answer to a pin. */
export const replyBody = t.Object({
  text: t.String({ minLength: 1, maxLength: COMMENT_LIMITS.text }),
  files: t.Optional(
    t.Array(t.String({ minLength: 1, maxLength: COMMENT_LIMITS.file }))
  ),
  asks: t.Optional(t.Boolean()),
});

/** An agent's resolve of a pin, with an optional last line. */
export const resolveBody = t.Object({
  text: t.Optional(t.String({ minLength: 1, maxLength: COMMENT_LIMITS.text })),
});

/** A sheet's write by the person: one story's args or one story op. */
export const sheetBody = t.Object(sheetChange);

/** The fields of an artifact read's query that a bound or a pattern holds (its numbers and flags are held by their types). */
export const readFields = t.Object({
  story: t.Optional(storyName),
  // JSON: a frame { story, interaction?, scheme?, width? }, or a state link's "?query" or "#hash".
  state: t.Optional(t.String({ maxLength: 1400 })),
  // Where the picture is kept in the session's workspace.
  save: t.Optional(t.String({ minLength: 1, maxLength: 1000 })),
});

/** The fields of a read of the person's pins. */
export const commentsFields = {
  // Its id, or (the session's comment_read) its name or handle.
  artifact: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
  filter: t.Optional(
    t.Union([t.Literal("open"), t.Literal("resolved"), t.Literal("all")])
  ),
  since: t.Optional(t.String({ maxLength: 40 })),
};
