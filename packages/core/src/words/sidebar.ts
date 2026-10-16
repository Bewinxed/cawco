/**
 * The sidebar's words, for the dashboard and the native app alike.
 *
 * The dashboard imports this module; `bun run words` writes it into the app
 * as `Words.Sidebar` (CawCoCore/Words.generated.swift), and `words:check`
 * fails the typecheck chain when that file is stale. So a word is changed
 * here or nowhere.
 */
export const sidebarWords = {
  /** The projects list is empty and no machine runs CawCo yet. */
  noProjectsNoMachines:
    "No projects yet — start one with New project. Once CawCo runs on a machine, its checkouts group here too.",
  /** The projects list is empty while machines are joined. */
  noProjects: "No projects yet — name a checkout to group its sessions.",
};
