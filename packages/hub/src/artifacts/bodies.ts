/**
 * What the artifact routes take in their bodies, and the words a malformed one
 * is refused with (design graph G3). The routes validate with them, and a
 * session's artifact tools check what they call with the same schemas
 * (calls.ts), so a call is held to the shape whichever door it comes by.
 */

import {
  ARTIFACT_DOES,
  ARTIFACT_NAME,
  ARTIFACT_PICKS,
  MADE_ARTIFACT_KINDS,
} from "@cawco/core/artifact-kinds";
import { SKELETON_TYPES } from "@cawco/core/canvas";
import { COMMENT_LIMITS } from "@cawco/core/comments/model";
import { PREVIEW_START_PATH } from "@cawco/core/preview/protocol";
import {
  DESIGN_MARKS,
  STATES_ENTRY,
  STORY_NAME,
  STORY_REF,
} from "@cawco/core/stage";
import { t } from "elysia";
import { PAGE_LIMIT } from "../decision-page";
import { PROGRAM_MAX } from "../decision-program";
import { CREATE_SHAPE } from "./component";
import { WORKSPACE_ID } from "./tools";

/** A canvas's skeleton elements: a type, an optional id, and Excalidraw's own fields. */
const skeletons = t.Array(
  t.Object(
    {
      type: t.UnionEnum(SKELETON_TYPES),
      id: t.Optional(t.String({ minLength: 1 })),
    },
    { additionalProperties: true }
  ),
  { minItems: 1 }
);

const mermaid = t.String({
  minLength: 1,
});

const pointer = t.String();

/** One RFC 6902 operation, as rfc6902's `Operation` takes it: `from` on a move or copy, `value` on an add, replace or test. */
const operation = t.Union([
  t.Object({
    op: t.Union([t.Literal("add"), t.Literal("replace"), t.Literal("test")]),
    path: pointer,
    value: t.Unknown(),
  }),
  t.Object({ op: t.Literal("remove"), path: pointer }),
  t.Object({
    op: t.Union([t.Literal("move"), t.Literal("copy")]),
    from: pointer,
    path: pointer,
  }),
]);

const storyName = t.String({ pattern: STORY_NAME.source });
/** A story a write or a read names in any states file of the design graph: `Story`, or `file:Story`. */
const storyNamed = t.String({ pattern: STORY_REF.source });
const argValues = t.Record(t.String({ minLength: 1 }), t.Unknown());

/** A states file, from the clone's root or absolute; on the person's graph `file:Story`, naming its live story (core `STATES_ENTRY`). */
const statesFile = t.String({
  minLength: 1,
  pattern: STATES_ENTRY.source,
});

/** A story on a canvas: `Story`, or `file:Story` across sections. */
const storyRef = t.String({ minLength: 1 });

/** What the person does on an artifact, and its one line in the panel's head. */
const doesField = t.UnionEnum(ARTIFACT_DOES);
const askField = t.String({ minLength: 1 });
/** Where the person makes the pick it opens (core `ARTIFACT_PICKS`). */
const pickField = t.UnionEnum(ARTIFACT_PICKS);
const titleField = t.String({ minLength: 1 });

/** A direction's name and its one line on what it tries. */
const directionWords = {
  name: t.String({ minLength: 1 }),
  line: t.String({
    minLength: 1,
  }),
};

/** A folder on the session's machine, absolute. */
// @limit external: Linux PATH_MAX, 4,096 bytes (limits.h)
const folderField = t.String({
  /* @limit external: Linux PATH_MAX, 4,096 bytes (limits.h); an absolute path is at least "/" and one character, 2 */ minLength: 2,
  /* @limit external: Linux PATH_MAX, 4,096 bytes (limits.h) */ maxLength: 4096,
  pattern: "^/",
});

/** A page's whole document. */
const htmlField = t.String({ minLength: 1, maxLength: PAGE_LIMIT });

/** A design's directions: each its states file, or (a design folder's) its page, `html` or a `dir` (component.ts `designPartsOf`). */
const designDirections = t.Optional(
  t.Array(
    t.Object({
      file: t.Optional(statesFile),
      html: t.Optional(htmlField),
      dir: t.Optional(folderField),
      ...directionWords,
    })
  )
);

/** What a design folder holds, as its agent marks it (core `DESIGN_MARKS`). */
const designMark = t.Optional(t.UnionEnum(DESIGN_MARKS));

/** A design graph's edges, groups, dials and directions (core `CanvasSpec`), as create and update take them. */
const canvasFields = {
  directions: t.Optional(
    t.Array(t.Object({ file: statesFile, ...directionWords }))
  ),
  edges: t.Optional(
    t.Array(
      t.Object({
        from: storyRef,
        to: storyRef,
        label: t.Optional(t.String()),
      })
    )
  ),
  group: t.Optional(t.Record(storyRef, storyRef)),
  dials: t.Optional(
    t.Array(
      t.Object({
        name: t.String({
          minLength: 1,
          pattern: "^[A-Za-z][\\w-]*$",
        }),
        label: t.Optional(t.String()),
        kind: t.Union([
          t.Literal("number"),
          t.Literal("color"),
          t.Literal("select"),
          t.Literal("toggle"),
          t.Literal("text"),
          t.Literal("action"),
        ]),
        group: t.Optional(t.String()),
        min: t.Optional(t.Number()),
        max: t.Optional(t.Number()),
        step: t.Optional(t.Number({ exclusiveMinimum: 0 })),
        unit: t.Optional(t.String()),
        options: t.Optional(t.Array(t.String())),
        target: t.Union([
          t.Object({
            cssVar: t.String({ pattern: "^--[\\w-]+$" }),
          }),
          t.Object({ arg: t.String({ minLength: 1 }) }),
        ]),
      })
    )
  ),
};

/** What a malformed body was refused for, in the tool's words with its valid shape: never the validator's own text (design graph G3). */
export const SHAPES = {
  create: CREATE_SHAPE,
  update:
    "artifact_update takes id and one change: html or patch (a page); elements, delete or mermaid (a canvas); dir (a folder preview, its files read again); args { story, values, unset? } or story { add, args? } | { duplicate, as } | { remove } | { move, before } (a design graph's states file); or edges, group, dials, directions (the canvas itself); or ask or title (any kind's head), and pick (where a design graph's or decision page's pick is made). Example: { id, args: { story: \"Waiting\", values: { status: \"waiting\" } } }.",
  read: 'artifact_read takes id?, since?, png?, width?, save?: a .png path, detail ("summary" | "story"), story, state: a component\'s { story: "Story" or, where two states files export it, "file:Story", interaction?: "rest" | "hover" | "focus" | "pressed", scheme?: "light" | "dark", width? } or a preview\'s or page\'s "?query" or "#hash", render, layout (a component frame\'s alignment guides; needs state), measure (one move on a component\'s state.story: { play: true }, or { press: "click" | "hover" | "type" | "key", on: { role, name? } | { text } | { testId } | { selector }, text?, key? }, with repeats?: 7 to 40 and speed?: "slowed" | "machine"). Example: { id, state: { story: "Waiting", interaction: "hover" } }; { id, state: "?__state=pairing:asking", save: "$TMPDIR/outputs/asking.png" }; { id, state: { story: "Approved" }, measure: { play: true } }.',
  map: `design_map takes dir?, query?, component?, limit? (a page's size; all when left out), cursor?, response_format? ("concise" | "detailed"). Example: { dir: "src/lib", query: "card" }.`,
};

/** A sheet's change (core `SheetWrite` less its file): one story's args, or one story op. */
const sheetChange = {
  args: t.Optional(
    t.Object({
      story: storyNamed,
      values: argValues,
      unset: t.Optional(t.Array(t.String({ minLength: 1 }))),
    })
  ),
  story: t.Optional(
    t.Union([
      t.Object({ add: storyNamed, args: t.Optional(argValues) }),
      t.Object({ duplicate: storyNamed, as: storyName }),
      t.Object({ remove: storyNamed }),
      t.Object({ move: storyNamed, before: t.Union([storyName, t.Null()]) }),
    ])
  ),
};

/** A create's body: a kind, its words and what it is made of. */
export const createBody = t.Object({
  // "sheet" is no kind since migration 0255: shipped apps' generated client still lists it (the wire guard), refused with the new shape.
  kind: t.UnionEnum([...MADE_ARTIFACT_KINDS, "sheet"]),
  // Every create names all three but the person's own composer canvas (draft), which shipped apps make without them: refused with the tool's shape when missing (service.ts `askedOf`).
  does: t.Optional(doesField),
  ask: t.Optional(askField),
  title: t.Optional(titleField),
  pick: t.Optional(pickField),
  ...canvasFields,
  directions: designDirections,
  elements: t.Optional(skeletons),
  mermaid: t.Optional(mermaid),
  name: t.String({ pattern: ARTIFACT_NAME.source }),
  html: t.Optional(htmlField),
  program: t.Optional(t.String({ minLength: 1, maxLength: PROGRAM_MAX })),
  file: t.Optional(t.Union([statesFile, t.Array(statesFile, { minItems: 1 })])),
  dir: t.Optional(folderField),
  content: designMark,
  // @limit external: a TCP port is 16 bits, 1 to 65,535 (RFC 9293 §3.1)
  port: t.Optional(t.Integer({ minimum: 1, maximum: 65_535 })),
  path: t.Optional(t.String({ pattern: PREVIEW_START_PATH.source })),
  machine: t.Optional(t.String({ minLength: 1 })),
  workspace: t.Optional(t.String({ pattern: WORKSPACE_ID.source })),
  serve: t.Optional(
    t.Object({
      command: t.String({
        minLength: 1,
      }),
      cwd: t.Optional(t.String()),
    })
  ),
  draft: t.Optional(t.Boolean()),
  reading: t.Optional(t.Boolean()),
});

/** A page's, a canvas's or a folder preview's change: one of html, patch, elements, delete, mermaid or dir. */
export const updateBody = t.Object({
  dir: t.Optional(folderField),
  html: t.Optional(t.String({ minLength: 1, maxLength: PAGE_LIMIT })),
  patch: t.Optional(t.Array(operation, { minItems: 1 })),
  elements: t.Optional(skeletons),
  delete: t.Optional(
    t.Array(t.String({ minLength: 1 }), {
      minItems: 1,
    })
  ),
  mermaid: t.Optional(mermaid),
});

/** A design graph's change: a states file's story args or op, the canvas's own edges, groups, dials or directions, or (a design folder's) its html, dir or each direction's. */
export const componentBody = t.Object({
  ...sheetChange,
  ...canvasFields,
  directions: designDirections,
  html: t.Optional(htmlField),
  dir: t.Optional(folderField),
  content: designMark,
});

/** Any kind's head line. */
export const askBody = t.Object({ ask: askField });

/** Any kind's title. */
export const titleBody = t.Object({ title: titleField });

/** Where a design graph's or a decision page's pick is made. */
export const pickBody = t.Object({ pick: pickField });

/** A card settled for the person. */
export const settleBody = t.Object({
  card: t.String({ minLength: 1 }),
  option: t.String({ minLength: 1 }),
  why: t.String({ minLength: 1 }),
  sources: t.Array(t.String({ minLength: 1 })),
});

/** A pick recorded for the person from his own words: his pin on the page or a message he typed, quoted. */
export const citeBody = t.Object({
  card: t.String({ minLength: 1 }),
  options: t.Array(t.String({ minLength: 1 }), { minItems: 1 }),
  // @limit external: minLength 6 is a handle's shortest form (handles.ts), maxLength 36 a UUID's length
  pin: t.Optional(t.String({ minLength: 6, maxLength: 36 })),
  message: t.Optional(t.String({ minLength: 1 })),
  quote: t.String({ minLength: 1 }),
});

/** `question_close`: taken from the person's answer, or withdrawn. */
export const closeQuestionBody = t.Object({
  question: t.String({ minLength: 1 }),
  as: t.Union([t.Literal("taken"), t.Literal("withdrawn")]),
  why: t.String({ minLength: 1 }),
});

/** A decision page's revision: statements merged into its program by name. */
export const statementsBody = t.Object({
  statements: t.String({ minLength: 1, maxLength: PROGRAM_MAX }),
});

/** A question to the person, in the shape `ask` takes (ask-fields.ts `QUESTION_FIELDS`). */
const QUESTION_BODY = t.Object({
  questions: t.Array(
    t.Object({
      header: t.String(),
      multiSelect: t.Boolean(),
      options: t.Array(
        t.Object({ label: t.String(), description: t.String() })
      ),
      question: t.String(),
    }),
    { minItems: 1 }
  ),
  blocks: t.Boolean(),
  waiting: t.Optional(t.String({ minLength: 1 })),
  meanwhile: t.Optional(t.String({ minLength: 1 })),
  task: t.Optional(t.String({ pattern: "^tsk-\\d+$" })),
});

/** An agent's answer to a pin. */
export const replyBody = t.Object({
  text: t.String({ minLength: 1 }),
  files: t.Optional(
    t.Array(t.String({ minLength: 1, maxLength: COMMENT_LIMITS.file }))
  ),
  question: t.Optional(QUESTION_BODY),
});

/** An agent's resolve of a pin, with an optional last line. */
export const resolveBody = t.Object({
  text: t.Optional(t.String({ minLength: 1 })),
});

/** A sheet's write by the person: one story's args or one story op. */
export const sheetBody = t.Object(sheetChange);

/** The fields of an artifact read's query that a bound or a pattern holds (its numbers and flags are held by their types). */
export const readFields = t.Object({
  story: t.Optional(storyNamed),
  // JSON: a frame { story, interaction?, scheme?, width? }, or a state link's "?query" or "#hash".
  state: t.Optional(t.String()),
  // Where the picture is kept in the session's workspace.
  save: t.Optional(t.String({ minLength: 1 })),
});

/** The fields of a read of the person's pins. */
export const commentsFields = {
  // Its id, or (the session's comment_read) its name or handle.
  artifact: t.Optional(t.String({ minLength: 1 })),
  filter: t.Optional(
    t.Union([t.Literal("open"), t.Literal("resolved"), t.Literal("all")])
  ),
  since: t.Optional(t.String()),
};
