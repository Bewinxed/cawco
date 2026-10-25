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
  mayDelegateShort: "may delegate",

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
    "Comma-separated. Both are optional narrowings — empty means the delegate has the harness's ordinary defaults.",
  skills: "Skills",
  skillsPlaceholder: "svelte-foundations:coding, impeccable",
  denied: "Tools denied",
  deniedPlaceholder: "Write, Edit, NotebookEdit",
  mayDelegate: "May delegate",
  mayDelegateOn: "It can spawn delegates and sessions of its own.",
  mayDelegateOff: "Leaf — it does the work itself and cannot delegate further.",

  /** What a type's fields are refused for before the hub sees them. */
  problemName:
    "a delegate type needs a name: lowercase letters, digits and hyphens only",
  problemDescription:
    "a delegate type needs a description — it is the whole of how the calling model routes to it",
  problemModel: "a delegate type needs a model",
  problemHarness: (harness: string) =>
    `“${harness}” is not a harness a delegate type can run on`,
};
