/**
 * The artifact tools' names, words and inputs (Projects spec §5.10), and
 * the three for the person's pins and their threads (§5.7),
 * written for the agent that reads them: one trigger per branch, every field
 * bounded, answers that say only what the hub stored. Their handlers call
 * the artifact routes (delegation-actions.ts).
 */
import {
  ARTIFACT_DOES,
  ARTIFACT_NAME,
  ASK_LIMIT,
  PREVIEW_START_PATH,
} from "@cawco/core";
import { CANVAS_LIMITS, SKELETON_TYPES } from "@cawco/core/canvas";
import { COMMENT_LIMITS } from "@cawco/core/comments";
import {
  CANVAS_SPEC_LIMITS,
  DESIGN_MAP_LIMITS,
  SERVE_COMMAND_LIMIT,
  STORY_FILE,
} from "@cawco/core/stage";
import { z } from "zod";
import { PAGE_LIMIT } from "../decision-page";
import { PROGRAM_MAX } from "../decision-program";

/** A workspace id, or the 8-character prefix delegate reports. */
export const WORKSPACE_ID = /^[0-9a-f][0-9a-f-]{7,35}$/;

/** Patch operations one update may hold. Our bound. */
export const PATCH_LIMIT = 200;

export const ARTIFACT_TOOLS = [
  "artifact_list",
  "artifact_create",
  "artifact_update",
  "artifact_read",
  "artifact_show",
  "artifact_promote",
  "artifact_delete",
  "comment_read",
  "comment_reply",
  "comment_resolve",
  "design_map",
] as const;

/** A story's export name in a CSF file: `Roomy`. */
export const STORY_NAME = /^[A-Z][A-Za-z0-9_]{0,99}$/;
/** Args one write may set. Our bound: a component's props. */
export const ARGS_LIMIT = 100;

/** A story's name in a tool's input: its pattern is the route's and the stage's to check, which say why. */
const story = z.string();
const argValues = z.record(z.string(), z.unknown());

const id = z
  .string()
  .regex(/^[0-9a-f-]{36}$/)
  .describe("Its id, from artifact_create.");

/** An Excalidraw element skeleton: its type, an id you choose, and Excalidraw's own fields. */
const skeleton = z.looseObject({
  type: z.enum(SKELETON_TYPES),
  id: z.string().min(1).max(100).optional(),
});

/** A canvas's skeleton elements, as create and update take them. */
const elements = z
  .array(skeleton)
  .min(1)
  .max(CANVAS_LIMITS.elementsPerCall)
  .optional()
  .describe(
    'Excalidraw skeletons, like {"type":"rectangle","id":"api","x":0,"y":0,"width":160,"height":60,"label":{"text":"API"}}; an arrow binds with "start":{"id":"api"}. Your id is the outline\'s.'
  );

/** A story on a canvas: its export, or `file:Story` across states files. */
const storyRef = z.string().min(1).max(1100);

const does = z
  .enum(ARTIFACT_DOES)
  .describe("What the person does here: pick, judge, try or draw.");
const ask = z
  .string()
  .min(1)
  .max(ASK_LIMIT)
  .describe(
    'Their one line in the panel\'s head, in their words: the act and its object, like "Pick the head for the phone project page".'
  );

/** A component canvas's edges, groups and dials, as create and update take them. */
const canvasFields = {
  edges: z
    .array(
      z.object({
        from: storyRef,
        to: storyRef,
        label: z.string().max(CANVAS_SPEC_LIMITS.label).optional(),
      })
    )
    .max(CANVAS_SPEC_LIMITS.edges)
    .optional()
    .describe(
      'Edges between frames, like [{"from":"Waiting","to":"Scanning"}].'
    ),
  group: z
    .record(storyRef, storyRef)
    .optional()
    .describe("Story → its parent story."),
  dials: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        label: z.string().max(CANVAS_SPEC_LIMITS.label).optional(),
        kind: z.enum(["number", "color", "select", "toggle"]),
        min: z.number().optional(),
        max: z.number().optional(),
        step: z.number().positive().optional(),
        unit: z.string().max(10).optional(),
        options: z.array(z.string().max(100)).max(24).optional(),
        target: z.union([
          z.object({ cssVar: z.string().regex(/^--[\w-]+$/) }),
          z.object({ arg: z.string().min(1).max(100) }),
        ]),
      })
    )
    .max(CANVAS_SPEC_LIMITS.dials)
    .optional()
    .describe(
      'The person\'s controls, like [{"name":"radius","kind":"number","max":24,"unit":"px","target":{"cssVar":"--radius"}}]; a target is a CSS variable or {"arg":…}.'
    ),
};

const mermaid = z
  .string()
  .min(1)
  .max(CANVAS_LIMITS.mermaid)
  .optional()
  .describe('Mermaid, like "flowchart LR; A --> B".');

export const artifactCreate = {
  name: "artifact_create",
  description:
    "Open something in the person's panel for them to act on. `does` says what: pick, judge, try or draw; `ask` " +
    "says it in one line in their words, which heads the panel while it loads and until they act. The `show` skill " +
    "chooses both and the kind before you build. A pick is a page with `program` (decision-page skill). A judgement " +
    "is a component canvas: `file`, its CSF 3 states file, every story drawn live (component-canvas skill); or a " +
    "preview or page when the whole surface is judged. A try is a preview at `path`: a server on `port` (in a " +
    "workspace `serve` is its command, which CawCo runs there with PORT and keeps up) or a folder (`dir`). A drawing " +
    "is a canvas: `elements`, `mermaid`, or empty. A page is also `html`, or `dir` holding page.oui or page.html. " +
    "Proof, references, a plan or finished work go in your words, not here. The same kind and name again replaces " +
    "it, picks kept. Answers its id and `opened` (false: `why`); a folder preview its `weight`; a component each " +
    "frame as drawn.",
  input: {
    kind: z.enum(["page", "component", "preview", "canvas"]),
    does,
    ask,
    name: z
      .string()
      .regex(ARTIFACT_NAME)
      .describe("Lowercase letters, digits and dashes, like onboarding."),
    program: z.string().min(1).max(PROGRAM_MAX).optional(),
    html: z.string().min(1).max(PAGE_LIMIT).optional(),
    file: z
      .union([
        z.string().min(1).max(1000).regex(STORY_FILE),
        z
          .array(z.string().min(1).max(1000).regex(STORY_FILE))
          .min(1)
          .max(CANVAS_SPEC_LIMITS.files),
      ])
      .optional()
      .describe(
        "A states file from your workspace's root, else your cwd; a list for a surface of several."
      ),
    ...canvasFields,
    dir: z
      .string()
      .startsWith("/")
      .max(4096)
      .optional()
      .describe("An absolute folder on the machine."),
    port: z.number().int().min(1).max(65_535).optional(),
    path: z
      .string()
      .regex(PREVIEW_START_PATH)
      .max(2000)
      .optional()
      .describe("A preview's start page, like /settings."),
    machine: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe(
        "The machine a preview runs on; omitted, yours. With a port, that machine's host port, outside any workspace."
      ),
    workspace: z
      .string()
      .regex(WORKSPACE_ID)
      .optional()
      .describe(
        "The workspace whose server a port is: yours, or a delegate's id as delegate returned it; omitted, your own."
      ),
    serve: z
      .object({
        command: z.string().min(1).max(SERVE_COMMAND_LIMIT),
        cwd: z
          .string()
          .max(1000)
          .optional()
          .describe("From your clone's root."),
      })
      .optional(),
    elements,
    mermaid,
  },
};

/** What artifact_create adds for a session that has a parent (a delegate): `to`, and its words. */
export const artifactCreateToParent = {
  description:
    ' to: "parent" hands it to your parent unopened: they are told once per hand-off, open it in their panel with artifact_show, and get its picks and pins. ' +
    "You keep update and read; once they have opened it, your changes wait as its next version (held) until their artifact_show.",
  input: { to: z.literal("parent").optional() },
};

export const artifactUpdate = {
  name: "artifact_update",
  description:
    "Change an artifact of yours. `statements` revises a decision page's program (any of your " +
    "project's): only the statements that change, merged by name; `broken` names the picks and `after`s " +
    "it orphaned. `html` replaces a page, its picks, fields, focus and scroll kept. " +
    "`patch` is a " +
    'JSON Patch (RFC 6902) over its state, keyed by choice id or field name, like [{"op":"replace","path":"/hero/options","value":["b"]}]; ' +
    "all or none applies. Answers the state after. A canvas takes `elements` (added, or replacing " +
    'the one of the id given), `delete` (ids) or `mermaid` (added below); it answers its outline and "<id> changed ' +
    "under you\" for what you replaced that the person had changed. A component's `args` sets a " +
    "story's values, `story` adds, duplicates, removes or moves one; each answers the lines and the story's frames. " +
    "`ask` changes the head's line for any kind; `edges`, `group`, `dials` change a component canvas.",
  input: {
    id,
    elements,
    mermaid,
    args: z
      .object({
        story,
        values: argValues,
        unset: z.array(z.string()).optional(),
      })
      .optional(),
    story: z
      .object({
        add: story,
        args: argValues,
        duplicate: story,
        as: story,
        remove: story,
        move: story,
        before: story.nullable(),
      })
      .partial()
      .optional(),
    delete: z
      .array(z.string().min(1).max(100))
      .min(1)
      .max(CANVAS_LIMITS.deletePerCall)
      .optional(),
    statements: z.string().min(1).max(PROGRAM_MAX).optional(),
    html: z.string().min(1).max(PAGE_LIMIT).optional(),
    ask: ask.optional(),
    ...canvasFields,
    patch: z
      .array(
        z.object({
          op: z.enum(["add", "remove", "replace", "move", "copy", "test"]),
          path: z.string().max(1000),
          from: z.string().max(1000).optional(),
          value: z.unknown().optional(),
        })
      )
      .min(1)
      .max(PATCH_LIMIT)
      .optional(),
  },
};

export const artifactRead = {
  name: "artifact_read",
  description:
    "Read the person's picks, notes and values on an artifact (yours, your delegation tree's, your project's " +
    "pages), each with its page hash; a decision page adds its `program`. " +
    "`since` (your last read's `seq`) returns only later changes. No id: your newest. A canvas answers " +
    "its outline (a line per element; pen strokes as ink over the ids crossed) and `changed`, what " +
    "the person changed since `since` or your last read; `png: true` adds its picture. A component answers its " +
    "frames as drawn, moves, stories, the person's `dials` and `tuned`; `state` adds a frame's style delta, " +
    '`detail: "story"` a story\'s args, `render` draws it, `verify` asks the design verifier.',
  input: {
    id: id.optional(),
    since: z.number().int().min(0).optional(),
    png: z.boolean().optional(),
    detail: z.enum(["summary", "story"]).optional(),
    story: z.string().optional(),
    state: z
      .object({
        story: z.string(),
        interaction: z.enum(["rest", "hover", "focus", "pressed"]).optional(),
        scheme: z.enum(["light", "dark"]).optional(),
        width: z.number().int().positive().optional(),
      })
      .optional(),
    render: z.boolean().optional(),
    verify: z.boolean().optional(),
  },
};

export const artifactList = {
  name: "artifact_list",
  description:
    "Your artifacts and your delegation tree's (a lead: its project's too), newest first: each with `does`, `ask`, shown, opened, open pins, unread changes, picks, `sent` (Send pressed since " +
    "your last change) and `waitingOn` person or " +
    "session. `waiting: true` keeps those waiting on someone.",
  input: { waiting: z.boolean().optional() },
};

export const artifactShow = {
  name: "artifact_show",
  description:
    "Bring one of your artifacts to the front of your panel for the person to look at again. Answers " +
    "`opened` as artifact_create does.",
  input: { id },
};

export const artifactPromote = {
  name: "artifact_promote",
  description:
    "Keep an artifact worth keeping with your project: commits it to artifacts/<name>/ in the project's folder, " +
    "which outlives this session. Again later commits it as it stands then. Answers `commit` and `path`; refused " +
    "outside a project.",
  input: { id },
};

export const artifactDelete = {
  name: "artifact_delete",
  description:
    "Remove an artifact of yours a newer one superseded, once that one is up. Its picks and pins go too; a " +
    "promoted copy stays. Answers `showing`: what your panel shows now, or null.",
  input: { id },
};

export const designMap = {
  name: "design_map",
  description:
    "The project's component library: each component's states, frames drawn, what it is made of and used in. " +
    "`component` (a file) answers its card: props, stories, moves, call sites. Mount what it lists.",
  input: {
    dir: z
      .string()
      .min(1)
      .max(1000)
      .optional()
      .describe(
        "A folder from your workspace's root, like apps/web/src/lib. Omitted, the source folder."
      ),
    query: z.string().min(1).max(100).optional(),
    component: z.string().min(1).max(1000).optional(),
    limit: z.number().int().min(1).max(DESIGN_MAP_LIMITS.max).optional(),
    cursor: z.string().max(20).optional(),
    response_format: z.enum(["concise", "detailed"]).optional(),
  },
};

const pin = z
  .string()
  .regex(/^[0-9a-f-]{36}$/)
  .describe("The pin's id, from its delivery.");

export const commentRead = {
  name: "comment_read",
  description:
    "Read the person's pins on your artifacts: each numbered, its anchor (selector, file:line, text, ink box), " +
    "its thread. New ones reach you by themselves. No artifact: all of yours.",
  input: {
    artifact: id.optional(),
    filter: z.enum(["open", "resolved", "all"]).default("open"),
    since: z
      .string()
      .datetime()
      .optional()
      .describe("The `at` of your last read: only pins with something newer."),
  },
};

export const commentReply = {
  name: "comment_reply",
  description:
    "Answer a pin in its thread on the page. After a change, name the files you changed; ask a question here " +
    "and leave the pin open.",
  input: {
    pin,
    text: z.string().min(1).max(COMMENT_LIMITS.text),
    files: z
      .array(z.string().min(1).max(COMMENT_LIMITS.file))
      .max(COMMENT_LIMITS.files)
      .optional(),
  },
};

export const commentResolve = {
  name: "comment_resolve",
  description:
    "Resolve a pin once your change answers it, with a last line when it helps. The person can reopen it.",
  input: { pin, text: z.string().min(1).max(COMMENT_LIMITS.text).optional() },
};
