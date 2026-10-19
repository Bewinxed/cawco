/**
 * What Configure › Memory says (routes/config/memory, its New document
 * popover and MemoryEditor.svelte), and the parts `scopeWords` (fleet.ts)
 * says a document's sessions in. For the dashboard and the native app alike.
 *
 * `bun run words` writes these into the app as `Words.Memory`
 * (CawCoCore/Words.generated.swift), and `words:check` fails the typecheck
 * chain when that file is stale. So a word is changed here or nowhere.
 * Backticks mark what is set in the code face (Coded.svelte, `coded`).
 */
export const memoryWords = {
  /** The list. */
  list: "Memory files",
  filter: "Filter files…",
  filterLabel: "Filter memory files",
  noMatch: (filter: string) => `No file matches “${filter}”.`,
  everySession: "Loaded into every session",
  noMemory:
    "The fleet keeps no memory yet — write one, or adopt a machine's copy",
  facts: (size: string, ago: string) => `${size} · saved ${ago}`,
  /** How long ago, as utils/time.ts `formatDistanceToNow` says it. */
  justNow: "just now",
  ago: (span: string) => `${span} ago`,
  unsavedDraft: " · unsaved draft",
  deleteEverywhere: "Delete everywhere",

  /** New document. */
  newDocument: "New document",
  pathUnder: (layer: string) => `Path under ${layer}/`,
  pathHint:
    "A `models/<model>.md` is put in front of the session running that model.",
  pathPlaceholder: "models/deepseek-v4.md",
  create: "Create and open",
  creating: "Creating…",
  needsPath: "A document needs a path — models/deepseek-v4.md, say.",
  alreadyLinked: (path: string) => `“${path}” is already a linked document.`,
  writtenElsewhere: (path: string) =>
    `${path} was written elsewhere a moment ago. Nothing was overwritten.`,

  /** The editor. */
  what: "memory file",
  save: "Save",
  file: "File",
  role: "Role",
  projects: "Projects",
  none: "None",
  orchestrator: "Orchestrator",
  leaf: "Leaf",
  loadedInto: (sessions: string) => `Loaded into: ${sessions}`,
  tokens: (count: string) => `~${count} tokens`,
  tokensTitle:
    "Roughly what this file costs every session that loads it, at about four bytes a token",
  savedAgo: (ago: string) => `saved ${ago}`,
  notWritten: "Not written yet",
  unsaved: "Unsaved changes",
  /** Said after `unsaved` only where a keyboard can press it. */
  saveShortcut: " · ⌘S saves",
  unsavedShort: " · unsaved",
  contents: "Contents",
  changedElsewhere:
    "Changed elsewhere while you edited. Nothing was overwritten.",
  takeLatest: "Take latest",
  saveMine: "Save mine anyway",
  saving: "Saving…",
  history: "History",
  loading: "Loading…",
  nothingReplaced:
    "Nothing replaced yet. Every version a save, an adopt or an overwrite replaces is kept here.",
  from: (source: string) => `from ${source}`,
  theFleet: "the fleet",
  compare: "Compare",
  hide: "Hide",
  readingVersion: "Reading that version…",
  restore: "Restore this version",
  restoring: "Restoring…",
  showLatest: "Show the latest 5",
  showAll: (count: number) => `Show all ${count}`,
  perMachine: "Per machine",
  noMachines: "No machines yet",
  landsFirst: " — this lands on the first one that registers.",
  inSyncOn: (count: number) =>
    `In sync on ${count} machine${count === 1 ? "" : "s"}.`,
  offlineSync: (names: string) => `${names} offline — they sync when back.`,
  inSync: "In sync",
  keptOwn: "Kept its own copy",
  takenOff: "Taken off",
  notReported: "Not reported",
  offlineWhenBack: " · offline, it syncs when back",
  adoptCopy: "Adopt this copy",
  adopting: "Adopting…",
  sendOurs: "Send ours",
  sending: "Sending…",
  readingCopy: "Reading this machine's copy…",
  noCopy: "This machine has no copy of this file.",

  /** Why a document's path cannot be used (fleet.ts `memoryDocProblem`). */
  problemNotMarkdown:
    "a linked document is markdown — its path has to end in .md",
  problemAbsolute: (path: string, layer: string) =>
    `“${path}” is absolute — a document's path is relative to ${layer}/`,
  problemBackslash: (path: string) =>
    `“${path}” uses backslashes — the path is the same string on every machine, so it is forward-slashed`,
  problemAt: (path: string) =>
    `“${path}” has an @ — a machine reports a project's copy of a document as <path>@<place>`,
  problemSegments: (path: string) =>
    `“${path}” is not a usable path — no empty, “.” or “..” segments`,
  problemDotted: (path: string) =>
    `“${path}” hides a segment behind a dot — the set is documents, not dotfiles`,

  /** The parts a document's sessions are said in (fleet.ts `scopeWords`). */
  scopeNone: "No session on its own: linked, read on purpose",
  scopeEvery: (role: string) => `Every ${role} session`,
  scopeEveryIn: (projects: string) => `Every session in ${projects}`,
  scopeSessions: "Sessions",
  scopeSessionsOf: (who: string) => `${who} sessions`,
  scopeBriefing: (about: string) => `Sessions briefing ${about}`,
  scopeAnyDelegate: "any delegate",
  scopeDelegates: (types: string) => `${types} delegates`,
  scopeOnModels: (model: string) => `on models matching ${model}`,
  scopeIn: (projects: string) => `in ${projects}`,
  scopeAnd: " and ",
  scopeGone: "a project that is gone",
};
