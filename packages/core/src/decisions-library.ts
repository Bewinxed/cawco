/**
 * CawCo's decision library (Projects spec §5.8): every component a decision
 * page may name, in OpenUI Lang's terms (`@openuidev/lang-core`, MIT). A
 * session writes a decision page as a program over it; the hub parses it
 * with the schema `scripts/openui-views.ts` generates from this file
 * (`decisions-spec.json`), and the page's host (agent `decision-host/`) draws
 * it with Svelte renderers on the kit's card recipe.
 *
 * Beside the view library, on the same runtime, with its own prompt: a view
 * reads the project's data through `Query()` and never shows media; a
 * decision page asks the person to pick, shows media, and runs no `Query()`.
 * Text, Badge, Row and Column are the view library's, by name and shape.
 *
 * A page cannot run code or reach the network: the library has no action,
 * link or input, and media name files beside the program or artifacts the
 * hub keeps, by id.
 */
import {
  createLibrary,
  defineComponent,
  type Library,
  type PromptOptions,
} from "@openuidev/lang-core";
import { z } from "zod";
import { VIEW_TEXT_ROLES, VIEW_TONES } from "./views";

/** Every component a decision page may name, in the order the prompt lists them. */
export const DECISION_COMPONENTS = [
  "Decisions",
  "Section",
  "Decision",
  "Option",
  "Image",
  "Diagram",
  "Canvas",
  "Preview",
  "Dials",
  "Text",
  "Badge",
  "Row",
  "Column",
] as const;
export type DecisionComponentName = (typeof DECISION_COMPONENTS)[number];

/** The component a decision page's `root` is. */
export const DECISION_ROOT: DecisionComponentName = "Decisions";

/** A decision's or an option's id: lowercase, and never changed, since picks are kept by it. */
export const DECISION_ID = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** A decision another names in `after`: its id on the same page, or `page#id` on another. */
export const AFTER_REF =
  /^(?:([a-z0-9][a-z0-9-]{0,62})#)?([a-z0-9][a-z0-9-]{0,62})$/;

/** An artifact's id, as artifact_create answers it. */
export const ARTIFACT_ID = /^[0-9a-f-]{36}$/;

/**
 * The library over `renderers`, one per component, by name: the host page's
 * Svelte components, or nothing (`null`) where only the schema and the
 * prompt are read.
 */
export const decisionLibrary = <C>(
  renderers: Record<DecisionComponentName, C>
): Required<Library<C>> => {
  const define = <T extends z.ZodObject>(
    name: DecisionComponentName,
    description: string,
    props: T
  ) =>
    defineComponent({ name, description, props, component: renderers[name] });

  const caption = z.string().optional().describe("A line under it.");

  const Text = define(
    "Text",
    "Words, in one of the house text roles. Plain text.",
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
    "A short label in a status pair.",
    z.object({
      text: z.string(),
      tone: z.enum(VIEW_TONES).optional().describe('"neutral" when left out.'),
    })
  );
  const Image = define(
    "Image",
    "A picture: a file beside the program in your work folder, or an absolute path on your machine (a generate_image result).",
    z.object({
      file: z.string().describe('Like "shots/hero.png".'),
      alt: z.string().describe("What it shows, in one sentence."),
      caption,
    })
  );
  const Diagram = define(
    "Diagram",
    "A Mermaid diagram, drawn on the house look: any type Mermaid has (flowchart, sequenceDiagram, gantt, stateDiagram-v2, erDiagram, classDiagram, mindmap, timeline…).",
    z.object({
      mermaid: z
        .string()
        .describe(
          'Mermaid text, lines split with \\n: "flowchart LR\\nA --> B".'
        ),
      caption,
    })
  );
  const Canvas = define(
    "Canvas",
    "A drawing: a canvas artifact you made with artifact_create (kind canvas), shown at its box.",
    z.object({
      artifact: z.string().describe("The canvas's id."),
      caption,
    })
  );
  const Preview = define(
    "Preview",
    "A page artifact of yours live in a frame: an animated mockup you made with artifact_create (kind page, html), say.",
    z.object({
      artifact: z.string().describe("The page's id."),
      caption,
    })
  );
  const Dials = define(
    "Dials",
    "Controls for values the person tunes rather than picks, drawn where you put it; artifact_read answers them as the dials entry's value, by panel name and path.",
    z.object({
      name: z.string().describe('The panel\'s name, like "Card".'),
      config: z
        .record(z.string(), z.unknown())
        .describe(
          'Each value by name: a number as [default, min, max] or [default, min, max, step], a colour as "#rrggbb", a switch as true or false, a menu as a list of words, a field as words; a nested object is a group. Like {radius: [12, 0, 32], accent: "#e65d46", shadow: {blur: [8, 0, 40]}}.'
        ),
    })
  );
  // A piece of media, or words, wherever the page shows one.
  const media: z.ZodType = z.lazy(() =>
    z.union([
      Image.ref,
      Diagram.ref,
      Canvas.ref,
      Preview.ref,
      Text.ref,
      Badge.ref,
      Row.ref,
      Column.ref,
    ])
  );
  const align = z
    .enum(["start", "center", "end", "stretch"])
    .optional()
    .describe('How the children sit across it; "stretch" when left out.');
  const Row = define(
    "Row",
    "Lays media side by side, wrapping where they do not fit.",
    z.object({
      children: z.array(media),
      justify: z
        .enum(["start", "center", "end", "spaceBetween"])
        .optional()
        .describe('"start" when left out.'),
      align,
    })
  );
  const Column = define(
    "Column",
    "Lays media one under another.",
    z.object({ children: z.array(media), align })
  );
  const Option = define(
    "Option",
    "One answer to a decision: what the person gets, in a few words.",
    z.object({
      id: z.string().describe("Lowercase, never changed."),
      label: z.string(),
      line: z.string().optional().describe("What it means, in one line."),
      recommended: z.boolean().optional().describe("Your recommendation."),
      media: z.array(media).optional().describe("Shown inside the option."),
    })
  );
  const Decision = define(
    "Decision",
    "One question the person picks on: a card with its options, a note, and a state line.",
    z.object({
      id: z
        .string()
        .describe("Lowercase, never changed: the pick is kept by it."),
      question: z.string(),
      options: z.array(Option.ref).describe("2 to 5."),
      why: z
        .string()
        .optional()
        .describe("Why it is asked; what happens today."),
      media: z
        .array(z.union([media, Dials.ref]))
        .optional()
        .describe("Shown between the why and the options."),
      after: z
        .array(z.string())
        .optional()
        .describe(
          'The decisions this one depends on: an id on this page, or "page#id" on another.'
        ),
      multiple: z
        .boolean()
        .optional()
        .describe("Several options may be picked."),
    })
  );
  const Section = define(
    "Section",
    "A heading over some decisions: a group on the decision graph.",
    z.object({
      title: z.string(),
      children: z.array(z.union([Decision.ref, Dials.ref, media])),
    })
  );
  const Decisions = define(
    "Decisions",
    "The page: its title, Caw, the count picked, Send picks. The root.",
    z.object({
      title: z.string(),
      children: z.array(z.union([Section.ref, Decision.ref, Dials.ref, media])),
      intro: z
        .string()
        .optional()
        .describe("Why these decisions, and what happens with the picks."),
    })
  );

  return createLibrary({
    components: [
      Decisions,
      Section,
      Decision,
      Option,
      Image,
      Diagram,
      Canvas,
      Preview,
      Dials,
      Text,
      Badge,
      Row,
      Column,
    ],
    root: DECISION_ROOT,
  });
};

// --- dials ---------------------------------------------------------------------

/** One value a Dials panel tunes: its path in the panel, the control it is drawn as, and where it starts. */
export type Dial = { path: string } & (
  | { initial: number; kind: "range"; max: number; min: number; step: number }
  | { initial: string; kind: "colour" }
  | { initial: boolean; kind: "switch" }
  | { choices: string[]; initial: string; kind: "menu" }
  | { initial: string; kind: "words" }
);

const HEX = /^#[0-9a-f]{6}$/i;
/** Values a panel tunes at most. Our bound: a set value stops at 2,000 characters of JSON. */
const DIALS_MAX = 24;

/** One config value as its control; a problem when no control draws it. */
const dialOf = (path: string, value: unknown): Dial | string => {
  if (typeof value === "boolean") {
    return { path, kind: "switch", initial: value };
  }
  if (typeof value === "string") {
    return HEX.test(value)
      ? { path, kind: "colour", initial: value }
      : { path, kind: "words", initial: value };
  }
  if (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((each) => typeof each === "string")
  ) {
    return { path, kind: "menu", choices: value, initial: value[0] };
  }
  const [initial, min, max, step] = Array.isArray(value) ? value : [];
  if (
    [initial, min, max].every((each) => typeof each === "number") &&
    (step === undefined || typeof step === "number") &&
    (min as number) < (max as number)
  ) {
    return {
      path,
      kind: "range",
      initial: initial as number,
      min: min as number,
      max: max as number,
      step:
        (step as number | undefined) ??
        ((max as number) - (min as number) > 10 ? 1 : 0.01),
    };
  }
  return `${path}: ${String(JSON.stringify(value)).slice(0, 40)} is no control: a number is [default, min, max] or [default, min, max, step], a colour "#rrggbb", a switch true or false, a menu a list of words, a field words.`;
};

/**
 * A Dials config as its controls, nested groups as dotted paths
 * (`{shadow: {blur: [8, 0, 40]}}` is `shadow.blur`), and what no control
 * draws, a sentence each.
 */
export const dialsOf = (
  config: Record<string, unknown>
): { dials: Dial[]; problems: string[] } => {
  const dials: Dial[] = [];
  const problems: string[] = [];
  const walk = (group: Record<string, unknown>, prefix: string): void => {
    for (const [key, value] of Object.entries(group)) {
      const path = `${prefix}${key}`;
      if (value && typeof value === "object" && !Array.isArray(value)) {
        walk(value as Record<string, unknown>, `${path}.`);
        continue;
      }
      const dial = dialOf(path, value);
      if (typeof dial === "string") {
        problems.push(dial);
      } else {
        dials.push(dial);
      }
    }
  };
  walk(config, "");
  if (dials.length > DIALS_MAX) {
    problems.push(
      `${dials.length} values: a panel tunes ${DIALS_MAX} at most; split it.`
    );
  }
  return { dials, problems };
};

// --- the prompt ----------------------------------------------------------------

/** One page, as the prompt shows it: two decisions, a diagram, an edge. */
const EXAMPLE = `root = Decisions("Price the hosted plan", [shape, trial], "Two choices before the pricing page is built.")
shape = Decision("shape", "What does a customer pay for?", [seat, machine], "Today: one price for everyone.")
seat = Option("seat", "Per seat", "Each person on the team.")
machine = Option("machine", "Per machine", "Each machine that joins the fleet.", true)
trial = Decision("trial", "How long is the trial?", [week, month], "The call to action names it.", [path], ["shape"])
week = Option("week", "A week")
month = Option("month", "A month", "Thirty days, then pay.")
path = Diagram("flowchart LR\\nSign up --> Trial --> Pay", "Where a trial leads")`;

/** One revision, as the prompt shows it: a reworded decision and a new option, merged by name. */
const EDIT = `trial = Decision("trial", "How long is the free trial?", [week, month, quarter], "The call to action names it.", [path], ["shape"])
quarter = Option("quarter", "A quarter")`;

/**
 * What the prompt is generated with: no tools, no bindings, no built-in
 * functions (a page holds the agent's words and the person's picks, never
 * data), edit mode for revisions, and the rules that keep picks by id.
 */
export const decisionPromptOptions = (): PromptOptions => ({
  preamble:
    "You write a CawCo decision page: one OpenUI Lang program over CawCo's decision library, passed to artifact_create as `program` (or written as page.oui in your work folder, passed as `dir`). Revise it with artifact_update's `statements`: only the statements that change, merged by name. The program is openui-lang alone: no markdown fences, no explanations.",
  toolCalls: false,
  bindings: false,
  builtinFunctions: false,
  editMode: true,
  examples: [EXAMPLE, EDIT],
  additionalRules: [
    "Every Decision has 2 to 5 Options with your recommendation marked. Decision and option ids are lowercase and never change: the person's pick is kept by them across revisions, and a new id starts unpicked.",
    "Put media where the reader needs it: in an Option's media, in a Decision's media (between its why and its options), or between decisions.",
    "after names what a decision depends on, and a Section groups decisions; both draw the project's decision graph. Leave them out when the decisions stand alone.",
    "Plain words everywhere: no URLs or markup. Canvas and Preview name an artifact by its id; Image names a file.",
  ],
});
