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
  ARTIFACT_TITLE_LIMIT,
  ASK_LIMIT,
  MADE_ARTIFACT_KINDS,
} from "@cawco/core/artifact-kinds";
import { PICTURE_LIMITS } from "@cawco/core/artifact-picture";
import { CANVAS_LIMITS, SKELETON_TYPES } from "@cawco/core/canvas";
import { CHOICE_LIMITS } from "@cawco/core/choices";
import { COMMENT_LIMITS } from "@cawco/core/comments/model";
import { PREVIEW_START_PATH } from "@cawco/core/preview/protocol";
import {
  CANVAS_SPEC_LIMITS,
  DESIGN_MAP_LIMITS,
  GRAPH_WIDTHS_SAID,
  INTERACTIONS,
  SERVE_COMMAND_LIMIT,
  STORY_FILE,
  STORY_NAME,
  storyRefOf,
} from "@cawco/core/stage";
import { artifactToolWords } from "@cawco/core/words/artifact-tools";
import { z } from "zod";
import { PAGE_LIMIT } from "../decision-page";
import { PROGRAM_MAX } from "../decision-program";

/** The longest name, handle or id an artifact tool takes. */
const ARTIFACT_REF_MAX = 100;

/** A workspace id, or the 8-character prefix delegate reports. */
export const WORKSPACE_ID = /^[0-9a-f][0-9a-f-]{7,35}$/u;

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
  "settle",
  "question_close",
] as const;

/** Whether `name` is a story a state read takes: `Story`, or `file:Story` naming the states file that exports it. */
export const isStateStory = (name: string): boolean => {
  const { file, story } = storyRefOf(name);
  return (
    STORY_NAME.test(story) && (file === undefined || STORY_FILE.test(file))
  );
};
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
    'Excalidraw skeletons, like {"type":"rectangle","id":"api","x":0,"y":0,"width":160,"height":60,"label":{"text":"API"}}; an arrow binds with "start":{"id":"api"}; text wraps at its "width"; a childless frame takes what it covers.'
  );

/** A story on a canvas: its export, or `file:Story` across states files. */
const storyRef = z.string().min(1).max(1100);

const does = z.enum(ARTIFACT_DOES);
const ask = z
  .string()
  .min(1)
  .max(ASK_LIMIT)
  .describe(
    'The line that heads the panel until they act: the act and its object in their words, like "Pick the head for the phone project page".'
  );

/** What names it to the person on every surface; a create without one is told how to write it. */
const title = z
  .string({
    error: (issue) =>
      issue.input === undefined ? artifactToolWords.titleMissing : undefined,
  })
  .min(1)
  .max(ARTIFACT_TITLE_LIMIT)
  .describe('What names it to the person everywhere, like "Title bars close".');

/** A design graph's edges, groups and dials, as create and update take them. */
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
        name: z.string().max(60),
        label: z.string().max(CANVAS_SPEC_LIMITS.label).optional(),
        kind: z.enum(["number", "color", "select", "toggle", "text", "action"]),
        group: z.string().optional(),
        min: z.number().optional(),
        max: z.number().optional(),
        step: z.number().positive().optional(),
        unit: z.string().max(10).optional(),
        options: z.array(z.string().max(100)).max(24).optional(),
        target: z.union([
          z.object({ cssVar: z.string().regex(/^--[\w-]+$/u) }),
          z.object({ arg: z.string().min(1).max(100) }),
        ]),
      })
    )
    .max(CANVAS_SPEC_LIMITS.dials)
    .optional()
    .describe(
      'Like [{"name":"radius","kind":"number","unit":"px","target":{"cssVar":"--radius"}}].'
    ),
};

const mermaid = z
  .string()
  .min(1)
  .max(CANVAS_LIMITS.mermaid)
  .optional()
  .describe('Mermaid, like "flowchart LR; A --> B".');

export const artifactCreate = {
  name: "artifact_create" as const,
  description:
    "Something opened in the person's panel for them to act on: a decision page, the design graph, a preview or a canvas. " +
    "Use it when they must pick, judge, try or draw, once the `show` skill has chosen `does`, `ask` and `kind`; proof, plans and finished work go in your own words, and a task attempt's result by task_result.",
  input: {
    kind: z
      .enum(MADE_ARTIFACT_KINDS)
      .describe(
        "page: `program`, `html`, or `dir` holding page.oui or page.html. component: the design graph, `file` a states file whose live story mounts the real component or screen (design-graph skill). preview: the running app (`port`, or a folder's `dir`) at `path`, for a flow he tries; it holds no CawCo sign-in. canvas: a drawing, never a screen: `elements`, `mermaid`, or empty."
      ),
    does: does.describe(
      "pick: a decision page, never a design. judge: a design graph, a kept block, or a page where no stage runs. try: a preview. draw: a canvas."
    ),
    ask,
    title,
    name: z
      .string()
      .regex(ARTIFACT_NAME)
      .describe(
        "Like onboarding. The same kind and name again replaces it, picks kept."
      ),
    program: z
      .string()
      .min(1)
      .max(PROGRAM_MAX)
      .optional()
      .describe(
        "Its decision cards (decision-page skill), or a block from your reply to keep (inline-block skill)."
      ),
    html: z
      .string()
      .min(1)
      .max(PAGE_LIMIT)
      .optional()
      .describe("A page's whole document."),
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
        "CSF 3 states files from your workspace's root: one per direction, or your reading's."
      ),
    ...canvasFields,
    dir: z.string().startsWith("/").max(4096).optional().describe("Absolute."),
    port: z
      .number()
      .int()
      .min(1)
      .max(65_535)
      .optional()
      .describe("A dev server's port."),
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
      .optional()
      .describe(
        "In a workspace, the server's command: CawCo runs it with PORT and keeps it up."
      ),
    elements,
    mermaid,
  },
};

export const artifactUpdate = {
  name: "artifact_update" as const,
  description:
    "Changes an artifact of yours, or one a cold session of your project left. Use it to revise one the person has open.",
  input: {
    id,
    elements: elements.describe(
      `${elements.description} One whose id is there replaces it.`
    ),
    mermaid,
    args: z
      .object({
        story,
        values: argValues,
        unset: z.array(z.string()).optional(),
      })
      .optional()
      .describe("Sets a component story's values."),
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
      .optional()
      .describe("Adds, duplicates, removes or moves a component's story."),
    delete: z
      .array(z.string().min(1).max(100))
      .min(1)
      .max(CANVAS_LIMITS.deletePerCall)
      .optional()
      .describe("A canvas's element ids to remove."),
    statements: z
      .string()
      .min(1)
      .max(PROGRAM_MAX)
      .optional()
      .describe(
        "A decision page's statements that change, merged by name; any of your project's pages."
      ),
    html: z
      .string()
      .min(1)
      .max(PAGE_LIMIT)
      .optional()
      .describe("Replaces a page's whole document, picks kept."),
    ask: ask.optional(),
    title: title.optional(),
    ...canvasFields,
    patch: z
      .array(
        z.union([
          z.object({
            op: z.enum(["add", "replace", "test"]),
            path: z.string().max(1000),
            value: z.unknown(),
          }),
          z.object({ op: z.literal("remove"), path: z.string().max(1000) }),
          z.object({
            op: z.enum(["move", "copy"]),
            from: z.string().max(1000),
            path: z.string().max(1000),
          }),
        ])
      )
      .min(1)
      .optional()
      .describe(
        'JSON Patch over its state by choice id, all or none, like [{"op":"replace","path":"/hero/options","value":["b"]}].'
      ),
  },
};

export const artifactRead = {
  name: "artifact_read" as const,
  description:
    "The person's picks, notes and values on an artifact, each choice picked or not. Use it when the person has acted on an artifact, or to see one as they see it.",
  input: {
    id: id.optional().describe("Its name, handle or id; none, your newest."),
    since: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("The seq your last read gave: only what is newer."),
    png: z.boolean().optional().describe("Adds its picture, with pins."),
    width: z
      .number()
      .int()
      .min(PICTURE_LIMITS.minWidth)
      .max(PICTURE_LIMITS.maxWidth)
      .optional()
      .describe("The picture's width in px."),
    detail: z
      .enum(["summary", "story"])
      .optional()
      .describe("story: a component story's args."),
    story: z.string().optional(),
    save: z
      .string()
      .optional()
      .describe(
        "Keeps the picture as a .png at this path in your clone or $TMPDIR."
      ),
    state: z
      .union([
        z.string(),
        z.object({
          story: z
            .string()
            .describe(
              "Its export; `file:Story` where two states files export it."
            ),
          interaction: z.enum(INTERACTIONS).optional(),
          scheme: z.enum(["light", "dark"]).optional(),
          width: z
            .number()
            .int()
            .positive()
            .optional()
            .describe(`The graph's: ${GRAPH_WIDTHS_SAID}.`),
        }),
      ])
      .optional()
      .describe(
        "A preview or page drawn in this state (its link's ?query or #hash); a component frame, adding its style delta."
      ),
    render: z.boolean().optional().describe("Draws it now."),
    verify: z.boolean().optional().describe("Asks the design verifier."),
  },
};

/** How many artifacts a page of `artifact_list` holds. */
export const LIST_PAGE = 25;

export const artifactList = {
  name: "artifact_list" as const,
  description:
    "Every artifact your artifact tools act on (yours, your tree's, your project's pages, what its cold sessions left), newest first, with whose move each is. " +
    "Use it to find an artifact's name before acting on it; what you asked the person is in open_items.",
  input: {
    cursor: z
      .string()
      .max(60)
      .optional()
      .describe(
        `A page's next_cursor, for the older ones; ${LIST_PAGE} a page.`
      ),
  },
};

export const artifactShow = {
  name: "artifact_show" as const,
  description:
    "Brings an artifact, yours or your delegation tree's, to the front of your panel at its newest version. Use it to open one a delegate handed you, or to put one back in front of the person.",
  input: { id },
};

export const artifactBrowse = {
  name: "artifact_browse" as const,
  description:
    "An address that opens an artifact in your own browser tool, to click through it as the person would. " +
    "Use it when the brief asks for that or a fault needs seeing.",
  input: { id },
};

export const artifactPromote = {
  name: "artifact_promote" as const,
  description:
    "Keeps an artifact with your project, committed to artifacts/<name>/ in the project's folder, which outlives this session. Use it for an artifact the project's later sessions need.",
  input: { id },
};

export const artifactDelete = {
  name: "artifact_delete" as const,
  description:
    "Removes an artifact with its pins; a promoted copy stays. " +
    "Use it for one of yours a newer one superseded, one a delegate below you left once its work item ended, or one a cold session of your project left, once its pins are resolved.",
  input: { id },
};

export const designMap = {
  name: "design_map" as const,
  description:
    "The project's component library: each component's states, frames drawn, what it is made of and used in. " +
    "Use it before building UI, to mount the components it lists.",
  input: {
    dir: z
      .string()
      .min(1)
      .max(1000)
      .optional()
      .describe("From your workspace's root; default its source folder."),
    query: z.string().min(1).max(100).optional(),
    component: z
      .string()
      .min(1)
      .max(1000)
      .optional()
      .describe(
        "A component's file: answers its card, with props, stories, moves and call sites."
      ),
    limit: z.number().int().min(1).max(DESIGN_MAP_LIMITS.max).optional(),
    cursor: z.string().max(20).optional(),
  },
};

const pin = z.string().min(6).max(36).describe("Its handle or id.");

export const commentRead = {
  name: "comment_read" as const,
  description:
    "The person's pins on your artifacts: what each stands on (selector, file:line, text), and its thread. Use it to read a pin before you answer it, or to see what stays open on a page.",
  input: {
    artifact: id
      .optional()
      .describe("Its name, handle or id; none, all of yours."),
    filter: z.enum(["open", "resolved", "all"]).default("open"),
    since: z
      .string()
      .datetime()
      .optional()
      .describe("The time your last read gave: only what is newer."),
  },
};

export const commentReply = {
  name: "comment_reply" as const,
  description:
    "Answers in a pin's thread. Use it to reply to a pin; once your change answers it, comment_resolve closes it.",
  input: {
    pin,
    text: z.string().min(1).max(COMMENT_LIMITS.text),
    files: z
      .array(z.string().min(1).max(COMMENT_LIMITS.file))
      .optional()
      .describe("After a change, the files it changed."),
    asks: z
      .boolean()
      .optional()
      .describe(
        "true when the reply needs their answer or pick: it reaches them in Needs you until they reply or resolve, so leave the pin open. A fix, a done or an FYI goes without it and stays on the page."
      ),
  },
};

export const commentResolve = {
  name: "comment_resolve" as const,
  description: "Resolves a pin. Use it once your change answers the pin.",
  input: {
    pin,
    text: z
      .string()
      .min(1)
      .max(COMMENT_LIMITS.text)
      .optional()
      .describe("A last line in its thread, when it helps."),
  },
};

export const questionClose = {
  name: "question_close" as const,
  description:
    "Closes a question your tree put to the person, so they are asked it no more; nothing is deleted. Use it when open_items lists it answered and you acted on it, or when it no longer applies.",
  input: {
    question: z
      .string()
      .min(1)
      .max(400)
      .describe("Its link from open_items, or <page>#<card>."),
    as: z
      .enum(["taken", "withdrawn"])
      .describe("taken: you acted on his answer. withdrawn: superseded."),
    why: z
      .string()
      .min(1)
      .max(CHOICE_LIMITS.why)
      .describe(
        "taken: his words you acted on, quoted. withdrawn: what superseded it."
      ),
  },
};

export const settle = {
  name: "settle" as const,
  description:
    "Picks an option on a decision card that the project's Who decides gives you as a member. Use it on a card of yours whose kind goes to the agent that asked, or on a card the hub sent you to settle.",
  input: {
    card: z
      .string()
      .min(3)
      .max(ARTIFACT_REF_MAX + CHOICE_LIMITS.id + 1)
      .describe("<page>#<card>."),
    option: z.string().min(1).max(CHOICE_LIMITS.option).describe("Its id."),
    why: z
      .string()
      .min(1)
      .max(CHOICE_LIMITS.why)
      .describe("One sentence: the fact that decides it."),
    sources: z
      .array(z.string().min(1).max(CHOICE_LIMITS.source))
      .max(CHOICE_LIMITS.sources)
      .describe(
        "Links or repository paths it rests on; common practice names an https link."
      ),
  },
};
