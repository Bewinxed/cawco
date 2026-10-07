/**
 * CawCo's A2UI catalog (Projects spec §5.2, D17): the components a project's
 * view may use, their props, and the data they bind to. A view is an A2UI
 * v0.9.1 document over this catalog (`views/<name>.json`), drawn in the
 * dashboard by svelte-a2ui with CawCo's Svelte components registered under
 * exactly these names, and in the app by a2ui-swift's custom catalog.
 *
 * The hub builds the catalog's JSON Schema from {@link CAWCO_COMPONENTS}
 * (`a2ui.ts`) and validates every draft against the spec's own
 * `server_to_client.json` with it in place of `catalog.json`, as the spec
 * prescribes for a client catalog. A component name not listed here is
 * refused by name; nothing is invented.
 *
 * A view cannot run code or reach the network: the catalog has no actions,
 * no inputs, no media and no URL props, its functions are the spec's pure
 * formatters only, and the hub refuses any spec carrying a URL or a
 * script-like field.
 */

/** Where every common type the catalog's props use is defined: the spec's `common_types.json`. */
const COMMON = "https://a2ui.org/specification/v0_9/common_types.json#/$defs/";

/** A prop's JSON Schema: a reference to a common type, or an inline schema. */
export type PropSchema = Record<string, unknown>;

const common = (name: string): PropSchema => ({ $ref: `${COMMON}${name}` });

/** The catalog's id: what a view's `createSurface.catalogId` names. Not a URL: a view carries none. */
export const CAWCO_CATALOG_ID = "cawco.dev:views/v1";

/** The A2UI version a view is written in, until the Swift renderer speaks v1.0 (§5.2). */
export const A2UI_VERSION = "v0.9.1";

/** The tones a badge or stat tile takes: DESIGN.md's status pairs, or none. */
export const VIEW_TONES = ["neutral", "live", "attn", "done", "fail"] as const;
export type ViewTone = (typeof VIEW_TONES)[number];

/** Text roles a view may set: DESIGN.md's (The Role, Not Size Rule). */
export const VIEW_TEXT_ROLES = ["title", "label", "body", "meta"] as const;
export type ViewTextRole = (typeof VIEW_TEXT_ROLES)[number];

/** One prop of a catalog component. */
export interface CatalogProp {
  description: string;
  schema: PropSchema;
}

/** One component of the catalog. */
export interface CatalogComponent {
  description: string;
  props: Record<string, CatalogProp>;
  required: readonly string[];
}

const CHILDREN: CatalogProp = {
  description:
    "Its children: component ids, or a template ({componentId, path}) over a list in the view's data.",
  schema: common("ChildList"),
};

const FIELDS: CatalogProp = {
  description:
    'Which of a task\'s values to show, as paths inside a task: "type", "labels", "kind", "dates.updatedAt", "fields.due".',
  schema: { type: "array", items: { type: "string" } },
};

/**
 * Every component a view may use, by the name the renderers register. Their
 * data is the hub's (`GET /api/projects/:id/view-data`, {@link ViewData}):
 * absolute paths like `/tasks` and `/stages`, or relative paths inside a
 * template's item.
 */
export const CAWCO_COMPONENTS = {
  Board: {
    description:
      "The project's tasks in columns, one StageColumn per stage. Its children are StageColumns, usually a template over /stages.",
    props: {
      title: {
        description: "A heading over the board.",
        schema: common("DynamicString"),
      },
      children: CHILDREN,
    },
    required: ["children"],
  },
  StageColumn: {
    description:
      "One stage's column: its name, kind and count, then a TaskCard for each task in the stage, in rank order.",
    props: {
      stage: {
        description:
          'The stage\'s name, or a path to it ("name" inside a template over /stages).',
        schema: common("DynamicString"),
      },
      fields: FIELDS,
    },
    required: ["stage"],
  },
  TaskCard: {
    description:
      "One task: its id, title and live state, and the values `fields` names.",
    props: {
      task: {
        description:
          'The task\'s id ("tsk-12"), or a path to it ("id" inside a template over /tasks).',
        schema: common("DynamicString"),
      },
      fields: FIELDS,
    },
    required: ["task"],
  },
  Table: {
    description: "Tasks as rows, one column per entry of `columns`.",
    props: {
      rows: {
        description: "The list of tasks to show; /tasks when left out.",
        schema: common("DataBinding"),
      },
      columns: {
        description:
          'The columns, in order: a heading and the path inside a task it shows ("title", "stage", "dates.updatedAt").',
        schema: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              label: common("DynamicString"),
              field: { type: "string" },
            },
            required: ["label", "field"],
            additionalProperties: false,
          },
        },
      },
    },
    required: ["columns"],
  },
  Calendar: {
    description:
      "Tasks placed on a calendar by one of their dates; a task without that date is left off.",
    props: {
      date: {
        description:
          'The path inside a task of the date that places it: "dates.updatedAt", "dates.attemptEndedAt", or "dates.<field>" for a date the task file carries.',
        schema: { type: "string" },
      },
      rows: {
        description: "The list of tasks to place; /tasks when left out.",
        schema: common("DataBinding"),
      },
      range: {
        description: "How much the calendar shows at once.",
        schema: { type: "string", enum: ["week", "month"], default: "week" },
      },
    },
    required: ["date"],
  },
  Pipeline: {
    description:
      "One row per stage with a bar sized by its share of the tasks; stages of kind dropped sit apart.",
    props: {
      stages: {
        description:
          "The stages to show, by name, in order; every stage when left out.",
        schema: common("DynamicStringList"),
      },
    },
    required: [],
  },
  StatTile: {
    description: "One figure with its label, like a count of tasks in a stage.",
    props: {
      label: {
        description: "What the figure is.",
        schema: common("DynamicString"),
      },
      value: {
        description: 'The figure, or a path to it ("/counts/byKind/you").',
        schema: common("DynamicValue"),
      },
      unit: {
        description: "Its unit, beside it.",
        schema: common("DynamicString"),
      },
      tone: {
        description: "A status pair the figure takes.",
        schema: { type: "string", enum: [...VIEW_TONES], default: "neutral" },
      },
    },
    required: ["label", "value"],
  },
  Text: {
    description:
      "Words, in one of the house text roles. Plain text: no links, images or HTML.",
    props: {
      text: { description: "The words.", schema: common("DynamicString") },
      variant: {
        description: "Its text role.",
        schema: { type: "string", enum: [...VIEW_TEXT_ROLES], default: "body" },
      },
    },
    required: ["text"],
  },
  Row: {
    description: "Lays its children out side by side.",
    props: {
      children: CHILDREN,
      justify: {
        description: "How the children share the row's length.",
        schema: {
          type: "string",
          enum: ["start", "center", "end", "spaceBetween"],
          default: "start",
        },
      },
      align: {
        description: "How the children sit across the row.",
        schema: {
          type: "string",
          enum: ["start", "center", "end", "stretch"],
          default: "stretch",
        },
      },
    },
    required: ["children"],
  },
  Column: {
    description: "Lays its children out one under another.",
    props: {
      children: CHILDREN,
      align: {
        description: "How the children sit across the column.",
        schema: {
          type: "string",
          enum: ["start", "center", "end", "stretch"],
          default: "stretch",
        },
      },
    },
    required: ["children"],
  },
  Badge: {
    description: "A short label in a status pair, like a stage's kind.",
    props: {
      text: { description: "The label.", schema: common("DynamicString") },
      tone: {
        description: "The status pair it takes.",
        schema: { type: "string", enum: [...VIEW_TONES], default: "neutral" },
      },
    },
    required: ["text"],
  },
} as const satisfies Record<string, CatalogComponent>;

export type CawcoComponentName = keyof typeof CAWCO_COMPONENTS;

/** The catalog's component names, in the order above. */
export const CAWCO_COMPONENT_NAMES = Object.keys(
  CAWCO_COMPONENTS
) as CawcoComponentName[];

/** The spec's own functions a view may call: pure formatters, nothing that acts. */
export const CAWCO_FUNCTIONS = [
  "formatString",
  "formatNumber",
  "formatDate",
  "pluralize",
] as const;

// --- the props, typed, for the renderers ---------------------------------------

/** A JSON Pointer into the view's data (common_types `DataBinding`). */
export interface DataBinding {
  path: string;
}

/** One of {@link CAWCO_FUNCTIONS}, called by name (common_types `FunctionCall`). */
export interface FunctionCall {
  args?: Record<string, unknown>;
  call: (typeof CAWCO_FUNCTIONS)[number];
  returnType?: "string" | "number" | "boolean" | "array" | "object" | "any";
}

export type DynamicString = string | DataBinding | FunctionCall;
export type DynamicStringList = string[] | DataBinding | FunctionCall;
export type DynamicValue =
  | string
  | number
  | boolean
  | unknown[]
  | DataBinding
  | FunctionCall;
export type ChildList = string[] | { componentId: string; path: string };

/** Every component's own fields (common_types `ComponentCommon`, the catalog's `weight`). */
interface ComponentBase {
  accessibility?: { description?: DynamicString; label?: DynamicString };
  id: string;
  /** Its share of a Row's or Column's length, like CSS flex-grow. */
  weight?: number;
}

export interface BoardProps extends ComponentBase {
  children: ChildList;
  component: "Board";
  title?: DynamicString;
}
export interface StageColumnProps extends ComponentBase {
  component: "StageColumn";
  fields?: string[];
  stage: DynamicString;
}
export interface TaskCardProps extends ComponentBase {
  component: "TaskCard";
  fields?: string[];
  task: DynamicString;
}
export interface TableProps extends ComponentBase {
  columns: { field: string; label: DynamicString }[];
  component: "Table";
  rows?: DataBinding;
}
export interface CalendarProps extends ComponentBase {
  component: "Calendar";
  date: string;
  range?: "week" | "month";
  rows?: DataBinding;
}
export interface PipelineProps extends ComponentBase {
  component: "Pipeline";
  stages?: DynamicStringList;
}
export interface StatTileProps extends ComponentBase {
  component: "StatTile";
  label: DynamicString;
  tone?: ViewTone;
  unit?: DynamicString;
  value: DynamicValue;
}
export interface TextProps extends ComponentBase {
  component: "Text";
  text: DynamicString;
  variant?: ViewTextRole;
}
export interface RowProps extends ComponentBase {
  align?: "start" | "center" | "end" | "stretch";
  children: ChildList;
  component: "Row";
  justify?: "start" | "center" | "end" | "spaceBetween";
}
export interface ColumnProps extends ComponentBase {
  align?: "start" | "center" | "end" | "stretch";
  children: ChildList;
  component: "Column";
}
export interface BadgeProps extends ComponentBase {
  component: "Badge";
  text: DynamicString;
  tone?: ViewTone;
}

/** One component of a view, by its catalog name. */
export type ViewComponent =
  | BoardProps
  | StageColumnProps
  | TaskCardProps
  | TableProps
  | CalendarProps
  | PipelineProps
  | StatTileProps
  | TextProps
  | RowProps
  | ColumnProps
  | BadgeProps;

/**
 * One message of a view: the surface over CawCo's catalog, then its
 * components. A view carries no data of its own (no `updateDataModel`): it
 * binds to the hub's {@link ViewData}.
 */
export type ViewMessage =
  | {
      createSurface: { catalogId: string; surfaceId: string };
      version: "v0.9.1";
    }
  | {
      updateComponents: { components: ViewComponent[]; surfaceId: string };
      version: "v0.9.1";
    };

/** A view's file: its messages, in order (the spec's `server_to_client_list.json`). */
export type ViewSpec = ViewMessage[];

/** A view as `GET /api/projects/:id/views` lists it: kept (`views/<name>.json`) or a draft (`views/drafts/<name>.json`). */
export interface ProjectView {
  draft: boolean;
  name: string;
  spec: ViewSpec;
}

// --- the data a view binds to ----------------------------------------------------

/** The fixed kinds a stage belongs to (WORDS.md: kind). */
export const STAGE_KINDS = [
  "todo",
  "active",
  "waiting",
  "you",
  "done",
  "dropped",
] as const;
export type StageKind = (typeof STAGE_KINDS)[number];

/** One task as a view binds to it. */
export interface ViewTask {
  blockedBy: string[];
  /**
   * Its dates, ms epoch, by name: `updatedAt` always (when the hub last saw
   * its file change); `attemptStartedAt` and `attemptEndedAt` of its newest
   * attempt when it has one; and every field its file carries whose value is
   * an ISO 8601 date, under the field's own name.
   */
  dates: Record<string, number>;
  /** The front matter fields its file carries beyond a task file's own, as written. */
  fields: Record<string, string>;
  id: string;
  /** Its stage's kind; null when its stage is not one of the project's. */
  kind: StageKind | null;
  labels: string[];
  liveAttempt: boolean;
  needsYou: boolean;
  number: number;
  rank: string | null;
  stage: string;
  title: string;
  todos: { done: number; total: number };
  type: string | null;
}

/** One stage as a view binds to it. */
export interface ViewStage {
  /** Tasks in it now. */
  count: number;
  kind: StageKind;
  name: string;
}

/** What a view binds to: `GET /api/projects/:id/view-data`, computed by the hub on every read. */
export interface ViewData {
  counts: { byKind: Record<StageKind, number>; total: number };
  project: { id: string; name: string };
  /** The project's stages, in the order its stages file names them. */
  stages: ViewStage[];
  /** Every task, in rank order. */
  tasks: ViewTask[];
}
