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
  ARTIFACT_PICKS,
  MADE_ARTIFACT_KINDS,
} from "@cawco/core/artifact-kinds";
import { PICTURE_LIMITS } from "@cawco/core/artifact-picture";
import { SKELETON_TYPES } from "@cawco/core/canvas";
import { COMMENT_LIMITS } from "@cawco/core/comments/model";
import { PREVIEW_START_PATH } from "@cawco/core/preview/protocol";
import {
  DESIGN_MARKS,
  GRAPH_WIDTHS_SAID,
  INTERACTIONS,
  STATES_ENTRY,
  STORY_FILE,
  STORY_NAME,
  storyRefOf,
} from "@cawco/core/stage";
import {
  MEASURE_PRESSES,
  MEASURE_REPEATS,
  MEASURE_SPEEDS,
} from "@cawco/core/stage-measure";
import { artifactToolWords } from "@cawco/core/words/artifact-tools";
import { z } from "zod";
import { QUESTION_SHAPE } from "../ask-fields";
import { PAGE_LIMIT } from "../decision-page";
import { PROGRAM_MAX } from "../decision-program";

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
  "record_pick",
  "question_close",
] as const;

/** Whether `name` is a story a state read takes: `Story`, or `file:Story` naming the states file that exports it. */
export const isStateStory = (name: string): boolean => {
  const { file, story } = storyRefOf(name);
  return (
    STORY_NAME.test(story) && (file === undefined || STORY_FILE.test(file))
  );
};

/** A story's name in a tool's input: its pattern is the route's and the stage's to check, which say why. */
const story = z.string();
const argValues = z.record(z.string(), z.unknown());

const id = z.string().min(1).describe("Its name, handle or id.");

/** An Excalidraw element skeleton: its type, an id you choose, and Excalidraw's own fields. */
const skeleton = z.looseObject({
  type: z.enum(SKELETON_TYPES),
  id: z.string().min(1).optional(),
});

/** A canvas's skeleton elements, as create and update take them. */
const elements = z
  .array(skeleton)
  .min(1)
  .optional()
  .describe(
    'Excalidraw skeletons, like {"type":"rectangle","id":"api","x":0,"y":0,"width":160,"height":60,"label":{"text":"API"}}; an arrow binds with "start":{"id":"api"}; text wraps at its "width"; a childless frame takes what it covers.'
  );

/** A story on a canvas: its export, or `file:Story` across states files. */
const storyRef = z.string().min(1);

const does = z.enum(ARTIFACT_DOES);
const ask = z
  .string()
  .min(1)
  .describe(
    'The line that heads the panel until they act: the act and its object in their words, like "Pick the head for the phone project page".'
  );

/** Where the person makes the pick an artifact opens (core `ARTIFACT_PICKS`), judged by its agent as `pickJudged` says. */
const pick = z.enum(ARTIFACT_PICKS).optional();

/** What names it to the person on every surface; a create without one is told how to write it. */
const title = z
  .string({
    error: (issue) =>
      issue.input === undefined ? artifactToolWords.titleMissing : undefined,
  })
  .min(1)
  .describe('What names it to the person everywhere, like "Title bars close".');

/** A design graph's edges, groups and dials, as create and update take them. */
const canvasFields = {
  edges: z
    .array(
      z.object({
        from: storyRef,
        to: storyRef,
        label: z.string().optional(),
      })
    )
    .optional()
    .describe('Like [{"from":"Waiting","to":"Scanning"}].'),
  group: z
    .record(storyRef, storyRef)
    .optional()
    .describe("Story → its parent story."),
  dials: z
    .array(
      z.object({
        name: z
          .string()
          .regex(/^[A-Za-z][\w-]*$/u, { error: artifactToolWords.dialName }),
        label: z.string().optional(),
        kind: z.enum(["number", "color", "select", "toggle", "text", "action"]),
        group: z.string().optional(),
        min: z.number().optional(),
        max: z.number().optional(),
        step: z.number().positive().optional(),
        unit: z.string().optional(),
        options: z.array(z.string()).optional(),
        target: z.union([
          z.object({ cssVar: z.string().regex(/^--[\w-]+$/u) }),
          z.object({ arg: z.string().min(1) }),
        ]),
      })
    )
    .optional()
    .describe(
      'Like [{"name":"radius","kind":"number","unit":"px","target":{"cssVar":"--radius"}}].'
    ),
};

/** A design's directions: each a states file, or a design folder's page (`html`) or folder (`dir`). */
const designDirections = z
  .array(
    z.object({
      file: z.string().optional(),
      html: z.string().optional(),
      dir: z.string().optional(),
      name: z.string(),
      line: z.string(),
    })
  )
  .optional();

/** What a design folder holds, as its agent marks it (core `DESIGN_MARKS`). */
const designMark = z
  .enum(DESIGN_MARKS)
  .optional()
  .describe(
    "A design folder's: a document, chart or deck shows at its own size; default screen."
  );

const mermaid = z
  .string()
  .min(1)
  .optional()
  .describe('Mermaid, like "flowchart LR; A --> B".');

export const artifactCreate = {
  name: "artifact_create" as const,
  description:
    "Something opened in the person's panel for them to act on: a decision page, the design graph, a preview or a canvas. " +
    "Use it when they must pick, judge, try or draw, once the `show` skill has chosen `does`, `ask` and `kind`; it waits on them while a card or direction is unpicked. Proof, plans and finished work go in your own words, a task attempt's result by task_result.",
  input: {
    kind: z
      .enum(MADE_ARTIFACT_KINDS)
      .describe(
        "page: `program`, `html`, or `dir` holding page.oui or page.html. component: the design graph: `file` a states file whose live story mounts the real component or screen, or a design folder: `html` one page, or `dir` a folder whose index.html loads its files or code (design-graph skill). preview: the running app (`port`, or a copy of `dir`) at `path`, for a flow he tries; it holds no CawCo sign-in. canvas: a drawing, never a screen: `elements`, `mermaid`, or empty."
      ),
    does: does.describe(
      "pick: a decision page, never a design. judge: a design graph or a kept block. try: a preview. draw: a canvas."
    ),
    ask,
    title,
    name: z
      .string()
      .regex(ARTIFACT_NAME)
      .describe(
        "Like onboarding. The same kind and name again replaces it, picks kept, whoever in your delegation tree made it."
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
        z.string().min(1).regex(STATES_ENTRY),
        z.array(z.string().min(1).regex(STATES_ENTRY)).min(1),
      ])
      .optional()
      .describe("Each story they judge, `path:Story`; whole with reading."),
    ...canvasFields,
    directions: designDirections.describe(
      "Two or more directions of one design, a states file or page each: one graph switching between them; their pick is artifact_read's `picked`."
    ),
    pick: pick.describe(
      `Required with directions or a decision page's cards. ${artifactToolWords.pickJudged}`
    ),
    // @limit external: Linux PATH_MAX, 4,096 bytes (limits.h)
    dir: z.string().startsWith("/").max(4096).optional().describe("Absolute."),
    content: designMark,
    port: z
      .number()
      .int()
      .min(1)
      // @limit external: a TCP port is 16 bits, 1 to 65,535 (RFC 9293 §3.1)
      .max(65_535)
      .optional()
      .describe("A dev server's port."),
    path: z
      .string()
      .regex(PREVIEW_START_PATH)
      .optional()
      .describe("Its start page, like /settings."),
    machine: z
      .string()
      .min(1)
      .optional()
      .describe("A `dir`'s machine; default yours."),
    workspace: z
      .string()
      .regex(WORKSPACE_ID)
      .optional()
      .describe("Whose server the port is: yours (default) or a delegate's."),
    serve: z
      .object({
        command: z.string().min(1),
        cwd: z
          .string()
          .optional()
          .describe("The app's folder: absolute, or from yours (default)."),
      })
      .optional()
      .describe(
        "With a port, its server's command: CawCo runs it with PORT, keeps it up, restarts it on open."
      ),
    elements,
    mermaid,
    reading: z
      .boolean()
      .optional()
      .describe(
        "true: yours alone, like a states check or a probe: never the person's or your parent's, deleted when your work item ends."
      ),
  },
};

export const artifactUpdate = {
  name: "artifact_update" as const,
  description:
    "Changes an artifact of yours or your delegation tree's, or one a cold session of your project left. Use it to revise one the person has open; the later write wins.",
  input: {
    id,
    elements: elements.describe(
      "As artifact_create's; one whose id is there replaces it."
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
      .array(z.string().min(1))
      .min(1)
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
      .describe("Replaces a page's or a design folder's document, picks kept."),
    ask: ask.optional().describe("A new ask, as artifact_create's."),
    title: title.optional().describe("A new title."),
    pick: pick.describe("Where its pick is made, as artifact_create's."),
    ...canvasFields,
    edges: canvasFields.edges.describe("As artifact_create's."),
    dials: canvasFields.dials.describe("As artifact_create's."),
    dir: z
      .string()
      .startsWith("/")
      // @limit external: Linux PATH_MAX, 4,096 bytes (limits.h)
      .max(4096)
      .optional()
      .describe("A folder preview's or design folder's dir again."),
    directions: designDirections.describe(
      "A design folder's directions again, replaced in place."
    ),
    content: designMark.describe("Sent with html, dir or directions."),
    patch: z
      .array(
        z.union([
          z.object({
            op: z.enum(["add", "replace", "test"]),
            path: z.string(),
            value: z.unknown(),
          }),
          z.object({ op: z.literal("remove"), path: z.string() }),
          z.object({
            op: z.enum(["move", "copy"]),
            from: z.string(),
            path: z.string(),
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

/** `artifact_read`'s `measure` (core stage-measure.ts `MeasureAsk`): one move measured on a design graph's stage. */
export const measureAsk = z.object({
  play: z
    .literal(true)
    .optional()
    .describe("state.story's own play, run from its from story."),
  press: z
    .enum(MEASURE_PRESSES)
    .optional()
    .describe("One press on `on`, made from state.story."),
  on: z
    .union([
      z.object({
        role: z.string().min(1),
        name: z.string().optional(),
      }),
      z.object({ text: z.string().min(1) }),
      z.object({ testId: z.string().min(1) }),
      z.object({ selector: z.string().min(1) }),
    ])
    .optional()
    .describe(
      "The press's element, as a play finds it: { role, name? }, { text }, { testId }, or { selector } for one with none of those. Exactly one element matches."
    ),
  text: z.string().optional().describe("A type press's words."),
  key: z
    .string()
    .min(1)
    .optional()
    .describe("A key press's key, as KeyboardEvent.key names it: Enter."),
  repeats: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      `Memory repeats; ${MEASURE_REPEATS} when left out, as fuite repeats; 13 when a counter grows with fit under 0.9.`
    ),
  speed: z
    .enum(MEASURE_SPEEDS)
    .optional()
    .describe(
      "slowed, when left out: the main thread at a quarter speed and the compositor at full, as on a phone. machine: the machine's own speed, for a screen only a desk shows."
    ),
});

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
        "A preview or page drawn in this state (its link's ?query or #hash); a component frame, adding its style delta, drawn as mounted (its play runs only under measure)."
      ),
    render: z.boolean().optional().describe("Draws it now."),
    layout: z
      .boolean()
      .optional()
      .describe(
        "With a component state: the frame with its alignment guides drawn, and their numbers (text edges, near-misses, spacing against tokens)."
      ),
    measure: measureAsk
      .optional()
      .describe(
        "With state.story: plays one move in a headless browser and answers measured: frames and who ran them, style and layout work and what forced it, animations Chrome kept off the compositor and why, memory over repeats, faults with what to fix. Takes about 25 s."
      ),
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
      .optional()
      .describe(
        `A page's next_cursor, for the older ones; ${LIST_PAGE} a page.`
      ),
  },
};

export const artifactShow = {
  name: "artifact_show" as const,
  description:
    "Brings an artifact, yours or your delegation tree's, to the front of your panel at its newest version. Use it when a delegate handed you one the person must see, or to put one back in front of them.",
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
      .optional()
      .describe("From your workspace's root; default its source folder."),
    query: z.string().min(1).optional(),
    component: z
      .string()
      .min(1)
      .optional()
      .describe(
        "A component's file: answers its card, with props, stories, moves and call sites."
      ),
    limit: z.number().int().min(1).optional(),
    cursor: z.string().optional(),
  },
};

// @limit external: pin is a handle of 6 or more characters (handles.ts) or a UUID of 36
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
    "Answers in a pin's thread. Use it when you reply to a pin; once your change answers it, comment_resolve closes it.",
  input: {
    pin,
    text: z
      .string()
      .min(1)
      .describe("Your reply, as they read it in the thread."),
    files: z
      .array(z.string().min(1).max(COMMENT_LIMITS.file))
      .optional()
      .describe("After a change, the files it changed."),
    question: QUESTION_SHAPE.optional().describe(
      "When the reply needs their choice: the question, as ask takes it."
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
      .optional()
      .describe("A last line in its thread, when it helps."),
  },
};

export const questionClose = {
  name: "question_close" as const,
  description:
    "Closes a question put to the person; nothing is deleted. Use it when you acted on his answer, or when a question's work has moved on.",
  input: {
    question: z
      .string()
      .min(1)
      .describe(
        "A card's link from open_items or <page>#<card>, or a question's request id (ask_…)."
      ),
    as: z
      .enum(["taken", "withdrawn"])
      .describe(
        "taken: you acted on his answer to a card. withdrawn: its work moved on."
      ),
    why: z
      .string()
      .min(1)
      .describe(
        "taken: his words you acted on, quoted. withdrawn: what overtook it."
      ),
    evidence: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Another session's question: its task closed (tsk-12), its to-do ticked (link), step (its step ticked), or a newer ask_…."
      ),
  },
};

export const recordPick = {
  name: "record_pick" as const,
  description:
    "Records the person's answer to a decision card or a question (ask_…) from his own words, quoted for him to change. Use it when his message or comment plainly answers one.",
  input: {
    card: z
      .string()
      .describe("<page>#<card>, or a question's request id (ask_…)."),
    options: z
      .array(z.string().min(1))
      .min(1)
      .optional()
      .describe("A card: the option ids his words pick."),
    answers: z
      .record(z.string(), z.string().min(1))
      .optional()
      .describe(
        "A question: each question's exact text → the label he picks, or his words."
      ),
    pin: pin.optional().describe("A card: his comment on that page."),
    message: z
      .string()
      .min(1)
      .optional()
      .describe("His message: a find hit's ref, or its id."),
    quote: z
      .string()
      .min(1)
      .describe("His words that answer it, copied as written."),
  },
};

export const settle = {
  name: "settle" as const,
  description:
    "Picks an option on a decision card that the project's Who decides gives you as a member. Use it on a card of yours whose kind goes to the agent that asked, or on a card the hub sent you to settle.",
  input: {
    card: z.string().describe("<page>#<card>."),
    option: z.string().min(1).describe("Its id."),
    why: z.string().min(1).describe("One sentence: the fact that decides it."),
    sources: z
      .array(z.string().min(1))
      .describe(
        "Links or repository paths it rests on; common practice names an https link."
      ),
  },
};
