/**
 * Configure's one definition and its words, for the dashboard and the native
 * app alike: the rail's groups and sections (each section's label, its one
 * purpose line, whether the rail counts its rows, the rule its badge follows,
 * its Solar glyph and its hue token), and the words the Configure frame says
 * around any section (its commit row, its ⋯ menus, a row that is gone).
 *
 * The dashboard imports this module; `bun run words` writes it into the
 * app as `Words.Configure` (CawCoCore/Words.generated.swift), and
 * `words:check` fails the typecheck chain when that file is stale. So a word
 * is changed here or nowhere. A word that takes values is an arrow function
 * whose body is one expression in the subset the generator translates
 * (scripts/words-swift.ts): template literals, `?:`, comparisons, `??`,
 * `.length`, `.join(…)` and the helpers in ./helpers.
 */
import { userLayerLabel } from "../claude-dirs";

/** The rail's groups, in its order. */
export const CONFIG_GROUPS = [
  "Automation",
  "Agents",
  "Tools",
  "Memory",
  "Hub",
] as const;

export type ConfigGroup = (typeof CONFIG_GROUPS)[number];

export type ConfigSlug =
  | "rules"
  | "hooks"
  | "delegate-types"
  | "subagents"
  | "cli-tools"
  | "mcp"
  | "connections"
  | "skills"
  | "memory"
  | "accounts"
  | "models"
  | "spend"
  | "phone"
  | "devices"
  | "previews"
  | "updates";

/**
 * What stands beside a section's name besides its count:
 * - `fleet-faults`: the fleet faults whose scope the section owns, on a
 *   machine or at the hub;
 * - `account-faults`: accounts a machine signed in as somebody else, or
 *   signed in nowhere;
 * - `updates-waiting`: machines whose update waits on the operator.
 */
export type ConfigBadgeRule =
  "fleet-faults" | "account-faults" | "updates-waiting";

/** One entry of the Configure rail: where it lives and what it is for. */
export interface ConfigSectionDefinition {
  /** The rule the badge beside its name follows. */
  badge: ConfigBadgeRule;
  /** It lists rows the rail counts beside its name; a setting has no count. */
  counted: boolean;
  group: ConfigGroup;
  /** Its hue, as a token: `hue-cyan-500` (`--hue-cyan-500`, `Palette.named`). */
  hue: string;
  /** Its glyph, as Solar names it (`~icons/solar/<icon>`, the app's `Glyph` raw value). */
  icon: string;
  label: string;
  /**
   * The one line under the section's title; null where the section's own
   * rows say what it is (Accounts: its provider groups), so none is drawn.
   */
  purpose: string | null;
  slug: ConfigSlug;
}

/** Every section, in the rail's order. */
export const CONFIG_SECTIONS: readonly ConfigSectionDefinition[] = [
  {
    slug: "rules",
    group: "Automation",
    label: "Rules",
    purpose: "What CawCo answers when a session says something",
    counted: true,
    badge: "fleet-faults",
    icon: "shield-check-bold-duotone",
    hue: "hue-green-500",
  },
  {
    slug: "hooks",
    group: "Automation",
    label: "Hooks",
    purpose: "Scripts each machine runs at a session's lifecycle events",
    counted: true,
    badge: "fleet-faults",
    icon: "routing-2-bold-duotone",
    hue: "hue-cyan-500",
  },
  {
    slug: "delegate-types",
    group: "Agents",
    label: "Delegate types",
    purpose: "Presets a session's delegate call picks from",
    counted: true,
    badge: "fleet-faults",
    icon: "users-group-rounded-bold-duotone",
    hue: "hue-blue-500",
  },
  {
    slug: "subagents",
    group: "Agents",
    label: "Subagents",
    purpose: `Agent files written to ${userLayerLabel("agents")} on every machine`,
    counted: true,
    badge: "fleet-faults",
    icon: "branching-paths-down-bold-duotone",
    hue: "hue-orange-500",
  },
  {
    slug: "cli-tools",
    group: "Tools",
    label: "Command-line tools",
    purpose: "CLIs each machine must have",
    counted: true,
    badge: "fleet-faults",
    icon: "code-square-bold-duotone",
    hue: "hue-green-600",
  },
  {
    slug: "mcp",
    group: "Tools",
    label: "MCP servers",
    purpose: "Servers written to every machine",
    counted: true,
    badge: "fleet-faults",
    icon: "plug-circle-bold-duotone",
    hue: "hue-cyan-400",
  },
  {
    slug: "connections",
    group: "Tools",
    label: "Connections",
    purpose: "Outside services the hub signs in to, one row per account",
    counted: false,
    badge: "fleet-faults",
    icon: "link-bold-duotone",
    hue: "hue-blue-500",
  },
  {
    slug: "skills",
    group: "Tools",
    label: "Skills & plugins",
    purpose: "Skills, plugins and marketplaces",
    counted: true,
    badge: "fleet-faults",
    icon: "bolt-bold-duotone",
    hue: "hue-amber-500",
  },
  {
    slug: "memory",
    group: "Memory",
    label: "Memory files",
    purpose: "CLAUDE.md and the model documents",
    counted: true,
    badge: "fleet-faults",
    icon: "book-bold-duotone",
    hue: "hue-blue-600",
  },
  {
    slug: "accounts",
    group: "Hub",
    label: "Accounts",
    purpose: null,
    counted: true,
    badge: "account-faults",
    icon: "users-group-rounded-bold-duotone",
    hue: "hue-cyan-500",
  },
  {
    slug: "models",
    group: "Hub",
    label: "Models CawCo uses",
    purpose: "Jev's route (OpenRouter or a TypeSafe key), and fleet watch",
    counted: false,
    badge: "fleet-faults",
    icon: "cpu-bold-duotone",
    hue: "hue-orange-500",
  },
  {
    slug: "spend",
    group: "Hub",
    label: "Spend",
    purpose: "Project budgets",
    counted: false,
    badge: "fleet-faults",
    icon: "dollar-bold-duotone",
    hue: "hue-amber-500",
  },
  {
    slug: "phone",
    group: "Hub",
    label: "Phone",
    purpose: "Pushes to the CawCo app when something needs you",
    counted: false,
    badge: "fleet-faults",
    icon: "smartphone-bold-duotone",
    hue: "hue-green-500",
  },
  {
    slug: "devices",
    group: "Hub",
    label: "Devices",
    purpose: "Which browsers, apps and machines may run your fleet",
    counted: false,
    badge: "fleet-faults",
    icon: "lock-keyhole-minimalistic-bold-duotone",
    hue: "hue-orange-500",
  },
  {
    slug: "previews",
    group: "Hub",
    label: "Previews",
    purpose:
      "How a session's previews are reached, each on an origin of its own",
    counted: false,
    badge: "fleet-faults",
    icon: "square-top-down-bold-duotone",
    hue: "hue-cyan-400",
  },
  {
    slug: "updates",
    group: "Hub",
    label: "Updates",
    purpose: "The builds your machines run, and when they install them",
    counted: false,
    badge: "updates-waiting",
    icon: "download-bold-duotone",
    hue: "hue-blue-500",
  },
];

/** What the Configure frame says around any section. */
export const configureWords = {
  /** The place, as the sidebar and a page's title name it. */
  title: "Configure",
  /** A page's document title: "Accounts · Configure · CawCo". */
  documentTitle: (title: string) => `${title} · Configure · CawCo`,
  /** A rail row whose editor holds edits not saved yet. */
  unsaved: "Unsaved changes",
  /** The badge's words, for the pointer and a screen reader. */
  badgeWaiting: (count: number) => `${count} waiting on you`,
  badgeFailing: (count: number) =>
    `${count} failing on a machine or at the hub`,
  /** The badge's figure as a screen reader hears it after the count. */
  badgeWaitingSaid: "waiting",
  badgeFailingSaid: "failing",
  /** Skeleton rows standing in until the rows are read. */
  loading: "Loading",
  /** Why every Save and Delete is disabled while the hub is down. */
  hubDown: "Can't save while the hub is unreachable",
  /** The commit row. */
  cancel: "Cancel",
  saved: "Saved",
  saving: "Saving…",
  deleting: "Deleting…",
  /** The editor header's ⋯ (Delete, on a narrow page), and a row's. */
  more: "More",
  moreFor: (label: string) => `More for ${label}`,
  /** An editor whose row is not in the list. */
  gone: (what: string) => `That ${what} is gone`,
  goneLine: "It was deleted, or the link is from another hub.",
  backTo: (section: string) => `Back to ${section}`,
};
