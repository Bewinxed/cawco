/**
 * CawCo's component library for custom views (Projects spec §5.2), in
 * OpenUI Lang's terms (`@openuidev/lang-core`, MIT): every component a view
 * may name, its props as Zod schemas, and the view tools a view's `Query()`
 * reads, each with its input and output schema. The dashboard builds the
 * library with its Svelte components as renderers ({@link viewLibrary}); the
 * build script (`scripts/openui-views.ts`) builds it with none and writes
 * the parser's schema and the system prompt into `views-spec.json`, which
 * the hub parses drafts with and gives Caw.
 *
 * A view cannot run code or reach the network: the library has no action,
 * input, link or image, there are no mutations, and the tools are the hub's
 * routes alone.
 */
import {
  createLibrary,
  defineComponent,
  type Library,
  type PromptOptions,
  type ToolSpec,
  tagSchemaId,
} from "@openuidev/lang-core";
import { z } from "zod";
import { INLINE_BLOCK_LANG } from "./inline-blocks";
import {
  STAGE_KINDS,
  VIEW_TEXT_ROLES,
  VIEW_TONES,
  type ViewEventsInput,
  type ViewEventsOutput,
  type ViewRoutinesInput,
  type ViewRoutinesOutput,
  type ViewSpendInput,
  type ViewSpendOutput,
  type ViewStagesOutput,
  type ViewTask,
  type ViewTasksInput,
  type ViewTasksOutput,
  type ViewToolName,
} from "./views";

// --- the data a view reads ---------------------------------------------------

const kind = z.enum(STAGE_KINDS);

/** One task, as the `tasks` tool answers it. */
const task: z.ZodType<ViewTask> = z.object({
  id: z.string().describe('Its id, like "tsk-12".'),
  number: z.number(),
  title: z.string(),
  stage: z.string().describe("The stage it is in, by name."),
  kind: kind.nullable().describe("Its stage's kind."),
  type: z
    .string()
    .nullable()
    .describe("The delegate type assigned to it, by name."),
  labels: z.array(z.string()),
  rank: z.string().nullable(),
  needsYou: z.boolean().describe("It waits for the person."),
  liveAttempt: z.boolean().describe("An attempt at it is running now."),
  waits: z
    .array(
      z.object({
        label: z.string(),
        settled: z.boolean(),
        state: z.string(),
      })
    )
    .describe(
      "What it waits on, unsettled first: a task, a decision card, a pin, a pull request, a run or a session, each by its name, with where it stands."
    ),
  todos: z.object({ done: z.number(), total: z.number() }),
  fields: z
    .record(z.string(), z.string())
    .describe("Front matter fields its file carries beyond a task's own."),
  dates: z
    .record(z.string(), z.number())
    .describe(
      "Its dates, ms epoch: createdAt, updatedAt; startedAt, completedAt, droppedAt once they happen; attemptStartedAt, attemptEndedAt of its newest attempt; and each date field its file carries, by the field's name."
    ),
});
tagSchemaId(task, "Task");

const stage = z.object({
  name: z.string(),
  kind,
  count: z.number().describe("Tasks in it now."),
});
tagSchemaId(stage, "Stage");

const byKind = z.object(
  Object.fromEntries(STAGE_KINDS.map((each) => [each, z.number()])) as Record<
    (typeof STAGE_KINDS)[number],
    z.ZodNumber
  >
);

const run = z.object({
  slot: z
    .string()
    .describe(
      '"test", "by-hand", "event", or its scheduled time in the routine\'s zone, like "09:00".'
    ),
  state: z
    .string()
    .describe("starting, running, queued, skipped, done or failed."),
  outcome: z
    .string()
    .nullable()
    .describe(
      "delivered, silent or failed; null while it runs or when it was skipped."
    ),
  reason: z.string().nullable(),
  startedAt: z.number(),
  endedAt: z.number().nullable(),
  usd: z.number().nullable(),
});

const routine = z.object({
  id: z.string(),
  name: z.string(),
  target: z.enum(["delegate", "conversation"]),
  delegateType: z.string().nullable(),
  enabled: z.boolean(),
  cron: z.string(),
  timeZone: z.string(),
  nextSlot: z.number(),
  nextRuns: z
    .array(z.number())
    .describe(
      "Its runs ahead, as the hub's scheduler will start them: the next week's, at most 288, epoch ms."
    ),
  lastSlot: z.number().nullable(),
  runs: z.array(run).describe("Its newest runs, newest first."),
});

const event = z.object({
  id: z.string(),
  source: z.string().describe('Where it came from: "github", a connection.'),
  kind: z.string().describe('Like "issues.opened".'),
  receivedAt: z.number(),
  routedTo: z
    .string()
    .nullable()
    .describe(
      'The routine a route sent it to, by name; "Caw" for the project\'s conversation.'
    ),
  handledAt: z.number().nullable(),
});

/** Each view tool: what it is for, what it takes and what it answers. */
const TOOLS = {
  tasks: {
    description:
      "The project's tasks, in rank order, each with its stage, kind, delegate type, labels and dates. Every filter is optional.",
    input: z.strictObject({
      stage: z.string().optional().describe("Only tasks in this stage."),
      kind: kind.optional().describe("Only tasks in stages of this kind."),
      label: z.string().optional().describe("Only tasks with this label."),
    }) satisfies z.ZodType<ViewTasksInput>,
    output: z.object({
      rows: z.array(task),
    }) satisfies z.ZodType<ViewTasksOutput>,
  },
  stages: {
    description:
      "The project's stages in order, each with how many tasks are in it now, and the counts by kind.",
    input: z.strictObject({}),
    output: z.object({
      project: z.object({ id: z.string(), name: z.string() }),
      stages: z.array(stage),
      byKind,
      total: z.number(),
    }) satisfies z.ZodType<ViewStagesOutput>,
  },
  routines: {
    description:
      "The project's routines, each with its schedule and its newest runs: when, how each ended, what it spent.",
    input: z.strictObject({
      runs: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe("How many of each routine's newest runs; 5 when left out."),
    }) satisfies z.ZodType<ViewRoutinesInput>,
    output: z.object({
      rows: z.array(routine),
    }) satisfies z.ZodType<ViewRoutinesOutput>,
  },
  spend: {
    description:
      "What the project's delegated work spent over the last `days`, in dollars: per routine, and per delegate type.",
    input: z.strictObject({
      days: z
        .number()
        .int()
        .min(1)
        .max(90)
        .optional()
        .describe("How many days back from now; 30 when left out."),
    }) satisfies z.ZodType<ViewSpendInput>,
    output: z.object({
      since: z.number(),
      until: z.number(),
      byRoutine: z.array(
        z.object({
          routineId: z.string(),
          name: z.string(),
          usd: z.number(),
          runs: z.number(),
        })
      ),
      byType: z.array(
        z.object({
          type: z.string().nullable(),
          usd: z.number(),
          items: z.number(),
        })
      ),
    }) satisfies z.ZodType<ViewSpendOutput>,
  },
  events: {
    description:
      "The newest inbound events from outside (GitHub, polled connections), newest first, and which routine took each.",
    input: z.strictObject({
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("How many; 20 when left out."),
    }) satisfies z.ZodType<ViewEventsInput>,
    output: z.object({
      rows: z.array(event),
    }) satisfies z.ZodType<ViewEventsOutput>,
  },
} satisfies Record<
  ViewToolName,
  { description: string; input: z.ZodType; output: z.ZodType }
>;

/**
 * A view tool's input schema, strict: the one schema every door holds a
 * call to (the draft check, the hub's route, `view_query`), so a key the
 * tool doesn't take is refused at each, never stripped at one.
 */
export const viewToolInput = <T extends ViewToolName>(
  name: T
): (typeof TOOLS)[T]["input"] => TOOLS[name].input;

/**
 * What is wrong with a `Query(name, args)` as a view writes it: `keys`, every
 * key it gives, and `values`, those whose values are literal (one given by an
 * expression is read only when the view draws). The keys the tool doesn't
 * take, and each literal value its schema refuses, with the schema's words.
 */
export const viewToolArgsFaults = (
  name: ViewToolName,
  keys: readonly string[],
  values: Readonly<Record<string, unknown>>
): { unknown: string[]; wrong: { field: string; reason: string }[] } => {
  const shape: Record<string, z.ZodType> = TOOLS[name].input.shape;
  return {
    unknown: keys.filter((key) => !Object.hasOwn(shape, key)),
    wrong: Object.entries(values).flatMap(([field, value]) => {
      const parsed = Object.hasOwn(shape, field)
        ? shape[field]?.safeParse(value)
        : undefined;
      return parsed && !parsed.success
        ? [
            {
              field,
              reason: parsed.error.issues.map((one) => one.message).join("; "),
            },
          ]
        : [];
    }),
  };
};

/** The view tools as OpenUI's prompt lists them: name, description, input and output as JSON Schema. */
export const viewToolSpecs = (): ToolSpec[] =>
  Object.entries(TOOLS).map(([name, spec]) => ({
    name,
    description: spec.description,
    inputSchema: z.toJSONSchema(spec.input) as Record<string, unknown>,
    outputSchema: z.toJSONSchema(spec.output, {
      unrepresentable: "any",
    }) as Record<string, unknown>,
    annotations: { readOnlyHint: true },
  }));

// --- the components ----------------------------------------------------------

const tone = z.enum(VIEW_TONES);
const fields = z
  .array(z.string())
  .describe(
    'Which of each task\'s values to show under it, as paths inside a task: "type", "labels", "kind", "dates.updatedAt", "fields.due".'
  );

/** Every component a view may name, in the order the prompt lists them. */
export const VIEW_COMPONENTS = [
  "Column",
  "Row",
  "Text",
  "Badge",
  "StatTile",
  "Table",
  "Diagram",
  "Board",
  "StageColumn",
  "TaskCard",
  "TaskTable",
  "Calendar",
] as const;
export type ViewComponentName = (typeof VIEW_COMPONENTS)[number];

/**
 * The components an agent's block (an `openui` fence in its reply, tsk-330)
 * may name: the view library's that draw what the program holds. The ones
 * that draw a project's tasks read them through a Query, which a block has
 * none of, so they are left out ({@link blockLibrary}).
 */
export const BLOCK_COMPONENTS = [
  "Column",
  "Row",
  "Text",
  "Badge",
  "StatTile",
  "Table",
  "Diagram",
] as const satisfies readonly ViewComponentName[];
export type BlockComponentName = (typeof BLOCK_COMPONENTS)[number];

/** The Mermaid types Pele draws as charts (pele.run), as the block prompt names them. */
const PELE_CHARTS =
  "xychart-beta (bar and line), pie, quadrantChart, radar-beta, sankey-beta, treemap-beta, venn-beta, gantt, timeline";

/** The component a view's `root` is. */
export const VIEW_ROOT: ViewComponentName = "Column";

/**
 * The library over `renderers`, one per component, by name: the dashboard's
 * Svelte components, or nothing (`null`) where only the schema and the
 * prompt are read. Each prop's schema is the props its renderer takes.
 */
export const viewLibrary = <C>(
  renderers: Record<ViewComponentName, C>
): Required<Library<C>> => {
  const define = <T extends z.ZodObject>(
    name: ViewComponentName,
    description: string,
    props: T
  ) =>
    defineComponent({ name, description, props, component: renderers[name] });

  const Text = define(
    "Text",
    "Words, in one of the house text roles. Plain text: no links, images or markup.",
    z.object({
      text: z.string(),
      variant: z
        .enum(VIEW_TEXT_ROLES)
        .optional()
        .describe('"body" when left out.'),
    })
  );
  const Badge = define(
    "Badge",
    "A short label in a status pair, like a stage's kind.",
    z.object({
      text: z.string(),
      tone: tone.optional().describe('"neutral" when left out.'),
    })
  );
  const StatTile = define(
    "StatTile",
    "One figure with its label, like a count of tasks in a stage.",
    z.object({
      label: z.string(),
      value: z.union([z.number(), z.string()]),
      tone: tone.optional().describe('"neutral" when left out.'),
      unit: z.string().optional().describe("Its unit, beside it."),
    })
  );
  const TaskCard = define(
    "TaskCard",
    "One task as the board draws it: its id, title and live state, and the values `fields` names under it. Opens the task.",
    z.object({
      task,
      fields: fields.optional(),
    })
  );
  const StageColumn = define(
    "StageColumn",
    "One stage's column as the board draws it: `stage` is one of the stages tool's stages; its name, kind and count, then a card for each of `tasks` in that stage, in rank order.",
    z.object({
      stage,
      tasks: z
        .array(task)
        .describe(
          "The tasks tool's rows; the column keeps those in its stage."
        ),
      fields: fields.optional(),
    })
  );
  const Board = define(
    "Board",
    "Columns side by side, as the project's board lays them.",
    z.object({
      children: z.array(StageColumn.ref),
      title: z.string().optional().describe("A heading over the board."),
    })
  );
  const Table = define(
    "Table",
    "Rows under headings, one cell per heading: a cell is words, a number or a Badge. On a phone each row stands as a card.",
    z.object({
      columns: z.array(z.string()).min(1).describe("The headings."),
      rows: z
        .array(z.array(z.union([z.string(), z.number(), Badge.ref])))
        .describe("Each row's cells, in the headings' order."),
    })
  );
  const Diagram = define(
    "Diagram",
    `A Mermaid diagram or chart, drawn on the house look: a flowchart, sequenceDiagram, stateDiagram-v2, erDiagram, classDiagram, mindmap, or a chart: ${PELE_CHARTS}.`,
    z.object({
      mermaid: z
        .string()
        .describe(
          'Mermaid text, lines split with \\n: "flowchart LR\\nA --> B".'
        ),
      caption: z.string().optional().describe("A line under it."),
    })
  );
  const TaskTable = define(
    "TaskTable",
    "Tasks as rows, one column per entry of `columns`; a row opens its task.",
    z.object({
      rows: z.array(task).describe("The tasks tool's rows, or a part of them."),
      columns: z
        .array(
          z.object({
            label: z.string(),
            field: z
              .string()
              .describe(
                'The path inside a task it shows: "title", "stage", "type", "dates.updatedAt".'
              ),
          })
        )
        .min(1),
    })
  );
  const Calendar = define(
    "Calendar",
    "Tasks placed on a calendar by one of their dates; a task without that date is left off.",
    z.object({
      rows: z.array(task).describe("The tasks tool's rows, or a part of them."),
      date: z
        .string()
        .describe(
          'Which date places a task: "dates.createdAt", "dates.updatedAt", "dates.completedAt", "dates.attemptEndedAt", or "dates.<field>" for a date its file carries.'
        ),
      range: z
        .enum(["week", "month"])
        .optional()
        .describe('"week" when left out.'),
    })
  );
  // A layout holds any component, layouts included.
  const child: z.ZodType = z.lazy(() =>
    z.union([
      Column.ref,
      Row.ref,
      Text.ref,
      Badge.ref,
      StatTile.ref,
      Board.ref,
      StageColumn.ref,
      TaskCard.ref,
      Table.ref,
      TaskTable.ref,
      Diagram.ref,
      Calendar.ref,
    ])
  );
  const align = z
    .enum(["start", "center", "end", "stretch"])
    .optional()
    .describe('How the children sit across it; "stretch" when left out.');
  const Row = define(
    "Row",
    "Lays its children out side by side, wrapping onto the next line where they do not fit.",
    z.object({
      children: z.array(child),
      justify: z
        .enum(["start", "center", "end", "spaceBetween"])
        .optional()
        .describe('How the children share its length; "start" when left out.'),
      align,
    })
  );
  const Column = define(
    "Column",
    "Lays its children out one under another. The program's root.",
    z.object({ children: z.array(child), align })
  );

  return createLibrary({
    components: [
      Column,
      Row,
      Text,
      Badge,
      StatTile,
      Table,
      Diagram,
      Board,
      StageColumn,
      TaskCard,
      TaskTable,
      Calendar,
    ],
    root: VIEW_ROOT,
  });
};

/**
 * The block library over `renderers`: the view library less the components
 * that draw a project's tasks (lang-core `extend`, `remove`), so a block's
 * program names only what it holds.
 */
export const blockLibrary = <C>(
  renderers: Record<BlockComponentName, C>
): Required<Library<C>> => {
  const blocks = new Set<string>(BLOCK_COMPONENTS);
  // The task components are built with no renderer and removed at once:
  // nothing in the library it answers holds one.
  const all = Object.fromEntries(
    VIEW_COMPONENTS.map((name) => [
      name,
      blocks.has(name) ? renderers[name as BlockComponentName] : null,
    ])
  ) as Record<ViewComponentName, C>;
  return viewLibrary<C>(all).extend({
    components: {
      remove: VIEW_COMPONENTS.filter((name) => !blocks.has(name)),
    },
  });
};

// --- the prompt ----------------------------------------------------------------

/** One view, as the prompt shows it: a figure row and the board, from two Queries. */
const EXAMPLE = `root = Column([title, figures, board])
tasks = Query("tasks", {}, {rows: []})
stages = Query("stages", {}, {stages: [], byKind: {you: 0, done: 0}, total: 0})
title = Text("This week", "title")
figures = Row([StatTile("Waiting on you", stages.byKind.you, "attn"), StatTile("Done", stages.byKind.done, "done")])
board = Board(@Each(stages.stages, "s", StageColumn(s, tasks.rows, ["type"])), "By stage")`;

/**
 * What the prompt is generated with: our tools, Query only, no bindings (no
 * component of the library sets a value, so a $variable could never
 * change), and the rules that keep a view to reading the project's data.
 */
export const viewPromptOptions = (): PromptOptions => ({
  preamble:
    "You write a CawCo view: one OpenUI Lang program over CawCo's components, passed whole as view_draft's `source`. The source is openui-lang alone: no markdown fences, no explanations.",
  tools: viewToolSpecs(),
  toolCalls: true,
  bindings: false,
  toolExamples: [EXAMPLE],
  additionalRules: [
    "Every figure, row and date comes from a Query of the tools listed; never write the project's data by hand, and never mock it: when no tool reads what the person asked for, draft what the tools do read and say in the thread what is missing.",
    "A view only reads: never write Mutation(), Action(), @Run, @Set, @Reset, @OpenUrl or @ToAssistant. There are no buttons, inputs or links.",
    "No URLs, images or markup anywhere: a view cannot reach the network, and its text is plain.",
    "Use only the components listed. A name outside them is dropped and reported, never drawn.",
    "To see a tool's real data before you write, call view_query with its name and arguments: it answers what Query() will.",
  ],
});

// --- the block prompt ----------------------------------------------------------

/** A block's fence as the prompt's preamble shows it. */
const BLOCK_FENCE = `${INLINE_BLOCK_LANG} name="…"`;

/** A program in its fence, as a reply holds it. */
const fenced = (name: string, program: string): string =>
  `\`\`\`${INLINE_BLOCK_LANG} name="${name}"\n${program}\n\`\`\``;

/** Two blocks, as the block prompt shows them: figures over a table, and a chart. */
const BLOCK_EXAMPLES = [
  fenced(
    "Release health",
    `root = Column([figures, table])
figures = Row([StatTile("Merged", 14, "done"), StatTile("Waiting on review", 3, "attn"), StatTile("Failed checks", 1, "fail")])
table = Table(["Pull request", "Owner", "Checks"], [["Inline blocks", "Ana", Badge("Passed", "done")], ["Tray chips", "Omar", Badge("Running", "live")], ["Sign-in move", "Lea", Badge("Failed", "fail")]])`
  ),
  fenced(
    "Weekly spend",
    `root = Column([chart])
chart = Diagram("xychart-beta\\ntitle \\"Spend per week\\"\\nx-axis [W1, W2, W3, W4]\\ny-axis \\"USD\\"\\nbar [42, 58, 37, 61]", "Delegated work, last four weeks")`
  ),
];

/**
 * What the block prompt is generated with: the block library, no tools, no
 * bindings and no built-ins (a block holds the data as the agent drew it),
 * and the rules of the fence a block is written in. Its prompt is the
 * inline-block skill an agent loads before its first block.
 */
export const blockPromptOptions = (): PromptOptions => ({
  preamble: `You draw a CawCo block: one OpenUI Lang program over CawCo's components, written in your reply as a fenced code block whose info string is \`${BLOCK_FENCE}\`. The transcript draws it in place of the code. The fence holds the program alone.`,
  toolCalls: false,
  bindings: false,
  builtinFunctions: false,
  examples: BLOCK_EXAMPLES,
  additionalRules: [
    'Name every block in its fence: `openui name="…"`, a few plain words the person would call it. A fence with no name draws as code.',
    "A later fence with the same name in the same conversation is the block's newer version: the earlier one folds and points to it. Reuse the name to revise a block; a new name is a new block.",
    "Write the data into the program as literals: the figures, rows and words you have now. There is no Query() or Mutation(), and no $variables.",
    "A block shows; it asks nothing. There are no buttons, inputs or links: a choice goes through `ask` or a decision page.",
    "No URLs, images or markup in its words: its text is plain. A Diagram's Mermaid is the one place for diagram syntax.",
    "A heading is a Text in the program, where the block needs one; the block draws no title of its own.",
    `Charts are Diagrams: ${PELE_CHARTS}, in Mermaid's own syntax.`,
    "Use only the components listed. A name outside them is dropped and reported, never drawn.",
  ],
});
