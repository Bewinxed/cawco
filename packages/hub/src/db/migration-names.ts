import { FILE_HASH_SCHEME } from "@cawco/core/file-hash";

/**
 * The name each once-step keeps in `data_migrations`, spelled as live hubs
 * hold it (db/migrate.ts). A leaf: feature code and the steps import it
 * without the database.
 */
export const TAG_MARKERS = "tag-markers";
export const SPLIT_CONTINUATIONS = "split_continuations:2026-11-05";
export const SETTLED_NAMES = "settled_member_names";
export const PICKED_TAKEN_BACK = "picked_cards_taken_back";
export const ARTIFACT_TITLES = "artifact_titles";
export const SKILL_PLUGIN_VERSIONS = "skill_plugin_versions";
export const SSH_MACHINES_HUB = "ssh_machines_hub";
export const FILE_HASHES = `file_hashes:${FILE_HASH_SCHEME}`;

/** The journal tags the code steps sit before (db/migrate.ts); migrations:check holds each to the journal. */
export const PROJECT_PAGES_TAG = "0275_project_pages_outlive_sessions";
export const GRAPH_PLACES_TAG = "0317_drop_graph_places";
export const MIGRATION_STEP_TAGS = [
  PROJECT_PAGES_TAG,
  GRAPH_PLACES_TAG,
] as const;
