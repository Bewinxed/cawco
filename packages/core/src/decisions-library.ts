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
    "Another artifact of yours live in a frame: a page (an animated mockup in HTML, say), a dev server's preview, or a sheet. A component canvas shows the component alone: the stories `stories` names, in that order (every story, in its file's order, when it names none), each at its own size and centred, one wider than the card scaled down to fit it, and one too wide to fit with its words still 10px scrolling sideways.",
    z.object({
      artifact: z.string().describe("Its id."),
      caption,
      stories: z
        .array(z.string())
        .optional()
        .describe(
          'A component canvas\'s stories to show, by their export names, like ["Review", "PhoneReview"]; every story when left out.'
        ),
    })
  );
  const Dials = define(
    "Dials",
    "Controls for values the person tunes rather than picks: a DialKit panel at the page's foot. artifact_read answers them as the dials entry's value, by panel name and path.",
    z.object({
      name: z.string().describe('The panel\'s name, like "Card".'),
      config: z
        .record(z.string(), z.unknown())
        .describe(
          'DialKit controls by name (github.com/joshpuckett/dialkit#controls): a number as [default, min, max], a colour as "#hex", a boolean, a string; like {radius: [12, 0, 32], accent: "#e65d46"}.'
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
    "One answer to a decision, in a few words.",
    z.object({
      id: z.string().describe("Lowercase, never changed."),
      label: z.string(),
      line: z
        .string()
        .optional()
        .describe("What it gets the person, in one line."),
      recommended: z
        .boolean()
        .optional()
        .describe("Your one recommendation on the card."),
      media: z
        .array(media)
        .optional()
        .describe(
          "Its design, drawn live under its pick, which the person can operate."
        ),
      cost: z.string().optional().describe("What it costs them, in one line."),
      current: z
        .boolean()
        .optional()
        .describe("What stands today: its card shows it as Current."),
    })
  );
  const Decision = define(
    "Decision",
    "One question the person picks on: a card with its options and a note. Once picked and the person presses Continue, it folds to one line.",
    z.object({
      id: z
        .string()
        .describe("Lowercase, never changed: the pick is kept by it."),
      question: z.string(),
      options: z.array(Option.ref).describe("2 to 5."),
      why: z
        .string()
        .optional()
        .describe("Why you recommend the option you marked, in one sentence."),
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
      note: z
        .string()
        .optional()
        .describe(
          'What the note is for, a noun phrase its button finishes ("Add <note>") and its field asks for. Left out, it reads "Add a note".'
        ),
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

// --- the prompt ----------------------------------------------------------------

/** One page, as the prompt shows it: two decisions, a diagram, an edge. */
const EXAMPLE = `root = Decisions("Price the hosted plan", [shape, trial])
shape = Decision("shape", "What does a customer pay for?", [seat, machine], "A machine is what the fleet costs to run.")
seat = Option("seat", "Per seat", "Each person on the team pays.", false, [], "A solo builder with five machines pays once.")
machine = Option("machine", "Per machine", "Each machine that joins the fleet pays.", true, [], "A team on one machine pays once.")
trial = Decision("trial", "How long is the trial?", [week, month], "A month covers a whole project.", [path], ["shape"])
week = Option("week", "A week", "People decide fast.", false, [], "Too short to finish a real project.")
month = Option("month", "A month", "Thirty days, then pay.", true, [], "Revenue starts a month later.")
path = Diagram("flowchart LR\\nSign up --> Trial --> Pay", "Where a trial leads")`;

/** One revision, as the prompt shows it: a reworded decision and a new option, merged by name. */
const EDIT = `trial = Decision("trial", "How long is the free trial?", [week, month, quarter], "A month covers a whole project.", [path], ["shape"])
quarter = Option("quarter", "A quarter", "Time for a team to settle in.", false, [], "A season of hosting unpaid.")`;

/**
 * What the prompt is generated with: no tools, no bindings, no built-in
 * functions (a page holds the agent's words and the person's picks, never
 * data), edit mode for revisions, and the rules that keep picks by id.
 */
export const decisionPromptOptions = (): PromptOptions => ({
  preamble:
    "You write a CawCo decision page: one OpenUI Lang program over CawCo's decision library, passed to artifact_create as `program` with `does: \"pick\"` and an `ask` (or written as page.oui in your work folder, passed as `dir`). Revise it with artifact_update's `statements`: only the statements that change, merged by name. The program is openui-lang alone: no markdown fences, no explanations.",
  toolCalls: false,
  bindings: false,
  builtinFunctions: false,
  editMode: true,
  examples: [EXAMPLE, EDIT],
  additionalRules: [
    "Every Decision asks one question in plain words and has 2 to 5 Options, each with its line (what it gets) and its cost; exactly one is recommended, and the Decision's why says why. Order decisions so each comes after those it depends on. Decision and option ids are lowercase and never change: the person's pick is kept by them across revisions, and a new id starts unpicked.",
    "Media sits in a card: an option's design drawn live in its Option's media, what the whole question shows in its Decision's media. No legends, no size or id captions.",
    "after names what a decision depends on, and a Section groups decisions; both draw the project's decision graph. Leave them out when the decisions stand alone.",
    "Plain words everywhere: no URLs or markup. Canvas and Preview name an artifact by its id; Image names a file.",
    'Every character is one the house face (Figtree) draws. It draws ← → ↑ ↓, … · • – —, × ÷ ± ≠ ≤ ≥, « » ‹ › and ° € £ ©; it lacks ✓ ✗ ✕, the key symbols ⌘ ⌥ ⇧ ⌃ ⎋ ↵, ↔, ≈, ′ ″ and every emoji. Say those in words ("Done", "Command-K", "a paperclip"), and name an icon in words ("Attach"). The hub refuses a program holding a character Figtree lacks, naming its card and string.',
    'A Decision\'s note is what its note field asks for, a noun phrase its button finishes: "Add <note>". Leave it out for the plain "Add a note"; give it only when the pick needs a particular note ("a reason for the rollback").',
  ],
});
