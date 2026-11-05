/**
 * Areas (core areas.ts): the hub's refusals and notes for them, where a
 * setting in effect came from, Caw's `project_settings` `set_area`, and
 * placement's words for an area's account. The screens that draw areas are
 * designed on top of these; the app draws none yet, so these are not
 * written into it (scripts/words-swift.ts).
 */
import type { SettingSource } from "../areas";
import { andList } from "./helpers";

/** The settings an area carries that a project falls back from, by the name a note gives each. */
const AREA_SETTING_NAMES = {
  account: "account",
  cawMode: "permission mode for Caw",
  cap: "budget",
  onCap: "rule at the budget",
  decides: "Who decides",
  types: "delegate types",
} as const;
export type AreaSettingName = keyof typeof AREA_SETTING_NAMES;

const projects = (count: number): string =>
  count === 1 ? "1 project falls" : `${count} projects fall`;

export const areaWords = {
  /** Where a setting in effect came from, in a read's brackets. */
  source: (from: SettingSource, area: string | null): string => {
    if (from === "project") {
      return "its own";
    }
    return from === "area"
      ? `from its area ${area ?? ""}`.trim()
      : "the fleet's";
  },

  // ── The API's refusals ──
  nameNeeded: "An area needs a name.",
  nameOneLine: "An area's name is one line of text.",
  nameTooLong: (limit: number, length: number) =>
    `An area's name is at most ${limit} characters; this one is ${length}.`,
  noArea: (id: string) => `The hub keeps no area ${id}.`,
  noProject: (id: string) => `The hub keeps no project ${id}.`,
  order: "Name every area once, in the order they go.",
  capPair:
    "A budget has both an amount and a period (day or month), or neither.",
  capAmount: "The budget is a number of dollars above 0.",
  noAccount: (id: string) => `The hub keeps no account ${id}.`,
  /** A fleet row asked to bind to a project and an area at once. */
  boundTwice:
    "A row is bound to one project or one area, not both: name projectId or areaId.",
  /**
   * An Undo refused because the project or area that bound the item went
   * while it waited (hub db/trash.ts `unbound`).
   */
  undoUnbound:
    "It can't come back as it was: the project or area it was bound to went while it waited. Make it again, bound where it belongs.",
  /** A scope naming an area the hub has none of. */
  scopeNoArea: (id: string) => `There is no area ${id}.`,

  // ── What a delete or a move falls back to ──
  /** Several settings the same projects fall back on, in one sentence: "3 projects fall back to the fleet's budget and rule at the budget". */
  fallBackAll: (count: number, settings: readonly AreaSettingName[]) =>
    `${projects(count)} back to the fleet's ${andList(settings.map((one) => AREA_SETTING_NAMES[one]))}`,
  /** A project moved: the settings it takes from its new area, or falls back to the fleet's, in one sentence. */
  takes: (settings: readonly AreaSettingName[], area: string | null) => {
    const named = andList(settings.map((one) => AREA_SETTING_NAMES[one]));
    return area
      ? `It takes the ${named} from ${area}.`
      : `It falls back to the fleet's ${named}.`;
  },
  /** A delete that ungrouped no project and left nothing to fall back. */
  deletedAlone: (name: string) => `${name} is deleted; no project was in it.`,
  deleted: (name: string, count: number) =>
    `${name} is deleted; ${count === 1 ? "its 1 project is" : `its ${count} projects are`} in no area now.`,
  /** The memory documents scoped to an area alone go with it: none reaches every project. */
  docsTrashed: (count: number) =>
    `${count === 1 ? "1 memory document" : `${count} memory documents`} scoped to it alone went with it.`,
  /** A count of one kind of fleet row, as `fleetRowsGone` lists them. */
  fleetRow: {
    skills: (n: number) => (n === 1 ? "1 skill" : `${n} skills`),
    mcp: (n: number) => (n === 1 ? "1 MCP server" : `${n} MCP servers`),
    hooks: (n: number) => (n === 1 ? "1 hook" : `${n} hooks`),
    settings: (n: number) =>
      n === 1 ? "1 harness setting" : `${n} harness settings`,
  },
  /** The fleet rows bound to an area go with it, by kind (`2 skills, 1 hook`). */
  fleetRowsGone: (rows: string) => `${rows} bound to it went with it.`,
  /** The rules scoped to an area go with it. */
  rulesGone: (count: number) =>
    `${count === 1 ? "1 rule" : `${count} rules`} scoped to it went with it.`,

  // ── project_settings, and the project note ──
  change: (name: string | null) =>
    name
      ? `Put this project in the area ${name}: it takes the area's settings wherever it sets none`
      : "Take this project out of its area: it falls back to the fleet's settings wherever it sets none",
  read: (name: string | null) => `- Area: ${name ?? "none"} (set_area)`,
  needs: "set_area names area: an area's id or name, or null for none.",
  already: (name: string | null) =>
    name
      ? `This project is in the area ${name} already.`
      : "This project is in no area already.",
  /** An area named that the hub has none of: the ones it has. */
  unknown: (asked: string, names: readonly string[]) =>
    names.length > 0
      ? `There is no area ${asked}. The areas: ${names.join(", ")}.`
      : `There is no area ${asked}, and the hub has none yet: the person makes one in Configure › Areas.`,

  // ── Placement (hub placement.ts), for an account the area sets ──
  why: (name: string, area: string) =>
    `This project's sessions start on ${name}, its area ${area}'s account.`,
  notSignedIn: (name: string, area: string, machine: string) =>
    `This project's sessions start on ${name}, its area ${area}'s account, which isn't signed in on ${machine}: sign it in there, or change the area's account or set the project's own.`,

  /** A memory scope's area, among the projects it names. */
  scopeArea: (name: string) => `the ${name} area`,
};

/** A project's Area row in Project details (project/ProjectDetails.svelte). */
export const projectAreaWords = {
  label: "Area",
  /** The select's name for a screen reader. */
  select: "The area this project sits in",
  none: "No area",
  /** Under the row. */
  in: (name: string) =>
    `It takes ${name}'s settings wherever it sets none of its own.`,
  out: "It takes the fleet's settings wherever it sets none of its own.",
  noneYet: "No areas yet.",
  make: "Make one in Configure › Areas",
  /** The account select's first choice while its area names an account. */
  areaAccount: (account: string, area: string) =>
    `${area}'s account (${account})`,
};

/** The settings an area's row and page draw, each by what the person reads. */
export const AREA_SETTING_LABELS = {
  account: "Account",
  budget: "Budget",
  cawMode: "Caw's permission mode",
  decides: "Who decides",
  types: "Delegate types",
} as const;

const counted = (n: number, one: string, many: string): string =>
  n === 1 ? `1 ${one}` : `${n} ${many}`;

/**
 * Configure › Areas (dashboard config/areas): its list, an area's page,
 * and the questions they ask. The app draws no area, so these are not
 * written into it.
 */
export const areasScreenWords = {
  // ── The list ──
  newArea: "New area",
  nameLabel: "Area name",
  namePlaceholder: "Area name",
  create: "Create area",
  creating: "Creating…",
  cancel: "Cancel",
  emptyTitle: "Group projects into areas",
  emptyBody:
    "An area carries an account, a budget, Who decides and delegate types. Each project in it takes them where it sets none.",
  listLabel: "Areas, in order",
  projects: (n: number) =>
    n === 0 ? "No projects" : counted(n, "project", "projects"),

  // ── Moving projects ──
  /** The foot's group: the projects in no area, a place a project is moved to as well. */
  noArea: "In no area",
  noAreaEmpty: "Every project is in an area.",
  addProject: "Add project",
  addProjectTo: (name: string) => `Add a project to ${name}`,
  /** The no-area group's Add project, for a screen reader. */
  takeOut: "Take a project out of its area",
  /** A pick's second line: where the project is now. */
  isIn: (area: string | null) => (area ? `In ${area}` : "In no area"),
  addNone: "Every project is in this area already.",
  /** A move refused because its area was deleted elsewhere while the page stood. */
  areaGone: (name: string) => `${name} was deleted.`,
  /** The switch that opens and folds the projects under an area, as a project's mark does its sessions in the sidebar. */
  fold: (name: string, open: boolean) =>
    `${open ? "Hide" : "Show"} ${name}'s projects`,
  /** The projects under an area, for a screen reader. */
  projectsIn: (name: string) => `Projects in ${name}`,
  /** The tile, for a screen reader: a press opens its look, a drag or the arrows move it. */
  place: (name: string, at: number, of: number) =>
    `${name}'s look, ${at} of ${of}. Press to change it; drag, or press the up and down arrows, to move ${name}`,
  /** The tile's tooltip on a desk, and the page's tile. */
  lookFor: (name: string) => `Change ${name}'s look`,
  deleteArea: (name: string) => `Delete ${name}…`,

  // ── Deleting ──
  deleteTitle: (name: string) => `Delete ${name}?`,
  deleteProjects: (names: readonly string[]) =>
    names.length === 0
      ? "No project is in it."
      : `${names.length === 1 ? `${names[0]} is` : `${names.slice(0, -1).join(", ")} and ${names.at(-1)} are`} in no area after it goes.`,
  /** What falls back, counted from each project's settings in effect now. */
  deleteFallsBack: (lines: readonly string[]) => `${lines.join(". ")}.`,
  deleteFolder:
    "Its Who decides and delegate types are deleted with it, and so are the rules scoped to it.",
  deleteConfirm: "Delete area",
  deleting: "Deleting…",

  // ── An area's page ──
  backTo: "Back to Areas",
  renameLabel: "The area's name",
  takers: (n: number) =>
    n === 0
      ? "No project is in it yet."
      : `${counted(n, "project takes", "projects take")} its settings where ${n === 1 ? "it sets" : "they set"} none.`,
  groups: {
    sessions: "Sessions",
    spend: "Spend",
    agents: "Agents",
    scoped: "Scoped to it",
    projects: "Projects in it",
  },
  /** A select's first option: what the projects take while the area sets nothing. */
  fleets: (value: string | null) =>
    value ? `The fleet's: ${value}` : "The fleet's",
  routing: "The fleet's routing",
  accountSet: (name: string) =>
    `Its projects' sessions start on ${name}, with its connectors, unless a project or a start names its own.`,
  accountRouted:
    "Its projects' sessions start where the fleet's routing places them.",
  accountSignedOut: (name: string) =>
    `${name} isn't signed in on any machine, so a project that takes it can't start a session until it is.`,
  budgetLabel: "Budget",
  /** The budget field's unit, before it. */
  budgetAmount: "$",
  budgetPer: { day: "A day", month: "A month" },
  budgetNone:
    "No budget: its projects spend without one unless they set their own.",
  budgetSet: (usd: string, period: "day" | "month") =>
    `Each project in it may spend ${usd} ${period === "day" ? "a day" : "a month"} unless it sets its own.`,
  clearBudget: "Clear budget",
  onCapLabel: "At the budget",
  cawModeLabel: "Caw's permission mode",
  cawModeFleet:
    "Each project's conversation starts in the mode last chosen for its harness.",
  decidesFleet: "Every kind follows the fleet's Who decides.",
  decidesOwn: (n: number) =>
    `${counted(n, "kind is", "kinds are")} handed over here; the rest follow the fleet's.`,
  setDecides: "Set Who decides",
  typesNone: "None of its own: its projects take the fleet's delegate types.",
  typesOwn: (n: number) =>
    `${counted(n, "type", "types")} of its own, over the fleet's of the same name.`,
  newType: "New delegate type",
  typeName: "Type name",
  typeNameHint: "Lowercase letters, digits and dashes.",
  /** The new type's file, for a screen reader: its frontmatter and brief. */
  typeFile: "The type's file",
  edit: "Edit",
  editType: (name: string) => `Edit ${name}`,
  saveType: "Save delegate type",
  deleteType: "Delete delegate type",
  scopedNone: (what: string) => `No ${what} scoped to it.`,
  scopedOpen: (what: string) => `Open ${what}`,
  scopedLabels: {
    rules: "Rules",
    memory: "Memory files",
    connections: "Connections",
  },
  scopedKinds: {
    rules: "rules",
    memory: "memory files",
    connections: "connections",
  },
  projectTakesAll: "Takes every setting from its area",
  projectSetsOwn: (names: readonly string[]) =>
    `Sets its own ${names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`}`,
  projectSettingNames: {
    account: "account",
    cawMode: "permission mode",
    cap: "budget",
    onCap: "rule at the budget",
  },
  noProjects:
    "Put a project in it from the project's Project details, or ask its Caw to.",
  gone: "That area is gone",
  /** The scope pickers of Rules and Memory files. */
  scopeChip: "Area",
  scopeChips: "Areas",
  everyArea: "Every area",
};
