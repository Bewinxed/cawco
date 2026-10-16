/**
 * The artifact tools' names, words and inputs (Projects spec §5.10), and
 * the three for the person's pins and their threads (§5.7),
 * written for the agent that reads them: one trigger per branch, every field
 * bounded, answers that say only what the hub stored. Their handlers call
 * the artifact routes (delegation-actions.ts).
 */
import { ARTIFACT_NAME, PREVIEW_START_PATH } from "@cawco/core";
import { CANVAS_LIMITS, SKELETON_TYPES } from "@cawco/core/canvas";
import { COMMENT_LIMITS } from "@cawco/core/comments";
import { SERVE_COMMAND_LIMIT, STORY_FILE } from "@cawco/core/stage";
import { z } from "zod";
import { PAGE_LIMIT } from "../decision-page";

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
  "components_list",
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

const mermaid = z
  .string()
  .min(1)
  .max(CANVAS_LIMITS.mermaid)
  .optional()
  .describe('Mermaid, like "flowchart LR; A --> B".');

export const artifactCreate = {
  name: "artifact_create",
  description:
    "Make an artifact and open it in your panel. A page is `html`, or `dir` " +
    "holding a decision page's page.html (decision-page skill); in a project, neither builds decisions/<name>/page.html " +
    "from its folder. A sheet is a component's states: `file`, a CSF 3 story file beside the real component " +
    "(`export default { component, args }`, a named export per state), run on your workspace's Vite. " +
    "A preview is a whole app: a folder (`dir`) or a server on `port`; in a workspace `serve` is its command, which " +
    "CawCo runs there with PORT and keeps up (never start it yourself). Options to pick between: " +
    "design-explore skill first. A canvas is `elements` or `mermaid`, " +
    "or empty for the person. The same kind and name again replaces it, picks kept. " +
    "Answers its id and `opened` (false: `why`).",
  input: {
    kind: z.enum(["page", "sheet", "preview", "canvas"]),
    name: z
      .string()
      .regex(ARTIFACT_NAME)
      .describe("Lowercase letters, digits and dashes, like onboarding."),
    html: z.string().min(1).max(PAGE_LIMIT).optional(),
    file: z
      .string()
      .min(1)
      .max(1000)
      .regex(STORY_FILE)
      .optional()
      .describe("From your clone's root."),
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

export const artifactUpdate = {
  name: "artifact_update",
  description:
    "Change one of your artifacts in place. `html` replaces a page without a reload; picks, fields, focus and " +
    "scroll stay. `patch` is a " +
    'JSON Patch (RFC 6902) over its state, keyed by choice id or field name, like [{"op":"replace","path":"/hero/options","value":["b"]}]; ' +
    "all of it applies or none. Answers the state after the change. A canvas takes `elements` (added, or replacing " +
    'the one of the id given), `delete` (ids) or `mermaid` (added below); it answers its outline and "<id> changed ' +
    "under you\" for what you replaced that the person changed since your last read. A sheet's `args` sets a " +
    "story's values, its `story` adds, duplicates, removes or moves one; each answers the lines it wrote.",
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
    html: z.string().min(1).max(PAGE_LIMIT).optional(),
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
    "Read the person's picks, notes and values on one of your artifacts, each with the page hash it was made on. " +
    "`since` (the `seq` of your last read) returns only what changed after it. No id: your newest. " +
    "When the person sends picks, you are told the `since` to read from. A canvas answers " +
    "its outline (a line per element; the person's pen strokes as ink over the ids they cross) and `changed`, what " +
    "the person changed since `since` or your last read; `png: true` adds its picture. A sheet adds " +
    "`sheet` (stories, args, props) and its stage's `status` and `errors`; its picks are stories; a served preview, its server's `stage`.",
  input: {
    id: id.optional(),
    since: z.number().int().min(0).optional(),
    png: z.boolean().optional(),
  },
};

export const artifactList = {
  name: "artifact_list",
  description:
    "Your artifacts (a lead: its project's too), newest first: shown, opened, open pins, unread changes, " +
    "picks, and `waitingOn` person or session. `waiting: true` keeps those waiting on someone.",
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

export const componentsList = {
  name: "components_list",
  description:
    "Your workspace's components a sheet can show, and each one's story files.",
  input: {
    dir: z
      .string()
      .optional()
      .describe("Only under this folder of your clone."),
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
