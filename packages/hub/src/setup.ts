/**
 * A project's setup (Projects spec §5.6, §5.8): the facts Caw sets a project
 * up from, and what the hub applies when the person sends the setup page.
 * How he does it is the bundled skill `project-setup`
 * (packages/hub/skills/project-setup/), which the first conversation of a
 * project made with Caw starts with in its context (caw.ts `setup`); these
 * are the facts `project_setup` answers ({@link SetupFacts}) and the page's
 * card ids ({@link SETUP_CARDS}).
 *
 * Nothing is written into a new project before its setup page is sent: the
 * template tapped on New project is kept as what was tapped
 * (`projects.tapped`), and the shape picked on the page is applied on Send
 * ({@link setupPicksOf}), with the name, the area and the account. Caw writes the
 * rest (stages.md, delegates/, AGENTS.md) after it.
 *
 * The page has no place card: a program's cards are choices between
 * options, which whoever settles a card can pick, and a machine and a folder
 * on it is none (the decision-page skill: such a pick is an HTML page, and a
 * setup page is a program the board draws). A project with no checkout runs
 * its work in its folder on the hub (work-place.ts); a checkout is added in
 * the project's details (server.ts `addProjectPlace`).
 */

import { SETUP_PAGE } from "@cawco/core/artifact-needs";
import type { ChoiceEntry } from "@cawco/core/choices";
import type { SetupDrawn } from "@cawco/core/decisions";
import {
  OFFERED_TEMPLATES,
  type OfferedTemplate,
  type StagesTemplate,
} from "@cawco/core/views";
import type { setupWords } from "@cawco/core/words/onboarding";
import { templateStages } from "./stages";
import { templateTypes } from "./template-types";

/** The `account` card's option for the fleet's routing: no account of the project's own. */
const ROUTING = "routing";

/** The `area` card's option for no area. */
const NO_AREA = "none";

/** The `shape` card's option for a project that fits no template: Caw drafts its stages from what the person wrote. */
const OWN_SHAPE = "own";

/**
 * The cards beside the Setup on the page, by id, and what the hub does with
 * each when the person sends it. Keyed by the words the board names each by
 * over the draft (core onboarding.ts `setupWords.alsoAsks`): a card with no
 * words there, or words with no card here, does not compile.
 */
const BESIDE_CARDS: Record<keyof typeof setupWords.alsoAsks, string> = {
  account:
    'Sets the account the project\'s sessions start on (its conversation, its routines\' runs, its delegates, unless one names its own) to the account id kept under "account", one of Accounts above; "routing" leaves them to the fleet\'s routing. Its connectors are the ones those sessions get.',
  area: `Puts the project in the area whose id is kept under "area", one of Areas above, or in none with "${NO_AREA}": it takes that area's account, budget, Who decides, delegate types and connections wherever it sets none of its own.`,
  routines: "Nothing: you make each routine kept.",
  "what-moves": "Nothing: you move each task to the stage picked for it.",
};

/**
 * The setup page's cards by id, and what the hub does with each when the
 * person sends the page: the Setup's own parts, then the cards beside it
 * ({@link BESIDE_CARDS}); a card the hub applies nothing of is Caw's to
 * write after Send.
 */
export const SETUP_CARDS: readonly { id: string; send: string }[] = [
  {
    id: "name",
    send: 'Renames the project to the text kept under "name" (the Setup\'s title, as the person left it).',
  },
  {
    id: "aim",
    send: 'Nothing: you write AGENTS.md from the text kept under "aim" (the Setup\'s description).',
  },
  {
    id: "shape",
    send: `Applies what the stages started from, kept under "shape" (the Setup's shape): a shipped template's name writes its stages.md, its delegate types and its starter skills; "${OWN_SHAPE}" writes nothing.`,
  },
  {
    id: "stages",
    send: 'Nothing: you write stages.md from the list kept under "stages" ([{ name, kind, icon?, color?, runs?, until?, after?, by? }, …], the stages as the person left them).',
  },
  {
    id: "delegates",
    send: 'Nothing: you write delegates/<type>.md for each type id kept under "delegates" (the ones the person did not remove).',
  },
  ...Object.entries(BESIDE_CARDS).map(([id, send]) => ({ id, send })),
];

/**
 * The answered parts of a setup the person can ask Caw to put to them again
 * (`project_setup`'s `change`): its shape, its name, its stages.
 */
export const SETUP_PARTS = ["shape", "name", "stages"] as const;
export type SetupPart = (typeof SETUP_PARTS)[number];

/** A shipped template as `project_setup` lists it: its stages in a line and the delegate types they run. */
export interface ShippedTemplate {
  name: StagesTemplate;
  /** Each stage, `name (kind)`, with what it runs or waits for. */
  stages: string;
  types: readonly string[];
}

/** What `project_setup` answers: the facts a setup page is built from. */
export interface SetupFacts {
  /** The account its sessions start on, by name with where it came from; null: the fleet's routing. */
  account: string | null;
  /** The fleet's accounts, each a line: its name, id, provider and where it is signed in. */
  accounts: readonly string[];
  /** The area it sits in, by name; null: none. */
  area: string | null;
  /** The hub's areas, each a line: its name and id. */
  areas: readonly string[];
  cards: typeof SETUP_CARDS;
  /** Parts the person asked to be put to them again. */
  change: readonly SetupPart[];
  /** The machines online now, by the name CawCo shows each by. */
  machines: readonly string[];
  name: string;
  /** Whether the name is still the placeholder (`project_name` sets it then). */
  named: boolean;
  /** Its places: its folder on the hub, its checkouts. */
  places: readonly string[];
  /** Its stages.md as it stands; null while it has none. */
  stages: string | null;
  /** The template tapped on New project; null when none was. */
  tapped: StagesTemplate | null;
  /** Its tasks, by the stage each stands in. */
  tasks: Readonly<Record<string, readonly string[]>>;
  templates: readonly ShippedTemplate[];
}

/** A stage of a template in words: its name, its kind, and its hooks. */
const stageLine = (template: StagesTemplate): string =>
  templateStages(template)
    .stages.map((stage) => {
      const hooks = [
        ...(stage.hooks.runs ? [`runs ${stage.hooks.runs}`] : []),
        ...(stage.hooks.until ? [`until ${stage.hooks.until}`] : []),
        ...(stage.hooks.after ? [`after ${stage.hooks.after}`] : []),
      ];
      return `${stage.name} (${[stage.kind, ...hooks].join(", ")})`;
    })
    .join(", ");

/** Every template a project is offered (core `OFFERED_TEMPLATES`, New project's six), read from the hub's own tables. */
export const shippedTemplates = (): ShippedTemplate[] =>
  OFFERED_TEMPLATES.map((name) => ({
    name,
    stages: stageLine(name),
    types: templateTypes(name),
  }));

/** `project_setup`'s answer in lines: facts, each under its label. */
export const setupFactsWords = (facts: SetupFacts): string =>
  [
    `Project: “${facts.name}”${facts.named ? "" : " (the placeholder: name it with project_name)"}.`,
    `Tapped on New project: ${facts.tapped ?? "none"}.`,
    ...(facts.change.length > 0
      ? [`Asked again: ${facts.change.join(", ")}.`]
      : []),
    "Shipped templates:",
    ...facts.templates.map(
      (template) =>
        `- ${template.name}: ${template.stages}. Types: ${template.types.join(", ") || "none"}.`
    ),
    facts.stages === null
      ? "stages.md: none yet."
      : `stages.md:\n\`\`\`\n${facts.stages.trimEnd()}\n\`\`\``,
    Object.keys(facts.tasks).length === 0
      ? "Tasks: none."
      : [
          "Tasks by stage:",
          ...Object.entries(facts.tasks).map(
            ([stage, ids]) => `- ${stage}: ${ids.join(", ")}`
          ),
        ].join("\n"),
    `Places: ${facts.places.join("; ") || "none"}.`,
    `Machines online: ${facts.machines.join(", ") || "none"}.`,
    `Its sessions start on: ${facts.account ?? "the fleet's routing"}.`,
    `Its area: ${facts.area ?? "none"}.`,
    "Areas (a project in one takes its settings where it sets none):",
    ...(facts.areas.length > 0
      ? facts.areas.map((line) => `- ${line}`)
      : ["- none"]),
    "Accounts (each with its own connectors):",
    ...(facts.accounts.length > 0
      ? facts.accounts.map((line) => `- ${line}`)
      : ["- none"]),
    `The page is decisions/${SETUP_PAGE}/, artifact name "${SETUP_PAGE}". Card ids, and what Send applies:`,
    ...facts.cards.map((card) => `- ${card.id}: ${card.send}`),
  ].join("\n");

/**
 * What a sent setup page changes beyond the project's files, which Caw
 * writes: each pick not made is left out ({@link setupPicksOf}).
 */
export interface SetupPicks {
  /** The account its sessions start on; null: the fleet's routing. */
  account?: string | null;
  /** The area by its id; null: none. */
  area?: string | null;
  /** The project's name. */
  name?: string;
  /** The shipped template applied: its files, its starter skills, the project's template. */
  shape?: OfferedTemplate;
}

const nameOf = (state: Record<string, ChoiceEntry>): string | undefined => {
  const entry: ChoiceEntry | undefined = state.name;
  const value: unknown = entry?.value;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

/** The `account` pick: an account id, or null for "routing"; undefined when the card was not picked. */
const accountOf = (
  state: Record<string, ChoiceEntry>
): string | null | undefined => {
  const entry: ChoiceEntry | undefined = state.account;
  const value: unknown = entry?.value;
  if (typeof value !== "string" || !value.trim()) {
    return;
  }
  return value.trim() === ROUTING ? null : value.trim();
};

/** The `area` pick: an area id, or null for "none"; undefined when the card was not picked. */
const areaOf = (
  state: Record<string, ChoiceEntry>
): string | null | undefined => {
  const entry: ChoiceEntry | undefined = state.area;
  const value: unknown = entry?.value;
  if (typeof value !== "string" || !value.trim()) {
    return;
  }
  return value.trim() === NO_AREA ? null : value.trim();
};

/**
 * The shape the stages start from: the person's pick on the page, else the
 * Setup's own as Caw drew it (the board, which draws the Setup from the
 * program, keeps nothing until the person changes something).
 */
const shapeOf = (
  state: Record<string, ChoiceEntry>,
  drawn: SetupDrawn | undefined
): OfferedTemplate | undefined => {
  const entry: ChoiceEntry | undefined = state.shape;
  const picked = entry ? (entry.value ?? entry.options[0]) : drawn?.shape;
  return OFFERED_TEMPLATES.find((name) => name === picked);
};

/** Whether artifact `artifact` is a project's setup page (its decision page `setup`). */
export const isSetupPage = (artifact: {
  kind: string;
  name: string;
}): boolean => artifact.kind === "page" && artifact.name === SETUP_PAGE;

/**
 * A setup page as its Send finds it: its picks, its last Send (null before
 * the first), when its session last drew it (`revisedAt`, null when never)
 * and the Setup its program holds as drawn (null when none).
 */
export interface SentPage {
  revisedAt: string | null;
  sentAt: string | null;
  setup: SetupDrawn | null;
  state: Record<string, ChoiceEntry>;
}

/**
 * When the person sends a project's setup page, by any path (the board's
 * Set up, the page's own `cawco.send`, the panel's Send), whatever it
 * holds beside its Setup: the name in its `name` field, the shipped
 * template the Setup's shape starts from (the person's pick, else as Caw
 * drew it), the area picked on `area` and the account picked on `account`
 * are what the hub applies before Caw hears the page (server.ts
 * `sending`), so he writes only the project's files. Only what is new
 * since the last Send (`sentAt`) is among them: a pick made since, or, for
 * a part the person left as drawn, the page drawn again since; so a Send
 * again for one pick leaves the stages Caw wrote alone. Any other artifact
 * has none.
 */
export const setupPicksOf = (
  artifact: { kind: string; name: string; projectId: string | null },
  page: SentPage
): SetupPicks => {
  if (!(artifact.projectId && isSetupPage(artifact))) {
    return {};
  }
  const { revisedAt, sentAt } = page;
  const state = Object.fromEntries(
    Object.entries(page.state).filter(
      ([, entry]) => !sentAt || entry.at > sentAt
    )
  );
  // What Caw drew counts as new on the first Send, or once he drew the page again since.
  const drawn =
    page.setup && (!sentAt || (revisedAt !== null && revisedAt > sentAt))
      ? page.setup
      : undefined;
  // A shape the person kept before the last Send went with it: it stands over what Caw drew.
  const kept: ChoiceEntry | undefined = page.state.shape;
  const name = nameOf(state);
  const shape = shapeOf(state, kept ? undefined : drawn);
  const area = areaOf(state);
  const account = accountOf(state);
  return {
    ...(name ? { name } : {}),
    ...(shape ? { shape } : {}),
    ...(area === undefined ? {} : { area }),
    ...(account === undefined ? {} : { account }),
  };
};
