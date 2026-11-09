/**
 * Areas (core areas.ts): the hub's refusals and notes for them, where a
 * setting in effect came from, Caw's `project_settings` `set_area`, and
 * placement's words for an area's account. The screens that draw areas are
 * designed on top of these; the app draws none yet, so these are not
 * written into it (scripts/words-swift.ts).
 */
import type { SettingSource } from "../areas";

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
  /** A name the route's schema refuses: blank, more than one line, or too long. */
  name: (limit: number) =>
    `An area needs a name: one line of text, at most ${limit} characters.`,
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
  /** "4 projects fall back to the fleet's account". */
  fallBack: (count: number, setting: AreaSettingName) =>
    `${projects(count)} back to the fleet's ${AREA_SETTING_NAMES[setting]}`,
  /** A project moved: what it takes from its new area, or falls back to. */
  takes: (setting: AreaSettingName, area: string | null) =>
    area
      ? `It takes the area ${area}'s ${AREA_SETTING_NAMES[setting]}`
      : `It falls back to the fleet's ${AREA_SETTING_NAMES[setting]}`,
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
