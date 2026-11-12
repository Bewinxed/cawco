/**
 * Components as the stage's docgen reads them, for the Dials face with the
 * state's props under the agent's dials: a delegate's row in the session
 * list (eight props it lists, one the agent made a dial for, a slot and a
 * handler it leaves to pins), a spend tile no agent put a dial on, and a
 * task card with twenty props.
 */
import type { PropMeta } from "@cawco/core/stage";
import type { DialValues, GraphDial } from "../dials";

type Kind = PropMeta["type"]["name"];
const prop = (
  name: string,
  kind: Kind,
  raw: string,
  more: Partial<PropMeta> = {}
): PropMeta => ({
  name,
  type: { name: kind, raw },
  required: false,
  defaultValue: null,
  description: null,
  ...more,
});
const oneOf = (name: string, options: string[], fallback?: string) =>
  prop(name, "enum", options.map((one) => `"${one}"`).join(" | "), {
    options,
    ...(fallback ? { defaultValue: `"${fallback}"` } : {}),
  });
const INK_NAMES = [
  "ink-strong",
  "ink-row",
  "ink-muted",
  "selected-ink",
  "success-9",
  "warning-9",
  "error-9",
];

/** A delegate's row in the session list. */
export const DELEGATE_ROW: PropMeta[] = [
  prop("title", "string", "string", { required: true }),
  oneOf("state", ["working", "waiting", "landed", "failed"]),
  oneOf("harness", ["claude", "opencode", "pi"], "claude"),
  prop("turns", "number", "number", { defaultValue: "0" }),
  prop("cost", "number", "number"),
  prop("branch", "string", "string"),
  prop("showBranch", "boolean", "boolean", { defaultValue: "true" }),
  prop("compact", "boolean", "boolean", { defaultValue: "false" }),
  prop("tint", "token-color", "TokenColor", { options: INK_NAMES }),
  prop("onopen", "function", "(id: string) => void"),
  prop("actions", "slot", "Snippet<[]>"),
];

/** The delegate row's state as its file writes it: a delegate at work. */
export const DELEGATE_ARGS = {
  title: "Fix tray chip overflow when a project has more than nine sessions",
  state: "working",
  harness: "claude",
  turns: 14,
  cost: 2.37,
  branch: "cawco/5d20079d",
  showBranch: true,
  compact: false,
  tint: "selected-ink",
};

/** The longest value each of the delegate row's props holds in a live fleet's rows. */
export const DELEGATE_LONGEST: DialValues = {
  title:
    "Fold the artifact panel's Inspect into the design graph's Dials card, keep Save and Save as new state under the rows, and draw it at 1440 and 390",
  branch: "cawco/5d20079d-fold-the-artifact-panels-inspect-into-dials",
  turns: 412,
  cost: 1834.62,
};

/** The dials the agent put on the delegate row: its height, its glyph's size, and its compact form (the row's own `compact` prop). */
export const DELEGATE_DIALS: GraphDial[] = [
  {
    kind: "number",
    name: "rowHeight",
    label: "Row height",
    min: 32,
    max: 64,
    step: 2,
    unit: "px",
    target: { cssVar: "--spacing-c-row-h" },
  },
  {
    kind: "select",
    name: "glyph",
    label: "Glyph size",
    options: ["16px", "20px", "24px"],
    target: { cssVar: "--spacing-icon-md" },
  },
  {
    kind: "toggle",
    name: "compact",
    label: "Compact",
    target: { arg: "compact" },
  },
];

export const DELEGATE_WRITTEN: DialValues = {
  rowHeight: 44,
  glyph: "20px",
  compact: false,
};

/** Today's spend on the home page's tiles. */
export const SPEND_TILE: PropMeta[] = [
  prop("label", "string", "string", { required: true }),
  prop("amount", "number", "number", { required: true }),
  oneOf("currency", ["USD", "EUR", "GBP"], "USD"),
  oneOf("period", ["today", "this week", "this month", "this quarter"]),
  oneOf("tone", ["neutral", "good", "warn", "bad"], "neutral"),
  prop("trend", "number", "number"),
  prop("showTrend", "boolean", "boolean", { defaultValue: "true" }),
  prop("footer", "slot", "Snippet<[]>"),
];

export const SPEND_ARGS = {
  label: "Spend today",
  amount: 41.86,
  currency: "USD",
  period: "today",
  tone: "warn",
  trend: -12,
  showTrend: true,
};

/** The longest value each of the task card's props holds on a real board. */
export const TASK_LONGEST: DialValues = {
  title:
    "Hub: a session's row says when the person last wrote to it, when they pressed Done, and whether its turn ended waiting on its own work",
  assignee: "design-review delegate on obelisk-of-light",
  estimate: 40,
};

/** A task card on a project's board: twenty props it lists. */
export const TASK_CARD: PropMeta[] = [
  prop("title", "string", "string", { required: true }),
  prop("summary", "string", "string"),
  oneOf("column", ["inbox", "next", "doing", "review", "done"]),
  oneOf("priority", ["low", "normal", "high", "urgent"], "normal"),
  prop("assignee", "string", "string"),
  prop("project", "string", "string"),
  prop("due", "string", "string"),
  prop("estimate", "number", "number"),
  prop("spent", "number", "number"),
  prop("cost", "number", "number"),
  prop("comments", "number", "number", { defaultValue: "0" }),
  prop("attachments", "number", "number", { defaultValue: "0" }),
  prop("pinned", "boolean", "boolean", { defaultValue: "false" }),
  prop("blocked", "boolean", "boolean", { defaultValue: "false" }),
  prop("showProject", "boolean", "boolean", { defaultValue: "true" }),
  prop("showDue", "boolean", "boolean", { defaultValue: "true" }),
  oneOf("density", ["roomy", "regular", "tight"], "regular"),
  prop("accent", "token-color", "TokenColor", { options: INK_NAMES }),
  prop("radius", "token-size", "TokenSize", {
    options: ["radius-sm", "radius-md", "radius-lg"],
  }),
  prop("titleFont", "token-font", "TokenFont", {
    options: ["font-sans", "font-wordmark", "font-mono"],
  }),
  prop("onmove", "function", "(column: Column) => void"),
  prop("badge", "slot", "Snippet<[]>"),
];

export const TASK_ARGS = {
  title: "Move the routine's failure line under its run, not over the form",
  summary:
    "The line stands over the form's foot on a phone and hides Create routine until the keyboard closes.",
  column: "review",
  priority: "high",
  assignee: "design delegate",
  project: "cockpit",
  due: "2026-11-12",
  estimate: 3,
  spent: 2.5,
  cost: 6.12,
  comments: 7,
  attachments: 2,
  pinned: true,
  blocked: false,
  showProject: true,
  showDue: true,
  density: "regular",
  accent: "selected-ink",
  radius: "radius-md",
  titleFont: "font-sans",
};
