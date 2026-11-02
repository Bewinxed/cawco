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
 * ({@link applySetupPicks}), with the name and the place. Caw writes the
 * rest (stages.md, delegates/, AGENTS.md) after it.
 */

import {
  type ChoiceEntry,
  STAGES_TEMPLATES,
  type StagesTemplate,
} from "@cawco/core";
import { templateStages } from "./stages";
import { templateTypes } from "./template-types";

/** The decision page's name, and its folder in the project's. */
const SETUP_PAGE = "setup";

/** The `shape` card's option for a project that fits no template: Caw drafts its stages from what the person wrote. */
const OWN_SHAPE = "own";

/**
 * The setup page's cards by id, and what the hub does with each when the
 * person sends the page; a card the hub applies nothing of is Caw's to write
 * after Send.
 */
export const SETUP_CARDS = [
  {
    id: "name",
    send: 'Renames the project to the text stored with cawco.set("name", text).',
  },
  {
    id: "aim",
    send: "Nothing: you write AGENTS.md from it.",
  },
  {
    id: "shape",
    send: `Applies the picked option: a shipped template's name writes its stages.md, its delegate types and its starter skills; "${OWN_SHAPE}" writes nothing.`,
  },
  {
    id: "stages",
    send: 'Nothing: you write stages.md from the list stored with cawco.set("stages", [{ name, kind }, …]).',
  },
  {
    id: "delegates",
    send: "Nothing: you write delegates/<type>.md for each type kept.",
  },
  {
    id: "place",
    send: "Adds the machine and folder picked with cawco.pickPlace() as the project's checkout. Picked with cawco.pickPlace({ clone: url }), it clones that repository into the folder first, after the Send, and its result comes to you as its own notice.",
  },
  {
    id: "routines",
    send: "Nothing: you make each routine kept.",
  },
  {
    id: "what-moves",
    send: "Nothing: you move each task to the stage picked for it.",
  },
] as const;

/**
 * The answered parts of a setup the person can ask Caw to put to them again
 * (`project_setup`'s `change`): its place, its shape, its name, its stages.
 */
export const SETUP_PARTS = ["place", "shape", "name", "stages"] as const;
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

/** Every shipped template, read from the hub's own tables. */
export const shippedTemplates = (): ShippedTemplate[] =>
  STAGES_TEMPLATES.map((name) => ({
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
    `The page is decisions/${SETUP_PAGE}/, artifact name "${SETUP_PAGE}". Card ids, and what Send applies:`,
    ...facts.cards.map((card) => `- ${card.id}: ${card.send}`),
  ].join("\n");

/** What a sent setup page changes beyond the project's files, which Caw writes. */
export interface SetupApply {
  /** Renames the project (project-edit.ts, the dashboard's rename); a refusal throws. */
  name: (projectId: string, name: string) => Promise<void>;
  /**
   * Adds the place picked as the project's checkout, its `clone` URL cloned
   * into `path` first when it names one; a refusal throws.
   */
  place: (projectId: string, place: PlacePicked) => Promise<void>;
  /** Applies a shipped template: its files, its starter skills, the project's template (tasks.ts `applyTemplate`). */
  shape: (projectId: string, template: StagesTemplate) => Promise<void>;
}

/**
 * The `place` pick as Send applies it: a machine and a folder on it, and the
 * repository to clone there when the page named one (`cawco.pickPlace({ clone })`).
 */
export interface PlacePicked {
  clone?: string;
  machineId: string;
  path: string;
}

const placeOf = (
  state: Record<string, ChoiceEntry>
): PlacePicked | undefined => {
  const entry: ChoiceEntry | undefined = state.place;
  const value = entry?.value as
    { clone?: unknown; machineId?: unknown; path?: unknown } | null | undefined;
  if (!(
    typeof value?.machineId === "string" &&
    typeof value.path === "string" &&
    value.path.startsWith("/")
  )) {
    return;
  }
  const clone = typeof value.clone === "string" ? value.clone.trim() : "";
  return {
    machineId: value.machineId,
    path: value.path,
    ...(clone ? { clone } : {}),
  };
};

const nameOf = (state: Record<string, ChoiceEntry>): string | undefined => {
  const entry: ChoiceEntry | undefined = state.name;
  const value: unknown = entry?.value;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

const shapeOf = (
  state: Record<string, ChoiceEntry>
): StagesTemplate | undefined => {
  const entry: ChoiceEntry | undefined = state.shape;
  const [option] = entry?.options ?? [];
  return STAGES_TEMPLATES.find((name) => name === option);
};

/**
 * When the person sends a project's setup page, by any path (the page's own
 * `cawco.send`, the panel's Send): the name in its `name` field, the shipped
 * template picked on `shape` and the place picked on `place` are applied
 * before Caw hears the picks, so he writes only the project's files. Only
 * picks made since the last Send (`sentAt`) apply: a Send again for one
 * pick (a place whose clone failed) leaves the stages Caw wrote alone. Any
 * other artifact is left alone. Answers whether it was the setup page.
 */
export const applySetupPicks = async (
  artifact: { kind: string; name: string },
  projectId: string | null | undefined,
  picks: Record<string, ChoiceEntry>,
  sentAt: string | null,
  apply: SetupApply
): Promise<boolean> => {
  if (!projectId || artifact.kind !== "page" || artifact.name !== SETUP_PAGE) {
    return false;
  }
  const state = Object.fromEntries(
    Object.entries(picks).filter(([, entry]) => !sentAt || entry.at > sentAt)
  );
  const name = nameOf(state);
  if (name) {
    await apply.name(projectId, name);
  }
  const shape = shapeOf(state);
  if (shape) {
    await apply.shape(projectId, shape);
  }
  const place = placeOf(state);
  if (place) {
    await apply.place(projectId, place);
  }
  return true;
};
