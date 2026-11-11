import { commonWords } from "./common";

/**
 * What Configure › Delegate types says (routes/config/delegate-types and
 * its editor, DelegateTypeEditor.svelte), and the refusals a type's fields
 * meet before the hub (`delegateTypeProblem`). For the dashboard and the
 * native app alike.
 *
 * `bun run words` writes these into the app as `Words.DelegateTypes`
 * (CawCoCore/Words.generated.swift), and `words:check` fails the typecheck
 * chain when that file is stale. So a word is changed here or nowhere.
 */
export const delegateTypesWords = {
  /** The list. */
  list: "Delegate types",
  add: "New delegate type",
  emptyTitle: "No delegate types yet",
  emptyLine:
    "Presets a session picks from when it hands work on, so each delegate starts with the right harness, model and tools.",
  remove: "Delete delegate type",
  /** The fleet's group; each project's own types follow under its name. */
  fleet: "The fleet",
  projectList: (project: string) => `${project}'s delegate types`,
  /** A project type with a fleet type's name: its sessions pick the project's. */
  shadows: (name: string) => `shadows the fleet's ${name}`,
  /** A file under `delegates/` that made no type, in the hub's words. */
  fileProblem: (path: string, problem: string) => `${path}: ${problem}`,
  /** A row's line after its description: how it runs, and every narrowing. */
  effortOf: (effort: string) => `${effort} effort`,
  skillCount: (count: number) => `${count} skill${count === 1 ? "" : "s"}`,
  deniedCount: (count: number) =>
    `${count} tool${count === 1 ? "" : "s"} denied`,
  /** What its sessions may start, on the row's line: every type, or the ones named (`names`, joined). */
  mayStartAny: "may start any type",
  mayStartShort: (names: string) => `may start ${names}`,
  /** The account its sessions start on, on the row's line, by the name CawCo gives it. */
  prefersAccount: (account: string) => `account ${account}`,
  /** A type saved naming an account the fleet doesn't have (`account`: the id given). */
  noAccount: (account: string) => `There is no account ${account}.`,

  /** The editor. */
  what: "delegate type",
  create: "Create delegate type",
  save: commonWords.saveChanges,
  newTitle: "New delegate type",
  nameLabel: "Delegate type name",
  namePlaceholder: "explore",
  nameKept:
    "The name is the key a running call already asks for by; renaming means creating a new type.",
  nameRule:
    "Lowercase letters, digits and hyphens — the exact string a delegate call's type param names.",
  duplicate:
    "Another delegate type already has that name. Two types called the same thing are two a calling agent cannot tell apart.",
  newSessions:
    "Changes apply to new sessions only — running sessions keep the type list they started with.",
  description: "Description",
  descriptionHint:
    "What the calling model reads to decide whether this is the type to route to — not a note for you, a routing signal for it.",
  descriptionPlaceholder:
    "Read-only codebase exploration and fan-out search; returns conclusions, not file dumps.",
  runsOn: "What it runs on",
  runsOnNote:
    "The harness and model the delegate spawns on, and how hard it should think.",
  harness: "Harness",
  model: "Model",
  effort: "Effort",
  unset: "Unset",
  reach: "What it can reach",
  reachNote:
    "Comma-separated. Skills and tools denied are optional narrowings — empty means the delegate has the harness's ordinary defaults.",
  skills: "Skills",
  skillsPlaceholder: "svelte-foundations:coding, impeccable",
  denied: "Tools denied",
  deniedPlaceholder: "Write, Edit, NotebookEdit",
  mayStart: "Types it may start",
  mayStartPlaceholder: "browser, research",
  mayStartHint:
    "The delegate types its sessions may hand work to, or any for every type. Empty: it does the work itself and starts none.",

  /** What a type's fields are refused for before the hub sees them. */
  problemName:
    "a delegate type needs a name: lowercase letters, digits and hyphens only, and not “any”",
  problemMayStartAny:
    "“any” already means every type: list it alone, or name the types",
  problemMayStartName: (name: string) =>
    `“${name}” in Types it may start is not a type name: lowercase letters, digits and hyphens`,
  problemDescription:
    "a delegate type needs a description — it is the whole of how the calling model routes to it",
  problemModel: "a delegate type needs a model",
  problemHarness: (harness: string) =>
    `“${harness}” is not a harness a delegate type can run on`,
  problemStartingSetHarness: (harness: string) =>
    `a starting set is enforced on Claude Code alone so far, not on ${harness}`,
  problemStartingSetBlank: "a starting set names no blank skill or server",
  problemCuratorRole:
    "role curator is the memory curator's: the hub starts that run itself, and it denies shell, edit and web tools",
};
