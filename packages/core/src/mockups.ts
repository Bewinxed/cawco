/**
 * A project's mockup library (Projects spec §5.7, "Design files"): OpenUI
 * Lang over components that draw a screen that does not exist yet, filled
 * with sample data written into the program. The opposite stance of a view
 * (views-library.ts), which reads the project's data and may never make it
 * up; so the two are separate libraries with separate prompts.
 *
 * One library per project, from the design system in its `design/` folder,
 * described by `design/manifest.json` ({@link designManifest}):
 * - the primitives every project gets ({@link MOCKUP_PRIMITIVES}), drawn
 *   only with the roles the manifest maps onto the project's token CSS
 *   ({@link MOCKUP_ROLES}); a role it leaves out is neutral, never CawCo's;
 * - each of its component specimens as a component of its own, props as
 *   the manifest declares them, drawn from its HTML template;
 * - its assets, by name (`Image`);
 * - and, for a project whose UI is CawCo's own (`system: "cawco"`), CawCo's
 *   dashboard components on top ({@link CAWCO_COMPONENTS}).
 *
 * The hub builds the parser's schema and the prompt from it (hub
 * mockups.ts), and the dashboard the same library over its Svelte
 * renderers, so the check and the drawing read a mockup alike. A mockup
 * runs no code and reaches nothing: the library has no action, link or
 * Query, and an image is one of the project's assets by name.
 */
import {
  createLibrary,
  type DefinedComponent,
  defineComponent,
  generateSystemPrompt,
  type Library,
  type LibraryJSONSchema,
  type PromptOptions,
} from "@openuidev/lang-core";
import { z } from "zod";

/** The longest program a mockup may be. */
export const MOCKUP_SOURCE_MAX = 64 * 1024;

// --- the design a project's mockups are drawn in -----------------------------

/**
 * What the primitives are drawn with. A project names its tokens for its own
 * roles; its manifest maps these onto them (`"accent": "var(--brand)"`), so
 * a primitive reads `--mk-accent` and never a project's own name.
 */
export const MOCKUP_ROLES = [
  "canvas",
  "surface",
  "sunken",
  "ink",
  "muted",
  "line",
  "accent",
  "onAccent",
  "positive",
  "caution",
  "critical",
  "fontBody",
  "fontDisplay",
  "textSize",
  "space",
  "radius",
  "radiusSmall",
  "shadow",
] as const;
export type MockupRole = (typeof MOCKUP_ROLES)[number];

/** What each role is for, as the manifest's author reads it. */
export const MOCKUP_ROLE_NOTES: Record<MockupRole, string> = {
  canvas: "the page behind everything (a colour)",
  surface: "a card's, a dialog's and a device's face (a colour)",
  sunken: "an input's well, a selected row, a track (a colour)",
  ink: "text (a colour)",
  muted: "secondary text (a colour)",
  line: "borders and hairlines (a colour)",
  accent: "the primary action, the chosen tab (a colour)",
  onAccent: "text on the accent (a colour)",
  positive: "done, success (a colour)",
  caution: "waiting, warning (a colour)",
  critical: "failed, destructive (a colour)",
  fontBody: "body text (a font-family list)",
  fontDisplay: "headings (a font-family list)",
  textSize: "body text's size (a length)",
  space: "one spacing step; gaps are multiples of it (a length)",
  radius: "a card's corners (a length)",
  radiusSmall: "a control's corners (a length)",
  shadow: "a raised surface's shadow (a box-shadow)",
};

const COMPONENT_NAME = /^[A-Z][A-Za-z0-9]{1,40}$/;
const PROP_NAME = /^[a-z][A-Za-z0-9]{0,40}$/;
const ASSET_NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** One prop of a specimen, as its manifest declares it. */
export const specimenProp = z
  .object({
    type: z.enum(["string", "number", "boolean", "enum"]),
    values: z
      .array(z.string().min(1).max(60))
      .min(1)
      .max(20)
      .optional()
      .describe('An "enum" prop\'s values.'),
    optional: z.boolean().optional(),
    description: z.string().max(200).optional(),
  })
  .refine((prop) => (prop.type === "enum") === (prop.values !== undefined), {
    message: 'an "enum" prop lists its values, and only an "enum" prop does',
  });
export type SpecimenProp = z.infer<typeof specimenProp>;

/**
 * `design/manifest.json`: where the project's design system is and what of
 * it a mockup may name. Its other keys (where each value came from, notes)
 * are the design's own and are kept as they are.
 */
export const designManifest = z
  .object({
    system: z
      .literal("cawco")
      .optional()
      .describe(
        "The project's UI is CawCo's own dashboard: its mockups get CawCo's components, drawn with the dashboard's own tokens."
      ),
    css: z
      .array(z.string().min(1))
      .max(8)
      .optional()
      .describe(
        "The token and component CSS, paths inside design/, in cascade order. Fonts are its @font-face rules."
      ),
    roles: z
      .partialRecord(z.enum(MOCKUP_ROLES), z.string().min(1).max(240))
      .optional()
      .describe(
        'Each primitive role as a CSS value over the project\'s tokens, like "var(--brand)".'
      ),
    assets: z
      .array(
        z.object({
          name: z.string().regex(ASSET_NAME),
          file: z.string().min(1).describe("A path inside design/."),
          alt: z.string().max(200),
        })
      )
      .max(64)
      .optional(),
    specimens: z
      .array(
        z.object({
          name: z.string().regex(COMPONENT_NAME),
          description: z.string().min(1).max(400),
          template: z
            .string()
            .min(1)
            .describe(
              "An HTML file inside design/: {{prop}} where a prop's value goes, <slot></slot> where its children go, asset:<name> for an image."
            ),
          props: z.record(z.string().regex(PROP_NAME), specimenProp).optional(),
        })
      )
      .max(32)
      .optional(),
  })
  .loose();
export type DesignManifest = z.infer<typeof designManifest>;

// --- a specimen's template ----------------------------------------------------

/** Where a prop's value goes in a template: `{{name}}`. */
export const SPECIMEN_PLACEHOLDER = /\{\{\s*([a-z][A-Za-z0-9]{0,40})\s*\}\}/g;
/** An image of the project's in a template: `src="asset:<name>"`. */
export const ASSET_REF = /^asset:([a-z0-9][a-z0-9-]{0,62})$/;

/**
 * The elements a template may hold: markup that draws, nothing that runs,
 * loads, embeds or submits. `slot` is where its children go.
 */
export const SPECIMEN_ELEMENTS: ReadonlySet<string> = new Set([
  ..."div span p h1 h2 h3 h4 h5 h6 ul ol li dl dt dd strong em b i u s small mark code pre kbd samp var sub sup del ins blockquote q cite abbr time figure figcaption img button label input textarea select option optgroup fieldset legend progress meter output table caption colgroup col thead tbody tfoot tr th td header footer section article aside nav main hr br details summary a slot".split(
    " "
  ),
  ..."svg g path circle ellipse line polyline polygon rect text tspan defs lineargradient radialgradient stop clippath mask pattern title desc".split(
    " "
  ),
]);

/** Attributes that reach out of the page whatever their value. */
const REACHING = new Set([
  "srcset",
  "action",
  "formaction",
  "poster",
  "background",
  "ping",
  "data",
  "codebase",
  "manifest",
  "lowsrc",
]);
const STYLE_LOADS = /url\s*\(|expression\s*\(|@import/i;

/**
 * Why `name="value"` may not stand in a template, or null when it may: it
 * would run code, load something, or link out.
 */
export const specimenAttributeProblem = (
  name: string,
  value: string
): string | null => {
  const lower = name.toLowerCase();
  if (lower.startsWith("on")) {
    return `${name} runs code`;
  }
  if (lower === "href" || lower === "xlink:href") {
    return value === "" || value.startsWith("#")
      ? null
      : `${name}="${value.slice(0, 60)}" links out; a template links nowhere`;
  }
  if (lower === "src") {
    return ASSET_REF.test(value)
      ? null
      : `src="${value.slice(0, 60)}" loads from outside; name one of the project's assets as asset:<name>`;
  }
  if (REACHING.has(lower)) {
    return `${name} reaches outside the page`;
  }
  if (lower === "style" && STYLE_LOADS.test(value)) {
    return "a style attribute that loads something";
  }
  return null;
};

/** A specimen as its library component is made: its props, and whether its template takes children. */
export interface MockupSpecimen {
  description: string;
  name: string;
  props: Record<string, SpecimenProp>;
  /** Its template has a `<slot>`: it takes `children`. */
  slot: boolean;
}

/** What a project's mockup library is made from. */
export interface MockupDesign {
  /** Asset names, for `Image`. */
  assets: string[];
  specimens: MockupSpecimen[];
  system: "cawco" | null;
}

/** A font of the project's design: its own name, the file, and the descriptors its @font-face gave. */
export interface MockupFont {
  /** Its other descriptors, as @font-face wrote them (`weight`, `style`, `display`, …). */
  descriptors: Record<string, string>;
  /** The family's name in a mockup: the project's, made its own (`mk-<hash>-<name>`). */
  family: string;
  /** The file in the project's folder, `design/…`. */
  file: string;
  /** The project's own name for it. */
  name: string;
}

/** A project's mockup library, as the hub answers it and the dashboard draws a mockup with it. */
export interface ProjectMockups {
  assets: { alt: string; file: string; name: string }[];
  /** The project's CSS, read for a shadow root; empty with no design, or CawCo's own. */
  css: string;
  design: MockupDesign;
  fonts: MockupFont[];
  /** The design's content hash: the library changes only when it does. */
  hash: string;
  /** What an agent reads to write a mockup for this project. */
  prompt: string;
  roles: Partial<Record<MockupRole, string>>;
  /** Each specimen's template, checked, by component name. */
  templates: Record<string, string>;
}

/** The URL a mockup loads one of its project's design files from (hub mockups.ts). */
export const designFileUrl = (projectId: string, file: string): string =>
  `/api/projects/${encodeURIComponent(projectId)}/mockups/file?path=${encodeURIComponent(file)}`;

/** A project with no `design/`: the primitives alone, neutral. */
export const NEUTRAL_DESIGN: MockupDesign = {
  system: null,
  assets: [],
  specimens: [],
};

// --- the components ----------------------------------------------------------

/** Every project's primitives, in the order the prompt lists them. */
export const MOCKUP_PRIMITIVES = [
  "Stack",
  "Grid",
  "Text",
  "Badge",
  "Button",
  "Input",
  "Switch",
  "Card",
  "Image",
  "Nav",
  "Tabs",
  "ListRow",
  "Dialog",
  "Device",
  "Annotation",
  "States",
] as const;
export type MockupPrimitive = (typeof MOCKUP_PRIMITIVES)[number];

/** CawCo's dashboard components, for a project whose UI is CawCo's own. */
export const CAWCO_COMPONENTS = [
  "SessionRow",
  "Message",
  "ToolCalls",
  "Composer",
  "TaskCard",
  "BoardColumn",
  "MachineRow",
  "Alert",
] as const;
export type CawcoComponent = (typeof CAWCO_COMPONENTS)[number];

/** A mockup's root. */
export const MOCKUP_ROOT: MockupPrimitive = "Stack";

/** Names a specimen may not take: the library's own, and OpenUI Lang's. */
export const RESERVED_NAMES: ReadonlySet<string> = new Set([
  ...MOCKUP_PRIMITIVES,
  ...CAWCO_COMPONENTS,
  "Query",
  "Mutation",
  "Action",
  "Each",
]);

/** The renderer of each component, by name; one renderer draws every specimen. */
export type MockupRenderers<C> = Record<
  MockupPrimitive | CawcoComponent | "Specimen",
  C
>;

const SESSION_STATES = [
  "working",
  "needs-you",
  "idle",
  "done",
  "failed",
] as const;
const STAGE_KINDS = [
  "todo",
  "active",
  "waiting",
  "you",
  "done",
  "dropped",
] as const;
const TONES = ["neutral", "accent", "positive", "caution", "critical"] as const;
const GAPS = ["none", "small", "medium", "large"] as const;

/** A specimen's prop as Zod: what the parser checks a call against. */
const PROP_TYPES: Record<
  Exclude<SpecimenProp["type"], "enum">,
  () => z.ZodType
> = {
  string: () => z.string(),
  number: () => z.number(),
  boolean: () => z.boolean(),
};
const propSchema = (prop: SpecimenProp): z.ZodType => {
  const base =
    prop.type === "enum"
      ? z.enum(prop.values as [string, ...string[]])
      : PROP_TYPES[prop.type]();
  const described = prop.description ? base.describe(prop.description) : base;
  return prop.optional ? described.optional() : described;
};

/**
 * The library for `design`, over `renderers`: the dashboard's Svelte
 * components, or `null` where only the schema and the prompt are read.
 */
export const mockupLibrary = <C>(
  renderers: MockupRenderers<C>,
  design: MockupDesign
): Required<Library<C>> => {
  // biome-ignore lint/suspicious/noExplicitAny: a library holds components of every prop shape
  const all: DefinedComponent<any, C>[] = [];
  const define = <T extends z.ZodObject>(
    name: string,
    description: string,
    props: T,
    component: C
  ) => {
    const defined = defineComponent({ name, description, props, component });
    all.push(defined);
    return defined;
  };
  const primitive = <T extends z.ZodObject>(
    name: MockupPrimitive,
    description: string,
    props: T
  ) => define(name, description, props, renderers[name]);
  const cawco = <T extends z.ZodObject>(
    name: CawcoComponent,
    description: string,
    props: T
  ) => define(name, description, props, renderers[name]);

  // Any component of the library, layouts included: what a layout holds.
  const child: z.ZodType = z.lazy(() =>
    z.union(all.map((each) => each.ref) as [z.ZodType, ...z.ZodType[]])
  );
  const children = z.array(child);
  const gap = z.enum(GAPS).optional().describe('"medium" when left out.');
  const tone = z.enum(TONES).optional().describe('"neutral" when left out.');

  primitive(
    "Stack",
    "Lays its children out one under another, or side by side (`across`). A mockup's root.",
    z.object({
      children,
      across: z.boolean().optional().describe("Side by side, wrapping."),
      gap,
      align: z
        .enum(["start", "center", "end", "stretch"])
        .optional()
        .describe('How the children sit across it; "stretch" when left out.'),
      justify: z
        .enum(["start", "center", "end", "between"])
        .optional()
        .describe('How the children share its length; "start" when left out.'),
      pad: z
        .enum(GAPS)
        .optional()
        .describe('Its inner margin; "none" when left out.'),
    })
  );
  primitive(
    "Grid",
    "Lays its children out in equal columns, row after row.",
    z.object({
      children,
      columns: z.number().int().min(1).max(6),
      gap,
    })
  );
  primitive(
    "Text",
    "Words in one of the text roles. Plain text: no links or markup.",
    z.object({
      text: z.string(),
      role: z
        .enum(["display", "title", "heading", "body", "label", "meta"])
        .optional()
        .describe('"body" when left out.'),
      tone: z
        .enum(["ink", "muted", "accent", "positive", "caution", "critical"])
        .optional()
        .describe('"ink" when left out.'),
    })
  );
  primitive(
    "Badge",
    "A short status label.",
    z.object({ text: z.string(), tone })
  );
  const Button = primitive(
    "Button",
    "A button, drawn as it looks; it does nothing.",
    z.object({
      label: z.string(),
      variant: z
        .enum(["primary", "secondary", "quiet", "danger"])
        .optional()
        .describe('"secondary" when left out.'),
      size: z
        .enum(["small", "medium"])
        .optional()
        .describe('"medium" when left out.'),
    })
  );
  primitive(
    "Input",
    "A text field with its label, holding `value` or showing `placeholder`; `multiline` for a text area. It takes no typing.",
    z.object({
      label: z.string().optional(),
      value: z.string().optional(),
      placeholder: z.string().optional(),
      multiline: z.boolean().optional(),
    })
  );
  primitive(
    "Switch",
    "An on/off switch with its label, drawn on or off.",
    z.object({ label: z.string(), on: z.boolean().optional() })
  );
  primitive(
    "Card",
    "A surface holding its children, with an optional title over them.",
    z.object({
      children,
      title: z.string().optional(),
      raised: z
        .boolean()
        .optional()
        .describe("Lifted with the shadow, rather than outlined."),
    })
  );
  if (design.assets.length > 0) {
    primitive(
      "Image",
      "One of the project's own images, by its asset name.",
      z.object({
        asset: z.enum(design.assets as [string, ...string[]]),
        height: z
          .number()
          .int()
          .min(16)
          .max(1200)
          .optional()
          .describe("Its height in px; its own shape when left out."),
        fit: z
          .enum(["cover", "contain"])
          .optional()
          .describe('"cover" when left out.'),
      })
    );
  }
  primitive(
    "Nav",
    "Navigation: a bar of places side by side (`across`), or a list one under another, one of them where you are.",
    z.object({
      items: z.array(z.string()).min(1),
      active: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Which item is where you are, from 0."),
      across: z.boolean().optional(),
    })
  );
  primitive(
    "Tabs",
    "A strip of tabs, one of them chosen.",
    z.object({
      items: z.array(z.string()).min(1),
      active: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Which tab is chosen, from 0; 0 when left out."),
    })
  );
  primitive(
    "ListRow",
    "One row of a list: a title, a meta line under it, a short leading mark and a trailing value.",
    z.object({
      title: z.string(),
      meta: z.string().optional(),
      leading: z
        .string()
        .max(3)
        .optional()
        .describe("Up to three characters in a tile, like initials."),
      trailing: z.string().optional(),
      selected: z.boolean().optional(),
    })
  );
  primitive(
    "Dialog",
    "A dialog drawn open: its title, its body and its buttons, over `over` (the screen behind it, dimmed) when given.",
    z.object({
      title: z.string(),
      children,
      actions: z.array(Button.ref).optional(),
      over: child.optional().describe("The screen the dialog opens over."),
    })
  );
  primitive(
    "Device",
    "A frame the size of a screen: a desk window, a tablet or a phone, its children the screen inside.",
    z.object({
      kind: z.enum(["desk", "tablet", "phone"]),
      children,
      title: z
        .string()
        .optional()
        .describe("A desk window's title bar; a phone's status bar."),
    })
  );
  primitive(
    "Annotation",
    "A numbered callout on one part of the mockup: the part outlined, the note beside it.",
    z.object({
      child,
      note: z.string(),
      number: z.number().int().min(1).max(99).optional(),
      changed: z
        .boolean()
        .optional()
        .describe("Marks the part as what changed, not only what it is."),
    })
  );
  primitive(
    "States",
    "One part shown in each of its states, a switch over it choosing which: `children` holds one state for each label, in order.",
    z.object({
      labels: z.array(z.string()).min(2),
      children,
      active: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Which state shows first, from 0; 0 when left out."),
    })
  );

  if (design.system === "cawco") {
    cawco(
      "SessionRow",
      "One agent session as CawCo's lists draw it: its mark, title and status, the meta line and its age.",
      z.object({
        title: z.string(),
        state: z.enum(SESSION_STATES),
        line: z
          .string()
          .optional()
          .describe("The meta line: its project, what it is doing."),
        age: z.string().optional().describe('Like "4m".'),
        compact: z
          .boolean()
          .optional()
          .describe("One line, as the rail's tree draws it."),
        active: z.boolean().optional().describe("The session in front."),
      })
    );
    cawco(
      "Message",
      "One message of a session's transcript, as the transcript draws it.",
      z.object({
        from: z.enum(["you", "agent"]),
        text: z
          .string()
          .describe("Its words; markdown is drawn as the transcript draws it."),
        agent: z
          .string()
          .optional()
          .describe('The agent\'s name; "Claude" when left out.'),
      })
    );
    cawco(
      "ToolCalls",
      "A run of an agent's tool calls, as the transcript groups them.",
      z.object({
        calls: z
          .array(
            z.object({
              tool: z.string().describe('Like "Bash", "Read", "Edit".'),
              input: z
                .string()
                .describe(
                  "The command, the path or the pattern it was called with."
                ),
              result: z.string().optional(),
              failed: z.boolean().optional(),
            })
          )
          .min(1),
      })
    );
    cawco(
      "Composer",
      "The message composer at a session's foot, holding `text` or showing `placeholder`.",
      z.object({
        text: z.string().optional(),
        placeholder: z.string().optional(),
        agent: z.string().optional().describe("Who it sends to."),
        busy: z
          .boolean()
          .optional()
          .describe("The agent is working: Stop shows."),
      })
    );
    const TaskCard = cawco(
      "TaskCard",
      "One task as the board draws it.",
      z.object({
        title: z.string(),
        id: z.string().optional().describe('Like "tsk-12".'),
        labels: z.array(z.string()).optional(),
        needsYou: z.boolean().optional(),
        live: z.boolean().optional().describe("An attempt at it is running."),
        done: z.number().int().min(0).optional().describe("To-dos ticked."),
        total: z.number().int().min(0).optional().describe("To-dos in all."),
      })
    );
    cawco(
      "BoardColumn",
      "One stage's column on the project board: its name, kind and count, its task cards in order.",
      z.object({
        name: z.string(),
        kind: z.enum(STAGE_KINDS),
        children: z.array(TaskCard.ref),
      })
    );
    cawco(
      "MachineRow",
      "One machine of the fleet: its name, a meta line and whether it is there.",
      z.object({
        name: z.string(),
        meta: z.string(),
        presence: z.enum(["online", "away", "off"]),
      })
    );
    cawco(
      "Alert",
      "A notice standing in the page.",
      z.object({
        text: z.string(),
        title: z.string().optional(),
        warning: z.boolean().optional(),
      })
    );
  }

  for (const specimen of design.specimens) {
    const props: Record<string, z.ZodType> = {};
    for (const [name, prop] of Object.entries(specimen.props)) {
      props[name] = propSchema(prop);
    }
    if (specimen.slot) {
      props.children = children.optional();
    }
    define(
      specimen.name,
      specimen.description,
      z.object(props),
      renderers.Specimen
    );
  }

  const byGroup = (names: readonly string[]) =>
    names.filter((name) => all.some((each) => each.name === name));
  return createLibrary({
    components: all,
    componentGroups: [
      {
        name: "Layout",
        components: byGroup(["Stack", "Grid", "Card"]),
        notes: [
          "A mockup's root is Stack; every part hangs under it.",
          "Gaps and margins are steps (none, small, medium, large), never sizes.",
        ],
      },
      {
        name: "Content",
        components: byGroup(["Text", "Badge", "Image", "ListRow"]),
      },
      {
        name: "Controls",
        components: byGroup(["Button", "Input", "Switch", "Nav", "Tabs"]),
        notes: [
          "Controls are drawn as they look in one state and do nothing: write the state you mean to show.",
        ],
      },
      {
        name: "Frames, states and callouts",
        components: byGroup(["Device", "Dialog", "States", "Annotation"]),
        notes: [
          "Put a screen in a Device the size it is meant for: desk, tablet or phone.",
          "A dialog is drawn open with Dialog, its `over` the screen it opens on.",
          "Show a part's states with States, one child per state, rather than drawing each state as its own mockup.",
          "Point at what matters with Annotation: a number and a short note.",
        ],
      },
      ...(design.system === "cawco"
        ? [
            {
              name: "CawCo's own",
              components: [...CAWCO_COMPONENTS],
              notes: [
                "These are CawCo's real components, drawn with sample data: prefer them to a primitive that looks like one.",
              ],
            },
          ]
        : []),
      ...(design.specimens.length > 0
        ? [
            {
              name: "This project's components",
              components: design.specimens.map((each) => each.name),
              notes: [
                "These are the project's own component specimens: prefer them to primitives that look like them.",
              ],
            },
          ]
        : []),
    ],
    root: MOCKUP_ROOT,
  });
};

// --- the prompt ----------------------------------------------------------------

/** A phone screen with its states, in the primitives alone. */
const EXAMPLE = `root = Stack([phone], false, "large")
phone = Device("phone", [screen], "Checkout")
screen = Stack([title, card, plan, pay], false, "medium", "stretch", "start", "medium")
title = Text("Your order", "title")
card = Card([Text("2 × Linen shirt", "body"), Text("$96.00", "label")], "Basket")
plan = Annotation(Switch("Save card for next time", true), "Off by default today", 1, true)
pay = States(["Ready", "Paying"], [Button("Pay $96.00", "primary"), Button("Paying…", "primary")])`;

/** A session's page in CawCo's own components. */
const CAWCO_EXAMPLE = `root = Stack([desk], false, "large")
desk = Device("desk", [page], "CawCo")
page = Stack([head, ask, tools, answer, composer], false, "medium", "stretch", "start", "medium")
head = SessionRow("Fix tray chip overflow", "working", "cockpit · editing Tray.svelte", "4m")
ask = Message("you", "The tray chips overflow on a phone. Fix it.")
tools = ToolCalls([{tool: "Read", input: "src/lib/cawco/Tray.svelte"}, {tool: "Edit", input: "src/lib/cawco/Tray.svelte"}])
answer = Message("agent", "The chips now wrap onto a second line under 400px.")
composer = Composer("", "Reply to Claude…", "Claude", true)`;

/**
 * What the prompt is generated with: no tools, no bindings (a mockup reads
 * nothing and sets nothing), and the rules that keep a mockup to drawing.
 */
export const mockupPromptOptions = (design: MockupDesign): PromptOptions => ({
  preamble:
    "You draw a mockup: one OpenUI Lang program over this project's components, showing a screen that does not exist yet. The source is openui-lang alone: no markdown fences, no explanations.",
  toolCalls: false,
  bindings: false,
  examples: [design.system === "cawco" ? CAWCO_EXAMPLE : EXAMPLE],
  additionalRules: [
    "Write the sample data into the program: realistic names, ids like tsk-12, times like 4m. A mockup reads nothing: never write Query() or Mutation().",
    "Frame each screen in a Device (desk, tablet or phone) the size it is meant for.",
    "Show a part's states with States, one child per state, and call out what matters with Annotation.",
    "A mockup does nothing: never write Action(), @Run, @Set, @Reset, @OpenUrl or @ToAssistant.",
    "No URLs or markup anywhere: text is plain, and an image is one of the project's assets, by name, through Image.",
    "Use only the components listed. A name outside them is refused with the reason, and the mockup is not drawn.",
  ],
});

/** A project's mockup library as the hub reads a mockup with it: the parser's schema and the prompt. */
export interface MockupSpec {
  components: string[];
  prompt: string;
  root: string;
  schema: LibraryJSONSchema;
}

/** No renderer: where only the schema and the prompt are read. */
const NONE = Object.fromEntries(
  [...MOCKUP_PRIMITIVES, ...CAWCO_COMPONENTS, "Specimen"].map((name) => [
    name,
    null,
  ])
) as MockupRenderers<null>;

/**
 * The parser's schema and the system prompt for `design`'s library. The
 * prompt is generated here, where lang-core's runtime telemetry is opt-in
 * (`OPENUI_RUNTIME_TELEMETRY_ENABLED`); the hub also turns it off outright.
 */
export const mockupSpec = (design: MockupDesign): MockupSpec => {
  const library = mockupLibrary(NONE, design);
  const schema = library.toJSONSchema();
  return {
    root: MOCKUP_ROOT,
    components: Object.keys(library.components),
    schema,
    prompt: generateSystemPrompt({
      library: { ...library.toSpec(), schema },
      promptOptions: mockupPromptOptions(design),
    }),
  };
};
