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

/** The longest name, handle or id an artifact tool takes. */
const ARTIFACT_REF_MAX = 100;

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
  "artifact_browse",
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
  .min(1)
  .max(ARTIFACT_REF_MAX)
  .describe("Its name, handle or id.");

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
    'Excalidraw skeletons, like {"type":"rectangle","id":"api","x":0,"y":0,"width":160,"height":60,"label":{"text":"API"}}; an arrow binds with "start":{"id":"api"}.'
  );

/** A story on a canvas: its export, or `file:Story` across states files. */
const storyRef = z.string().min(1).max(1100);

const does = z.enum(ARTIFACT_DOES);
const ask = z
  .string()
  .min(1)
  .max(ASK_LIMIT)
  .describe(
    'The act and its object in their words, like "Pick the head for the phone project page".'
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
    .describe('Like [{"from":"Waiting","to":"Scanning"}].'),
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
      'The person\'s controls, like [{"name":"radius","kind":"number","max":24,"unit":"px","target":{"cssVar":"--radius"}}].'
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
    "Open something in the person's panel for them to act on; `ask` heads the panel until they act. The `show` skill " +
    "chooses `does`, `ask` and the kind before you build. A pick is a page with `program` (decision-page skill). A judgement " +
    "is a component canvas: `file`, its CSF 3 states file, every story drawn live (component-canvas skill); or a " +
    "preview or page when the whole surface is judged. A try is a preview at `path`: a server on `port` (in a " +
    "workspace `serve` is its command, which CawCo runs there with PORT and keeps up) or a folder (`dir`). A drawing " +
    "is a canvas: `elements`, `mermaid`, or empty. A page is also `html`, or `dir` holding page.oui or page.html. " +
    "Proof, references, a plan or finished work go in your words, not here. The same kind and name again replaces " +
    "it, picks kept.",
  input: {
    kind: z.enum(["page", "component", "preview", "canvas"]),
    does,
    ask,
    name: z.string().regex(ARTIFACT_NAME).describe("Like onboarding."),
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
      .describe("From your workspace's root; a list for a surface of several."),
    ...canvasFields,
    dir: z.string().startsWith("/").max(4096).optional().describe("Absolute."),
    port: z.number().int().min(1).max(65_535).optional(),
    path: z
      .string()
      .regex(PREVIEW_START_PATH)
      .max(2000)
      .optional()
      .describe("Its start page, like /settings."),
    machine: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe("Default yours; with a port, that machine's host port."),
    workspace: z
      .string()
      .regex(WORKSPACE_ID)
      .optional()
      .describe("Whose server the port is: yours (default) or a delegate's."),
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
    ' to: "parent" hands it to your parent unopened, to open with artifact_show; once they have, your changes wait as its next version until their next artifact_show.',
  input: { to: z.literal("parent").optional() },
};

export const artifactUpdate = {
  name: "artifact_update",
  description:
    "Change an artifact of yours. `statements`: a decision page's statements that change, merged by name (any of your project's pages). " +
    "`html` replaces a page, picks kept. `patch`: JSON Patch over its state by choice id, all or none, like " +
    '[{"op":"replace","path":"/hero/options","value":["b"]}]. A canvas: `elements` (added, or replacing that id), `delete` (ids), ' +
    "`mermaid`. A component: `args` sets a story's values; `story` adds, duplicates, removes or moves one; `edges`, `group`, `dials`. " +
    "`ask` changes the head's line.",
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
    "Read the person's picks, notes and values on an artifact (yours, your delegation tree's, your project's pages): each choice " +
    "picked or not yet. `since`: the seq your last read gave. No id: your newest. A canvas: its outline and what the person changed; " +
    "`png` adds its picture. A component: its frames, moves, stories, dials and tuning; `state` adds a frame's style delta, " +
    '`detail: "story"` a story\'s args, `render` draws it now, `verify` asks the design verifier.',
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
    "Your artifacts and your delegation tree's (a lead's: its project's too), newest first, with whose move each is. `waiting: true` keeps those waiting on someone.",
  input: { waiting: z.boolean().optional() },
};

export const artifactShow = {
  name: "artifact_show",
  description:
    "Bring an artifact, yours or your delegation tree's, to the front of your panel.",
  input: { id },
};

export const artifactBrowse = {
  name: "artifact_browse",
  description:
    "Open an artifact in your own browser tool to click through it as the person would, before you report that it works. " +
    "Answers an address to load once, open for 15 minutes or until this session ends.",
  input: { id },
};

export const artifactPromote = {
  name: "artifact_promote",
  description:
    "Keep an artifact with your project: commits it to artifacts/<name>/ in the project's folder, which outlives this session.",
  input: { id },
};

export const artifactDelete = {
  name: "artifact_delete",
  description:
    "Remove an artifact of yours a newer one superseded, or one a delegate below you left once its work item ended. " +
    "Pins go too; a promoted copy stays.",
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
      .describe("From your workspace's root; default its source folder."),
    query: z.string().min(1).max(100).optional(),
    component: z.string().min(1).max(1000).optional(),
    limit: z.number().int().min(1).max(DESIGN_MAP_LIMITS.max).optional(),
    cursor: z.string().max(20).optional(),
  },
};

const pin = z.string().min(6).max(36).describe("Its handle or id.");

export const commentRead = {
  name: "comment_read",
  description:
    "Read the person's pins on your artifacts: what each stands on (selector, file:line, text), and its thread. New ones reach you by themselves. No artifact: all of yours.",
  input: {
    artifact: id.optional(),
    filter: z.enum(["open", "resolved", "all"]).default("open"),
    since: z
      .string()
      .datetime()
      .optional()
      .describe("The time your last read gave: only what is newer."),
  },
};

export const commentReply = {
  name: "comment_reply",
  description:
    "Answer a pin in its thread. After a change, name the files changed; ask here and leave it " +
    "open. Answers its link: name it by that.",
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
