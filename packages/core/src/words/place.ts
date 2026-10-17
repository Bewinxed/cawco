/**
 * A page's `cawco.pickPlace()` (preview/PlacePick.svelte): CawCo's own
 * machine select and folder browser over the preview's well, for the
 * dashboard and the native app alike.
 *
 * `bun run words` writes these into the app as `Words.PlacePick`
 * (CawCoCore/Words.generated.swift), and `words:check` fails the typecheck
 * chain when that file is stale. So a word is changed here or nowhere.
 */
export const placePickWords = {
  title: "Pick a machine and folder",
  machine: "Machine",
  /** A machine as the select lists it: its label, then its OS. */
  machineOption: (label: string, os: string) => `${label} · ${os}`,
  noMachines: "No machines online",
  folder: "Folder",
  folderPlaceholder: "/home/you/project",
  use: "Use this place",
  saving: "Saving…",
  cancel: "Cancel",
  needsMachine: "Choose a machine that is online.",
  needsPath: "A folder is its full path, starting with /.",
};
