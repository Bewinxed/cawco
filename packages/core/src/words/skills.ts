/**
 * What Configure › Skills says (routes/config/skills, its Fetch skill and
 * Link marketplace popovers, MachineInventory.svelte), and the refusals a
 * skill's name meets before the hub (fleet.ts `skillNameProblem`). For the
 * dashboard and the native app alike.
 *
 * `bun run words` writes these into the app as `Words.Skills`
 * (CawCoCore/Words.generated.swift), and `words:check` fails the typecheck
 * chain when that file is stale. So a word is changed here or nowhere.
 */
export const skillsWords = {
  /** The groups. */
  skills: "Skills",
  marketplaces: "Marketplaces",
  plugins: "Plugins",
  noSkills:
    "No skills fetched yet. Paste what you would otherwise have run and the hub downloads the files itself.",
  degraded:
    "CawCo installs a skill's files. A skill that also ships hooks or subagents runs in its degraded mode until those are set up by hand.",
  noMarketplaces:
    "No marketplaces linked yet. Link one and its plugins become browsable here.",
  noPlugins:
    "Nothing installed yet. Browse a marketplace above and add a plugin.",
  pluginOff:
    "Disabling a plugin uninstalls it from the machines and keeps its row here.",
  /** A row's actions and state. */
  fetching: "Fetching…",
  fetchAgain: "Fetch again",
  fetchAllAgain: (count: number) => `Fetch all ${count} again`,
  previousVersions: "Previous versions",
  hidePreviousVersions: "Hide previous versions",
  readingVersions: (name: string) => `Reading ${name}'s previous versions`,
  removeEverywhere: "Remove everywhere",
  /** Where a kept version came from, when it is the fleet's own row. */
  theFleet: "the fleet",
  unlink: "Unlink",
  noBytes: "No bytes resolved yet",
  /** A row's version against what its source holds now. */
  checkForUpdates: "Check for updates",
  checking: "Checking…",
  updateAvailable: (from: string, to: string) =>
    `Update available · ${from} → ${to}`,
  /** The update badge's action, and its tooltip naming what it fetches. */
  fetchUpdate: "Fetch update",
  fetchVersion: (to: string) => `Fetch ${to}`,
  updated: (from: string, to: string) => `Updated ${from} → ${to}`,
  /** A refresh's outcome and how long ago it landed (lib/utils/time.ts `formatAgeShort`). */
  outcomeAge: (outcome: string, age: string) =>
    `${outcome} · ${age === "now" ? "just now" : `${age} ago`}`,
  alreadyLatest: (version: string) => `Already on latest (${version})`,
  updateFailed: (why: string) => `Couldn't update: ${why}`,
  checkFailed: (why: string) => `Couldn't check for updates: ${why}`,
  /** A marketplace's listing. */
  browse: "Browse",
  hide: "Hide",
  readFrom: (source: string) => `Read from ${source}`,
  reading: (name: string) => `Reading ${name}`,
  listsNothing: "This marketplace lists no plugins.",
  install: "Install",
  adding: "Adding…",
  added: "Added",

  /** Fetch skill. */
  fetchSkill: "Fetch skill",
  source: "Source",
  readsAs: (source: string) => `Reads as \`${source}\``,
  /** Backticks mark what is set in the code face (Coded.svelte, `coded`). */
  sourceHint:
    "The install command, an `owner/repo` slug, or a `skills:`, `github:`, `npm:` or `https://` source.",
  sourcePlaceholder: "bunx skills add pbakaus/impeccable",
  name: "Name",
  namePlaceholder: "impeccable",
  landsIn: "The directory it lands in —",
  inProjectFolders: (project: string) => ` in each of ${project}'s folders`,
  scope: "Scope",
  everyMachine: "Every machine in the fleet",
  severalSkills: "That repo holds several skills. Pick the one to fetch.",

  /** Link marketplace. */
  linkMarketplace: "Link marketplace",
  link: "Link",
  linking: "Linking…",
  marketSourceHint:
    "A GitHub `owner/repo`, a git URL, or a URL that ends in `marketplace.json`. Anthropic publishes `anthropics/skills` and `anthropics/claude-plugins-official`.",
  marketSourcePlaceholder: "anthropics/skills",
  marketNamePlaceholder: "skills",
  readingManifest: "Reading its marketplace.json…",
  installsAs: (name: string) =>
    `What its plugins are installed as — \`plugin@${name}\`.`,
  callsItself: (name: string) =>
    `This marketplace calls itself \`${name}\`, and links as \`${name}\`: its plugins install as \`plugin@${name}\`.`,
  alreadyLinked: (name: string) => `"${name}" is already linked.`,

  /** On each machine. */
  onEachMachine: "On each machine",
  inventoryNote:
    "What each machine really has, whoever put it there — read live, never stored. Anything the fleet does not manage can be adopted into it.",
  noMachines: "No machines yet",
  noMachinesAfter: " — each one reports what it has once it registers.",
  showWhatItHas: "Show what it has",
  offline: "Offline",
  asking: "Asking this machine…",
  noMcpAtAll: "This machine has no MCP servers at all.",
  noSkillsAtAll: "This machine has no skills at all.",
  fleetBadge: "fleet",
  shadowedBy: (scope: string) => `shadowed by ${scope}`,
  adopt: "Adopt",
  adopting: "Adopting…",
  inTheFleet: "In the fleet",

  /** A marketplace the hub could not read or link, with its reason. */
  couldNotRead: (what: string, why: string) =>
    `Could not read ${what} — ${why}.`,
  couldNotLink: (what: string, why: string) =>
    `Could not link ${what} — ${why}.`,
  saidNothing: "it said nothing",

  /** Why a name cannot be used. */
  problemEmpty: "Give the skill a name.",
  problemCharacters: "Letters, digits, dots, dashes and underscores only.",
  problemTaken: (name: string) => `There is already a skill called “${name}”.`,
};
